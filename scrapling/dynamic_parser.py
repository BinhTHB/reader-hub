"""Dynamic Config Parser — Parse any story website using JSON CSS selectors."""

import re
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup

from parsers import BaseSiteParser
from sites_config import SiteConfig


CHAPTER_NUM_RE = re.compile(
    r"(?:chương|chuong|chapter|chap|c\.?|第)\s*(\d+)",
    re.IGNORECASE,
)
LEADING_NUM_RE = re.compile(r"^\s*(\d+)\s*[.:\-–—\s]")
URL_NUM_RE = re.compile(r"(\d+)(?:[./?#]|$)")


class DynamicConfigParser(BaseSiteParser):
    """Config-driven parser powered by CSS selectors stored in scrape_sources."""

    def __init__(
        self,
        domain: str,
        base_url: str,
        selectors: dict,
        display_name: str | None = None,
    ):
        self.domain = domain
        self.selectors = selectors or {}
        self.name = f"dynamic:{domain}"
        self.config = SiteConfig(
            name=self.name,
            display_name=display_name or domain,
            base_url=base_url.rstrip("/"),
            search_url_template="",
            enabled=True,
        )

    def get_search_url(self, query: str) -> str:
        return ""

    def parse_search_results(self, html: str) -> list[dict]:
        return []

    def is_blocked(self, html: str) -> bool:
        if not html or len(html) < 200:
            return True
        lower = html.lower()
        return any(
            marker in lower
            for marker in (
                "just a moment...",
                "cf-browser-verification",
                "checking your browser before accessing",
            )
        )

    def extract_slug(self, url: str) -> str:
        path = urlparse(url).path.strip("/")
        if not path:
            return self.slugify(self.domain)
        last = path.split("/")[-1]
        last = re.sub(r"\.(html?|php|aspx)$", "", last, flags=re.IGNORECASE)
        return self.slugify(last) or self.slugify(self.domain)

    def get_chapter_list_url(self, story_url: str, page: int = 1) -> str:
        if page <= 1:
            return story_url
        pattern = (self.selectors.get("page_url_pattern") or "").strip()
        if not pattern:
            return story_url
        clean_story = story_url.rstrip("/")
        return (
            pattern.replace("{story_url}", clean_story)
            .replace("{base_url}", self.base_url)
            .replace("{page}", str(page))
        )

    def _select_text(self, soup: BeautifulSoup, css: str | None) -> str:
        if not css:
            return ""
        el = soup.select_one(css)
        if not el:
            return ""
        return self.clean_text(el.get_text(" ", strip=True))

    def _meta_content(self, soup: BeautifulSoup, attr: str, value: str) -> str:
        tag = soup.find("meta", attrs={attr: value})
        if tag and tag.get("content"):
            return self.clean_text(str(tag["content"]))
        return ""

    def parse_story_info(self, html: str, url: str) -> dict:
        soup = BeautifulSoup(html, "lxml")

        title = (
            self._select_text(soup, self.selectors.get("story_title"))
            or self._meta_content(soup, "property", "og:title")
            or self._select_text(soup, "h1")
        )
        # Strip common site-name suffixes from og:title if h1 wasn't used
        if title and " - " in title and not self.selectors.get("story_title"):
            title = title.split(" - ")[0].strip()

        author = (
            self._select_text(soup, self.selectors.get("story_author"))
            or "Đang cập nhật"
        )

        description = (
            self._select_text(soup, self.selectors.get("story_description"))
            or self._meta_content(soup, "property", "og:description")
            or self._meta_content(soup, "name", "description")
        )

        cover_img_url = ""
        cover_css = self.selectors.get("story_cover")
        if cover_css:
            img_el = soup.select_one(cover_css)
            if img_el:
                cover_img_url = (
                    img_el.get("src")
                    or img_el.get("data-src")
                    or img_el.get("data-original")
                    or ""
                )
        if not cover_img_url:
            cover_img_url = self._meta_content(soup, "property", "og:image")
        if cover_img_url:
            cover_img_url = urljoin(url, str(cover_img_url).strip())

        genres: list[str] = []
        genres_css = self.selectors.get("story_genres")
        if genres_css:
            for el in soup.select(genres_css):
                txt = self.clean_text(el.get_text(" ", strip=True))
                if txt and txt not in genres:
                    genres.append(txt)

        status_text = self._select_text(soup, self.selectors.get("story_status")).lower()
        status = "completed" if any(k in status_text for k in ("full", "hoàn", "complete")) else "ongoing"

        slug = self.slugify(title) if title else self.extract_slug(url)
        return {
            "title": title,
            "slug": slug,
            "author": author,
            "description": description,
            "cover_img_url": cover_img_url or None,
            "source_url": url,
            "source_name": self.domain,
            "genres": genres,
            "status": status,
        }

    def parse_chapter_list(self, html: str) -> list[dict]:
        soup = BeautifulSoup(html, "lxml")
        list_css = self.selectors.get("chapter_list") or ""
        if not list_css:
            return []

        chapters: list[dict] = []
        seen_urls: set[str] = set()

        for idx, el in enumerate(soup.select(list_css)):
            link_el = el if el.name == "a" else el.find("a")
            if not link_el:
                continue
            href = (link_el.get("href") or "").strip()
            if not href or href.startswith("#") or href.lower().startswith("javascript:"):
                continue

            abs_url = urljoin(self.base_url + "/", href)
            if abs_url in seen_urls:
                continue
            seen_urls.add(abs_url)

            title = self.clean_text(link_el.get_text(" ", strip=True))
            num: int | None = None
            m = CHAPTER_NUM_RE.search(title)
            if m:
                num = int(m.group(1))
            else:
                m_lead = LEADING_NUM_RE.match(title)
                if m_lead:
                    num = int(m_lead.group(1))
                else:
                    m2 = URL_NUM_RE.search(abs_url)
                    if m2:
                        candidate = int(m2.group(1))
                        # Ignore large numeric path IDs (e.g. /chapter/301815/...)
                        if candidate <= 20000:
                            num = candidate
            if num is None or num <= 0:
                num = idx + 1

            chapters.append({
                "chapter_number": num,
                "title": title or f"Chương {num}",
                "source_url": abs_url,
            })

        return chapters

    def parse_max_pages(self, html: str) -> int:
        pag_css = self.selectors.get("pagination_links")
        if not pag_css:
            return 1
        soup = BeautifulSoup(html, "lxml")
        max_page = 1
        for el in soup.select(pag_css):
            for candidate in (el.get_text(" ", strip=True), str(el.get("href") or "")):
                for m in re.finditer(r"(\d+)", candidate):
                    val = int(m.group(1))
                    if 1 <= val <= 5000 and val > max_page:
                        max_page = val
        return max_page

    def parse_chapter_content(self, html: str) -> dict:
        soup = BeautifulSoup(html, "lxml")
        title = (
            self._select_text(soup, self.selectors.get("chapter_title"))
            or self._select_text(soup, "h1, h2")
        )

        content_css = self.selectors.get("chapter_content") or ""
        content_el = soup.select_one(content_css) if content_css else None
        if not content_el:
            return {"title": title, "paragraphs": [], "word_count": 0}

        remove_list = ["script", "style", "iframe", "ins", "noscript"]
        extra_remove = self.selectors.get("remove_selectors") or []
        if isinstance(extra_remove, list):
            remove_list.extend(str(s) for s in extra_remove if s)

        for sel in remove_list:
            try:
                for tag in content_el.select(sel):
                    tag.decompose()
            except Exception:
                pass

        for br in content_el.find_all("br"):
            br.replace_with("\n")

        paragraphs: list[str] = []
        # Prefer block <p> elements if present, otherwise split by newline
        p_tags = content_el.find_all("p")
        if len(p_tags) >= 2:
            for p in p_tags:
                txt = self.clean_text(p.get_text(" ", strip=True))
                if txt and len(txt) > 1:
                    paragraphs.append(txt)
        else:
            for line in content_el.get_text(separator="\n").split("\n"):
                txt = self.clean_text(line)
                if txt and len(txt) > 1:
                    paragraphs.append(txt)

        return {
            "title": title,
            "paragraphs": paragraphs,
            "word_count": self.count_words(paragraphs),
        }
