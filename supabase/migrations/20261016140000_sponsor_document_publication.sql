-- Categorize event documents and control which organizer uploads are visible
-- to the matching sponsor account. Access continues to go through the scoped
-- organizer/sponsor API routes using the service role after authorization.
alter table public.sponsor_documents
  add column if not exists document_category text not null default 'other',
  add column if not exists published_to_sponsor boolean not null default false;

alter table public.sponsor_documents
  drop constraint if exists sponsor_documents_document_category_check;
alter table public.sponsor_documents
  add constraint sponsor_documents_document_category_check
    check (document_category in ('tickets', 'event_info', 'other'));

-- Organizer documents were already visible in the sponsor archive. Preserve
-- that existing behavior while new organizer uploads remain private by default.
update public.sponsor_documents
set published_to_sponsor = true
where uploaded_by_type = 'organizer'
  and status = 'uploaded'
  and document_role <> 'signed_contract';

create index if not exists sponsor_documents_published_assignment_idx
  on public.sponsor_documents (event_id, sponsor_id, uploaded_at desc)
  where status = 'uploaded' and published_to_sponsor;
