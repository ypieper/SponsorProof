alter table public.sponsor_documents
  add column if not exists display_name text;

update public.sponsor_documents
set display_name = regexp_replace(file_name, '\.[^.]+$', '')
where display_name is null or btrim(display_name) = '';

alter table public.sponsor_documents
  alter column display_name set not null;
