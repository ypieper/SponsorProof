-- Keep one invitation code for each sponsor assignment. Redeemed codes stay
-- visible to event organizers and cannot be replaced with a new code.
create or replace function public.create_sponsor_event_code(
  target_event_id uuid,
  target_sponsor_id uuid,
  target_expires_at timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  plain_code text := encode(extensions.gen_random_bytes(32), 'hex');
  locked_rows integer;
begin
  if auth.uid() is null or not public.owns_event(target_event_id) then
    raise exception 'EVENT_ACCESS_DENIED';
  end if;
  if target_expires_at is not null and target_expires_at <= now() then
    raise exception 'Code expiration must be in the future';
  end if;

  -- Serialize creation attempts for this assignment before checking for an
  -- existing code, including one that has already been redeemed.
  perform 1
  from public.event_sponsors es
  where es.event_id = target_event_id and es.sponsor_id = target_sponsor_id
  for update;
  get diagnostics locked_rows = row_count;
  if locked_rows = 0 then raise exception 'Event sponsor assignment not found'; end if;

  if exists (
    select 1 from public.sponsor_event_codes c
    where c.event_id = target_event_id and c.sponsor_id = target_sponsor_id
  ) then
    raise exception 'SPONSOR_EVENT_CODE_ALREADY_EXISTS';
  end if;

  insert into public.sponsor_event_codes (
    event_id, sponsor_id, code_hash, code_hint, code_value,
    expires_at, created_by
  ) values (
    target_event_id,
    target_sponsor_id,
    encode(extensions.digest(plain_code, 'sha256'), 'hex'),
    right(plain_code, 4),
    plain_code,
    target_expires_at,
    auth.uid()
  );

  return plain_code;
end;
$$;

revoke all on function public.create_sponsor_event_code(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.create_sponsor_event_code(uuid, uuid, timestamptz) to authenticated;
