do $$
declare
  conflicting_templates text;
begin
  select string_agg(template_id::text, ', ' order by template_id::text)
  into conflicting_templates
  from (
    select template_id
    from public.event_contract_templates
    group by template_id
    having count(*) > 1
  ) conflicts;

  if conflicting_templates is not null then
    raise exception 'Cannot enforce one-to-one contract template assignments. These templates are assigned to multiple events: %.', conflicting_templates
      using hint = 'Assign each event its own template before applying this migration. No assignments were changed.';
  end if;
end;
$$;

alter table public.event_contract_templates
  add constraint event_contract_templates_template_id_key unique (template_id);
