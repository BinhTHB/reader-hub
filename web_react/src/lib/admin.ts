import { supabase } from "./supabase";

export type StoryStatus = "ongoing" | "completed" | "paused";

export interface AdminStory {
  id: number;
  title: string;
  author: string | null;
  description: string | null;
  cover_url: string | null;
  source_url: string | null;
  genres: string[];
  status: StoryStatus;
  total_chapters: number;
  is_featured?: boolean;
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

export async function updateStory(storyId: number, patch: StoryUpdatePayload): Promise<AdminStory> {
  const { data, error } = await supabase
    .from("stories")
    .update(patch)
    .eq("id", storyId)
    .select("id, title, author, description, cover_url, source_url, genres, status, total_chapters, is_featured")
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
