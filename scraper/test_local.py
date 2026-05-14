"""
Local Test Script — Test scraping locally without Supabase/R2

Tests:
1. Multi-source search (search for a story across all sites)
2. Parse story info from a specific URL
3. Parse chapter list
4. Parse chapter content (first chapter only)

Usage:
  python test_local.py search "Đấu La Đại Lục"
  python test_local.py scrape truyenfull "https://truyenfull.vision/dau-la-dai-luc/"
"""

import asyncio
import json
import sys

from playwright.async_api import async_playwright
from playwright_stealth import stealth_async

from parsers import get_parser, get_all_parsers, detect_parser, BaseSiteParser
from sites_config import get_enabled_sites


# ─── Test: Multi-Source Search ────────────────────────────

async def test_search(query: str):
    """Search for a story across all enabled sources."""
    parsers = get_all_parsers()
    print(f"\n{'='*60}")
    print(f"🔎 SEARCH TEST: \"{query}\"")
    print(f"   Searching {len(parsers)} sources...")
    print(f"{'='*60}\n")

    async with async_playwright() as p:
        for parser in parsers:
            search_url = parser.get_search_url(query)
            print(f"🌐 {parser.config.display_name}")
            print(f"   URL: {search_url}")

            browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
            try:
                context = await browser.new_context(
                    viewport={"width": 1366, "height": 768},
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    locale="vi-VN",
                )
                page = await context.new_page()
                await stealth_async(page)

                response = await page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
                print(f"   HTTP Status: {response.status if response else 'None'}")

                if response and response.status == 200:
                    html = await page.content()
                    results = parser.parse_search_results(html)
                    print(f"   ✅ Found {len(results)} results\n")

                    if not results:
                        filename = f"{parser.name}_debug.html"
                        with open(filename, "w", encoding="utf-8") as f:
                            f.write(html)
                        print(f"   💾 Saved raw HTML to {filename} for inspection\n")

                    for i, r in enumerate(results[:5]):  # Show top 5
                        print(f"   [{i+1}] {r['title']}")
                        print(f"       Author: {r.get('author', 'N/A')}")
                        print(f"       URL: {r['source_url']}")
                        print()
                else:
                    print(f"   ❌ Failed (HTTP {response.status if response else 'None'})\n")

            except Exception as e:
                print(f"   ❌ Error: {e}\n")
            finally:
                await browser.close()


# ─── Test: Scrape Story ──────────────────────────────────

async def test_scrape(site_name: str, story_url: str):
    """Test scraping a single story: info + chapter list + first chapter content."""
    parser = get_parser(site_name)
    print(f"\n{'='*60}")
    print(f"📖 SCRAPE TEST: {parser.config.display_name}")
    print(f"   URL: {story_url}")
    print(f"{'='*60}\n")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        context = await browser.new_context(
            viewport={"width": 1366, "height": 768},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            locale="vi-VN",
        )
        page = await context.new_page()
        await stealth_async(page)

        try:
            # Step 1: Story Info
            print("📚 Step 1: Fetching story info...")
            response = await page.goto(story_url, wait_until="domcontentloaded", timeout=30000)
            print(f"   HTTP Status: {response.status if response else 'None'}")

            if not response or response.status != 200:
                print(f"   ❌ Failed to load story page")
                return

            html = await page.content()
            story_info = parser.parse_story_info(html, story_url)

            print(f"   Title:       {story_info['title']}")
            print(f"   Author:      {story_info.get('author', 'N/A')}")
            print(f"   Slug:        {story_info['slug']}")
            print(f"   Status:      {story_info.get('status', 'N/A')}")
            desc = story_info.get('description') or 'N/A'
            print(f"   Genres:      {', '.join(story_info.get('genres', []))}")
            print(f"   Description: {desc[:100]}...")
            print(f"   Cover URL:   {story_info.get('cover_img_url', 'None')}")
            print()

            with open(f"{parser.name}_story_debug.html", "w", encoding="utf-8") as f:
                f.write(html)
            print(f"   💾 Saved story page HTML to {parser.name}_story_debug.html\n")

            # Step 2: Chapter List
            print("📋 Step 2: Fetching chapter list...")
            chapter_list_url = parser.get_chapter_list_url(story_url)
            print(f"   URL: {chapter_list_url}")

            await asyncio.sleep(2)  # Rate limit
            response = await page.goto(chapter_list_url, wait_until="domcontentloaded", timeout=30000)
            html = await page.content()
            chapters = parser.parse_chapter_list(html)

            print(f"   ✅ Found {len(chapters)} chapters")
            if chapters:
                print(f"   First: Chapter {chapters[0]['chapter_number']} — {chapters[0]['title']}")
                print(f"   Last:  Chapter {chapters[-1]['chapter_number']} — {chapters[-1]['title']}")
            print()

            # Step 3: First Chapter Content
            if chapters:
                first_ch = chapters[0]
                print(f"📖 Step 3: Fetching chapter {first_ch['chapter_number']} content...")
                print(f"   URL: {first_ch['source_url']}")

                await asyncio.sleep(2)  # Rate limit
                response = await page.goto(first_ch["source_url"], wait_until="domcontentloaded", timeout=30000)
                html = await page.content()
                content = parser.parse_chapter_content(html)

                print(f"   Title:      {content['title']}")
                print(f"   Paragraphs: {len(content['paragraphs'])}")
                print(f"   Word count: {content['word_count']}")

                with open(f"{parser.name}_chapter_debug.html", "w", encoding="utf-8") as f:
                    f.write(html)
                print(f"\n   💾 Saved chapter HTML to {parser.name}_chapter_debug.html")

                if content["paragraphs"]:
                    print(f"\n   ── Preview (first 3 paragraphs) ──")
                    for i, para in enumerate(content["paragraphs"][:3]):
                        print(f"   [{i+1}] {para[:120]}{'...' if len(para) > 120 else ''}")

                # Save sample output to file for inspection
                sample = {
                    "story_info": story_info,
                    "total_chapters": len(chapters),
                    "sample_chapter": {
                        "number": first_ch["chapter_number"],
                        "title": content["title"],
                        "paragraphs": content["paragraphs"],
                        "word_count": content["word_count"],
                    },
                }
                with open("test_output.json", "w", encoding="utf-8") as f:
                    json.dump(sample, f, ensure_ascii=False, indent=2)
                print(f"\n   💾 Full sample saved to test_output.json")

        except Exception as e:
            print(f"\n❌ Error: {e}")
            import traceback
            traceback.print_exc()
        finally:
            await browser.close()

    print(f"\n{'='*60}")
    print(f"✅ SCRAPE TEST COMPLETE")
    print(f"{'='*60}")


# ─── Main ─────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Usage:")
        print('  python test_local.py search "Đấu La Đại Lục"')
        print('  python test_local.py scrape truyenfull "https://truyenfull.vision/dau-la-dai-luc/"')
        print('  python test_local.py scrape metruyenchu "https://metruyenchu.com.vn/truyen/dau-la-dai-luc"')
        sys.exit(1)

    mode = sys.argv[1]

    if mode == "search":
        query = sys.argv[2] if len(sys.argv) > 2 else "Yêu thần ký"
        asyncio.run(test_search(query))

    elif mode == "scrape":
        if len(sys.argv) < 4:
            print("Usage: python test_local.py scrape <site_name> <story_url>")
            sys.exit(1)
        site_name = sys.argv[2]
        story_url = sys.argv[3]
        asyncio.run(test_scrape(site_name, story_url))

    else:
        print(f"Unknown mode: {mode}")
        sys.exit(1)


if __name__ == "__main__":
    main()
