import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mapStory, type DbStoryRow, type Story } from "./stories-data";
import { externalSupabase } from "./external-supabase";

const SELECT_COLS =
  "id, slug, title, author, description, cover_url, genres, status, total_chapters, view_count, updated_at";

export type StoriesPage = {
  items: Story[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ChapterListItem = {
  id: number;
  chapter_number: number;
  title: string | null;
  word_count: number;
};

export type ChaptersPage = {
  items: ChapterListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ChapterDetail = {
  id: number;
  story_id: number;
  chapter_number: number;
  title: string | null;
  content: string | null;
  word_count: number;
  prev_chapter: number | null;
  next_chapter: number | null;
};

async function getServerSupabase() {
  return externalSupabase;
}

export const listStories = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z
      .object({
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(100).default(20),
        genre: z.string().trim().min(1).optional(),
        search: z.string().trim().min(1).optional(),
        sort: z.enum(["updated_at", "view_count", "total_chapters"]).default("updated_at"),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }): Promise<StoriesPage> => {
    const supabase = await getServerSupabase();
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let q = supabase
      .from("stories")
      .select(SELECT_COLS, { count: "exact" })
      .order(data.sort, { ascending: false })
      .range(from, to);

    if (data.genre) q = q.contains("genres", [data.genre]);
    if (data.search) q = q.ilike("title", `%${data.search}%`);

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    const total = count ?? 0;
    return {
      items: ((rows as DbStoryRow[] | null) ?? []).map(mapStory),
      page: data.page,
      pageSize: data.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / data.pageSize)),
    };
  });

export const getStoryBySlug = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ slug: z.string().min(1) }).parse(data))
  .handler(async ({ data }): Promise<Story | null> => {
    const supabase = await getServerSupabase();
    const { data: row, error } = await supabase
      .from("stories")
      .select(SELECT_COLS)
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ? mapStory(row as DbStoryRow) : null;
  });

export const listChapters = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z
      .object({
        storyId: z.number().int().positive().optional(),
        slug: z.string().min(1).optional(),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(200).default(50),
        ascending: z.boolean().default(true),
      })
      .refine((v) => v.storyId || v.slug, {
        message: "storyId hoặc slug là bắt buộc",
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<ChaptersPage> => {
    const supabase = await getServerSupabase();

    let storyId = data.storyId;
    if (!storyId && data.slug) {
      const { data: s, error: se } = await supabase
        .from("stories")
        .select("id")
        .eq("slug", data.slug)
        .maybeSingle();
      if (se) throw new Error(se.message);
      if (!s)
        return { items: [], page: data.page, pageSize: data.pageSize, total: 0, totalPages: 1 };
      storyId = s.id as number;
    }

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    const {
      data: rows,
      error,
      count,
    } = await supabase
      .from("chapters")
      .select("id, chapter_number, title, word_count", { count: "exact" })
      .eq("story_id", storyId!)
      .order("chapter_number", { ascending: data.ascending })
      .range(from, to);
    if (error) throw new Error(error.message);

    const total = count ?? 0;
    return {
      items: (rows as ChapterListItem[] | null) ?? [],
      page: data.page,
      pageSize: data.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / data.pageSize)),
    };
  });

export const getChapter = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z
      .object({
        storyId: z.number().int().positive().optional(),
        slug: z.string().min(1).optional(),
        chapterNumber: z.number().int().positive(),
      })
      .refine((v) => v.storyId || v.slug, {
        message: "storyId hoặc slug là bắt buộc",
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<ChapterDetail | null> => {
    const supabase = await getServerSupabase();

    let storyId = data.storyId;
    if (!storyId && data.slug) {
      const { data: s, error: se } = await supabase
        .from("stories")
        .select("id")
        .eq("slug", data.slug)
        .maybeSingle();
      if (se) throw new Error(se.message);
      if (!s) return null;
      storyId = s.id as number;
    }

    const { data: row, error } = await supabase
      .from("chapters")
      .select("id, story_id, chapter_number, title, content, word_count, text_r2_url")
      .eq("story_id", storyId!)
      .eq("chapter_number", data.chapterNumber)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;

    // Chapter body may live on R2; fetch and flatten paragraphs.
    const r = row as {
      id: number;
      story_id: number;
      chapter_number: number;
      title: string | null;
      content: string | null;
      word_count: number;
      text_r2_url: string | null;
    };
    if (!r.content && r.text_r2_url) {
      try {
        const res = await fetch(r.text_r2_url);
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
          r.content = paragraphs.join("\n\n");
          if (!r.title && j.title) r.title = j.title;
        }
      } catch {
        // leave content null
      }
    }

    const [{ data: prev }, { data: next }] = await Promise.all([
      supabase
        .from("chapters")
        .select("chapter_number")
        .eq("story_id", storyId!)
        .lt("chapter_number", data.chapterNumber)
        .order("chapter_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("chapters")
        .select("chapter_number")
        .eq("story_id", storyId!)
        .gt("chapter_number", data.chapterNumber)
        .order("chapter_number", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    return {
      ...(r as Omit<ChapterDetail, "prev_chapter" | "next_chapter">),
      prev_chapter: (prev?.chapter_number as number | undefined) ?? null,
      next_chapter: (next?.chapter_number as number | undefined) ?? null,
    };
  });
