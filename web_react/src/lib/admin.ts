import { supabase } from "./supabase";

export type StoryStatus = "ongoing" | "completed" | "paused";

export interface AdminStory {
  id: number;
  slug?: string;
  title: string;
  author: string | null;
  description: string | null;
  cover_url: string | null;
  source_url: string | null;
  genres: string[];
  status: StoryStatus;
  total_chapters: number;
  view_count?: number;
  is_featured?: boolean;
  updated_at?: string;
}

export interface AdminChapter {
  id: number;
  story_id: number;
  chapter_number: number;
  title: string | null;
  word_count: number;
  text_r2_url: string | null;
  source_url: string | null;
  is_scraped: boolean;
  created_at: string;
}

export interface StoryUpdatePayload {
  title: string;
  author: string | null;
  description: string | null;
  cover_url: string | null;
  source_url: string | null;
  genres: string[];
  status: StoryStatus;
  is_featured: boolean;
}

const STORY_SELECT =
  "id, slug, title, author, description, cover_url, source_url, genres, status, total_chapters, view_count, is_featured, updated_at";

const CHAPTER_SELECT =
  "id, story_id, chapter_number, title, word_count, text_r2_url, source_url, is_scraped, created_at";

export function slugifyTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function fetchIsAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Failed to check admin role:", error);
    return false;
  }
  return data?.role === "admin";
}

export async function createStory(
  payload: StoryUpdatePayload & { slug?: string },
): Promise<AdminStory> {
  const slug = (payload.slug || slugifyTitle(payload.title)).trim();
  if (!slug) {
    throw new Error("Slug không hợp lệ.");
  }

  const { data, error } = await supabase
    .from("stories")
    .insert({ ...payload, slug })
    .select(STORY_SELECT)
    .single();

  if (error) {
    if (error.code === "42501" || error.message.toLowerCase().includes("row-level security")) {
      throw new Error("Không có quyền Admin để thêm truyện.");
    }
    if (error.code === "23505") {
      throw new Error("Slug truyện đã tồn tại. Vui lòng chọn slug khác.");
    }
    throw new Error(error.message || "Không thể thêm truyện.");
  }
  return data as AdminStory;
}

export async function updateStory(
  storyId: number,
  patch: StoryUpdatePayload,
): Promise<AdminStory> {
  const { data, error } = await supabase
    .from("stories")
    .update(patch)
    .eq("id", storyId)
    .select(STORY_SELECT)
    .single();

  if (error) {
    if (error.code === "42501" || error.message.toLowerCase().includes("row-level security")) {
      throw new Error("Không có quyền Admin để chỉnh sửa truyện.");
    }
    throw new Error(error.message || "Không thể cập nhật truyện.");
  }
  if (!data) {
    throw new Error("Không tìm thấy truyện hoặc bạn không có quyền Admin.");
  }
  return data as AdminStory;
}

export async function updateChapter(
  chapterId: number,
  patch: { chapter_number: number; title: string | null },
): Promise<AdminChapter> {
  const { data, error } = await supabase
    .from("chapters")
    .update(patch)
    .eq("id", chapterId)
    .select(CHAPTER_SELECT)
    .single();

  if (error) {
    if (error.code === "42501" || error.message.toLowerCase().includes("row-level security")) {
      throw new Error("Không có quyền Admin để chỉnh sửa chương.");
    }
    if (error.code === "23505") {
      throw new Error(`Chương số ${patch.chapter_number} đã tồn tại trong truyện này.`);
    }
    throw new Error(error.message || "Không thể cập nhật chương.");
  }
  if (!data) {
    throw new Error("Không tìm thấy chương hoặc bạn không có quyền Admin.");
  }
  return data as AdminChapter;
}

export async function deleteContent(type: "story" | "chapter", id: number): Promise<void> {
  const { data, error } = await supabase.functions.invoke("delete-content", {
    body: { type, id },
  });

  if (error) {
    throw new Error(error.message || "Không thể xoá nội dung.");
  }
  if (data?.error) {
    throw new Error(data.error);
  }
}
