"""
Supabase Client Helper — Manage story/chapter metadata in Supabase

Provides functions to create/update stories, chapters, and scrape jobs
using the Supabase Python client with the service role key (bypasses RLS).
"""

import os
from datetime import datetime, timezone
from supabase import create_client, Client


def get_supabase_client() -> Client:
    """Create a Supabase client with service role key (bypasses RLS)."""
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key)


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
    client = get_supabase_client()

    data = {
        "title": title,
        "slug": slug,
        "source_url": source_url,
        "source_name": source_name,
        "total_chapters": total_chapters,
        "status": status,
    }

    # Only include optional fields if provided
    if author is not None:
        data["author"] = author
    if description is not None:
        data["description"] = description
    if cover_url is not None:
        data["cover_url"] = cover_url
    if genres is not None:
        data["genres"] = genres

    result = (
        client.table("stories")
        .upsert(data, on_conflict="slug")
        .execute()
    )

    return result.data[0] if result.data else None


def get_story_by_slug(slug: str) -> dict | None:
    """Fetch a story by its slug."""
    client = get_supabase_client()
    result = client.table("stories").select("*").eq("slug", slug).single().execute()
    return result.data


def update_story_scrape_progress(story_id: int, last_chapter: int):
    """Update the last_scraped_chapter field for a story."""
    client = get_supabase_client()
    client.table("stories").update({
        "last_scraped_chapter": last_chapter,
    }).eq("id", story_id).execute()


def update_story_total_chapters(story_id: int, total_chapters: int):
    """Update the total_chapters field for a story."""
    client = get_supabase_client()
    client.table("stories").update({
        "total_chapters": total_chapters,
    }).eq("id", story_id).execute()


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
    client = get_supabase_client()

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

    result = (
        client.table("chapters")
        .upsert(data, on_conflict="story_id,chapter_number")
        .execute()
    )

    return result.data[0] if result.data else None


def get_unscraped_chapters(story_id: int, limit: int = 50) -> list[dict]:
    """Get chapters that haven't been scraped yet."""
    client = get_supabase_client()
    result = (
        client.table("chapters")
        .select("*")
        .eq("story_id", story_id)
        .eq("is_scraped", False)
        .order("chapter_number")
        .limit(limit)
        .execute()
    )
    return result.data


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
    client = get_supabase_client()

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
    
    # Also support other kwargs for flexibility
    for k, v in kwargs.items():
        data[k] = v

    if data:
        client.table("scrape_jobs").update(data).eq("id", job_id).execute()
