create or replace function public.set_organization_member_role(target_user_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization uuid := public.current_organization_id();
  current_role text;
  owner_count integer;
begin
  if not public.is_organization_owner(organization) then
    raise exception 'Only the workspace owner can manage members';
  end if;
  if new_role is null or new_role not in ('owner', 'member') then
    raise exception 'A valid workspace role is required';
  end if;

  perform 1 from public.organizations where id = organization for update;
  select role into current_role
  from public.organization_members
  where organization_id = organization and user_id = target_user_id;
  if current_role is null then
    raise exception 'This user is not a member of the workspace';
  end if;

  if current_role = 'owner' and new_role = 'member' then
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
