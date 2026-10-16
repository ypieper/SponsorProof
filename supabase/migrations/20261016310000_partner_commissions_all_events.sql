-- Commissions continue for each confirmed event purchase, regardless of tariff.
-- Renewal flags are unnecessary; every new paid order is handled identically.

alter table public.partner_commission_rules
  drop constraint if exists partner_commission_rules_product_code_check;
alter table public.partner_commission_rules
  add constraint partner_commission_rules_product_code_check
  check (product_code in ('all_events','contracts_5','contracts_7','contracts_10','contracts_15','enterprise'));
alter table public.partner_commission_overrides
  drop constraint if exists partner_commission_overrides_product_code_check;
alter table public.partner_commission_overrides
  add constraint partner_commission_overrides_product_code_check
  check (product_code in ('all_events','contracts_5','contracts_7','contracts_10','contracts_15','enterprise'));

alter table public.partner_commission_rules drop column if exists applies_to_renewals;
alter table public.partner_commission_overrides drop column if exists applies_to_renewals;
alter table public.partner_payment_receipts drop column if exists is_renewal;

create or replace function public.create_partner_commission_for_receipt()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  ref public.partner_referrals%rowtype;
  partner public.sales_partners%rowtype;
  commission_rule public.partner_commission_rules%rowtype;
  ov public.partner_commission_overrides%rowtype;
  value_cents bigint;
  commission_id uuid;
begin
  select * into ref from public.partner_referrals where organization_id = new.organization_id;
  if not found then return new; end if;

  select * into partner from public.sales_partners where id = ref.partner_id and is_active;
  if not found then return new; end if;

  select * into ov from public.partner_commission_overrides
    where partner_id = partner.id and product_code in (new.product_code, 'all_events') and is_active
    order by (product_code = new.product_code) desc limit 1;
  if found then
    commission_rule.commission_model := ov.commission_model;
    commission_rule.commission_value := ov.commission_value;
    commission_rule.id := null;
  else
    select * into commission_rule from public.partner_commission_rules r
      where r.product_code in (new.product_code, 'all_events') and r.is_active
        and r.valid_from <= new.paid_at and (r.valid_until is null or r.valid_until > new.paid_at)
        and (new.product_code <> 'enterprise' or r.applies_to_enterprise)
      order by (r.product_code = new.product_code) desc, r.valid_from desc limit 1;
  end if;
  if not found and ov.id is null then return new; end if;

  if commission_rule.commission_model = 'percentage' then
    value_cents := round(new.net_amount_cents * commission_rule.commission_value / 100);
  else
    value_cents := round(commission_rule.commission_value * 100);
  end if;

  insert into public.partner_commissions(partner_id, referral_id, payment_receipt_id, organization_id,
    organization_name_snapshot, sponso_id_snapshot, product_code, gross_amount_cents, basis_amount_cents,
    commission_model, commission_value, commission_amount_cents, rule_id, rule_snapshot)
  select partner.id, ref.id, new.id, new.organization_id,
    coalesce(o.name, ref.organization_name_snapshot, 'Gelöschter Veranstalterbereich'),
    coalesce(to_jsonb(o)->>'sponso_id', ref.sponso_id_snapshot), new.product_code,
    new.gross_amount_cents, new.net_amount_cents, commission_rule.commission_model,
    commission_rule.commission_value, greatest(value_cents,0), commission_rule.id,
    jsonb_build_object('source', case when ov.id is null then 'global_rule' else 'partner_override' end,
      'model', commission_rule.commission_model, 'value', commission_rule.commission_value,
      'basis', 'confirmed_net_amount', 'rule_id', commission_rule.id, 'override_id', ov.id)
  from (select 1) x left join public.organizations o on o.id = new.organization_id
  on conflict(payment_receipt_id) do nothing returning id into commission_id;

  if commission_id is not null then
    insert into public.partner_commission_audit(entity_type,entity_id,action,after_data)
      select 'commission', commission_id, 'created', to_jsonb(c)
      from public.partner_commissions c where c.id = commission_id;
  end if;
  return new;
end $$;

drop function if exists public.record_partner_payment_receipt(uuid,uuid,text,text,text,text,text,bigint,bigint,timestamptz,boolean,uuid);
create function public.record_partner_payment_receipt(
  target_organization_id uuid,
  target_event_id uuid,
  target_product_code text,
  target_source_type text,
  target_source_reference text,
  target_provider text,
  target_payment_reference text,
  target_gross_cents bigint,
  target_net_cents bigint,
  target_paid_at timestamptz,
  target_recorded_by uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare receipt_id uuid; existing public.partner_payment_receipts%rowtype;
begin
  if target_gross_cents <= 0 or target_net_cents <= 0 or target_net_cents > target_gross_cents
    or target_source_type not in ('package_payment','enterprise_invoice')
    or target_product_code not in ('contracts_5','contracts_7','contracts_10','contracts_15','enterprise') then
    raise exception 'PAYMENT_RECEIPT_INVALID';
  end if;
  insert into public.partner_payment_receipts(organization_id,event_id,product_code,source_type,source_reference,
    provider,payment_reference,gross_amount_cents,net_amount_cents,paid_at,recorded_by)
  values(target_organization_id,target_event_id,target_product_code,target_source_type,target_source_reference,
    target_provider,target_payment_reference,target_gross_cents,target_net_cents,target_paid_at,target_recorded_by)
  on conflict(source_type,source_reference) do nothing returning id into receipt_id;
  if receipt_id is not null then return receipt_id; end if;
  select * into existing from public.partner_payment_receipts
    where source_type = target_source_type and source_reference = target_source_reference;
  if existing.payment_reference <> target_payment_reference or existing.net_amount_cents <> target_net_cents
    or existing.gross_amount_cents <> target_gross_cents then raise exception 'PAYMENT_RECEIPT_CONFLICT'; end if;
  return existing.id;
end $$;
revoke all on function public.record_partner_payment_receipt(uuid,uuid,text,text,text,text,text,bigint,bigint,timestamptz,uuid) from public, anon, authenticated;
grant execute on function public.record_partner_payment_receipt(uuid,uuid,text,text,text,text,text,bigint,bigint,timestamptz,uuid) to service_role;
