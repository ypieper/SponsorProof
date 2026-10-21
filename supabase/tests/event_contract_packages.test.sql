begin;

create extension if not exists pgtap with schema extensions;
select plan(23);

insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('81000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'package-test@example.test', '', '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;
insert into public.organizations (id, name, created_by)
values ('82000000-0000-4000-8000-000000000001', 'Package Test', '81000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
insert into public.organization_members (organization_id, user_id, email, role)
values ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'package-test@example.test', 'owner')
on conflict (organization_id, user_id) do nothing;
insert into public.events (id, owner_id, organization_id, title, start_date, end_date)
values
  ('83000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'Five Contract Package', current_date, current_date),
  ('83000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'Signature Add-on Package', current_date, current_date)
on conflict (id) do nothing;
insert into public.event_entitlements (event_id, organization_id, plan_code, entitlement_status, activation_source)
values
  ('83000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'free', 'active', 'free'),
  ('83000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000001', 'free', 'active', 'free')
on conflict (event_id) do nothing;
insert into public.sponsors (id, organization_id, name, initials)
select ('84000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '82000000-0000-4000-8000-000000000001', 'Package Sponsor ' || n, 'P' || n
from generate_series(1, 11) n
on conflict (id) do nothing;

select is((select base_amount_cents from public.event_contract_packages where code = 'contracts_5'), 9900::bigint, 'Starter costs 99 euros');
select is((select base_amount_cents from public.event_contract_packages where code = 'contracts_7'), 17900::bigint, 'Plus costs 179 euros');
select is((select base_amount_cents from public.event_contract_packages where code = 'contracts_10'), 23900::bigint, 'Pro costs 239 euros');
select ok(not (select is_active from public.event_contract_packages where code = 'contracts_15'), 'The legacy package is no longer offered');
select is((select max_contracts * signature_addon_per_contract_cents from public.event_contract_packages where code = 'contracts_5'), 4000::bigint, 'Starter signature add-on covers ten sponsors');
select is((select max_contracts * signature_addon_per_contract_cents from public.event_contract_packages where code = 'contracts_7'), 8000::bigint, 'Plus signature add-on covers twenty sponsors');
select is((select max_contracts * signature_addon_per_contract_cents from public.event_contract_packages where code = 'contracts_10'), 12000::bigint, 'Pro signature add-on covers thirty sponsors');
select is((select count(*)::integer from public.event_contract_packages where is_active), 3, 'Three current packages are offered');
select ok(not has_table_privilege('authenticated', 'public.event_contract_package_bookings', 'INSERT'), 'Browser users cannot insert package bookings');
select ok(not has_function_privilege('authenticated', 'public.record_confirmed_event_package_payment(uuid,text,boolean,bigint,text,text)', 'EXECUTE'), 'Only trusted server code can confirm package payments');

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select ok(not public.event_feature_enabled('83000000-0000-4000-8000-000000000001', 'contracts'), 'Free event is blocked from contract features');
select ok(not public.event_signature_addon_enabled('83000000-0000-4000-8000-000000000001'), 'Signature feature is disabled without an add-on');
reset role;

select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select lives_ok($$select public.record_confirmed_event_package_payment('83000000-0000-4000-8000-000000000001', 'contracts_5', false, 9900, 'pi-package-five', 'evt-package-five')$$, 'Trusted confirmed payment records the package');
select lives_ok($$select public.record_confirmed_event_package_payment('83000000-0000-4000-8000-000000000002', 'contracts_7', true, 25900, 'pi-package-seven', 'evt-package-seven')$$, 'Trusted confirmed payment records package and signature add-on');
select lives_ok($$select public.record_confirmed_event_package_payment('83000000-0000-4000-8000-000000000001', 'contracts_5', false, 9900, 'pi-package-five', 'evt-package-five')$$, 'Duplicate webhook event is idempotent');
select is((select count(*)::integer from public.event_package_payment_events where provider_event_id = 'evt-package-five'), 1, 'Idempotent retry is recorded once');
select throws_ok($$select public.record_confirmed_event_package_payment('83000000-0000-4000-8000-000000000001', 'contracts_5', true, 12000, 'pi-wrong-amount', 'evt-wrong-amount')$$, 'P0001', 'Confirmed payment amount does not match the server package price', 'Server rejects amounts that differ from the configured total');
reset role;

select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select ok(public.event_feature_enabled('83000000-0000-4000-8000-000000000001', 'contracts'), 'Paid package enables core features');
select ok(not public.event_signature_addon_enabled('83000000-0000-4000-8000-000000000001'), 'Package without add-on cannot sign');
select ok(public.event_signature_addon_enabled('83000000-0000-4000-8000-000000000002'), 'Package with add-on enables signing');
select lives_ok($test$do $body$ begin for n in 1..10 loop perform public.add_sponsor_to_event('83000000-0000-4000-8000-000000000001', ('84000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 10000); end loop; end $body$;$test$, 'Starter accepts ten contracts');
select throws_ok($$select public.add_sponsor_to_event('83000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000011', 10000)$$, 'P0001', 'SPONSOR_LIMIT_REACHED', 'Eleventh contract is blocked server-side');
select is((select count(*)::integer from public.contracts where event_id = '83000000-0000-4000-8000-000000000001'), 10, 'Rejected eleventh contract leaves existing contracts intact');
reset role;

select * from finish();
rollback;
