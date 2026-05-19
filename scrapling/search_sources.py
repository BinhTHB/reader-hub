"""
Multi-Source Search — Search for stories across all enabled sites (Scrapling branch)

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

from scrapling import PlayWrightFetcher
from parsers import get_all_parsers, BaseSiteParser


def search_site_sync(parser: BaseSiteParser, query: str) -> list[dict]:
    """Search a single site synchronously using Scrapling PlayWrightFetcher."""
    search_url = parser.get_search_url(query)
    print(f"  🔍 [Scrapling] Searching {parser.config.display_name}: {search_url}")

    try:
        # Use PlayWrightFetcher for robust rendering
        fetcher = PlayWrightFetcher()
        response = fetcher.fetch(
            search_url,
            headless=True,
            disable_resources=True
        )
        if response.status not in (200, 302):
            print(f"  ⚠️ [Scrapling] {parser.config.display_name}: HTTP {response.status}")
            return []

        results = parser.parse_search_results(response.body)
        print(f"  ✅ [Scrapling] {parser.config.display_name}: {len(results)} results")
        return results

    except Exception as e:
        print(f"  ❌ [Scrapling] {parser.config.display_name} error: {e}")
        return []


async def search_site_async(parser: BaseSiteParser, query: str) -> list[dict]:
    """Wraps the synchronous search in an async thread pool for concurrency."""
    return await asyncio.to_thread(search_site_sync, parser, query)


async def multi_source_search(query: str) -> dict:
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

    print(f"\n🔎 [Scrapling] Multi-source search: \"{query}\"")
    print(f"   Searching {len(parsers)} sites...\n")

    # Search all sites in parallel using thread-wrapped Scrapling tasks
    tasks = [search_site_async(parser, query) for parser in parsers]
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
            print(f"  ❌ [Scrapling] {parser.name} failed: {result}")
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

    print(f"\n✅ [Scrapling] Search complete: {total} results across {len(sources)} sources")
    return output


# ─── CLI Entry Point ──────────────────────────────────────

if __name__ == "__main__":
    query = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SEARCH_QUERY", "")
    if not query:
        print("Usage: python search_sources.py 'story name'")
        sys.exit(1)

    result = asyncio.run(multi_source_search(query))
    print("\n" + json.dumps(result, ensure_ascii=False, indent=2))
