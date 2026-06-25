export interface ChapterContent {
  paragraphs: string[];
}

export const CHAPTER_CACHE_NAME = 'reader-hub-chapters-cache';

const getChapterCacheKey = (chapterId: number) => `chapter-${chapterId}`;
const getChapterLocalStorageKey = (chapterId: number) => `chapter_cache_${chapterId}`;

export const getChapterFromCache = async (chapterId: number): Promise<ChapterContent | null> => {
  try {
    if ('caches' in window) {
      const cache = await caches.open(CHAPTER_CACHE_NAME);
      const response = await cache.match(getChapterCacheKey(chapterId));
      if (response) {
        return await response.json();
      }
    }
  } catch (e) {
    console.error('Failed to get from Cache API:', e);
  }

  try {
    const data = localStorage.getItem(getChapterLocalStorageKey(chapterId));
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error('Failed to get from localStorage cache:', e);
  }

  return null;
};

export const saveChapterToCache = async (chapterId: number, data: ChapterContent): Promise<void> => {
  try {
    if ('caches' in window) {
      const cache = await caches.open(CHAPTER_CACHE_NAME);
      await cache.put(getChapterCacheKey(chapterId), new Response(JSON.stringify(data)));
      return;
    }
  } catch (e) {
    console.error('Failed to save to Cache API:', e);
  }

  try {
    localStorage.setItem(getChapterLocalStorageKey(chapterId), JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save to localStorage cache:', e);
  }
};

export const deleteChapterFromCache = async (chapterId: number): Promise<void> => {
  try {
    if ('caches' in window) {
      const cache = await caches.open(CHAPTER_CACHE_NAME);
      await cache.delete(getChapterCacheKey(chapterId));
    }
  } catch (e) {
    console.error('Failed to delete from Cache API:', e);
  }

  try {
    localStorage.removeItem(getChapterLocalStorageKey(chapterId));
  } catch (e) {
    console.error('Failed to delete from localStorage cache:', e);
  }
};

export const cleanChapterCache = async (keepIds: number[]): Promise<void> => {
  try {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith('chapter_cache_')) {
        const id = parseInt(key.replace('chapter_cache_', ''), 10);
        if (!keepIds.includes(id)) {
          localStorage.removeItem(key);
        }
      }
    }

    if ('caches' in window) {
      const cache = await caches.open(CHAPTER_CACHE_NAME);
      const cachedRequests = await cache.keys();
      for (const req of cachedRequests) {
        const url = req.url;
        const match = url.match(/chapter-(\d+)$/);
        if (match) {
          const id = parseInt(match[1], 10);
          if (!keepIds.includes(id)) {
            await cache.delete(req);
          }
        }
      }
    }
  } catch (e) {
    console.error('Error cleaning cache:', e);
  }
};
