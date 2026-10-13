create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  start_date date,
  end_date date,
  location text not null default '',
  responsible text not null default '',
  status text not null default 'In Vorbereitung',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sponsors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  initials text not null default '',
  sponsorship_value_cents bigint not null default 0,
  status text not null default 'Offen',
  color text,
  legal_form text,
  street text,
  street_number text,
  postal_code text,
  city text,
  contact_first_name text,
  contact_last_name text,
  email text,
  phone text,
  vat_id text,
  iban text,
  bic text,
  bank text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, id)
);

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  sponsor_id uuid not null,
  title text not null default 'Sponsoringvertrag',
  value_cents bigint not null default 0,
  status text not null default 'Offen',
  signed_at date,
  signed_file_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, sponsor_id) references public.sponsors (event_id, id) on delete cascade,
  unique (event_id, id)
);

create table if not exists public.benefits (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  sponsor_id uuid,
  contract_id uuid,
  title text not null,
  category text not null default 'Werbung',
  description text not null default '',
  detail text not null default '',
  status text not null default 'Offen',
  evidence_summary text not null default 'Noch kein Nachweis',
  due_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, sponsor_id) references public.sponsors (event_id, id) on delete cascade,
  foreign key (event_id, contract_id) references public.contracts (event_id, id) on delete cascade,
  unique (event_id, id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  sponsor_id uuid,
  benefit_id uuid,
  title text not null,
  description text not null default '',
  due_at date,
  status text not null default 'Offen',
  source text not null default 'Manuell',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, sponsor_id) references public.sponsors (event_id, id) on delete cascade,
  foreign key (event_id, benefit_id) references public.benefits (event_id, id) on delete cascade,
  unique (event_id, id)
);

create table if not exists public.benefit_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  category text not null default 'Werbung',
  description text not null default '',
  detail text not null default '',
  icon text not null default 'stack',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.evidence_files (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  benefit_id uuid,
  task_id uuid,
  storage_path text not null unique,
  file_name text not null,
  content_type text not null,
  uploaded_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  foreign key (event_id, benefit_id) references public.benefits (event_id, id) on delete cascade,
  foreign key (event_id, task_id) references public.tasks (event_id, id) on delete cascade,
  check (benefit_id is not null or task_id is not null)
);

create index if not exists sponsors_event_id_idx on public.sponsors (event_id);
create index if not exists contracts_event_id_idx on public.contracts (event_id);
create index if not exists benefits_event_id_idx on public.benefits (event_id);
create index if not exists tasks_event_id_status_idx on public.tasks (event_id, status);
create index if not exists evidence_files_event_id_idx on public.evidence_files (event_id);
create index if not exists benefit_templates_owner_id_idx on public.benefit_templates (owner_id);

create or replace function public.owns_event(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events
    where id = target_event_id
      and owner_id = (select auth.uid())
  );
$$;

revoke all on function public.owns_event(uuid) from public, anon;
grant execute on function public.owns_event(uuid) to authenticated;

alter table public.events enable row level security;
alter table public.sponsors enable row level security;
alter table public.contracts enable row level security;
alter table public.benefits enable row level security;
alter table public.tasks enable row level security;
alter table public.benefit_templates enable row level security;
alter table public.evidence_files enable row level security;

revoke all on public.events, public.sponsors, public.contracts, public.benefits,
  public.tasks, public.benefit_templates, public.evidence_files from anon, authenticated;
grant select, insert, update, delete on public.events, public.sponsors,
  public.contracts, public.benefits, public.tasks, public.benefit_templates,
  public.evidence_files to authenticated;

drop policy if exists "owners manage their events" on public.events;
create policy "owners manage their events" on public.events
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "owners manage their benefit templates" on public.benefit_templates;
create policy "owners manage their benefit templates" on public.benefit_templates
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "event owners manage sponsors" on public.sponsors;
create policy "event owners manage sponsors" on public.sponsors
  for all to authenticated
  using (public.owns_event(event_id))
  with check (public.owns_event(event_id));

drop policy if exists "event owners manage contracts" on public.contracts;
create policy "event owners manage contracts" on public.contracts
  for all to authenticated
  using (public.owns_event(event_id))
  with check (public.owns_event(event_id));

drop policy if exists "event owners manage benefits" on public.benefits;
create policy "event owners manage benefits" on public.benefits
  for all to authenticated
  using (public.owns_event(event_id))
  with check (public.owns_event(event_id));

drop policy if exists "event owners manage tasks" on public.tasks;
create policy "event owners manage tasks" on public.tasks
  for all to authenticated
  using (public.owns_event(event_id))
  with check (public.owns_event(event_id));

drop policy if exists "event owners manage evidence metadata" on public.evidence_files;
create policy "event owners manage evidence metadata" on public.evidence_files
  for all to authenticated
  using (public.owns_event(event_id))
  with check (public.owns_event(event_id) and uploaded_by = (select auth.uid()));

insert into storage.buckets (id, name, public)
values ('sponsorproof-files', 'sponsorproof-files', false)
on conflict (id) do nothing;

drop policy if exists "users manage files in their folder" on storage.objects;
create policy "users manage files in their folder" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'sponsorproof-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'sponsorproof-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
