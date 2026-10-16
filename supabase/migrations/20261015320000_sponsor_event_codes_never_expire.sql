-- Sponsor event invitations remain valid until redeemed. Existing expiration
-- values are cleared so previously generated codes do not become unusable.
update public.sponsor_event_codes
set expires_at = null
where expires_at is not null;

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
    null,
    auth.uid()
  );

  return plain_code;
end;
$$;

revoke all on function public.create_sponsor_event_code(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.create_sponsor_event_code(uuid, uuid, timestamptz) to authenticated;

create or replace function public.redeem_sponsor_event_code(
  invitation_code text,
  target_account_id uuid
)
returns table (event_id uuid, sponsor_id uuid, account_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  code_record public.sponsor_event_codes%rowtype;
  current_user_id uuid := (select auth.uid());
  linked_account_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if invitation_code is null or length(invitation_code) < 32 then
    raise exception 'SPONSOR_CODE_INVALID';
  end if;
  if not public.is_sponsor_account_member(target_account_id) then
    raise exception 'SPONSOR_ACCOUNT_ACCESS_DENIED';
  end if;

  select * into code_record
  from public.sponsor_event_codes c
  where c.code_hash = encode(extensions.digest(invitation_code, 'sha256'), 'hex')
  for update;

  if code_record.id is null then raise exception 'SPONSOR_CODE_INVALID'; end if;
  if code_record.redeemed_at is not null then
    if code_record.redeemed_account_id = target_account_id then
      return query select code_record.event_id, code_record.sponsor_id, target_account_id;
      return;
    end if;
    raise exception 'SPONSOR_ASSIGNMENT_ALREADY_CLAIMED';
  end if;
  if not code_record.is_active then raise exception 'SPONSOR_CODE_INVALID'; end if;

  select sea.account_id into linked_account_id
  from public.sponsor_event_accounts sea
  where sea.event_id = code_record.event_id and sea.sponsor_id = code_record.sponsor_id
  for update;

  if linked_account_id is not null and linked_account_id <> target_account_id then
    raise exception 'SPONSOR_ASSIGNMENT_ALREADY_CLAIMED';
  end if;

  insert into public.sponsor_event_accounts (event_id, sponsor_id, account_id, linked_by)
  values (code_record.event_id, code_record.sponsor_id, target_account_id, current_user_id)
  on conflict on constraint sponsor_event_accounts_pkey do nothing;

  update public.sponsor_event_codes
  set is_active = false,
      redeemed_at = now(),
      redeemed_by = current_user_id,
      redeemed_account_id = target_account_id
  where id = code_record.id;

  return query select code_record.event_id, code_record.sponsor_id, target_account_id;
end;
$$;

revoke all on function public.redeem_sponsor_event_code(text, uuid) from public, anon;
grant execute on function public.redeem_sponsor_event_code(text, uuid) to authenticated;
