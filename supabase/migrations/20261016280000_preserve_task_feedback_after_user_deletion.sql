-- Keep review comments when an account is deleted. These rows can refer to
-- tasks in another organization even after the user's own organization is gone.
alter table public.sponsor_task_feedback
  alter column created_by drop not null;
alter table public.sponsor_task_feedback
  drop constraint if exists sponsor_task_feedback_created_by_fkey;
alter table public.sponsor_task_feedback
  add constraint sponsor_task_feedback_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

alter table public.task_workflow_feedback
  alter column created_by drop not null;
alter table public.task_workflow_feedback
  drop constraint if exists task_workflow_feedback_created_by_fkey;
alter table public.task_workflow_feedback
  add constraint task_workflow_feedback_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

notify pgrst, 'reload schema';
