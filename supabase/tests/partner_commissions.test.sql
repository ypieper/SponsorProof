begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
 ('91000000-0000-4000-8000-000000000001','authenticated','authenticated','sales-partner@example.test','','{}','{"account_type":"organizer"}',now(),now())
on conflict (id) do nothing;

insert into public.sales_partners(id,user_id,referral_code)
values ('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','TESTPARTNER01')
on conflict (id) do nothing;
insert into public.partner_referral_clicks(id,partner_id)
values ('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

-- This signup row triggers server-side claiming and creates the referral.
insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('91000000-0000-4000-8000-000000000003','authenticated','authenticated','referred-organizer@example.test','','{}','{"account_type":"organizer","partner_referral_click_id":"92000000-0000-4000-8000-000000000001"}',now(),now())
on conflict (id) do nothing;

select ok(not has_table_privilege('authenticated','public.sales_partners','INSERT'), 'A normal account cannot create partner records');
select is((select count(*)::integer from public.partner_referrals where referred_user_id='91000000-0000-4000-8000-000000000003'),1,'A valid referral click is claimed once during signup');

insert into auth.users (id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('91000000-0000-4000-8000-000000000004','authenticated','authenticated','inactive-partner@example.test','','{}','{"account_type":"organizer"}',now(),now())
on conflict (id) do nothing;
insert into public.sales_partners(id,user_id,referral_code,is_active)
values ('93000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000004','TESTPARTNER02',false)
on conflict (id) do nothing;
insert into public.partner_referral_clicks(id,partner_id,clicked_at) values
 ('92000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000002',now()),
 ('92000000-0000-4000-8000-000000000003','93000000-0000-4000-8000-000000000001',now()-interval '60 days'),
 ('92000000-0000-4000-8000-000000000004','93000000-0000-4000-8000-000000000001',now())
on conflict (id) do nothing;
insert into auth.users (id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('91000000-0000-4000-8000-000000000005','authenticated','authenticated','inactive-attribution@example.test','','{}','{"account_type":"organizer","partner_referral_click_id":"92000000-0000-4000-8000-000000000002"}',now(),now()),
 ('91000000-0000-4000-8000-000000000006','authenticated','authenticated','expired-attribution@example.test','','{}','{"account_type":"organizer","partner_referral_click_id":"92000000-0000-4000-8000-000000000003"}',now(),now()),
 ('91000000-0000-4000-8000-000000000007','authenticated','authenticated','join-attribution@example.test','','{}','{"account_type":"organizer","organization_join_code":"JOIN-CODE","partner_referral_click_id":"92000000-0000-4000-8000-000000000004"}',now(),now()),
 ('91000000-0000-4000-8000-000000000008','authenticated','authenticated','invalid-attribution@example.test','','{}','{"account_type":"organizer","partner_referral_click_id":"92000000-0000-4000-8000-000000000099"}',now(),now())
on conflict (id) do nothing;
select is((select count(*)::integer from public.partner_referrals where referred_user_id in ('91000000-0000-4000-8000-000000000005','91000000-0000-4000-8000-000000000006','91000000-0000-4000-8000-000000000007','91000000-0000-4000-8000-000000000008')),0,'Inactive, expired, invalid, and team-join referrals are rejected');

insert into public.organizations(id,name,created_by)
values ('94000000-0000-4000-8000-000000000001','Referred Organization','91000000-0000-4000-8000-000000000003')
on conflict (id) do nothing;
select is((select organization_id from public.partner_referrals where referred_user_id='91000000-0000-4000-8000-000000000003'),'94000000-0000-4000-8000-000000000001'::uuid,'A new organization is attributed to its signup referral');

insert into auth.users (id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('91000000-0000-4000-8000-000000000009','authenticated','authenticated','existing-organization@example.test','','{}','{"account_type":"organizer"}',now(),now())
on conflict (id) do nothing;
insert into public.organizations(id,name,created_by) values ('94000000-0000-4000-8000-000000000002','Pre-existing Organization','91000000-0000-4000-8000-000000000009') on conflict (id) do nothing;
insert into public.partner_referral_clicks(id,partner_id) values ('92000000-0000-4000-8000-000000000005','93000000-0000-4000-8000-000000000001') on conflict (id) do nothing;
update auth.users set raw_user_meta_data=raw_user_meta_data || '{"partner_referral_click_id":"92000000-0000-4000-8000-000000000005"}'::jsonb where id='91000000-0000-4000-8000-000000000009';
select is((select count(*)::integer from public.partner_referrals where referred_user_id='91000000-0000-4000-8000-000000000009'),0,'A later referral parameter cannot reattribute an existing account or organization');

select ok(not has_table_privilege('authenticated','public.partner_payment_receipts','INSERT'), 'Browser users cannot assert payment receipts');
select ok(not has_function_privilege('authenticated','public.record_partner_payment_receipt(uuid,uuid,text,text,text,text,text,bigint,bigint,timestamptz,uuid)','EXECUTE'), 'Payment receipt insertion is restricted to trusted server code');

set local role service_role;
select lives_ok($$select public.record_partner_payment_receipt('94000000-0000-4000-8000-000000000001',null,'contracts_5','package_payment','test-source-001','test-provider','test-payment-001',11900,10000,now(),null)$$,'A trusted confirmation records an explicit payment receipt');
select is((select count(*)::integer from public.partner_commissions),0,'No provision is created before an admin configures a rule');
insert into public.partner_commission_rules(name,product_code,commission_model,commission_value,valid_from,created_by)
values ('Test 10 percent','all_events','percentage',10,now()-interval '1 day','91000000-0000-4000-8000-000000000001');
select lives_ok($$select public.record_partner_payment_receipt('94000000-0000-4000-8000-000000000001',null,'contracts_5','package_payment','test-source-002','test-provider','test-payment-002',11900,10000,now(),null)$$,'A receipt uses the centrally configured tariff-independent rule');
select is((select commission_amount_cents from public.partner_commissions where payment_receipt_id=(select id from public.partner_payment_receipts where source_reference='test-source-002')),1000::bigint,'Commission is calculated from the confirmed net amount');
select lives_ok($$select public.record_partner_payment_receipt('94000000-0000-4000-8000-000000000001',null,'contracts_7','package_payment','test-source-003','test-provider','test-payment-003',15400,13000,now(),null)$$,'A later order under a different event tariff also uses the same rule');
select is((select commission_amount_cents from public.partner_commissions where payment_receipt_id=(select id from public.partner_payment_receipts where source_reference='test-source-003')),1300::bigint,'The partner earns commission on each later event order');
select lives_ok($$select public.record_partner_payment_receipt('94000000-0000-4000-8000-000000000001',null,'contracts_5','package_payment','test-source-002','test-provider','test-payment-002',11900,10000,now(),null)$$,'A retried payment event is idempotent');
reset role;
select is((select count(*)::integer from public.partner_commissions),2,'Idempotent receipt retries cannot duplicate commissions');

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select is((select count(*)::integer from public.partner_referrals),1,'A partner can read only their own referral');
select is((select count(*)::integer from public.partner_commissions),2,'A partner can read only their own commissions');
select ok(not has_table_privilege('authenticated','public.partner_commission_rules','SELECT'),'A partner cannot read commission rules');
select ok(not has_table_privilege('authenticated','public.partner_payment_receipts','SELECT'),'A partner cannot read payment receipts');
reset role;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select is((select count(*)::integer from public.partner_commissions),0,'An organizer cannot read partner commissions');
reset role;

select * from finish();
rollback;
