create sequence if not exists public.organizations_sponso_number_seq;

alter table public.organizations
  add column if not exists sponso_number bigint;

update public.organizations
set sponso_number = nextval('public.organizations_sponso_number_seq')
where sponso_number is null;

alter table public.organizations
  alter column sponso_number set default nextval('public.organizations_sponso_number_seq'),
  alter column sponso_number set not null;

alter sequence public.organizations_sponso_number_seq
  owned by public.organizations.sponso_number;

create unique index if not exists organizations_sponso_number_key
  on public.organizations (sponso_number);

create or replace function public.prevent_organization_sponso_number_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sponso_number is distinct from old.sponso_number then
    raise exception 'Sponso-ID cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_sponso_number_immutable on public.organizations;
create trigger organizations_sponso_number_immutable
before update of sponso_number on public.organizations
for each row execute function public.prevent_organization_sponso_number_change();
