"""AI Auto-Selector — Discover and validate CSS selectors for unknown story sites."""

import json
import os
import re
from urllib.parse import urlparse
from bs4 import BeautifulSoup, Comment, NavigableString, Tag
import httpx

from dynamic_parser import DynamicConfigParser


DEFAULT_MODEL = "gemini-2.5-flash"
KEEP_ATTRS = {"id", "class", "href", "src", "property", "name", "content", "rel", "data-page"}
NOISE_TAGS = {"script", "style", "svg", "iframe", "noscript", "link", "path"}
BAD_CONTENT_MARKERS = ("document.write", "adsbygoogle", "window.location", "function(")


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


def skeletonize_html(html: str, max_chars: int = 16000) -> str:
    """Strip noise tags/scripts and shrink HTML to a compact structural skeleton."""
    soup = BeautifulSoup(html or "", "lxml")

    for comment in soup.find_all(string=lambda t: isinstance(t, Comment)):
        comment.extract()

    for tag in soup.find_all(NOISE_TAGS):
        tag.decompose()

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
                if k == "href" and isinstance(v, str) and len(v) > 120:
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

    info = parser.parse_story_info(story_html, story_url)
    title = (info.get("title") or "").strip()
    if not title:
        errors.append("story_title selector produced empty title")
    elif len(title) > 200:
        errors.append(f"story_title too long ({len(title)} chars), likely matched wrong container")

    chapters = parser.parse_chapter_list(story_html)
    valid_urls = {
        ch["source_url"]
        for ch in chapters
        if ch.get("source_url", "").startswith(("http://", "https://"))
    }
    if len(chapters) < 3 or len(valid_urls) < 3:
        errors.append(
            f"chapter_list selector matched only {len(chapters)} chapters ({len(valid_urls)} unique valid URLs); expected >= 3"
        )

    preview: dict = {
        "title": title,
        "author": info.get("author"),
        "chapter_count": len(chapters),
        "first_chapter_url": chapters[0]["source_url"] if chapters else None,
    }

    if chapter_html is not None:
        ch_data = parser.parse_chapter_content(chapter_html)
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

    return len(errors) == 0, errors, preview


def _strip_json_fences(raw: str) -> str:
    txt = raw.strip()
    if txt.startswith("```"):
        txt = re.sub(r"^```(?:json)?\s*", "", txt)
        txt = re.sub(r"\s*```$", "", txt)
    return txt.strip()


def _call_gemini_for_selectors(prompt: str, api_key: str, model: str) -> dict:
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.1,
        },
    }
    resp = httpx.post(endpoint, json=payload, timeout=45.0)
    if resp.status_code >= 400:
        raise RuntimeError(f"Gemini API HTTP {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as e:
        raise RuntimeError(f"Unexpected Gemini response format: {data}") from e
    return json.loads(_strip_json_fences(text))


def _build_prompt(
    story_url: str,
    story_skeleton: str,
    chapter_skeleton: str | None,
    previous_errors: list[str] | None,
) -> str:
    parts = [
        "You are an expert web-scraping engineer. Analyze the HTML skeleton(s) below and return a JSON object of CSS selectors compatible with BeautifulSoup (.select / .select_one).",
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
        '  "pagination_links": "CSS selector for pagination <a> links (or empty string)",',
        '  "page_url_pattern": "URL pattern for page > 1 e.g. {story_url}?page={page} or {story_url}/trang-{page}/ (or empty string)",',
        '  "chapter_title": "CSS selector for chapter title on chapter page",',
        '  "chapter_content": "CSS selector for main chapter body container on chapter page",',
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


def discover_site_selectors(
    story_url: str,
    story_html: str,
    fetch_fn,
    max_retries: int = 2,
    llm_fn=None,
) -> tuple[dict, dict]:
    """Discover, validate, and self-heal CSS selectors for an unknown site."""
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    model = os.environ.get("AI_SELECTOR_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL

    if llm_fn is None:
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not set; cannot auto-discover selectors")
        llm_fn = lambda prompt: _call_gemini_for_selectors(prompt, api_key, model)

    story_skeleton = skeletonize_html(story_html)
    chapter_html: str | None = None
    chapter_skeleton: str | None = None
    previous_errors: list[str] | None = None

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
                return selectors, preview
            previous_errors = all_errors
        else:
            previous_errors = story_errors

        print(f"  ⚠️ [AI Selector] Attempt {attempt + 1}/{max_retries + 1} failed: {previous_errors}")

    raise RuntimeError(f"AI selector discovery failed after {max_retries + 1} attempts: {previous_errors}")
