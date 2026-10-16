-- When an organizer approval precedes a sponsor approval in the same benefit
-- workflow, sharing the preceding proof is mandatory. Keep direct organizer
-- approvals without a following sponsor step free of an extra confirmation.
create or replace function public.respond_to_organizer_task(
  target_task_id uuid,
  target_decision text,
  target_comment text default null,
  share_previous_file boolean default false
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_record public.tasks%rowtype;
  previous_task_id uuid;
  deleted_paths text[] := array[]::text[];
  previous_count integer;
  completed_previous_count integer;
  sponsor_approval_follows boolean := false;
  current_user_id uuid := auth.uid();
begin
  if target_decision not in ('approved', 'changes_requested') then
    raise exception 'ORGANIZER_TASK_DECISION_INVALID';
  end if;
  if target_decision = 'changes_requested' and length(trim(coalesce(target_comment, ''))) = 0 then
    raise exception 'ORGANIZER_TASK_COMMENT_REQUIRED';
  end if;

  select t.* into task_record
  from public.tasks t
  where t.id = target_task_id
  for update;
  if task_record.id is null then raise exception 'ORGANIZER_TASK_NOT_FOUND'; end if;
  if current_user_id is null or not public.is_organization_member(task_record.organization_id) then
    raise exception 'ORGANIZER_TASK_ACCESS_DENIED';
  end if;
  if task_record.completion_type <> 'organizer_approval' then
    raise exception 'ORGANIZER_TASK_NOT_APPROVAL';
  end if;
  if task_record.status = 'Erledigt' then
    raise exception 'ORGANIZER_TASK_ALREADY_COMPLETED';
  end if;

  if task_record.benefit_id is not null and task_record.workflow_order is not null then
    select count(*), count(*) filter (where t.status = 'Erledigt')
      into previous_count, completed_previous_count
    from public.tasks t
    where t.event_id = task_record.event_id
      and t.sponsor_id = task_record.sponsor_id
      and t.benefit_id = task_record.benefit_id
      and t.workflow_instance = task_record.workflow_instance
      and t.workflow_order < task_record.workflow_order;
    if previous_count = 0 or completed_previous_count <> previous_count then
      raise exception 'ORGANIZER_TASK_PREVIOUS_STEPS_INCOMPLETE';
    end if;

    select t.id into previous_task_id
    from public.tasks t
    where t.event_id = task_record.event_id
      and t.sponsor_id = task_record.sponsor_id
      and t.benefit_id = task_record.benefit_id
      and t.workflow_instance = task_record.workflow_instance
      and t.workflow_order < task_record.workflow_order
    order by t.workflow_order desc
    limit 1;

    select exists (
      select 1 from public.tasks t
      where t.event_id = task_record.event_id
        and t.sponsor_id = task_record.sponsor_id
        and t.benefit_id = task_record.benefit_id
        and t.workflow_instance = task_record.workflow_instance
        and t.workflow_order > task_record.workflow_order
        and (t.completion_type = 'sponsor_approval' or t.requires_sponsor_approval)
    ) into sponsor_approval_follows;
  end if;

  if target_decision = 'approved' then
    if sponsor_approval_follows and not share_previous_file then
      raise exception 'ORGANIZER_TASK_SPONSOR_FILE_REQUIRED';
    end if;
    if share_previous_file and (previous_task_id is null or not exists (
      select 1 from public.evidence_files ef where ef.task_id = previous_task_id
    )) then
      raise exception 'ORGANIZER_TASK_FILE_NOT_FOUND';
    end if;

    if previous_task_id is not null then
      update public.evidence_files set sponsor_visible = false where task_id = previous_task_id;
      if share_previous_file then
        update public.evidence_files set sponsor_visible = true where task_id = previous_task_id;
      end if;
    end if;
    update public.tasks set status = 'Erledigt' where id = target_task_id;
    if task_record.benefit_id is not null and not exists (
      select 1 from public.tasks t
      where t.event_id = task_record.event_id
        and t.sponsor_id = task_record.sponsor_id
        and t.benefit_id = task_record.benefit_id
        and t.status <> 'Erledigt'
    ) then
      update public.benefits set status = 'Erfüllt'
      where id = task_record.benefit_id and event_id = task_record.event_id and sponsor_id = task_record.sponsor_id;
    end if;
  else
    if previous_task_id is not null then
      with deleted as (
        delete from public.evidence_files ef
        where ef.task_id = previous_task_id
        returning ef.storage_path
      )
      select coalesce(array_agg(deleted.storage_path), array[]::text[])
        into deleted_paths
      from deleted;

      update public.tasks set status = 'Offen', publish_ready = false where id = previous_task_id;
    end if;

    if task_record.benefit_id is not null and task_record.workflow_order is not null then
      update public.tasks
      set status = 'Offen', publish_ready = false,
          sponsor_approval_status = case when completion_type = 'sponsor_approval' or requires_sponsor_approval then 'pending' else sponsor_approval_status end,
          sponsor_approved_at = case when completion_type = 'sponsor_approval' or requires_sponsor_approval then null else sponsor_approved_at end
      where event_id = task_record.event_id
        and sponsor_id = task_record.sponsor_id
        and benefit_id = task_record.benefit_id
        and workflow_instance = task_record.workflow_instance
        and workflow_order >= task_record.workflow_order;
    else
      update public.tasks set status = 'Offen', publish_ready = false where id = target_task_id;
    end if;

    if task_record.benefit_id is not null then
      update public.benefits set status = 'In Arbeit'
      where id = task_record.benefit_id and event_id = task_record.event_id and sponsor_id = task_record.sponsor_id;
    end if;

    insert into public.task_workflow_feedback (task_id, decision, comment, created_by)
    values (coalesce(previous_task_id, target_task_id), 'organizer_changes_requested', trim(target_comment), current_user_id);
  end if;

  return deleted_paths;
end;
$$;

revoke all on function public.respond_to_organizer_task(uuid, text, text, boolean) from public, anon;
grant execute on function public.respond_to_organizer_task(uuid, text, text, boolean) to authenticated;
