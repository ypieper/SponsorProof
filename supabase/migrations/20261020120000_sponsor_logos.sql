alter table public.sponsors
  add column if not exists logo_path text;

drop policy if exists "workspace members upload sponsor logos" on storage.objects;
create policy "workspace members upload sponsor logos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'sponsorproof-files'
    and (storage.foldername(name))[2] = 'sponsors'
    and (storage.foldername(name))[4] = 'branding'
    and case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_organization_member(((storage.foldername(name))[1])::uuid)
        and exists (select 1 from public.sponsors s where s.id = ((storage.foldername(name))[3])::uuid and s.organization_id = ((storage.foldername(name))[1])::uuid)
      else false end
  );
