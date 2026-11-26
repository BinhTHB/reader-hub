"""Hybrid Session — 2-tier fetcher (fast curl_cffi HTTP -> lazy Playwright browser)."""

from dataclasses import dataclass, field


BLOCK_MARKERS = (
    "just a moment...",
    "cf-browser-verification",
    "checking your browser before accessing",
    "enable javascript and cookies to continue",
    "attention required! | cloudflare",
)


@dataclass
class SimpleResponse:
    """Lightweight response compatible with Scrapling's Response interface."""

    url: str
    body: str
    status: int = 200
    headers: dict = field(default_factory=dict)

    @property
    def text(self) -> str:
        return self.body


def _looks_blocked(status: int, html: str) -> bool:
    if status in (403, 429, 503):
        return True
    if not html or len(html) < 400:
        return True
    lower = html.lower()
    return any(marker in lower for marker in BLOCK_MARKERS)


class HybridSession:
    """Starts with fast Chrome-impersonated HTTP; lazily upgrades to browser on block."""

    def __init__(
        self,
        browser_factory,
        browser_kwargs: dict | None = None,
        prefer_http: bool = True,
        proxy: str | None = None,
    ):
        self._browser_factory = browser_factory
        self._browser_kwargs = dict(browser_kwargs or {})
        if proxy:
            self._browser_kwargs["proxy"] = proxy
        self.mode = "http" if prefer_http else "browser"
        self.proxy = proxy
        self._http = None
        self._browser = None

    def _init_http(self):
        if self._http is not None:
            return
        try:
            from curl_cffi import requests as cf_requests

            self._http = ("curl_cffi", cf_requests.Session(impersonate="chrome"))
        except Exception:
            import httpx

            self._http = (
                "httpx",
                httpx.Client(
                    timeout=25.0,
                    follow_redirects=True,
                    headers={
                        "User-Agent": (
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                            "AppleWebKit/537.36 (KHTML, like Gecko) "
                            "Chrome/133.0.0.0 Safari/537.36"
                        )
                    },
                ),
            )

    def _ensure_browser(self):
        if self._browser is None:
            print("  🌐 [HybridSession] Launching Playwright StealthySession (lazy upgrade)...")
            if self.proxy:
                self._browser_kwargs["proxy"] = self.proxy
            self._browser = self._browser_factory(**self._browser_kwargs)
            self._browser.__enter__()
        return self._browser

    def __enter__(self):
        if self.mode == "http":
            self._init_http()
        else:
            self._ensure_browser()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._http is not None:
            try:
                self._http[1].close()
            except Exception:
                pass
            self._http = None
        if self._browser is not None:
            try:
                self._browser.__exit__(exc_type, exc_val, exc_tb)
            except Exception:
                pass
            self._browser = None

    def force_browser(self):
        """Explicitly switch to browser mode when JS rendering is required."""
        if self.mode != "browser":
            self.mode = "browser"
        return self._ensure_browser()

    def rotate_proxy(self, new_proxy_url: str | None):
        """Update proxy on HTTP client and/or active browser session."""
        self.proxy = new_proxy_url
        if self._browser is not None:
            self._browser.rotate_proxy(new_proxy_url)

    def _http_get(self, url: str) -> SimpleResponse:
        self._init_http()
        kind, client = self._http
        proxies = {"http": self.proxy, "https": self.proxy} if self.proxy else None
        if kind == "curl_cffi":
            r = client.get(url, timeout=25, allow_redirects=True, proxies=proxies)
            return SimpleResponse(
                url=str(r.url),
                body=r.text or "",
                status=r.status_code,
                headers=dict(r.headers),
            )
        if self.proxy:
            import httpx

            with httpx.Client(proxy=self.proxy, timeout=25.0, follow_redirects=True) as pc:
                r = pc.get(url)
                return SimpleResponse(url=str(r.url), body=r.text or "", status=r.status_code, headers=dict(r.headers))
        r = client.get(url)
        return SimpleResponse(url=str(r.url), body=r.text or "", status=r.status_code, headers=dict(r.headers))

    def fetch(self, url: str):
        if self.mode == "http":
            try:
                resp = self._http_get(url)
                if not _looks_blocked(resp.status, resp.body):
                    return resp
                print(
                    f"  ⚡ [HybridSession] HTTP blocked/challenge (status={resp.status}, len={len(resp.body)}), "
                    "upgrading to StealthySession..."
                )
            except Exception as e:
                print(f"  ⚡ [HybridSession] HTTP fetch error ({e}), upgrading to StealthySession...")
            self.mode = "browser"

        browser = self._ensure_browser()
        return browser.fetch(url)
