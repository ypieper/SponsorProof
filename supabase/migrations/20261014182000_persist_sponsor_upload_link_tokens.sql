-- Keep the capability token recoverable for authorized event members while
-- storing only authenticated ciphertext alongside its lookup hash.
alter table public.sponsor_upload_links
  add column if not exists encrypted_token text;

drop function if exists public.rotate_sponsor_upload_link(uuid, uuid, text, uuid);
drop function if exists public.rotate_sponsor_upload_link(uuid, uuid, text, text, uuid);

create function public.rotate_sponsor_upload_link(
  target_event_id uuid,
  target_sponsor_id uuid,
  target_token_hash text,
  target_encrypted_token text,
  target_created_by uuid
)
returns table (id uuid, created_at timestamptz, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_organization uuid;
begin
  select e.organization_id into event_organization
  from public.events e
  join public.event_sponsors es on es.event_id = e.id
  join public.sponsors s on s.id = es.sponsor_id and s.organization_id = e.organization_id
  where e.id = target_event_id and es.sponsor_id = target_sponsor_id
  for update of e;
  if event_organization is null then raise exception 'Event sponsor assignment not found'; end if;
  if target_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid upload link token'; end if;
  if target_encrypted_token is null or length(target_encrypted_token) > 4096 then raise exception 'Invalid encrypted upload link token'; end if;

  update public.sponsor_upload_links l
  set is_active = false
  where l.event_id = target_event_id and l.sponsor_id = target_sponsor_id and l.is_active;

  return query
    insert into public.sponsor_upload_links (organization_id, event_id, sponsor_id, token_hash, encrypted_token, created_by)
    values (event_organization, target_event_id, target_sponsor_id, target_token_hash, target_encrypted_token, target_created_by)
    returning sponsor_upload_links.id, sponsor_upload_links.created_at, sponsor_upload_links.expires_at;
end;
$$;

revoke all on function public.rotate_sponsor_upload_link(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.rotate_sponsor_upload_link(uuid, uuid, text, text, uuid) to service_role;
