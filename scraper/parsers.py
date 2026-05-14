"""
Site Parsers — Per-site scraping and search logic

Each parser handles the HTML structure of a specific source website.
Parsers now include search_stories() for multi-source search.
"""

import re
import unicodedata
from abc import ABC, abstractmethod
from urllib.parse import quote, urljoin
from bs4 import BeautifulSoup

from sites_config import SITES, SiteConfig, get_site_by_url


class BaseSiteParser(ABC):
    """Base class for site-specific parsers."""

    name: str = "base"
    config: SiteConfig = None

    def __init__(self, config: SiteConfig = None):
        if config:
            self.config = config
        elif self.name in SITES:
            self.config = SITES[self.name]

    @property
    def base_url(self) -> str:
        return self.config.base_url if self.config else ""

    # ─── Abstract Methods ──────────────────────────────

    @abstractmethod
    def get_search_url(self, query: str) -> str:
        """Build the search URL for a query string."""
        ...

    @abstractmethod
    def parse_search_results(self, html: str) -> list[dict]:
        """
        Parse search results page.
        Returns: [{ title, slug, author, cover_url, source_url, source_name, genres }]
        """
        ...

    @abstractmethod
    def get_chapter_list_url(self, story_url: str, page: int = 1) -> str:
        ...

    @abstractmethod
    def parse_story_info(self, html: str, url: str) -> dict:
        ...

    @abstractmethod
    def parse_chapter_list(self, html: str) -> list[dict]:
        ...

    @abstractmethod
    def parse_chapter_content(self, html: str) -> dict:
        ...

    @abstractmethod
    def parse_max_pages(self, html: str) -> int:
        """Parse the total number of chapter list pages."""
        ...

    # ─── Utility Methods ───────────────────────────────

    @staticmethod
    def clean_text(text: str) -> str:
        if not text:
            return ""
        text = unicodedata.normalize("NFC", text)
        text = re.sub(r"[\u200b\u200c\u200d\ufeff]", "", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text

    @staticmethod
    def slugify(text: str) -> str:
        text = text.lower().strip()
        text = unicodedata.normalize("NFD", text)
        text = re.sub(r"[\u0300-\u036f]", "", text)
        text = text.replace("\u0111", "d").replace("\u0110", "d")
        text = re.sub(r"[^a-z0-9]+", "-", text)
        return text.strip("-")

    @staticmethod
    def count_words(paragraphs: list[str]) -> int:
        return sum(len(p.split()) for p in paragraphs)

    def make_absolute(self, url: str) -> str:
        """Convert relative URL to absolute using the site's base_url."""
        if url.startswith("http"):
            return url
        return urljoin(self.base_url, url)


# ═══════════════════════════════════════════════════════════
# TruyenFull Parser (truyenfull.vision)
# ═══════════════════════════════════════════════════════════

class TruyenFullParser(BaseSiteParser):
    name = "truyenfull"

    def get_search_url(self, query: str) -> str:
        template = self.config.search_url_template if self.config else \
            "https://truyenfull.vision/tim-kiem/?tukhoa={query}"
        return template.replace("{query}", quote(query))

    def parse_search_results(self, html: str) -> list[dict]:
        soup = BeautifulSoup(html, "lxml")
        results = []

        for row in soup.select(".list-truyen .row"):
            title_el = row.select_one(".truyen-title a")
            if not title_el:
                continue

            title = self.clean_text(title_el.get_text())
            href = title_el.get("href", "")

            author_el = row.select_one(".author")
            author = self.clean_text(author_el.get_text()) if author_el else None

            cover_el = row.select_one("img")
            cover_url = cover_el.get("src") if cover_el else None

            results.append({
                "title": title,
                "slug": self.slugify(title),
                "author": author,
                "cover_url": cover_url,
                "source_url": self.make_absolute(href),
                "source_name": self.name,
                "source_display": self.config.display_name if self.config else "TruyenFull",
            })

        return results

    def get_chapter_list_url(self, story_url: str, page: int = 1) -> str:
        base = story_url.rstrip("/")
        if page > 1:
            return f"{base}/trang-{page}/#list-chapter"
        return f"{base}/#list-chapter"

    def parse_story_info(self, html: str, url: str) -> dict:
        soup = BeautifulSoup(html, "lxml")

        title_el = soup.select_one("h3.title")
        title = self.clean_text(title_el.get_text()) if title_el else "Unknown"

        author_el = soup.select_one('a[itemprop="author"], .info a[itemprop="author"]')
        author = self.clean_text(author_el.get_text()) if author_el else None

        desc_el = soup.select_one('.desc-text, div[itemprop="description"]')
        description = self.clean_text(desc_el.get_text()) if desc_el else None

        cover_el = soup.select_one('div.book img, .info-holder img')
        cover_url = cover_el.get("src") if cover_el else None

        genres = [self.clean_text(el.get_text()) for el in soup.select('a[itemprop="genre"], .info a[itemprop="genre"]')]

        info_el = soup.select_one("span.text-success, span.text-primary, .info span.label")
        status_text = self.clean_text(info_el.get_text()) if info_el else ""
        status = "completed" if "Hoàn" in status_text else "ongoing"

        return {
            "title": title, "slug": self.slugify(title), "author": author,
            "description": description, "cover_img_url": cover_url, "genres": genres,
            "status": status, "source_url": url, "source_name": self.name,
        }

    def parse_chapter_list(self, html: str) -> list[dict]:
        soup = BeautifulSoup(html, "lxml")
        chapters = []

        for link in soup.select("#list-chapter a, ul.list-chapter li a"):
            href = link.get("href", "")
            text = self.clean_text(link.get_text())

            match = re.search(r"[Cc]hương\s+(\d+)", text)
            if match:
                num = int(match.group(1))
                t_match = re.search(r"[Cc]hương\s+\d+\s*[:\-]\s*(.+)", text)
                title = t_match.group(1).strip() if t_match else text
                chapters.append({
                    "chapter_number": num,
                    "title": title,
                    "source_url": self.make_absolute(href),
                })

        return chapters

    def parse_max_pages(self, html: str) -> int:
        soup = BeautifulSoup(html, "lxml")
        pagination = soup.select_one(".pagination")
        if not pagination:
            return 1
        
        last_page_link = pagination.select("li a")
        max_page = 1
        for link in last_page_link:
            text = link.get_text().strip()
            if text.isdigit():
                max_page = max(max_page, int(text))
            elif "Cuối" in text or "Last" in text:
                href = link.get("href", "")
                match = re.search(r"trang-(\d+)", href)
                if match:
                    max_page = max(max_page, int(match.group(1)))
        
        return max_page

    def parse_chapter_content(self, html: str) -> dict:
        soup = BeautifulSoup(html, "lxml")

        title_el = soup.select_one("a.chapter-title, h2 span.chapter-text, .chapter-title")
        title = self.clean_text(title_el.get_text()) if title_el else ""

        content_el = soup.select_one(".chapter-c, #chapter-c")
        if not content_el:
            return {"title": title, "paragraphs": [], "word_count": 0}

        # Remove unwanted elements
        for tag in content_el.find_all(["script", "style", "ins", "iframe", "div", "noscript"]):
            tag.decompose()

        paragraphs = []
        p_tags = content_el.find_all("p")
        if p_tags:
            for p in p_tags:
                text = self.clean_text(p.get_text())
                if text and len(text) > 1:
                    paragraphs.append(text)
        else:
            for line in content_el.get_text(separator="\n").split("\n"):
                text = self.clean_text(line)
                if text and len(text) > 1:
                    paragraphs.append(text)

        return {"title": title, "paragraphs": paragraphs, "word_count": self.count_words(paragraphs)}


# ═══════════════════════════════════════════════════════════
# MeTruyenChu Parser (metruyenchu.com.vn)
# ═══════════════════════════════════════════════════════════

class MeTruyenChuParser(BaseSiteParser):
    name = "metruyenchu"

    def get_search_url(self, query: str) -> str:
        template = self.config.search_url_template if self.config else \
            "https://metruyenchu.com.vn/search?q={query}"
        return template.replace("{query}", quote(query))

    def parse_search_results(self, html: str) -> list[dict]:
        soup = BeautifulSoup(html, "lxml")
        results = []

        for row in soup.select(".list-search .row, .search-result .row, .list .row, .truyen-list .item"):
            title_el = row.select_one("h3.title a, .truyen-title a, h3 a")
            if not title_el:
                continue

            title = self.clean_text(title_el.get_text())
            href = title_el.get("href", "")

            author_el = row.select_one("a[href*='/tac-gia/'], .author a, .author, span.author")
            author = self.clean_text(author_el.get_text()) if author_el else None

            cover_el = row.select_one("img, a.cover img")
            cover_url = cover_el.get("src") if cover_el else None

            genre_els = row.select(".genre a, .tag a, a[href*='/the-loai/']")
            genres = [self.clean_text(g.get_text()) for g in genre_els]

            results.append({
                "title": title,
                "slug": self.slugify(title),
                "author": author,
                "cover_url": cover_url,
                "source_url": self.make_absolute(href),
                "source_name": self.name,
                "source_display": self.config.display_name if self.config else "MeTruyenChu",
                "genres": genres,
            })

        return results

    def get_chapter_list_url(self, story_url: str, page: int = 1) -> str:
        # MeTruyenChu uses JavaScript pagination, not URL-based
        # Return the base URL; pagination will be handled via JavaScript execution
        base = story_url.rstrip("/")
        return base

    def parse_story_info(self, html: str, url: str) -> dict:
        soup = BeautifulSoup(html, "lxml")

        title_el = soup.select_one("h1.title, h1, h3.title")
        title = self.clean_text(title_el.get_text()) if title_el else "Unknown"

        author_el = soup.select_one("a[href*='/tac-gia/'], .author a")
        author = self.clean_text(author_el.get_text()) if author_el else None

        desc_el = soup.select_one("#gioithieu, .intro, .scrolltext, .desc, .desc-text, .content")
        description = self.clean_text(desc_el.get_text()) if desc_el else None

        cover_el = soup.select_one(".book-info-pic img, img[itemprop='image'], .media img, .book img, img.cover")
        cover_url = self.make_absolute(cover_el.get("src")) if cover_el and cover_el.get("src") else None

        genres = [self.clean_text(el.get_text()) for el in soup.select("a.category, .genre a, a[href*='/the-loai/']")]

        return {
            "title": title, "slug": self.slugify(title), "author": author,
            "description": description, "cover_img_url": cover_url, "genres": genres,
            "status": "ongoing", "source_url": url, "source_name": self.name,
        }

    def parse_chapter_list(self, html: str) -> list[dict]:
        soup = BeautifulSoup(html, "lxml")
        chapters = []

        for link in soup.select("#chapter-list a, .list-chapter a, ul.list-chapters a, .chapters a"):
            text = self.clean_text(link.get_text())
            href = link.get("href", "")

            match = re.search(r"[Cc]hương\s+(\d+)", text)
            if match:
                num = int(match.group(1))
                t_match = re.search(r"[Cc]hương\s+\d+\s*[:\-]\s*(.+)", text)
                title = t_match.group(1).strip() if t_match else text
                chapters.append({
                    "chapter_number": num,
                    "title": title,
                    "source_url": self.make_absolute(href),
                })

        return chapters

    def parse_chapter_content(self, html: str) -> dict:
        soup = BeautifulSoup(html, "lxml")

        title_el = soup.select_one("h2.current-chapter, .chapter-title h2, h2, .chapter-title, h1")
        title = self.clean_text(title_el.get_text()) if title_el else ""

        content_el = soup.select_one(".truyen, #chapter-c, .chapter-c, .chapter-content, #article")
        if not content_el:
            return {"title": title, "paragraphs": [], "word_count": 0}

        for tag in content_el.find_all(["script", "style", "ins", "iframe", "noscript"]):
            tag.decompose()

        paragraphs = []
        for p in content_el.find_all("p"):
            text = self.clean_text(p.get_text())
            if text and len(text) > 1:
                paragraphs.append(text)

        if not paragraphs:
            for line in content_el.get_text(separator="\n").split("\n"):
                text = self.clean_text(line)
                if text and len(text) > 1:
                    paragraphs.append(text)

        return {"title": title, "paragraphs": paragraphs, "word_count": self.count_words(paragraphs)}

    def parse_max_pages(self, html: str) -> int:
        soup = BeautifulSoup(html, "lxml")
        # MeTruyenChu pagination is often at the bottom of the chapter list
        pagination = soup.select_one(".pagination, .paging, .page-nav")
        if not pagination:
            return 1
        
        links = pagination.select("a")
        max_page = 1
        for link in links:
            text = link.get_text().strip()
            if text.isdigit():
                max_page = max(max_page, int(text))
            # Also check onclick attribute for page number
            onclick = link.get("onclick", "")
            if "page(" in onclick:
                # Extract page number from onclick="page(112629,18)"
                match = re.search(r"page\(\d+,(\d+)\)", onclick)
                if match:
                    max_page = max(max_page, int(match.group(1)))
        
        return max_page
    
    def extract_story_id(self, html: str) -> str | None:
        """Extract story ID from MeTruyenChu page for pagination."""
        soup = BeautifulSoup(html, "lxml")
        pagination = soup.select_one(".pagination, .paging")
        if pagination:
            # Look for onclick="page(STORY_ID, page_num)"
            link = pagination.select_one("a[onclick*='page(']")
            if link:
                onclick = link.get("onclick", "")
                match = re.search(r"page\((\d+),", onclick)
                if match:
                    return match.group(1)
        return None


# ═══════════════════════════════════════════════════════════
# Parser Registry
# ═══════════════════════════════════════════════════════════

PARSERS: dict[str, BaseSiteParser] = {
    "truyenfull": TruyenFullParser(),
    "metruyenchu": MeTruyenChuParser(),
}


def get_parser(name: str) -> BaseSiteParser:
    """Get parser by site name."""
    if name not in PARSERS:
        raise ValueError(f"No parser for site: {name}. Available: {list(PARSERS.keys())}")
    return PARSERS[name]


def detect_parser(url: str) -> BaseSiteParser:
    """Auto-detect the appropriate parser based on the URL domain."""
    site = get_site_by_url(url)
    if site and site.name in PARSERS:
        return PARSERS[site.name]
    raise ValueError(f"No parser available for URL: {url}")


def get_all_parsers() -> list[BaseSiteParser]:
    """Get all enabled parsers."""
    from sites_config import get_enabled_sites
    enabled_names = {s.name for s in get_enabled_sites()}
    return [p for name, p in PARSERS.items() if name in enabled_names]
