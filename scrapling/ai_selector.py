"""AI Auto-Selector — Discover and validate CSS selectors for unknown story sites."""

import json
import os
import re
from urllib.parse import urlparse
from bs4 import BeautifulSoup, Comment, NavigableString, Tag
import httpx

from dynamic_parser import DynamicConfigParser, is_site_branding_element


DEFAULT_MODEL = "gemini-2.5-flash"
DEFAULT_FALLBACK_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash-lite",
    "gemma-4-31b-it",
]
AUDIT_MODELS = [
    "gemini-3.5-flash-lite",
    "gemma-4-31b-it",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
]
KEEP_ATTRS = {
    "id",
    "class",
    "href",
    "src",
    "property",
    "name",
    "content",
    "rel",
    "data-page",
    "aria-label",
    "data-max",
    "data-base",
    "data-tpl",
}
NOISE_TAGS = {"script", "style", "svg", "iframe", "noscript", "link", "path", "footer", "aside"}
BAD_CONTENT_MARKERS = ("document.write", "adsbygoogle", "window.location", "function(")
_PAGINATION_ATTR_RE = re.compile(r"(?:pag|page|pager|phân trang|phan-trang)", re.IGNORECASE)
_PAGINATION_HREF_RE = re.compile(r"(?:/page/\d+|/trang-\d+|[?&](?:page|p)=\d+)", re.IGNORECASE)


def _is_pagination_element(tag: Tag) -> bool:
    """Return True if a tag looks like a pagination container or holds page-2+ links."""
    classes = tag.get("class") or []
    if isinstance(classes, str):
        classes = [classes]
    attr_text = " ".join([
        *[str(c) for c in classes],
        str(tag.get("id") or ""),
        str(tag.get("aria-label") or ""),
    ])
    if _PAGINATION_ATTR_RE.search(attr_text):
        return True
    for a in tag.find_all("a", href=True):
        href = str(a.get("href") or "")
        if _PAGINATION_HREF_RE.search(href):
            return True
        rels = a.get("rel") or []
        if isinstance(rels, str):
            rels = [rels]
        if any(str(r).lower() == "next" for r in rels):
            return True
    return False


def _detect_html_pagination_signals(story_html: str) -> list[str]:
    """Detect pagination containers or page-2+ links in raw story HTML."""
    soup = BeautifulSoup(story_html or "", "lxml")
    signals: list[str] = []
    for nav in soup.find_all(["nav", "ul", "div"]):
        if nav.name == "nav" and _is_pagination_element(nav):
            cls = ".".join(nav.get("class") or [])
            signals.append(f"<nav{('.' + cls) if cls else ''}>")
            break
    if not signals:
        for a in soup.find_all("a", href=True):
            href = str(a.get("href") or "")
            if re.search(r"(?:/page/2\b|/trang-2\b|[?&](?:page|p)=2\b)", href, re.IGNORECASE):
                signals.append(href[:80])
                break
    return signals


def normalize_domain(url: str) -> str:
    """Extract normalized lowercase domain without www. prefix."""
    netloc = urlparse(url).netloc.lower().split(":")[0]
    if netloc.startswith("www."):
        netloc = netloc[4:]
    return netloc


def _truncate_text(text: str, limit: int = 80) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[:limit] + "…"


def _collapse_repeated_children(parent: Tag) -> None:
    """Keep first 4 and last 2 children when a container has >8 same-tag items."""
    for child in list(parent.children):
        if isinstance(child, Tag):
            _collapse_repeated_children(child)

    tag_children = [c for c in parent.children if isinstance(c, Tag)]
    if len(tag_children) <= 8:
        return

    counts: dict[str, int] = {}
    for c in tag_children:
        counts[c.name] = counts.get(c.name, 0) + 1
    dominant_tag, dominant_count = max(counts.items(), key=lambda kv: kv[1])
    if dominant_count <= 8:
        return

    matching = [c for c in tag_children if c.name == dominant_tag]
    to_remove = matching[4:-2]
    if not to_remove:
        return
    marker = Comment(f" ... {len(to_remove)} more <{dominant_tag}> items omitted ... ")
    to_remove[0].insert_before(marker)
    for node in to_remove:
        node.decompose()


def skeletonize_html(html: str, max_chars: int = 32000) -> str:
    """Strip noise tags/scripts and shrink HTML to a compact structural skeleton."""
    soup = BeautifulSoup(html or "", "lxml")

    for comment in soup.find_all(string=lambda t: isinstance(t, Comment)):
        comment.extract()

    for tag in soup.find_all(NOISE_TAGS):
        tag.decompose()

    for nav in soup.find_all("nav"):
        if not _is_pagination_element(nav):
            nav.decompose()

    if soup.head:
        for child in list(soup.head.children):
            if isinstance(child, Tag):
                is_title = child.name == "title"
                is_useful_meta = child.name == "meta" and (
                    str(child.get("property", "")).startswith("og:")
                    or child.get("name") == "description"
                )
                if not (is_title or is_useful_meta):
                    child.decompose()

    if soup.body:
        _collapse_repeated_children(soup.body)

    for tag in soup.find_all(True):
        new_attrs = {}
        for k, v in tag.attrs.items():
            if k in KEEP_ATTRS:
                if k == "class" and isinstance(v, list):
                    # Drop Tailwind utility classes containing ':', '/', '[', ']' that break CSS selectors
                    clean_classes = [c for c in v if not any(ch in c for ch in (":", "/", "[", "]"))]
                    if clean_classes:
                        new_attrs[k] = clean_classes[:8]
                elif k == "href" and isinstance(v, str) and len(v) > 120:
                    new_attrs[k] = v[:120]
                elif k == "content" and isinstance(v, str) and len(v) > 120:
                    new_attrs[k] = v[:120]
                else:
                    new_attrs[k] = v
        tag.attrs = new_attrs

    for text_node in list(soup.find_all(string=True)):
        if isinstance(text_node, Comment):
            continue
        if isinstance(text_node, NavigableString):
            trimmed = _truncate_text(str(text_node), 80)
            if trimmed:
                text_node.replace_with(trimmed)
            else:
                text_node.extract()

    out = str(soup)
    if len(out) > max_chars:
        out = out[:max_chars] + "\n<!-- truncated -->"
    return out


def validate_selectors(
    story_html: str,
    chapter_html: str | None,
    story_url: str,
    selectors: dict,
) -> tuple[bool, list[str], dict]:
    """Validate candidate CSS selectors against real HTML pages."""
    errors: list[str] = []
    if not isinstance(selectors, dict):
        return False, ["selectors must be a JSON object"], {}

    domain = normalize_domain(story_url)
    parsed = urlparse(story_url)
    base_url = f"{parsed.scheme}://{parsed.netloc}"
    parser = DynamicConfigParser(domain=domain, base_url=base_url, selectors=selectors)

    info = {}
    try:
        info = parser.parse_story_info(story_html, story_url)
    except Exception as e:
        errors.append(f"Invalid CSS selector in story metadata: {e}")

    title = (info.get("title") or "").strip()
    if not title:
        errors.append("story_title selector produced empty title")
    elif len(title) > 200:
        errors.append(f"story_title too long ({len(title)} chars), likely matched wrong container")
    else:
        story_title_css = (selectors.get("story_title") or "").strip()
        if story_title_css:
            try:
                story_soup = BeautifulSoup(story_html, "lxml")
                matched_title_el = story_soup.select_one(story_title_css)
                if matched_title_el is not None and is_site_branding_element(matched_title_el):
                    errors.append(
                        f"story_title selector '{story_title_css}' matched site header/branding ('{title}') "
                        "instead of the book title; scope it to the main story container matching <title>/og:title"
                    )
            except Exception:
                pass

    chapters = []
    try:
        chapters = parser.parse_chapter_list(story_html)
    except Exception as e:
        errors.append(f"Invalid CSS selector in chapter_list: {e}")

    valid_urls = {
        ch["source_url"]
        for ch in chapters
        if ch.get("source_url", "").startswith(("http://", "https://"))
    }
    if len(chapters) < 3 or len(valid_urls) < 3:
        errors.append(
            f"chapter_list selector matched only {len(chapters)} chapters ({len(valid_urls)} unique valid URLs); expected >= 3"
        )
    else:
        list_css = (selectors.get("chapter_list") or "").strip()
        if list_css:
            try:
                list_soup = BeautifulSoup(story_html, "lxml")
                matched_els = list_soup.select(list_css)
                nav_footer_hits = sum(
                    1
                    for el in matched_els
                    if any(getattr(p, "name", None) in ("nav", "footer") for p in el.parents)
                )
                if matched_els and nav_footer_hits > len(matched_els) / 2:
                    errors.append(
                        f"chapter_list selector '{list_css}' matched mostly <nav>/<footer> links instead of the story chapter list"
                    )
            except Exception:
                pass

    preview: dict = {
        "title": title,
        "author": info.get("author"),
        "chapter_count": len(chapters),
        "first_chapter_url": chapters[0]["source_url"] if chapters else None,
    }

    if chapter_html is not None:
        ch_data = {"title": "", "paragraphs": [], "word_count": 0}
        try:
            ch_data = parser.parse_chapter_content(chapter_html)
        except Exception as e:
            errors.append(f"Invalid CSS selector in chapter_content: {e}")
        paragraphs = ch_data.get("paragraphs") or []
        word_count = ch_data.get("word_count") or 0
        joined = "\n".join(paragraphs).lower()

        if len(paragraphs) < 2:
            errors.append(f"chapter_content matched only {len(paragraphs)} paragraphs; expected >= 2")
        if word_count < 120:
            errors.append(f"chapter_content word_count too low ({word_count}); expected >= 120")
        for marker in BAD_CONTENT_MARKERS:
            if marker in joined:
                errors.append(f"chapter_content contains script/ad noise: '{marker}' — add to remove_selectors")
                break

        preview["chapter_title"] = ch_data.get("title")
        preview["chapter_paragraphs"] = len(paragraphs)
        preview["chapter_word_count"] = word_count

    pag_links_css = (selectors.get("pagination_links") or "").strip()
    page_pattern = (selectors.get("page_url_pattern") or "").strip()
    next_page_css = (selectors.get("next_page_selector") or "").strip()
    if not pag_links_css and not page_pattern and not next_page_css:
        pag_signals = _detect_html_pagination_signals(story_html)
        if pag_signals:
            errors.append(
                f"HTML contains pagination ({pag_signals[0]}) but pagination_links, page_url_pattern, and next_page_selector are all empty; extract them so all pages are scraped"
            )

    return len(errors) == 0, errors, preview


def _extract_json_object(raw: str) -> dict:
    txt = raw.strip()
    if txt.startswith("```"):
        txt = re.sub(r"^```(?:json)?\s*", "", txt)
        txt = re.sub(r"\s*```$", "", txt)
        txt = txt.strip()
    try:
        return json.loads(txt)
    except json.JSONDecodeError:
        start = txt.find("{")
        end = txt.rfind("}")
        if start != -1 and end > start:
            return json.loads(txt[start : end + 1])
        raise


def _call_gemini_for_selectors(prompt: str, api_key: str, model: str) -> dict:
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    generation_config: dict = {"temperature": 0.1}
    # Gemma models do not support responseMimeType: application/json
    if not model.lower().startswith("gemma"):
        generation_config["responseMimeType"] = "application/json"

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": generation_config,
    }
    resp = httpx.post(endpoint, json=payload, timeout=60.0)
    if resp.status_code >= 400:
        raise RuntimeError(f"Gemini API HTTP {resp.status_code} ({model}): {resp.text[:300]}")
    data = resp.json()
    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as e:
        raise RuntimeError(f"Unexpected Gemini response format ({model}): {data}") from e
    return _extract_json_object(text)


def _build_prompt(
    story_url: str,
    story_skeleton: str,
    chapter_skeleton: str | None,
    previous_errors: list[str] | None,
) -> str:
    parts = [
        "You are an expert web-scraping engineer. Analyze the HTML skeleton(s) below and return a JSON object of CSS selectors compatible with BeautifulSoup (.select / .select_one). Avoid deprecated :contains(...) (use :-soup-contains(...) if needed) and avoid unescaped Tailwind colon classes like md:text-5xl or bg-card/50 in selectors.",
        "IMPORTANT: Never select site logo/brand/header titles inside <header>, <nav>, or .site-title for story_title; always scope story_title to the main story/novel container so it matches the actual book title in <title> / og:title.",
        f"Target story URL: {story_url}",
        "",
        "Return ONLY a JSON object with these keys:",
        '{',
        '  "story_title": "CSS selector for story title",',
        '  "story_author": "CSS selector for author (or empty string)",',
        '  "story_description": "CSS selector for synopsis (or empty string)",',
        '  "story_cover": "CSS selector for cover <img> (or empty string)",',
        '  "story_genres": "CSS selector matching genre tags/links (or empty string)",',
        '  "story_status": "CSS selector for ongoing/completed status (or empty string)",',
        '  "chapter_list": "CSS selector matching chapter <a> links in reading order",',
        '  "pagination_mode": "single_page | url_pattern | next_page_link | next_chapter_chain",',
        '  "pagination_links": "CSS selector for pagination <a> links or container (or empty string)",',
        '  "page_url_pattern": "URL pattern for page > 1 e.g. {story_url}?page={page} or {story_url}/page/{page}/ (or empty string)",',
        '  "next_page_selector": "CSS selector for next-page <a> link if pagination uses next button (or empty string)",',
        '  "chapter_title": "CSS selector for chapter title on chapter page",',
        '  "chapter_content": "CSS selector for main chapter body container on chapter page",',
        '  "next_chapter_selector": "CSS selector for next-chapter <a> link on chapter page (or empty string)",',
        '  "remove_selectors": ["CSS selectors inside chapter_content to remove ads/scripts/watermarks"]',
        '}',
        "",
        "=== STORY PAGE HTML SKELETON ===",
        story_skeleton,
    ]
    if chapter_skeleton:
        parts.extend(["", "=== CHAPTER PAGE HTML SKELETON ===", chapter_skeleton])
    if previous_errors:
        parts.extend([
            "",
            "=== PREVIOUS ATTEMPT FAILED VALIDATION — FIX THESE ERRORS ===",
            *[f"- {err}" for err in previous_errors],
        ])
    return "\n".join(parts)


def _call_model_chain(prompt: str, api_key: str, model_chain: list[str]) -> dict:
    """Call Gemini/Gemma models in order, falling back on transient errors."""
    last_err: Exception | None = None
    for idx, current_model in enumerate(model_chain):
        try:
            return _call_gemini_for_selectors(prompt, api_key, current_model)
        except Exception as err:
            last_err = err
            err_s = str(err)
            is_transient = isinstance(err, httpx.TransportError) or any(
                code in err_s for code in ("HTTP 429", "HTTP 500", "HTTP 502", "HTTP 503", "HTTP 504")
            )
            if is_transient and idx + 1 < len(model_chain):
                next_model = model_chain[idx + 1]
                print(f"  🔄 [AI Selector] {current_model} unavailable ({err_s[:70]}), switching to {next_model}")
                continue
            raise
    raise last_err or RuntimeError("No models available")


def _build_audit_prompt(
    story_url: str,
    selectors: dict,
    preview: dict,
    chapter_data: dict,
    pag_signals: list[str],
    page2_new_count: int | None,
) -> str:
    paragraphs = chapter_data.get("paragraphs") or []
    sample_paras = paragraphs[:2] + (paragraphs[-2:] if len(paragraphs) > 2 else [])
    sample_text = "\n---\n".join(p[:220] for p in sample_paras)
    return "\n".join([
        "You are a QA auditor for a web-novel scraper. Inspect the extracted preview below and decide if the CSS selectors are accurate.",
        f"URL: {story_url}",
        f"Selectors: {json.dumps(selectors, ensure_ascii=False)}",
        f"Preview: {json.dumps(preview, ensure_ascii=False)}",
        f"Detected raw HTML pagination cues: {pag_signals}",
        f"Live page-2 probe new chapters count: {page2_new_count}",
        "Sample extracted chapter paragraphs (first 2 & last 2):",
        sample_text,
        "",
        "Check: (1) Is story_title the actual book title (not website name)?",
        "(2) If pagination cues exist, did pagination/page-2 probe find new chapters?",
        "(3) Are sample paragraphs clean story prose without navigation/ad/comment junk?",
        'Return ONLY JSON: {"ok": true, "issues": []} or {"ok": false, "issues": ["specific actionable issue"]}',
    ])


def discover_site_selectors(
    story_url: str,
    story_html: str,
    fetch_fn,
    max_retries: int = 2,
    llm_fn=None,
    model: str | None = None,
    audit_fn=None,
) -> tuple[dict, dict]:
    """Discover, validate, live-probe, audit, and self-heal CSS selectors."""
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    active_model = (model or os.environ.get("AI_SELECTOR_MODEL") or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    model_chain = [active_model]
    if model is None:
        for fb in DEFAULT_FALLBACK_MODELS:
            if fb not in model_chain:
                model_chain.append(fb)

    use_real_api = llm_fn is None
    if llm_fn is None:
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not set; cannot auto-discover selectors")
        llm_fn = lambda prompt: _call_model_chain(prompt, api_key, model_chain)

    if audit_fn is None and use_real_api and api_key:
        audit_fn = lambda prompt: _call_model_chain(prompt, api_key, AUDIT_MODELS)

    story_skeleton = skeletonize_html(story_html)
    pag_signals = _detect_html_pagination_signals(story_html)
    chapter_html: str | None = None
    chapter_skeleton: str | None = None
    previous_errors: list[str] | None = None
    domain = normalize_domain(story_url)
    parsed_u = urlparse(story_url)
    base_url = f"{parsed_u.scheme}://{parsed_u.netloc}"

    for attempt in range(max_retries + 1):
        prompt = _build_prompt(story_url, story_skeleton, chapter_skeleton, previous_errors)
        selectors = llm_fn(prompt)

        ok_story, story_errors, preview = validate_selectors(
            story_html, None, story_url, selectors
        )

        if ok_story and chapter_html is None and preview.get("first_chapter_url"):
            chapter_html = fetch_fn(preview["first_chapter_url"])
            if chapter_html:
                chapter_skeleton = skeletonize_html(chapter_html)

        if chapter_html is not None:
            ok_all, all_errors, preview = validate_selectors(
                story_html, chapter_html, story_url, selectors
            )
            if ok_all:
                # Pass 2: Live page-2 pagination probe
                probe_errors: list[str] = []
                page2_new_count: int | None = None
                parser = DynamicConfigParser(domain=domain, base_url=base_url, selectors=selectors)
                page1_urls = {ch["source_url"] for ch in parser.parse_chapter_list(story_html)}
                page2_url: str | None = None
                if (selectors.get("page_url_pattern") or "").strip() and parser.parse_max_pages(story_html) > 1:
                    page2_url = parser.get_chapter_list_url(story_url, 2)
                elif (selectors.get("next_page_selector") or "").strip():
                    page2_url = parser.parse_next_page_url(story_html, story_url)

                if page2_url and page2_url.rstrip("/") != story_url.rstrip("/"):
                    try:
                        page2_html = fetch_fn(page2_url)
                        page2_chapters = parser.parse_chapter_list(page2_html) if page2_html else []
                        new_urls = [ch["source_url"] for ch in page2_chapters if ch["source_url"] not in page1_urls]
                        page2_new_count = len(new_urls)
                        if page2_new_count == 0:
                            probe_errors.append(
                                f"Live page-2 probe at '{page2_url}' found 0 new chapters; fix page_url_pattern/next_page_selector/chapter_list"
                            )
                    except Exception as probe_err:
                        probe_errors.append(f"Live page-2 probe failed ({page2_url}): {probe_err}")

                if probe_errors:
                    previous_errors = probe_errors
                else:
                    # Pass 3: AI Quality Auditor (non-fatal if API errors)
                    audit_issues: list[str] = []
                    if audit_fn is not None and attempt < max_retries:
                        try:
                            ch_data = parser.parse_chapter_content(chapter_html)
                            audit_prompt = _build_audit_prompt(
                                story_url, selectors, preview, ch_data, pag_signals, page2_new_count
                            )
                            audit_res = audit_fn(audit_prompt)
                            if isinstance(audit_res, dict) and audit_res.get("ok") is False:
                                raw_issues = audit_res.get("issues") or []
                                audit_issues = [str(i) for i in raw_issues if i]
                        except Exception as audit_err:
                            print(f"  ⚠️ [AI Auditor] Skipped due to error (non-fatal): {audit_err}")

                    if not audit_issues:
                        return selectors, preview
                    previous_errors = audit_issues
            else:
                previous_errors = all_errors
        else:
            previous_errors = story_errors

        print(f"  ⚠️ [AI Selector] Attempt {attempt + 1}/{max_retries + 1} failed: {previous_errors}")

    raise RuntimeError(f"AI selector discovery failed after {max_retries + 1} attempts: {previous_errors}")
