update public.event_contract_packages
set name = case max_contracts
  when 5 then 'Starter'
  when 7 then 'Plus'
  when 10 then 'Pro'
  when 15 then 'Event'
  else name
end,
updated_at = now()
where max_contracts in (5, 7, 10, 15);
