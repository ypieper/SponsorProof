create or replace function public.validate_benefit_template_task_sequence()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  template_id uuid;
begin
  if tg_op <> 'INSERT' then
    template_id := old.benefit_template_id;
    if exists (
      select 1
      from (
        select completion_type,
          lag(completion_type) over (order by sort_order) as previous_type
        from public.benefit_template_tasks
        where benefit_template_id = template_id
      ) ordered_tasks
      where (previous_type = 'file_required' and completion_type = 'sponsor_approval')
         or (previous_type = 'sponsor_approval' and completion_type = 'sponsor_approval')
    ) then
      raise exception 'TASK_WORKFLOW_INVALID_TRANSITION';
    end if;
  end if;

  if tg_op <> 'DELETE' then
    template_id := new.benefit_template_id;
    if exists (
      select 1
      from (
        select completion_type,
          lag(completion_type) over (order by sort_order) as previous_type
        from public.benefit_template_tasks
        where benefit_template_id = template_id
      ) ordered_tasks
      where (previous_type = 'file_required' and completion_type = 'sponsor_approval')
         or (previous_type = 'sponsor_approval' and completion_type = 'sponsor_approval')
    ) then
      raise exception 'TASK_WORKFLOW_INVALID_TRANSITION';
    end if;
  end if;

  return null;
end;
$$;

revoke all on function public.validate_benefit_template_task_sequence() from public, anon, authenticated;

drop trigger if exists benefit_template_task_sequence_guard on public.benefit_template_tasks;
create constraint trigger benefit_template_task_sequence_guard
after insert or delete
on public.benefit_template_tasks
deferrable initially deferred
for each row execute function public.validate_benefit_template_task_sequence();

drop trigger if exists benefit_template_task_sequence_update_guard on public.benefit_template_tasks;
create constraint trigger benefit_template_task_sequence_update_guard
after update of benefit_template_id, sort_order, completion_type
on public.benefit_template_tasks
deferrable initially deferred
for each row execute function public.validate_benefit_template_task_sequence();

create or replace function public.validate_assigned_task_sequence()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_benefit_id uuid;
  target_workflow_instance integer;
begin
  if tg_op <> 'INSERT' and old.source = 'Leistung' and old.benefit_id is not null and old.workflow_order is not null then
    target_benefit_id := old.benefit_id;
    target_workflow_instance := old.workflow_instance;
    if exists (
      select 1
      from (
        select completion_type, requires_sponsor_approval,
          lag(case when requires_sponsor_approval then 'sponsor_approval' else completion_type end)
            over (order by workflow_order) as previous_type
        from public.tasks
        where source = 'Leistung'
          and benefit_id = target_benefit_id
          and workflow_instance = target_workflow_instance
          and workflow_order is not null
      ) ordered_tasks
      where (previous_type = 'file_required' and (completion_type = 'sponsor_approval' or requires_sponsor_approval))
         or (previous_type = 'sponsor_approval' and (completion_type = 'sponsor_approval' or requires_sponsor_approval))
    ) then
      raise exception 'TASK_WORKFLOW_INVALID_TRANSITION';
    end if;
  end if;

  if tg_op <> 'DELETE' and new.source = 'Leistung' and new.benefit_id is not null and new.workflow_order is not null then
    target_benefit_id := new.benefit_id;
    target_workflow_instance := new.workflow_instance;
    if exists (
      select 1
      from (
        select completion_type, requires_sponsor_approval,
          lag(case when requires_sponsor_approval then 'sponsor_approval' else completion_type end)
            over (order by workflow_order) as previous_type
        from public.tasks
        where source = 'Leistung'
          and benefit_id = target_benefit_id
          and workflow_instance = target_workflow_instance
          and workflow_order is not null
      ) ordered_tasks
      where (previous_type = 'file_required' and (completion_type = 'sponsor_approval' or requires_sponsor_approval))
         or (previous_type = 'sponsor_approval' and (completion_type = 'sponsor_approval' or requires_sponsor_approval))
    ) then
      raise exception 'TASK_WORKFLOW_INVALID_TRANSITION';
    end if;
  end if;

  return null;
end;
$$;

revoke all on function public.validate_assigned_task_sequence() from public, anon, authenticated;

drop trigger if exists assigned_task_sequence_guard on public.tasks;
create constraint trigger assigned_task_sequence_guard
after insert or delete
on public.tasks
deferrable initially deferred
for each row execute function public.validate_assigned_task_sequence();

drop trigger if exists assigned_task_sequence_update_guard on public.tasks;
create constraint trigger assigned_task_sequence_update_guard
after update of source, benefit_id, workflow_order, workflow_instance, completion_type, requires_sponsor_approval
on public.tasks
deferrable initially deferred
for each row execute function public.validate_assigned_task_sequence();
