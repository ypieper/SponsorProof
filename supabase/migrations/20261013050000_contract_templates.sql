create table if not exists public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id() references public.organizations (id) on delete cascade,
  name text not null,
  original_filename text not null,
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_contract_templates (
  event_id uuid primary key references public.events (id) on delete cascade,
  template_id uuid not null references public.contract_templates (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists contract_templates_organization_id_idx
  on public.contract_templates (organization_id);
create index if not exists event_contract_templates_template_id_idx
  on public.event_contract_templates (template_id);

alter table public.contract_templates enable row level security;
alter table public.event_contract_templates enable row level security;

revoke all on public.contract_templates, public.event_contract_templates from anon, authenticated;
grant select, insert, update, delete on public.contract_templates, public.event_contract_templates to authenticated;

drop policy if exists "members manage workspace contract templates" on public.contract_templates;
create policy "members manage workspace contract templates" on public.contract_templates
  for all to authenticated
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));

drop policy if exists "members manage event contract template assignments" on public.event_contract_templates;
create policy "members manage event contract template assignments" on public.event_contract_templates
  for all to authenticated
  using (
    public.owns_event(event_id)
    and exists (
      select 1 from public.contract_templates t
      join public.events e on e.organization_id = t.organization_id
      where t.id = template_id and e.id = event_id
    )
  )
  with check (
    public.owns_event(event_id)
    and exists (
      select 1 from public.contract_templates t
      join public.events e on e.organization_id = t.organization_id
      where t.id = template_id and e.id = event_id
    )
  );
