import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { externalSupabase } from "./external-supabase";
import { mapStory, toPublicAssetUrl, type Story, type DbStoryRow } from "./stories-data";
import {
  listStories,
  listChapters,
  getStoryBySlug as getStoryBySlugFn,
  getChapter as getChapterFn,
  type StoriesPage,
  type ChaptersPage,
  type ChapterDetail,
} from "./stories.functions";

export type ListStoriesParams = {
  page?: number;
  pageSize?: number;
  genre?: string;
  search?: string;
  sort?: "updated_at" | "view_count" | "total_chapters";
};

export function useStoriesPage(params: ListStoriesParams = {}) {
  const call = useServerFn(listStories);
  return useQuery<StoriesPage>({
    queryKey: ["stories-page", params],
    queryFn: () => call({ data: params }),
    staleTime: 60_000,
  });
}

export function useStoryBySlugRPC(slug: string) {
  const call = useServerFn(getStoryBySlugFn);
  return useQuery<Story | null>({
    queryKey: ["story-rpc", slug],
    queryFn: () => call({ data: { slug } }),
    enabled: !!slug,
    staleTime: 60_000,
  });
}

export function useChaptersPage(args: {
  slug?: string;
  storyId?: number;
  page?: number;
  pageSize?: number;
  ascending?: boolean;
}) {
  const call = useServerFn(listChapters);
  return useQuery<ChaptersPage>({
    queryKey: ["chapters-page", args],
    queryFn: () => call({ data: args }),
    enabled: !!(args.slug || args.storyId),
    staleTime: 60_000,
  });
}

export function useChapterDetail(args: { slug?: string; storyId?: number; chapterNumber: number }) {
  const call = useServerFn(getChapterFn);
  return useQuery<ChapterDetail | null>({
    queryKey: ["chapter-detail", args],
    queryFn: () => call({ data: args }),
    enabled: !!(args.slug || args.storyId) && Number.isFinite(args.chapterNumber),
    staleTime: 60_000,
  });
}

const SELECT_COLS =
  "id, slug, title, author, description, cover_url, genres, status, total_chapters, view_count, updated_at";

export function useStories() {
  return useQuery<Story[]>({
    queryKey: ["stories"],
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("stories")
        .select(SELECT_COLS)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data as DbStoryRow[]).map(mapStory);
    },
    staleTime: 60_000,
  });
}

export function useStoryBySlug(slug: string) {
  return useQuery<Story | null>({
    queryKey: ["story", slug],
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("stories")
        .select(SELECT_COLS)
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data ? mapStory(data as DbStoryRow) : null;
    },
    staleTime: 60_000,
  });
}

export type ChapterRow = {
  id: number;
  chapter_number: number;
  title: string | null;
  content: string | null;
  word_count: number;
};

export function useChapter(storyId: number | undefined, chapterNumber: number) {
  return useQuery<ChapterRow | null>({
    queryKey: ["chapter", storyId, chapterNumber],
    enabled: !!storyId && Number.isFinite(chapterNumber),
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("chapters")
        .select("id, chapter_number, title, content, word_count, text_r2_url")
        .eq("story_id", storyId!)
        .eq("chapter_number", chapterNumber)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as ChapterRow & { text_r2_url: string | null };
      // Chapter text is stored as JSON on R2; fetch and flatten paragraphs.
      if (!row.content && row.text_r2_url) {
        try {
          const res = await fetch(toPublicAssetUrl(row.text_r2_url));
          if (res.ok) {
            const j = (await res.json()) as {
              paragraphs?: string[];
              content?: string;
              title?: string;
            };
            const paragraphs =
              j.paragraphs && j.paragraphs.length
                ? j.paragraphs
                : j.content
                  ? j.content.split(/\n{2,}/)
                  : [];
            row.content = paragraphs.join("\n\n");
            if (!row.title && j.title) row.title = j.title;
          }
        } catch {
          // swallow – reader will show empty state
        }
      }
      return row;
    },
    staleTime: 60_000,
  });
}

export type ReadingHistoryItem = {
  story: Story;
  chapter: number;
  lastReadAt: string;
};

export function useReadingHistory(userId: string | undefined) {
  return useQuery<ReadingHistoryItem[]>({
    queryKey: ["reading-history", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reading_history")
        .select(`last_chapter_number, last_read_at, stories!inner(${SELECT_COLS})`)
        .eq("user_id", userId!)
        .order("last_read_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        story: mapStory((r as { stories: DbStoryRow }).stories),
        chapter: (r as { last_chapter_number: number }).last_chapter_number,
        lastReadAt: (r as { last_read_at: string }).last_read_at,
      }));
    },
  });
}

export type BookmarkItem = { story: Story; createdAt: string };

export function useBookmarks(userId: string | undefined) {
  return useQuery<BookmarkItem[]>({
    queryKey: ["bookmarks", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookmarks")
        .select(`created_at, stories!inner(${SELECT_COLS})`)
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        story: mapStory((r as { stories: DbStoryRow }).stories),
        createdAt: (r as { created_at: string }).created_at,
      }));
    },
  });
}

export async function recordReadingProgress(
  userId: string,
  storyId: number,
  chapterNumber: number,
) {
  await supabase.from("reading_history").upsert(
    {
      user_id: userId,
      story_id: storyId,
      last_chapter_number: chapterNumber,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "user_id,story_id" },
  );
}
