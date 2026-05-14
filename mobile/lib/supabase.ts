/**
 * Supabase Client — Initialize and export the Supabase client
 *
 * Uses AsyncStorage for persistent auth session on device.
 */

import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://your-project.supabase.co";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "your-anon-key";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// ─── Story Queries ────────────────────────────────────────

export async function fetchStories(options?: {
  limit?: number;
  offset?: number;
  search?: string;
  genre?: string;
  featured?: boolean;
}) {
  const { limit = 20, offset = 0, search, genre, featured } = options || {};

  let query = supabase
    .from("stories")
    .select("*", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.ilike("title", `%${search}%`);
  }
  if (genre) {
    query = query.contains("genres", [genre]);
  }
  if (featured) {
    query = query.eq("is_featured", true);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { stories: data || [], total: count || 0 };
}

export async function fetchStoryBySlug(slug: string) {
  const { data, error } = await supabase
    .from("stories")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error) throw error;
  return data;
}

export async function fetchChapters(storyId: number) {
  const { data, error } = await supabase
    .from("chapters")
    .select("id, chapter_number, title, text_r2_url, word_count, is_scraped")
    .eq("story_id", storyId)
    .eq("is_scraped", true)
    .order("chapter_number", { ascending: true });

  if (error) throw error;
  return data || [];
}

// ─── Reading History ──────────────────────────────────────

export async function getReadingHistory(userId: string) {
  const { data, error } = await supabase
    .from("reading_history")
    .select("*, stories(*)")
    .eq("user_id", userId)
    .order("last_read_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function upsertReadingProgress(
  userId: string,
  storyId: number,
  chapterNumber: number,
  scrollPosition: number = 0
) {
  const { error } = await supabase.from("reading_history").upsert(
    {
      user_id: userId,
      story_id: storyId,
      last_chapter_number: chapterNumber,
      scroll_position: scrollPosition,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "user_id,story_id" }
  );
  if (error) throw error;
}

// ─── Bookmarks ────────────────────────────────────────────

export async function getBookmarks(userId: string) {
  const { data, error } = await supabase
    .from("bookmarks")
    .select("*, stories(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function toggleBookmark(userId: string, storyId: number) {
  // Check if exists
  const { data: existing } = await supabase
    .from("bookmarks")
    .select("id")
    .eq("user_id", userId)
    .eq("story_id", storyId)
    .single();

  if (existing) {
    await supabase.from("bookmarks").delete().eq("id", existing.id);
    return false; // Removed
  } else {
    await supabase.from("bookmarks").insert({ user_id: userId, story_id: storyId });
    return true; // Added
  }
}

// ─── View Count ───────────────────────────────────────────

export async function incrementViewCount(storyId: number) {
  await supabase.rpc("increment_view_count", { story_id_input: storyId });
}
