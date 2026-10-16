-- One-time, event-scoped contract packages. Payment activation is reserved for
-- trusted server code that will call record_confirmed_event_package_payment
-- only after a payment provider has verified a successful charge.

create table if not exists public.event_contract_packages (
  code text primary key check (code in ('contracts_5', 'contracts_7', 'contracts_10', 'contracts_15')),
  name text not null,
  max_contracts integer not null unique check (max_contracts > 0),
  base_amount_cents bigint not null check (base_amount_cents > 0),
  signature_addon_per_contract_cents bigint not null default 400 check (signature_addon_per_contract_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.event_contract_packages (code, name, max_contracts, base_amount_cents)
values
  ('contracts_5', '5 Verträge', 5, 9900),
  ('contracts_7', '7 Verträge', 7, 12900),
  ('contracts_10', '10 Verträge', 10, 16900),
  ('contracts_15', '15 Verträge', 15, 22900)
on conflict (code) do update set
  name = excluded.name,
  max_contracts = excluded.max_contracts,
  base_amount_cents = excluded.base_amount_cents,
  signature_addon_per_contract_cents = 400,
  is_active = true,
  updated_at = now();

alter table public.event_contract_packages enable row level security;
revoke all on public.event_contract_packages from anon, authenticated;
grant select on public.event_contract_packages to authenticated;
grant all on public.event_contract_packages to service_role;
drop policy if exists "authenticated can read active contract packages" on public.event_contract_packages;
create policy "authenticated can read active contract packages" on public.event_contract_packages
  for select to authenticated using (is_active);

create table if not exists public.event_contract_package_bookings (
  event_id uuid primary key references public.events (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  package_code text not null references public.event_contract_packages (code),
  max_contracts integer not null check (max_contracts > 0),
  base_amount_cents bigint not null check (base_amount_cents > 0),
  signature_addon_selected boolean not null default false,
  signature_addon_amount_cents bigint not null default 0 check (signature_addon_amount_cents >= 0),
  total_amount_cents bigint not null check (total_amount_cents > 0),
  payment_status text not null default 'paid' check (payment_status = 'paid'),
  payment_provider text not null check (payment_provider = 'stripe'),
  payment_reference text not null unique,
  stripe_webhook_event_id text not null unique,
  payment_confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (total_amount_cents = base_amount_cents + signature_addon_amount_cents),
  check (signature_addon_selected or signature_addon_amount_cents = 0)
);

create index if not exists event_contract_package_bookings_organization_idx
  on public.event_contract_package_bookings (organization_id);

alter table public.event_contract_package_bookings enable row level security;
revoke all on public.event_contract_package_bookings from anon, authenticated;
grant select on public.event_contract_package_bookings to authenticated;
grant all on public.event_contract_package_bookings to service_role;
drop policy if exists "members can view event contract package bookings" on public.event_contract_package_bookings;
create policy "members can view event contract package bookings" on public.event_contract_package_bookings
  for select to authenticated using (public.is_organization_member(organization_id));

-- Stores provider event IDs so future webhook processing can be made
-- idempotent. It is intentionally not writable by browser roles.
create table if not exists public.event_package_payment_events (
  provider_event_id text primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  payment_reference text not null,
  processed_at timestamptz not null default now()
);
alter table public.event_package_payment_events enable row level security;
revoke all on public.event_package_payment_events from anon, authenticated;
grant all on public.event_package_payment_events to service_role;

create or replace function public.record_confirmed_event_package_payment(
  target_event_id uuid,
  target_package_code text,
  target_signature_addon boolean,
  target_paid_amount_cents bigint,
  target_payment_reference text,
  target_provider_event_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_organization uuid;
  package_row public.event_contract_packages%rowtype;
  expected_addon bigint;
  existing_booking public.event_contract_package_bookings%rowtype;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Trusted payment service required'; end if;
  if target_event_id is null or target_package_code is null or target_signature_addon is null
    or target_paid_amount_cents is null or target_paid_amount_cents <= 0
    or target_payment_reference is null or length(trim(target_payment_reference)) = 0
    or target_provider_event_id is null or length(trim(target_provider_event_id)) = 0 then
    raise exception 'Payment references are required';
  end if;

  if exists (select 1 from public.event_package_payment_events where provider_event_id = trim(target_provider_event_id)) then
    return;
  end if;

  select e.organization_id into event_organization
  from public.events e where e.id = target_event_id for update;
  if event_organization is null then raise exception 'Event not found'; end if;

  select * into package_row from public.event_contract_packages p
  where p.code = target_package_code and p.is_active;
  if package_row.code is null then raise exception 'Unknown or inactive event contract package'; end if;

  if (select count(*) from public.contracts c where c.event_id = target_event_id) > package_row.max_contracts then
    raise exception 'Selected package is below the number of existing contracts';
  end if;

  expected_addon := case when target_signature_addon
    then package_row.max_contracts * package_row.signature_addon_per_contract_cents
    else 0 end;
  if target_paid_amount_cents <> package_row.base_amount_cents + expected_addon then
    raise exception 'Confirmed payment amount does not match the server package price';
  end if;

  select * into existing_booking from public.event_contract_package_bookings b
  where b.event_id = target_event_id;
  if existing_booking.event_id is not null then
    if existing_booking.payment_reference = target_payment_reference
      and existing_booking.package_code = target_package_code
      and existing_booking.signature_addon_selected = target_signature_addon
      and existing_booking.total_amount_cents = target_paid_amount_cents then
      insert into public.event_package_payment_events (provider_event_id, event_id, payment_reference)
      values (target_provider_event_id, target_event_id, target_payment_reference)
      on conflict (provider_event_id) do nothing;
      return;
    end if;
    raise exception 'An event contract package has already been booked for this event';
  end if;

  insert into public.event_contract_package_bookings (
    event_id, organization_id, package_code, max_contracts,
    base_amount_cents, signature_addon_selected, signature_addon_amount_cents,
    total_amount_cents, payment_status, payment_provider, payment_reference,
    stripe_webhook_event_id, payment_confirmed_at
  ) values (
    target_event_id, event_organization, package_row.code, package_row.max_contracts,
    package_row.base_amount_cents, target_signature_addon, expected_addon,
    target_paid_amount_cents, 'paid', 'stripe', trim(target_payment_reference),
    trim(target_provider_event_id), now()
  );
  insert into public.event_package_payment_events (provider_event_id, event_id, payment_reference)
  values (trim(target_provider_event_id), target_event_id, trim(target_payment_reference));
end;
$$;
revoke all on function public.record_confirmed_event_package_payment(uuid, text, boolean, bigint, text, text) from public, anon, authenticated;
grant execute on function public.record_confirmed_event_package_payment(uuid, text, boolean, bigint, text, text) to service_role;

create or replace function public.event_signature_addon_enabled(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (select auth.role()) = 'service_role' or public.is_organization_member(e.organization_id)
     from public.events e where e.id = target_event_id)
    and exists (
      select 1 from public.event_contract_package_bookings b
      where b.event_id = target_event_id and b.payment_status = 'paid'
        and b.signature_addon_selected
    ), false
  );
$$;
revoke all on function public.event_signature_addon_enabled(uuid) from public, anon;
grant execute on function public.event_signature_addon_enabled(uuid) to authenticated, service_role;

-- Paid packages unlock the existing event features, while the contract count
-- remains enforced independently below. Legacy event plans remain readable so
-- existing event data and entitlements are not rewritten by this migration.
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
          and exists (select 1 from public.event_contract_package_bookings b where b.event_id = e.id and b.payment_status = 'paid'))
        or coalesce((p.features ->> target_feature)::boolean, false)
      when not public.is_organization_member(e.organization_id) then false
      when public.organization_enterprise_active(e.organization_id) then true
      when target_feature in ('contracts', 'benefits', 'tasks', 'evidence', 'reports')
        and exists (select 1 from public.event_contract_package_bookings b where b.event_id = e.id and b.payment_status = 'paid') then true
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

-- A paid contract package replaces the legacy paid sponsor plans: sponsors are
-- not capped by the old Free limit, while created contracts are capped below.
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
  assigned_count integer;
  package_is_paid boolean;
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

  select exists (
    select 1 from public.event_contract_package_bookings b
    where b.event_id = target_event_id and b.payment_status = 'paid'
  ) into package_is_paid;
  if not package_is_paid and not public.organization_enterprise_active(event_organization) then
    select count(*) into assigned_count from public.event_sponsors es where es.event_id = target_event_id;
    if current_plan.max_sponsors is not null and assigned_count >= current_plan.max_sponsors then
      raise exception using errcode = 'P0001', message = 'SPONSOR_LIMIT_REACHED';
    end if;
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
  -- Serialize concurrent contract creation or moves into the same event.
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
  where b.event_id = new.event_id and b.payment_status = 'paid';
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
drop trigger if exists contracts_package_limit_guard on public.contracts;
create trigger contracts_package_limit_guard before insert or update of event_id on public.contracts
  for each row execute function public.enforce_event_contract_package_limit();

-- The existing click-signature flow remains in place, but may only be started
-- when the paid booking includes the signature add-on.
create or replace function public.start_simple_contract_signing(target_contract_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event uuid;
begin
  select c.event_id into target_event
  from public.contracts c
  where c.id = target_contract_id and c.signature_status = 'draft'
    and c.signing_document_id is not null
    and exists (
      select 1 from public.contract_documents d
      where d.id = c.signing_document_id and d.contract_id = c.id
        and d.kind in ('generated_pdf', 'uploaded_pdf')
    );
  if target_event is null then raise exception 'Contract is not ready for signing'; end if;
  if auth.uid() is null or not public.owns_event(target_event) then
    raise exception 'EVENT_ACCESS_DENIED';
  end if;
  if not public.event_signature_addon_enabled(target_event) then
    raise exception using errcode = '42501', message = 'EVENT_SIGNATURE_ADDON_REQUIRED';
  end if;
  update public.contracts set signature_status = 'pending_sponsor'
  where id = target_contract_id and signature_status = 'draft';
  if not found then raise exception 'Contract is not ready for signing'; end if;
end;
$$;
revoke all on function public.start_simple_contract_signing(uuid) from public, anon;
grant execute on function public.start_simple_contract_signing(uuid) to authenticated;
