create table if not exists public.organization_join_codes (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  code text not null unique,
  code_hash text not null unique,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.organization_join_codes enable row level security;
revoke all on public.organization_join_codes from public, anon, authenticated;

create or replace function public.get_organization_join_code()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  organization uuid;
  member_role text;
  current_code text;
  expires timestamptz;
  random_part text;
  normalized_code text;
  attempts integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select organization_id, role into organization, member_role
  from public.organization_members
  where user_id = current_user_id;

  if organization is null then
    raise exception 'A workspace membership is required';
  end if;
  if member_role <> 'owner' then
    raise exception 'Only workspace owners can manage join codes';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(organization::text, 0));

  select c.code, c.expires_at into current_code, expires
  from public.organization_join_codes c
  where c.organization_id = organization
  for update;

  if current_code is null or expires <= pg_catalog.now() then
    loop
      attempts := attempts + 1;
      random_part := pg_catalog.upper(pg_catalog.encode(extensions.gen_random_bytes(10), 'hex'));
      current_code := 'SP-' || pg_catalog.substr(random_part, 1, 5) || '-' || pg_catalog.substr(random_part, 6, 5) || '-' || pg_catalog.substr(random_part, 11, 5) || '-' || pg_catalog.substr(random_part, 16, 5);
      normalized_code := pg_catalog.regexp_replace(pg_catalog.upper(current_code), '[^A-Z0-9]', '', 'g');
      expires := pg_catalog.now() + interval '1 hour';

      begin
        insert into public.organization_join_codes (organization_id, code, code_hash, expires_at, updated_at)
        values (organization, current_code, pg_catalog.encode(extensions.digest(normalized_code, 'sha256'), 'hex'), expires, pg_catalog.now())
        on conflict (organization_id) do update
          set code = excluded.code,
              code_hash = excluded.code_hash,
              expires_at = excluded.expires_at,
              updated_at = excluded.updated_at;
        exit;
      exception when unique_violation then
        if attempts >= 5 then raise; end if;
      end;
    end loop;
  end if;

  return pg_catalog.jsonb_build_object('code', current_code, 'expires_at', expires);
end;
$$;

create or replace function public.validate_organization_join_code(join_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_join_codes c
    where c.code_hash = pg_catalog.encode(
      extensions.digest(
        pg_catalog.regexp_replace(pg_catalog.upper(coalesce(join_code, '')), '[^A-Z0-9]', '', 'g'),
        'sha256'
      ),
      'hex'
    )
      and c.expires_at > pg_catalog.now()
  );
$$;

create or replace function public.join_organization_from_signup_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  submitted_code text := new.raw_user_meta_data ->> 'organization_join_code';
  current_organization uuid;
  normalized_code text;
begin
  if submitted_code is null or pg_catalog.length(pg_catalog.btrim(submitted_code)) = 0 then
    return new;
  end if;
  if new.raw_user_meta_data ->> 'account_type' is distinct from 'organizer' then
    raise exception 'Workspace join codes can only be used for organizer accounts';
  end if;

  normalized_code := pg_catalog.regexp_replace(pg_catalog.upper(pg_catalog.btrim(submitted_code)), '[^A-Z0-9]', '', 'g');
  select c.organization_id into current_organization
  from public.organization_join_codes c
  where c.code_hash = pg_catalog.encode(extensions.digest(normalized_code, 'sha256'), 'hex')
    and c.expires_at > pg_catalog.now()
  for update;

  if current_organization is null then
    raise exception 'Workspace join code is invalid or expired';
  end if;

  insert into public.organization_members (organization_id, user_id, email, role)
  values (current_organization, new.id, coalesce(new.email, ''), 'member');
  return new;
end;
$$;

drop trigger if exists auth_user_join_organization_by_code on auth.users;
create trigger auth_user_join_organization_by_code
  after insert on auth.users
  for each row execute function public.join_organization_from_signup_code();

revoke all on function public.get_organization_join_code() from public, anon;
revoke all on function public.validate_organization_join_code(text) from public;
revoke all on function public.join_organization_from_signup_code() from public, anon, authenticated;
grant execute on function public.get_organization_join_code() to authenticated;
grant execute on function public.validate_organization_join_code(text) to anon, authenticated;
