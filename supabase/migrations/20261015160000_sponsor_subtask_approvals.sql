alter table public.benefit_template_tasks
  add column if not exists requires_sponsor_approval boolean not null default false;

alter table public.tasks
  add column if not exists template_task_id uuid references public.benefit_template_tasks (id) on delete set null,
  add column if not exists workflow_order integer,
  add column if not exists requires_sponsor_approval boolean not null default false,
  add column if not exists sponsor_approval_status text not null default 'not_required',
  add column if not exists sponsor_approved_at timestamptz,
  add column if not exists publish_ready boolean not null default false;

alter table public.tasks
  drop constraint if exists tasks_sponsor_approval_status_check;
alter table public.tasks
  add constraint tasks_sponsor_approval_status_check
  check (sponsor_approval_status in ('not_required', 'pending', 'approved', 'changes_requested'));

create index if not exists tasks_benefit_workflow_idx
  on public.tasks (benefit_id, workflow_order);
