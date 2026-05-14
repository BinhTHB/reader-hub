"""
Main Scraper — Orchestrates the scraping pipeline

Flow:
1. Parse env vars for target story URL and chapter range
2. Build a free proxy pool (or use PROXY_URL if provided)
3. Launch Playwright browser with stealth + proxy rotation
4. Scrape story info → upsert to Supabase
5. For each chapter: scrape content → upload to R2 → update Supabase
6. On proxy failure: rotate to next proxy and retry
"""

import asyncio
import os
import random
import sys
import traceback

from playwright.async_api import async_playwright, Browser, BrowserContext, Page
from playwright_stealth import stealth_async

from parsers import detect_parser
from proxy_rotator import build_proxy_pool, ProxyPool, ProxyInfo, get_playwright_proxy_config
from r2_uploader import upload_chapter, upload_cover, check_chapter_exists
from supabase_client import (
    upsert_story,
    upsert_chapter,
    update_story_scrape_progress,
    update_scrape_job,
)


# ─── Config ───────────────────────────────────────────────

STORY_SOURCE_URL = os.environ.get("STORY_SOURCE_URL", "")
CHAPTER_START = int(os.environ.get("CHAPTER_START", "1"))
CHAPTER_END = int(os.environ.get("CHAPTER_END", "10"))
PROXY_URL = os.environ.get("PROXY_URL", "")  # Optional paid proxy override
JOB_ID = os.environ.get("JOB_ID", "")
USE_FREE_PROXY = os.environ.get("USE_FREE_PROXY", "true").lower() == "true"

# Rate limiting
MIN_DELAY = float(os.environ.get("SCRAPE_MIN_DELAY", "2.0"))
MAX_DELAY = float(os.environ.get("SCRAPE_MAX_DELAY", "5.0"))

# Proxy pool (populated at runtime)
proxy_pool: ProxyPool | None = None
current_proxy: ProxyInfo | None = None


async def random_delay():
    """Sleep for a random duration to avoid detection."""
    delay = random.uniform(MIN_DELAY, MAX_DELAY)
    await asyncio.sleep(delay)


async def create_browser_context(playwright, proxy: ProxyInfo | None = None):
    """Create a new browser + context with optional proxy."""
    launch_args = {
        "headless": True,
        "args": [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-dev-shm-usage",
        ],
    }

    # Proxy priority: paid PROXY_URL > free proxy pool > no proxy
    if PROXY_URL:
        launch_args["proxy"] = {"server": PROXY_URL}
        print(f"🔄 Using paid proxy: {PROXY_URL[:30]}...")
    elif proxy:
        launch_args["proxy"] = get_playwright_proxy_config(proxy)
        print(f"🔄 Using free proxy: {proxy.url}")

    browser = await playwright.chromium.launch(**launch_args)
    context = await browser.new_context(
        viewport={"width": 1366, "height": 768},
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        locale="vi-VN",
    )
    page = await context.new_page()
    await stealth_async(page)
    return browser, context, page


async def rotate_proxy(playwright, browser: Browser) -> tuple[Browser, BrowserContext, Page]:
    """Close current browser and start a new one with a different proxy."""
    global current_proxy
    try:
        await browser.close()
    except Exception:
        pass

    if proxy_pool and proxy_pool.size > 0:
        # Remove failed proxy
        if current_proxy:
            current_proxy.fail_count += 1
            if current_proxy.fail_count >= 3:
                proxy_pool.remove(current_proxy)
                print(f"  🗑️ Removed bad proxy: {current_proxy.url} (pool: {proxy_pool.size})")

        current_proxy = proxy_pool.get_next()
        print(f"  🔄 Rotating to proxy: {current_proxy.url if current_proxy else 'direct'}")
    else:
        current_proxy = None
        print("  ⚠️ No proxies available, connecting directly")

    return await create_browser_context(playwright, current_proxy)


async def fetch_page(page: Page, url: str, retries: int = 3) -> str:
    """Navigate to URL and return HTML, with retries."""
    for attempt in range(retries):
        try:
            response = await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            if response and response.status == 200:
                return await page.content()
            elif response and response.status == 403:
                print(f"  ⚠️ 403 Forbidden on attempt {attempt + 1}, retrying...")
                await random_delay()
            else:
                print(f"  ⚠️ HTTP {response.status if response else 'None'} on attempt {attempt + 1}")
                await random_delay()
        except Exception as e:
            print(f"  ❌ Error on attempt {attempt + 1}: {e}")
            if attempt < retries - 1:
                await asyncio.sleep(5)

    raise RuntimeError(f"Failed to fetch {url} after {retries} attempts")


async def download_image(page: Page, img_url: str) -> bytes | None:
    """Download an image via the browser context."""
    try:
        response = await page.request.get(img_url)
        if response.ok:
            return await response.body()
    except Exception as e:
        print(f"  ⚠️ Failed to download image: {e}")
    return None


async def run_scraper():
    """Main scraping pipeline."""
    global proxy_pool, current_proxy

    if not STORY_SOURCE_URL:
        print("❌ No STORY_SOURCE_URL provided. Exiting.")
        sys.exit(1)

    parser = detect_parser(STORY_SOURCE_URL)
    print(f"📖 Using parser: {parser.name}")
    print(f"🔗 Source: {STORY_SOURCE_URL}")
    print(f"📄 Chapters: {CHAPTER_START} → {CHAPTER_END}")

    # Update job status
    if JOB_ID:
        update_scrape_job(int(JOB_ID), status="running")

    # ─── Build proxy pool ──────────────────────────────
    if not PROXY_URL and USE_FREE_PROXY:
        print("\n🌐 Building free proxy pool...")
        proxy_pool = await build_proxy_pool(max_proxies=20, test_concurrency=30)
        if proxy_pool.size == 0:
            print("  ⚠️ No working free proxies found, will connect directly")
            current_proxy = None
        else:
            current_proxy = proxy_pool.get_next()
    else:
        proxy_pool = None
        current_proxy = None

    chapters_scraped = 0
    max_proxy_rotations = 5  # Max times to rotate proxy per chapter

    async with async_playwright() as p:
        browser, context, page = await create_browser_context(p, current_proxy)

        try:
            # ─── Step 1: Scrape story info ─────────────────
            print("\n📚 Scraping story info...")
            html = await fetch_page(page, STORY_SOURCE_URL)
            story_info = parser.parse_story_info(html, STORY_SOURCE_URL)
            print(f"  Title: {story_info['title']}")
            print(f"  Author: {story_info.get('author', 'N/A')}")
            print(f"  Slug: {story_info['slug']}")

            # Upload cover image if available
            cover_url = None
            if story_info.get("cover_img_url"):
                print("  📷 Downloading cover image...")
                img_data = await download_image(page, story_info["cover_img_url"])
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

            await random_delay()

            # ─── Step 2: Scrape chapter list (with pagination) ─────
            print("\n📋 Scraping chapter list...")
            first_page_url = parser.get_chapter_list_url(STORY_SOURCE_URL, page=1)
            first_page_html = await fetch_page(page, first_page_url)
            
            all_chapters = parser.parse_chapter_list(first_page_html)
            max_pages = parser.parse_max_pages(first_page_html)
            print(f"  Found {len(all_chapters)} chapters on page 1 (Total pages: {max_pages})")

            # If we need more chapters and there are more pages, fetch them
            # We only fetch up to the page that likely contains CHAPTER_END
            # Assuming ~50 chapters per page as a heuristic, but we'll be safe
            current_max_ch = max([ch["chapter_number"] for ch in all_chapters]) if all_chapters else 0
            
            p = 2
            while p <= max_pages and current_max_ch < CHAPTER_END:
                print(f"  📑 Fetching chapter list page {p}/{max_pages}...")
                await random_delay()
                p_url = parser.get_chapter_list_url(STORY_SOURCE_URL, page=p)
                p_html = await fetch_page(page, p_url)
                p_chapters = parser.parse_chapter_list(p_html)
                
                if not p_chapters:
                    break
                    
                all_chapters.extend(p_chapters)
                current_max_ch = max([ch["chapter_number"] for ch in all_chapters])
                p += 1

            # Filter to requested range
            target_chapters = [
                ch for ch in all_chapters
                if CHAPTER_START <= ch["chapter_number"] <= CHAPTER_END
            ]
            print(f"  Targeting {len(target_chapters)} chapters ({CHAPTER_START}-{CHAPTER_END})")

            await random_delay()

            # ─── Step 3: Scrape each chapter ───────────────
            for i, ch_info in enumerate(target_chapters):
                ch_num = ch_info["chapter_number"]
                print(f"\n📖 [{i+1}/{len(target_chapters)}] Chapter {ch_num}: {ch_info['title']}")

                # Skip if already scraped
                if check_chapter_exists(story_info["slug"], ch_num):
                    print("  ⏭️ Already exists in R2, skipping")
                    chapters_scraped += 1
                    continue

                # Fetch chapter page with proxy rotation on failure
                ch_html = None
                for rotation in range(max_proxy_rotations):
                    try:
                        ch_html = await fetch_page(page, ch_info["source_url"])
                        break
                    except RuntimeError:
                        if proxy_pool and proxy_pool.size > 0:
                            print(f"  🔄 Proxy failed, rotating... ({rotation + 1}/{max_proxy_rotations})")
                            browser, context, page = await rotate_proxy(p, browser)
                        else:
                            raise

                if not ch_html:
                    print(f"  ❌ Failed to fetch chapter {ch_num} after all retries")
                    continue

                content = parser.parse_chapter_content(ch_html)

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

                # Update progress periodically
                if chapters_scraped % 5 == 0:
                    update_story_scrape_progress(story_id, ch_num)
                    if JOB_ID:
                        update_scrape_job(int(JOB_ID), chapters_scraped=chapters_scraped)

                # Rate limit
                await random_delay()

            # Final progress update
            update_story_scrape_progress(story_id, target_chapters[-1]["chapter_number"] if target_chapters else 0)

        except Exception as e:
            print(f"\n❌ Fatal error: {e}")
            traceback.print_exc()
            if JOB_ID:
                update_scrape_job(int(JOB_ID), status="failed", error_message=str(e), chapters_scraped=chapters_scraped)
            raise
        finally:
            await browser.close()

    # Mark job as completed
    if JOB_ID:
        update_scrape_job(int(JOB_ID), status="completed", chapters_scraped=chapters_scraped)

    print(f"\n✅ Done! Scraped {chapters_scraped} chapters successfully.")


if __name__ == "__main__":
    asyncio.run(run_scraper())
