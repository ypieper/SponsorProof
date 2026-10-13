-- Sponsors can exist in the shared workspace before they are assigned to an event.
alter table public.sponsors
  add column if not exists organization_id uuid references public.organizations (id) on delete cascade;

update public.sponsors s
set organization_id = e.organization_id
from public.events e
where s.event_id = e.id and s.organization_id is null;

alter table public.sponsors
  alter column organization_id set default public.current_organization_id(),
  alter column organization_id set not null,
  alter column event_id drop not null;

create index if not exists sponsors_organization_id_idx on public.sponsors (organization_id);

drop policy if exists "event owners manage sponsors" on public.sponsors;
drop policy if exists "workspace members manage sponsors" on public.sponsors;
create policy "workspace members manage sponsors" on public.sponsors
  for all to authenticated
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));
