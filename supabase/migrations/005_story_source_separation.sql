-- ============================================
-- Reader Hub — Story Source Separation Indexes
-- Supports fast lookup by source_url and source_name
-- without breaking existing story slugs/R2 paths.
-- ============================================

CREATE INDEX IF NOT EXISTS idx_stories_source_url
    ON public.stories (source_url)
    WHERE source_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stories_source_name
    ON public.stories (source_name)
    WHERE source_name IS NOT NULL;
