-- Sponsor accounts are independent of organizer workspaces. A sponsor account
-- can claim event-specific sponsor records from multiple organizers.
create table if not exists public.sponsor_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sponsor_account_members (
  account_id uuid not null references public.sponsor_accounts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (account_id, user_id)
);

create index if not exists sponsor_account_members_user_id_idx
  on public.sponsor_account_members (user_id);

create table if not exists public.sponsor_event_accounts (
  event_id uuid not null,
  sponsor_id uuid not null,
  account_id uuid not null references public.sponsor_accounts (id) on delete restrict,
  linked_by uuid references auth.users (id) on delete set null,
  linked_at timestamptz not null default now(),
  primary key (event_id, sponsor_id),
  foreign key (event_id, sponsor_id)
    references public.event_sponsors (event_id, sponsor_id) on delete cascade
);

create index if not exists sponsor_event_accounts_account_id_idx
  on public.sponsor_event_accounts (account_id);

-- Codes are stored only as hashes and can claim one event-specific sponsor
-- assignment. Rotating a code deactivates the previous active code.
create table if not exists public.sponsor_event_codes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  sponsor_id uuid not null,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  code_hint text not null,
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users (id) on delete set null,
  redeemed_account_id uuid references public.sponsor_accounts (id) on delete restrict,
  foreign key (event_id, sponsor_id)
    references public.event_sponsors (event_id, sponsor_id) on delete cascade,
  check (
    (redeemed_at is null and redeemed_by is null and redeemed_account_id is null)
    or (redeemed_at is not null and redeemed_by is not null and redeemed_account_id is not null)
  )
);

create unique index if not exists sponsor_event_codes_one_active_per_assignment_idx
  on public.sponsor_event_codes (event_id, sponsor_id) where is_active;
create index if not exists sponsor_event_codes_created_at_idx
  on public.sponsor_event_codes (created_at desc);

alter table public.sponsor_accounts enable row level security;
alter table public.sponsor_account_members enable row level security;
alter table public.sponsor_event_accounts enable row level security;
alter table public.sponsor_event_codes enable row level security;

revoke all on public.sponsor_accounts, public.sponsor_account_members,
  public.sponsor_event_accounts, public.sponsor_event_codes from anon, authenticated;
grant select on public.sponsor_accounts, public.sponsor_account_members,
  public.sponsor_event_accounts to authenticated;
grant all on public.sponsor_accounts, public.sponsor_account_members,
  public.sponsor_event_accounts, public.sponsor_event_codes to service_role;

create or replace function public.is_sponsor_account_member(target_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sponsor_account_members m
    where m.account_id = target_account_id and m.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_sponsor_account_member(uuid) from public, anon;
grant execute on function public.is_sponsor_account_member(uuid) to authenticated;

drop policy if exists "sponsor members view their accounts" on public.sponsor_accounts;
create policy "sponsor members view their accounts" on public.sponsor_accounts
  for select to authenticated using (public.is_sponsor_account_member(id));

drop policy if exists "sponsor members view their account membership" on public.sponsor_account_members;
create policy "sponsor members view their account membership" on public.sponsor_account_members
  for select to authenticated using (public.is_sponsor_account_member(account_id));

drop policy if exists "organizers and linked sponsors view event account links" on public.sponsor_event_accounts;
create policy "organizers and linked sponsors view event account links" on public.sponsor_event_accounts
  for select to authenticated using (
    public.owns_event(event_id) or public.is_sponsor_account_member(account_id)
  );

create or replace function public.create_sponsor_account(account_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_account_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if account_name is null or length(trim(account_name)) = 0 then
    raise exception 'Sponsor account name is required';
  end if;

  select a.id into new_account_id
  from public.sponsor_accounts a
  where a.created_by = current_user_id
  order by a.created_at
  limit 1;

  if new_account_id is not null then
    insert into public.sponsor_account_members (account_id, user_id, role)
    values (new_account_id, current_user_id, 'owner')
    on conflict (account_id, user_id) do nothing;
    return new_account_id;
  end if;

  insert into public.sponsor_accounts (name, created_by)
  values (trim(account_name), current_user_id)
  returning id into new_account_id;

  insert into public.sponsor_account_members (account_id, user_id, role)
  values (new_account_id, current_user_id, 'owner');

  return new_account_id;
end;
$$;

revoke all on function public.create_sponsor_account(text) from public, anon;
grant execute on function public.create_sponsor_account(text) to authenticated;

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
    event_id, sponsor_id, code_hash, code_hint, expires_at, created_by
  ) values (
    target_event_id,
    target_sponsor_id,
    encode(extensions.digest(plain_code, 'sha256'), 'hex'),
    right(plain_code, 4),
    target_expires_at,
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
  on conflict (event_id, sponsor_id) do nothing;

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
