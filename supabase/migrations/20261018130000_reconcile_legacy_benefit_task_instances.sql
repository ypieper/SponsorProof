-- Before workflow_instance was introduced, task rows for repeated benefit
-- units were all backfilled as instance 1. Restore their unit grouping when
-- every task template has the same number of legacy rows.
with task_blueprints as (
  select
    t.benefit_id,
    t.template_task_id,
    t.workflow_order,
    t.title,
    count(*) as unit_count
  from public.tasks t
  where t.source = 'Leistung'
    and t.benefit_id is not null
    and t.workflow_order is not null
  group by t.benefit_id, t.template_task_id, t.workflow_order, t.title
), eligible_benefits as (
  select blueprint.benefit_id
  from task_blueprints blueprint
  where not exists (
      select 1
      from public.tasks t
      where t.benefit_id = blueprint.benefit_id
        and t.source = 'Leistung'
        and t.workflow_order is null
    )
    and exists (
      select 1
      from public.tasks t
      where t.benefit_id = blueprint.benefit_id
        and t.source = 'Leistung'
      group by t.template_task_id, t.workflow_order, t.title, t.workflow_instance
      having count(*) > 1
    )
  group by blueprint.benefit_id
  having min(blueprint.unit_count) = max(blueprint.unit_count)
     and min(blueprint.unit_count) > 1
), ranked_tasks as (
  select
    t.id,
    row_number() over (
      partition by t.benefit_id, t.template_task_id, t.workflow_order, t.title
      order by t.workflow_instance, t.created_at, t.id
    )::integer as corrected_instance
  from public.tasks t
  join eligible_benefits eligible on eligible.benefit_id = t.benefit_id
  where t.source = 'Leistung'
    and t.workflow_order is not null
)
update public.tasks t
set workflow_instance = ranked.corrected_instance
from ranked_tasks ranked
where t.id = ranked.id
  and t.workflow_instance <> ranked.corrected_instance;

create or replace function public.normalize_legacy_benefit_task_instances(target_benefit_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  changed_rows integer := 0;
begin
  if not exists (
    select 1 from public.benefits b where b.id = target_benefit_id
  ) then
    return 0;
  end if;

  if exists (
    select 1
    from public.tasks t
    where t.benefit_id = target_benefit_id
      and t.source = 'Leistung'
      and t.workflow_order is null
  ) then
    return 0;
  end if;

  if not exists (
    select 1
    from public.tasks t
    where t.benefit_id = target_benefit_id
      and t.source = 'Leistung'
    group by t.template_task_id, t.workflow_order, t.title, t.workflow_instance
    having count(*) > 1
  ) then
    return 0;
  end if;

  if not exists (
    select 1
    from (
      select count(*) as unit_count
      from public.tasks t
      where t.benefit_id = target_benefit_id
        and t.source = 'Leistung'
        and t.workflow_order is not null
      group by t.template_task_id, t.workflow_order, t.title
    ) blueprint_counts
    having min(blueprint_counts.unit_count) = max(blueprint_counts.unit_count)
       and min(blueprint_counts.unit_count) > 1
  ) then
    return 0;
  end if;

  with ranked_tasks as (
    select
      t.id,
      row_number() over (
        partition by t.benefit_id, t.template_task_id, t.workflow_order, t.title
        order by t.workflow_instance, t.created_at, t.id
      )::integer as corrected_instance
    from public.tasks t
    where t.benefit_id = target_benefit_id
      and t.source = 'Leistung'
      and t.workflow_order is not null
  )
  update public.tasks t
  set workflow_instance = ranked.corrected_instance
  from ranked_tasks ranked
  where t.id = ranked.id
    and t.workflow_instance <> ranked.corrected_instance;

  get diagnostics changed_rows = row_count;
  return changed_rows;
end;
$$;

revoke all on function public.normalize_legacy_benefit_task_instances(uuid) from public, anon;
grant execute on function public.normalize_legacy_benefit_task_instances(uuid) to authenticated;
