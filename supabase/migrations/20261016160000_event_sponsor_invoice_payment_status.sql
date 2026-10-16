alter table public.event_sponsor_invoices
  add column if not exists paid_at timestamptz;
