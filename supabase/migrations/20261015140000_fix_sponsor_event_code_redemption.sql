-- Avoid ambiguity between RETURNS TABLE output parameters and the
-- sponsor_event_accounts column names in the ON CONFLICT target.
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
    and c.is_active
    and (c.expires_at is null or c.expires_at > now())
    and c.redeemed_at is null
  for update;

  if code_record.id is null then raise exception 'SPONSOR_CODE_INVALID_OR_EXPIRED'; end if;

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
