"""
Local Test Script — Test scraping locally using Scrapling (Scrapling branch)

Usage:
  python test_local.py search "Đấu La Đại Lục"
  python test_local.py scrape truyenfull "https://truyenfull.vision/dau-la-dai-luc/"
  python test_local.py scrape uukanshu "https://uukanshu.cc/book/8530/"
"""

import sys
import io
import json
import time

# Fix Windows console encoding
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from scrapling import PlayWrightFetcher
from parsers import get_parser, get_all_parsers


def test_search(query: str):
    """Search for a story across all enabled sources."""
    parsers = get_all_parsers()
    print(f"\n{'='*60}")
    print(f"SEARCH TEST (Scrapling): \"{query}\"")
    print(f"   Searching {len(parsers)} sources...")
    print(f"{'='*60}\n")

    fetcher = PlayWrightFetcher()
    for parser in parsers:
        search_url = parser.get_search_url(query)
        print(f"[{parser.config.display_name}]")
        print(f"   URL: {search_url}")

        try:
            response = fetcher.fetch(search_url, headless=True, disable_resources=True)
            print(f"   HTTP Status: {response.status}")

            if response.status == 200:
                results = parser.parse_search_results(response.body)
                print(f"   [OK] Found {len(results)} results\n")

                if not results:
                    filename = f"{parser.name}_debug.html"
                    with open(filename, "w", encoding="utf-8") as f:
                        f.write(response.body)
                    print(f"   [SAVED] Raw HTML to {filename} for inspection\n")

                for i, r in enumerate(results[:5]):  # Show top 5
                    print(f"   [{i+1}] {r['title']}")
                    print(f"       Author: {r.get('author', 'N/A')}")
                    print(f"       URL: {r['source_url']}")
                    print()
            else:
                print(f"   [FAIL] HTTP {response.status}\n")

        except Exception as e:
            print(f"   [ERROR] {e}\n")


def test_scrape(site_name: str, story_url: str):
    """Test scraping a single story: info + chapter list + first chapter content."""
    parser = get_parser(site_name)
    print(f"\n{'='*60}")
    print(f"📖 SCRAPE TEST (Scrapling): {parser.config.display_name}")
    print(f"   URL: {story_url}")
    print(f"{'='*60}\n")

    fetcher = PlayWrightFetcher()
    try:
        # Step 1: Story Info
        print("📚 Step 1: Fetching story info...")
        response = fetcher.fetch(story_url, headless=True, disable_resources=True)
        print(f"   HTTP Status: {response.status}")

        if response.status != 200:
            print(f"   ❌ Failed to load story page")
            return

        story_info = parser.parse_story_info(response.body, story_url)

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
            f.write(response.body)
        print(f"   💾 Saved story page HTML to {parser.name}_story_debug.html\n")

        # Step 2: Chapter List
        print("📋 Step 2: Fetching chapter list...")
        effective_story_url = story_info.get("source_url", story_url)
        chapter_list_url = parser.get_chapter_list_url(effective_story_url)
        print(f"   URL: {chapter_list_url}")

        time.sleep(1)
        response = fetcher.fetch(chapter_list_url, headless=True, disable_resources=True)
        chapters = parser.parse_chapter_list(response.body)

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

            time.sleep(1)
            response = fetcher.fetch(first_ch["source_url"], headless=True, disable_resources=True)
            content = parser.parse_chapter_content(response.body)

            print(f"   Title:      {content['title']}")
            print(f"   Paragraphs: {len(content['paragraphs'])}")
            print(f"   Word count: {content['word_count']}")

            with open(f"{parser.name}_chapter_debug.html", "w", encoding="utf-8") as f:
                f.write(response.body)
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

    print(f"\n{'='*60}")
    print(f"✅ SCRAPE TEST COMPLETE")
    print(f"{'='*60}")


def main():
    if len(sys.argv) < 3:
        print("Usage:")
        print("  python test_local.py search \"<query>\"")
        print("  python test_local.py scrape <site_name> \"<url>\"")
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "search":
        test_search(sys.argv[2])
    elif cmd == "scrape":
        if len(sys.argv) < 4:
            print("Usage: python test_local.py scrape <site_name> \"<url>\"")
            sys.exit(1)
        test_scrape(sys.argv[2], sys.argv[3])
    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)


if __name__ == "__main__":
    main()
