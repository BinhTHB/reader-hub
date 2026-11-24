-- Reader Hub — Performance migration
-- 1. Bỏ index trùng (đã có sẵn từ UNIQUE constraint)
DROP INDEX IF EXISTS public.idx_stories_slug;
DROP INDEX IF EXISTS public.idx_chapters_story_num;
DROP INDEX IF EXISTS public.idx_reading_history_user;
DROP INDEX IF EXISTS public.idx_bookmarks_user;

-- 2. Index còn thiếu
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_stories_title_trgm ON public.stories USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_stories_author_trgm ON public.stories USING GIN (author gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_stories_genres_gin ON public.stories USING GIN (genres);
CREATE INDEX IF NOT EXISTS idx_stories_view_count ON public.stories (view_count DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_stories_total_chapters ON public.stories (total_chapters DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_created ON public.bookmarks (user_id, created_at DESC);

-- 3. RPC đếm truyện theo nhóm thể loại (1 round-trip, giữ đúng ngữ nghĩa overlaps)
CREATE OR REPLACE FUNCTION public.get_genre_counts(p_groups jsonb)
RETURNS TABLE(genre text, story_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT k.key,
         (SELECT count(*) FROM public.stories s
           WHERE s.genres && ARRAY(SELECT jsonb_array_elements_text(k.value)))::bigint
  FROM jsonb_each(p_groups) AS k;
$$;
GRANT EXECUTE ON FUNCTION public.get_genre_counts(jsonb) TO anon, authenticated;

-- 4. RPC lấy toàn bộ số chương của 1 truyện (thay vòng lặp phân trang 500)
CREATE OR REPLACE FUNCTION public.get_chapter_numbers(p_story_id bigint)
RETURNS integer[]
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT coalesce(array_agg(chapter_number ORDER BY chapter_number), '{}')
  FROM public.chapters WHERE story_id = p_story_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_chapter_numbers(bigint) TO anon, authenticated;

-- 5. Tăng view_count không còn đẩy updated_at
CREATE OR REPLACE FUNCTION public.update_stories_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'view_count' - 'updated_at') IS DISTINCT FROM
     (to_jsonb(OLD) - 'view_count' - 'updated_at') THEN
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS set_stories_updated_at ON public.stories;
CREATE TRIGGER set_stories_updated_at BEFORE UPDATE ON public.stories
  FOR EACH ROW EXECUTE FUNCTION public.update_stories_updated_at();

-- 6. RLS: bọc auth.uid() trong SELECT để Postgres cache (initPlan)
DO $$
DECLARE r record; new_qual text; new_check text;
BEGIN
  FOR r IN SELECT tablename, policyname, qual, with_check FROM pg_policies
           WHERE schemaname = 'public' AND tablename IN ('profiles','reading_history','bookmarks')
  LOOP
    new_qual := CASE WHEN r.qual IS NOT NULL AND position('SELECT auth.uid()' in r.qual) = 0
                     THEN replace(r.qual, 'auth.uid()', '(SELECT auth.uid())') END;
    new_check := CASE WHEN r.with_check IS NOT NULL AND position('SELECT auth.uid()' in r.with_check) = 0
                      THEN replace(r.with_check, 'auth.uid()', '(SELECT auth.uid())') END;
    IF new_qual IS NOT NULL AND new_qual <> r.qual THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)', r.policyname, r.tablename, new_qual);
    END IF;
    IF new_check IS NOT NULL AND new_check <> r.with_check THEN
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)', r.policyname, r.tablename, new_check);
    END IF;
  END LOOP;
END $$;
