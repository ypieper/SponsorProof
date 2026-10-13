create or replace function public.remove_sponsor_from_event(target_event_id uuid, target_sponsor_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.owns_event(target_event_id) then
    raise exception 'You do not have access to this event';
  end if;

  if not exists (
    select 1 from public.sponsors s
    where s.id = target_sponsor_id and s.event_id = target_event_id
  ) then
    return false;
  end if;

  delete from public.tasks t
  where t.event_id = target_event_id and t.sponsor_id = target_sponsor_id;

  delete from public.benefits b
  where b.event_id = target_event_id and b.sponsor_id = target_sponsor_id;

  delete from public.contracts c
  where c.event_id = target_event_id and c.sponsor_id = target_sponsor_id;

  update public.sponsors
  set event_id = null, sponsorship_value_cents = 0, status = 'Offen'
  where id = target_sponsor_id and event_id = target_event_id;

  return found;
end;
$$;

revoke all on function public.remove_sponsor_from_event(uuid, uuid) from public, anon;
grant execute on function public.remove_sponsor_from_event(uuid, uuid) to authenticated;
