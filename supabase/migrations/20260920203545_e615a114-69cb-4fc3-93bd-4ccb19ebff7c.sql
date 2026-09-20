CREATE OR REPLACE FUNCTION public.resolve_login_email(p_phone text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.email
  FROM public.phone_directory d
  JOIN auth.users u ON u.id = d.user_id
  WHERE d.phone = p_phone
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.resolve_login_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated;