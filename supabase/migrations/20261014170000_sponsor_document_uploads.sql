-- Public upload links and sponsor-submitted documents for an event assignment.
create table if not exists public.sponsor_upload_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null,
  sponsor_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  last_used_at timestamptz,
  foreign key (event_id, sponsor_id) references public.event_sponsors (event_id, sponsor_id) on delete cascade
);

create unique index if not exists sponsor_upload_links_one_active_per_assignment_idx
  on public.sponsor_upload_links (event_id, sponsor_id) where is_active;
create index if not exists sponsor_upload_links_organization_id_idx
  on public.sponsor_upload_links (organization_id);

create table if not exists public.sponsor_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null,
  sponsor_id uuid not null,
  upload_link_id uuid references public.sponsor_upload_links (id) on delete set null,
  storage_path text not null unique,
  file_name text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  status text not null default 'pending' check (status in ('pending', 'uploaded')),
  created_at timestamptz not null default now(),
  uploaded_at timestamptz,
  foreign key (event_id, sponsor_id) references public.event_sponsors (event_id, sponsor_id) on delete cascade
);

create index if not exists sponsor_documents_assignment_idx
  on public.sponsor_documents (event_id, sponsor_id, created_at desc);

alter table public.sponsor_upload_links enable row level security;
alter table public.sponsor_documents enable row level security;
revoke all on public.sponsor_upload_links, public.sponsor_documents from anon, authenticated;
grant all on public.sponsor_upload_links, public.sponsor_documents to service_role;
grant select, delete on public.sponsor_documents to authenticated;

drop policy if exists "members view sponsor documents" on public.sponsor_documents;
create policy "members view sponsor documents" on public.sponsor_documents
  for select to authenticated using (public.is_organization_member(organization_id));
drop policy if exists "members delete sponsor documents" on public.sponsor_documents;
create policy "members delete sponsor documents" on public.sponsor_documents
  for delete to authenticated using (public.is_organization_member(organization_id));

-- Rotation is transactional: a new secret immediately invalidates the previous link.
create or replace function public.rotate_sponsor_upload_link(
  target_event_id uuid,
  target_sponsor_id uuid,
  target_token_hash text,
  target_created_by uuid
)
returns table (id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_organization uuid;
begin
  select e.organization_id into event_organization
  from public.events e
  join public.event_sponsors es on es.event_id = e.id
  join public.sponsors s on s.id = es.sponsor_id and s.organization_id = e.organization_id
  where e.id = target_event_id and es.sponsor_id = target_sponsor_id
  for update of e;
  if event_organization is null then raise exception 'Event sponsor assignment not found'; end if;
  if target_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid upload link token'; end if;

  update public.sponsor_upload_links l
  set is_active = false
  where l.event_id = target_event_id and l.sponsor_id = target_sponsor_id and l.is_active;

  return query
    insert into public.sponsor_upload_links (organization_id, event_id, sponsor_id, token_hash, created_by)
    values (event_organization, target_event_id, target_sponsor_id, target_token_hash, target_created_by)
    returning sponsor_upload_links.id, sponsor_upload_links.created_at;
end;
$$;

revoke all on function public.rotate_sponsor_upload_link(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.rotate_sponsor_upload_link(uuid, uuid, text, uuid) to service_role;
