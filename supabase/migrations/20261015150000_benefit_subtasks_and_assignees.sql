-- Reusable subtasks belong to a benefit template; assigned tasks are copied
-- into the event's existing tasks table when the benefit is assigned.
create table if not exists public.benefit_template_tasks (
  id uuid primary key default gen_random_uuid(),
  benefit_template_id uuid not null references public.benefit_templates (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (benefit_template_id, sort_order)
);

create index if not exists benefit_template_tasks_template_idx
  on public.benefit_template_tasks (benefit_template_id, sort_order);

alter table public.benefits
  add column if not exists quantity integer not null default 1 check (quantity > 0);

alter table public.benefit_template_tasks enable row level security;
revoke all on public.benefit_template_tasks from anon, authenticated;
grant select, insert, update, delete on public.benefit_template_tasks to authenticated;
grant all on public.benefit_template_tasks to service_role;

drop policy if exists "workspace members manage benefit template tasks" on public.benefit_template_tasks;
create policy "workspace members manage benefit template tasks" on public.benefit_template_tasks
  for all to authenticated
  using (
    exists (
      select 1 from public.benefit_templates bt
      where bt.id = benefit_template_id
        and public.is_organization_member(bt.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.benefit_templates bt
      where bt.id = benefit_template_id
        and public.is_organization_member(bt.organization_id)
    )
  );

alter table public.tasks
  add column if not exists assigned_to uuid references auth.users (id) on delete set null;

create index if not exists tasks_assigned_to_idx on public.tasks (assigned_to);

create or replace function public.validate_task_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_to is not null and not exists (
    select 1
    from public.organization_members m
    where m.organization_id = new.organization_id
      and m.user_id = new.assigned_to
  ) then
    raise exception 'TASK_ASSIGNEE_NOT_IN_ORGANIZATION';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_task_assignee() from public, anon, authenticated;

drop trigger if exists tasks_assignee_organization_guard on public.tasks;
create trigger tasks_assignee_organization_guard
  before insert or update of assigned_to, organization_id on public.tasks
  for each row execute function public.validate_task_assignee();
