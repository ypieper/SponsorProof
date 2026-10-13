create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;
grant all on public.platform_admins to service_role;

-- Bootstrap the first platform admin from the existing Auth account.
insert into public.platform_admins (user_id)
select id
from auth.users
where lower(email) = lower('yannick@filmemitfreunden.de')
on conflict (user_id) do nothing;
