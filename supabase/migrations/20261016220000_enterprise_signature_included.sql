-- Active organization-wide Enterprise access includes digital signatures for
-- every event in the organization, without requiring a per-event add-on.
create or replace function public.event_signature_addon_enabled(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select
        ((select auth.role()) = 'service_role' or public.is_organization_member(e.organization_id))
        and (
          public.organization_enterprise_active(e.organization_id)
          or exists (
            select 1
            from public.event_contract_package_bookings b
            where b.event_id = target_event_id
              and b.payment_status = 'paid'
              and b.signature_addon_selected
          )
        )
      from public.events e
      where e.id = target_event_id
    ),
    false
  );
$$;

revoke all on function public.event_signature_addon_enabled(uuid) from public, anon;
grant execute on function public.event_signature_addon_enabled(uuid) to authenticated, service_role;
