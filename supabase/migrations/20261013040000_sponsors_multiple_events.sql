-- A sponsor is a workspace record and can be assigned to multiple events.
create table if not exists public.event_sponsors (
  event_id uuid not null references public.events (id) on delete cascade,
  sponsor_id uuid not null references public.sponsors (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, sponsor_id)
);

insert into public.event_sponsors (event_id, sponsor_id)
select event_id, id
from public.sponsors
where event_id is not null
on conflict (event_id, sponsor_id) do nothing;

create index if not exists event_sponsors_sponsor_id_idx on public.event_sponsors (sponsor_id);

create or replace function public.sponsor_and_event_share_workspace(target_event_id uuid, target_sponsor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events e
    join public.sponsors s on s.organization_id = e.organization_id
    where e.id = target_event_id
      and s.id = target_sponsor_id
      and public.is_organization_member(e.organization_id)
  );
$$;

revoke all on function public.sponsor_and_event_share_workspace(uuid, uuid) from public, anon;
grant execute on function public.sponsor_and_event_share_workspace(uuid, uuid) to authenticated;

alter table public.event_sponsors enable row level security;
revoke all on public.event_sponsors from anon, authenticated;
grant select, insert, delete on public.event_sponsors to authenticated;

drop policy if exists "workspace members manage event sponsors" on public.event_sponsors;
create policy "workspace members manage event sponsors" on public.event_sponsors
  for all to authenticated
  using (public.owns_event(event_id))
  with check (public.owns_event(event_id) and public.sponsor_and_event_share_workspace(event_id, sponsor_id));

drop policy if exists "workspace members manage sponsors" on public.sponsors;
create policy "workspace members manage sponsors" on public.sponsors
  for all to authenticated
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));

alter table public.contracts drop constraint if exists contracts_event_id_sponsor_id_fkey;
alter table public.benefits drop constraint if exists benefits_event_id_sponsor_id_fkey;
alter table public.tasks drop constraint if exists tasks_event_id_sponsor_id_fkey;

alter table public.contracts
  add constraint contracts_event_sponsor_fkey
  foreign key (event_id, sponsor_id) references public.event_sponsors (event_id, sponsor_id) on delete cascade;
alter table public.benefits
  add constraint benefits_event_sponsor_fkey
  foreign key (event_id, sponsor_id) references public.event_sponsors (event_id, sponsor_id) on delete cascade;
alter table public.tasks
  add constraint tasks_event_sponsor_fkey
  foreign key (event_id, sponsor_id) references public.event_sponsors (event_id, sponsor_id) on delete cascade;

drop index if exists public.sponsors_event_id_idx;
alter table public.sponsors drop constraint if exists sponsors_event_id_id_key;
alter table public.sponsors drop column if exists event_id;

create or replace function public.remove_sponsor_from_event(target_event_id uuid, target_sponsor_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.owns_event(target_event_id) then
    raise exception 'You do not have access to this event';
  end if;

  delete from public.event_sponsors
  where event_id = target_event_id and sponsor_id = target_sponsor_id;

  return found;
end;
$$;

revoke all on function public.remove_sponsor_from_event(uuid, uuid) from public, anon;
grant execute on function public.remove_sponsor_from_event(uuid, uuid) to authenticated;

create or replace function public.delete_unassigned_sponsor(target_sponsor_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.event_sponsors es where es.sponsor_id = target_sponsor_id
  ) then
    return false;
  end if;

  delete from public.sponsors where id = target_sponsor_id;
  return found;
end;
$$;

revoke all on function public.delete_unassigned_sponsor(uuid) from public, anon;
grant execute on function public.delete_unassigned_sponsor(uuid) to authenticated;
