alter table public.benefit_templates
  add column if not exists tasks_per_unit boolean not null default true;

alter table public.benefits
  add column if not exists tasks_per_unit boolean not null default true;
