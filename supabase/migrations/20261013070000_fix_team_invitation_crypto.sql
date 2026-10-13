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

revoke all on function public.create_organization_invitation(text) from public, anon;
revoke all on function public.accept_organization_invitation(text) from public, anon;
grant execute on function public.create_organization_invitation(text) to authenticated;
grant execute on function public.accept_organization_invitation(text) to authenticated;
