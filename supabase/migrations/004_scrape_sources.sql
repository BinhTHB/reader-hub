-- Reader Hub — Dynamic Scrape Sources (AI Auto-Selector & Manual Rules)
CREATE TABLE IF NOT EXISTS public.scrape_sources (
    id BIGSERIAL PRIMARY KEY,
    domain TEXT UNIQUE NOT NULL,
    display_name TEXT,
    base_url TEXT NOT NULL,
    selectors JSONB NOT NULL,
    generated_by TEXT NOT NULL DEFAULT 'ai'
        CHECK (generated_by IN ('ai', 'manual')),
    model_name TEXT,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    enabled BOOLEAN NOT NULL DEFAULT true,
    last_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scrape_sources IS 'Dynamic CSS selector configs per domain (AI-discovered or manual)';

CREATE INDEX IF NOT EXISTS idx_scrape_sources_domain
    ON public.scrape_sources (domain)
    WHERE enabled = true;

DROP TRIGGER IF EXISTS set_scrape_sources_updated_at ON public.scrape_sources;
CREATE TRIGGER set_scrape_sources_updated_at
    BEFORE UPDATE ON public.scrape_sources
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.scrape_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read scrape_sources" ON public.scrape_sources;
CREATE POLICY "Public read scrape_sources"
    ON public.scrape_sources FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Admins manage scrape_sources" ON public.scrape_sources;
CREATE POLICY "Admins manage scrape_sources"
    ON public.scrape_sources FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
