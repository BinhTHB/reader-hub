/**
 * R2 Content Fetcher — Fetch chapter content from Cloudflare R2
 *
 * Includes in-memory caching to avoid redundant network requests.
 */

export interface ChapterContent {
  story_slug: string;
  chapter_number: number;
  title: string;
  paragraphs: string[];
  word_count: number;
  scraped_at: string;
}

// Simple LRU-style cache (keeps last N chapters in memory)
const CACHE_SIZE = 10;
const cache = new Map<string, ChapterContent>();

function addToCache(key: string, data: ChapterContent) {
  if (cache.size >= CACHE_SIZE) {
    // Remove oldest entry
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, data);
}

/**
 * Fetch chapter content from an R2 URL.
 * Results are cached in memory for quick re-reads.
 */
export async function fetchChapterContent(r2Url: string): Promise<ChapterContent> {
  // Check cache
  const cached = cache.get(r2Url);
  if (cached) return cached;

  const response = await fetch(r2Url);

  if (!response.ok) {
    throw new Error(`Failed to fetch chapter: HTTP ${response.status}`);
  }

  const data: ChapterContent = await response.json();
  addToCache(r2Url, data);
  return data;
}

/**
 * Pre-fetch the next chapter for smooth reading experience.
 */
export function prefetchChapter(r2Url: string) {
  if (!cache.has(r2Url)) {
    fetchChapterContent(r2Url).catch(() => {
      // Silent fail for prefetch
    });
  }
}

/**
 * Clear the chapter cache.
 */
export function clearCache() {
  cache.clear();
}
