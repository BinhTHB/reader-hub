"""
Sites Configuration — Centralized registry of supported websites (Scrapling branch)

Host matching is TLD-agnostic via `host_keywords` so domain extension changes
(e.g. .fun -> .com -> .net) work automatically without code edits.
"""

from dataclasses import dataclass
from urllib.parse import urlparse


@dataclass
class SiteConfig:
    """Configuration for a single source website."""
    name: str                               # Unique identifier (e.g. "truyenfull")
    display_name: str                       # User-facing name (e.g. "TruyenFull")
    base_url: str                           # Default base domain
    search_url_template: str                # Search URL with {query} placeholder
    enabled: bool = True                    # Can be disabled without removing
    host_keywords: tuple[str, ...] = ()     # Hostname substrings matched regardless of TLD
    search_path_template: str = ""          # Relative search path appended to dynamic base_url

    @property
    def domain(self) -> str:
        """Extract domain from base_url."""
        return urlparse(self.base_url).netloc


# ─── Site Registry ─────────────────────────────────────────
# Host matching ignores TLD (everything after '.'). Only host_keywords matter.

SITES: dict[str, SiteConfig] = {
    "truyenfull": SiteConfig(
        name="truyenfull",
        display_name="TruyenFull",
        base_url="https://truyenfull.vision",
        search_url_template="https://truyenfull.vision/tim-kiem/?tukhoa={query}",
        host_keywords=("truyenfull",),
        search_path_template="/tim-kiem/?tukhoa={query}",
    ),
    "metruyenchu": SiteConfig(
        name="metruyenchu",
        display_name="MeTruyenChu",
        base_url="https://metruyenchuvn.com",
        search_url_template="https://metruyenchuvn.com/search?q={query}",
        host_keywords=("metruyenchu",),
        search_path_template="/search?q={query}",
    ),
    "truyendich": SiteConfig(
        name="truyendich",
        display_name="TruyenDich.AI",
        base_url="https://truyendich.space",
        search_url_template="https://truyendich.space/tim-kiem?q={query}",
        host_keywords=("truyendich",),
        search_path_template="/tim-kiem?q={query}",
    ),
    "uukanshu": SiteConfig(
        name="uukanshu",
        display_name="UUKanShu",
        base_url="https://uukanshu.cc",
        search_url_template="https://uukanshu.cc/search.html?keyword={query}",
        host_keywords=("uukanshu",),
        search_path_template="/search.html?keyword={query}",
    ),
    "khotruyenchu": SiteConfig(
        name="khotruyenchu",
        display_name="KhoTruyenChu",
        base_url="https://khotruyenchu.fun",
        search_url_template="https://khotruyenchu.fun/?s={query}",
        host_keywords=("khotruyenchu",),
        search_path_template="/?s={query}",
    ),
}


def get_site(name: str) -> SiteConfig:
    """Get a site config by name."""
    if name not in SITES:
        raise ValueError(f"Unknown site: {name}. Available: {list(SITES.keys())}")
    return SITES[name]


def get_enabled_sites() -> list[SiteConfig]:
    """Get all enabled sites."""
    return [s for s in SITES.values() if s.enabled]


def get_site_by_url(url: str) -> SiteConfig | None:
    """Find matching site config by hostname keyword (TLD-agnostic) and bind dynamic base_url."""
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        return None

    hostname = (parsed.hostname or "").lower()
    dynamic_base = f"{parsed.scheme}://{parsed.netloc}"

    for site in SITES.values():
        if not site.enabled:
            continue
        keywords = site.host_keywords or (site.name,)
        if any(kw in hostname for kw in keywords):
            search_tpl = (
                f"{dynamic_base}{site.search_path_template}"
                if site.search_path_template
                else site.search_url_template
            )
            return SiteConfig(
                name=site.name,
                display_name=site.display_name,
                base_url=dynamic_base,
                search_url_template=search_tpl,
                enabled=site.enabled,
                host_keywords=site.host_keywords,
                search_path_template=site.search_path_template,
            )

    return None
