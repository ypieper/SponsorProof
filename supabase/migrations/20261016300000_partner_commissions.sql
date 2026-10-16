-- Referral attribution and commission accounting. Rates are intentionally not
-- seeded: no commission is created until a platform admin configures a rule.

create table if not exists public.sales_partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  referral_code text not null unique,
  is_active boolean not null default true,
  attribution_window_days integer not null default 30 check (attribution_window_days between 1 and 365),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_referral_clicks (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.sales_partners(id) on delete restrict,
  clicked_at timestamptz not null default now(),
  claimed_by uuid unique references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_organization_id uuid unique references public.organizations(id) on delete set null
);
create index if not exists partner_referral_clicks_partner_date_idx on public.partner_referral_clicks(partner_id, clicked_at desc);

create table if not exists public.partner_attribution_settings (
  singleton boolean primary key default true check (singleton),
  attribution_window_days integer not null default 30 check (attribution_window_days between 1 and 365),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.partner_attribution_settings(singleton) values (true) on conflict do nothing;

create table if not exists public.partner_referrals (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.sales_partners(id) on delete restrict,
  referred_user_id uuid unique references auth.users(id) on delete set null,
  referral_click_id uuid not null unique references public.partner_referral_clicks(id) on delete restrict,
  organization_id uuid unique references public.organizations(id) on delete set null,
  organization_name_snapshot text,
  sponso_id_snapshot text,
  registered_at timestamptz not null default now(),
  organization_created_at timestamptz
);
create index if not exists partner_referrals_partner_idx on public.partner_referrals(partner_id, registered_at desc);

create table if not exists public.partner_commission_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  product_code text not null check (product_code in ('contracts_5','contracts_7','contracts_10','contracts_15','enterprise')),
  commission_model text not null check (commission_model in ('percentage','fixed')),
  commission_value numeric(12,4) not null check (commission_value > 0),
  calculation_basis text not null default 'confirmed_net_amount' check (calculation_basis = 'confirmed_net_amount'),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  applies_to_enterprise boolean not null default false,
  applies_to_renewals boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_until > valid_from),
  check ((commission_model = 'percentage' and commission_value <= 100) or commission_model = 'fixed')
);

create table if not exists public.partner_commission_overrides (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.sales_partners(id) on delete restrict,
  product_code text not null check (product_code in ('contracts_5','contracts_7','contracts_10','contracts_15','enterprise')),
  commission_model text not null check (commission_model in ('percentage','fixed')),
  commission_value numeric(12,4) not null check (commission_value > 0),
  applies_to_renewals boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(partner_id, product_code),
  check ((commission_model = 'percentage' and commission_value <= 100) or commission_model = 'fixed')
);

-- This table represents an explicit, trusted confirmation of money received.
-- Future provider webhooks and the admin's Enterprise invoice workflow both
-- write here; a success page or browser request never does.
create table if not exists public.partner_payment_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  product_code text not null check (product_code in ('contracts_5','contracts_7','contracts_10','contracts_15','enterprise')),
  source_type text not null check (source_type in ('package_payment','enterprise_invoice')),
  source_reference text not null,
  provider text not null,
  payment_reference text not null,
  gross_amount_cents bigint not null check (gross_amount_cents > 0),
  net_amount_cents bigint not null check (net_amount_cents > 0),
  currency text not null default 'EUR' check (currency = 'EUR'),
  paid_at timestamptz not null,
  is_renewal boolean not null default false,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(source_type, source_reference),
  unique(provider, payment_reference)
);
create index if not exists partner_payment_receipts_org_date_idx on public.partner_payment_receipts(organization_id, paid_at desc);

create table if not exists public.partner_commissions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.sales_partners(id) on delete restrict,
  referral_id uuid not null references public.partner_referrals(id) on delete restrict,
  payment_receipt_id uuid not null unique references public.partner_payment_receipts(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete set null,
  organization_name_snapshot text not null,
  sponso_id_snapshot text,
  product_code text not null,
  gross_amount_cents bigint not null,
  calculation_basis text not null default 'confirmed_net_amount',
  basis_amount_cents bigint not null,
  commission_model text not null check (commission_model in ('percentage','fixed')),
  commission_value numeric(12,4) not null,
  commission_amount_cents bigint not null check (commission_amount_cents >= 0),
  currency text not null default 'EUR',
  status text not null default 'review' check (status in ('review','approved','held','paid','void')),
  rule_id uuid references public.partner_commission_rules(id) on delete set null,
  rule_snapshot jsonb not null default '{}'::jsonb,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  paid_at timestamptz,
  payout_reference text,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists partner_commissions_partner_status_idx on public.partner_commissions(partner_id, status, created_at desc);

create table if not exists public.partner_payouts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.sales_partners(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'EUR',
  payout_reference text not null,
  paid_at timestamptz not null,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.partner_commissions add column if not exists payout_id uuid references public.partner_payouts(id) on delete set null;

create table if not exists public.partner_commission_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

alter table public.sales_partners enable row level security;
alter table public.partner_referral_clicks enable row level security;
alter table public.partner_attribution_settings enable row level security;
alter table public.partner_referrals enable row level security;
alter table public.partner_commission_rules enable row level security;
alter table public.partner_commission_overrides enable row level security;
alter table public.partner_payment_receipts enable row level security;
alter table public.partner_commissions enable row level security;
alter table public.partner_payouts enable row level security;
alter table public.partner_commission_audit enable row level security;

revoke all on public.sales_partners, public.partner_referral_clicks, public.partner_attribution_settings,
 public.partner_referrals, public.partner_commission_rules, public.partner_commission_overrides,
 public.partner_payment_receipts, public.partner_commissions, public.partner_payouts,
 public.partner_commission_audit from anon, authenticated;
grant all on public.sales_partners, public.partner_referral_clicks, public.partner_attribution_settings,
 public.partner_referrals, public.partner_commission_rules, public.partner_commission_overrides,
 public.partner_payment_receipts, public.partner_commissions, public.partner_payouts,
 public.partner_commission_audit to service_role;
grant usage, select on sequence public.partner_commission_audit_id_seq to service_role;
grant select on public.sales_partners, public.partner_referrals, public.partner_commissions, public.partner_payouts to authenticated;

create policy "partners can read own profile" on public.sales_partners for select to authenticated
 using (user_id = (select auth.uid()));
create policy "partners can read own referrals" on public.partner_referrals for select to authenticated
 using (exists(select 1 from public.sales_partners p where p.id = partner_id and p.user_id = (select auth.uid())));
create policy "partners can read own commissions" on public.partner_commissions for select to authenticated
 using (exists(select 1 from public.sales_partners p where p.id = partner_id and p.user_id = (select auth.uid())));
create policy "partners can read own payouts" on public.partner_payouts for select to authenticated
 using (exists(select 1 from public.sales_partners p where p.id = partner_id and p.user_id = (select auth.uid())));

create or replace function public.claim_partner_referral_for_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare click_id uuid; click_row public.partner_referral_clicks%rowtype; partner public.sales_partners%rowtype; window_days integer;
begin
  if coalesce(new.raw_user_meta_data->>'account_type','') <> 'organizer'
     or coalesce(new.raw_user_meta_data->>'organization_join_code','') <> '' then return new; end if;
  begin click_id := (new.raw_user_meta_data->>'partner_referral_click_id')::uuid; exception when others then return new; end;
  if click_id is null then return new; end if;
  select * into click_row from public.partner_referral_clicks where id = click_id for update;
  if not found or click_row.claimed_by is not null or click_row.claimed_at is not null then return new; end if;
  select * into partner from public.sales_partners where id = click_row.partner_id and is_active;
  if not found or partner.user_id = new.id then return new; end if;
  select attribution_window_days into window_days from public.partner_attribution_settings where singleton = true;
  if click_row.clicked_at < now() - make_interval(days => coalesce(window_days, partner.attribution_window_days, 30)) then return new; end if;
  update public.partner_referral_clicks set claimed_by = new.id, claimed_at = now() where id = click_id and claimed_by is null;
  if not found then return new; end if;
  insert into public.partner_referrals(partner_id, referred_user_id, referral_click_id) values(partner.id, new.id, click_id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists auth_user_claim_partner_referral on auth.users;
create trigger auth_user_claim_partner_referral after insert on auth.users
for each row execute function public.claim_partner_referral_for_user();

create or replace function public.attach_partner_referral_to_organization()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.partner_referrals r set organization_id = new.id,
    organization_name_snapshot = new.name,
    sponso_id_snapshot = to_jsonb(new)->>'sponso_id',
    organization_created_at = new.created_at
  where r.referred_user_id = new.created_by and r.organization_id is null;
  update public.partner_referral_clicks c set created_organization_id = new.id
  where c.claimed_by = new.created_by and c.created_organization_id is null;
  return new;
end $$;
drop trigger if exists organization_attach_partner_referral on public.organizations;
create trigger organization_attach_partner_referral after insert on public.organizations
for each row execute function public.attach_partner_referral_to_organization();

create or replace function public.create_partner_commission_for_receipt()
returns trigger language plpgsql security definer set search_path = '' as $$
declare ref public.partner_referrals%rowtype; partner public.sales_partners%rowtype; commission_rule public.partner_commission_rules%rowtype; ov public.partner_commission_overrides%rowtype; value_cents bigint; commission_id uuid;
begin
  select * into ref from public.partner_referrals where organization_id = new.organization_id;
  if not found then return new; end if;
  select * into partner from public.sales_partners where id = ref.partner_id and is_active;
  if not found then return new; end if;
  select * into ov from public.partner_commission_overrides where partner_id = partner.id and product_code = new.product_code and is_active;
  if found then
    commission_rule.commission_model := ov.commission_model; commission_rule.commission_value := ov.commission_value; commission_rule.applies_to_renewals := ov.applies_to_renewals; commission_rule.id := null;
  else
    select * into commission_rule from public.partner_commission_rules r where r.product_code = new.product_code and r.is_active
      and r.valid_from <= new.paid_at and (r.valid_until is null or r.valid_until > new.paid_at)
      and (new.source_type <> 'enterprise_invoice' or r.applies_to_enterprise)
      and (not new.is_renewal or r.applies_to_renewals)
      order by r.valid_from desc limit 1;
  end if;
  if not found and ov.id is null then return new; end if;
  if new.is_renewal and not coalesce(commission_rule.applies_to_renewals, false) then return new; end if;
  if commission_rule.commission_model = 'percentage' then value_cents := round(new.net_amount_cents * commission_rule.commission_value / 100);
  else value_cents := round(commission_rule.commission_value * 100); end if;
  insert into public.partner_commissions(partner_id, referral_id, payment_receipt_id, organization_id,
    organization_name_snapshot, sponso_id_snapshot, product_code, gross_amount_cents, basis_amount_cents,
    commission_model, commission_value, commission_amount_cents, rule_id, rule_snapshot)
  select partner.id, ref.id, new.id, new.organization_id, coalesce(o.name, ref.organization_name_snapshot, 'Gelöschter Veranstalterbereich'),
    coalesce(to_jsonb(o)->>'sponso_id', ref.sponso_id_snapshot), new.product_code, new.gross_amount_cents, new.net_amount_cents,
    commission_rule.commission_model, commission_rule.commission_value, greatest(value_cents,0), commission_rule.id,
    jsonb_build_object('source',case when ov.id is null then 'global_rule' else 'partner_override' end,
      'model',commission_rule.commission_model,'value',commission_rule.commission_value,
      'basis','confirmed_net_amount','rule_id',commission_rule.id,'override_id',ov.id)
  from (select 1) x left join public.organizations o on o.id = new.organization_id
  on conflict(payment_receipt_id) do nothing returning id into commission_id;
  if commission_id is not null then
    insert into public.partner_commission_audit(entity_type,entity_id,action,after_data)
      select 'commission',commission_id,'created',to_jsonb(c) from public.partner_commissions c where c.id=commission_id;
  end if;
  return new;
end $$;
drop trigger if exists partner_commission_after_payment_receipt on public.partner_payment_receipts;
create trigger partner_commission_after_payment_receipt after insert on public.partner_payment_receipts
for each row execute function public.create_partner_commission_for_receipt();

create or replace function public.record_partner_payout(target_partner_id uuid, target_commission_ids uuid[], target_reference text, target_paid_at timestamptz, actor uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_payout_id uuid; total_cents bigint; item record;
begin
  if coalesce(array_length(target_commission_ids,1),0) = 0 or length(trim(target_reference)) = 0 then raise exception 'PAYOUT_INPUT_INVALID'; end if;
  perform 1 from public.partner_commissions where id = any(target_commission_ids)
    and partner_id = target_partner_id and status = 'approved' for update;
  select coalesce(sum(commission_amount_cents),0) into total_cents from public.partner_commissions
    where id = any(target_commission_ids) and partner_id = target_partner_id and status = 'approved';
  if total_cents <= 0 or (select count(*) from public.partner_commissions where id=any(target_commission_ids) and partner_id=target_partner_id and status='approved') <> array_length(target_commission_ids,1) then raise exception 'PAYOUT_COMMISSIONS_INVALID'; end if;
  insert into public.partner_payouts(partner_id,amount_cents,payout_reference,paid_at,recorded_by) values(target_partner_id,total_cents,trim(target_reference),target_paid_at,actor) returning id into new_payout_id;
  for item in select * from public.partner_commissions where id=any(target_commission_ids) and partner_id=target_partner_id and status='approved' for update loop
    update public.partner_commissions set status='paid',paid_at=target_paid_at,payout_reference=trim(target_reference),payout_id=new_payout_id,updated_at=now() where id=item.id;
    insert into public.partner_commission_audit(actor_user_id,entity_type,entity_id,action,before_data,after_data) values(actor,'commission',item.id,'paid',to_jsonb(item),jsonb_build_object('status','paid','payout_reference',trim(target_reference),'payout_id',new_payout_id));
  end loop;
  return new_payout_id;
end $$;
revoke all on function public.record_partner_payout(uuid,uuid[],text,timestamptz,uuid) from public, anon, authenticated;
grant execute on function public.record_partner_payout(uuid,uuid[],text,timestamptz,uuid) to service_role;

create or replace function public.admin_update_partner_commission(target_commission_id uuid, target_status text, target_void_reason text, actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare current_commission public.partner_commissions%rowtype; updated_commission public.partner_commissions%rowtype;
begin
  if target_status not in ('approved','held','void') or (target_status='void' and length(trim(coalesce(target_void_reason,'')))=0) then raise exception 'COMMISSION_ACTION_INVALID'; end if;
  select * into current_commission from public.partner_commissions where id=target_commission_id for update;
  if not found or current_commission.status in ('paid','void') then raise exception 'COMMISSION_NOT_CHANGEABLE'; end if;
  update public.partner_commissions set status=target_status, updated_at=now(),
    approved_by=case when target_status='approved' then actor else approved_by end,
    approved_at=case when target_status='approved' then now() else approved_at end,
    void_reason=case when target_status='void' then left(trim(target_void_reason),500) else void_reason end
    where id=target_commission_id returning * into updated_commission;
  insert into public.partner_commission_audit(actor_user_id,entity_type,entity_id,action,before_data,after_data)
    values(actor,'commission',target_commission_id,target_status,to_jsonb(current_commission),to_jsonb(updated_commission));
end $$;
revoke all on function public.admin_update_partner_commission(uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.admin_update_partner_commission(uuid,text,text,uuid) to service_role;

create or replace function public.record_partner_payment_receipt(
  target_organization_id uuid, target_event_id uuid, target_product_code text,
  target_source_type text, target_source_reference text, target_provider text,
  target_payment_reference text, target_gross_cents bigint, target_net_cents bigint,
  target_paid_at timestamptz, target_is_renewal boolean default false, target_recorded_by uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare receipt_id uuid; existing public.partner_payment_receipts%rowtype;
begin
  if target_gross_cents <= 0 or target_net_cents <= 0 or target_net_cents > target_gross_cents
    or target_source_type not in ('package_payment','enterprise_invoice')
    or target_product_code not in ('contracts_5','contracts_7','contracts_10','contracts_15','enterprise') then
    raise exception 'PAYMENT_RECEIPT_INVALID';
  end if;
  insert into public.partner_payment_receipts(organization_id,event_id,product_code,source_type,source_reference,provider,payment_reference,gross_amount_cents,net_amount_cents,paid_at,is_renewal,recorded_by)
  values(target_organization_id,target_event_id,target_product_code,target_source_type,target_source_reference,target_provider,target_payment_reference,target_gross_cents,target_net_cents,target_paid_at,target_is_renewal,target_recorded_by)
  on conflict(source_type,source_reference) do nothing returning id into receipt_id;
  if receipt_id is not null then return receipt_id; end if;
  select * into existing from public.partner_payment_receipts where source_type=target_source_type and source_reference=target_source_reference;
  if existing.payment_reference <> target_payment_reference or existing.net_amount_cents <> target_net_cents or existing.gross_amount_cents <> target_gross_cents then
    raise exception 'PAYMENT_RECEIPT_CONFLICT';
  end if;
  return existing.id;
end $$;
revoke all on function public.record_partner_payment_receipt(uuid,uuid,text,text,text,text,text,bigint,bigint,timestamptz,boolean,uuid) from public, anon, authenticated;
grant execute on function public.record_partner_payment_receipt(uuid,uuid,text,text,text,text,text,bigint,bigint,timestamptz,boolean,uuid) to service_role;

revoke all on function public.claim_partner_referral_for_user() from public, anon, authenticated;
revoke all on function public.attach_partner_referral_to_organization() from public, anon, authenticated;
revoke all on function public.create_partner_commission_for_receipt() from public, anon, authenticated;
