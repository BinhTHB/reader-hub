/**
 * Supabase Edge Function: search-sources
 *
 * Triggers GitHub Actions to search for a story across multiple source websites.
 * Returns the job ID immediately; the app polls for results.
 *
 * OR â€” for faster results â€” does a lightweight HTTP search directly
 * (without Playwright) using simple fetch + regex parsing.
 *
 * Request body:
 * { "query": "Äáº¥u La Äáº¡i Lá»¥c" }
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// â”€â”€â”€ Site Configuration (mirrors scraper/sites_config.py) â”€â”€â”€â”€
interface SiteConfig {
  name: string;
  displayName: string;
  searchUrl: (query: string) => string;
  parseResults: (html: string, baseUrl: string) => SearchResult[];
}

interface SearchResult {
  title: string;
  author: string | null;
  coverUrl: string | null;
  sourceUrl: string;
  sourceName: string;
  sourceDisplay: string;
}

const SITES: SiteConfig[] = [
  {
    name: "truyenfull",
    displayName: "TruyenFull",
    searchUrl: (q: string) =>
      `https://truyenfull.vision/tim-kiem/?tukhoa=${encodeURIComponent(q)}`,
    parseResults: (html: string, _baseUrl: string): SearchResult[] => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      if (!doc) return [];

      const results: SearchResult[] = [];
      const rows = doc.querySelectorAll(".list-truyen .row, .list .row");

      for (const row of rows) {
        const titleEl = row.querySelector(".truyen-title a, h3.title a, h3 a");
        if (!titleEl) continue;

        const title = titleEl.textContent?.trim() || "";
        const href = titleEl.getAttribute("href") || "";

        const authorEl = row.querySelector(".author, span.author");
        const author = authorEl?.textContent?.trim() || null;

        const imgEl = row.querySelector("img");
        const coverUrl = imgEl?.getAttribute("src") || null;

        const sourceUrl = href.startsWith("http")
          ? href
          : `https://truyenfull.vision${href}`;

        results.push({
          title,
          author,
          coverUrl,
          sourceUrl,
          sourceName: "truyenfull",
          sourceDisplay: "TruyenFull",
        });
      }
      return results;
    },
  },
  {
    name: "metruyenchu",
    displayName: "MeTruyenChu",
    searchUrl: (q: string) =>
      `https://metruyenchuvn.com/search?q=${encodeURIComponent(q)}`,
    parseResults: (html: string, _baseUrl: string): SearchResult[] => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      if (!doc) return [];

      const results: SearchResult[] = [];
      const items = doc.querySelectorAll(".truyen-list .item");

      for (const item of items) {
        let linkEl = item.querySelector("a.cover");
        let imgEl = linkEl ? linkEl.querySelector("img") : null;

        if (!linkEl) {
          linkEl = item.querySelector("a");
        }

        if (!linkEl) continue;

        const href = linkEl.getAttribute("href") || "";
        let title = linkEl.getAttribute("title")?.trim() || "";
        if (!title) {
          title = linkEl.textContent?.trim() || "";
        }
        title = title.replace(/\s*Đọc online\s*$/i, "").trim();

        const genreI = linkEl.querySelector("i");
        if (genreI) {
          const genreText = genreI.textContent?.trim() || "";
          if (genreText) {
            title = title.replace(genreText, "").trim();
          }
        }

        const coverUrl = imgEl?.getAttribute("src") || null;
        const fullCoverUrl = coverUrl
          ? (coverUrl.startsWith("http") ? coverUrl : "https://metruyenchuvn.com" + coverUrl)
          : null;

        const sourceUrl = href.startsWith("http")
          ? href
          : "https://metruyenchuvn.com" + href;

        results.push({
          title,
          author: null,
          coverUrl: fullCoverUrl,
          sourceUrl,
          sourceName: "metruyenchu",
          sourceDisplay: "MeTruyenChu",
        });
      }
      return results;
    },
  },
  {
    name: "truyendich",
    displayName: "TruyenDich.AI",
    searchUrl: (q: string) =>
      `https://truyendich.ai/tim-kiem?q=${encodeURIComponent(q)}`,
    parseResults: (html: string, _baseUrl: string): SearchResult[] => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      if (!doc) return [];

      const results: SearchResult[] = [];
      const links = doc.querySelectorAll("a[href*='/doc-truyen/']");

      for (const link of links) {
        const href = link.getAttribute("href") || "";
        
        // Skip chapter links
        if (href.includes("/chuong-")) continue;
        
        const title = link.getAttribute("title")?.trim() || link.textContent?.trim() || "";
        if (!title) continue;

        // Try to find author and cover from parent
        let author: string | null = null;
        let coverUrl: string | null = null;
        
        const parent = link.closest(".story-item, .search-item, li, div[class*='result']") || link.parentElement?.parentElement;
        if (parent) {
          const authorEl = parent.querySelector(".author, [class*='author']");
          if (authorEl) author = authorEl.textContent?.trim() || null;
          
          let imgEl = parent.querySelector("img[src*='cover'], img[src*='thumb'], img[src*='story']");
          if (!imgEl) imgEl = parent.querySelector("img");
          if (imgEl) {
            const src = imgEl.getAttribute("src") || "";
            coverUrl = src.startsWith("http") ? src : `https://truyendich.ai${src}`;
          }
        }

        const sourceUrl = href.startsWith("http")
          ? href
          : `https://truyendich.ai${href}`;

        results.push({
          title,
          author,
          coverUrl,
          sourceUrl,
          sourceName: "truyendich",
          sourceDisplay: "TruyenDich.AI",
        });
      }
      
      return results;
    },
  },
];

// â”€â”€â”€ Main Handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();

    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: "Query must be at least 2 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const trimmedQuery = query.trim();

    // Search all sites in parallel using simple HTTP fetch
    const searchPromises = SITES.map(async (site) => {
      try {
        const url = site.searchUrl(trimmedQuery);
        const resp = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept: "text/html",
            "Accept-Language": "vi-VN,vi;q=0.9",
          },
          // Deno fetch timeout
          signal: AbortSignal.timeout(15000),
        });

        if (!resp.ok) {
          return {
            source_name: site.name,
            source_display: site.displayName,
            results: [],
            error: `HTTP ${resp.status}`,
          };
        }

        const html = await resp.text();
        const results = site.parseResults(html, "");

        return {
          source_name: site.name,
          source_display: site.displayName,
          results,
        };
      } catch (e: any) {
        return {
          source_name: site.name,
          source_display: site.displayName,
          results: [],
          error: e.message,
        };
      }
    });

    const sources = await Promise.all(searchPromises);
    const totalResults = sources.reduce((sum, s) => sum + s.results.length, 0);

    return new Response(
      JSON.stringify({
        query: trimmedQuery,
        sources,
        total_results: totalResults,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
