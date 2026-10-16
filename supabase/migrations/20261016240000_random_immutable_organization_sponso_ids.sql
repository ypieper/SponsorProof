alter table public.organizations
  add column if not exists sponso_id text;

create or replace function public.generate_sponso_id()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'SP-' || upper(substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 20));
$$;

do $$
declare
  organization_row record;
  generated_id text;
begin
  for organization_row in
    select id from public.organizations where sponso_id is null
  loop
    loop
      generated_id := public.generate_sponso_id();
      exit when not exists (
        select 1 from public.organizations existing
        where existing.sponso_id = generated_id
      );
    end loop;

    update public.organizations
    set sponso_id = generated_id
    where id = organization_row.id;
  end loop;
end;
$$;

alter table public.organizations
  alter column sponso_id set not null;

create unique index if not exists organizations_sponso_id_key
  on public.organizations (sponso_id);

create or replace function public.assign_organization_sponso_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  loop
    new.sponso_id := public.generate_sponso_id();
    exit when not exists (
      select 1 from public.organizations existing
      where existing.sponso_id = new.sponso_id
    );
  end loop;
  return new;
end;
$$;

create or replace function public.prevent_organization_sponso_id_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sponso_id is distinct from old.sponso_id then
    raise exception 'Sponso-ID cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_assign_sponso_id on public.organizations;
create trigger organizations_assign_sponso_id
before insert on public.organizations
for each row execute function public.assign_organization_sponso_id();

drop trigger if exists organizations_sponso_id_immutable on public.organizations;
create trigger organizations_sponso_id_immutable
before update of sponso_id on public.organizations
for each row execute function public.prevent_organization_sponso_id_change();

drop trigger if exists organizations_sponso_number_immutable on public.organizations;
drop function if exists public.prevent_organization_sponso_number_change();
alter table public.organizations drop column if exists sponso_number;
