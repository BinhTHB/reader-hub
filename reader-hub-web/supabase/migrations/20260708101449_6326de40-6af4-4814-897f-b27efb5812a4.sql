
-- Restrict profile reads to authenticated users
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Prevent privilege escalation: only existing admins may toggle is_admin
CREATE OR REPLACE FUNCTION public.prevent_is_admin_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_is_admin boolean;
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    SELECT p.is_admin INTO caller_is_admin
      FROM public.profiles p
     WHERE p.id = auth.uid();
    IF NOT COALESCE(caller_is_admin, false) THEN
      RAISE EXCEPTION 'Only admins can change is_admin';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_is_admin_self_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_is_admin_self_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_is_admin_self_escalation();
