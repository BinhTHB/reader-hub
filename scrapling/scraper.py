"""
Main Scraper — Orchestrates the scraping pipeline using Scrapling (Scrapling branch)

Flow:
1. Parse env vars for target story URL and chapter range
2. Launch Scrapling StealthySession (with anti-bot, ad block, and resource optimization)
3. Scrape story info → upsert to Supabase
4. For each chapter: scrape content → upload to R2 → update Supabase
5. Handle limits, batching, and error tracking
"""

import os
import sys
import random
import time
import argparse
import io
import traceback
import urllib.request
from datetime import datetime
from dotenv import load_dotenv

# Fix Windows console encoding for emojis
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from scrapling.fetchers import StealthySession

from parsers import detect_parser
from r2_uploader import upload_chapter, upload_cover, get_existing_chapters
from supabase_client import (
    upsert_story,
    upsert_chapter,
    update_story_scrape_progress,
    update_story_total_chapters,
    update_scrape_job,
)


# ─── Config & Arguments ──────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(description="Reader Hub Scraper (Scrapling)")
    parser.add_argument("--url", type=str, help="Story source URL to scrape")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of chapters to scrape (0 for all)")
    parser.add_argument("--start", type=int, default=None, help="Chapter number to start from")
    parser.add_argument("--job-id", type=str, help="Scrape job ID for tracking")
    return parser.parse_args()


# Load .env from root if it exists
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

args = parse_args()

# Priority: Command line args > Environment variables
STORY_SOURCE_URL = args.url or os.environ.get("STORY_SOURCE_URL", "")

_start_env = os.environ.get("CHAPTER_START", "1")
CHAPTER_START = args.start if args.start is not None else (int(_start_env) if _start_env else 1)

_limit_env = os.environ.get("CHAPTER_LIMIT", "0")
CHAPTER_LIMIT = args.limit if args.limit is not None else (int(_limit_env) if _limit_env else 0)

PROXY_URL = os.environ.get("PROXY_URL", "")
JOB_ID = args.job_id or os.environ.get("JOB_ID", "")
USE_FREE_PROXY = os.environ.get("USE_FREE_PROXY", "false").lower() == "true"

# Rate limiting
MIN_DELAY = float(os.environ.get("SCRAPE_MIN_DELAY", "2.0"))
MAX_DELAY = float(os.environ.get("SCRAPE_MAX_DELAY", "5.0"))

# Global state to track progress for signal handlers and early aborts
scrape_progress = {
    "start": None,
    "end": None,
    "count": 0
}


class ScraperAbortException(Exception):
    """Custom exception raised when the scraper is aborted early."""
    pass


import signal

def handle_signal(sig, frame):
    print(f"\n⚠️ Scraper interrupted by signal {sig}. Gracefully shutting down...")
    if JOB_ID:
        start = scrape_progress["start"]
        end = scrape_progress["end"]
        count = scrape_progress["count"]
        scraped_log = f"Scraped chapters from {start} to {end}" if start else "No chapters scraped"
        try:
            update_scrape_job(int(JOB_ID), status="canceled", error_message=f"Canceled by signal | {scraped_log}", chapters_scraped=count)
            print("  ✅ Gracefully marked job as canceled in Supabase.")
        except Exception as e:
            print(f"  ❌ Failed to update job status on signal: {e}")
    sys.exit(0)


# Register signal handlers
try:
    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)
except ValueError:
    pass


def random_delay():
    """Sleep for a random duration to avoid detection."""
    delay = random.uniform(MIN_DELAY, MAX_DELAY)
    time.sleep(delay)


def download_image(img_url: str) -> bytes | None:
    """Download cover image with browser-like headers."""
    try:
        req = urllib.request.Request(
            img_url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.read()
    except Exception as e:
        print(f"  ⚠️ Failed to download image: {e}")
    return None


def run_scraper():
    """Main scraping pipeline using Scrapling."""
    if not STORY_SOURCE_URL:
        print("❌ No STORY_SOURCE_URL provided. Exiting.")
        sys.exit(1)

    parser = detect_parser(STORY_SOURCE_URL)
    print(f"📖 [Scrapling] Using parser: {parser.name}")
    print(f"🔗 [Scrapling] Source: {STORY_SOURCE_URL}")
    print(f"📄 [Scrapling] Chapters: {CHAPTER_START} (Limit: {CHAPTER_LIMIT if CHAPTER_LIMIT > 0 else 'All'})")

    # Update job status
    if JOB_ID:
        update_scrape_job(int(JOB_ID), status="running")

    # Configure session proxy
    session_kwargs = {
        "headless": True,
        "solve_cloudflare": True,
        "disable_resources": True,  # Block images/fonts/media
        "ad_block": True            # Block track/ads domains
    }

    if PROXY_URL:
        session_kwargs["proxy"] = PROXY_URL
        print(f"🔄 [Scrapling] Configured proxy: {PROXY_URL[:35]}...")

    chapters_scraped = 0
    consecutive_failures = 0

    # Start Scrapling session
    with StealthySession(**session_kwargs) as session:
        try:
            # ─── Step 1: Scrape story info ─────────────────
            print("\n📚 [Scrapling] Scraping story info...")
            response = session.fetch(STORY_SOURCE_URL)
            if response.status != 200:
                raise RuntimeError(f"Failed to fetch story details: HTTP {response.status}")

            story_info = parser.parse_story_info(response.text, STORY_SOURCE_URL)
            print(f"  Title: {story_info['title']}")
            print(f"  Author: {story_info.get('author', 'N/A')}")
            print(f"  Slug: {story_info['slug']}")

            # Download cover image
            cover_url = None
            if story_info.get("cover_img_url"):
                print("  📷 Downloading cover image...")
                img_data = download_image(story_info["cover_img_url"])
                if img_data:
                    cover_url = upload_cover(story_info["slug"], img_data, "image/jpeg")

            # Upsert story to Supabase
            story = upsert_story(
                title=story_info["title"],
                slug=story_info["slug"],
                author=story_info.get("author"),
                description=story_info.get("description"),
                cover_url=cover_url,
                source_url=story_info["source_url"],
                source_name=story_info["source_name"],
                genres=story_info.get("genres", []),
                status=story_info.get("status", "ongoing"),
            )
            story_id = story["id"]
            print(f"  ✅ Story upserted (ID: {story_id})")

            random_delay()

            # ─── Step 2: Scrape chapter list (with pagination) ─────
            print("\n📋 [Scrapling] Scraping chapter list...")
            
            # Programmatic chapter list generation for TruyenDich
            if parser.name == "truyendich":
                from bs4 import BeautifulSoup
                import re
                
                max_chapter = 50
                soup = BeautifulSoup(response.text, "lxml")
                
                buttons = soup.find_all("button")
                for btn in buttons:
                    text = parser.clean_text(btn.get_text())
                    match = re.search(r"(\d+)\s*-\s*(\d+)", text)
                    if match:
                        max_chapter = max(max_chapter, int(match.group(2)))
                
                # Check text matches
                string_targets = []
                try:
                    string_targets.extend(soup.find_all(string=re.compile(r"\d+\s*chương", re.IGNORECASE)))
                except:
                    pass
                for t in string_targets:
                    match = re.search(r"(\d+)\s*chương", str(t), re.IGNORECASE)
                    if match:
                        max_chapter = max(max_chapter, int(match.group(1)))
                
                if max_chapter == 50:
                    page_1_ch = parser.parse_chapter_list(response.text)
                    if page_1_ch:
                        max_chapter = max(ch["chapter_number"] for ch in page_1_ch)
                
                print(f"  ⚡ Programmatic list generation: latest chapter is {max_chapter}")
                all_chapters = []
                base_url = STORY_SOURCE_URL.rstrip('/')
                for ch_num in range(1, max_chapter + 1):
                    all_chapters.append({
                        "chapter_number": ch_num,
                        "title": f"Chương {ch_num}",
                        "source_url": f"{base_url}/chuong-{ch_num}"
                    })
                max_pages = 1
            else:
                first_page_url = parser.get_chapter_list_url(STORY_SOURCE_URL, page=1)
                first_page_resp = session.fetch(first_page_url)
                if first_page_resp.status != 200:
                    raise RuntimeError(f"Failed to fetch chapter list page 1: HTTP {first_page_resp.status}")

                all_chapters = parser.parse_chapter_list(first_page_resp.text)
                max_pages = parser.parse_max_pages(first_page_resp.text)
                
            print(f"  Found {len(all_chapters)} chapters (Total pages: {max_pages})")

            # Fetch remaining pages
            should_fetch_all = CHAPTER_LIMIT == 0
            page_num = 2
            while page_num <= max_pages:
                if not should_fetch_all:
                    target_range = set(range(CHAPTER_START, CHAPTER_START + CHAPTER_LIMIT))
                    found_nums = {ch["chapter_number"] for ch in all_chapters}
                    if target_range.issubset(found_nums):
                        break
                
                print(f"  📑 Fetching chapter list page {page_num}/{max_pages}...")
                random_delay()
                
                p_url = parser.get_chapter_list_url(STORY_SOURCE_URL, page=page_num)
                p_resp = session.fetch(p_url)
                if p_resp.status != 200:
                    print(f"  ⚠️ Failed to fetch page {page_num}: HTTP {p_resp.status}")
                    break
                
                p_chapters = parser.parse_chapter_list(p_resp.text)
                if not p_chapters:
                    print(f"  ⚠️ No chapters found on page {page_num}, stopping")
                    break
                
                existing_nums = {ch["chapter_number"] for ch in all_chapters}
                new_chapters = [ch for ch in p_chapters if ch["chapter_number"] not in existing_nums]
                
                if not new_chapters:
                    print(f"  ⚠️ No new chapters on page {page_num}, stopping")
                    break
                    
                all_chapters.extend(new_chapters)
                print(f"  Added {len(new_chapters)} new chapters (total: {len(all_chapters)})")
                page_num += 1

            # Update story total chapters count
            if story_id and all_chapters:
                try:
                    update_story_total_chapters(story_id, len(all_chapters))
                except Exception as e:
                    print(f"  ⚠️ Failed to update story total chapters: {e}")

            # Filter to requested range
            if CHAPTER_LIMIT == 0:
                target_chapters = [ch for ch in all_chapters if ch["chapter_number"] >= CHAPTER_START]
            else:
                target_chapters = [ch for ch in all_chapters if CHAPTER_START <= ch["chapter_number"] < CHAPTER_START + CHAPTER_LIMIT]
            
            print(f"  Targeting {len(target_chapters)} chapters (starting from {CHAPTER_START})")

            # Update scrape job's actual end chapter
            if JOB_ID and target_chapters:
                actual_end_ch = target_chapters[-1]["chapter_number"]
                try:
                    update_scrape_job(int(JOB_ID), chapter_end=actual_end_ch)
                except Exception as e:
                    print(f"  ⚠️ Failed to update scrape job chapter_end: {e}")

            random_delay()

            # ─── Step 3: Scrape each chapter ───────────────
            print("\n🔍 Checking R2 for existing chapters to optimize scraping...")
            existing_ch_nums = get_existing_chapters(story_info["slug"])
            print(f"  Found {len(existing_ch_nums)} chapters already in R2.")

            for i, ch_info in enumerate(target_chapters):
                ch_num = ch_info["chapter_number"]
                print(f"\n📖 [{i+1}/{len(target_chapters)}] Chapter {ch_num}: {ch_info['title']}")

                # Skip if already scraped
                if ch_num in existing_ch_nums:
                    print("  ⏭️ Already exists in R2, skipping")
                    chapters_scraped += 1
                    continue

                try:
                    ch_resp = session.fetch(ch_info["source_url"])
                    if ch_resp.status != 200:
                        raise RuntimeError(f"HTTP {ch_resp.status}")
                    
                    consecutive_failures = 0
                except Exception as e:
                    print(f"  ❌ Failed to fetch chapter {ch_num}: {e}")
                    consecutive_failures += 1
                    if consecutive_failures >= 5:
                        raise ScraperAbortException(
                            f"Aborting: {consecutive_failures} consecutive chapter failures detected."
                        )
                    continue

                content = parser.parse_chapter_content(ch_resp.text)
                if not content["paragraphs"]:
                    print("  ⚠️ No content found, skipping")
                    continue

                print(f"  📝 {len(content['paragraphs'])} paragraphs, {content['word_count']} words")

                # Upload to R2
                r2_url = upload_chapter(
                    story_slug=story_info["slug"],
                    chapter_number=ch_num,
                    title=content["title"] or ch_info["title"],
                    paragraphs=content["paragraphs"],
                    word_count=content["word_count"],
                )

                # Update Supabase
                upsert_chapter(
                    story_id=story_id,
                    chapter_number=ch_num,
                    title=content["title"] or ch_info["title"],
                    text_r2_url=r2_url,
                    word_count=content["word_count"],
                    source_url=ch_info["source_url"],
                    is_scraped=True,
                )

                chapters_scraped += 1

                # Update progress tracking for signals/aborts
                if scrape_progress["start"] is None:
                    scrape_progress["start"] = ch_num
                scrape_progress["end"] = ch_num
                scrape_progress["count"] = chapters_scraped

                # Update progress on every chapter
                update_story_scrape_progress(story_id, ch_num)
                if JOB_ID:
                    update_scrape_job(int(JOB_ID), chapters_scraped=chapters_scraped)

                random_delay()

            # Final progress update
            update_story_scrape_progress(story_id, target_chapters[-1]["chapter_number"] if target_chapters else 0)

        except ScraperAbortException as e:
            print(f"\n⚠️ Scraper aborted early: {e}")
            if JOB_ID:
                start = scrape_progress["start"]
                end = scrape_progress["end"]
                scraped_log = f"Scraped chapters from {start} to {end}" if start else "No chapters scraped"
                update_scrape_job(
                    int(JOB_ID),
                    status="completed",
                    error_message=f"Aborted: {e} | {scraped_log}",
                    chapters_scraped=chapters_scraped
                )
        except Exception as e:
            print(f"\n❌ Fatal error: {e}")
            traceback.print_exc()
            if JOB_ID:
                start = scrape_progress["start"]
                end = scrape_progress["end"]
                scraped_log = f"Scraped chapters from {start} to {end}" if start else "No chapters scraped"
                update_scrape_job(
                    int(JOB_ID),
                    status="failed",
                    error_message=f"Error: {e} | {scraped_log}",
                    chapters_scraped=chapters_scraped
                )
            raise

    # Mark job as completed
    if JOB_ID:
        start = scrape_progress["start"]
        end = scrape_progress["end"]
        scraped_log = f"Successfully scraped chapters from {start} to {end}" if start else "No newly scraped chapters."
        update_scrape_job(
            int(JOB_ID),
            status="completed",
            error_message=scraped_log,
            chapters_scraped=chapters_scraped
        )

    print(f"\n✅ Done! Scraped {chapters_scraped} chapters successfully.")


if __name__ == "__main__":
    run_scraper()
