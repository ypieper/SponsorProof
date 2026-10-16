alter table public.event_sponsor_invoices
  drop constraint if exists event_sponsor_invoices_pdf_only;

alter table public.event_sponsor_invoices
  add constraint event_sponsor_invoices_supported_file_types
  check (
    (storage_path is null and file_name is null and content_type is null)
    or (
      storage_path is not null
      and file_name is not null
      and (
        (content_type = 'application/pdf' and storage_path ilike '%.pdf')
        or (content_type in ('application/xml', 'text/xml') and storage_path ilike '%.xml')
      )
    )
  );
