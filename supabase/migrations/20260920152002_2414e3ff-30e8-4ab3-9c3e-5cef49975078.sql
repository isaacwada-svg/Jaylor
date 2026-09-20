create or replace function public.admin_update_plan(
  p_code text,
  p_name text,
  p_price_monthly numeric,
  p_price_quarterly numeric,
  p_limits jsonb,
  p_features jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized';
  end if;

  update public.plans
  set name = p_name,
      price_monthly = p_price_monthly,
      price_quarterly = p_price_quarterly,
      limits = p_limits,
      features = p_features
  where code = p_code;
end;
$$;

revoke execute on function public.admin_update_plan(text, text, numeric, numeric, jsonb, jsonb) from public, anon;
grant execute on function public.admin_update_plan(text, text, numeric, numeric, jsonb, jsonb) to authenticated;

create or replace function public.admin_list_audit_logs(p_limit int default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_result
  from (
    select
      a.id,
      a.store_id,
      s.name as store_name,
      a.actor_id,
      p.full_name as actor_name,
      a.action,
      a.entity,
      a.entity_id,
      a.metadata,
      a.created_at
    from public.audit_logs a
    left join public.stores s on s.id = a.store_id
    left join public.profiles p on p.id = a.actor_id
    order by a.created_at desc
    limit greatest(p_limit, 1)
  ) t;

  return v_result;
end;
$$;

revoke execute on function public.admin_list_audit_logs(int) from public, anon;
grant execute on function public.admin_list_audit_logs(int) to authenticated;