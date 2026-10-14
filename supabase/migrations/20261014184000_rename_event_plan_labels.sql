update public.event_plans
set name = case code
  when 'event' then 'Basic'
  when 'event_pro' then 'Pro'
  else name
end,
updated_at = now()
where code in ('event', 'event_pro');
