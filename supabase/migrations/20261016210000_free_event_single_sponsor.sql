update public.event_plans
set max_sponsors = 1,
    updated_at = now()
where code = 'free';
