alter table public.benefit_templates
  add column if not exists material_logistics text;

alter table public.benefits
  add column if not exists material_logistics text;
