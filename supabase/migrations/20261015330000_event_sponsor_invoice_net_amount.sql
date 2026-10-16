alter table public.event_sponsor_invoices
  add column if not exists net_amount numeric(12, 2);

update public.event_sponsor_invoices
set net_amount = round(gross_amount / 1.19, 2)
where net_amount is null and gross_amount is not null;

alter table public.event_sponsor_invoices
  drop constraint if exists event_sponsor_invoices_net_amount_nonnegative;

alter table public.event_sponsor_invoices
  add constraint event_sponsor_invoices_net_amount_nonnegative
  check (net_amount is null or net_amount >= 0);
