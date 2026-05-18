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

import os
import sys
import asyncio
import random
import time
import argparse
import io
import traceback
from datetime import datetime
from dotenv import load_dotenv

# Fix Windows console encoding for emojis
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

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


# ─── Config & Arguments ──────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(description="Reader Hub Scraper")
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
USE_FREE_PROXY = os.environ.get("USE_FREE_PROXY", "false").lower() == "true" # Default to false for local stability

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
        viewport={"width": 1920, "height": 1080},
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        locale="vi-VN",
        timezone_id="Asia/Ho_Chi_Minh",
        extra_http_headers={
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept-Encoding": "gzip, deflate, br",
            "Cache-Control": "max-age=0",
            "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
        }
    )
    page = await context.new_page()
    await stealth_async(page)
    
    # Add extra stealth measures
    await page.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5]
        });
        Object.defineProperty(navigator, 'languages', {
            get: () => ['vi-VN', 'vi', 'en-US', 'en']
        });
    """)
    
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


async def fetch_page(page: Page, url: str, retries: int = 3, wait_for_selector: str | None = None) -> str:
    """Navigate to URL and return HTML, with retries."""
    clean_url = url.split('#')[0]
    for attempt in range(retries):
        try:
            # Increase timeout to 60s for GitHub Actions
            response = await page.goto(clean_url, wait_until="domcontentloaded", timeout=60000)
            
            if response and response.status == 200:
                # Give a small extra time for JS to render if needed
                await asyncio.sleep(random.uniform(2.0, 3.0))
                if wait_for_selector:
                    try:
                        await page.wait_for_selector(wait_for_selector, timeout=10000)
                    except Exception:
                        print(f"  ⚠️ Selector {wait_for_selector} not found, but continuing...")
                
                # Small extra sleep to let potential obfuscation scripts run
                await asyncio.sleep(random.uniform(1.0, 2.0))
                return await page.content()
            
            elif response and response.status == 403:
                print(f"  ⚠️ 403 Forbidden on attempt {attempt + 1}, retrying...")
                await asyncio.sleep(random.uniform(10, 15))
            elif response and response.status == 500:
                print(f"  ⚠️ 500 Internal Server Error on attempt {attempt + 1}, possible bot detection. Retrying...")
                await asyncio.sleep(15)
            else:
                print(f"  ⚠️ HTTP {response.status if response else 'None'} on attempt {attempt + 1}")
                await asyncio.sleep(random.uniform(5, 10))
        except Exception as e:
            print(f"  ❌ Error on attempt {attempt + 1}: {str(e)[:100]}")
            if attempt < retries - 1:
                print(f"  🔄 Retrying in 10-15 seconds...")
                await asyncio.sleep(random.uniform(10, 15))

    raise RuntimeError(f"Failed to fetch {clean_url} after {retries} attempts")


async def download_image(page: Page, img_url: str) -> bytes | None:
    """Download an image via the browser context."""
    try:
        response = await page.request.get(img_url)
        if response.ok:
            return await response.body()
    except Exception as e:
        print(f"  ⚠️ Failed to download image: {e}")
    return None


async def fetch_with_rotation(playwright, browser: Browser, page: Page, url: str, wait_for_selector: str | None = None, max_rotations: int = 5) -> tuple[str, Browser, Page]:
    """Fetch a page, rotating proxy if it fails."""
    global proxy_pool
    for rotation in range(max_rotations):
        try:
            html = await fetch_page(page, url, wait_for_selector=wait_for_selector)
            return html, browser, page
        except RuntimeError:
            if proxy_pool and proxy_pool.size > 0:
                print(f"  🔄 Proxy failed for {url}, rotating... ({rotation + 1}/{max_rotations})")
                browser, _, page = await rotate_proxy(playwright, browser)
            else:
                raise
    raise RuntimeError(f"Failed to fetch {url} after {max_rotations} proxy rotations")


async def run_scraper():
    """Main scraping pipeline."""
    global proxy_pool, current_proxy

    if not STORY_SOURCE_URL:
        print("❌ No STORY_SOURCE_URL provided. Exiting.")
        sys.exit(1)

    parser = detect_parser(STORY_SOURCE_URL)
    print(f"📖 Using parser: {parser.name}")
    print(f"🔗 Source: {STORY_SOURCE_URL}")
    print(f"📄 Chapters: {CHAPTER_START} (Limit: {CHAPTER_LIMIT if CHAPTER_LIMIT > 0 else 'All'})")

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
            html, browser, page = await fetch_with_rotation(p, browser, page, STORY_SOURCE_URL)
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
            first_page_html, browser, page = await fetch_with_rotation(p, browser, page, first_page_url)
            
            all_chapters = parser.parse_chapter_list(first_page_html)
            max_pages = parser.parse_max_pages(first_page_html)
            print(f"  Found {len(all_chapters)} chapters on page 1 (Total pages: {max_pages})")

            # Check if this is MeTruyenChu (JavaScript pagination)
            is_metruyenchu = parser.name == "metruyenchu"
            site_internal_id = None
            
            if is_metruyenchu and hasattr(parser, 'extract_story_id'):
                site_internal_id = parser.extract_story_id(first_page_html)
                print(f"  MeTruyenChu internal story ID: {site_internal_id}")

            # Fetch remaining pages
            # Fetch all pages only if limit is 0
            current_max_ch = max([ch["chapter_number"] for ch in all_chapters]) if all_chapters else 0
            should_fetch_all = CHAPTER_LIMIT == 0
            
            p = 2
            while p <= max_pages:
                # Stop early if we have enough chapters (unless fetching all)
                if not should_fetch_all and current_max_ch >= CHAPTER_START + CHAPTER_LIMIT:
                    break
                
                print(f"  📑 Fetching chapter list page {p}/{max_pages}...")
                await random_delay()
                
                if is_metruyenchu and site_internal_id:
                    # Use JavaScript to load next page
                    try:
                        await page.evaluate(f"page({site_internal_id}, {p})")
                        await page.wait_for_timeout(1000)  # Wait for content to load
                        p_html = await page.content()
                    except Exception as e:
                        print(f"  ⚠️ Failed to load page {p} via JavaScript: {e}")
                        break
                else:
                    # URL-based pagination (TruyenFull)
                    p_url = parser.get_chapter_list_url(STORY_SOURCE_URL, page=p)
                    p_html, browser, page = await fetch_with_rotation(playwright=p, browser=browser, page=page, url=p_url)
                
                p_chapters = parser.parse_chapter_list(p_html)
                
                if not p_chapters:
                    print(f"  ⚠️ No chapters found on page {p}, stopping")
                    break
                
                # Deduplicate chapters by chapter_number
                existing_nums = {ch["chapter_number"] for ch in all_chapters}
                new_chapters = [ch for ch in p_chapters if ch["chapter_number"] not in existing_nums]
                
                if not new_chapters:
                    print(f"  ⚠️ No new chapters on page {p}, stopping")
                    break
                    
                all_chapters.extend(new_chapters)
                current_max_ch = max([ch["chapter_number"] for ch in all_chapters])
                print(f"  Added {len(new_chapters)} new chapters (total: {len(all_chapters)})")
                p += 1

            # Filter to requested range
            # Filter to requested range
            if CHAPTER_LIMIT == 0:
                # Scrape all chapters from CHAPTER_START onwards
                target_chapters = [
                    ch for ch in all_chapters
                    if ch["chapter_number"] >= CHAPTER_START
                ]
                print(f"  Targeting {len(target_chapters)} chapters (from {CHAPTER_START} to end)")
            else:
                # Scrape limited number of chapters
                target_chapters = [
                    ch for ch in all_chapters
                    if CHAPTER_START <= ch["chapter_number"] < CHAPTER_START + CHAPTER_LIMIT
                ]
                print(f"  Targeting {len(target_chapters)} chapters (starting from {CHAPTER_START}, limit {CHAPTER_LIMIT})")

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
                # Define selector to wait for based on site
                content_selector = ".truyen, .chapter-c, #chapter-c, .content, #article, .prose-novel, #original-content-tab"
                
                try:
                    ch_html, browser, page = await fetch_with_rotation(
                        p, browser, page, ch_info["source_url"], 
                        wait_for_selector=content_selector,
                        max_rotations=max_proxy_rotations
                    )
                except RuntimeError as e:
                    print(f"  ❌ Failed to fetch chapter {ch_num} after all retries: {e}")
                    continue

                if not ch_html:
                    print(f"  ❌ Failed to fetch chapter {ch_num} after all retries (no HTML)")
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
