-- Contact requests belong to the platform inbox. Keep them when an account or
-- organization is deleted; their nullable foreign keys are set to null by the
-- existing ON DELETE SET NULL constraints.

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

  delete from public.organizations where id = current_organization;
  return current_organization;
end;
$$;

create or replace function public.delete_organization_for_platform_admin(
  target_organization_id uuid,
  requesting_admin_id uuid,
  confirmation_phrase text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization public.organizations%rowtype;
  member_ids uuid[];
  deletion_job_id uuid;
begin
  if (select auth.role()) <> 'service_role'
     or requesting_admin_id is null
     or not exists (select 1 from public.platform_admins p where p.user_id = requesting_admin_id) then
    raise exception 'PLATFORM_ADMIN_REQUIRED';
  end if;
  if confirmation_phrase is distinct from 'VERANSTALTERBEREICH LÖSCHEN' then
    raise exception 'CONFIRMATION_REQUIRED';
  end if;

  select o.* into target_organization
  from public.organizations o
  where o.id = target_organization_id
  for update;
  if target_organization.id is null then
    raise exception 'ORGANIZATION_NOT_FOUND';
  end if;

  select coalesce(array_agg(m.user_id), array[]::uuid[]) into member_ids
  from public.organization_members m
  where m.organization_id = target_organization_id;

  insert into public.admin_organization_deletion_jobs (
    organization_id, organization_name, sponso_id, requested_by, member_user_ids
  ) values (
    target_organization.id, target_organization.name, target_organization.sponso_id,
    requesting_admin_id, member_ids
  )
  returning id into deletion_job_id;

  insert into public.account_deletion_storage_queue (organization_id, requested_by, bucket_id, object_name)
  select target_organization_id, requesting_admin_id, so.bucket_id, so.name
  from storage.objects so
  where so.bucket_id = 'sponsorproof-files'
    and split_part(so.name, '/', 1) = target_organization_id::text
  on conflict (organization_id, bucket_id, object_name) do nothing;

  delete from public.organizations where id = target_organization_id;
  return deletion_job_id;
end;
$$;

revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
revoke all on function public.delete_organization_for_owner(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_organization_for_owner(uuid, text) to service_role;
revoke all on function public.delete_organization_for_platform_admin(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.delete_organization_for_platform_admin(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
