alter table public.event_participants
  add column if not exists fabric_photo_path text,
  add column if not exists self_measurements jsonb,
  add column if not exists self_measurements_unit text,
  add column if not exists self_measurements_submitted_at timestamptz;

create or replace function public.set_participant_fabric_photo(p_token uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_id uuid;
begin
  if p_token is null or p_path is null or p_path !~ '^[0-9a-fA-F-]{36}/fabric/[0-9a-fA-F-]+\.jpg$' then
    raise exception 'Invalid input' using errcode = '22023';
  end if;
  select id into v_id from public.event_participants
    where token = p_token and coalesce(status, 'pending') <> 'cancelled';
  if v_id is null then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  update public.event_participants set fabric_photo_path = p_path where id = v_id;
end;
$$;

create or replace function public.set_participant_measurements(p_token uuid, p_values jsonb, p_unit text)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_id uuid;
begin
  if p_token is null or p_values is null or jsonb_typeof(p_values) <> 'object'
     or p_unit not in ('in', 'cm') then
    raise exception 'Invalid input' using errcode = '22023';
  end if;
  select id into v_id from public.event_participants
    where token = p_token and coalesce(status, 'pending') <> 'cancelled';
  if v_id is null then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  update public.event_participants
    set self_measurements = p_values,
        self_measurements_unit = p_unit,
        self_measurements_submitted_at = now()
  where id = v_id;
end;
$$;

revoke execute on function public.set_participant_fabric_photo(uuid, text) from public;
revoke execute on function public.set_participant_measurements(uuid, jsonb, text) from public;
grant execute on function public.set_participant_fabric_photo(uuid, text) to anon, authenticated, service_role;
grant execute on function public.set_participant_measurements(uuid, jsonb, text) to anon, authenticated, service_role;

create table if not exists public.rls_drift_checks (
  id uuid primary key default gen_random_uuid(),
  checked_at timestamptz not null default now(),
  ok boolean not null,
  report jsonb not null
);

grant select on public.rls_drift_checks to authenticated;
grant all on public.rls_drift_checks to service_role;
alter table public.rls_drift_checks enable row level security;
drop policy if exists "Platform admins view drift checks" on public.rls_drift_checks;
create policy "Platform admins view drift checks"
  on public.rls_drift_checks for select
  to authenticated
  using (public.is_platform_admin());

create or replace function public.check_rls_drift()
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_no_rls text[];
  v_public_policies text[];
  v_bad_anon text[];
  v_bad_authed text[];
  v_report jsonb;
  v_ok boolean;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized';
  end if;

  select coalesce(array_agg(format('%I', tablename) order by tablename), '{}')
    into v_no_rls
  from pg_tables
  where schemaname = 'public' and not rowsecurity;

  select coalesce(array_agg(format('%I on %I', policyname, tablename) order by tablename, policyname), '{}')
    into v_public_policies
  from pg_policies
  where schemaname = 'public' and 'public' = any(roles);

  select coalesce(array_agg(format('%I: %s', table_name, privilege_type) order by table_name, privilege_type), '{}')
    into v_bad_anon
  from (
    select distinct c.relname as table_name, a.privilege_type
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
    cross join lateral unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) as a(privilege_type)
    where n.nspname = 'public'
      and c.relkind = 'r'
      and acl.grantee = 'anon'::regrole
      and has_table_privilege('anon', c.oid, a.privilege_type)
      and not (
        (c.relname = 'consultation_requests' and a.privilege_type = 'INSERT') or
        (c.relname = 'sew_requests' and a.privilege_type = 'INSERT') or
        (c.relname = 'leads' and a.privilege_type = 'INSERT') or
        (c.relname = 'analytics_events' and a.privilege_type = 'INSERT') or
        (c.relname = 'storefront_items' and a.privilege_type = 'SELECT')
      )
  ) s;

  select coalesce(array_agg(format('%I: %s', table_name, privilege_type) order by table_name, privilege_type), '{}')
    into v_bad_authed
  from (
    select distinct c.relname as table_name, a.privilege_type
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
    cross join lateral unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) as a(privilege_type)
    where n.nspname = 'public'
      and c.relkind = 'r'
      and acl.grantee = 'authenticated'::regrole
      and has_table_privilege('authenticated', c.oid, a.privilege_type)
      and c.relname in ('app_settings', 'audit_logs', 'rls_drift_checks')
  ) s;

  v_ok := array_length(v_no_rls, 1) is null
    and array_length(v_public_policies, 1) is null
    and array_length(v_bad_anon, 1) is null
    and array_length(v_bad_authed, 1) is null;

  v_report := jsonb_build_object(
    'checked_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'ok', v_ok,
    'tables_without_rls', to_jsonb(v_no_rls),
    'public_role_policies', to_jsonb(v_public_policies),
    'unexpected_anon_grants', to_jsonb(v_bad_anon),
    'unexpected_authenticated_grants', to_jsonb(v_bad_authed)
  );

  insert into public.rls_drift_checks (ok, report) values (v_ok, v_report);
end;
$$;

revoke execute on function public.check_rls_drift() from public;
grant execute on function public.check_rls_drift() to authenticated, service_role;