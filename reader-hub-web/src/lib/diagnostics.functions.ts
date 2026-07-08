import { createServerFn } from "@tanstack/react-start";
import { externalSupabase, EXTERNAL_SUPABASE_URL } from "./external-supabase";

export type DiagnosticsResult = {
  supabaseUrl: string;
  storiesCount: number | null;
  chaptersCount: number | null;
  storiesSample: Array<{ id: number; slug: string; title: string }>;
  storiesError: string | null;
  chaptersError: string | null;
};

export const getDiagnostics = createServerFn({ method: "GET" }).handler(
  async (): Promise<DiagnosticsResult> => {
    const supabaseUrl = EXTERNAL_SUPABASE_URL;

    const [storiesRes, chaptersRes, sampleRes] = await Promise.all([
      externalSupabase.from("stories").select("id", { count: "exact", head: true }),
      externalSupabase.from("chapters").select("id", { count: "exact", head: true }),
      externalSupabase.from("stories").select("id, slug, title").limit(5),
    ]);

    return {
      supabaseUrl,
      storiesCount: storiesRes.count ?? null,
      chaptersCount: chaptersRes.count ?? null,
      storiesSample:
        (sampleRes.data as Array<{ id: number; slug: string; title: string }> | null) ?? [],
      storiesError: storiesRes.error?.message ?? null,
      chaptersError: chaptersRes.error?.message ?? null,
    };
  },
);
