create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  organization_id uuid references public.organizations (id) on delete set null,
  name text not null,
  email text not null,
  organization_name text not null default '',
  subject text not null check (subject in ('Enterprise-Anfrage', 'Allgemeine Anfrage')),
  message text not null,
  status text not null default 'new' check (status in ('new', 'handled')),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references auth.users (id) on delete set null
);

create index if not exists contact_requests_created_at_idx on public.contact_requests (created_at desc);
create index if not exists contact_requests_status_idx on public.contact_requests (status, created_at desc);

alter table public.contact_requests enable row level security;
revoke all on public.contact_requests from anon, authenticated;
grant all on public.contact_requests to service_role;
