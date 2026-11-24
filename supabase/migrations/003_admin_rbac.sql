-- Reader Hub — Admin RBAC & Security Hardening
-- 1. Thêm cột role cho profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin'));

CREATE INDEX IF NOT EXISTS idx_profiles_admin
  ON public.profiles (id) WHERE role = 'admin';

-- 2. Chống leo thang quyền: user thường không thể tự UPDATE profiles.role thành 'admin'
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
       AND current_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'Forbidden: cannot modify role' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- 3. Hàm kiểm tra quyền admin (SECURITY DEFINER để dùng trong RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- 4. RLS cho phép duy nhất Admin thêm/sửa/xoá stories và chapters
DROP POLICY IF EXISTS "Admins can insert stories" ON public.stories;
CREATE POLICY "Admins can insert stories"
  ON public.stories FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update stories" ON public.stories;
CREATE POLICY "Admins can update stories"
  ON public.stories FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete stories" ON public.stories;
CREATE POLICY "Admins can delete stories"
  ON public.stories FOR DELETE
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update chapters" ON public.chapters;
CREATE POLICY "Admins can update chapters"
  ON public.chapters FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete chapters" ON public.chapters;
CREATE POLICY "Admins can delete chapters"
  ON public.chapters FOR DELETE
  USING (public.is_admin());
