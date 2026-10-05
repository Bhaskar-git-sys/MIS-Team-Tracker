CREATE OR REPLACE FUNCTION public.get_login_email(p_username text)
RETURNS TABLE (
  user_id uuid,
  email text,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    p.id AS user_id,
    COALESCE(NULLIF(BTRIM(p.email), ''), u.email) AS email,
    COALESCE(p.status, 'Active') AS status
  FROM public.profiles AS p
  LEFT JOIN auth.users AS u ON u.id = p.id
  WHERE LOWER(p.username) = LOWER(BTRIM(p_username))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_login_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_login_email(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';