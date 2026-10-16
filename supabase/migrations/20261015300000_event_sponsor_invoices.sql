create table if not exists public.event_sponsor_invoices (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  sponsor_id uuid not null,
  invoice_number text not null default '',
  invoice_date date,
  due_date date,
  sent_date date,
  gross_amount numeric(12, 2),
  storage_path text,
  file_name text,
  content_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_sponsor_invoices_event_sponsor_fkey
    foreign key (event_id, sponsor_id)
    references public.event_sponsors (event_id, sponsor_id) on delete cascade,
  constraint event_sponsor_invoices_unique_event_sponsor unique (event_id, sponsor_id),
  constraint event_sponsor_invoices_pdf_only check (
    (storage_path is null and file_name is null and content_type is null)
    or (storage_path is not null and file_name is not null and content_type = 'application/pdf')
  ),
  constraint event_sponsor_invoices_amount_nonnegative check (gross_amount is null or gross_amount >= 0)
);

create index if not exists event_sponsor_invoices_event_id_idx
  on public.event_sponsor_invoices (event_id);

alter table public.event_sponsor_invoices enable row level security;
revoke all on public.event_sponsor_invoices from anon, authenticated;
grant select, insert, update, delete on public.event_sponsor_invoices to authenticated;

drop policy if exists "event owners manage sponsor invoices" on public.event_sponsor_invoices;
create policy "event owners manage sponsor invoices" on public.event_sponsor_invoices
  for all to authenticated
  using (public.owns_event(event_id))
  with check (public.owns_event(event_id));
