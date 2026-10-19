-- Replace the public self-service event packages with the current three tiers.
-- Package codes stay stable so existing bookings and commission records remain valid.
begin;

-- Free the old 10-sponsor value before assigning it to Starter.
update public.event_contract_packages
set max_contracts = 999999,
    updated_at = now()
where code = 'contracts_10';

update public.event_contract_packages
set name = 'Starter',
    max_contracts = 10,
    base_amount_cents = 9900,
    signature_addon_per_contract_cents = 400,
    is_active = true,
    updated_at = now()
where code = 'contracts_5';

update public.event_contract_packages
set name = 'Plus',
    max_contracts = 20,
    base_amount_cents = 17900,
    signature_addon_per_contract_cents = 400,
    is_active = true,
    updated_at = now()
where code = 'contracts_7';

update public.event_contract_packages
set name = 'Pro',
    max_contracts = 30,
    base_amount_cents = 23900,
    signature_addon_per_contract_cents = 400,
    is_active = true,
    updated_at = now()
where code = 'contracts_10';

update public.event_contract_packages
set is_active = false,
    updated_at = now()
where code = 'contracts_15';

-- Keep admin transaction descriptions aligned with the new package names and
-- sponsor limits while preserving the original booking snapshot per event.
create or replace view public.admin_transaction_feed as
select
  'package:' || b.event_id::text as id,
  b.payment_confirmed_at as transaction_at,
  b.organization_id,
  coalesce(o.name, 'Veranstalterbereich nicht gefunden') as organization_name,
  o.sponso_id,
  coalesce(e.title, 'Event nicht gefunden') as event_name,
  coalesce(p.name, b.max_contracts::text || ' Sponsoren') || ' · ' || b.max_contracts::text || ' Sponsoren' ||
  case when b.signature_addon_selected then ' · digitale Signatur' else '' end as product,
  b.total_amount_cents as amount_cents,
  case when b.payment_status = 'comped' or b.payment_provider = 'activation_code' then 'Freigeschaltet per Code' else 'Bezahlt' end as status,
  case when b.payment_status = 'comped' or b.payment_provider = 'activation_code' then 'Freischaltcode' else b.payment_provider end as provider,
  case when b.payment_status = 'comped' or b.payment_provider = 'activation_code'
    then b.activation_code_redemption_id::text else b.payment_reference end as reference,
  case when b.payment_status = 'comped' or b.payment_provider = 'activation_code' then 'activation' else 'payment' end as kind
from public.event_contract_package_bookings b
left join public.event_contract_packages p on p.code = b.package_code
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

commit;
