-- Preserve sponsor-returned files for version history and capture the exact
-- file version that the sponsor asked to change. Publish only the current file
-- when a workflow reaches a sponsor approval, keeping internal versions hidden.
alter table public.sponsor_task_feedback
  add column if not exists evidence_file_id uuid references public.evidence_files (id) on delete set null;

-- Keep a manual approval's evidence after the sponsor requests changes. A
-- replacement upload is stored as a new evidence_files row, preserving versions.
create or replace function public.respond_to_sponsor_task(
  target_task_id uuid,
  target_user_id uuid,
  target_decision text,
  target_comment text default null
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_record public.tasks%rowtype;
  previous_count integer;
  completed_count integer;
  visible_file_count integer;
  active_evidence_id uuid;
  deleted_paths text[] := array[]::text[];
begin
  if target_decision not in ('approved', 'changes_requested') then
    raise exception 'SPONSOR_TASK_DECISION_INVALID';
  end if;
  if target_decision = 'changes_requested' and length(trim(coalesce(target_comment, ''))) = 0 then
    raise exception 'SPONSOR_TASK_COMMENT_REQUIRED';
  end if;

  select t.* into task_record
  from public.tasks t
  where t.id = target_task_id
  for update;
  if task_record.id is null then raise exception 'SPONSOR_TASK_NOT_FOUND'; end if;
  if not (task_record.completion_type = 'sponsor_approval' or task_record.requires_sponsor_approval) then
    raise exception 'SPONSOR_TASK_NOT_APPROVAL';
  end if;
  if task_record.sponsor_approval_status not in ('pending', 'changes_requested') then
    raise exception 'SPONSOR_TASK_NOT_ACTIVE';
  end if;
  if not exists (
    select 1 from public.sponsor_account_members sam
    join public.sponsor_event_accounts sea on sea.account_id = sam.account_id
    where sam.user_id = target_user_id
      and sea.event_id = task_record.event_id
      and sea.sponsor_id = task_record.sponsor_id
  ) then
    raise exception 'SPONSOR_TASK_ACCESS_DENIED';
  end if;

  if task_record.benefit_id is not null and task_record.workflow_order is not null then
    select count(*), count(*) filter (where t.status = 'Erledigt')
      into previous_count, completed_count
    from public.tasks t
    where t.event_id = task_record.event_id
      and t.sponsor_id = task_record.sponsor_id
      and t.benefit_id = task_record.benefit_id
      and t.workflow_instance = task_record.workflow_instance
      and t.workflow_order < task_record.workflow_order;
    if previous_count = 0 or completed_count <> previous_count then
      raise exception 'SPONSOR_TASK_PREVIOUS_STEPS_INCOMPLETE';
    end if;

    select count(*) into visible_file_count
    from public.evidence_files ef
    join public.tasks t on t.id = ef.task_id
    where t.event_id = task_record.event_id
      and t.sponsor_id = task_record.sponsor_id
      and t.benefit_id = task_record.benefit_id
      and t.workflow_instance = task_record.workflow_instance
      and t.workflow_order < task_record.workflow_order
      and t.status = 'Erledigt'
      and ef.sponsor_visible
      and ef.created_at > coalesce((
        select max(feedback.created_at) from public.sponsor_task_feedback feedback
        where feedback.task_id = target_task_id and feedback.decision = 'changes_requested'
      ), '-infinity'::timestamptz);

    select ef.id into active_evidence_id
    from public.evidence_files ef
    join public.tasks t on t.id = ef.task_id
    where t.event_id = task_record.event_id
      and t.sponsor_id = task_record.sponsor_id
      and t.benefit_id = task_record.benefit_id
      and t.workflow_instance = task_record.workflow_instance
      and t.workflow_order < task_record.workflow_order
      and t.status = 'Erledigt'
      and ef.sponsor_visible
      and ef.created_at > coalesce((
        select max(feedback.created_at) from public.sponsor_task_feedback feedback
        where feedback.task_id = target_task_id and feedback.decision = 'changes_requested'
      ), '-infinity'::timestamptz)
    order by ef.created_at desc
    limit 1;
  else
    select count(*) into visible_file_count
    from public.evidence_files ef
    where ef.task_id = target_task_id
      and ef.sponsor_visible
      and ef.created_at > coalesce((
        select max(feedback.created_at) from public.sponsor_task_feedback feedback
        where feedback.task_id = target_task_id and feedback.decision = 'changes_requested'
      ), '-infinity'::timestamptz);

    select ef.id into active_evidence_id
    from public.evidence_files ef
    where ef.task_id = target_task_id
      and ef.sponsor_visible
      and ef.created_at > coalesce((
        select max(feedback.created_at) from public.sponsor_task_feedback feedback
        where feedback.task_id = target_task_id and feedback.decision = 'changes_requested'
      ), '-infinity'::timestamptz)
    order by ef.created_at desc
    limit 1;
  end if;
  if visible_file_count = 0 or active_evidence_id is null then raise exception 'SPONSOR_TASK_FILE_NOT_SHARED'; end if;

  if target_decision = 'approved' then
    update public.tasks
    set status = 'Erledigt', sponsor_approval_status = 'approved', sponsor_approved_at = now()
    where id = target_task_id;

    if task_record.benefit_id is not null and task_record.workflow_order is not null then
      update public.tasks first_task
      set publish_ready = not exists (
        select 1 from public.tasks approval
        where approval.event_id = task_record.event_id
          and approval.sponsor_id = task_record.sponsor_id
          and approval.benefit_id = task_record.benefit_id
          and approval.workflow_instance = task_record.workflow_instance
          and approval.workflow_order is not null
          and (approval.completion_type = 'sponsor_approval' or approval.requires_sponsor_approval)
          and approval.sponsor_approval_status <> 'approved'
      )
      where first_task.id = (
        select t.id from public.tasks t
        where t.event_id = task_record.event_id
          and t.sponsor_id = task_record.sponsor_id
          and t.benefit_id = task_record.benefit_id
          and t.workflow_instance = task_record.workflow_instance
          and t.workflow_order is not null
        order by t.workflow_order asc limit 1
      );

      if not exists (
        select 1 from public.tasks t
        where t.event_id = task_record.event_id
          and t.sponsor_id = task_record.sponsor_id
          and t.benefit_id = task_record.benefit_id
          and t.status <> 'Erledigt'
      ) then
        update public.benefits set status = 'Erfüllt'
        where id = task_record.benefit_id and event_id = task_record.event_id and sponsor_id = task_record.sponsor_id;
      end if;
    end if;
  else
    insert into public.sponsor_task_feedback (task_id, decision, comment, created_by, evidence_file_id)
    values (target_task_id, 'changes_requested', trim(target_comment), target_user_id, active_evidence_id);

    if task_record.benefit_id is not null and task_record.workflow_order is not null then
      update public.tasks
      set status = 'Offen', publish_ready = false,
          sponsor_approval_status = case when completion_type = 'sponsor_approval' or requires_sponsor_approval then 'pending' else sponsor_approval_status end,
          sponsor_approved_at = case when completion_type = 'sponsor_approval' or requires_sponsor_approval then null else sponsor_approved_at end
      where event_id = task_record.event_id
        and sponsor_id = task_record.sponsor_id
        and benefit_id = task_record.benefit_id
        and workflow_instance = task_record.workflow_instance
        and workflow_order < task_record.workflow_order;
    end if;

    update public.tasks
    set status = 'Offen', sponsor_approval_status = 'changes_requested', sponsor_approved_at = null, publish_ready = false
    where id = target_task_id;

    if task_record.benefit_id is not null then
      update public.benefits set status = 'In Arbeit'
      where id = task_record.benefit_id and event_id = task_record.event_id and sponsor_id = task_record.sponsor_id;
    end if;
  end if;

  return deleted_paths;
end;
$$;

revoke all on function public.respond_to_sponsor_task(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.respond_to_sponsor_task(uuid, uuid, text, text) to service_role;

-- Allow an organizer approval as the first step in a benefit workflow. Any
-- preceding steps still need to be complete; sponsor approval still requires proof.
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
    if completed_previous_count <> previous_count then
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
      if share_previous_file then
        update public.evidence_files set sponsor_visible = true
        where id = (
          select ef.id from public.evidence_files ef
          where ef.task_id = previous_task_id
          order by ef.created_at desc
          limit 1
        );
      elsif not sponsor_approval_follows then
        update public.evidence_files set sponsor_visible = false where task_id = previous_task_id;
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
