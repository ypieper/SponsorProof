-- Allow removing a sales-partner assignment while retaining attribution,
-- commission and payout records as detached historical snapshots.
alter table public.partner_referral_clicks
  add column if not exists partner_name_snapshot text,
  add column if not exists partner_email_snapshot text,
  add column if not exists partner_referral_code_snapshot text;
alter table public.partner_referrals
  add column if not exists partner_name_snapshot text,
  add column if not exists partner_email_snapshot text,
  add column if not exists partner_referral_code_snapshot text;
alter table public.partner_commissions
  add column if not exists partner_name_snapshot text,
  add column if not exists partner_email_snapshot text,
  add column if not exists partner_referral_code_snapshot text;
alter table public.partner_payouts
  add column if not exists partner_name_snapshot text,
  add column if not exists partner_email_snapshot text,
  add column if not exists partner_referral_code_snapshot text;

update public.partner_referral_clicks c set
  partner_name_snapshot = coalesce(nullif(concat_ws(' ', nullif(u.raw_user_meta_data->>'first_name',''), nullif(u.raw_user_meta_data->>'last_name','')), ''), u.email),
  partner_email_snapshot = u.email,
  partner_referral_code_snapshot = p.referral_code
from public.sales_partners p left join auth.users u on u.id = p.user_id
where c.partner_id = p.id;
update public.partner_referrals r set
  partner_name_snapshot = coalesce(nullif(concat_ws(' ', nullif(u.raw_user_meta_data->>'first_name',''), nullif(u.raw_user_meta_data->>'last_name','')), ''), u.email),
  partner_email_snapshot = u.email,
  partner_referral_code_snapshot = p.referral_code
from public.sales_partners p left join auth.users u on u.id = p.user_id
where r.partner_id = p.id;
update public.partner_commissions c set
  partner_name_snapshot = coalesce(nullif(concat_ws(' ', nullif(u.raw_user_meta_data->>'first_name',''), nullif(u.raw_user_meta_data->>'last_name','')), ''), u.email),
  partner_email_snapshot = u.email,
  partner_referral_code_snapshot = p.referral_code
from public.sales_partners p left join auth.users u on u.id = p.user_id
where c.partner_id = p.id;
update public.partner_payouts c set
  partner_name_snapshot = coalesce(nullif(concat_ws(' ', nullif(u.raw_user_meta_data->>'first_name',''), nullif(u.raw_user_meta_data->>'last_name','')), ''), u.email),
  partner_email_snapshot = u.email,
  partner_referral_code_snapshot = p.referral_code
from public.sales_partners p left join auth.users u on u.id = p.user_id
where c.partner_id = p.id;

alter table public.partner_referral_clicks alter column partner_id drop not null;
alter table public.partner_referral_clicks drop constraint if exists partner_referral_clicks_partner_id_fkey;
alter table public.partner_referral_clicks add constraint partner_referral_clicks_partner_id_fkey
  foreign key (partner_id) references public.sales_partners(id) on delete set null;
alter table public.partner_referrals alter column partner_id drop not null;
alter table public.partner_referrals drop constraint if exists partner_referrals_partner_id_fkey;
alter table public.partner_referrals add constraint partner_referrals_partner_id_fkey
  foreign key (partner_id) references public.sales_partners(id) on delete set null;
alter table public.partner_commissions alter column partner_id drop not null;
alter table public.partner_commissions drop constraint if exists partner_commissions_partner_id_fkey;
alter table public.partner_commissions add constraint partner_commissions_partner_id_fkey
  foreign key (partner_id) references public.sales_partners(id) on delete set null;
alter table public.partner_payouts alter column partner_id drop not null;
alter table public.partner_payouts drop constraint if exists partner_payouts_partner_id_fkey;
alter table public.partner_payouts add constraint partner_payouts_partner_id_fkey
  foreign key (partner_id) references public.sales_partners(id) on delete set null;
alter table public.partner_commission_overrides drop constraint if exists partner_commission_overrides_partner_id_fkey;
alter table public.partner_commission_overrides add constraint partner_commission_overrides_partner_id_fkey
  foreign key (partner_id) references public.sales_partners(id) on delete cascade;

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
  if not found or ref.partner_id is null then return new; end if;

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
    commission_model, commission_value, commission_amount_cents, rule_id, rule_snapshot,
    partner_name_snapshot, partner_email_snapshot, partner_referral_code_snapshot)
  select partner.id, ref.id, new.id, new.organization_id,
    coalesce(o.name, ref.organization_name_snapshot, 'Gelöschter Veranstalterbereich'),
    coalesce(to_jsonb(o)->>'sponso_id', ref.sponso_id_snapshot), new.product_code,
    new.gross_amount_cents, new.net_amount_cents, commission_rule.commission_model,
    commission_rule.commission_value, greatest(value_cents,0), commission_rule.id,
    jsonb_build_object('source', case when ov.id is null then 'global_rule' else 'partner_override' end,
      'model', commission_rule.commission_model, 'value', commission_rule.commission_value,
      'basis', 'confirmed_net_amount', 'rule_id', commission_rule.id, 'override_id', ov.id),
    coalesce(nullif(concat_ws(' ', nullif(u.raw_user_meta_data->>'first_name',''), nullif(u.raw_user_meta_data->>'last_name','')), ''), u.email),
    u.email, partner.referral_code
  from (select 1) x
  left join public.organizations o on o.id = new.organization_id
  left join auth.users u on u.id = partner.user_id
  on conflict(payment_receipt_id) do nothing returning id into commission_id;

  if commission_id is not null then
    insert into public.partner_commission_audit(entity_type,entity_id,action,after_data)
      select 'commission', commission_id, 'created', to_jsonb(c)
      from public.partner_commissions c where c.id = commission_id;
  end if;
  return new;
end $$;

create or replace function public.admin_delete_sales_partner(
  target_partner_id uuid,
  target_actor uuid,
  target_partner_name text,
  target_partner_email text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  partner public.sales_partners%rowtype;
  before_data jsonb;
  detached_referrals integer;
  detached_commissions integer;
  detached_payouts integer;
begin
  select * into partner from public.sales_partners where id = target_partner_id for update;
  if not found then raise exception 'PARTNER_NOT_FOUND'; end if;

  if exists(select 1 from public.partner_commissions where partner_id = target_partner_id and status in ('review','approved','held')) then
    raise exception 'PARTNER_HAS_OPEN_COMMISSIONS';
  end if;

  before_data := to_jsonb(partner) || jsonb_build_object('name', target_partner_name, 'email', target_partner_email);

  update public.partner_referral_clicks set
    partner_name_snapshot = coalesce(partner_name_snapshot, target_partner_name),
    partner_email_snapshot = coalesce(partner_email_snapshot, target_partner_email),
    partner_referral_code_snapshot = coalesce(partner_referral_code_snapshot, partner.referral_code),
    partner_id = null
  where partner_id = target_partner_id;

  update public.partner_referrals set
    partner_name_snapshot = coalesce(partner_name_snapshot, target_partner_name),
    partner_email_snapshot = coalesce(partner_email_snapshot, target_partner_email),
    partner_referral_code_snapshot = coalesce(partner_referral_code_snapshot, partner.referral_code),
    partner_id = null
  where partner_id = target_partner_id;
  get diagnostics detached_referrals = row_count;

  update public.partner_commissions set
    partner_name_snapshot = coalesce(partner_name_snapshot, target_partner_name),
    partner_email_snapshot = coalesce(partner_email_snapshot, target_partner_email),
    partner_referral_code_snapshot = coalesce(partner_referral_code_snapshot, partner.referral_code),
    partner_id = null
  where partner_id = target_partner_id;
  get diagnostics detached_commissions = row_count;

  update public.partner_payouts set
    partner_name_snapshot = coalesce(partner_name_snapshot, target_partner_name),
    partner_email_snapshot = coalesce(partner_email_snapshot, target_partner_email),
    partner_referral_code_snapshot = coalesce(partner_referral_code_snapshot, partner.referral_code),
    partner_id = null
  where partner_id = target_partner_id;
  get diagnostics detached_payouts = row_count;

  delete from public.sales_partners where id = target_partner_id;
  insert into public.partner_commission_audit(actor_user_id,entity_type,entity_id,action,before_data,after_data)
    values(target_actor,'partner',target_partner_id,'deleted',before_data,
      jsonb_build_object('detached_referrals',detached_referrals,'detached_commissions',detached_commissions,'detached_payouts',detached_payouts));

  return jsonb_build_object('detached_referrals',detached_referrals,'detached_commissions',detached_commissions,'detached_payouts',detached_payouts);
end $$;
revoke all on function public.admin_delete_sales_partner(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.admin_delete_sales_partner(uuid,uuid,text,text) to service_role;
