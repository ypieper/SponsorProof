alter table public.benefit_templates
  add column if not exists benefit_type text not null default 'monetary';

alter table public.benefit_templates
  drop constraint if exists benefit_templates_benefit_type_check;

alter table public.benefit_templates
  add constraint benefit_templates_benefit_type_check
  check (benefit_type in ('monetary', 'in_kind'));

alter table public.benefits
  add column if not exists benefit_type text not null default 'monetary';

alter table public.benefits
  drop constraint if exists benefits_benefit_type_check;

alter table public.benefits
  add constraint benefits_benefit_type_check
  check (benefit_type in ('monetary', 'in_kind'));
