/**
 * Source Search API — Search for stories across multiple websites
 *
 * Calls the Supabase Edge Function "search-sources" which searches
 * truyenfull.vision, metruyenchu.com.vn, etc. in parallel.
 */

import { supabase } from "./supabase";

export interface SearchResult {
  title: string;
  author: string | null;
  coverUrl: string | null;
  sourceUrl: string;
  sourceName: string;
  sourceDisplay: string;
}

export interface SourceResults {
  source_name: string;
  source_display: string;
  results: SearchResult[];
  error?: string;
}

export interface MultiSearchResponse {
  query: string;
  sources: SourceResults[];
  total_results: number;
}

/**
 * Search for stories across all source websites.
 *
 * @param query - Story name to search for
 * @returns Results grouped by source website
 */
export async function searchSources(query: string): Promise<MultiSearchResponse> {
  const { data, error } = await supabase.functions.invoke("search-sources", {
    body: { query },
  });

  if (error) {
    throw new Error(`Search failed: ${error.message}`);
  }

  return data as MultiSearchResponse;
}
