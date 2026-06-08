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
  type: "story" | "chapter";
  id: number;
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

async function deleteStoryR2Content(slug: string, r2: AwsClient): Promise<void> {
  try {
    const accountId = Deno.env.get("CF_ACCOUNT_ID")!;
    const listUrl = "https://" + accountId + ".r2.cloudflarestorage.com/" + BUCKET + "/?prefix=stories/" + slug + "/";
    const listResp = await r2.fetch(listUrl);
    if (listResp.ok) {
      const xml = await listResp.text();
      const keyRegex = /<Key>([^<]+)<\/Key>/g;
      let match;
      while ((match = keyRegex.exec(xml)) !== null) {
        await deleteR2Object(match[1], r2);
      }
    }
  } catch (err) {
    console.warn("  Failed to list/delete R2 content for story:", slug, err);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: DeleteRequest = await req.json();
    const { type, id } = body;

    if (!id || !type) {
      return new Response(
        JSON.stringify({ error: "type and id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const hasR2Config = Deno.env.get("CF_ACCOUNT_ID") && Deno.env.get("R2_ACCESS_KEY_ID") && Deno.env.get("R2_SECRET_ACCESS_KEY");

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
