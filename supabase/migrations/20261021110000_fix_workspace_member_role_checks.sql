-- CURRENT_ROLE is a SQL keyword. A local variable with that name is not used
-- by SQL expressions, so the checks previously saw the function owner's role.
-- Preserve the existing permissions and locking; use an unambiguous name.

create or replace function public.set_organization_member_role(target_user_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization uuid := public.current_organization_id();
  member_role text;
  owner_count integer;
begin
  if not public.is_organization_owner(organization) then
    raise exception 'Only the workspace owner can manage members';
  end if;
  if new_role is null or new_role not in ('owner', 'member') then
    raise exception 'A valid workspace role is required';
  end if;

  perform 1 from public.organizations where id = organization for update;
  select role into member_role
  from public.organization_members
  where organization_id = organization and user_id = target_user_id;
  if member_role is null then
    raise exception 'This user is not a member of the workspace';
  end if;

  if member_role = 'owner' and new_role = 'member' then
    select count(*) into owner_count
    from public.organization_members
    where organization_id = organization and role = 'owner';
    if owner_count <= 1 then
      raise exception 'At least one workspace owner must remain';
    end if;
  end if;

  update public.organization_members
  set role = new_role
  where organization_id = organization and user_id = target_user_id;
end;
$$;

revoke all on function public.set_organization_member_role(uuid, text) from public, anon;
grant execute on function public.set_organization_member_role(uuid, text) to authenticated;
notify pgrst, 'reload schema';

create or replace function public.prepare_account_deletion(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_organization uuid;
  member_role text;
  owner_count integer;
begin
  if (select auth.role()) <> 'service_role' or target_user_id is null then
    raise exception 'Service role required';
  end if;

  select m.organization_id, m.role into current_organization, member_role
  from public.organization_members m
  where m.user_id = target_user_id;

  if current_organization is null then
    return jsonb_build_object('organization_id', null, 'previous_role', null);
  end if;

  perform 1 from public.organizations o where o.id = current_organization for update;
  select m.role into member_role
  from public.organization_members m
  where m.organization_id = current_organization and m.user_id = target_user_id
  for update;

  select count(*) into owner_count
  from public.organization_members m
  where m.organization_id = current_organization and m.role = 'owner';

  if owner_count < 1 then
    raise exception 'NO_WORKSPACE_OWNER';
  end if;
  if member_role = 'owner' and owner_count < 2 then
    raise exception 'LAST_WORKSPACE_OWNER';
  end if;

  -- Reserve the last remaining owner slot while the Auth account is being removed.
  if member_role = 'owner' then
    update public.organization_members
    set role = 'member'
    where organization_id = current_organization and user_id = target_user_id;
  end if;

  return jsonb_build_object('organization_id', current_organization, 'previous_role', member_role);
end;
$$;

revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
notify pgrst, 'reload schema';
