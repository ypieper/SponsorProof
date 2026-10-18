alter table public.benefit_templates
  add column if not exists internal_comment text;
