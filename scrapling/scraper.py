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
import re
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

from scrapling import PlayWrightFetcher

# Monkeypatch js_bypass_path in scrapling to load from our local repository's bypasses folder
import scrapling.engines.pw
import scrapling.engines.toolbelt.navigation

def custom_js_bypass_path(filename):
    repo_bypasses_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bypasses')
    return os.path.join(repo_bypasses_dir, filename)

scrapling.engines.pw.js_bypass_path = custom_js_bypass_path
scrapling.engines.toolbelt.navigation.js_bypass_path = custom_js_bypass_path

# Monkeypatch PlaywrightEngine.fetch to disable chromium_sandbox and handle active navigation errors
import scrapling.engines.pw as _pw_module

def _fetch_no_sandbox(self, url):
    """Patched fetch that disables chromium sandbox and handles active navigation errors robustly."""
    if not self.stealth:
        from playwright.sync_api import sync_playwright
    else:
        from rebrowser_playwright.sync_api import sync_playwright

    from scrapling.engines.constants import DEFAULT_STEALTH_FLAGS
    from scrapling.engines.toolbelt import (
        Response, intercept_route, generate_headers,
        construct_cdp_url, generate_convincing_referer,
    )

    with sync_playwright() as p:
        if self.useragent:
            extra_headers = {}
            useragent = self.useragent
        else:
            extra_headers = generate_headers(browser_mode=True)
            useragent = extra_headers.get('User-Agent')

        flags = DEFAULT_STEALTH_FLAGS
        if self.hide_canvas:
            flags += ['--fingerprinting-canvas-image-data-noise']
        if self.disable_webgl:
            flags += ['--disable-webgl', '--disable-webgl-image-chromium', '--disable-webgl2']

        if self.cdp_url:
            cdp_url = self._cdp_url_logic(flags if self.stealth else None)
            browser = p.chromium.connect_over_cdp(endpoint_url=cdp_url)
        else:
            if self.stealth:
                browser = p.chromium.launch(headless=self.headless, args=flags, ignore_default_args=['--enable-automation'], chromium_sandbox=False)
            else:
                browser = p.chromium.launch(headless=self.headless, ignore_default_args=['--enable-automation'])

        if self.stealth:
            context = browser.new_context(
                locale='en-US', is_mobile=False, has_touch=False,
                proxy=self.proxy, color_scheme='dark', user_agent=useragent,
                device_scale_factor=2, service_workers="allow",
                ignore_https_errors=True, extra_http_headers=extra_headers,
                screen={"width": 1920, "height": 1080},
                viewport={"width": 1920, "height": 1080},
                permissions=["geolocation", 'notifications'],
            )
        else:
            context = browser.new_context(
                color_scheme='dark', user_agent=useragent,
                device_scale_factor=2, extra_http_headers=extra_headers
            )

        page = context.new_page()
        page.set_default_navigation_timeout(self.timeout)
        page.set_default_timeout(self.timeout)

        if self.extra_headers:
            page.set_extra_http_headers(self.extra_headers)
        if self.disable_resources:
            page.route("**/*", intercept_route)

        if self.stealth:
            _js_path = custom_js_bypass_path
            page.add_init_script(path=_js_path('webdriver_fully.js'))
            page.add_init_script(path=_js_path('window_chrome.js'))
            page.add_init_script(path=_js_path('navigator_plugins.js'))
            page.add_init_script(path=_js_path('pdf_viewer.js'))
            page.add_init_script(path=_js_path('notification_permission.js'))
            page.add_init_script(path=_js_path('screen_props.js'))
            page.add_init_script(path=_js_path('playwright_fingerprint.js'))

        res = page.goto(url, referer=generate_convincing_referer(url) if self.google_search else None)
        try:
            page.wait_for_load_state(state="load", timeout=15000)
        except Exception:
            pass
        page.wait_for_load_state(state="domcontentloaded")
        if self.network_idle:
            page.wait_for_load_state('networkidle')

        page = self.page_action(page)

        if self.wait_selector and type(self.wait_selector) is str:
            waiter = page.locator(self.wait_selector)
            waiter.wait_for(state=self.wait_selector_state)

        content_type = res.headers.get('content-type', '')
        encoding = 'utf-8'
        if 'charset=' in content_type.lower():
            encoding = content_type.lower().split('charset=')[-1].split(';')[0].strip()

        # Robust text content retrieval to handle ongoing navigations / page transitions
        page_content = ""
        for attempt in range(5):
            try:
                page_content = page.content()
                break
            except Exception as e:
                if "navigating" in str(e).lower() or "navigation" in str(e).lower():
                    import time
                    time.sleep(1)
                    try:
                        page.wait_for_load_state(state="load", timeout=5000)
                    except Exception:
                        pass
                else:
                    raise e
        else:
            try:
                page_content = page.evaluate("() => document.documentElement.outerHTML")
            except Exception:
                page_content = page.content() # Fallback to raise if it fails too

        # Robust binary response body retrieval
        res_body = b""
        try:
            res_body = res.body()
        except Exception:
            # Fallback to encoded page text if response body is detached
            res_body = page_content.encode(encoding, errors='replace')

        response = Response(
            url=page.url if page else res.url, text=page_content, content=res_body,
            status=res.status, reason=res.status_text, encoding=encoding,
            cookies={cookie['name']: cookie['value'] for cookie in page.context.cookies()},
            headers=res.all_headers(), request_headers=res.request.all_headers(),
            adaptor_arguments=self.adaptor_arguments
        )
        page.close()
    return response

_pw_module.PlaywrightEngine.fetch = _fetch_no_sandbox



class StealthySession:
    """Wrapper around a persistent Playwright browser context to act as a session manager."""
    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.playwright = None
        self.browser = None
        self.context = None

    def __enter__(self):
        if self.kwargs.get("stealth", True):
            from rebrowser_playwright.sync_api import sync_playwright
        else:
            from playwright.sync_api import sync_playwright

        self.playwright = sync_playwright().start()

        from scrapling.engines.constants import DEFAULT_STEALTH_FLAGS
        flags = list(DEFAULT_STEALTH_FLAGS)
        if self.kwargs.get("hide_canvas", True):
            flags += ['--fingerprinting-canvas-image-data-noise']
        if self.kwargs.get("disable_webgl", False):
            flags += ['--disable-webgl', '--disable-webgl-image-chromium', '--disable-webgl2']

        self.browser = self.playwright.chromium.launch(
            headless=self.kwargs.get("headless", True),
            args=flags,
            ignore_default_args=['--enable-automation'],
            chromium_sandbox=False
        )

        from scrapling.engines.toolbelt import generate_headers
        extra_headers = generate_headers(browser_mode=True)
        useragent = extra_headers.get('User-Agent')

        # Convert proxy if it's a string
        proxy_config = None
        raw_proxy = self.kwargs.get("proxy")
        if raw_proxy:
            if isinstance(raw_proxy, dict):
                proxy_config = raw_proxy
            else:
                proxy_config = {"server": raw_proxy}

        self.context = self.browser.new_context(
            locale='en-US', is_mobile=False, has_touch=False,
            proxy=proxy_config, color_scheme='dark', user_agent=useragent,
            device_scale_factor=2, service_workers="allow",
            ignore_https_errors=True, extra_http_headers=extra_headers,
            screen={"width": 1920, "height": 1080},
            viewport={"width": 1920, "height": 1080},
            permissions=["geolocation", 'notifications'],
        )
        return self

    def rotate_proxy(self, new_proxy_url: str | None):
        """Close current browser/context and launch a new one with a different proxy."""
        print(f"  🔄 Recreating browser session with proxy: {new_proxy_url if new_proxy_url else 'direct'}")
        
        # Close old resources
        if self.context:
            try:
                self.context.close()
            except Exception:
                pass
        if self.browser:
            try:
                self.browser.close()
            except Exception:
                pass

        self.kwargs["proxy"] = new_proxy_url

        from scrapling.engines.constants import DEFAULT_STEALTH_FLAGS
        flags = list(DEFAULT_STEALTH_FLAGS)
        if self.kwargs.get("hide_canvas", True):
            flags += ['--fingerprinting-canvas-image-data-noise']
        if self.kwargs.get("disable_webgl", False):
            flags += ['--disable-webgl', '--disable-webgl-image-chromium', '--disable-webgl2']

        launch_args = {
            "headless": self.kwargs.get("headless", True),
            "args": flags,
            "ignore_default_args": ['--enable-automation'],
            "chromium_sandbox": False
        }

        proxy_config = None
        if new_proxy_url:
            proxy_config = {"server": new_proxy_url}
            launch_args["proxy"] = proxy_config

        self.browser = self.playwright.chromium.launch(**launch_args)

        from scrapling.engines.toolbelt import generate_headers
        extra_headers = generate_headers(browser_mode=True)
        useragent = extra_headers.get('User-Agent')

        self.context = self.browser.new_context(
            locale='en-US', is_mobile=False, has_touch=False,
            proxy=proxy_config, color_scheme='dark', user_agent=useragent,
            device_scale_factor=2, service_workers="allow",
            ignore_https_errors=True, extra_http_headers=extra_headers,
            screen={"width": 1920, "height": 1080},
            viewport={"width": 1920, "height": 1080},
            permissions=["geolocation", 'notifications'],
        )

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.context:
            self.context.close()
        if self.browser:
            self.browser.close()
        if self.playwright:
            self.playwright.stop()

    def fetch(self, url: str):
        if not self.context:
            fetcher = PlayWrightFetcher()
            return fetcher.fetch(
                url,
                headless=self.kwargs.get("headless", True),
                disable_resources=self.kwargs.get("disable_resources", True),
                proxy=self.kwargs.get("proxy"),
                stealth=True
            )

        from scrapling.engines.toolbelt import (
            Response, intercept_route, generate_convincing_referer,
        )

        page = self.context.new_page()
        timeout_val = 20000 if USE_FREE_PROXY else 45000
        page.set_default_navigation_timeout(timeout_val)
        page.set_default_timeout(timeout_val)

        if self.kwargs.get("disable_resources", True):
            page.route("**/*", intercept_route)

        if self.kwargs.get("stealth", True):
            _js_path = custom_js_bypass_path
            page.add_init_script(path=_js_path('webdriver_fully.js'))
            page.add_init_script(path=_js_path('window_chrome.js'))
            page.add_init_script(path=_js_path('navigator_plugins.js'))
            page.add_init_script(path=_js_path('pdf_viewer.js'))
            page.add_init_script(path=_js_path('notification_permission.js'))
            page.add_init_script(path=_js_path('screen_props.js'))
            page.add_init_script(path=_js_path('playwright_fingerprint.js'))

        res = page.goto(url, referer=generate_convincing_referer(url))
        try:
            page.wait_for_load_state(state="load", timeout=15000)
        except Exception:
            pass
        page.wait_for_load_state(state="domcontentloaded")

        content_type = res.headers.get('content-type', '') if res else ''
        encoding = 'utf-8'
        if 'charset=' in content_type.lower():
            encoding = content_type.lower().split('charset=')[-1].split(';')[0].strip()

        # Robust text content retrieval
        page_content = ""
        for attempt in range(5):
            try:
                page_content = page.content()
                break
            except Exception as e:
                if "navigating" in str(e).lower() or "navigation" in str(e).lower():
                    time.sleep(1)
                    try:
                        page.wait_for_load_state(state="load", timeout=5000)
                    except Exception:
                        pass
                else:
                    raise e
        else:
            try:
                page_content = page.evaluate("() => document.documentElement.outerHTML")
            except Exception:
                page_content = page.content()

        res_body = b""
        if res:
            try:
                res_body = res.body()
            except Exception:
                res_body = page_content.encode(encoding, errors='replace')

        response = Response(
            url=page.url if page else (res.url if res else url), text=page_content, content=res_body,
            status=res.status if res else 200, reason=res.status_text if res else '', encoding=encoding,
            cookies={cookie['name']: cookie['value'] for cookie in page.context.cookies()},
            headers=res.all_headers() if res else {}, request_headers=res.request.all_headers() if res and res.request else {},
            adaptor_arguments={}
        )
        page.close()
        return response


from parsers import detect_parser
from r2_uploader import upload_chapter, upload_cover, get_existing_chapters, get_chapter_metadata
from supabase_client import (
    upsert_story,
    upsert_chapter,
    update_story_scrape_progress,
    update_story_total_chapters,
    update_scrape_job,
    get_story_chapters_index,
)
from proxy_rotator import build_proxy_pool, ProxyPool, ProxyInfo


# ─── Config & Arguments ──────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(description="Reader Hub Scraper (Scrapling)")
    parser.add_argument("--url", type=str, help="Story source URL to scrape")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of chapters to scrape (0 for all)")
    parser.add_argument("--start", type=int, default=None, help="Chapter number to start from")
    parser.add_argument("--job-id", type=str, help="Scrape job ID for tracking")
    parser.add_argument("--force", action="store_true", help="Re-scrape and overwrite chapters even when they already exist in R2")
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
FORCE_RESCRAPE = args.force or os.environ.get("FORCE_RESCRAPE", "").lower() in {"1", "true", "yes"}
USE_FREE_PROXY = os.environ.get("USE_FREE_PROXY", "false").lower() == "true"

# Rate limiting
MIN_DELAY = float(os.environ.get("SCRAPE_MIN_DELAY", "2.0"))
MAX_DELAY = float(os.environ.get("SCRAPE_MAX_DELAY", "5.0"))

# Proxy pool (populated at runtime)
proxy_pool: ProxyPool | None = None
current_proxy: ProxyInfo | None = None

# Global state to track progress for signal handlers and early aborts
scrape_progress = {
    "start": None,
    "end": None,
    "count": 0
}


class ScraperAbortException(Exception):
    """Custom exception raised when the scraper is aborted early."""
    pass


def fetch_with_rotation_wrapper(session: StealthySession, action_fn, max_rotations: int = 10):
    """Executes action_fn(session). If it raises an exception, rotates proxy and retries."""
    global proxy_pool, current_proxy
    
    for rotation in range(max_rotations):
        try:
            return action_fn(session)
        except Exception as e:
            if (PROXY_URL or (proxy_pool and proxy_pool.size > 0)) and rotation < max_rotations - 1:
                print(f"  ❌ Action failed: {e}")
                print(f"  🔄 Rotating proxy and retrying... ({rotation + 1}/{max_rotations})")
                
                # If we are using a free proxy pool, mark the current proxy as failed
                if proxy_pool and current_proxy:
                    current_proxy.fail_count += 1
                    if current_proxy.fail_count >= 3:
                        proxy_pool.remove(current_proxy)
                        print(f"  🗑️ Removed bad proxy: {current_proxy.url} (pool: {proxy_pool.size})")
                
                # Get next proxy and rotate session
                if proxy_pool:
                    current_proxy = proxy_pool.get_next()
                    new_proxy_url = current_proxy.url if current_proxy else None
                else:
                    new_proxy_url = PROXY_URL
                
                session.rotate_proxy(new_proxy_url)
                time.sleep(2)
            else:
                raise e
    raise RuntimeError(f"Action failed after {max_rotations} proxy rotations")


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


def chapter_source_key(chapter: dict, parser) -> str:
    """Return a stable chapter identity key, falling back to source_url for older parsers."""
    key = chapter.get("source_key")
    if key:
        return key
    source_url = chapter.get("source_url", "")
    if hasattr(parser, "canonical_source_key"):
        return parser.canonical_source_key(source_url)
    return source_url.split('#')[0].split('?')[0].rstrip('/').lower()


def normalize_misnumbered_chapters(chapters: list[dict], parser) -> list[dict]:
    """Repair inconsistent MeTruyenChu chapter lists before storage.

    MeTruyenChu exposes chapter URLs with hash suffixes. Some stories have light
    source-number mistakes (a few duplicate or missing numbers); those must keep
    every unique URL, so they are renumbered sequentially. Other stories expose
    many alternate/broken hashes for the same chapter number; those must be
    collapsed to one best entry per chapter number to avoid duplicate titles and
    inflated totals.
    """
    if getattr(parser, "name", "") != "metruyenchu" or not chapters:
        return chapters

    nums = [ch.get("chapter_number") for ch in chapters]
    numeric_nums = [num for num in nums if num is not None]
    if not numeric_nums:
        return chapters

    unique_nums = set(numeric_nums)
    original_unique = len(unique_nums)
    duplicates = sorted({num for num in numeric_nums if numeric_nums.count(num) > 1})
    expected_by_count = list(range(1, len(numeric_nums) + 1))
    clean_by_count = len(numeric_nums) == len(chapters) and numeric_nums == expected_by_count
    if clean_by_count:
        return chapters

    duplicate_ratio = len(numeric_nums) / max(original_unique, 1)
    severe_duplicate_list = duplicate_ratio >= 1.2 and len(duplicates) >= 20

    if severe_duplicate_list:
        print(
            "  ⚠️ MeTruyenChu chapter list has many alternate chapter hashes; "
            f"deduplicating by chapter number ({len(chapters)} URLs, "
            f"{original_unique} unique source numbers)."
        )
        print(f"  ⚠️ Duplicate source numbers: {duplicates[:30]}{'...' if len(duplicates) > 30 else ''}")

        def title_quality(chapter: dict) -> tuple:
            title = (chapter.get("title") or "").strip()
            num = chapter.get("chapter_number")
            generic_title = bool(re.fullmatch(r"(?i)chương\s+\d+\s*:?,?", title))
            nested_number = bool(re.search(r"(?i)chương\s+\d+\s+\d+\s*:", title))
            starts_bad = title.startswith((",", ":", "-"))
            return (
                0 if title else 1,
                1 if generic_title else 0,
                1 if nested_number else 0,
                1 if starts_bad else 0,
                len(title) if generic_title else 0,
                chapter.get("api_page", 0),
                chapter.get("sequence_index", 0),
                num or 0,
            )

        best_by_num: dict[int, dict] = {}
        for chapter in chapters:
            num = chapter.get("chapter_number")
            if num is None:
                continue
            current = best_by_num.get(num)
            if current is None or title_quality(chapter) < title_quality(current):
                best_by_num[num] = chapter

        normalized = []
        for scrape_number, source_num in enumerate(sorted(best_by_num), start=1):
            chapter = best_by_num[source_num]
            item = dict(chapter)
            item["source_chapter_number"] = source_num
            item["chapter_number"] = scrape_number
            item["sequence_index"] = scrape_number
            normalized.append(item)
        return normalized

    expected = list(range(1, len(numeric_nums) + 1))
    missing = sorted(set(expected) - unique_nums)
    print(
        "  ⚠️ MeTruyenChu chapter list has inconsistent numbering; "
        f"normalizing storage numbers by list order ({len(chapters)} chapters, "
        f"{original_unique} unique source numbers)."
    )
    if missing:
        print(f"  ⚠️ Missing source numbers: {missing[:30]}{'...' if len(missing) > 30 else ''}")
    if duplicates:
        print(f"  ⚠️ Duplicate source numbers: {duplicates[:30]}{'...' if len(duplicates) > 30 else ''}")

    normalized = []
    ordered = sorted(chapters, key=lambda x: (
        x.get("source_chapter_number") if x.get("source_chapter_number") is not None
        else x.get("chapter_number") if x.get("chapter_number") is not None
        else float("inf"),
        x.get("sequence_index", 0),
    ))
    for scrape_number, chapter in enumerate(ordered, start=1):
        item = dict(chapter)
        item["source_chapter_number"] = chapter.get("chapter_number")
        item["chapter_number"] = scrape_number
        item["sequence_index"] = scrape_number
        normalized.append(item)
    return normalized


def normalize_title_for_compare(title: str | None) -> str:
    """Normalize titles enough to detect stale or wrong R2 chapter JSON."""
    if not title:
        return ""
    title = re.sub(r"(?i)^chương\s+\d+\s*[:\-]?\s*", "", title.strip())
    title = re.sub(r"\s+", " ", title)
    return title.strip(" ,:-").casefold()


def existing_chapter_matches(ch_info: dict, existing_meta: dict | None) -> bool:
    """Return true when an existing R2 chapter looks like the expected chapter."""
    if not existing_meta:
        return False

    # 1. Compare by source_url if both are available
    expected_url = ch_info.get("source_url")
    existing_url = existing_meta.get("source_url")
    if expected_url and existing_url:
        def clean_url(u: str) -> str:
            u = re.sub(r"^https?://(www\.)?", "", u.strip().lower())
            return u.rstrip("/")
        if clean_url(expected_url) == clean_url(existing_url):
            return True
        else:
            return False

    # 2. Compare source chapter number if available
    expected_src_num = ch_info.get("source_chapter_number")
    existing_src_num = existing_meta.get("source_chapter_number")
    if expected_src_num is not None and existing_src_num is not None:
        if expected_src_num != existing_src_num:
            return False

    # 3. Title match checks
    expected_raw = (ch_info.get("title") or "").strip().casefold()
    existing_raw = (existing_meta.get("title") or "").strip().casefold()
    
    raw_titles_match = expected_raw and expected_raw == existing_raw

    expected_title = normalize_title_for_compare(ch_info.get("title"))
    existing_title = normalize_title_for_compare(existing_meta.get("title"))

    title_is_match = False
    if raw_titles_match:
        title_is_match = True
    elif expected_title and existing_title and len(expected_title) >= 2 and len(existing_title) >= 2:
        title_is_match = (expected_title == existing_title)

    if not title_is_match:
        return False

    expected_word_count = ch_info.get("word_count")
    existing_word_count = existing_meta.get("word_count")
    if expected_word_count is not None:
        return existing_word_count == expected_word_count

    return bool(existing_word_count)


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
    global proxy_pool, current_proxy

    if not STORY_SOURCE_URL:
        print("❌ No STORY_SOURCE_URL provided. Exiting.")
        sys.exit(1)

    parser = detect_parser(STORY_SOURCE_URL)
    print(f"📖 [Scrapling] Using parser: {parser.name}")
    print(f"🔗 [Scrapling] Source: {STORY_SOURCE_URL}")
    print(f"📄 [Scrapling] Chapters: {CHAPTER_START} (Limit: {CHAPTER_LIMIT if CHAPTER_LIMIT > 0 else 'All'})")
    if FORCE_RESCRAPE:
        print("♻️ [Scrapling] Force re-scrape enabled: existing R2 chapters will be overwritten")

    # Update job status
    if JOB_ID:
        update_scrape_job(int(JOB_ID), status="running")

    # ─── Build proxy pool ──────────────────────────────
    if not PROXY_URL and USE_FREE_PROXY:
        print("\n🌐 [Scrapling] Building free proxy pool...")
        from urllib.parse import urlparse
        parsed_url = urlparse(STORY_SOURCE_URL)
        test_target_url = f"{parsed_url.scheme}://{parsed_url.netloc}"
        print(f"  🎯 Testing proxy connectivity against target: {test_target_url}")
        
        import asyncio
        proxy_pool = asyncio.run(build_proxy_pool(max_proxies=200, test_concurrency=150, test_url=test_target_url))
        
        if proxy_pool.size == 0:
            print("  ⚠️ No working proxies found for the target site. Falling back to general proxy testing...")
            proxy_pool = asyncio.run(build_proxy_pool(max_proxies=200, test_concurrency=150, test_url="https://httpbin.org/ip"))
            
        if proxy_pool.size == 0:
            print("  ⚠️ No working free proxies found, will connect directly")
            current_proxy = None
        else:
            current_proxy = proxy_pool.get_next()
    else:
        proxy_pool = None
        current_proxy = None

    # Configure session proxy
    session_kwargs = {
        "headless": True,
        "solve_cloudflare": True,
        "disable_resources": True,  # Block images/fonts/media
        "ad_block": True            # Block track/ads domains
    }

    if PROXY_URL:
        session_kwargs["proxy"] = PROXY_URL
        print(f"🔄 [Scrapling] Configured paid proxy: {PROXY_URL[:35]}...")
    elif current_proxy:
        session_kwargs["proxy"] = current_proxy.url
        print(f"🔄 [Scrapling] Configured free proxy: {current_proxy.url}")

    chapters_scraped = 0
    consecutive_failures = 0

    # Start Scrapling session
    with StealthySession(**session_kwargs) as session:
        try:
            # ─── Step 1: Scrape story info ─────────────────
            print("\n📚 [Scrapling] Scraping story info...")
            
            def get_story_info(sess):
                resp = sess.fetch(STORY_SOURCE_URL)
                if resp.status != 200:
                    raise RuntimeError(f"HTTP {resp.status}")
                info = parser.parse_story_info(resp.body, STORY_SOURCE_URL)
                if not info or not info.get("title"):
                    raise RuntimeError("Failed to parse story info or title is empty")
                return resp, info

            response, story_info = fetch_with_rotation_wrapper(session, get_story_info)
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
            if JOB_ID:
                update_scrape_job(int(JOB_ID), story_id=story_id)

            random_delay()

            # ─── Step 2: Scrape chapter list (with pagination) ─────
            print("\n📋 [Scrapling] Scraping chapter list...")
            
            # Programmatic chapter list generation for TruyenDich
            if parser.name == "truyendich":
                from bs4 import BeautifulSoup
                import re
                import json
                
                max_chapter = 50
                slug = parser.extract_slug(story_info.get("source_url", STORY_SOURCE_URL))
                
                # 1. Try reading total from API /api/novels/{slug}/chapters
                try:
                    list_api_url = parser.get_chapter_list_api_url(story_info.get("source_url", STORY_SOURCE_URL), size=50)
                    list_resp = session.fetch(list_api_url)
                    if list_resp.status == 200:
                        list_data = json.loads(list_resp.body.strip())
                        total = list_data.get("total", 0)
                        if total and total > 0:
                            max_chapter = max(max_chapter, int(total))
                except Exception:
                    pass

                # 2. Extract from Next.js payload or HTML buttons
                soup = BeautifulSoup(response.body, "lxml")
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
                    page_1_ch = parser.parse_chapter_list(response.body)
                    if page_1_ch:
                        max_chapter = max(ch["chapter_number"] for ch in page_1_ch)
                
                print(f"  ⚡ Programmatic list generation: latest chapter is {max_chapter}")
                all_chapters = []
                base_url = story_info.get("source_url", STORY_SOURCE_URL).rstrip('/')
                for ch_num in range(1, max_chapter + 1):
                    all_chapters.append({
                        "chapter_number": ch_num,
                        "title": f"Chương {ch_num}",
                        "source_url": f"{base_url}/chuong-{ch_num}"
                    })
                max_pages = 1
            else:
                first_page_url = parser.get_chapter_list_url(STORY_SOURCE_URL, page=1)
                
                def get_first_page(sess):
                    resp = sess.fetch(first_page_url)
                    if resp.status != 200:
                        raise RuntimeError(f"HTTP {resp.status}")
                    ch_list = parser.parse_chapter_list(resp.body)
                    max_p = parser.parse_max_pages(resp.body)
                    return ch_list, max_p, resp

                all_chapters, max_pages, first_page_resp = fetch_with_rotation_wrapper(session, get_first_page)
                
            print(f"  Found {len(all_chapters)} chapters (Total pages: {max_pages})")

            # For MeTruyenChu: supplement HTML page 1 with API data
            # HTML may have afterword chapters (999-1001) that API doesn't;
            # API has cleaner pagination for the bulk of chapters
            if parser.name == "metruyenchu" and max_pages > 1:
                if not hasattr(parser, '_story_id') or not parser._story_id:
                    if hasattr(parser, 'extract_story_id'):
                        first_page_for_id = first_page_resp.body if hasattr(first_page_resp, 'body') else ''
                        first_page_for_id = first_page_for_id or ''
                        parser.extract_story_id(first_page_for_id)
                sid = getattr(parser, '_story_id', None) or ''
                if sid:
                    api_url_1 = f"https://metruyenchuvn.com/get/listchap/{sid}?page=1"
                    try:
                        def get_api_page_1(sess):
                            p_resp = sess.fetch(api_url_1)
                            if p_resp.status != 200:
                                raise RuntimeError(f"HTTP {p_resp.status}")
                            body = parser.extract_html_from_api_response(p_resp.body)
                            p_chapters = parser.parse_chapter_list(body)
                            return p_chapters
                        api_chapters = fetch_with_rotation_wrapper(session, get_api_page_1)
                        if api_chapters:
                            if CHAPTER_LIMIT == 0:
                                all_chapters = api_chapters
                                print(f"  Using API page 1 as canonical list ({len(all_chapters)} chapters)")
                            else:
                                existing_keys = {chapter_source_key(ch, parser) for ch in all_chapters}
                                new_from_api = [ch for ch in api_chapters if chapter_source_key(ch, parser) not in existing_keys]
                                if new_from_api:
                                    all_chapters.extend(new_from_api)
                                    print(f"  Supplemented {len(new_from_api)} chapters from API (total: {len(all_chapters)})")
                                else:
                                    print(f"  API page 1 verified {len(api_chapters)} chapters (no new additions)")
                    except Exception as e:
                        print(f"  Could not fetch API page 1: {e}")

            # Fetch remaining pages
            should_fetch_all = CHAPTER_LIMIT == 0
            page_num = 2
            while page_num <= max_pages:
                if not should_fetch_all:
                    target_range = set(range(CHAPTER_START, CHAPTER_START + CHAPTER_LIMIT))
                    found_nums = {ch["chapter_number"] for ch in all_chapters if ch["chapter_number"] is not None}
                    if target_range.issubset(found_nums):
                        break
                
                print(f"  📑 Fetching chapter list page {page_num}/{max_pages}...")
                random_delay()
                
                # MeTruyenChu uses JavaScript pagination API
                if parser.name == "metruyenchu":
                    # Extract story_id from first page if not already cached
                    if not hasattr(parser, '_story_id') or not parser._story_id:
                        if hasattr(parser, 'extract_story_id'):
                            first_page_for_id = first_page_resp.body if hasattr(first_page_resp, 'body') else ''
                            first_page_for_id = first_page_for_id or ''
                            parser.extract_story_id(first_page_for_id)
                    
                    sid = getattr(parser, '_story_id', None) or ''
                    if sid:
                        p_url = f"https://metruyenchuvn.com/get/listchap/{sid}?page={page_num}"
                    else:
                        p_url = parser.get_chapter_list_url(STORY_SOURCE_URL, page=page_num)
                else:
                    p_url = parser.get_chapter_list_url(STORY_SOURCE_URL, page=page_num)
                
                def get_page_chapters(sess):
                    p_resp = sess.fetch(p_url)
                    if p_resp.status != 200:
                        raise RuntimeError(f"HTTP {p_resp.status}")
                    
                    # For MeTruyenChu API, extract HTML from JSON response
                    if parser.name == "metruyenchu":
                        body = parser.extract_html_from_api_response(p_resp.body)
                    else:
                        body = p_resp.body
                    
                    p_chapters = parser.parse_chapter_list(body)
                    if not p_chapters:
                        raise RuntimeError(f"No chapters found on page {page_num}")
                    return p_chapters

                try:
                    p_chapters = fetch_with_rotation_wrapper(session, get_page_chapters)
                except Exception as e:
                    print(f"  ⚠️ Failed to fetch page {page_num}: {e}")
                    break
                
                existing_keys = {chapter_source_key(ch, parser) for ch in all_chapters}
                new_chapters = [ch for ch in p_chapters if chapter_source_key(ch, parser) not in existing_keys]
                
                if not new_chapters:
                    print(f"  ⚠️ No new chapters on page {page_num}, stopping")
                    break
                    
                all_chapters.extend(new_chapters)
                print(f"  Added {len(new_chapters)} new chapters (total: {len(all_chapters)})")
                page_num += 1

            if CHAPTER_LIMIT == 0:
                all_chapters = normalize_misnumbered_chapters(all_chapters, parser)

            # Update story total chapters count
            if story_id and all_chapters:
                try:
                    update_story_total_chapters(story_id, len(all_chapters))
                except Exception as e:
                    print(f"  ⚠️ Failed to update story total chapters: {e}")

            # Filter to requested range
            if CHAPTER_LIMIT == 0:
                target_chapters = [ch for ch in all_chapters if ch["chapter_number"] is not None and ch["chapter_number"] >= CHAPTER_START]
            else:
                target_chapters = [ch for ch in all_chapters if ch["chapter_number"] is not None and CHAPTER_START <= ch["chapter_number"] < CHAPTER_START + CHAPTER_LIMIT]

            # Sort sequentially to ensure correct scrape order
            # Sort primarily by chapter_number, then by sequence_index if numbers are duplicate or None
            target_chapters.sort(key=lambda x: (x["chapter_number"] if x["chapter_number"] is not None else float('inf'), x.get("sequence_index", 0)))

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
            # Use Supabase as primary index for skip check (faster than R2 metadata)
            print("\n📡 Fetching chapter index from Supabase...")
            existing_index = get_story_chapters_index(story_id)
            print(f"  Found {len(existing_index)} chapters in Supabase index.")

            # Also fetch R2 chapter list for fallback verification
            existing_r2_ch_nums = get_existing_chapters(story_info["slug"])
            print(f"  Found {len(existing_r2_ch_nums)} chapters in R2 storage.")

            for i, ch_info in enumerate(target_chapters):
                ch_num = ch_info["chapter_number"]
                print(f"\n📖 [{i+1}/{len(target_chapters)}] Chapter {ch_num}: {ch_info['title']}")

                # Primary skip check: Supabase index (fast, 1 query for all chapters)
                if not FORCE_RESCRAPE and ch_num in existing_index:
                    existing = existing_index[ch_num]
                    expected_url = ch_info.get("source_url")
                    existing_url = existing.get("source_url")

                    # Skip if source_url matches and chapter is marked as scraped
                    if existing_url and expected_url and existing_url == expected_url:
                        if existing.get("is_scraped") and existing.get("text_r2_url"):
                            print("  ⏭️ Already scraped (Supabase index match), skipping")
                            chapters_scraped += 1
                            continue
                        print("  ♻️ Supabase shows not scraped yet, proceeding")

                    # If URLs differ or missing, check R2 metadata for confirmation
                    elif ch_num in existing_r2_ch_nums:
                        existing_meta = get_chapter_metadata(story_info["slug"], ch_num)
                        if existing_chapter_matches(ch_info, existing_meta):
                            print("  ⏭️ R2 metadata matches, skipping")
                            chapters_scraped += 1
                            continue
                        print("  ♻️ R2 chapter stale or mismatched, re-scraping")

                # Fallback: check R2 directly if not in Supabase index
                elif not FORCE_RESCRAPE and ch_num in existing_r2_ch_nums:
                    existing_meta = get_chapter_metadata(story_info["slug"], ch_num)
                    if existing_chapter_matches(ch_info, existing_meta):
                        print("  ⏭️ Already exists in R2 (not in Supabase index), skipping")
                        chapters_scraped += 1
                        continue
                    print("  ♻️ Existing R2 chapter looks stale or mismatched, re-scraping")

                try:
                    def get_chapter_content(sess):
                        if parser.name == "truyendich":
                            is_cv = "/cv/" in story_info.get("source_url", STORY_SOURCE_URL)
                            # 1. Try direct API first
                            try:
                                api_url = parser.get_chapter_api_url(
                                    story_info.get("source_url", STORY_SOURCE_URL),
                                    ch_num,
                                    edition_type="cv" if is_cv else None
                                )
                                api_resp = sess.fetch(api_url)
                                if api_resp.status == 200:
                                    api_content = parser.parse_chapter_content(api_resp.body)
                                    if api_content.get("blocked"):
                                        # Loai B/C detected -> force proxy rotation/retry
                                        raise Exception(f"blocked chapter (api cv): {api_content.get('reason')}")
                                    if api_content["paragraphs"]:
                                        return api_content
                            except Exception:
                                pass

                            # 2. Try HTML page (contains real Vietnamese in display tab, filtered of hieroglyphs)
                            try:
                                ch_resp = sess.fetch(ch_info["source_url"])
                                if ch_resp.status == 200:
                                    html_content = parser.parse_chapter_content(ch_resp.body)
                                    if html_content.get("blocked"):
                                        raise Exception(f"blocked chapter (html): {html_content.get('reason')}")
                                    if html_content["paragraphs"]:
                                        return html_content
                            except Exception:
                                pass

                            # 3. If cv was requested, fallback to AI edition direct API
                            if is_cv:
                                try:
                                    api_url_ai = parser.get_chapter_api_url(
                                        story_info.get("source_url", STORY_SOURCE_URL),
                                        ch_num,
                                        edition_type=None
                                    )
                                    api_resp_ai = sess.fetch(api_url_ai)
                                    if api_resp_ai.status == 200:
                                        ai_content = parser.parse_chapter_content(api_resp_ai.body)
                                        if ai_content.get("blocked"):
                                            raise Exception(f"blocked chapter (api ai): {ai_content.get('reason')}")
                                        if ai_content["paragraphs"]:
                                            return ai_content
                                except Exception:
                                    pass

                            raise RuntimeError("No content returned from TruyenDich API or HTML page")

                        # Other parsers (HTML page)
                        ch_resp = sess.fetch(ch_info["source_url"])
                        if ch_resp.status != 200:
                            raise RuntimeError(f"HTTP {ch_resp.status}")
                        
                        content = parser.parse_chapter_content(ch_resp.body)
                        if not content["paragraphs"]:
                            raise RuntimeError("No content found/parsed (page might be blank or blocked by Turnstile)")
                        return content

                    content = fetch_with_rotation_wrapper(session, get_chapter_content)
                    consecutive_failures = 0
                except Exception as e:
                    print(f"  ❌ Failed to fetch chapter {ch_num}: {e}")
                    consecutive_failures += 1
                    if consecutive_failures >= 5:
                        raise ScraperAbortException(
                            f"Aborting: {consecutive_failures} consecutive chapter failures detected."
                        )
                    continue

                print(f"  📝 {len(content['paragraphs'])} paragraphs, {content['word_count']} words")

                # Upload to R2
                r2_url = upload_chapter(
                    story_slug=story_info["slug"],
                    chapter_number=ch_num,
                    title=content["title"] or ch_info["title"],
                    paragraphs=content["paragraphs"],
                    word_count=content["word_count"],
                    source_url=ch_info.get("source_url"),
                    source_chapter_number=ch_info.get("source_chapter_number"),
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
        scraped_log = "Successfully scraped!"
        update_scrape_job(
            int(JOB_ID),
            status="completed",
            error_message=scraped_log,
            chapters_scraped=chapters_scraped
        )

    print(f"\n✅ Done! Scraped {chapters_scraped} chapters successfully.")


if __name__ == "__main__":
    run_scraper()



