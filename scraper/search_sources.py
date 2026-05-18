"""
Multi-Source Search — Search for stories across all enabled sites

This script can be used:
1. Directly from command line for testing
2. Called from GitHub Actions
3. Logic reused by Supabase Edge Functions
"""

import asyncio
import json
import os
import sys

# Force UTF-8 encoding for Windows
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

from playwright.async_api import async_playwright
from playwright_stealth import stealth_async

from parsers import get_all_parsers, BaseSiteParser
from proxy_rotator import build_proxy_pool, ProxyPool


async def search_site(
    playwright,
    parser: BaseSiteParser,
    query: str,
    proxy_pool: ProxyPool | None = None,
) -> list[dict]:
    """Search a single site for stories matching the query."""
    search_url = parser.get_search_url(query)
    print(f"  🔍 Searching {parser.config.display_name}: {search_url}")

    launch_args = {
        "headless": True,
        "args": ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    }

    if proxy_pool and proxy_pool.size > 0:
        proxy = proxy_pool.get_random()
        if proxy:
            launch_args["proxy"] = {"server": proxy.url}

    browser = None
    try:
        browser = await playwright.chromium.launch(**launch_args)
        context = await browser.new_context(
            viewport={"width": 1366, "height": 768},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            locale="vi-VN",
        )
        page = await context.new_page()
        await stealth_async(page)

        response = await page.goto(search_url, wait_until="domcontentloaded", timeout=20000)
        if not response or response.status != 200:
            print(f"  ⚠️ {parser.config.display_name}: HTTP {response.status if response else 'None'}")
            return []

        html = await page.content()
        results = parser.parse_search_results(html)
        print(f"  ✅ {parser.config.display_name}: {len(results)} results")
        return results

    except Exception as e:
        print(f"  ❌ {parser.config.display_name} error: {e}")
        return []
    finally:
        if browser:
            await browser.close()


async def multi_source_search(query: str, use_proxy: bool = True) -> dict:
    """
    Search for a story across all enabled source websites.

    Returns:
    {
        "query": "Đấu La Đại Lục",
        "sources": [
            {
                "source_name": "truyenfull",
                "source_display": "TruyenFull",
                "results": [{ title, slug, author, cover_url, source_url, ... }]
            },
            ...
        ],
        "total_results": 15
    }
    """
    parsers = get_all_parsers()
    if not parsers:
        return {"query": query, "sources": [], "total_results": 0}

    print(f"\n🔎 Multi-source search: \"{query}\"")
    print(f"   Searching {len(parsers)} sites...\n")

    # Build proxy pool
    proxy_pool = None
    if use_proxy:
        try:
            proxy_pool = await build_proxy_pool(max_proxies=10, test_concurrency=20)
        except Exception:
            print("  ⚠️ Failed to build proxy pool, searching directly")

    # Search all sites in parallel
    async with async_playwright() as p:
        tasks = [search_site(p, parser, query, proxy_pool) for parser in parsers]
        all_results = await asyncio.gather(*tasks, return_exceptions=True)

    sources = []
    total = 0

    for parser, result in zip(parsers, all_results):
        if isinstance(result, list):
            sources.append({
                "source_name": parser.name,
                "source_display": parser.config.display_name if parser.config else parser.name,
                "base_url": parser.base_url,
                "results": result,
            })
            total += len(result)
        else:
            print(f"  ❌ {parser.name} failed: {result}")
            sources.append({
                "source_name": parser.name,
                "source_display": parser.config.display_name if parser.config else parser.name,
                "base_url": parser.base_url,
                "results": [],
                "error": str(result),
            })

    output = {
        "query": query,
        "sources": sources,
        "total_results": total,
    }

    print(f"\n✅ Search complete: {total} results across {len(sources)} sources")
    return output


# ─── CLI Entry Point ──────────────────────────────────────

if __name__ == "__main__":
    query = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SEARCH_QUERY", "")
    if not query:
        print("Usage: python search_sources.py 'story name'")
        sys.exit(1)

    use_proxy = os.environ.get("USE_FREE_PROXY", "true").lower() == "true"
    result = asyncio.run(multi_source_search(query, use_proxy=use_proxy))
    print("\n" + json.dumps(result, ensure_ascii=False, indent=2))
