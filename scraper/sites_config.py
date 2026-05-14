"""
Sites Configuration — Centralized registry of supported websites

Domains are configurable here so when a site changes its domain,
you only need to update one place.
"""

from dataclasses import dataclass, field


@dataclass
class SiteConfig:
    """Configuration for a single source website."""
    name: str                    # Unique identifier (e.g. "truyenfull")
    display_name: str            # User-facing name (e.g. "TruyenFull")
    base_url: str                # Base domain (e.g. "https://truyenfull.vision")
    search_url_template: str     # Search URL with {query} placeholder
    enabled: bool = True         # Can be disabled without removing

    @property
    def domain(self) -> str:
        """Extract domain from base_url."""
        from urllib.parse import urlparse
        return urlparse(self.base_url).netloc


# ─── Site Registry ─────────────────────────────────────────
# To change a domain, just update the base_url and search_url_template below.
# To add a new site, add a new SiteConfig entry and create a matching parser.

SITES: dict[str, SiteConfig] = {
    "truyenfull": SiteConfig(
        name="truyenfull",
        display_name="TruyenFull",
        base_url="https://truyenfull.vision",
        search_url_template="https://truyenfull.vision/tim-kiem/?tukhoa={query}",
    ),
    "metruyenchu": SiteConfig(
        name="metruyenchu",
        display_name="MeTruyenChu",
        base_url="https://metruyenchu.com.vn",
        search_url_template="https://metruyenchu.com.vn/search?q={query}",
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
    """Find the matching site config for a URL."""
    url_lower = url.lower()
    for site in SITES.values():
        if site.domain in url_lower:
            return site
    return None
