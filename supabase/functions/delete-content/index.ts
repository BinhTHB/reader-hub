/**
 * Supabase Edge Function: delete-content
 *
 * Deletes stories/chapters from DB AND their R2 content using service_role key.
 * This ensures re-scraping works correctly (scraper checks R2 existence).
 *
 * Request body:
 * {
 *   type: "story" | "chapter",
 *   id: number
 * }
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "npm:aws4fetch";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface DeleteRequest {
  type: "story" | "chapter" | "chapters_bulk";
  id?: number;
  story_id?: number;
  ids?: number[];
  chapter_start?: number;
  chapter_end?: number;
}

function getR2Client(): AwsClient {
  const accountId = Deno.env.get("CF_ACCOUNT_ID")!;
  return new AwsClient({
    accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
    secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
    service: "s3",
    region: "auto",
    endpoint: new URL("https://" + accountId + ".r2.cloudflarestorage.com"),
  });
}

const BUCKET = Deno.env.get("R2_BUCKET_NAME") || "reader-hub-data";

async function deleteR2Object(key: string, r2: AwsClient): Promise<void> {
  try {
    const accountId = Deno.env.get("CF_ACCOUNT_ID")!;
    const url = "https://" + accountId + ".r2.cloudflarestorage.com/" + BUCKET + "/" + key;
    await r2.fetch(url, { method: "DELETE" });
    console.log("  Deleted R2:", key);
  } catch (err) {
    console.warn("  Failed to delete R2 object (may not exist):", key, err);
  }
}

async function deleteR2KeysBatch(keys: string[], r2: AwsClient): Promise<void> {
  const chunkSize = 20;
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize);
    await Promise.allSettled(chunk.map((k) => deleteR2Object(k, r2)));
  }
}

async function deleteStoryR2Content(slug: string, r2: AwsClient): Promise<void> {
  try {
    const accountId = Deno.env.get("CF_ACCOUNT_ID")!;
    const listUrl = "https://" + accountId + ".r2.cloudflarestorage.com/" + BUCKET + "/?prefix=stories/" + slug + "/";
    const listResp = await r2.fetch(listUrl);
    if (listResp.ok) {
      const xml = await listResp.text();
      const keys: string[] = [];
      const keyRegex = /<Key>([^<]+)<\/Key>/g;
      let match;
      while ((match = keyRegex.exec(xml)) !== null) {
        keys.push(match[1]);
      }
      await deleteR2KeysBatch(keys, r2);
    }
  } catch (err) {
    console.warn("  Failed to list/delete R2 content for story:", slug, err);
  }
}

async function requireAdmin(
  req: Request,
  supabase: ReturnType<typeof createClient>,
): Promise<Response | null> {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized: missing bearer token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const token = authHeader.slice(7).trim();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized: invalid token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return new Response(
      JSON.stringify({ error: "Forbidden: admin role required" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  return null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authDenied = await requireAdmin(req, supabase);
    if (authDenied) return authDenied;

    const body: DeleteRequest = await req.json();
    const { type, id, story_id, ids, chapter_start, chapter_end } = body;

    if (!type) {
      return new Response(
        JSON.stringify({ error: "type is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const hasR2Config = Deno.env.get("CF_ACCOUNT_ID") && Deno.env.get("R2_ACCESS_KEY_ID") && Deno.env.get("R2_SECRET_ACCESS_KEY");

    if (type === "chapters_bulk") {
      if (!story_id) {
        return new Response(
          JSON.stringify({ error: "story_id is required for chapters_bulk" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let q = supabase
        .from("chapters")
        .select("id, chapter_number")
        .eq("story_id", story_id);

      if (Array.isArray(ids) && ids.length > 0) {
        q = q.in("id", ids);
      } else if (chapter_start !== undefined && chapter_end !== undefined) {
        const lo = Math.min(chapter_start, chapter_end);
        const hi = Math.max(chapter_start, chapter_end);
        q = q.gte("chapter_number", lo).lte("chapter_number", hi);
      } else {
        return new Response(
          JSON.stringify({ error: "ids or chapter_start/chapter_end are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: matchedRows, error: fetchErr } = await q;
      if (fetchErr) throw fetchErr;

      const rows = matchedRows || [];
      const matchedIds = rows.map((r: any) => r.id);
      if (matchedIds.length === 0) {
        return new Response(
          JSON.stringify({ success: true, deleted_count: 0, deleted_ids: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      for (let i = 0; i < matchedIds.length; i += 500) {
        const chunk = matchedIds.slice(i, i + 500);
        const { error: delErr } = await supabase
          .from("chapters")
          .delete()
          .in("id", chunk);
        if (delErr) throw delErr;
      }

      const { count: remainingCount } = await supabase
        .from("chapters")
        .select("id", { count: "exact", head: true })
        .eq("story_id", story_id);
      if (typeof remainingCount === "number") {
        await supabase
          .from("stories")
          .update({ total_chapters: remainingCount })
          .eq("id", story_id);
      }

      if (hasR2Config) {
        const { data: story } = await supabase
          .from("stories")
          .select("slug")
          .eq("id", story_id)
          .single();
        if (story?.slug) {
          const r2 = getR2Client();
          const keys = rows.map(
            (r: any) => "stories/" + story.slug + "/chapters/" + r.chapter_number + ".json",
          );
          await deleteR2KeysBatch(keys, r2);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          deleted_count: matchedIds.length,
          deleted_ids: matchedIds,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!id) {
      return new Response(
        JSON.stringify({ error: "id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (type === "story") {
      let slug: string | null = null;
      if (hasR2Config) {
        const { data: story } = await supabase
          .from("stories")
          .select("slug")
          .eq("id", id)
          .single();
        if (story) slug = story.slug;
      }

      const { error } = await supabase
        .from("stories")
        .delete()
        .eq("id", id);

      if (error) throw error;

      if (slug && hasR2Config) {
        const r2 = getR2Client();
        await deleteStoryR2Content(slug, r2);
      }

      return new Response(
        JSON.stringify({ success: true, message: "Story deleted successfully" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (type === "chapter") {
      let r2Key: string | null = null;
      if (hasR2Config) {
        const { data: chapter } = await supabase
          .from("chapters")
          .select("story_id, chapter_number")
          .eq("id", id)
          .single();
        if (chapter) {
          const { data: story } = await supabase
            .from("stories")
            .select("slug")
            .eq("id", chapter.story_id)
            .single();
          if (story) {
            r2Key = "stories/" + story.slug + "/chapters/" + chapter.chapter_number + ".json";
          }
        }
      }

      const { error } = await supabase
        .from("chapters")
        .delete()
        .eq("id", id);

      if (error) throw error;

      if (r2Key && hasR2Config) {
        const r2 = getR2Client();
        await deleteR2Object(r2Key, r2);
      }

      return new Response(
        JSON.stringify({ success: true, message: "Chapter deleted successfully" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({ error: "type must be 'story' or 'chapter'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
