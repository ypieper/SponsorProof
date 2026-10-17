-- A sponsor invitation can connect multiple independent sponsor accounts to
-- the same event/sponsor assignment. Each account is linked only once.
alter table public.sponsor_event_accounts
  drop constraint sponsor_event_accounts_pkey,
  add constraint sponsor_event_accounts_pkey primary key (event_id, sponsor_id, account_id);

-- Previously redeemed codes were made inactive after their first use. Keep
-- those existing codes usable under the new multi-use behavior.
update public.sponsor_event_codes
set is_active = true
where redeemed_at is not null
  and (expires_at is null or expires_at > now());

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
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if invitation_code is null or length(invitation_code) < 32 then
    raise exception 'SPONSOR_CODE_INVALID';
  end if;
  if not public.is_sponsor_account_member(target_account_id) then
    raise exception 'SPONSOR_ACCOUNT_ACCESS_DENIED';
  end if;

  -- Serialize redemptions of one code. The account link itself is idempotent
  -- through its composite primary key, so distinct sponsor accounts may join.
  select * into code_record
  from public.sponsor_event_codes c
  where c.code_hash = encode(extensions.digest(invitation_code, 'sha256'), 'hex')
  for update;

  if code_record.id is null
    or not code_record.is_active
    or (code_record.expires_at is not null and code_record.expires_at <= now()) then
    raise exception 'SPONSOR_CODE_INVALID_OR_EXPIRED';
  end if;

  insert into public.sponsor_event_accounts (event_id, sponsor_id, account_id, linked_by)
  values (code_record.event_id, code_record.sponsor_id, target_account_id, current_user_id)
  on conflict (event_id, sponsor_id, account_id) do nothing;

  -- Preserve the first redemption for audit purposes; it does not consume the
  -- reusable code or prevent another sponsor account from joining.
  update public.sponsor_event_codes
  set redeemed_at = coalesce(redeemed_at, now()),
      redeemed_by = coalesce(redeemed_by, current_user_id),
      redeemed_account_id = coalesce(redeemed_account_id, target_account_id)
  where id = code_record.id;

  return query select code_record.event_id, code_record.sponsor_id, target_account_id;
end;
$$;

revoke all on function public.redeem_sponsor_event_code(text, uuid) from public, anon;
grant execute on function public.redeem_sponsor_event_code(text, uuid) to authenticated;
