-- SponsorProof V1: event-scoped plans, entitlements and activation codes.

create table if not exists public.event_plans (
  code text primary key check (code in ('free', 'event', 'event_pro')),
  name text not null,
  price_cents bigint not null check (price_cents >= 0),
  max_events integer check (max_events is null or max_events > 0),
  max_sponsors integer check (max_sponsors is null or max_sponsors > 0),
  features jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.event_plans (code, name, price_cents, max_events, max_sponsors, features)
values
  ('free', 'Free', 0, 1, 2, '{"contracts":false,"benefits":false,"tasks":false,"evidence":false,"reports":false}'::jsonb),
  ('event', 'Event', 7900, null, 10, '{"contracts":true,"benefits":true,"tasks":true,"evidence":true,"reports":true}'::jsonb),
  ('event_pro', 'Event Pro', 12900, null, null, '{"contracts":true,"benefits":true,"tasks":true,"evidence":true,"reports":true}'::jsonb)
on conflict (code) do nothing;

alter table public.event_plans enable row level security;
revoke all on public.event_plans from anon, authenticated;
grant select on public.event_plans to authenticated;
grant all on public.event_plans to service_role;
drop policy if exists "authenticated can read event plans" on public.event_plans;
create policy "authenticated can read event plans" on public.event_plans
  for select to authenticated using (true);

create table if not exists public.event_entitlements (
  event_id uuid primary key references public.events (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  plan_code text not null references public.event_plans (code),
  entitlement_status text not null default 'active' check (entitlement_status in ('active', 'revoked')),
  activated_at timestamptz not null default now(),
  activation_source text not null default 'free' check (activation_source in ('free', 'code', 'stripe', 'admin')),
  paid_amount_cents bigint check (paid_amount_cents is null or paid_amount_cents >= 0),
  payment_reference text,
  payment_provider text,
  activated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.event_entitlements (event_id, organization_id, plan_code, entitlement_status, activated_at, activation_source)
select e.id, e.organization_id, 'free', 'active', e.created_at, 'free'
from public.events e
on conflict (event_id) do nothing;

alter table public.event_entitlements enable row level security;
revoke all on public.event_entitlements from anon, authenticated;
grant select on public.event_entitlements to authenticated;
grant all on public.event_entitlements to service_role;
drop policy if exists "members can view event entitlements" on public.event_entitlements;
create policy "members can view event entitlements" on public.event_entitlements
  for select to authenticated using (public.is_organization_member(organization_id));

create table if not exists public.activation_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  code_hint text not null,
  plan_code text not null references public.event_plans (code) check (plan_code in ('event', 'event_pro')),
  is_active boolean not null default true,
  expires_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  organization_id uuid references public.organizations (id) on delete cascade,
  event_id uuid references public.events (id) on delete cascade,
  internal_note text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  deactivated_at timestamptz,
  check (max_uses is null or use_count <= max_uses)
);

create index if not exists activation_codes_created_at_idx on public.activation_codes (created_at desc);
create index if not exists activation_codes_organization_id_idx on public.activation_codes (organization_id);
create index if not exists activation_codes_event_id_idx on public.activation_codes (event_id);

create table if not exists public.activation_code_redemptions (
  redemption_id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.activation_codes (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete restrict,
  redeemed_plan text not null references public.event_plans (code),
  redeemed_at timestamptz not null default now(),
  unique (code_id, event_id)
);

create index if not exists activation_code_redemptions_organization_idx on public.activation_code_redemptions (organization_id, redeemed_at desc);
create index if not exists activation_code_redemptions_event_idx on public.activation_code_redemptions (event_id, redeemed_at desc);

alter table public.activation_codes enable row level security;
alter table public.activation_code_redemptions enable row level security;
revoke all on public.activation_codes, public.activation_code_redemptions from anon, authenticated;
grant all on public.activation_codes, public.activation_code_redemptions to service_role;

create or replace function public.event_feature_enabled(target_event_id uuid, target_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select (p.features ->> target_feature)::boolean
    from public.event_entitlements ee
    join public.event_plans p on p.code = ee.plan_code
    where ee.event_id = target_event_id
      and ee.entitlement_status = 'active'
      and public.is_organization_member(ee.organization_id)
    limit 1
  ), false);
$$;

revoke all on function public.event_feature_enabled(uuid, text) from public, anon;
grant execute on function public.event_feature_enabled(uuid, text) to authenticated;

-- This is the one entitlement write path. The function is callable only by trusted server-side code.
create or replace function public.set_event_entitlement(
  target_event_id uuid,
  target_plan text,
  target_source text,
  target_paid_amount_cents bigint default null,
  target_payment_reference text default null,
  target_payment_provider text default null,
  target_activated_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_organization uuid;
begin
  if target_plan not in ('free', 'event', 'event_pro')
     or target_source not in ('free', 'code', 'stripe', 'admin') then
    raise exception 'Invalid entitlement';
  end if;

  select e.organization_id into event_organization
  from public.events e where e.id = target_event_id for update;
  if event_organization is null then
    raise exception 'Event not found';
  end if;

  insert into public.event_entitlements (
    event_id, organization_id, plan_code, entitlement_status, activated_at,
    activation_source, paid_amount_cents, payment_reference, payment_provider,
    activated_by, updated_at
  ) values (
    target_event_id, event_organization, target_plan, 'active', now(), target_source,
    target_paid_amount_cents, target_payment_reference, target_payment_provider,
    target_activated_by, now()
  )
  on conflict (event_id) do update set
    organization_id = excluded.organization_id,
    plan_code = excluded.plan_code,
    entitlement_status = 'active',
    activated_at = now(),
    activation_source = excluded.activation_source,
    paid_amount_cents = excluded.paid_amount_cents,
    payment_reference = excluded.payment_reference,
    payment_provider = excluded.payment_provider,
    activated_by = excluded.activated_by,
    updated_at = now();
end;
$$;

revoke all on function public.set_event_entitlement(uuid, text, text, bigint, text, text, uuid) from public, anon, authenticated;
grant execute on function public.set_event_entitlement(uuid, text, text, bigint, text, text, uuid) to service_role;

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
  select max_events into max_free_events from public.event_plans where code = 'free';
  select count(*) into free_event_count
  from public.event_entitlements ee
  join public.event_plans p on p.code = ee.plan_code
  where ee.organization_id = organization and ee.entitlement_status = 'active' and p.code = 'free';
  if max_free_events is not null and free_event_count >= max_free_events then
    raise exception using errcode = 'P0001', message = 'FREE_EVENT_LIMIT_REACHED';
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
revoke insert on public.events from anon, authenticated;

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

  select count(*) into assigned_count from public.event_sponsors es where es.event_id = target_event_id;
  if current_plan.max_sponsors is not null and assigned_count >= current_plan.max_sponsors then
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
revoke insert on public.event_sponsors from anon, authenticated;

create or replace function public.guard_event_feature_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event uuid;
  target_feature text;
  related_event uuid;
begin
  if tg_table_name = 'contracts' or tg_table_name = 'benefits' or tg_table_name = 'evidence_files' then
    target_event := new.event_id;
  elsif tg_table_name = 'tasks' then
    if new.source <> 'Leistung' then return new; end if;
    target_event := new.event_id;
  elsif tg_table_name = 'contract_documents' then
    select c.event_id into target_event from public.contracts c where c.id = new.contract_id;
  elsif tg_table_name = 'contract_reports' then
    select c.event_id into target_event from public.contracts c where c.id = new.contract_id;
  end if;

  if tg_table_name = 'contracts' or tg_table_name = 'contract_documents' then target_feature := 'contracts';
  elsif tg_table_name = 'benefits' then target_feature := 'benefits';
  elsif tg_table_name = 'tasks' then target_feature := 'tasks';
  elsif tg_table_name = 'evidence_files' then target_feature := 'evidence';
  elsif tg_table_name = 'contract_reports' then target_feature := 'reports';
  end if;

  if target_event is null then
    if tg_table_name = 'evidence_files' then
      raise exception using errcode = '42501', message = 'EVIDENCE_REQUIRES_EVENT';
    end if;
    raise exception using errcode = '42501', message = 'EVENT_FEATURE_REQUIRED';
  end if;
  if not public.event_feature_enabled(target_event, target_feature) then
    raise exception using errcode = '42501', message = 'EVENT_FEATURE_REQUIRED:' || target_feature;
  end if;

  if tg_table_name = 'evidence_files' then
    if new.task_id is null and new.benefit_id is null then
      raise exception using errcode = '42501', message = 'EVIDENCE_REQUIRES_EVENT';
    end if;
    if not exists (select 1 from public.events e where e.id = new.event_id and e.organization_id = new.organization_id) then
      raise exception using errcode = '42501', message = 'EVIDENCE_REQUIRES_EVENT';
    end if;
    if new.benefit_id is not null then
      select b.event_id into related_event from public.benefits b where b.id = new.benefit_id;
      if related_event is distinct from new.event_id then
        raise exception using errcode = '42501', message = 'EVIDENCE_REQUIRES_EVENT';
      end if;
    end if;
    if new.task_id is not null then
      select t.event_id into related_event from public.tasks t where t.id = new.task_id;
      if related_event is distinct from new.event_id then
        raise exception using errcode = '42501', message = 'EVIDENCE_REQUIRES_EVENT';
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_event_feature_write() from public, anon, authenticated;

drop trigger if exists contracts_entitlement_guard on public.contracts;
create trigger contracts_entitlement_guard before insert or update on public.contracts for each row execute function public.guard_event_feature_write();
drop trigger if exists benefits_entitlement_guard on public.benefits;
create trigger benefits_entitlement_guard before insert or update on public.benefits for each row execute function public.guard_event_feature_write();
drop trigger if exists tasks_entitlement_guard on public.tasks;
create trigger tasks_entitlement_guard before insert or update on public.tasks for each row execute function public.guard_event_feature_write();
drop trigger if exists evidence_entitlement_guard on public.evidence_files;
create trigger evidence_entitlement_guard before insert or update on public.evidence_files for each row execute function public.guard_event_feature_write();
drop trigger if exists contract_documents_entitlement_guard on public.contract_documents;
create trigger contract_documents_entitlement_guard before insert or update on public.contract_documents for each row execute function public.guard_event_feature_write();
drop trigger if exists contract_reports_entitlement_guard on public.contract_reports;
create trigger contract_reports_entitlement_guard before insert or update on public.contract_reports for each row execute function public.guard_event_feature_write();

create or replace function public.validate_activation_code_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_organization uuid;
begin
  if new.event_id is not null then
    select e.organization_id into event_organization from public.events e where e.id = new.event_id;
    if event_organization is null then raise exception 'Activation-code event does not exist'; end if;
    if new.organization_id is not null and new.organization_id <> event_organization then
      raise exception 'Activation-code event and organization do not match';
    end if;
    new.organization_id := event_organization;
  end if;
  return new;
end;
$$;

revoke all on function public.validate_activation_code_scope() from public, anon, authenticated;
drop trigger if exists activation_code_scope_guard on public.activation_codes;
create trigger activation_code_scope_guard before insert or update of event_id, organization_id on public.activation_codes for each row execute function public.validate_activation_code_scope();

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

  select ee.plan_code into current_plan from public.event_entitlements ee where ee.event_id = target_event_id;
  current_rank := case current_plan when 'free' then 0 when 'event' then 1 when 'event_pro' then 2 else -1 end;
  new_rank := case activation.plan_code when 'event' then 1 when 'event_pro' then 2 else -1 end;
  if new_rank < current_rank then raise exception 'ACTIVATION_CODE_CANNOT_DOWNGRADE'; end if;

  insert into public.activation_code_redemptions (code_id, organization_id, event_id, user_id, redeemed_plan)
  values (activation.id, event_organization, target_event_id, current_user_id, activation.plan_code);
  update public.activation_codes set use_count = use_count + 1 where id = activation.id;
  perform public.set_event_entitlement(target_event_id, activation.plan_code, 'code', null, null, null, current_user_id);
  return activation.plan_code;
end;
$$;

revoke all on function public.redeem_event_activation_code(uuid, text) from public, anon;
grant execute on function public.redeem_event_activation_code(uuid, text) to authenticated;

-- Ensure event-scoped plan limits also apply to authenticated REST writes.
-- Existing direct inserts are revoked above; the RPC is the only assignment path.
-- Keep deletes available for the existing removal RPC and event cleanup.

-- Storage uploads are organized by event for evidence and remain event-gated at the database boundary.
drop policy if exists "workspace members manage files" on storage.objects;
drop policy if exists "users manage files in their folder" on storage.objects;
drop policy if exists "workspace members read files" on storage.objects;
create policy "workspace members read files" on storage.objects
  for select to authenticated using (
    bucket_id = 'sponsorproof-files'
    and case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_organization_member(((storage.foldername(name))[1])::uuid) else false end
  );
drop policy if exists "workspace members delete files" on storage.objects;
create policy "workspace members delete files" on storage.objects
  for delete to authenticated using (
    bucket_id = 'sponsorproof-files'
    and case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_organization_member(((storage.foldername(name))[1])::uuid) else false end
  );
drop policy if exists "workspace members upload templates and entitled event files" on storage.objects;
create policy "workspace members upload templates and entitled event files" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'sponsorproof-files'
    and case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_organization_member(((storage.foldername(name))[1])::uuid) else false end
    and (
      (storage.foldername(name))[2] = 'contract-templates'
      or (
        (storage.foldername(name))[2] = 'events'
        and (storage.foldername(name))[4] = 'evidence'
        and case when (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then public.event_feature_enabled(((storage.foldername(name))[3])::uuid, 'evidence') else false end
      )
      or (
        (storage.foldername(name))[2] = 'contracts'
        and case when (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then exists (
            select 1 from public.contracts c
            where c.id = ((storage.foldername(name))[3])::uuid
              and public.event_feature_enabled(c.event_id, 'contracts')
          ) else false end
      )
    )
  );
