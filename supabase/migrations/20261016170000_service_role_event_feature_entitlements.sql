-- Server-side API routes use the service role after authorizing the user and
-- sponsor assignment. Evaluate the event plan for those writes without relying
-- on auth.uid(), which is null for service-role requests.
create or replace function public.event_feature_enabled(target_event_id uuid, target_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when (select auth.role()) = 'service_role' then
        public.organization_enterprise_active(e.organization_id)
        or coalesce((p.features ->> target_feature)::boolean, false)
      when not public.is_organization_member(e.organization_id) then false
      when public.organization_enterprise_active(e.organization_id) then true
      else coalesce((p.features ->> target_feature)::boolean, false)
    end
    from public.events e
    join public.event_entitlements ee on ee.event_id = e.id and ee.entitlement_status = 'active'
    join public.event_plans p on p.code = ee.plan_code
    where e.id = target_event_id
    limit 1
  ), false);
$$;
