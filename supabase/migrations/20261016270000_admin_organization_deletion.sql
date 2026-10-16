-- Track administrative workspace deletion until its Storage objects and user
-- accounts have also been removed through the Supabase Admin API.
create table if not exists public.admin_organization_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  organization_name text not null,
  sponso_id text not null,
  requested_by uuid not null,
  member_user_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.admin_organization_deletion_jobs enable row level security;
revoke all on public.admin_organization_deletion_jobs from anon, authenticated;
grant all on public.admin_organization_deletion_jobs to service_role;

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

  delete from public.contact_requests where organization_id = target_organization_id;
  delete from public.organizations where id = target_organization_id;
  return deletion_job_id;
end;
$$;

revoke all on function public.delete_organization_for_platform_admin(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.delete_organization_for_platform_admin(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
