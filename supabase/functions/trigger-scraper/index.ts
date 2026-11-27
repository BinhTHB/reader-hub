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
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.48/deno-dom-wasm.ts";

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
  force_rediscover?: boolean;
  action?: "scrape" | "check_latest";
}

function normalizeDomain(rawUrl: string): string {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return "";
  }
}

function parseFormattedInt(raw: string): number {
  const cleaned = /^\d{1,3}(?:[,.]\d{3})+$/.test(raw)
    ? raw.replace(/[,.]/g, "")
    : raw.replace(/,/g, "");
  return parseInt(cleaned, 10);
}

function extractChapterNumber(text: string, href?: string): number | null {
  const cleanText = (text || "").replace(/\s+/g, " ").trim();
  const chMatch = cleanText.match(/(?:chương|chuong|chapter|chap|c\.?|第)\s*(\d{1,3}(?:[,.]\d{3})+(?!\d)|\d+)/i);
  if (chMatch) {
    return parseFormattedInt(chMatch[1]);
  }
  const leadMatch = cleanText.match(/^\s*(\d{1,3}(?:[,.]\d{3})+(?!\d)|\d+)\s*[.:\-–—\s]/);
  if (leadMatch) {
    return parseFormattedInt(leadMatch[1]);
  }
  if (href) {
    const urlMatch = href.match(/(\d+)(?:[./?#]|$)/);
    if (urlMatch) {
      const candidate = parseInt(urlMatch[1], 10);
      if (candidate > 0 && candidate <= 50000) return candidate;
    }
  }
  return null;
}

async function checkLatestChapter(
  sourceUrl: string,
  supabase: ReturnType<typeof createClient>,
): Promise<{ chapter_number: number; title: string }> {
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

    const textMatches = lastPageHtml.match(/[Cc]hương\s+(\d{1,3}(?:,\d{3})+|\d+)/g);
    if (textMatches) {
      for (const m of textMatches) {
        const numMatch = m.match(/\d{1,3}(?:,\d{3})+|\d+/);
        if (numMatch) {
          const num = parseInt(numMatch[0].replace(/,/g, ""), 10);
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

    const textMatches = html.match(/[Cc]hương\s+(\d{1,3}(?:,\d{3})+|\d+)/g);
    if (textMatches) {
      for (const m of textMatches) {
        const numMatch = m.match(/\d{1,3}(?:,\d{3})+|\d+/);
        if (numMatch) {
          const num = parseInt(numMatch[0].replace(/,/g, ""), 10);
          if (num > maxChapter) maxChapter = num;
        }
      }
    }

    const chapterCountMatches = html.match(/(\d{1,3}(?:,\d{3})+|\d+)\s*chương/gi);
    if (chapterCountMatches) {
      for (const m of chapterCountMatches) {
        const numMatch = m.match(/\d{1,3}(?:,\d{3})+|\d+/);
        if (numMatch) {
          const num = parseInt(numMatch[0].replace(/,/g, ""), 10);
          if (num > maxChapter) maxChapter = num;
        }
      }
    }

    return { chapter_number: maxChapter, title: `Chương ${maxChapter}` };

  } else if (url.includes("truyendich")) {
    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`Fetch TruyenDich failed with status ${resp.status}`);
    const html = await resp.text();
    
    // Normalize escaped quotes in Next.js payload
    const normalized = html.replace(/\\"/g, '"');
    
    let maxChapter = 0;
    
    // 1. Try to extract from Next.js initialData.total (most reliable)
    const totalMatch = normalized.match(/"total"\s*:\s*(\d+)/);
    if (totalMatch) {
      const total = parseInt(totalMatch[1]);
      if (total > 0 && total < 100000) maxChapter = total;
    }
    
    // 2. Try to extract from latestChapters[0].chapter_number
    if (maxChapter === 0) {
      const latestMatch = normalized.match(/"latestChapters"\s*:\s*\[\s*\{[^}]*"chapter_number"\s*:\s*(\d+)/);
      if (latestMatch) {
        const latest = parseInt(latestMatch[1]);
        if (latest > 0 && latest < 100000) maxChapter = latest;
      }
    }
    
    // 3. Try "Số chương" field in DOM
    if (maxChapter === 0) {
      const chapterCountMatch = normalized.match(/Số chương[\s\S]{0,100}?(\d+)</i);
      if (chapterCountMatch) {
        const count = parseInt(chapterCountMatch[1]);
        if (count > 0 && count < 100000) maxChapter = count;
      }
    }
    
    // 4. Fallback: find /chuong-N links (only in href context, not in script filenames)
    if (maxChapter === 0) {
      const chapterLinkMatches = html.match(/href="[^"]*\/chuong-(\d+)[^"]*"/g);
      if (chapterLinkMatches) {
        for (const m of chapterLinkMatches) {
          const numMatch = m.match(/chuong-(\d+)/);
          if (numMatch) {
            const num = parseInt(numMatch[1]);
            if (num > maxChapter) maxChapter = num;
          }
        }
      }
    }
    
    // 5. Last resort: "N chương" text (but only if we haven't found anything)
    if (maxChapter === 0) {
      const chapterCountMatches = html.match(/(\d+)\s*chương/gi);
      if (chapterCountMatches) {
        for (const m of chapterCountMatches) {
          const numMatch = m.match(/\d+/);
          if (numMatch) {
            const num = parseInt(numMatch[0]);
            if (num > maxChapter && num < 100000) maxChapter = num;
          }
        }
      }
    }

    if (maxChapter === 0) {
      throw new Error("Unable to detect latest TruyenDich chapter");
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

    // 1. Single Source of Truth: use verified CSS selectors from scrape_sources if available
    const domain = normalizeDomain(url);
    if (domain) {
      const { data: sourceRow } = await supabase
        .from("scrape_sources")
        .select("base_url, selectors")
        .eq("domain", domain)
        .eq("enabled", true)
        .maybeSingle();

      const selectors = sourceRow?.selectors as Record<string, any> | null;
      const listCss = typeof selectors?.chapter_list === "string" ? selectors.chapter_list.trim() : "";

      if (listCss) {
        try {
          const parser = new DOMParser();
          const document = parser.parseFromString(html, "text/html");
          let targetDoc = document;
          let matchedLinks = targetDoc ? Array.from(targetDoc.querySelectorAll(listCss)) : [];

          const pagCss = typeof selectors?.pagination_links === "string" ? selectors.pagination_links.trim() : "";
          const pagePattern = typeof selectors?.page_url_pattern === "string" ? selectors.page_url_pattern.trim() : "";

          if (document && pagCss && pagePattern) {
            let maxPage = 1;
            for (const el of Array.from(document.querySelectorAll(pagCss)) as any[]) {
              const candidates = [el.textContent || "", el.getAttribute?.("href") || ""];
              for (const cand of candidates) {
                const nums = cand.match(/\d+/g) || [];
                for (const n of nums) {
                  const val = parseInt(n, 10);
                  if (val >= 1 && val <= 5000 && val > maxPage) maxPage = val;
                }
              }
            }
            if (maxPage > 1) {
              const baseUrl = String(sourceRow?.base_url || new URL(url).origin).replace(/\/$/, "");
              const cleanStory = url.replace(/\/$/, "");
              const normalizedPattern = pagePattern
                .replace(/\{story_url\}(?=[^/?#])/, "{story_url}/")
                .replace(/\{base_url\}(?=[^/?#])/, "{base_url}/");
              const lastPageUrl = normalizedPattern
                .replace("{story_url}", cleanStory)
                .replace("{base_url}", baseUrl)
                .replace("{page}", String(maxPage));
              const lastResp = await fetch(lastPageUrl, { headers });
              if (lastResp.ok) {
                const lastHtml = await lastResp.text();
                targetDoc = parser.parseFromString(lastHtml, "text/html");
                matchedLinks = targetDoc ? Array.from(targetDoc.querySelectorAll(listCss)) : [];
              }
            }
          }

          let maxParsed = 0;
          for (const node of matchedLinks as any[]) {
            const linkEl = node.tagName === "A" ? node : node.querySelector?.("a") || node;
            const href = linkEl.getAttribute?.("href") || "";
            const num = extractChapterNumber(linkEl.textContent || "", href);
            if (num !== null && num > maxParsed) maxParsed = num;
          }
          maxChapter = Math.max(maxParsed, matchedLinks.length);
        } catch (domErr) {
          console.warn("scrape_sources DOM check fallback:", domErr);
        }
      }
    }

    // 2. Fallback regex (supports both comma and dot thousands separators, VN & EN)
    if (maxChapter === 0) {
      const textMatches = html.match(/(?:[Cc]hương|[Cc]hapter)\s+(\d{1,3}(?:[,.]\d{3})+(?!\d)|\d+)/g);
      if (textMatches) {
        for (const m of textMatches) {
          const numMatch = m.match(/\d{1,3}(?:[,.]\d{3})+(?!\d)|\d+/);
          if (numMatch) {
            const num = parseFormattedInt(numMatch[0]);
            if (num > maxChapter) maxChapter = num;
          }
        }
      }

      const chapterCountMatches = html.match(/(\d{1,3}(?:[,.]\d{3})+(?!\d)|\d+)\s*(?:chương|chapters?)/gi);
      if (chapterCountMatches) {
        for (const m of chapterCountMatches) {
          const numMatch = m.match(/\d{1,3}(?:[,.]\d{3})+(?!\d)|\d+/);
          if (numMatch) {
            const num = parseFormattedInt(numMatch[0]);
            if (num > maxChapter) maxChapter = num;
          }
        }
      }
    }

    if (maxChapter === 0) {
      throw new Error("Nguồn này chưa hỗ trợ kiểm tra nhanh số chương; hãy bấm Cào tiếp trực tiếp.");
    }
    return { chapter_number: maxChapter, title: `Chương ${maxChapter}` };
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

    const GITHUB_PAT = Deno.env.get("GITHUB_PAT");
    const GITHUB_OWNER = Deno.env.get("GITHUB_OWNER");
    const GITHUB_REPO = Deno.env.get("GITHUB_REPO");

    const body: ScrapeRequest = await req.json();
    const {
      story_id,
      source_url,
      chapter_start = 1,
      chapter_limit = 0,
      force_rediscover = false,
      action = "scrape",
    } = body;

    if (!source_url) {
      return new Response(
        JSON.stringify({ error: "source_url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "check_latest") {
      try {
        const latest = await checkLatestChapter(source_url, supabase);
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
          force_rediscover: String(Boolean(force_rediscover)),
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
