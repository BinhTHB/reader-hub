-- ============================================
-- Reader Hub — Initial Database Schema
-- Supabase PostgreSQL Migration
-- ============================================

-- ===========================================
-- 1. PROFILES (extends Supabase auth.users)
-- ===========================================
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'User profiles extending Supabase Auth';

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', 'Reader'));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===========================================
-- 2. STORIES
-- ===========================================
CREATE TABLE public.stories (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    author TEXT,
    description TEXT,
    cover_url TEXT,                              -- R2 URL for cover image
    source_url TEXT,                             -- Original website URL
    source_name TEXT,                            -- e.g. 'truyenfull', 'metruyenchu'
    genres TEXT[] DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'ongoing'       -- ongoing | completed | paused
        CHECK (status IN ('ongoing', 'completed', 'paused')),
    total_chapters INT NOT NULL DEFAULT 0,
    last_scraped_chapter INT NOT NULL DEFAULT 0, -- Track scraping progress
    is_featured BOOLEAN NOT NULL DEFAULT false,
    view_count BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stories IS 'Story metadata catalog';
COMMENT ON COLUMN public.stories.slug IS 'URL-friendly unique identifier';
COMMENT ON COLUMN public.stories.last_scraped_chapter IS 'Last chapter number successfully scraped';

-- ===========================================
-- 3. CHAPTERS
-- ===========================================
CREATE TABLE public.chapters (
    id BIGSERIAL PRIMARY KEY,
    story_id BIGINT NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
    chapter_number INT NOT NULL,
    title TEXT,
    text_r2_url TEXT,                           -- R2 URL for chapter JSON content
    word_count INT NOT NULL DEFAULT 0,
    source_url TEXT,
    is_scraped BOOLEAN NOT NULL DEFAULT false,
    scraped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(story_id, chapter_number)
);

COMMENT ON TABLE public.chapters IS 'Chapter metadata with R2 content links';

-- ===========================================
-- 4. READING HISTORY
-- ===========================================
CREATE TABLE public.reading_history (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    story_id BIGINT NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
    last_chapter_number INT NOT NULL DEFAULT 1,
    scroll_position FLOAT NOT NULL DEFAULT 0,   -- 0.0 to 1.0 (percentage)
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(user_id, story_id)
);

COMMENT ON TABLE public.reading_history IS 'Per-user reading progress tracking';

-- ===========================================
-- 5. BOOKMARKS (favorites)
-- ===========================================
CREATE TABLE public.bookmarks (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    story_id BIGINT NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(user_id, story_id)
);

COMMENT ON TABLE public.bookmarks IS 'User favorite stories';

-- ===========================================
-- 6. SCRAPE JOBS (tracking scraper runs)
-- ===========================================
CREATE TABLE public.scrape_jobs (
    id BIGSERIAL PRIMARY KEY,
    story_id BIGINT REFERENCES public.stories(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    chapter_start INT,
    chapter_end INT,
    chapters_scraped INT NOT NULL DEFAULT 0,
    error_message TEXT,
    github_run_id TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scrape_jobs IS 'Scraper job tracking for monitoring';

-- ===========================================
-- 7. INDEXES
-- ===========================================
CREATE INDEX idx_stories_slug ON public.stories(slug);
CREATE INDEX idx_stories_source ON public.stories(source_name);
CREATE INDEX idx_stories_status ON public.stories(status);
CREATE INDEX idx_stories_featured ON public.stories(is_featured) WHERE is_featured = true;
CREATE INDEX idx_stories_updated ON public.stories(updated_at DESC);

CREATE INDEX idx_chapters_story_num ON public.chapters(story_id, chapter_number);
CREATE INDEX idx_chapters_unscrapped ON public.chapters(story_id) WHERE is_scraped = false;

CREATE INDEX idx_reading_history_user ON public.reading_history(user_id);
CREATE INDEX idx_reading_history_recent ON public.reading_history(user_id, last_read_at DESC);

CREATE INDEX idx_bookmarks_user ON public.bookmarks(user_id);

CREATE INDEX idx_scrape_jobs_status ON public.scrape_jobs(status) WHERE status IN ('pending', 'running');

-- ===========================================
-- 8. ROW LEVEL SECURITY
-- ===========================================

-- Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view profiles"
    ON public.profiles FOR SELECT
    USING (true);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Stories (public read, service-role write)
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read stories"
    ON public.stories FOR SELECT
    USING (true);

-- Chapters (public read, service-role write)
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read chapters"
    ON public.chapters FOR SELECT
    USING (true);

-- Reading History (user-owned)
ALTER TABLE public.reading_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own history"
    ON public.reading_history FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users insert own history"
    ON public.reading_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own history"
    ON public.reading_history FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own history"
    ON public.reading_history FOR DELETE
    USING (auth.uid() = user_id);

-- Bookmarks (user-owned)
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own bookmarks"
    ON public.bookmarks FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users insert own bookmarks"
    ON public.bookmarks FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own bookmarks"
    ON public.bookmarks FOR DELETE
    USING (auth.uid() = user_id);

-- Scrape Jobs (public read for status, service-role write)
ALTER TABLE public.scrape_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read scrape jobs"
    ON public.scrape_jobs FOR SELECT
    USING (true);

-- ===========================================
-- 9. UTILITY FUNCTIONS
-- ===========================================

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_stories_updated_at
    BEFORE UPDATE ON public.stories
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_reading_history_updated_at
    BEFORE UPDATE ON public.reading_history
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Increment story view count (called from app)
CREATE OR REPLACE FUNCTION public.increment_view_count(story_id_input BIGINT)
RETURNS VOID AS $$
BEGIN
    UPDATE public.stories
    SET view_count = view_count + 1
    WHERE id = story_id_input;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
