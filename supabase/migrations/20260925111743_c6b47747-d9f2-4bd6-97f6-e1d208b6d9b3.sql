alter table public.stores add column if not exists plan_paid_until timestamptz;

create table public.plan_payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  plan_code text not null,
  amount numeric not null,
  reference text not null unique,
  status text not null default 'pending' check (status in ('pending','success','failed')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

grant select, insert, update on public.plan_payments to authenticated;
grant all on public.plan_payments to service_role;

alter table public.plan_payments enable row level security;

create policy "Owners and managers see their shop's plan payments"
  on public.plan_payments for select to authenticated
  using (exists (
    select 1 from public.store_members m
    where m.store_id = plan_payments.store_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner','manager')
  ));