alter table public.event_sponsor_invoices
  add column if not exists sponsor_visible boolean not null default false;

alter table public.event_sponsor_invoices
  drop constraint if exists event_sponsor_invoices_unique_event_sponsor;

create index if not exists event_sponsor_invoices_event_sponsor_created_idx
  on public.event_sponsor_invoices (event_id, sponsor_id, created_at desc);
