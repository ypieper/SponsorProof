-- Keep the admin transaction table pageable across the three underlying sources.
-- The view and summary function are intentionally restricted to trusted server code.
create index if not exists event_contract_package_bookings_confirmed_at_idx
  on public.event_contract_package_bookings (payment_confirmed_at desc, event_id);
create index if not exists organization_entitlements_activated_at_idx
  on public.organization_entitlements (activated_at desc, organization_id);
create index if not exists partner_payment_receipts_paid_at_idx
  on public.partner_payment_receipts (paid_at desc, id);

create or replace view public.admin_transaction_feed as
select
  'package:' || b.event_id::text as id,
  b.payment_confirmed_at as transaction_at,
  b.organization_id,
  coalesce(o.name, 'Veranstalterbereich nicht gefunden') as organization_name,
  o.sponso_id,
  coalesce(e.title, 'Event nicht gefunden') as event_name,
  (case b.max_contracts
    when 5 then 'Starter'
    when 7 then 'Plus'
    when 10 then 'Pro'
    when 15 then 'Event'
    else b.max_contracts::text || ' Verträge'
  end) || ' · ' || b.max_contracts::text || ' Verträge' ||
  case when b.signature_addon_selected then ' · digitale Signatur' else '' end as product,
  b.total_amount_cents as amount_cents,
  case when b.payment_status = 'comped' or b.payment_provider = 'activation_code' then 'Freigeschaltet per Code' else 'Bezahlt' end as status,
  case when b.payment_status = 'comped' or b.payment_provider = 'activation_code' then 'Freischaltcode' else b.payment_provider end as provider,
  case when b.payment_status = 'comped' or b.payment_provider = 'activation_code'
    then b.activation_code_redemption_id::text else b.payment_reference end as reference,
  case when b.payment_status = 'comped' or b.payment_provider = 'activation_code' then 'activation' else 'payment' end as kind
from public.event_contract_package_bookings b
left join public.organizations o on o.id = b.organization_id
left join public.events e on e.id = b.event_id

union all

select
  'enterprise:' || oe.organization_id::text as id,
  coalesce(oe.activated_at, oe.created_at) as transaction_at,
  oe.organization_id,
  coalesce(o.name, 'Veranstalterbereich nicht gefunden') as organization_name,
  o.sponso_id,
  'Alle Events im Veranstalterbereich' as event_name,
  'Enterprise · Jahresfreischaltung' as product,
  oe.annual_fee_cents as amount_cents,
  case when oe.is_active and oe.expires_at > now() then 'Manuell freigeschaltet' else 'Nicht aktiv' end as status,
  'Rechnung · manuell' as provider,
  oe.invoice_reference as reference,
  'enterprise' as kind
from public.organization_entitlements oe
left join public.organizations o on o.id = oe.organization_id

union all

select
  'receipt:' || r.id::text as id,
  r.paid_at as transaction_at,
  r.organization_id,
  coalesce(o.name, 'Veranstalterbereich nicht gefunden') as organization_name,
  o.sponso_id,
  coalesce(e.title, 'Alle Events im Veranstalterbereich') as event_name,
  (case r.product_code
    when 'contracts_5' then 'Starter'
    when 'contracts_7' then 'Plus'
    when 'contracts_10' then 'Pro'
    when 'contracts_15' then 'Event'
    when 'enterprise' then 'Enterprise'
    else r.product_code
  end) || ' · bestätigter Zahlungseingang' as product,
  r.gross_amount_cents as amount_cents,
  'Zahlungseingang bestätigt' as status,
  r.provider,
  r.payment_reference as reference,
  'receipt' as kind
from public.partner_payment_receipts r
left join public.organizations o on o.id = r.organization_id
left join public.events e on e.id = r.event_id;

revoke all on public.admin_transaction_feed from public, anon, authenticated;
grant select on public.admin_transaction_feed to service_role;

create or replace function public.admin_transaction_summary()
returns table (paid_count bigint, confirmed_total_cents numeric, enterprise_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*) filter (where feed.kind in ('payment', 'receipt')),
    coalesce(sum(feed.amount_cents) filter (where feed.kind in ('payment', 'receipt')), 0),
    count(*) filter (where feed.kind = 'enterprise')
  from public.admin_transaction_feed feed
$$;

revoke all on function public.admin_transaction_summary() from public, anon, authenticated;
grant execute on function public.admin_transaction_summary() to service_role;
