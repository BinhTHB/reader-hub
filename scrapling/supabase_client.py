"""
Supabase Client Helper — Manage story/chapter metadata in Supabase (Scrapling branch)

Provides functions to create/update stories, chapters, and scrape jobs
using direct REST calls (avoids supabase-py client validation that rejects
newer sb_* key formats while REST itself accepts them).
"""

import os
import re
import json
import time
from datetime import datetime, timezone
import httpx

_client: httpx.Client | None = None


def _get_client() -> httpx.Client:
    """Return a reusable module-level HTTP client for Supabase REST keep-alive."""
    global _client
    if _client is None:
        _client = httpx.Client(timeout=30.0, http2=False)
    return _client


def _rest(method: str, table: str, params: str = "", body: dict = None) -> dict:
    """Execute a REST API call against Supabase with auto-retries on transient errors.

    Always uses SUPABASE_SERVICE_KEY (bypasses RLS).
    Returns the JSON response body.
    """
    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_KEY"]
    full_url = f"{url}/rest/v1/{table}{params}"

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Prefer": "return=representation",
    }
    if method == "POST":
        headers["Prefer"] = "return=representation,resolution=merge-duplicates"

    encoded_body = json.dumps(body).encode("utf-8") if body is not None else None

    max_retries = 4
    retry_delays = [2, 5, 10, 20]
    transient_http_codes = {429, 500, 502, 503, 504, 520, 521, 522, 524}

    if method not in ("GET", "POST", "PATCH", "DELETE"):
        raise ValueError(f"Unsupported method: {method}")

    client = _get_client()
    for attempt in range(max_retries + 1):
        try:
            resp = client.request(
                method,
                full_url,
                headers=headers,
                content=encoded_body if method in ("POST", "PATCH") else None,
            )
            if resp.status_code >= 400:
                if resp.status_code in transient_http_codes and attempt < max_retries:
                    delay = retry_delays[attempt]
                    print(f"  ⚠️ [Supabase] Transient HTTP {resp.status_code} on {method} {table}. Retrying in {delay}s (attempt {attempt + 1}/{max_retries})...")
                    time.sleep(delay)
                    continue
                raise RuntimeError(
                    f"Supabase REST HTTP {resp.status_code} on {method} {table}: {resp.text[:300]}"
                )
            if resp.text.strip():
                return resp.json()
            return []
        except httpx.TransportError as e:
            if attempt < max_retries:
                delay = retry_delays[attempt]
                print(f"  ⚠️ [Supabase] Connection/Timeout error on {method} {table}: {e}. Retrying in {delay}s (attempt {attempt + 1}/{max_retries})...")
                time.sleep(delay)
                continue
            raise RuntimeError(
                f"Supabase connection failed on {method} {table}: {e}"
            ) from e


# ─── Stories ───────────────────────────────────────────────

def upsert_story(
    title: str,
    slug: str,
    author: str = None,
    description: str = None,
    cover_url: str = None,
    source_url: str = None,
    source_name: str = None,
    genres: list[str] = None,
    total_chapters: int = 0,
    status: str = "ongoing",
) -> dict:
    """
    Create or update a story record.
    Uses slug as the unique identifier for upsert.
    """
    data = {
        "title": title,
        "slug": slug,
        "source_url": source_url,
        "source_name": source_name,
        "total_chapters": total_chapters,
        "status": status,
    }

    if author is not None:
        data["author"] = author
    if description is not None:
        data["description"] = description
    if cover_url is not None:
        data["cover_url"] = cover_url
    if genres is not None:
        if isinstance(genres, str):
            genres = [g.strip() for g in re.split(r"[,/|;]+", genres) if g.strip()]
        data["genres"] = list(genres) if genres else ["Khác"]

    # Upsert via POST with on_conflict
    params = f"?on_conflict=slug"
    result = _rest("POST", "stories", params=params, body=data)

    if result and isinstance(result, list):
        return result[0]
    return result


def get_story_by_slug(slug: str) -> dict | None:
    """Fetch a story by its slug."""
    params = f"?slug=eq.{slug}&select=*"
    result = _rest("GET", "stories", params=params)
    if result and isinstance(result, list) and len(result) > 0:
        return result[0]
    return None


def update_story_scrape_progress(story_id: int, last_chapter: int):
    """Update the last_scraped_chapter field for a story."""
    _rest("PATCH", "stories",
          params=f"?id=eq.{story_id}",
          body={"last_scraped_chapter": last_chapter})


def update_story_total_chapters(story_id: int, total_chapters: int):
    """Update the total_chapters field for a story."""
    _rest("PATCH", "stories",
          params=f"?id=eq.{story_id}",
          body={"total_chapters": total_chapters})


# ─── Chapters ──────────────────────────────────────────────

def upsert_chapter(
    story_id: int,
    chapter_number: int,
    title: str = None,
    text_r2_url: str = None,
    word_count: int = 0,
    source_url: str = None,
    is_scraped: bool = False,
) -> dict:
    """
    Create or update a chapter record.
    Uses (story_id, chapter_number) as the unique identifier.
    """
    data = {
        "story_id": story_id,
        "chapter_number": chapter_number,
        "word_count": word_count,
        "is_scraped": is_scraped,
    }

    if title is not None:
        data["title"] = title
    if text_r2_url is not None:
        data["text_r2_url"] = text_r2_url
    if source_url is not None:
        data["source_url"] = source_url
    if is_scraped:
        data["scraped_at"] = datetime.now(timezone.utc).isoformat()

    params = "?on_conflict=story_id,chapter_number"
    result = _rest("POST", "chapters", params=params, body=data)

    if result and isinstance(result, list):
        return result[0]
    return result


def get_unscraped_chapters(story_id: int, limit: int = 50) -> list[dict]:
    """Get chapters that haven't been scraped yet."""
    params = (
        f"?story_id=eq.{story_id}"
        f"&is_scraped=eq.false"
        f"&order=chapter_number.asc"
        f"&limit={limit}"
        f"&select=*"
    )
    result = _rest("GET", "chapters", params=params)
    return result if isinstance(result, list) else []


def get_story_chapters_index(story_id: int) -> dict[int, dict]:
    """Fetch all chapters for a story and return a dict keyed by chapter_number.

    Paginates in batches of 1000 to handle stories with >1000 chapters.

    Returns:
        {chapter_number: {source_url, is_scraped, text_r2_url, word_count, title}}
    """
    all_chapters = {}
    limit = 1000
    offset = 0

    while True:
        params = (
            f"?story_id=eq.{story_id}"
            f"&select=chapter_number,source_url,is_scraped,text_r2_url,word_count,title"
            f"&order=chapter_number.asc"
            f"&limit={limit}&offset={offset}"
        )
        rows = _rest("GET", "chapters", params=params)
        if not isinstance(rows, list) or not rows:
            break
        for row in rows:
            if row.get("chapter_number") is not None:
                all_chapters[row["chapter_number"]] = row
        if len(rows) < limit:
            break
        offset += limit

    return all_chapters


# ─── Scrape Jobs ───────────────────────────────────────────

def update_scrape_job(
    job_id: int,
    status: str = None,
    chapters_scraped: int = None,
    error_message: str = None,
    github_run_id: str = None,
    chapter_end: int = None,
    story_id: int = None,
    **kwargs,
):
    """Update a scrape job's status and progress."""
    data = {}
    if status is not None:
        data["status"] = status
        if status == "running":
            data["started_at"] = datetime.now(timezone.utc).isoformat()
        elif status in ("completed", "failed"):
            data["completed_at"] = datetime.now(timezone.utc).isoformat()
    if chapters_scraped is not None:
        data["chapters_scraped"] = chapters_scraped
    if error_message is not None:
        data["error_message"] = error_message
    if github_run_id is not None:
        data["github_run_id"] = github_run_id
    if chapter_end is not None:
        data["chapter_end"] = chapter_end
    if story_id is not None:
        data["story_id"] = story_id

    for k, v in kwargs.items():
        data[k] = v

    if data:
        _rest("PATCH", "scrape_jobs",
              params=f"?id=eq.{job_id}",
              body=data)


# ─── Dynamic Scrape Sources ────────────────────────────────

def get_scrape_source(domain: str) -> dict | None:
    """Fetch an enabled dynamic scrape source config by domain.

    Returns None safely if the table does not exist yet or no config matches.
    """
    try:
        from urllib.parse import quote
        params = f"?domain=eq.{quote(domain, safe='')}&enabled=eq.true&select=*"
        rows = _rest("GET", "scrape_sources", params=params)
        if isinstance(rows, list) and rows:
            return rows[0]
    except Exception as e:
        print(f"  ⚠️ [Supabase] Could not query scrape_sources for '{domain}': {e}")
    return None


def upsert_scrape_source(
    domain: str,
    base_url: str,
    selectors: dict,
    display_name: str | None = None,
    model_name: str | None = None,
    generated_by: str = "ai",
    is_verified: bool = True,
) -> dict:
    """Create or update a domain selector config in scrape_sources."""
    data = {
        "domain": domain,
        "base_url": base_url,
        "selectors": selectors,
        "generated_by": generated_by,
        "is_verified": is_verified,
        "enabled": True,
    }
    if display_name is not None:
        data["display_name"] = display_name
    if model_name is not None:
        data["model_name"] = model_name
    if is_verified:
        data["last_verified_at"] = datetime.now(timezone.utc).isoformat()

    result = _rest("POST", "scrape_sources", params="?on_conflict=domain", body=data)
    if isinstance(result, list) and result:
        return result[0]
    return result
