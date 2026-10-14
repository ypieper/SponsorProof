begin;

create extension if not exists pgtap with schema extensions;
select plan(42);

-- Isolated users and organizations; all rows roll back at the end of this test.
insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'entitlements-a@example.test', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'entitlements-b@example.test', '', '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.organizations (id, name, created_by)
values
  ('20000000-0000-4000-8000-000000000001', 'Entitlement Test A', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'Entitlement Test B', '10000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;
insert into public.organization_members (organization_id, user_id, email, role)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'entitlements-a@example.test', 'owner'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'entitlements-b@example.test', 'owner')
on conflict (organization_id, user_id) do nothing;

insert into public.events (id, owner_id, organization_id, title, start_date, end_date)
values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Free Event', current_date, current_date),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Second Event', current_date, current_date),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Pro Event', current_date, current_date),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Code Event', current_date, current_date),
  ('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Code Event B', current_date, current_date)
on conflict (id) do nothing;
insert into public.event_entitlements (event_id, organization_id, plan_code, entitlement_status, activation_source)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'free', 'active', 'free'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'free', 'active', 'free'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'event_pro', 'active', 'admin'),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'free', 'active', 'free'),
  ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', 'free', 'active', 'free')
on conflict (event_id) do nothing;
insert into public.activation_codes (code_hash, code_hint, plan_code, max_uses, event_id)
values (repeat('a', 64), 'SP-EVENT-••••-AAAA', 'event', 1, '30000000-0000-4000-8000-000000000004');
insert into public.activation_codes (code_hash, code_hint, plan_code, max_uses)
values (repeat('b', 64), 'SP-EVENTPRO-••••-BBBB', 'event_pro', 1);
insert into public.activation_codes (code_hash, code_hint, plan_code, expires_at)
values (repeat('c', 64), 'SP-EVENT-••••-CCCC', 'event', now() - interval '1 day');
insert into public.activation_codes (code_hash, code_hint, plan_code, is_active)
values (repeat('d', 64), 'SP-EVENT-••••-DDDD', 'event', false);
insert into public.activation_codes (code_hash, code_hint, plan_code, max_uses, use_count)
values (repeat('e', 64), 'SP-EVENT-••••-EEEE', 'event', 1, 1);
insert into public.activation_codes (code_hash, code_hint, plan_code, event_id)
values (repeat('f', 64), 'SP-EVENT-••••-FFFF', 'event', '30000000-0000-4000-8000-000000000002');
insert into public.activation_codes (code_hash, code_hint, plan_code, organization_id)
values (repeat('1', 64), 'SP-EVENT-••••-1111', 'event', '20000000-0000-4000-8000-000000000002');
insert into public.tasks (id, organization_id, event_id, title, source) values ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', null, 'Unassigned task fixture', 'Manuell');
insert into public.sponsors (id, organization_id, name, initials)
select ('40000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-4000-8000-000000000001', 'Sponsor ' || n, 'S' || n
from generate_series(1, 12) n
on conflict (id) do nothing;

select is((select max_sponsors from public.event_plans where code = 'free'), 2, 'Free tier allows two sponsors');
select is((select max_sponsors from public.event_plans where code = 'event'), 10, 'Event tier allows ten sponsors');
select is((select max_sponsors is null from public.event_plans where code = 'event_pro'), true, 'Event Pro has no sponsor limit');
select is((select (features ->> 'contracts')::boolean from public.event_plans where code = 'free'), false, 'Free tier disables contract generation');
select is((select (features ->> 'evidence')::boolean from public.event_plans where code = 'event'), true, 'Event tier enables evidence');
select ok(not has_table_privilege('authenticated', 'public.activation_codes', 'INSERT'), 'Ordinary users cannot insert activation codes');
select ok(not has_table_privilege('authenticated', 'public.event_entitlements', 'UPDATE'), 'Ordinary users cannot edit event tariffs directly');
select ok(not has_table_privilege('authenticated', 'public.events', 'INSERT'), 'Ordinary users must use the event creation RPC');
select ok(not has_table_privilege('authenticated', 'public.event_sponsors', 'INSERT'), 'Ordinary users must use the sponsor assignment RPC');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select lives_ok($$select public.create_event_with_free_entitlement('First free slot', current_date, current_date, '', '')$$, 'First free event can be created');
select throws_ok($$select public.create_event_with_free_entitlement('Second free slot', current_date, current_date, '', '')$$, 'P0001', 'FREE_EVENT_LIMIT_REACHED', 'Second free event is blocked');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select lives_ok($$select public.add_sponsor_to_event('30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', null)$$, 'First free sponsor can be assigned');
select lives_ok($$select public.add_sponsor_to_event('30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', null)$$, 'Second free sponsor can be assigned');
select throws_ok($$select public.add_sponsor_to_event('30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', null)$$, 'P0001', 'SPONSOR_LIMIT_REACHED', 'Third free sponsor is blocked server-side');
select throws_ok($$insert into public.contracts (event_id, sponsor_id, title, value_cents) values ('30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Test', 100)$$, '42501', 'EVENT_FEATURE_REQUIRED:contracts', 'Free tier blocks direct contract writes');
reset role;
select public.set_event_entitlement('30000000-0000-4000-8000-000000000001', 'event', 'admin');
select is((select count(*)::integer from public.event_sponsors where event_id = '30000000-0000-4000-8000-000000000001'), 2, 'Upgrade preserves existing sponsor assignments');
set local role authenticated;
select lives_ok($$select public.add_sponsor_to_event('30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', null)$$, 'Event plan permits sponsor assignments above free limit');
select lives_ok($$select public.add_sponsor_to_event('30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000004', null)$$, 'Event plan permits fourth sponsor');
select lives_ok($$select public.add_sponsor_to_event('30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000005', null)$$, 'Event plan permits fifth sponsor');
select lives_ok($$select public.add_sponsor_to_event('30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000006', null)$$, 'Event plan permits sixth sponsor');
select lives_ok($$select public.add_sponsor_to_event('30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000007', null)$$, 'Event plan permits seventh sponsor');
select lives_ok($$select public.add_sponsor_to_event('30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000008', null)$$, 'Event plan permits eighth sponsor');
select lives_ok($$select public.add_sponsor_to_event('30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000009', null)$$, 'Event plan permits ninth sponsor');
select lives_ok($$select public.add_sponsor_to_event('30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000010', null)$$, 'Event plan permits tenth sponsor');
select is((select plan_code from public.event_entitlements where event_id = '30000000-0000-4000-8000-000000000001'), 'event', 'Upgrade changes the entitlement plan');

reset role;
select throws_ok($$select public.add_sponsor_to_event('30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000011', null)$$, 'P0001', 'SPONSOR_LIMIT_REACHED', 'Eleventh Event-tier sponsor is blocked');
select lives_ok($$do $body$ begin for n in 1..12 loop perform public.add_sponsor_to_event('30000000-0000-4000-8000-000000000003', ('40000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, null); end loop; end $body$$$, 'Event Pro accepts more than ten sponsors');
select is((select count(*)::integer from public.event_sponsors where event_id = '30000000-0000-4000-8000-000000000003'), 12, 'Event Pro retains all twelve sponsor assignments');
select is(public.redeem_event_activation_code('30000000-0000-4000-8000-000000000004', repeat('a', 64)), 'event', 'Valid Event code is redeemed');
select is((select activation_source from public.event_entitlements where event_id = '30000000-0000-4000-8000-000000000004'), 'code', 'Successful redemption records code activation source');
select is(public.redeem_event_activation_code('30000000-0000-4000-8000-000000000005', repeat('b', 64)), 'event_pro', 'Valid Event Pro code is redeemed');
select throws_ok($$select public.redeem_event_activation_code('30000000-0000-4000-8000-000000000002', repeat('c', 64))$$, 'P0001', 'ACTIVATION_CODE_EXPIRED', 'Expired code is rejected');
select throws_ok($$select public.redeem_event_activation_code('30000000-0000-4000-8000-000000000002', repeat('d', 64))$$, 'P0001', 'ACTIVATION_CODE_DISABLED', 'Disabled code is rejected');
select throws_ok($$select public.redeem_event_activation_code('30000000-0000-4000-8000-000000000002', repeat('e', 64))$$, 'P0001', 'ACTIVATION_CODE_EXHAUSTED', 'Code at its maximum use count is rejected');
select throws_ok($$select public.redeem_event_activation_code('30000000-0000-4000-8000-000000000001', repeat('f', 64))$$, 'P0001', 'ACTIVATION_CODE_EVENT_MISMATCH', 'Event-bound code is rejected for another event');
select throws_ok($$select public.redeem_event_activation_code('30000000-0000-4000-8000-000000000001', repeat('1', 64))$$, 'P0001', 'ACTIVATION_CODE_ORGANIZATION_MISMATCH', 'Organization-bound code is rejected for another organization');
select throws_ok($$insert into public.evidence_files (organization_id, event_id, task_id, storage_path, file_name, content_type) values ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', (select id from public.tasks where event_id is null limit 1), 'test/path', 'proof.jpg', 'image/jpeg')$$, '42501', 'EVIDENCE_REQUIRES_EVENT', 'Evidence cannot be attached to an unassigned task');
select throws_ok($$select public.redeem_event_activation_code('30000000-0000-4000-8000-000000000004', repeat('a', 64))$$, 'P0001', 'ACTIVATION_CODE_EXHAUSTED', 'Single-use code cannot be redeemed twice');

reset role;
insert into public.organization_entitlements (organization_id, is_active, activated_at, expires_at, annual_fee_cents, invoice_reference, activated_by)
values ('20000000-0000-4000-8000-000000000001', true, now(), now() + interval '1 year', 120000, 'TEST-ENTERPRISE-001', '10000000-0000-4000-8000-000000000001');
select ok(not has_table_privilege('authenticated', 'public.organization_entitlements', 'UPDATE'), 'Ordinary users cannot directly modify organization entitlements');
set local role authenticated;
select ok(public.event_feature_enabled('30000000-0000-4000-8000-000000000001', 'reports'), 'Enterprise enables event features for the whole organization');
select lives_ok($$select public.create_event_with_free_entitlement('Enterprise extra event', current_date, current_date, '', '')$$, 'Enterprise removes the organization event limit');
select lives_ok($$select public.add_sponsor_to_event('30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000011', null)$$, 'Enterprise removes the event sponsor limit');
reset role;
-- A true parallel max_uses=1 check is covered by the row lock in redeem_event_activation_code;
-- the local pgTAP transaction verifies the single-use outcome after a successful redemption.
select * from finish();
rollback;
