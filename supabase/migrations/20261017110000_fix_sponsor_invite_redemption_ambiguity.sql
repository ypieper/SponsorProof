-- Replace the invitation redemption function with an unambiguous conflict
-- target. RETURNS TABLE exposes event_id/sponsor_id/account_id as PL/pgSQL
-- variables, so a column-list conflict target can raise SQLSTATE 42702.
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
  current_user_metadata jsonb := coalesce((select auth.jwt()) -> 'user_metadata', '{}'::jsonb);
  resolved_account_name text;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if invitation_code is null or length(invitation_code) < 32 then
    raise exception 'SPONSOR_CODE_INVALID';
  end if;

  -- Validate and lock the invitation before using its sponsor assignment to
  -- initialize a missing account.
  select * into code_record
  from public.sponsor_event_codes c
  where c.code_hash = encode(extensions.digest(invitation_code, 'sha256'), 'hex')
  for update;

  if code_record.id is null
    or not code_record.is_active
    or (code_record.expires_at is not null and code_record.expires_at <= now()) then
    raise exception 'SPONSOR_CODE_INVALID_OR_EXPIRED';
  end if;

  if target_account_id is null then
    select m.account_id into target_account_id
    from public.sponsor_account_members m
    where m.user_id = current_user_id
    order by m.joined_at, m.account_id
    limit 1;

    if target_account_id is null then
      if current_user_metadata ->> 'account_type' = 'sponsor' then
        resolved_account_name := nullif(trim(current_user_metadata ->> 'sponsor_company_name'), '');
      end if;

      if resolved_account_name is null then
        select s.name into resolved_account_name
        from public.sponsors s
        where s.id = code_record.sponsor_id;
      end if;

      if resolved_account_name is null then
        raise exception 'SPONSOR_ACCOUNT_ACCESS_DENIED';
      end if;

      insert into public.sponsor_accounts (name, created_by)
      values (resolved_account_name, current_user_id)
      returning id into target_account_id;

      insert into public.sponsor_account_members (account_id, user_id, role)
      values (target_account_id, current_user_id, 'owner');
    end if;
  end if;

  if not public.is_sponsor_account_member(target_account_id) then
    raise exception 'SPONSOR_ACCOUNT_ACCESS_DENIED';
  end if;

  -- The composite key makes repeated redemption by one account idempotent,
  -- while allowing additional independent sponsor accounts to join.
  insert into public.sponsor_event_accounts (event_id, sponsor_id, account_id, linked_by)
  values (code_record.event_id, code_record.sponsor_id, target_account_id, current_user_id)
  on conflict on constraint sponsor_event_accounts_pkey do nothing;

  -- Preserve the first redemption for audit purposes without consuming the
  -- reusable code or replacing its original redeemer.
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
