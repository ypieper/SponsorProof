create or replace function public.duplicate_event_with_configuration(
  source_event_id uuid,
  new_event_title text,
  new_event_start_date date,
  new_event_end_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_event public.events%rowtype;
  source_benefit public.benefits%rowtype;
  sponsor_assignment record;
  new_event_id uuid;
  new_benefit_id uuid;
  max_free_events integer;
  free_event_count integer;
  benefit_ids jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select e.* into source_event
  from public.events e
  where e.id = source_event_id
    and public.owns_event(e.id)
  for share;
  if not found then raise exception 'EVENT_ACCESS_DENIED'; end if;
  if source_event.organization_id <> public.current_organization_id() then
    raise exception 'EVENT_ACCESS_DENIED';
  end if;
  if new_event_title is null or length(trim(new_event_title)) = 0 then
    raise exception 'Event title is required';
  end if;
  if new_event_start_date is null or new_event_end_date is null or new_event_end_date < new_event_start_date then
    raise exception 'Valid event dates are required';
  end if;

  -- Keep the same free-event limit and default entitlement as regular event
  -- creation, while allowing older events with incomplete structured address
  -- fields to be duplicated without inventing missing address information.
  perform 1 from public.organizations where id = source_event.organization_id for update;
  if not public.organization_enterprise_active(source_event.organization_id) then
    select p.max_events into max_free_events
    from public.event_plans p where p.code = 'free';
    select count(*) into free_event_count
    from public.event_entitlements ee
    join public.event_plans p on p.code = ee.plan_code
    where ee.organization_id = source_event.organization_id
      and ee.entitlement_status = 'active'
      and p.code = 'free';
    if max_free_events is not null and free_event_count >= max_free_events then
      raise exception using errcode = 'P0001', message = 'FREE_EVENT_LIMIT_REACHED';
    end if;
  end if;

  insert into public.events (
    organization_id, owner_id, title, start_date, end_date, location,
    location_street, location_postal_code, location_city, location_latitude,
    location_longitude, location_place_id, responsible, contact_first_name,
    contact_last_name, contact_email, contact_phone, organizer_logo_path
  ) values (
    source_event.organization_id, auth.uid(), trim(new_event_title),
    new_event_start_date, new_event_end_date, source_event.location,
    source_event.location_street, source_event.location_postal_code,
    source_event.location_city, source_event.location_latitude,
    source_event.location_longitude, source_event.location_place_id,
    source_event.responsible, source_event.contact_first_name,
    source_event.contact_last_name, source_event.contact_email,
    source_event.contact_phone, source_event.organizer_logo_path
  ) returning id into new_event_id;

  perform public.set_event_entitlement(new_event_id, 'free', 'free', null, null, null, auth.uid());

  insert into public.event_sponsors (event_id, sponsor_id)
  select new_event_id, es.sponsor_id
  from public.event_sponsors es
  where es.event_id = source_event_id;

  -- New event codes are generated, but no sponsor account links are copied.
  -- Each sponsor must redeem the new event's code to gain access.
  for sponsor_assignment in
    select es.sponsor_id
    from public.event_sponsors es
    where es.event_id = new_event_id
  loop
    perform public.create_sponsor_event_code(new_event_id, sponsor_assignment.sponsor_id, null);
  end loop;

  for source_benefit in
    select b.*
    from public.benefits b
    where b.event_id = source_event_id
    order by b.created_at, b.id
  loop
    insert into public.benefits (
      event_id, sponsor_id, contract_id, title, benefit_type, material_logistics,
      category, description, detail, quantity, tasks_per_unit, completion_required,
      status, evidence_summary, due_at
    ) values (
      new_event_id, source_benefit.sponsor_id, null, source_benefit.title,
      source_benefit.benefit_type, source_benefit.material_logistics,
      source_benefit.category, source_benefit.description, source_benefit.detail,
      source_benefit.quantity, source_benefit.tasks_per_unit,
      source_benefit.completion_required, 'Offen', 'Noch kein Nachweis', null
    ) returning id into new_benefit_id;

    benefit_ids := benefit_ids || jsonb_build_object(source_benefit.id::text, new_benefit_id::text);
  end loop;

  insert into public.tasks (
    organization_id, event_id, sponsor_id, sponsor_name, benefit_id, assigned_to,
    assigned_to_sponsor, template_task_id, workflow_order, workflow_instance,
    completion_type, requires_sponsor_approval, sponsor_approval_status,
    sponsor_approved_at, publish_ready, title, description, due_at, status, source
  )
  select
    source_event.organization_id,
    new_event_id,
    t.sponsor_id,
    t.sponsor_name,
    case when t.benefit_id is null then null else (benefit_ids ->> t.benefit_id::text)::uuid end,
    t.assigned_to,
    t.assigned_to_sponsor,
    t.template_task_id,
    t.workflow_order,
    t.workflow_instance,
    t.completion_type,
    t.requires_sponsor_approval,
    case when t.completion_type = 'sponsor_approval' or t.requires_sponsor_approval then 'pending' else 'not_required' end,
    null,
    false,
    t.title,
    t.description,
    null,
    'Offen',
    t.source
  from public.tasks t
  where t.event_id = source_event_id;

  return new_event_id;
end;
$$;

revoke all on function public.duplicate_event_with_configuration(uuid, text, date, date) from public, anon;
grant execute on function public.duplicate_event_with_configuration(uuid, text, date, date) to authenticated;
