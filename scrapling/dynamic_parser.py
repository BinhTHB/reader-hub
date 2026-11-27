"""Dynamic Config Parser — Parse any story website using JSON CSS selectors."""

import re
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup

from parsers import BaseSiteParser
from sites_config import SiteConfig


CHAPTER_NUM_RE = re.compile(
    r"(?:chương|chuong|chapter|chap|c\.?|第)\s*(\d{1,3}(?:[,.]\d{3})+(?!\d)|\d+)",
    re.IGNORECASE,
)
LEADING_NUM_RE = re.compile(r"^\s*(\d{1,3}(?:[,.]\d{3})+(?!\d)|\d+)\s*[.:\-–—\s]")


def _parse_formatted_int(raw: str) -> int:
    if re.fullmatch(r"\d{1,3}(?:[,.]\d{3})+", raw):
        return int(raw.replace(",", "").replace(".", ""))
    return int(raw.replace(",", ""))
URL_NUM_RE = re.compile(r"(\d+)(?:[./?#]|$)")
_BRANDING_ATTR_RE = re.compile(r"(?:site-title|site-name|site-logo|brand|logo)", re.IGNORECASE)
_HEADER_ANCESTOR_RE = re.compile(r"(?:site-header|navbar|topbar|main-header)", re.IGNORECASE)
_AUTHOR_PREFIX_RE = re.compile(r"^(?:tác\s*giả|author|by)\s*[:：\-]?\s*", re.IGNORECASE)


_HIDDEN_STYLE_RE = re.compile(
    r"(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\D|$)|font-size\s*:\s*0(?:px|em|rem|%)?(?:\D|$))",
    re.IGNORECASE,
)
_WATERMARK_PARA_RE = re.compile(
    r"(?:bạn đang đọc truyện tại|đọc truyện online tại|chúc bạn đọc truyện vui vẻ|truy cập website)",
    re.IGNORECASE,
)


def _attr_tokens(el) -> str:
    classes = el.get("class") or []
    if isinstance(classes, str):
        classes = [classes]
    return " ".join([*[str(c) for c in classes], str(el.get("id") or "")])


def is_site_branding_element(el) -> bool:
    """Return True when an element looks like a site header/brand/logo title."""
    if el is None:
        return False
    if _BRANDING_ATTR_RE.search(_attr_tokens(el)):
        return True
    for parent in el.parents:
        name = getattr(parent, "name", None)
        if name == "nav":
            return True
        if name == "header" and _HEADER_ANCESTOR_RE.search(_attr_tokens(parent)):
            return True
    return False


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
        normalized = re.sub(r"\{story_url\}(?=[^/?#])", "{story_url}/", pattern)
        normalized = re.sub(r"\{base_url\}(?=[^/?#])", "{base_url}/", normalized)
        return (
            normalized.replace("{story_url}", clean_story)
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

        fallback_h1 = ""
        if not self.selectors.get("story_title"):
            for h in soup.find_all("h1"):
                if not is_site_branding_element(h):
                    fallback_h1 = self.clean_text(h.get_text(" ", strip=True))
                    if fallback_h1:
                        break

        title = (
            self._select_text(soup, self.selectors.get("story_title"))
            or self._meta_content(soup, "property", "og:title")
            or fallback_h1
        )
        # Strip common site-name suffixes from og:title if h1 wasn't used
        if title and " - " in title and not self.selectors.get("story_title"):
            title = title.split(" - ")[0].strip()

        raw_author = self._select_text(soup, self.selectors.get("story_author"))
        author = _AUTHOR_PREFIX_RE.sub("", raw_author).strip() or "Đang cập nhật"

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
                num = _parse_formatted_int(m.group(1))
            else:
                m_lead = LEADING_NUM_RE.match(title)
                if m_lead:
                    num = _parse_formatted_int(m_lead.group(1))
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

        # Guard against volume-reset numbering (e.g., Vol 1 Ch 1, Vol 2 Ch 1)
        if len(chapters) >= 5:
            unique_count = len({c["chapter_number"] for c in chapters})
            if unique_count < len(chapters) * 0.7:
                for seq_idx, ch in enumerate(chapters, start=1):
                    ch["source_chapter_number"] = ch["chapter_number"]
                    ch["chapter_number"] = seq_idx

        return chapters

    def parse_max_pages(self, html: str) -> int:
        pag_css = self.selectors.get("pagination_links")
        if not pag_css:
            return 1
        soup = BeautifulSoup(html, "lxml")
        max_page = 1
        for el in soup.select(pag_css):
            for node in (el, el.parent):
                if node is not None and hasattr(node, "get"):
                    dmax = node.get("data-max")
                    if dmax and str(dmax).isdigit():
                        val = int(str(dmax))
                        if 1 <= val <= 5000 and val > max_page:
                            max_page = val
            for candidate in (el.get_text(" ", strip=True), str(el.get("href") or "")):
                for m in re.finditer(r"(\d+)", candidate):
                    val = int(m.group(1))
                    if 1 <= val <= 5000 and val > max_page:
                        max_page = val
        return max_page

    def _select_next_href(self, html: str, css: str | None, current_url: str) -> str | None:
        if not css or not html:
            return None
        soup = BeautifulSoup(html, "lxml")
        el = soup.select_one(css)
        if not el:
            return None
        link_el = el if el.name == "a" else el.find("a")
        if not link_el:
            return None
        href = (link_el.get("href") or "").strip()
        if not href or href.startswith("#") or href.lower().startswith("javascript:"):
            return None
        resolved = urljoin(current_url, href)
        if resolved.rstrip("/") == current_url.rstrip("/"):
            return None
        return resolved

    def parse_next_page_url(self, html: str, current_url: str) -> str | None:
        return self._select_next_href(html, self.selectors.get("next_page_selector"), current_url)

    def parse_next_chapter_url(self, html: str, current_url: str) -> str | None:
        return self._select_next_href(html, self.selectors.get("next_chapter_selector"), current_url)

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

        # Universal Content Sanitizer: strip hidden decoy tags
        for tag in list(content_el.find_all(True)):
            if tag.has_attr("hidden") or _HIDDEN_STYLE_RE.search(str(tag.get("style") or "")):
                tag.decompose()

        for br in content_el.find_all("br"):
            br.replace_with("\n")

        raw_paragraphs: list[str] = []
        # Prefer block <p> elements if present, otherwise split by newline
        p_tags = content_el.find_all("p")
        if len(p_tags) >= 2:
            for p in p_tags:
                txt = self.clean_text(p.get_text(" ", strip=True))
                if txt and len(txt) > 1:
                    raw_paragraphs.append(txt)
        else:
            for line in content_el.get_text(separator="\n").split("\n"):
                txt = self.clean_text(line)
                if txt and len(txt) > 1:
                    raw_paragraphs.append(txt)

        paragraphs = [
            p for p in raw_paragraphs
            if not (len(p) < 140 and _WATERMARK_PARA_RE.search(p))
        ]

        return {
            "title": title,
            "paragraphs": paragraphs,
            "word_count": self.count_words(paragraphs),
        }


def canonical_chapter_url(url: str | None) -> str:
    if not url:
        return ""
    return url.split("#")[0].split("?")[0].rstrip("/").lower()


def assign_linear_chapter_numbers(
    all_chapters: list[dict],
    existing_index: dict[int, dict],
    parser=None,
    order_mode: str = "auto",
) -> list[dict]:
    """Assign collision-free linear chapter_number 1..N using URL-First + reading order.

    - Deduplicates chapters by canonical source_url.
    - Reverses descending lists automatically when order_mode == 'auto' (or always when 'desc').
    - Reuses existing DB chapter_number when a chapter's source_url is already in existing_index.
    - Assigns sequential numbers starting from max(existing_index) + 1 for new URLs.
    """
    if not all_chapters:
        return []

    deduped: list[dict] = []
    seen_keys: set[str] = set()
    for ch in all_chapters:
        raw_url = ch.get("source_url") or ""
        if parser is not None and hasattr(parser, "canonical_source_key"):
            key = parser.canonical_source_key(raw_url)
        else:
            key = canonical_chapter_url(raw_url)
        if key and key in seen_keys:
            continue
        if key:
            seen_keys.add(key)
        deduped.append(dict(ch))

    mode = (order_mode or "auto").strip().lower()
    if mode == "desc":
        deduped.reverse()
    elif mode == "auto" and len(deduped) >= 2:
        first_num = deduped[0].get("chapter_number")
        last_num = deduped[-1].get("chapter_number")
        if isinstance(first_num, int) and isinstance(last_num, int) and (first_num - last_num) >= 3:
            deduped.reverse()

    existing_by_url: dict[str, int] = {}
    for num, row in (existing_index or {}).items():
        canon = canonical_chapter_url(row.get("source_url"))
        if canon:
            existing_by_url[canon] = num

    next_num = max(existing_index.keys(), default=0) + 1
    used_nums: set[int] = set()

    for ch in deduped:
        ch["source_chapter_number"] = ch.get("chapter_number")
        canon = canonical_chapter_url(ch.get("source_url"))
        if canon and canon in existing_by_url and existing_by_url[canon] not in used_nums:
            assigned = existing_by_url[canon]
        else:
            while next_num in used_nums:
                next_num += 1
            assigned = next_num
            next_num += 1
        used_nums.add(assigned)
        ch["chapter_number"] = assigned

    return deduped
