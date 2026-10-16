alter table public.benefit_template_tasks
  add column if not exists completion_type text;

update public.benefit_template_tasks
set completion_type = case when requires_sponsor_approval then 'sponsor_approval' else 'file_required' end
where completion_type is null;

alter table public.benefit_template_tasks
  alter column completion_type set default 'file_required',
  alter column completion_type set not null;

alter table public.benefit_template_tasks
  drop constraint if exists benefit_template_tasks_completion_type_check;
alter table public.benefit_template_tasks
  add constraint benefit_template_tasks_completion_type_check
  check (completion_type in ('file_required', 'organizer_approval', 'sponsor_approval'));

alter table public.tasks
  add column if not exists completion_type text,
  add column if not exists workflow_instance integer;

update public.tasks
set completion_type = case when requires_sponsor_approval then 'sponsor_approval' else 'file_required' end
where completion_type is null;

update public.tasks set workflow_instance = 1 where workflow_instance is null;

alter table public.tasks
  alter column completion_type set default 'file_required',
  alter column completion_type set not null,
  alter column workflow_instance set default 1,
  alter column workflow_instance set not null;

alter table public.tasks
  drop constraint if exists tasks_completion_type_check;
alter table public.tasks
  add constraint tasks_completion_type_check
  check (completion_type in ('file_required', 'organizer_approval', 'sponsor_approval'));

update public.tasks
set requires_sponsor_approval = (completion_type = 'sponsor_approval');
