-- Existing contracted work must remain completable even if an event's
-- entitlement changes. This exception permits only workflow-state changes on
-- existing task, benefit, and evidence rows; creating or editing their content
-- still goes through the event feature check below.
create or replace function public.guard_event_feature_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event uuid;
  target_feature text;
  related_event uuid;
begin
  if tg_op = 'UPDATE' then
    if tg_table_name = 'tasks'
      and (to_jsonb(new) - array['status', 'sponsor_approval_status', 'sponsor_approved_at', 'publish_ready', 'updated_at'])
        = (to_jsonb(old) - array['status', 'sponsor_approval_status', 'sponsor_approved_at', 'publish_ready', 'updated_at']) then
      return new;
    elsif tg_table_name = 'benefits'
      and (to_jsonb(new) - array['status', 'updated_at'])
        = (to_jsonb(old) - array['status', 'updated_at']) then
      return new;
    elsif tg_table_name = 'evidence_files'
      and (to_jsonb(new) - array['sponsor_visible'])
        = (to_jsonb(old) - array['sponsor_visible']) then
      return new;
    end if;
  end if;

  if tg_table_name = 'contracts' or tg_table_name = 'benefits' or tg_table_name = 'evidence_files' then
    target_event := new.event_id;
  elsif tg_table_name = 'tasks' then
    if new.source <> 'Leistung' then return new; end if;
    target_event := new.event_id;
  elsif tg_table_name = 'contract_documents' then
    select c.event_id into target_event from public.contracts c where c.id = new.contract_id;
  elsif tg_table_name = 'contract_reports' then
    select c.event_id into target_event from public.contracts c where c.id = new.contract_id;
  end if;

  if tg_table_name = 'contracts' or tg_table_name = 'contract_documents' then target_feature := 'contracts';
  elsif tg_table_name = 'benefits' then target_feature := 'benefits';
  elsif tg_table_name = 'tasks' then target_feature := 'tasks';
  elsif tg_table_name = 'evidence_files' then target_feature := 'evidence';
  elsif tg_table_name = 'contract_reports' then target_feature := 'reports';
  end if;

  if target_event is null then
    if tg_table_name = 'evidence_files' then
      raise exception using errcode = '42501', message = 'EVIDENCE_REQUIRES_EVENT';
    end if;
    raise exception using errcode = '42501', message = 'EVENT_FEATURE_REQUIRED';
  end if;
  if not public.event_feature_enabled(target_event, target_feature) then
    raise exception using errcode = '42501', message = 'EVENT_FEATURE_REQUIRED:' || target_feature;
  end if;

  if tg_table_name = 'evidence_files' then
    if new.task_id is null and new.benefit_id is null then
      raise exception using errcode = '42501', message = 'EVIDENCE_REQUIRES_EVENT';
    end if;
    if not exists (select 1 from public.events e where e.id = new.event_id and e.organization_id = new.organization_id) then
      raise exception using errcode = '42501', message = 'EVIDENCE_REQUIRES_EVENT';
    end if;
    if new.benefit_id is not null then
      select b.event_id into related_event from public.benefits b where b.id = new.benefit_id;
      if related_event is distinct from new.event_id then
        raise exception using errcode = '42501', message = 'EVIDENCE_REQUIRES_EVENT';
      end if;
    end if;
    if new.task_id is not null then
      select t.event_id into related_event from public.tasks t where t.id = new.task_id;
      if related_event is distinct from new.event_id then
        raise exception using errcode = '42501', message = 'EVIDENCE_REQUIRES_EVENT';
      end if;
    end if;
  end if;
  return new;
end;
$$;
