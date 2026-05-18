/**
 * Supabase Edge Function: trigger-scraper
 *
 * Triggers a GitHub Actions workflow via repository_dispatch
 * to scrape chapters for a given story.
 *
 * Request body:
 * {
 *   "story_id": 123,
 *   "source_url": "https://truyenfull.vn/tao-te-kinh/",
 *   "chapter_start": 1,
 *   "chapter_end": 50
 * }
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ScrapeRequest {
  story_id: number;
  source_url: string;
  chapter_start?: number;
  chapter_limit?: number;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const GITHUB_PAT = Deno.env.get("GITHUB_PAT");
    const GITHUB_OWNER = Deno.env.get("GITHUB_OWNER");
    const GITHUB_REPO = Deno.env.get("GITHUB_REPO");

    if (!GITHUB_PAT || !GITHUB_OWNER || !GITHUB_REPO) {
      throw new Error("Missing GitHub configuration in environment variables");
    }

    // Parse request
    const body: ScrapeRequest = await req.json();
    const { story_id, source_url, chapter_start = 1, chapter_limit = 0 } = body;

    if (!source_url) {
      return new Response(
        JSON.stringify({ error: "source_url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create a scrape job record in Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: job, error: jobError } = await supabase
      .from("scrape_jobs")
      .insert({
        story_id: story_id || null,
        status: "pending",
        chapter_start,
        chapter_end: chapter_limit, // Store limit in the end column for now
      })
      .select()
      .single();

    if (jobError) {
      console.error("Failed to create scrape job:", jobError);
      throw new Error(`Failed to create scrape job: ${jobError.message}`);
    }

    // Trigger GitHub Actions via repository_dispatch
    const dispatchUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dispatches`;

    const ghResponse = await fetch(dispatchUrl, {
      method: "POST",
      headers: {
        Authorization: `token ${GITHUB_PAT}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: "scrape-story",
        client_payload: {
          job_id: job.id,
          story_id: story_id || null,
          source_url,
          chapter_start,
          chapter_limit,
        },
      }),
    });

    if (!ghResponse.ok) {
      const errorText = await ghResponse.text();

      // Update job status to failed
      await supabase
        .from("scrape_jobs")
        .update({ status: "failed", error_message: `GitHub API error: ${errorText}` })
        .eq("id", job.id);

      throw new Error(`GitHub API responded with ${ghResponse.status}: ${errorText}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Scraper triggered successfully",
        job_id: job.id,
        details: {
          story_id: story_id || null,
          chapter_start,
          chapter_limit,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
