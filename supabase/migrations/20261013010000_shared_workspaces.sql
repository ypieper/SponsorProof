create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mein Veranstalterbereich',
  created_by uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null default '',
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  unique (user_id)
);

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  invited_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists organization_members_user_id_idx on public.organization_members (user_id);
create index if not exists organization_invitations_org_id_idx on public.organization_invitations (organization_id);

alter table public.events add column if not exists organization_id uuid references public.organizations (id) on delete cascade;
alter table public.benefit_templates add column if not exists organization_id uuid references public.organizations (id) on delete cascade;

-- Preserve the existing personal workspaces while giving their data a shared container.
insert into public.organizations (created_by)
select distinct owner_id from public.events
on conflict do nothing;

insert into public.organizations (created_by)
select distinct owner_id from public.benefit_templates
where not exists (
  select 1 from public.organizations o where o.created_by = benefit_templates.owner_id
)
on conflict do nothing;

insert into public.organization_members (organization_id, user_id, email, role)
select o.id, o.created_by, coalesce(u.email, ''), 'owner'
from public.organizations o
join auth.users u on u.id = o.created_by
on conflict (user_id) do nothing;

update public.events e
set organization_id = m.organization_id
from public.organization_members m
where e.organization_id is null and e.owner_id = m.user_id;

update public.benefit_templates t
set organization_id = m.organization_id
from public.organization_members m
where t.organization_id is null and t.owner_id = m.user_id;

alter table public.events alter column organization_id set not null;
alter table public.benefit_templates alter column organization_id set not null;

create or replace function public.current_organization_id()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  organization uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select organization_id into organization
  from public.organization_members
  where user_id = current_user_id;

  if organization is null then
    insert into public.organizations (created_by)
    values (current_user_id)
    returning id into organization;

    insert into public.organization_members (organization_id, user_id, email, role)
    values (organization, current_user_id, coalesce((select auth.jwt() ->> 'email'), ''), 'owner');
  end if;

  return organization;
end;
$$;

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_organization_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_organization_owner(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_organization_id
      and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

create or replace function public.owns_event(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.id = target_event_id and public.is_organization_member(e.organization_id)
  );
$$;

create or replace function public.create_organization_invitation(invited_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization uuid := public.current_organization_id();
  token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if not public.is_organization_owner(organization) then
    raise exception 'Only the workspace owner can invite members';
  end if;
  if invited_email is null or length(trim(invited_email)) < 3 or position('@' in invited_email) < 2 then
    raise exception 'A valid email address is required';
  end if;
  if exists (select 1 from public.organization_members m where m.organization_id = organization and lower(m.email) = lower(trim(invited_email))) then
    raise exception 'This email already belongs to the workspace';
  end if;

  insert into public.organization_invitations (organization_id, email, token_hash, invited_by)
  values (organization, lower(trim(invited_email)), encode(extensions.digest(token, 'sha256'), 'hex'), (select auth.uid()));
  return token;
end;
$$;

create or replace function public.accept_organization_invitation(invitation_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.organization_invitations%rowtype;
  current_user_id uuid := (select auth.uid());
  current_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  existing_organization uuid;
begin
  if current_user_id is null or current_email = '' then
    raise exception 'Authentication required';
  end if;

  select * into invitation
  from public.organization_invitations i
  where i.token_hash = encode(extensions.digest(invitation_token, 'sha256'), 'hex')
    and i.accepted_at is null and i.expires_at > now()
    and lower(i.email) = current_email
  for update;

  if invitation.id is null then
    raise exception 'Invitation is invalid, expired, or belongs to a different email address';
  end if;
  select organization_id into existing_organization
  from public.organization_members where user_id = current_user_id;

  if existing_organization is not null and existing_organization <> invitation.organization_id then
    if exists (select 1 from public.events e where e.organization_id = existing_organization)
       or exists (select 1 from public.benefit_templates t where t.organization_id = existing_organization)
       or exists (select 1 from public.organization_members m where m.organization_id = existing_organization and m.user_id <> current_user_id)
       or exists (select 1 from public.organization_invitations i where i.organization_id = existing_organization)
       or not exists (select 1 from public.organizations o where o.id = existing_organization and o.created_by = current_user_id) then
      raise exception 'This account already has a workspace with data';
    end if;
    delete from public.organizations where id = existing_organization;
  end if;

  insert into public.organization_members (organization_id, user_id, email, role)
  values (invitation.organization_id, current_user_id, current_email, 'member');
  update public.organization_invitations set accepted_at = now() where id = invitation.id;
  return invitation.organization_id;
end;
$$;

alter table public.events alter column organization_id set default public.current_organization_id();
alter table public.benefit_templates alter column organization_id set default public.current_organization_id();

revoke all on function public.current_organization_id() from public, anon;
revoke all on function public.is_organization_member(uuid) from public, anon;
revoke all on function public.is_organization_owner(uuid) from public, anon;
revoke all on function public.create_organization_invitation(text) from public, anon;
revoke all on function public.accept_organization_invitation(text) from public, anon;
grant execute on function public.current_organization_id() to authenticated;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.is_organization_owner(uuid) to authenticated;
grant execute on function public.create_organization_invitation(text) to authenticated;
grant execute on function public.accept_organization_invitation(text) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;

revoke all on public.organizations, public.organization_members, public.organization_invitations from anon, authenticated;
grant select on public.organizations, public.organization_members, public.organization_invitations to authenticated;

drop policy if exists "members can view their organizations" on public.organizations;
create policy "members can view their organizations" on public.organizations
  for select to authenticated using (public.is_organization_member(id));

drop policy if exists "members can view workspace members" on public.organization_members;
create policy "members can view workspace members" on public.organization_members
  for select to authenticated using (public.is_organization_member(organization_id));

drop policy if exists "owners can view workspace invitations" on public.organization_invitations;
create policy "owners can view workspace invitations" on public.organization_invitations
  for select to authenticated using (public.is_organization_owner(organization_id));

create index if not exists events_organization_id_idx on public.events (organization_id);
create index if not exists benefit_templates_organization_id_idx on public.benefit_templates (organization_id);

drop policy if exists "owners manage their events" on public.events;
drop policy if exists "members manage workspace events" on public.events;
create policy "members manage workspace events" on public.events
  for all to authenticated
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));

drop policy if exists "owners manage their benefit templates" on public.benefit_templates;
drop policy if exists "members manage workspace benefit templates" on public.benefit_templates;
create policy "members manage workspace benefit templates" on public.benefit_templates
  for all to authenticated
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));

drop policy if exists "event owners manage sponsors" on public.sponsors;
create policy "workspace members manage sponsors" on public.sponsors
  for all to authenticated using (public.owns_event(event_id)) with check (public.owns_event(event_id));
drop policy if exists "event owners manage contracts" on public.contracts;
create policy "workspace members manage contracts" on public.contracts
  for all to authenticated using (public.owns_event(event_id)) with check (public.owns_event(event_id));
drop policy if exists "event owners manage benefits" on public.benefits;
create policy "workspace members manage benefits" on public.benefits
  for all to authenticated using (public.owns_event(event_id)) with check (public.owns_event(event_id));
drop policy if exists "event owners manage tasks" on public.tasks;
create policy "workspace members manage tasks" on public.tasks
  for all to authenticated using (public.owns_event(event_id)) with check (public.owns_event(event_id));
drop policy if exists "event owners manage evidence metadata" on public.evidence_files;
create policy "workspace members manage evidence metadata" on public.evidence_files
  for all to authenticated
  using (public.owns_event(event_id))
  with check (public.owns_event(event_id) and uploaded_by = (select auth.uid()));

drop policy if exists "users manage files in their folder" on storage.objects;
drop policy if exists "workspace members manage files" on storage.objects;
create policy "workspace members manage files" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'sponsorproof-files'
    and exists (
      select 1 from public.organization_members m
      where m.organization_id::text = (storage.foldername(name))[1]
        and m.user_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'sponsorproof-files'
    and exists (
      select 1 from public.organization_members m
      where m.organization_id::text = (storage.foldername(name))[1]
        and m.user_id = (select auth.uid())
    )
  );
