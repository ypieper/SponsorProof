begin;

alter table public.events
  add column if not exists location_street text not null default '',
  add column if not exists location_postal_code text not null default '',
  add column if not exists location_city text not null default '';

drop function if exists public.create_event_with_free_entitlement(text, date, date, text, text, double precision, double precision, text);

create or replace function public.create_event_with_free_entitlement(
  event_title text,
  event_start_date date,
  event_end_date date,
  event_location text,
  event_responsible text,
  event_location_street text,
  event_location_postal_code text,
  event_location_city text
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
  if event_location_street is null or length(trim(event_location_street)) = 0 then raise exception 'Event street is required'; end if;
  if event_location_postal_code !~ '^[0-9]{5}$' then raise exception 'A five-digit postal code is required'; end if;
  if event_location_city is null or length(trim(event_location_city)) = 0 then raise exception 'Event city is required'; end if;

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
    location_street, location_postal_code, location_city, responsible
  )
  values (
    organization, auth.uid(), trim(event_title), event_start_date, event_end_date,
    coalesce(event_location, ''), trim(event_location_street), trim(event_location_postal_code),
    trim(event_location_city), coalesce(event_responsible, '')
  )
  returning id into new_event;
  perform public.set_event_entitlement(new_event, 'free', 'free', null, null, null, auth.uid());
  return new_event;
end;
$$;

revoke all on function public.create_event_with_free_entitlement(text, date, date, text, text, text, text, text) from public, anon;
grant execute on function public.create_event_with_free_entitlement(text, date, date, text, text, text, text, text) to authenticated;

commit;
