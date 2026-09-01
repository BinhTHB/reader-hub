"""
Site Parsers â€” Per-site scraping and search logic (Scrapling branch)

Each parser handles the HTML structure of a specific source website.
"""

import re
import unicodedata
from abc import ABC, abstractmethod
from urllib.parse import quote, urljoin
from bs4 import BeautifulSoup
from scrapling import Adaptor as Selector
from scrapling.parser import Adaptors
from scrapling.core.custom_types import TextHandlers

# Patch Adaptors (element list selector) to behave like Scrapy's SelectorList
Adaptors.attrib = property(lambda self: self[0].attrib if self else {})
Adaptors.getall = lambda self: [str(el) for el in self]

# Patch TextHandlers (text list selector) to have .get() and .getall()
TextHandlers.get = lambda self, default=None: self[0] if self else default
TextHandlers.getall = lambda self: list(self)

from sites_config import SITES, SiteConfig, get_site_by_url


def get_text(el) -> str:
    """Get full text content from a Scrapling Adaptor or Adaptors element.

    Uses lxml's text_content() which concatenates all descendant text nodes,
    unlike css('::text').get() which only returns the first direct text node.
    Works reliably with Scrapling's __slots__-based Adaptor class.
    """
    if el is None:
        return ""
    # Adaptors (list of elements) - get text from first element
    if isinstance(el, Adaptors):
        if not el:
            return ""
        return el[0]._root.text_content() or ""
    # Single Adaptor element
    if hasattr(el, '_root'):
        return el._root.text_content() or ""
    return str(el)


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

    # â”€â”€â”€ Abstract Methods â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

    # â”€â”€â”€ Utility Methods â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @staticmethod
    def clean_text(text: str) -> str:
        if not text:
            return ""
        text = unicodedata.normalize("NFC", text)
        text = re.sub(r"[\u200b\u200c\u200d\ufeff]", "", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text

    @staticmethod
    def canonical_source_key(url: str) -> str:
        """Generate a canonical key from an absolute URL to identify the chapter."""
        if not url:
            return ""
        # Remove scheme, trailing slash, queries, hash
        cleaned = url.split('#')[0].split('?')[0].rstrip('/')
        cleaned = re.sub(r'^https?://(www\.)?', '', cleaned)
        return cleaned.lower()

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


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# TruyenFull Parser (truyenfull.vision)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

class TruyenFullParser(BaseSiteParser):
    name = "truyenfull"

    def get_search_url(self, query: str) -> str:
        template = self.config.search_url_template if self.config else \
            "https://truyenfull.vision/tim-kiem/?tukhoa={query}"
        return template.replace("{query}", quote(query))

    def parse_search_results(self, html: str) -> list[dict]:
        page = Selector(html)
        results = []

        # Find truyen items using CSS selector
        for row in page.css(".list-truyen .row"):
            title_el = row.css(".truyen-title a")
            if not title_el:
                continue

            title = self.clean_text(get_text(title_el) or "")
            href = title_el.attrib.get("href", "")

            author_el = row.css(".author")
            author = self.clean_text(get_text(author_el) or "") if author_el else None

            cover_el = row.css("img")
            cover_url = cover_el.attrib.get("src") if cover_el else None

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
        base = story_url.split('#')[0].rstrip('/')
        if page > 1:
            return f"{base}/trang-{page}/"
        return f"{base}/"

    def parse_story_info(self, html: str, url: str) -> dict:
        page = Selector(html)

        title_el = page.css("h3.title")
        title = self.clean_text(get_text(title_el) or "Unknown")

        author_el = page.css('a[itemprop="author"], .info a[itemprop="author"]')
        author = self.clean_text(get_text(author_el) or "") if author_el else None

        desc_el = page.css('.desc-text, div[itemprop="description"]')
        description = self.clean_text(get_text(desc_el) or "") if desc_el else None

        cover_el = page.css('div.book img, .info-holder img')
        cover_url = cover_el.attrib.get("src") if cover_el else None

        genres = [self.clean_text(get_text(g) or "") for g in page.css('a[itemprop="genre"], .info a[itemprop="genre"]')]

        info_el = page.css("span.text-success, span.text-primary, .info span.label")
        status_text = self.clean_text(get_text(info_el) or "") if info_el else ""
        status = "completed" if "HoÃ n" in status_text else "ongoing"

        return {
            "title": title, "slug": self.slugify(title), "author": author,
            "description": description, "cover_img_url": cover_url, "genres": genres,
            "status": status, "source_url": url, "source_name": self.name,
        }

    def parse_chapter_list(self, html: str) -> list[dict]:
        page = Selector(html)
        chapters = []
        seen = set()

        for link in page.css("#list-chapter a, ul.list-chapter li a"):
            href = link.attrib.get("href", "")
            text = self.clean_text(get_text(link) or "")

            match = re.search(r"[Cc]hương\s+(\d+)", text)
            if match:
                num = int(match.group(1))
                if num in seen:
                    continue
                seen.add(num)
                t_match = re.search(r"[Cc]hương\s+\d+\s*[:\-]\s*(.+)", text)
                title = t_match.group(1).strip() if t_match else text
                chapters.append({
                    "chapter_number": num,
                    "title": title,
                    "source_url": self.make_absolute(href),
                })

        return chapters

    def parse_max_pages(self, html: str) -> int:
        page = Selector(html)
        pagination = page.css(".pagination")
        if not pagination:
            return 1
        
        links = pagination.css("li a")
        max_page = 1
        for link in links:
            text = (get_text(link) or "").strip()
            if text.isdigit():
                max_page = max(max_page, int(text))
            elif "Cuá»‘i" in text or "Last" in text:
                href = link.attrib.get("href", "")
                match = re.search(r"trang-(\d+)", href)
                if match:
                    max_page = max(max_page, int(match.group(1)))
        
        return max_page

    def parse_chapter_content(self, html: str) -> dict:
        page = Selector(html)

        title_el = page.css("a.chapter-title, h2 span.chapter-text, .chapter-title")
        title = self.clean_text(get_text(title_el) or "")

        # For content manipulation, BeautifulSoup remains easier and safer
        soup = BeautifulSoup(html, "lxml")
        content_el = soup.select_one(".chapter-c, #chapter-c")
        if not content_el:
            return {"title": title, "paragraphs": [], "word_count": 0}

        # Remove unwanted elements
        for tag in content_el.find_all(["script", "style", "ins", "iframe", "div", "noscript"]):
            tag.decompose()

        paragraphs = []
        for br in content_el.find_all("br"):
            br.replace_with("\n")
        for line in content_el.get_text(separator="\n").split("\n"):
            text = self.clean_text(line)
            if text and len(text) > 1:
                paragraphs.append(text)

        return {"title": title, "paragraphs": paragraphs, "word_count": self.count_words(paragraphs)}


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# MeTruyenChu Parser (metruyenchuvn.com)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

class MeTruyenChuParser(BaseSiteParser):
    name = "metruyenchu"

    def get_search_url(self, query: str) -> str:
        template = self.config.search_url_template if self.config else \
            "https://metruyenchuvn.com/search?q={query}"
        return template.replace("{query}", quote(query))

    def parse_search_results(self, html: str) -> list[dict]:
        page = Selector(html)
        results = []

        for row in page.css(".list-search .row, .search-result .row, .list .row, .truyen-list .item"):
            title_el = row.css("h3.title a, .truyen-title a, h3 a")
            if not title_el:
                continue

            title = self.clean_text(get_text(title_el) or "")
            href = title_el.attrib.get("href", "")

            author_el = row.css("a[href*='/tac-gia/'], .author a, .author, span.author")
            author = self.clean_text(get_text(author_el) or "") if author_el else None

            cover_el = row.css("img, a.cover img")
            cover_url = cover_el.attrib.get("src") if cover_el else None

            genre_els = row.css(".genre a, .tag a, a[href*='/the-loai/']")
            genres = [self.clean_text(get_text(g) or "") for g in genre_els]

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
        base = story_url.rstrip("/")
        if page == 1:
            return base
        # MeTruyenChu uses JS pagination API: /get/listchap/{id}?page={n}
        # scraper.py resolves the full URL using extract_story_id()
        # Return a placeholder; the actual API URL is constructed in scraper.py
        return f"{base}?page_api={page}"

    def parse_story_info(self, html: str, url: str) -> dict:
        page = Selector(html)

        title_el = page.css("h1.title, h1, h3.title")
        title = self.clean_text(get_text(title_el) or "Unknown")

        author_el = page.css("a[href*='/tac-gia/'], .author a")
        author = self.clean_text(get_text(author_el) or "") if author_el else None

        desc_el = page.css("#gioithieu, .intro, .scrolltext, .desc, .desc-text, .content")
        description = self.clean_text(get_text(desc_el) or "") if desc_el else None

        cover_el = page.css(".book-info-pic img, img[itemprop='image'], .media img, .book img, img.cover")
        cover_url = self.make_absolute(cover_el.attrib.get("src")) if cover_el and cover_el.attrib.get("src") else None

        genres = [self.clean_text(get_text(g) or "") for g in page.css("a.category, .genre a, a[href*='/the-loai/']")]

        return {
            "title": title, "slug": self.slugify(title), "author": author,
            "description": description, "cover_img_url": cover_url, "genres": genres,
            "status": "ongoing", "source_url": url, "source_name": self.name,
        }

    def parse_chapter_list(self, html: str) -> list[dict]:
        page = Selector(html)
        chapters = []
        seen_keys = set()

        for sequence_index, link in enumerate(page.css(
            "#chapter-list a, .list-chapter a, ul.list-chapters a, .chapters a, "
            "a[href*='/chuong-']"
        ), start=1):
            text = self.clean_text(get_text(link) or "")
            href = link.attrib.get("href", "")
            if not href:
                continue

            source_url = self.make_absolute(href)
            if "/chuong-" not in source_url:
                continue
            source_key = self.canonical_source_key(source_url)
            if not source_key or source_key in seen_keys:
                continue
            seen_keys.add(source_key)

            # Prefer URL-based number because MeTruyenChu titles can be malformed,
            # duplicated, or missing the "Chương N" text entirely.
            match = re.search(r"/chuong-(\d+)(?:\D|$)", source_url, re.IGNORECASE)
            if not match:
                match = re.search(r"[Cc]hương\s+(\d+)", text)
            num = int(match.group(1)) if match else None

            if num is not None:
                t_match = re.search(r"[Cc]hương\s+\d+\s*[:\-]\s*(.+)", text)
                title = t_match.group(1).strip() if t_match else text
            else:
                title = text or f"Chapter link {sequence_index}"

            chapters.append({
                "chapter_number": num,
                "sequence_index": sequence_index,
                "title": title,
                "source_url": source_url,
                "source_key": source_key,
            })

        return chapters

    def parse_chapter_content(self, html: str) -> dict:
        page = Selector(html)

        title_el = page.css("h2.current-chapter, .chapter-title h2, h2, .chapter-title, h1, .title-chapter")
        title = self.clean_text(get_text(title_el) or "")

        soup = BeautifulSoup(html, "lxml")
        content_el = soup.select_one(".truyen, #chapter-c, .chapter-c, .chapter-content, #article, .content, .content-inner")
        if not content_el:
            return {"title": title, "paragraphs": [], "word_count": 0}

        # Remove ads and unwanted elements
        for tag in content_el.find_all(["script", "style", "ins", "iframe", "noscript", "div", "center"]):
            if tag.name == "div" and not tag.get("class") and not tag.get("id"):
                continue
            tag.decompose()

        paragraphs = []
        for br in content_el.find_all("br"):
            br.replace_with("\n")
        for line in content_el.get_text(separator="\n").split("\n"):
            text = self.clean_text(line)
            if text and len(text) > 1:
                paragraphs.append(text)

        return {"title": title, "paragraphs": paragraphs, "word_count": self.count_words(paragraphs)}

    def parse_max_pages(self, html: str) -> int:
        page = Selector(html)
        pagination = page.css(".pagination, .paging, .page-nav")
        if not pagination:
            return 1
        
        links = pagination.css("a")
        max_page = 1
        for link in links:
            text = (get_text(link) or "").strip()
            if text.isdigit():
                max_page = max(max_page, int(text))
            
            onclick = link.attrib.get("onclick", "")
            if "page(" in onclick:
                match = re.search(r"page\(\d+,(\d+)\)", onclick)
                if match:
                    max_page = max(max_page, int(match.group(1)))
        
        return max_page
    
    def extract_story_id(self, html: str) -> str | None:
        """Extract story ID from MeTruyenChu page for pagination.

        Iterates links manually instead of using a CSS attribute selector
        containing parentheses, which can fail in some CSS parsers.
        Also tries to find story_id from script tags / data attributes as fallback.
        """
        page = Selector(html)
        pagination = page.css(".pagination, .paging")
        if pagination:
            for link in pagination.css("a"):
                onclick = link.attrib.get("onclick", "")
                if "page(" in onclick:
                    match = re.search(r"page\((\d+),", onclick)
                    if match:
                        story_id = match.group(1)
                        self._story_id = story_id
                        return story_id

        # Fallback: search for story_id in script tags or data attributes
        # Match patterns like: "story_id":60321 or "id":60321 or data-id="60321"
        match = re.search(r'(?:story_id|storyId|data-id|data-story)[=:]\s*["\'"]?(\d+)["\'"]?', html)
        if match:
            story_id = match.group(1)
            self._story_id = story_id
            return story_id
        # Match something like: /get/listchap/(\d+)
        match = re.search(r'/get/listchap/(\d+)', html)
        if match:
            story_id = match.group(1)
            self._story_id = story_id
            return story_id

        return None

    @staticmethod
    def extract_html_from_api_response(response_body: str) -> str:
        """Extract HTML from JSON API response for pagination.
        API at /get/listchap/{id}?page={n} returns {"data": "<html>"}"""
        import json
        import re
        import html
        
        body_cleaned = response_body.strip()
        # If it's wrapped in HTML/pre tags, extract the text inside the pre tag
        if "<pre" in body_cleaned.lower():
            match = re.search(r"<pre[^>]*>(.*?)</pre>", body_cleaned, re.DOTALL | re.IGNORECASE)
            if match:
                body_cleaned = match.group(1).strip()
        
        try:
            data = json.loads(body_cleaned)
            html_content = data.get("data", "")
            if html_content:
                return html_content
        except (json.JSONDecodeError, TypeError):
            pass
        return response_body

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# TruyenDich.AI Parser (truyendich.ai)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

class TruyenDichParser(BaseSiteParser):
    name = "truyendich"

    def get_search_url(self, query: str) -> str:
        template = self.config.search_url_template if self.config else \
            "https://truyendich.space/tim-kiem?q={query}"
        return template.replace("{query}", quote(query))

    def parse_search_results(self, html: str) -> list[dict]:
        page = Selector(html)
        results = []

        for link in page.css("a[href*='/doc-truyen/']"):
            href = link.attrib.get("href", "")
            if not href or "/chuong-" in href:
                continue

            title_text = self.clean_text(get_text(link) or "")
            if not title_text:
                continue

            title = title_text
            author = None
            cover_url = None

            # Fallback for parent node search using BS4 since Scrapling DOM tree navigation is simple
            soup = BeautifulSoup(html, "lxml")
            link_soup = soup.find("a", href=href)
            if link_soup:
                parent = link_soup.find_parent(["div", "article"])
                if parent:
                    author_el = parent.select_one(".author, [class*='author']")
                    if author_el:
                        author = self.clean_text(author_el.get_text())

                    cover_el = parent.select_one("img")
                    if cover_el:
                        cover_url = cover_el.get("src")

            results.append({
                "title": title,
                "slug": self.slugify(title),
                "author": author,
                "cover_url": self.make_absolute(cover_url) if cover_url else None,
                "source_url": self.make_absolute(href),
                "source_name": self.name,
                "source_display": self.config.display_name if self.config else "TruyenDich.AI",
            })

        return results

    def get_chapter_list_url(self, story_url: str, page: int = 1) -> str:
        base = re.sub(r'/trang-\d+/?$', '', story_url.split('#')[0]).rstrip('/')
        if page > 1:
            return f"{base}/trang-{page}"
        return f"{base}/"

    def parse_story_info(self, html: str, url: str) -> dict:
        page = Selector(html)

        # Detect Convert version (/doc-truyen/cv/) if available
        effective_source_url = url
        if "/doc-truyen/cv/" not in url:
            cv_link = page.css("a[href*='/doc-truyen/cv/']")
            if cv_link:
                cv_href = cv_link[0].attrib.get("href")
                if cv_href:
                    effective_source_url = self.make_absolute(cv_href)
            else:
                soup = BeautifulSoup(html, "lxml")
                cv_a = soup.find("a", href=re.compile(r"/doc-truyen/cv/"))
                if cv_a and cv_a.get("href"):
                    effective_source_url = self.make_absolute(cv_a.get("href"))

        # Try JSON-LD first
        json_ld = page.css('script[type="application/ld+json"]')
        if json_ld:
            try:
                import json
                data = json.loads(get_text(json_ld) or "")
                if data.get("@type") == "Book":
                    title = data.get("name", "Unknown")
                    author = data.get("author", {}).get("name") if isinstance(data.get("author"), dict) else None
                    description = data.get("description", "")
                    cover_url = data.get("image", "")
                    genres = [data.get("genre")] if data.get("genre") else []
                    
                    return {
                        "title": title,
                        "slug": self.slugify(title),
                        "author": author,
                        "description": description,
                        "cover_img_url": self.make_absolute(cover_url) if cover_url else None,
                        "genres": genres,
                        "status": "ongoing",
                        "source_url": effective_source_url,
                        "source_name": self.name,
                    }
            except:
                pass

        title_el = page.css("h1, h1.title")
        title = self.clean_text(get_text(title_el) or "Unknown")

        author_el = page.css(".author, [class*='author']")
        author = self.clean_text(get_text(author_el) or "") if author_el else None

        desc_el = page.css(".prose, .description, [class*='description']")
        description = self.clean_text(get_text(desc_el) or "") if desc_el else None

        cover_el = page.css("img[alt*='bÃ¬a'], img[alt*='cover'], .cover img, img")
        cover_url = cover_el.attrib.get("src") if cover_el else None

        genres = [self.clean_text(get_text(g) or "") for g in page.css("a[href*='/the-loai/']")]

        return {
            "title": title,
            "slug": self.slugify(title),
            "author": author,
            "description": description,
            "cover_img_url": self.make_absolute(cover_url) if cover_url else None,
            "genres": genres,
            "status": "ongoing",
            "source_url": effective_source_url,
            "source_name": self.name,
        }

    def parse_chapter_list(self, html: str) -> list[dict]:
        page = Selector(html)
        chapters = []

        for link in page.css("a[href*='/chuong-']"):
            href = link.attrib.get("href", "")
            text = self.clean_text(get_text(link) or "")

            match = re.search(r"/chuong-(\d+)", href)
            if match:
                num = int(match.group(1))
                t_match = re.search(r"[Cc]hương\s+(\d+)\s*[:\-]\s*(.+)", text)
                title = t_match.group(2).strip() if t_match else text
                chapters.append({
                    "chapter_number": num,
                    "title": title,
                    "source_url": self.make_absolute(href),
                })

        return chapters

    def parse_max_pages(self, html: str) -> int:
        page = Selector(html)
        max_chapter = 50
        found_range = False
        
        # 1. Search for range buttons (e.g. "1 - 200", "201 - 400", "401 - 517")
        for btn in page.css("button"):
            text = self.clean_text(get_text(btn) or "")
            match = re.search(r"(\d+)\s*-\s*(\d+)", text)
            if match:
                end_ch = int(match.group(2))
                max_chapter = max(max_chapter, end_ch)
                found_range = True
                
        # 2. Search for "XXX chương" text in any element (BeautifulSoup fallback is safer)
        soup = BeautifulSoup(html, "lxml")
        string_targets = []
        try:
            string_targets.extend(soup.find_all(string=re.compile(r"\d+\s*chương", re.IGNORECASE)))
        except:
            pass
        try:
            string_targets.extend(soup.find_all(text=re.compile(r"\d+\s*chương", re.IGNORECASE)))
        except:
            pass
            
        for t in string_targets:
            match = re.search(r"(\d+)\s*chương", str(t), re.IGNORECASE)
            if match:
                max_chapter = max(max_chapter, int(match.group(1)))
                found_range = True
                
        if found_range:
            return (max_chapter + 49) // 50
            
        # 3. Fallback: Parse from existing chapters on page 1
        chapters = self.parse_chapter_list(html)
        if chapters:
            max_ch_num = max(ch["chapter_number"] for ch in chapters)
            return (max_ch_num + 49) // 50
            
        return 1

    def parse_chapter_content(self, html: str) -> dict:
        page = Selector(html)

        title_el = page.css("h1, h2, .chapter-title")
        title = self.clean_text(get_text(title_el) or "")

        soup = BeautifulSoup(html, "lxml")
        content_el = soup.select_one("section.prose-novel, .prose-novel, section[class*='prose'], .chapter-content, #chapter-content")
        if not content_el:
            return {"title": title, "paragraphs": [], "word_count": 0}

        for tag in content_el.find_all(["script", "style", "ins", "iframe", "noscript"]):
            tag.decompose()

        paragraphs = []
        for br in content_el.find_all("br"):
            br.replace_with("\n")
        for line in content_el.get_text(separator="\n").split("\n"):
            text = self.clean_text(line)
            if text and len(text) > 1:
                paragraphs.append(text)

        return {"title": title, "paragraphs": paragraphs, "word_count": self.count_words(paragraphs)}


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# UUKanShu Parser (uukanshu.cc)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

class UUKanShuParser(BaseSiteParser):
    name = "uukanshu"

    def get_search_url(self, query: str) -> str:
        return f"https://uukanshu.cc/search.html?keyword={quote(query)}"

    def parse_search_results(self, html: str) -> list[dict]:
        page = Selector(html)
        results = []

        # Target layout is typically under a list of books
        for book in page.css("div.book-list-info, div.book-info, div.book-item, li.line"):
            title_el = book.css("h3 a, h4 a, a[href*='/book/']")
            if not title_el:
                continue

            title = self.clean_text(get_text(title_el) or "")
            href = title_el.attrib.get("href", "")

            author_el = book.css(".author, span.author, a[href*='/author/']")
            author = self.clean_text(get_text(author_el) or "") if author_el else "Unknown"

            cover_el = book.css("img")
            cover_url = cover_el.attrib.get("src") if cover_el else None

            results.append({
                "title": title,
                "slug": self.slugify(title),
                "author": author,
                "cover_url": self.make_absolute(cover_url) if cover_url else None,
                "source_url": self.make_absolute(href),
                "source_name": self.name,
                "source_display": "UUKanShu",
            })

        return results

    def get_chapter_list_url(self, story_url: str, page: int = 1) -> str:
        # UUKanShu loads all chapters on the story detail page directly!
        return story_url.split('#')[0].rstrip('/') + '/'

    def parse_story_info(self, html: str, url: str) -> dict:
        page = Selector(html)

        title_el = page.css("div.bookinfo h1.booktitle, h1")
        title = self.clean_text(get_text(title_el) or "Unknown")

        author_el = page.css("div.bookinfo p.booktag a.red, .bookinfo a.red")
        author = self.clean_text(get_text(author_el) or "Unknown") if author_el else "Unknown"

        desc_el = page.css("div.bookinfo p.bookintro, .bookintro")
        description = self.clean_text(get_text(desc_el) or "") if desc_el else ""

        cover_el = page.css("div.bookcover img, .bookcover img")
        cover_url = self.make_absolute(cover_el.attrib.get("src")) if cover_el and cover_el.attrib.get("src") else None

        genres = []
        genre_el = page.css("div.bookinfo p.booktag span.blue, .bookinfo span.blue")
        if genre_el:
            genres.append(self.clean_text(get_text(genre_el) or ""))

        return {
            "title": title,
            "slug": self.slugify(title),
            "author": author,
            "description": description,
            "cover_img_url": cover_url,
            "genres": genres,
            "status": "ongoing",
            "source_url": url,
            "source_name": self.name,
        }

    def parse_chapter_list(self, html: str) -> list[dict]:
        page = Selector(html)
        chapters = []

        for index, link in enumerate(page.css("div#list-chapterAll dd a, #list-chapterAll dd a")):
            href = link.attrib.get("href", "")
            text = self.clean_text(get_text(link) or "")

            # Match chapter numbers in Chinese or English
            # e.g., ç¬¬123ç« , ç¬¬ 123 ç« , 123. Title, Chương 123
            match = re.search(r"(?:[Cc]hương|ç¬¬)\s*(\d+)\s*[ç« .]?", text)
            if match:
                num = int(match.group(1))
            else:
                num = index + 1  # Fallback to list order if not parseable

            # Extract title clean of chapter number prefix if possible
            title = text
            chapters.append({
                "chapter_number": num,
                "title": title,
                "source_url": self.make_absolute(href),
            })

        return chapters

    def parse_max_pages(self, html: str) -> int:
        # All chapters are statically listed in uukanshu story page
        return 1

    def parse_chapter_content(self, html: str) -> dict:
        page = Selector(html)

        title_el = page.css("h1.readTitle, h1, h2")
        title = self.clean_text(get_text(title_el) or "")

        soup = BeautifulSoup(html, "lxml")
        content_el = soup.select_one("div.readcotent, .readcotent")
        if not content_el:
            return {"title": title, "paragraphs": [], "word_count": 0}

        # Decompose scripts and ads
        for tag in content_el.find_all(["script", "style", "ins", "iframe", "noscript", "div"]):
            tag.decompose()

        paragraphs = []
        for br in content_el.find_all("br"):
            br.replace_with("\n")
        for line in content_el.get_text(separator="\n").split("\n"):
            text = self.clean_text(line)
            if text and len(text) > 1:
                paragraphs.append(text)

        return {"title": title, "paragraphs": paragraphs, "word_count": self.count_words(paragraphs)}


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# Parser Registry
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

PARSERS: dict[str, BaseSiteParser] = {
    "truyenfull": TruyenFullParser(),
    "metruyenchu": MeTruyenChuParser(),
    "truyendich": TruyenDichParser(),
    "uukanshu": UUKanShuParser(),
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
        parser = PARSERS[site.name]
        parser.config = site
        return parser
    raise ValueError(f"No parser available for URL: {url}")


def get_all_parsers() -> list[BaseSiteParser]:
    """Get all enabled parsers."""
    from sites_config import get_enabled_sites
    enabled_names = {s.name for s in get_enabled_sites()}
    return [p for name, p in PARSERS.items() if name in enabled_names]

