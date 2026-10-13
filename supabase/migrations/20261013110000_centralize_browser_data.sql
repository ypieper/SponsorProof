create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  organization_name text not null default '',
  street text not null default '',
  street_number text not null default '',
  postal_code text not null default '',
  city text not null default '',
  iban text not null default '',
  bic text not null default '',
  bank text not null default '',
  contact_first_name text not null default '',
  contact_last_name text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.contracts add column if not exists gross_value_cents bigint not null default 0;
alter table public.tasks alter column event_id drop not null;
alter table public.tasks add column if not exists organization_id uuid references public.organizations (id) on delete cascade;
alter table public.tasks add column if not exists sponsor_name text not null default '';
update public.tasks set organization_id = e.organization_id from public.events e where tasks.event_id = e.id and tasks.organization_id is null;
update public.tasks set organization_id = public.current_organization_id() where organization_id is null;
alter table public.tasks alter column organization_id set default public.current_organization_id();
alter table public.tasks alter column organization_id set not null;

alter table public.evidence_files alter column event_id drop not null;
alter table public.evidence_files add column if not exists organization_id uuid references public.organizations (id) on delete cascade;
update public.evidence_files set organization_id = e.organization_id from public.events e where evidence_files.event_id = e.id and evidence_files.organization_id is null;
update public.evidence_files set organization_id = public.current_organization_id() where organization_id is null;
alter table public.evidence_files alter column organization_id set default public.current_organization_id();
alter table public.evidence_files alter column organization_id set not null;

create table if not exists public.organization_benefit_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id() references public.organizations (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.contract_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id() references public.organizations (id) on delete cascade,
  contract_id uuid not null references public.contracts (id) on delete cascade,
  kind text not null check (kind in ('generated_pdf', 'generated_docx', 'signed')),
  storage_path text not null unique,
  file_name text not null,
  content_type text not null,
  created_at timestamptz not null default now(),
  unique (contract_id, kind)
);

create table if not exists public.contract_reports (
  contract_id uuid primary key references public.contracts (id) on delete cascade,
  organization_id uuid not null default public.current_organization_id() references public.organizations (id) on delete cascade,
  generated_at timestamptz,
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_data_migrations (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  migration_key text not null,
  completed_at timestamptz not null default now(),
  primary key (organization_id, migration_key)
);

create index if not exists tasks_organization_id_idx on public.tasks (organization_id);
create index if not exists evidence_files_organization_id_idx on public.evidence_files (organization_id);
create index if not exists contract_documents_contract_id_idx on public.contract_documents (contract_id);

alter table public.organization_settings enable row level security;
alter table public.organization_benefit_categories enable row level security;
alter table public.contract_documents enable row level security;
alter table public.contract_reports enable row level security;
alter table public.organization_data_migrations enable row level security;

drop policy if exists "workspace members manage organizer settings" on public.organization_settings;
create policy "workspace members manage organizer settings" on public.organization_settings
  for all to authenticated using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));

drop policy if exists "workspace members manage benefit categories" on public.organization_benefit_categories;
create policy "workspace members manage benefit categories" on public.organization_benefit_categories
  for all to authenticated using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));

drop policy if exists "workspace members manage contract documents" on public.contract_documents;
create policy "workspace members manage contract documents" on public.contract_documents
  for all to authenticated using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));

drop policy if exists "workspace members manage contract reports" on public.contract_reports;
create policy "workspace members manage contract reports" on public.contract_reports
  for all to authenticated using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));

drop policy if exists "workspace members manage data migrations" on public.organization_data_migrations;
create policy "workspace members manage data migrations" on public.organization_data_migrations
  for all to authenticated using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));

drop policy if exists "workspace members manage tasks" on public.tasks;
create policy "workspace members manage tasks" on public.tasks
  for all to authenticated using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));

drop policy if exists "workspace members manage evidence metadata" on public.evidence_files;
create policy "workspace members manage evidence metadata" on public.evidence_files
  for all to authenticated using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id) and uploaded_by = (select auth.uid()));

grant select, insert, update, delete on public.organization_settings, public.organization_benefit_categories,
  public.contract_documents, public.contract_reports to authenticated;
grant select, insert, update, delete on public.organization_data_migrations to authenticated;
