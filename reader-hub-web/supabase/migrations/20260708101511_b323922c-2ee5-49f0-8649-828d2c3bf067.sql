
REVOKE EXECUTE ON FUNCTION public.prevent_is_admin_self_escalation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_is_admin_self_escalation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_is_admin_self_escalation() FROM authenticated;
