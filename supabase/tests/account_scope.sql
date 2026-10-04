-- ADR 0024: the Account is the only visible level — team and activity only of the active account. Rolled-back transaction.
--
--   python3 supabase/tests/run.py account_scope

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid) on commit drop;
grant all on _t, _ctx to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', json_build_object('x-dk-kitchen-id', p_kitchen)::text, true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.blocked(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return 'blocked'; end;
$$;
-- Is this person in dk_account_users() (as the current caller)?
create or replace function pg_temp.listed(p_user uuid) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(dk_account_users()) u where (u ->> 'userId')::uuid = p_user)
$$;

-- Organization with two accounts: A and B.
insert into _ctx values ('org', (select id from dk_organizations where slug = 'dark-kitchen'));
insert into _ctx values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx values ('B', (select id from dk_kitchens where slug = 'hamburgesas-del-norte'));
insert into _ctx values ('ivan', (select id from auth.users where email = 'ivanclabe@gmail.com'));

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000024a1', 'admin.ambas@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000024a2', 'solo.b@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000024a3', 'solo.a@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000024a4', 'cocina.a@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-0000000024a1', '00000000-0000-0000-0000-0000000024a1', 'Admin De Ambas', true),
  ('10000000-0000-0000-0000-0000000024a2', '00000000-0000-0000-0000-0000000024a2', 'Solo En B', true),
  ('10000000-0000-0000-0000-0000000024a3', '00000000-0000-0000-0000-0000000024a3', 'Solo En A', true),
  ('10000000-0000-0000-0000-0000000024a4', '00000000-0000-0000-0000-0000000024a4', 'Cocina De A', true);
insert into dk_organization_members (organization_id, user_id, is_super_admin, status)
  select pg_temp.k('org'), id, false, 'active' from dk_users where id::text like '10000000-0000-0000-0000-0000000024a%'
on conflict do nothing;
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
select pg_temp.k(m.kitchen), m.user_id, (select id from dk_roles where is_system and key = m.role_key)
from (values ('A', '10000000-0000-0000-0000-0000000024a1'::uuid, 'ADMIN'), ('B', '10000000-0000-0000-0000-0000000024a1'::uuid, 'ADMIN'),
             ('B', '10000000-0000-0000-0000-0000000024a2'::uuid, 'CASHIER'), ('A', '10000000-0000-0000-0000-0000000024a3'::uuid, 'CASHIER'),
             ('A', '10000000-0000-0000-0000-0000000024a4'::uuid, 'KITCHEN')) m(kitchen, user_id, role_key);
insert into dk_member_roles (kitchen_id, user_id, role_id)
  select kitchen_id, user_id, default_role_id from dk_kitchen_members where user_id::text like '10000000-0000-0000-0000-0000000024a%'
on conflict do nothing;

-- One event in each account.
select dk_log_event('settings.test_account_a', 'Evento solo de la cuenta A', pg_temp.k('org'), pg_temp.k('A'), 'success', 'app');
select dk_log_event('settings.test_account_b', 'Evento solo de la cuenta B', pg_temp.k('org'), pg_temp.k('B'), 'success', 'app');

-- 1. An administrator of A and B, working in A, sees only A
select pg_temp.act_as('00000000-0000-0000-0000-0000000024a1', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Team', 'In A: sees the member of A', 'true', pg_temp.listed('10000000-0000-0000-0000-0000000024a3')::text),
  ('Team', 'In A: does NOT see the member that is only in B', 'false', pg_temp.listed('10000000-0000-0000-0000-0000000024a2')::text),
  ('Team', 'In A: the admin''s own accounts list only A', 'true',
    (select bool_and((a ->> 'kitchenId')::uuid = pg_temp.k('A')) from jsonb_array_elements(dk_account_users()) u, jsonb_array_elements(u -> 'accounts') a)::text),
  ('Activity', 'In A: the event of A', 'true',
    exists (select 1 from jsonb_array_elements(dk_account_events() -> 'events') e where e ->> 'summary' = 'Evento solo de la cuenta A')::text),
  ('Activity', 'In A: never the event of B (no filter can reach it)', 'false',
    exists (select 1 from jsonb_array_elements(dk_account_events(p_search => 'cuenta B') -> 'events') e where e ->> 'summary' = 'Evento solo de la cuenta B')::text);
reset role;

-- 2. The same person in B sees only B
select pg_temp.act_as('00000000-0000-0000-0000-0000000024a1', pg_temp.k('B'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Team', 'In B: sees the member of B', 'true', pg_temp.listed('10000000-0000-0000-0000-0000000024a2')::text),
  ('Team', 'In B: does NOT see the member that is only in A', 'false', pg_temp.listed('10000000-0000-0000-0000-0000000024a3')::text),
  ('Activity', 'In B: never the event of A', 'false',
    exists (select 1 from jsonb_array_elements(dk_account_events() -> 'events') e where e ->> 'summary' = 'Evento solo de la cuenta A')::text);
reset role;

-- 3. The platform super admin, working in A, does not see B either
select pg_temp.act_as(pg_temp.k('ivan'), pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Super admin', 'In A: not the member that is only in B', 'false', pg_temp.listed('10000000-0000-0000-0000-0000000024a2')::text),
  ('Super admin', 'In A: not the event of B', 'false',
    exists (select 1 from jsonb_array_elements(dk_account_events() -> 'events') e where e ->> 'summary' = 'Evento solo de la cuenta B')::text);
reset role;

-- 3b. Settings inside the account: AI matrix, AI usage and alerts of A only
select pg_temp.act_as(pg_temp.k('ivan'), pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Settings', 'AI matrix in A: only account A', 'true',
    (select jsonb_array_length(m -> 'accounts') = 1 and (m -> 'accounts' -> 0 ->> 'id')::uuid = pg_temp.k('A') from dk_account_feature_matrix() m)::text),
  ('Settings', 'AI matrix in A: says how many accounts share the general values', 'true', ((dk_account_feature_matrix() ->> 'accountCount')::int >= 2)::text),
  ('Settings', 'AI usage in A: no per-account breakdown', 'false', (dk_account_ai_usage() ? 'byAccount')::text),
  ('Settings', 'Alerts in A: none names account B', 'false',
    exists (select 1 from jsonb_array_elements(dk_account_alerts() -> 'alerts') a where a ->> 'message' ilike '%hamburgesas%')::text);
reset role;

-- 3c. Switching a feature on in A does not switch it on in B
reset role;
-- Starting point: the business does not offer "copilot" and B had chosen it (kept while not offered).
insert into dk_organization_features (organization_id, feature_key, available) values (pg_temp.k('org'), 'copilot', false)
on conflict (organization_id, feature_key) do update set available = false;
insert into dk_kitchen_features (kitchen_id, feature_key, enabled) values (pg_temp.k('B'), 'copilot', true)
on conflict (kitchen_id, feature_key) do update set enabled = true;
select pg_temp.act_as(pg_temp.k('ivan'), pg_temp.k('A'));
set local role authenticated;
select dk_account_set_feature('copilot', true);
reset role;
insert into _t (area, test, expected, got) values
  ('Features', 'On in A', 'true', (select enabled from dk_kitchen_features where kitchen_id = pg_temp.k('A') and feature_key = 'copilot')::text),
  ('Features', 'Still off in B', 'false', (select enabled from dk_kitchen_features where kitchen_id = pg_temp.k('B') and feature_key = 'copilot')::text);
select pg_temp.act_as('00000000-0000-0000-0000-0000000024a1', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Features', 'Account admin without features.manage cannot switch', 'blocked', pg_temp.blocked($q$select dk_account_set_feature('copilot', false)$q$));
reset role;

-- 3d. Removing someone from A leaves them in B; role usage is a number
select pg_temp.act_as('00000000-0000-0000-0000-0000000024a1', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Team', 'Role usage: ADMIN is used in 2 or more accounts', 'true',
    ((dk_account_role_usage() -> 'accountsByRole' ->> (select id::text from dk_roles where is_system and key = 'ADMIN'))::int >= 2)::text),
  ('Team', 'Cannot remove yourself', 'blocked', pg_temp.blocked($q$select dk_account_remove_member('10000000-0000-0000-0000-0000000024a1')$q$));
select dk_account_remove_member('10000000-0000-0000-0000-0000000024a3');
reset role;
insert into _t (area, test, expected, got) values
  ('Team', 'Removed from A', 'false', exists (select 1 from dk_kitchen_members where kitchen_id = pg_temp.k('A') and user_id = '10000000-0000-0000-0000-0000000024a3')::text),
  ('Team', 'Still a member of the business', 'true', exists (select 1 from dk_organization_members where organization_id = pg_temp.k('org') and user_id = '10000000-0000-0000-0000-0000000024a3')::text);
select pg_temp.act_as('00000000-0000-0000-0000-0000000024a1', pg_temp.k('A'));
set local role authenticated;
select dk_account_remove_member('10000000-0000-0000-0000-0000000024a2');
reset role;
insert into _t (area, test, expected, got) values
  ('Team', 'Working in A never removes someone from B', 'true', exists (select 1 from dk_kitchen_members where kitchen_id = pg_temp.k('B') and user_id = '10000000-0000-0000-0000-0000000024a2')::text);

-- 4. Permissions: kitchen (no team.view, no audit.view) gets nothing; outside an account, nothing
select pg_temp.act_as('00000000-0000-0000-0000-0000000024a4', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Access', 'Kitchen role: team', 'blocked', pg_temp.blocked('select dk_account_users()')),
  ('Access', 'Kitchen role: activity', 'blocked', pg_temp.blocked('select dk_account_events()')),
  ('Access', 'Kitchen role: AI matrix', 'blocked', pg_temp.blocked('select dk_account_feature_matrix()')),
  ('Access', 'Kitchen role: AI usage', 'blocked', pg_temp.blocked('select dk_account_ai_usage()'));
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000024a2', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Access', 'Header of A without membership in A', 'blocked', pg_temp.blocked('select dk_account_users()'));
reset role;
set local role anon;
insert into _t (area, test, expected, got) values
  ('Access', 'Anonymous', 'blocked', pg_temp.blocked('select dk_account_users()')),
  ('Access', 'Anonymous: alerts', 'blocked', pg_temp.blocked('select dk_account_alerts()'));
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
