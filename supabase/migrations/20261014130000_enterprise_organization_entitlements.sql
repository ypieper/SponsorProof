-- Annual, invoice-based Enterprise access applies to the whole organization.
create table if not exists public.organization_entitlements (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  is_active boolean not null default true,
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  annual_fee_cents bigint not null check (annual_fee_cents > 0),
  invoice_reference text,
  internal_note text not null default '',
  activated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > activated_at)
);

create index if not exists organization_entitlements_expiry_idx
  on public.organization_entitlements (expires_at) where is_active;

alter table public.organization_entitlements enable row level security;
revoke all on public.organization_entitlements from anon, authenticated;
grant select on public.organization_entitlements to authenticated;
grant all on public.organization_entitlements to service_role;
drop policy if exists "members can view organization entitlement" on public.organization_entitlements;
create policy "members can view organization entitlement" on public.organization_entitlements
  for select to authenticated using (public.is_organization_member(organization_id));

create or replace function public.organization_enterprise_active(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_entitlements oe
    where oe.organization_id = target_organization_id
      and oe.is_active
      and oe.activated_at <= now()
      and oe.expires_at > now()
  );
$$;
revoke all on function public.organization_enterprise_active(uuid) from public, anon, authenticated;

create or replace function public.event_feature_enabled(target_event_id uuid, target_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when not public.is_organization_member(e.organization_id) then false
      when public.organization_enterprise_active(e.organization_id) then true
      else (p.features ->> target_feature)::boolean
    end
    from public.events e
    join public.event_entitlements ee on ee.event_id = e.id and ee.entitlement_status = 'active'
    join public.event_plans p on p.code = ee.plan_code
    where e.id = target_event_id
    limit 1
  ), false);
$$;
revoke all on function public.event_feature_enabled(uuid, text) from public, anon;
grant execute on function public.event_feature_enabled(uuid, text) to authenticated;

create or replace function public.create_event_with_free_entitlement(
  event_title text,
  event_start_date date,
  event_end_date date,
  event_location text,
  event_responsible text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization uuid := public.current_organization_id();
  max_free_events integer;
  free_event_count integer;
  new_event uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if event_title is null or length(trim(event_title)) = 0 then raise exception 'Event title is required'; end if;
  if event_end_date < event_start_date then raise exception 'Event end date must not precede start date'; end if;

  perform 1 from public.organizations where id = organization for update;
  if not public.organization_enterprise_active(organization) then
    select max_events into max_free_events from public.event_plans where code = 'free';
    select count(*) into free_event_count
    from public.event_entitlements ee
    join public.event_plans p on p.code = ee.plan_code
    where ee.organization_id = organization and ee.entitlement_status = 'active' and p.code = 'free';
    if max_free_events is not null and free_event_count >= max_free_events then
      raise exception using errcode = 'P0001', message = 'FREE_EVENT_LIMIT_REACHED';
    end if;
  end if;

  insert into public.events (organization_id, owner_id, title, start_date, end_date, location, responsible)
  values (organization, auth.uid(), trim(event_title), event_start_date, event_end_date, coalesce(event_location, ''), coalesce(event_responsible, ''))
  returning id into new_event;
  perform public.set_event_entitlement(new_event, 'free', 'free', null, null, null, auth.uid());
  return new_event;
end;
$$;
revoke all on function public.create_event_with_free_entitlement(text, date, date, text, text) from public, anon;
grant execute on function public.create_event_with_free_entitlement(text, date, date, text, text) to authenticated;

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

  if not public.organization_enterprise_active(event_organization) then
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
