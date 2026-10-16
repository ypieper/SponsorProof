alter table public.tasks
  add column if not exists assigned_to_sponsor boolean not null default false;

alter table public.tasks
  drop constraint if exists tasks_assigned_to_sponsor_check;

alter table public.tasks
  add constraint tasks_assigned_to_sponsor_check
  check (not assigned_to_sponsor or (assigned_to is null and sponsor_id is not null));
