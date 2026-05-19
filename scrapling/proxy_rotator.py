"""
Free Proxy Rotator — Scrape and rotate free proxies

Since no paid proxy provider is available, this module:
1. Scrapes free proxy lists from public sources
2. Tests proxy connectivity
3. Rotates through working proxies during scraping
"""

import asyncio
import random
import time
import aiohttp
from dataclasses import dataclass, field


@dataclass
class ProxyInfo:
    host: str
    port: int
    protocol: str = "http"  # http | https | socks5
    country: str = ""
    last_checked: float = 0
    fail_count: int = 0

    @property
    def url(self) -> str:
        return f"{self.protocol}://{self.host}:{self.port}"

    def __hash__(self):
        return hash((self.host, self.port))


@dataclass
class ProxyPool:
    proxies: list[ProxyInfo] = field(default_factory=list)
    _index: int = 0
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def add(self, proxy: ProxyInfo):
        if proxy not in self.proxies:
            self.proxies.append(proxy)

    def remove(self, proxy: ProxyInfo):
        self.proxies = [p for p in self.proxies if p != proxy]

    def get_next(self) -> ProxyInfo | None:
        if not self.proxies:
            return None
        proxy = self.proxies[self._index % len(self.proxies)]
        self._index += 1
        return proxy

    def get_random(self) -> ProxyInfo | None:
        if not self.proxies:
            return None
        return random.choice(self.proxies)

    @property
    def size(self) -> int:
        return len(self.proxies)


# ─── Free Proxy Sources ───────────────────────────────────

FREE_PROXY_URLS = [
    "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
    "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt",
    "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt",
    "https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt",
]


async def _fetch_proxy_list(session: aiohttp.ClientSession, url: str) -> list[ProxyInfo]:
    """Fetch proxies from a raw text list (format: host:port per line)."""
    proxies = []
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status == 200:
                text = await resp.text()
                for line in text.strip().splitlines():
                    line = line.strip()
                    if ":" in line:
                        parts = line.split(":")
                        if len(parts) == 2:
                            host, port_str = parts
                            try:
                                port = int(port_str)
                                proxies.append(ProxyInfo(host=host, port=port))
                            except ValueError:
                                continue
    except Exception as e:
        print(f"  ⚠️ Failed to fetch proxy list from {url}: {e}")
    return proxies


async def _test_proxy(proxy: ProxyInfo, test_url: str = "https://httpbin.org/ip", timeout: int = 8) -> bool:
    """Test if a proxy is working by making a request through it."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                test_url,
                proxy=proxy.url,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=timeout),
                allow_redirects=True
            ) as resp:
                if "httpbin.org" in test_url:
                    if resp.status == 200:
                        proxy.last_checked = time.time()
                        return True
                else:
                    # For target websites, any status between 200 and 499 shows successful routing.
                    if 200 <= resp.status < 500:
                        proxy.last_checked = time.time()
                        return True
    except Exception:
        pass

    proxy.fail_count += 1
    return False


async def build_proxy_pool(
    max_proxies: int = 30,
    test_concurrency: int = 20,
    test_url: str = "https://httpbin.org/ip",
) -> ProxyPool:
    """
    Fetch free proxies from public sources, test them, and return a pool
    of working proxies.

    Args:
        max_proxies: Maximum number of working proxies to keep
        test_concurrency: How many proxies to test in parallel
        test_url: URL to test proxy connectivity against

    Returns:
        ProxyPool with verified working proxies
    """
    pool = ProxyPool()
    all_candidates: list[ProxyInfo] = []

    print("🔄 Fetching free proxy lists...")

    async with aiohttp.ClientSession() as session:
        tasks = [_fetch_proxy_list(session, url) for url in FREE_PROXY_URLS]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, list):
                all_candidates.extend(result)

    # Deduplicate
    seen = set()
    unique = []
    for p in all_candidates:
        key = (p.host, p.port)
        if key not in seen:
            seen.add(key)
            unique.append(p)

    print(f"  📋 Found {len(unique)} unique proxy candidates")

    # Shuffle and take a sample to test
    random.shuffle(unique)
    candidates_to_test = unique[:max_proxies * 4]

    print(f"  🧪 Testing {len(candidates_to_test)} proxies...")

    # Test in batches
    working = []
    semaphore = asyncio.Semaphore(test_concurrency)

    async def _test_with_semaphore(proxy: ProxyInfo):
        async with semaphore:
            return proxy, await _test_proxy(proxy, test_url)

    tasks = [_test_with_semaphore(p) for p in candidates_to_test]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for result in results:
        if isinstance(result, tuple):
            proxy, is_working = result
            if is_working:
                working.append(proxy)
                if len(working) >= max_proxies:
                    break

    for proxy in working:
        pool.add(proxy)

    print(f"  ✅ Proxy pool ready: {pool.size} working proxies")
    return pool


def get_playwright_proxy_config(proxy: ProxyInfo) -> dict:
    """Convert a ProxyInfo to Playwright proxy config format."""
    return {"server": proxy.url}
