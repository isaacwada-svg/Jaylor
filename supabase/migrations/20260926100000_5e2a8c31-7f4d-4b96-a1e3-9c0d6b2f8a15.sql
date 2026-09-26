-- Platform-admin roles: turn the single "you're in or you're out" membership
-- table into a tiered access model (super_admin / admin / support), so the
-- owner can bring on staff without handing everyone full control -- and so
-- nobody, not even another super admin, can demote or remove a super
-- admin's own row except that person themselves.

DO $$
BEGIN
  -- ON CONFLICT (user_id) below needs a unique/PK constraint on the column;
  -- guard rather than assume, since this table's shape was never migration-
  -- tracked before now.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.platform_admins'::regclass AND contype IN ('p', 'u')
  ) THEN
    ALTER TABLE public.platform_admins ADD CONSTRAINT platform_admins_user_id_key UNIQUE (user_id);
  END IF;
END $$;

ALTER TABLE public.platform_admins
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES auth.users(id);

ALTER TABLE public.platform_admins DROP CONSTRAINT IF EXISTS platform_admins_role_check;
ALTER TABLE public.platform_admins
  ADD CONSTRAINT platform_admins_role_check CHECK (role IN ('super_admin', 'admin', 'support'));

-- Whoever already has access today keeps full access under the new model --
-- nobody loses anything when this ships.
UPDATE public.platform_admins SET role = 'super_admin' WHERE role = 'admin';

CREATE OR REPLACE FUNCTION public.admin_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.platform_admins WHERE user_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.admin_my_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_my_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_team()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'user_id', pa.user_id,
      'email', u.email,
      'full_name', u.raw_user_meta_data ->> 'full_name',
      'role', pa.role,
      'label', pa.label,
      'created_at', pa.created_at,
      'is_you', pa.user_id = auth.uid()
    ) ORDER BY (pa.role = 'super_admin') DESC, pa.created_at), '[]'::jsonb)
    FROM public.platform_admins pa
    JOIN auth.users u ON u.id = pa.user_id
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_team() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_add_team_member(p_email text, p_role text, p_label text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_user_id uuid;
BEGIN
  SELECT role INTO v_caller_role FROM public.platform_admins WHERE user_id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Only a super admin can add team members';
  END IF;
  IF p_role NOT IN ('admin', 'support') THEN
    RAISE EXCEPTION 'Role must be admin or support';
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(trim(p_email));
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No Jaylor account found for that email -- they need to sign up first';
  END IF;

  INSERT INTO public.platform_admins (user_id, role, label, invited_by)
  VALUES (v_user_id, p_role, nullif(trim(p_label), ''), auth.uid())
  ON CONFLICT (user_id) DO UPDATE
    SET role = excluded.role, label = coalesce(excluded.label, public.platform_admins.label)
    WHERE public.platform_admins.role <> 'super_admin';

  RETURN jsonb_build_object('user_id', v_user_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_add_team_member(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_team_member(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_team_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_target_role text;
BEGIN
  SELECT role INTO v_caller_role FROM public.platform_admins WHERE user_id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Only a super admin can change team roles';
  END IF;
  IF p_role NOT IN ('admin', 'support') THEN
    RAISE EXCEPTION 'Role must be admin or support';
  END IF;

  SELECT role INTO v_target_role FROM public.platform_admins WHERE user_id = p_user_id;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'That person is not on the team';
  END IF;
  IF v_target_role = 'super_admin' AND p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'A super admin''s own access can only be changed by themselves';
  END IF;
  IF v_target_role = 'super_admin'
    AND (SELECT count(*) FROM public.platform_admins WHERE role = 'super_admin') <= 1 THEN
    RAISE EXCEPTION 'At least one super admin must remain';
  END IF;

  UPDATE public.platform_admins SET role = p_role WHERE user_id = p_user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_update_team_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_team_role(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_remove_team_member(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_target_role text;
BEGIN
  SELECT role INTO v_caller_role FROM public.platform_admins WHERE user_id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Only a super admin can remove team members';
  END IF;

  SELECT role INTO v_target_role FROM public.platform_admins WHERE user_id = p_user_id;
  IF v_target_role IS NULL THEN
    RETURN;
  END IF;
  IF v_target_role = 'super_admin' AND p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'A super admin can only be removed by themselves';
  END IF;
  IF v_target_role = 'super_admin'
    AND (SELECT count(*) FROM public.platform_admins WHERE role = 'super_admin') <= 1 THEN
    RAISE EXCEPTION 'At least one super admin must remain';
  END IF;

  DELETE FROM public.platform_admins WHERE user_id = p_user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_remove_team_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_team_member(uuid) TO authenticated;
