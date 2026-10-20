begin;

alter table public.events
  add column if not exists location_latitude double precision,
  add column if not exists location_longitude double precision,
  add column if not exists location_place_id text;

alter table public.events
  add constraint events_location_coordinates_valid
  check (
    (location_latitude is null and location_longitude is null)
    or (location_latitude between -90 and 90 and location_longitude between -180 and 180)
  );

create or replace function public.create_event_with_free_entitlement(
  event_title text,
  event_start_date date,
  event_end_date date,
  event_location text,
  event_responsible text,
  event_location_latitude double precision,
  event_location_longitude double precision,
  event_location_place_id text
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

  insert into public.events (
    organization_id, owner_id, title, start_date, end_date, location,
    location_latitude, location_longitude, location_place_id, responsible
  )
  values (
    organization, auth.uid(), trim(event_title), event_start_date, event_end_date,
    coalesce(event_location, ''), event_location_latitude, event_location_longitude,
    event_location_place_id, coalesce(event_responsible, '')
  )
  returning id into new_event;
  perform public.set_event_entitlement(new_event, 'free', 'free', null, null, null, auth.uid());
  return new_event;
end;
$$;

revoke all on function public.create_event_with_free_entitlement(text, date, date, text, text, double precision, double precision, text) from public, anon;
grant execute on function public.create_event_with_free_entitlement(text, date, date, text, text, double precision, double precision, text) to authenticated;

commit;
