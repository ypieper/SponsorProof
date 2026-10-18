alter table public.benefit_templates
  drop constraint if exists benefit_templates_default_completion_type_check;

alter table public.benefit_templates
  add constraint benefit_templates_default_completion_type_check
  check (default_completion_type in ('file_required', 'organizer_approval', 'none_required'));

alter table public.benefits
  add column if not exists completion_required boolean not null default true;
