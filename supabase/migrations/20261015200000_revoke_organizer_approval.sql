create table if not exists public.task_workflow_feedback (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  decision text not null check (decision = 'organizer_approval_revoked'),
  comment text not null check (length(trim(comment)) > 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists task_workflow_feedback_task_created_idx
  on public.task_workflow_feedback (task_id, created_at desc);

alter table public.task_workflow_feedback enable row level security;
revoke all on public.task_workflow_feedback from anon, authenticated;
grant select on public.task_workflow_feedback to authenticated;
grant all on public.task_workflow_feedback to service_role;

drop policy if exists "workspace members can view task workflow feedback" on public.task_workflow_feedback;
create policy "workspace members can view task workflow feedback" on public.task_workflow_feedback
  for select to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_workflow_feedback.task_id
        and public.is_organization_member(t.organization_id)
    )
  );

create or replace function public.revoke_organizer_task_approval(
  target_task_id uuid,
  target_comment text
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
  current_user_id uuid := auth.uid();
begin
  if length(trim(coalesce(target_comment, ''))) = 0 then
    raise exception 'ORGANIZER_APPROVAL_COMMENT_REQUIRED';
  end if;

  select t.* into task_record
  from public.tasks t
  where t.id = target_task_id
  for update;
  if task_record.id is null then raise exception 'ORGANIZER_TASK_NOT_FOUND'; end if;
  if current_user_id is null or not public.is_organization_member(task_record.organization_id) then
    raise exception 'ORGANIZER_TASK_ACCESS_DENIED';
  end if;
  if task_record.completion_type <> 'organizer_approval' or task_record.status <> 'Erledigt' then
    raise exception 'ORGANIZER_APPROVAL_NOT_COMPLETED';
  end if;

  if task_record.benefit_id is not null and task_record.workflow_order is not null then
    select t.id into previous_task_id
    from public.tasks t
    where t.event_id = task_record.event_id
      and t.sponsor_id = task_record.sponsor_id
      and t.benefit_id = task_record.benefit_id
      and t.workflow_instance = task_record.workflow_instance
      and t.workflow_order < task_record.workflow_order
    order by t.workflow_order desc
    limit 1;

    if previous_task_id is not null then
      with deleted as (
        delete from public.evidence_files ef
        where ef.task_id = previous_task_id
        returning ef.storage_path
      )
      select coalesce(array_agg(deleted.storage_path), array[]::text[])
      into deleted_paths
      from deleted;

      update public.tasks
      set status = 'Offen', publish_ready = false
      where id = previous_task_id;
    end if;

    update public.tasks
    set status = 'Offen', publish_ready = false,
        sponsor_approval_status = case when completion_type = 'sponsor_approval' or requires_sponsor_approval then 'pending' else sponsor_approval_status end,
        sponsor_approved_at = case when completion_type = 'sponsor_approval' or requires_sponsor_approval then null else sponsor_approved_at end
    where event_id = task_record.event_id
      and sponsor_id = task_record.sponsor_id
      and benefit_id = task_record.benefit_id
      and workflow_instance = task_record.workflow_instance
      and workflow_order >= task_record.workflow_order;

    update public.tasks
    set publish_ready = false
    where event_id = task_record.event_id
      and sponsor_id = task_record.sponsor_id
      and benefit_id = task_record.benefit_id
      and workflow_instance = task_record.workflow_instance;

    update public.benefits
    set status = 'In Arbeit'
    where id = task_record.benefit_id
      and event_id = task_record.event_id
      and sponsor_id = task_record.sponsor_id;
  else
    update public.tasks set status = 'Offen', publish_ready = false where id = target_task_id;
  end if;

  insert into public.task_workflow_feedback (task_id, decision, comment, created_by)
  values (target_task_id, 'organizer_approval_revoked', trim(target_comment), current_user_id);

  return deleted_paths;
end;
$$;

revoke all on function public.revoke_organizer_task_approval(uuid, text) from public, anon;
grant execute on function public.revoke_organizer_task_approval(uuid, text) to authenticated;
