-- New activation codes grant one of the current event contract packages.
-- Existing event/event_pro codes and redemptions remain valid for compatibility.

alter table public.activation_codes
  alter column plan_code drop not null,
  add column package_code text references public.event_contract_packages (code);

alter table public.activation_codes
  drop constraint if exists activation_codes_plan_code_check;

alter table public.activation_codes
  add constraint activation_codes_target_check
    check ((plan_code is not null and package_code is null) or (plan_code is null and package_code is not null));

alter table public.activation_code_redemptions
  alter column redeemed_plan drop not null,
  add column redeemed_package_code text references public.event_contract_packages (code);

alter table public.activation_code_redemptions
  add constraint activation_code_redemptions_target_check
    check ((redeemed_plan is not null and redeemed_package_code is null) or (redeemed_plan is null and redeemed_package_code is not null));

alter table public.event_contract_package_bookings
  alter column stripe_webhook_event_id drop not null,
  add column activation_code_redemption_id uuid unique
    references public.activation_code_redemptions (redemption_id) on delete cascade;

do $$
declare
  item record;
begin
  for item in
    select conname
    from pg_constraint
    where conrelid = 'public.event_contract_package_bookings'::regclass
      and contype = 'c'
  loop
    execute format('alter table public.event_contract_package_bookings drop constraint %I', item.conname);
  end loop;
end;
$$;

alter table public.event_contract_package_bookings
  add constraint event_contract_package_bookings_base_amount_check check (base_amount_cents >= 0),
  add constraint event_contract_package_bookings_addon_amount_check check (signature_addon_amount_cents >= 0),
  add constraint event_contract_package_bookings_total_amount_check check (total_amount_cents >= 0),
  add constraint event_contract_package_bookings_payment_status_check check (payment_status in ('paid', 'comped')),
  add constraint event_contract_package_bookings_payment_provider_check check (payment_provider in ('stripe', 'activation_code')),
  add constraint event_contract_package_bookings_total_matches_check check (total_amount_cents = base_amount_cents + signature_addon_amount_cents),
  add constraint event_contract_package_bookings_addon_selection_check check (signature_addon_selected or signature_addon_amount_cents = 0),
  add constraint event_contract_package_bookings_source_check check (
    (payment_status = 'paid' and payment_provider = 'stripe' and base_amount_cents > 0
      and total_amount_cents > 0 and stripe_webhook_event_id is not null and activation_code_redemption_id is null)
    or
    (payment_status = 'comped' and payment_provider = 'activation_code' and base_amount_cents = 0
      and signature_addon_selected = false and signature_addon_amount_cents = 0 and total_amount_cents = 0
      and stripe_webhook_event_id is null and activation_code_redemption_id is not null)
  );

create or replace function public.event_feature_enabled(target_event_id uuid, target_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when (select auth.role()) = 'service_role' then
        public.organization_enterprise_active(e.organization_id)
        or (target_feature in ('contracts', 'benefits', 'tasks', 'evidence', 'reports')
          and exists (select 1 from public.event_contract_package_bookings b where b.event_id = e.id and b.payment_status in ('paid', 'comped')))
        or coalesce((p.features ->> target_feature)::boolean, false)
      when not public.is_organization_member(e.organization_id) then false
      when public.organization_enterprise_active(e.organization_id) then true
      when target_feature in ('contracts', 'benefits', 'tasks', 'evidence', 'reports')
        and exists (select 1 from public.event_contract_package_bookings b where b.event_id = e.id and b.payment_status in ('paid', 'comped')) then true
      else coalesce((p.features ->> target_feature)::boolean, false)
    end
    from public.events e
    left join public.event_entitlements ee on ee.event_id = e.id and ee.entitlement_status = 'active'
    left join public.event_plans p on p.code = ee.plan_code
    where e.id = target_event_id
    limit 1
  ), false);
$$;
revoke all on function public.event_feature_enabled(uuid, text) from public, anon;
grant execute on function public.event_feature_enabled(uuid, text) to authenticated, service_role;

create or replace function public.add_sponsor_to_event(
  target_event_id uuid,
  target_sponsor_id uuid,
  initial_contract_value_cents bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_organization uuid;
  sponsor_organization uuid;
  current_plan public.event_plans%rowtype;
  package_booking public.event_contract_package_bookings%rowtype;
  assigned_count integer;
  new_contract uuid;
begin
  select e.organization_id into event_organization
  from public.events e where e.id = target_event_id for update;
  if event_organization is null or not public.is_organization_member(event_organization) then
    raise exception 'EVENT_ACCESS_DENIED';
  end if;

  select s.organization_id into sponsor_organization from public.sponsors s where s.id = target_sponsor_id;
  if sponsor_organization is null or sponsor_organization <> event_organization then
    raise exception 'SPONSOR_WORKSPACE_MISMATCH';
  end if;

  select p.* into current_plan
  from public.event_entitlements ee join public.event_plans p on p.code = ee.plan_code
  where ee.event_id = target_event_id and ee.entitlement_status = 'active';
  if current_plan.code is null then raise exception 'EVENT_ENTITLEMENT_MISSING'; end if;

  select * into package_booking from public.event_contract_package_bookings b
  where b.event_id = target_event_id and b.payment_status in ('paid', 'comped');
  select count(*) into assigned_count from public.event_sponsors es where es.event_id = target_event_id;
  if package_booking.event_id is not null then
    if assigned_count >= package_booking.max_contracts then
      raise exception using errcode = 'P0001', message = 'SPONSOR_LIMIT_REACHED';
    end if;
  elsif not public.organization_enterprise_active(event_organization)
    and current_plan.max_sponsors is not null and assigned_count >= current_plan.max_sponsors then
    raise exception using errcode = 'P0001', message = 'SPONSOR_LIMIT_REACHED';
  end if;

  if initial_contract_value_cents is not null then
    if not public.event_feature_enabled(target_event_id, 'contracts') then
      raise exception using errcode = '42501', message = 'EVENT_FEATURE_REQUIRED:contracts';
    end if;
    if initial_contract_value_cents < 0 then raise exception 'Invalid contract amount'; end if;
  end if;

  insert into public.event_sponsors (event_id, sponsor_id)
  values (target_event_id, target_sponsor_id);

  if initial_contract_value_cents is not null then
    insert into public.contracts (event_id, sponsor_id, title, value_cents, status)
    values (target_event_id, target_sponsor_id, 'Sponsoringvertrag', initial_contract_value_cents, 'Offen')
    returning id into new_contract;
  end if;
  return new_contract;
end;
$$;
revoke all on function public.add_sponsor_to_event(uuid, uuid, bigint) from public, anon;
grant execute on function public.add_sponsor_to_event(uuid, uuid, bigint) to authenticated;

create or replace function public.enforce_event_contract_package_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  package_booking public.event_contract_package_bookings%rowtype;
  current_count integer;
begin
  if tg_op = 'UPDATE' and old.event_id is distinct from new.event_id then
    perform 1 from public.events e
    where e.id in (old.event_id, new.event_id)
    order by e.id
    for update;
  else
    perform 1 from public.events e where e.id = new.event_id for update;
  end if;
  if exists (
    select 1 from public.events e
    where e.id = new.event_id and public.organization_enterprise_active(e.organization_id)
  ) then
    return new;
  end if;
  select * into package_booking from public.event_contract_package_bookings b
  where b.event_id = new.event_id and b.payment_status in ('paid', 'comped');
  if package_booking.event_id is null then return new; end if;

  select count(*) into current_count from public.contracts c
  where c.event_id = new.event_id and (tg_op = 'INSERT' or c.id <> new.id);
  if current_count >= package_booking.max_contracts then
    raise exception using errcode = 'P0001', message = 'EVENT_CONTRACT_PACKAGE_LIMIT_REACHED';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_event_contract_package_limit() from public, anon, authenticated;

create or replace function public.redeem_event_activation_code(target_event_id uuid, target_code_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  event_organization uuid;
  activation public.activation_codes%rowtype;
  current_plan text;
  current_rank integer;
  new_rank integer;
  package_row public.event_contract_packages%rowtype;
  existing_booking public.event_contract_package_bookings%rowtype;
  sponsor_count integer;
  contract_count integer;
  redemption_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  select e.organization_id into event_organization from public.events e where e.id = target_event_id for update;
  if event_organization is null or not public.is_organization_member(event_organization) then
    raise exception 'EVENT_ACCESS_DENIED';
  end if;
  if target_code_hash is null or target_code_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_ACTIVATION_CODE'; end if;

  select * into activation from public.activation_codes c
  where c.code_hash = target_code_hash for update;
  if activation.id is null then raise exception 'INVALID_ACTIVATION_CODE'; end if;
  if not activation.is_active then raise exception 'ACTIVATION_CODE_DISABLED'; end if;
  if activation.expires_at is not null and activation.expires_at <= now() then raise exception 'ACTIVATION_CODE_EXPIRED'; end if;
  if activation.max_uses is not null and activation.use_count >= activation.max_uses then raise exception 'ACTIVATION_CODE_EXHAUSTED'; end if;
  if activation.organization_id is not null and activation.organization_id <> event_organization then raise exception 'ACTIVATION_CODE_ORGANIZATION_MISMATCH'; end if;
  if activation.event_id is not null and activation.event_id <> target_event_id then raise exception 'ACTIVATION_CODE_EVENT_MISMATCH'; end if;
  if exists (select 1 from public.activation_code_redemptions r where r.code_id = activation.id and r.event_id = target_event_id) then
    raise exception 'ACTIVATION_CODE_ALREADY_REDEEMED';
  end if;

  if activation.package_code is not null then
    select * into package_row from public.event_contract_packages p
    where p.code = activation.package_code and p.is_active;
    if package_row.code is null then raise exception 'INVALID_ACTIVATION_CODE'; end if;
    if public.organization_enterprise_active(event_organization) then
      raise exception 'ORGANIZATION_ENTERPRISE_ALREADY_ACTIVE';
    end if;

    select * into existing_booking from public.event_contract_package_bookings b
    where b.event_id = target_event_id for update;
    if existing_booking.event_id is not null then raise exception 'EVENT_PACKAGE_ALREADY_BOOKED'; end if;
    select count(*) into sponsor_count from public.event_sponsors es where es.event_id = target_event_id;
    select count(*) into contract_count from public.contracts c where c.event_id = target_event_id;
    if sponsor_count > package_row.max_contracts or contract_count > package_row.max_contracts then
      raise exception 'ACTIVATION_CODE_PACKAGE_LIMIT_TOO_LOW';
    end if;

    insert into public.activation_code_redemptions as inserted_redemption (code_id, organization_id, event_id, user_id, redeemed_plan, redeemed_package_code)
    values (activation.id, event_organization, target_event_id, current_user_id, null, package_row.code)
    returning inserted_redemption.redemption_id into redemption_id;
    update public.activation_codes set use_count = use_count + 1 where id = activation.id;
    insert into public.event_contract_package_bookings (
      event_id, organization_id, package_code, max_contracts,
      base_amount_cents, signature_addon_selected, signature_addon_amount_cents,
      total_amount_cents, payment_status, payment_provider, payment_reference,
      stripe_webhook_event_id, payment_confirmed_at, activation_code_redemption_id
    ) values (
      target_event_id, event_organization, package_row.code, package_row.max_contracts,
      0, false, 0, 0, 'comped', 'activation_code', 'activation-code:' || redemption_id::text,
      null, now(), redemption_id
    );
    return package_row.code;
  end if;

  if activation.plan_code is null then raise exception 'INVALID_ACTIVATION_CODE'; end if;
  if exists (select 1 from public.event_contract_package_bookings b where b.event_id = target_event_id) then
    raise exception 'EVENT_PACKAGE_ALREADY_BOOKED';
  end if;
  select ee.plan_code into current_plan from public.event_entitlements ee where ee.event_id = target_event_id;
  current_rank := case current_plan when 'free' then 0 when 'event' then 1 when 'event_pro' then 2 else -1 end;
  new_rank := case activation.plan_code when 'event' then 1 when 'event_pro' then 2 else -1 end;
  if new_rank < current_rank then raise exception 'ACTIVATION_CODE_CANNOT_DOWNGRADE'; end if;

  insert into public.activation_code_redemptions (code_id, organization_id, event_id, user_id, redeemed_plan, redeemed_package_code)
  values (activation.id, event_organization, target_event_id, current_user_id, activation.plan_code, null);
  update public.activation_codes set use_count = use_count + 1 where id = activation.id;
  perform public.set_event_entitlement(target_event_id, activation.plan_code, 'code', null, null, null, current_user_id);
  return activation.plan_code;
end;
$$;
revoke all on function public.redeem_event_activation_code(uuid, text) from public, anon;
grant execute on function public.redeem_event_activation_code(uuid, text) to authenticated;
