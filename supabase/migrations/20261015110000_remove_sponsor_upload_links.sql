-- Remove public sponsor upload links while retaining the sponsor document archive.
drop function if exists public.rotate_sponsor_upload_link(uuid, uuid, text, uuid);
drop function if exists public.rotate_sponsor_upload_link(uuid, uuid, text, text, uuid);

alter table public.sponsor_documents
  drop column if exists upload_link_id;

drop table if exists public.sponsor_upload_links;
