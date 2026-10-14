-- Preserve shared workspace data when an individual account is deleted.
alter table public.organizations alter column created_by drop not null;
alter table public.organizations drop constraint if exists organizations_created_by_fkey;
alter table public.organizations
  add constraint organizations_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

alter table public.events alter column owner_id drop not null;
alter table public.events drop constraint if exists events_owner_id_fkey;
alter table public.events
  add constraint events_owner_id_fkey
  foreign key (owner_id) references auth.users (id) on delete set null;

alter table public.benefit_templates alter column owner_id drop not null;
alter table public.benefit_templates drop constraint if exists benefit_templates_owner_id_fkey;
alter table public.benefit_templates
  add constraint benefit_templates_owner_id_fkey
  foreign key (owner_id) references auth.users (id) on delete set null;

alter table public.evidence_files alter column uploaded_by drop not null;
alter table public.evidence_files drop constraint if exists evidence_files_uploaded_by_fkey;
alter table public.evidence_files
  add constraint evidence_files_uploaded_by_fkey
  foreign key (uploaded_by) references auth.users (id) on delete set null;

alter table public.activation_code_redemptions alter column user_id drop not null;
alter table public.activation_code_redemptions drop constraint if exists activation_code_redemptions_user_id_fkey;
alter table public.activation_code_redemptions
  add constraint activation_code_redemptions_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;
alter table public.activation_code_redemptions drop constraint if exists activation_code_redemptions_code_id_fkey;
alter table public.activation_code_redemptions
  add constraint activation_code_redemptions_code_id_fkey
  foreign key (code_id) references public.activation_codes (id) on delete cascade;

create table if not exists public.account_deletion_storage_queue (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  requested_by uuid not null,
  bucket_id text not null,
  object_name text not null,
  queued_at timestamptz not null default now(),
  unique (organization_id, bucket_id, object_name)
);

alter table public.account_deletion_storage_queue enable row level security;
revoke all on public.account_deletion_storage_queue from anon, authenticated;
grant all on public.account_deletion_storage_queue to service_role;

create or replace function public.prepare_account_deletion(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_organization uuid;
  current_role text;
  owner_count integer;
begin
  if (select auth.role()) <> 'service_role' or target_user_id is null then
    raise exception 'Service role required';
  end if;

  select m.organization_id, m.role into current_organization, current_role
  from public.organization_members m
  where m.user_id = target_user_id;

  if current_organization is null then
    return jsonb_build_object('organization_id', null, 'previous_role', null);
  end if;

  perform 1 from public.organizations o where o.id = current_organization for update;
  select m.role into current_role
  from public.organization_members m
  where m.organization_id = current_organization and m.user_id = target_user_id
  for update;

  select count(*) into owner_count
  from public.organization_members m
  where m.organization_id = current_organization and m.role = 'owner';

  if owner_count < 1 then
    raise exception 'NO_WORKSPACE_OWNER';
  end if;
  if current_role = 'owner' and owner_count < 2 then
    raise exception 'LAST_WORKSPACE_OWNER';
  end if;

  -- Reserve the last remaining owner slot while the Auth account is being removed.
  if current_role = 'owner' then
    update public.organization_members
    set role = 'member'
    where organization_id = current_organization and user_id = target_user_id;
  end if;

  delete from public.contact_requests where user_id = target_user_id;

  return jsonb_build_object('organization_id', current_organization, 'previous_role', current_role);
end;
$$;

create or replace function public.delete_organization_for_owner(target_user_id uuid, confirmation_phrase text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_organization uuid;
begin
  if (select auth.role()) <> 'service_role' or target_user_id is null then
    raise exception 'Service role required';
  end if;
  if confirmation_phrase is distinct from 'VERANSTALTERBEREICH LÖSCHEN' then
    raise exception 'CONFIRMATION_REQUIRED';
  end if;

  select m.organization_id into current_organization
  from public.organization_members m
  where m.user_id = target_user_id;
  if current_organization is null then
    raise exception 'WORKSPACE_NOT_FOUND';
  end if;

  perform 1 from public.organizations o where o.id = current_organization for update;
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = current_organization and m.user_id = target_user_id and m.role = 'owner'
  ) then
    raise exception 'OWNER_REQUIRED';
  end if;

  insert into public.account_deletion_storage_queue (organization_id, requested_by, bucket_id, object_name)
  select current_organization, target_user_id, so.bucket_id, so.name
  from storage.objects so
  where so.bucket_id = 'sponsorproof-files'
    and split_part(so.name, '/', 1) = current_organization::text
  on conflict (organization_id, bucket_id, object_name) do nothing;

  delete from public.contact_requests where organization_id = current_organization;
  delete from public.organizations where id = current_organization;
  return current_organization;
end;
$$;

revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
revoke all on function public.delete_organization_for_owner(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_organization_for_owner(uuid, text) to service_role;

notify pgrst, 'reload schema';
