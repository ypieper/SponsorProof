-- Keep the upload time and origin of each sponsor document for the archive.
alter table public.sponsor_documents
  add column if not exists uploaded_by_type text,
  add column if not exists uploaded_by_user_id uuid references auth.users (id) on delete set null,
  add column if not exists uploaded_by_name text,
  add column if not exists uploaded_by_email text;

update public.sponsor_documents d
set uploaded_by_type = case when d.upload_link_id is not null then 'sponsor' else 'organizer' end,
    uploaded_by_name = coalesce(
      nullif(d.uploaded_by_name, ''),
      case when d.upload_link_id is not null then s.name else 'Veranstalter' end
    )
from public.sponsors s
where s.id = d.sponsor_id;

update public.sponsor_documents
set uploaded_by_type = coalesce(uploaded_by_type, 'organizer'),
    uploaded_by_name = coalesce(nullif(uploaded_by_name, ''), 'Veranstalter');

alter table public.sponsor_documents
  alter column uploaded_by_type set not null,
  alter column uploaded_by_name set not null;

alter table public.sponsor_documents
  drop constraint if exists sponsor_documents_uploaded_by_type_check;
alter table public.sponsor_documents
  add constraint sponsor_documents_uploaded_by_type_check
  check (uploaded_by_type in ('sponsor', 'organizer'));

create index if not exists sponsor_documents_uploaded_by_user_idx
  on public.sponsor_documents (uploaded_by_user_id) where uploaded_by_user_id is not null;
