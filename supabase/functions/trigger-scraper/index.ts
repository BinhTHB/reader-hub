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
  story_id?: number;
  source_url: string;
  chapter_start?: number;
  chapter_limit?: number;
  action?: "scrape" | "check_latest";
}

async function checkLatestChapter(sourceUrl: string): Promise<{ chapter_number: number; title: string }> {
  const url = sourceUrl.trim();
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  };

  if (url.includes("truyenfull")) {
    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`Fetch TruyenFull failed with status ${resp.status}`);
    const html = await resp.text();

    let maxPage = 1;
    const pageMatches = html.match(/\/trang-(\d+)/g);
    if (pageMatches) {
      for (const m of pageMatches) {
        const numMatch = m.match(/\d+/);
        if (numMatch) {
          const num = parseInt(numMatch[0]);
          if (num > maxPage) maxPage = num;
        }
      }
    }

    let lastPageHtml = html;
    if (maxPage > 1) {
      const lastPageUrl = url.replace(/\/$/, "") + `/trang-${maxPage}/`;
      const lastPageResp = await fetch(lastPageUrl, { headers });
      if (lastPageResp.ok) {
        lastPageHtml = await lastPageResp.text();
      }
    }

    let maxChapter = 0;
    const chapterMatches = lastPageHtml.match(/\/chuong-(\d+)/g);
    if (chapterMatches) {
      for (const m of chapterMatches) {
        const numMatch = m.match(/\d+/);
        if (numMatch) {
          const num = parseInt(numMatch[0]);
          if (num > maxChapter) maxChapter = num;
        }
      }
    }

    const textMatches = lastPageHtml.match(/[Cc]hương\s+(\d+)/g);
    if (textMatches) {
      for (const m of textMatches) {
        const numMatch = m.match(/\d+/);
        if (numMatch) {
          const num = parseInt(numMatch[0]);
          if (num > maxChapter) maxChapter = num;
        }
      }
    }

    return { chapter_number: maxChapter, title: `Chương ${maxChapter}` };

  } else if (url.includes("metruyenchu")) {
    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`Fetch MeTruyenChu failed with status ${resp.status}`);
    const html = await resp.text();

    let maxChapter = 0;
    const chapterMatches = html.match(/\/chuong-(\d+)/g);
    if (chapterMatches) {
      for (const m of chapterMatches) {
        const numMatch = m.match(/\d+/);
        if (numMatch) {
          const num = parseInt(numMatch[0]);
          if (num > maxChapter) maxChapter = num;
        }
      }
    }

    const textMatches = html.match(/[Cc]hương\s+(\d+)/g);
    if (textMatches) {
      for (const m of textMatches) {
        const numMatch = m.match(/\d+/);
        if (numMatch) {
          const num = parseInt(numMatch[0]);
          if (num > maxChapter) maxChapter = num;
        }
      }
    }

    const chapterCountMatches = html.match(/(\d+)\s*chương/gi);
    if (chapterCountMatches) {
      for (const m of chapterCountMatches) {
        const numMatch = m.match(/\d+/);
        if (numMatch) {
          const num = parseInt(numMatch[0]);
          if (num > maxChapter) maxChapter = num;
        }
      }
    }

    return { chapter_number: maxChapter, title: `Chương ${maxChapter}` };

  } else if (url.includes("truyendich")) {
    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`Fetch TruyenDich failed with status ${resp.status}`);
    const html = await resp.text();

    let maxChapter = 0;
    const rangeMatches = html.match(/(\d+)\s*-\s*(\d+)/g);
    if (rangeMatches) {
      for (const r of rangeMatches) {
        const match = r.match(/(\d+)\s*-\s*(\d+)/);
        if (match) {
          const endNum = parseInt(match[2]);
          if (endNum > maxChapter) maxChapter = endNum;
        }
      }
    }

    const chapterCountMatches = html.match(/(\d+)\s*chương/gi);
    if (chapterCountMatches) {
      for (const m of chapterCountMatches) {
        const numMatch = m.match(/\d+/);
        if (numMatch) {
          const num = parseInt(numMatch[0]);
          if (num > maxChapter) maxChapter = num;
        }
      }
    }

    const chapterMatches = html.match(/\/chuong-(\d+)/g);
    if (chapterMatches) {
      for (const m of chapterMatches) {
        const numMatch = m.match(/\d+/);
        if (numMatch) {
          const num = parseInt(numMatch[0]);
          if (num > maxChapter) maxChapter = num;
        }
      }
    }

    return { chapter_number: maxChapter, title: `Chương ${maxChapter}` };

  } else if (url.includes("uukanshu")) {
    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`Fetch UUKanShu failed with status ${resp.status}`);
    const html = await resp.text();

    let maxChapter = 0;
    const chapterMatches = html.match(/第\s*(\d+)\s*[章.]?/g);
    if (chapterMatches) {
      for (const m of chapterMatches) {
        const match = m.match(/\d+/);
        if (match) {
          const num = parseInt(match[0]);
          if (num > maxChapter) maxChapter = num;
        }
      }
    }

    const textMatches = html.match(/[Cc]hương\s+(\d+)/g);
    if (textMatches) {
      for (const m of textMatches) {
        const numMatch = m.match(/\d+/);
        if (numMatch) {
          const num = parseInt(numMatch[0]);
          if (num > maxChapter) maxChapter = num;
        }
      }
    }

    return { chapter_number: maxChapter, title: `Chương ${maxChapter}` };

  } else {
    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`Fetch failed with status ${resp.status}`);
    const html = await resp.text();

    let maxChapter = 0;
    const textMatches = html.match(/[Cc]hương\s+(\d+)/g);
    if (textMatches) {
      for (const m of textMatches) {
        const numMatch = m.match(/\d+/);
        if (numMatch) {
          const num = parseInt(numMatch[0]);
          if (num > maxChapter) maxChapter = num;
        }
      }
    }

    const chapterCountMatches = html.match(/(\d+)\s*chương/gi);
    if (chapterCountMatches) {
      for (const m of chapterCountMatches) {
        const numMatch = m.match(/\d+/);
        if (numMatch) {
          const num = parseInt(numMatch[0]);
          if (num > maxChapter) maxChapter = num;
        }
      }
    }

    return { chapter_number: maxChapter, title: `Chương ${maxChapter}` };
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const GITHUB_PAT = Deno.env.get("GITHUB_PAT");
    const GITHUB_OWNER = Deno.env.get("GITHUB_OWNER");
    const GITHUB_REPO = Deno.env.get("GITHUB_REPO");

    const body: ScrapeRequest = await req.json();
    const { story_id, source_url, chapter_start = 1, chapter_limit = 0, action = "scrape" } = body;

    if (!source_url) {
      return new Response(
        JSON.stringify({ error: "source_url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "check_latest") {
      try {
        const latest = await checkLatestChapter(source_url);
        return new Response(
          JSON.stringify({
            success: true,
            latest
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } catch (err: any) {
        console.error("Check latest error:", err);
        return new Response(
          JSON.stringify({ error: `Failed to check latest chapter: ${err.message}` }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    if (!GITHUB_PAT || !GITHUB_OWNER || !GITHUB_REPO) {
      throw new Error("Missing GitHub configuration in environment variables");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: job, error: jobError } = await supabase
      .from("scrape_jobs")
      .insert({
        story_id: story_id || null,
        status: "pending",
        chapter_start,
        chapter_end: chapter_limit,
      })
      .select()
      .single();

    if (jobError) {
      console.error("Failed to create scrape job:", jobError);
      throw new Error(`Failed to create scrape job: ${jobError.message}`);
    }

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
          chapter_start: chapter_start.toString(),
          chapter_limit: chapter_limit.toString(),
        },
      }),
    });

    if (!ghResponse.ok) {
      const errorText = await ghResponse.text();

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
  } catch (error: any) {
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
