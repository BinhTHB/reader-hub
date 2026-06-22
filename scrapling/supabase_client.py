"""
Supabase Client Helper — Manage story/chapter metadata in Supabase (Scrapling branch)

Provides functions to create/update stories, chapters, and scrape jobs
using direct REST calls (avoids supabase-py client validation that rejects
newer sb_* key formats while REST itself accepts them).
"""

import os
import json
import urllib.request
import urllib.error
from datetime import datetime, timezone


def _rest(method: str, table: str, params: str = "", body: dict = None) -> dict:
    """Execute a REST API call against Supabase.

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

    if method == "GET":
        req = urllib.request.Request(full_url, headers=headers, method="GET")
    elif method == "POST":
        headers["Prefer"] = "return=representation,resolution=merge-duplicates"
        req = urllib.request.Request(
            full_url, data=json.dumps(body).encode("utf-8"),
            headers=headers, method="POST"
        )
    elif method == "PATCH":
        req = urllib.request.Request(
            full_url, data=json.dumps(body).encode("utf-8"),
            headers=headers, method="PATCH"
        )
    elif method == "DELETE":
        req = urllib.request.Request(full_url, headers=headers, method="DELETE")
    else:
        raise ValueError(f"Unsupported method: {method}")

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            if raw.strip():
                return json.loads(raw)
            return []
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Supabase REST HTTP {e.code} on {method} {table}: {err_body[:300]}"
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
        data["genres"] = genres

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
