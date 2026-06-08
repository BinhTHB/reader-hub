-- ===========================================
-- Reader Hub — Delete Policies Migration
-- Allows authenticated users to delete stories and chapters
-- ===========================================

-- ===========================================
-- 1. DELETE POLICY: STORIES
-- ===========================================
CREATE POLICY "Users can delete stories"
    ON public.stories FOR DELETE
    USING (auth.role() = 'authenticated');

-- ===========================================
-- 2. DELETE POLICY: CHAPTERS
-- ===========================================
CREATE POLICY "Users can delete chapters"
    ON public.chapters FOR DELETE
    USING (auth.role() = 'authenticated');
