grant update on public.organizations to authenticated;

drop policy if exists "members can update their organizations" on public.organizations;
create policy "members can update their organizations" on public.organizations
  for update to authenticated
  using (public.is_organization_member(id))
  with check (public.is_organization_member(id));
