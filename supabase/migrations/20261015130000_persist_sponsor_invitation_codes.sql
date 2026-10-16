-- Keep the active invite code so event organizers can see it again after
-- reloading the event overview. Access remains server-side through the admin API.
alter table public.sponsor_event_codes
  add column if not exists code_value text;

comment on column public.sponsor_event_codes.code_value is
  'Plain invite code for organizer display; readable only through the authenticated server endpoint. The digest remains the redemption lookup key.';

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
  assignment_exists boolean;
begin
  if auth.uid() is null or not public.owns_event(target_event_id) then
    raise exception 'EVENT_ACCESS_DENIED';
  end if;
  if target_expires_at is not null and target_expires_at <= now() then
    raise exception 'Code expiration must be in the future';
  end if;

  select exists (
    select 1 from public.event_sponsors es
    where es.event_id = target_event_id and es.sponsor_id = target_sponsor_id
  ) into assignment_exists;
  if not assignment_exists then raise exception 'Event sponsor assignment not found'; end if;

  update public.sponsor_event_codes
  set is_active = false
  where event_id = target_event_id and sponsor_id = target_sponsor_id and is_active;

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
