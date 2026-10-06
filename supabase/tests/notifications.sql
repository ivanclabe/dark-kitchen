-- ADR 0037: the notification center — what each role gets, the AI notices
-- (last analysis only, high/medium, stable keys), the failed analyses without
-- Copilot, «visto» per person and the account alerts without Copilot.
-- Rolled-back transaction.
--
--   python3 supabase/tests/run.py notifications

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid) on commit drop;
create temp table _r (key text primary key, v jsonb) on commit drop;
grant all on _t, _ctx, _r to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', json_build_object('x-dk-kitchen-id', p_kitchen)::text, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.r(p_key text) returns jsonb language sql as $$ select v from _r where key = p_key $$;
-- The notices of a stored result whose key starts with a prefix.
create or replace function pg_temp.items(p_key text, p_prefix text) returns setof jsonb language sql as $$
  select n from jsonb_array_elements(pg_temp.r(p_key) -> 'items') n where n ->> 'key' like p_prefix || '%'
$$;
create or replace function pg_temp.blocked(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return 'blocked'; end;
$$;

insert into _ctx values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000037a01', 'admin.avisos@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000037a02', 'caja.avisos@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000037a03', 'cocina.avisos@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-000000037a01', '00000000-0000-0000-0000-000000037a01', 'Admin Avisos', true),
  ('10000000-0000-0000-0000-000000037a02', '00000000-0000-0000-0000-000000037a02', 'Caja Avisos', true),
  ('10000000-0000-0000-0000-000000037a03', '00000000-0000-0000-0000-000000037a03', 'Cocina Avisos', true);
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
select pg_temp.k('A'), m.user_id, (select id from dk_roles where is_system and key = m.role_key)
from (values ('10000000-0000-0000-0000-000000037a01'::uuid, 'ADMIN'), ('10000000-0000-0000-0000-000000037a02'::uuid, 'CASHIER'),
             ('10000000-0000-0000-0000-000000037a03'::uuid, 'KITCHEN')) m(user_id, role_key);

-- A known slate inside the rolled-back transaction: the AI runs of the account, the kitchen analysis on.
delete from dk_ai_insights where kitchen_id = pg_temp.k('A');
insert into dk_kitchen_features (kitchen_id, feature_key, enabled) values (pg_temp.k('A'), 'kitchen_insights', true), (pg_temp.k('A'), 'supply_reorder', true)
on conflict (kitchen_id, feature_key) do update set enabled = true;

-- An order to confirm.
insert into dk_customers (id, kitchen_id, full_name) values ('30000000-0000-0000-0000-000000037a01', pg_temp.k('A'), 'Cliente Avisos');
insert into dk_orders (id, kitchen_id, customer_id, status, subtotal) values
  ('40000000-0000-0000-0000-000000037a01', pg_temp.k('A'), '30000000-0000-0000-0000-000000037a01', 'NUEVO', 8000);

-- AI: an old analysis (> 24 h, ignored), the last one (alta, media, baja), a failed analysis and failed Copilot questions.
insert into dk_ai_insights (kitchen_id, feature_key, status, input, output, created_at) values
  (pg_temp.k('A'), 'kitchen_insights', 'ok', '{}', '{"items":[{"title":"Viejo","priority":"alta","explanation":"x","action":"y","ref_id":null}]}', now() - interval '30 hours'),
  (pg_temp.k('A'), 'kitchen_insights', 'ok', '{}', jsonb_build_object('items', jsonb_build_array(
     jsonb_build_object('title', 'Despachar pedido 1015', 'priority', 'alta', 'explanation', 'Listo hace 20 min', 'action', 'despachar', 'ref_id', '40000000-0000-0000-0000-000000037a01'),
     jsonb_build_object('title', 'Agrupar hamburguesas', 'priority', 'media', 'explanation', 'Mismo domiciliario', 'action', 'agrupar', 'ref_id', null),
     jsonb_build_object('title', 'Revisar plancha', 'priority', 'baja', 'explanation', 'Nada urgente', 'action', 'revisar', 'ref_id', null))), now() - interval '10 minutes'),
  (pg_temp.k('A'), 'supply_reorder', 'error', '{}', null, now() - interval '5 minutes');
insert into dk_ai_insights (kitchen_id, feature_key, status, input, created_by, error, created_at)
select pg_temp.k('A'), 'copilot', 'error', '{}', '10000000-0000-0000-0000-000000037a01', 'tool_choice', now() - interval '1 hour' from generate_series(1, 3);

-- 1. Admin.
select pg_temp.act_as('00000000-0000-0000-0000-000000037a01', pg_temp.k('A'));
set local role authenticated;
insert into _r values ('admin', dk_my_notifications());
insert into _r values ('alerts', dk_account_alerts());
reset role;
insert into _t (area, test, expected, got) values
  ('Operation', 'The order to confirm is a notice, with its link', 'true · /operations?view=list&status=NUEVO&range=all',
    (exists (select 1 from pg_temp.items('admin', 'to_confirm:') n))::text || ' · ' || (select n ->> 'to' from pg_temp.items('admin', 'to_confirm:') n)),
  ('AI', 'Only the last analysis, only alta and media (not baja, not the old one)', 'Agrupar hamburguesas · Despachar pedido 1015',
    (select string_agg(n ->> 'title', ' · ' order by n ->> 'title') from pg_temp.items('admin', 'ai:kitchen_insights:') n)),
  ('AI', 'An advice about an order opens that order', '/operations/40000000-0000-0000-0000-000000037a01',
    (select n ->> 'to' from pg_temp.items('admin', 'ai:kitchen_insights:') n where n ->> 'title' like 'Despachar%')),
  ('AI', 'The source of an AI notice is its feature', 'Sugerencias de Cocina en vivo',
    (select n ->> 'source' from pg_temp.items('admin', 'ai:kitchen_insights:') n limit 1)),
  ('AI', 'A failed analysis is a notice; Copilot errors are not', '1 · 0',
    (select count(*) from pg_temp.items('admin', 'ai_error:supply_reorder:') n)::text || ' · ' || (select count(*) from pg_temp.items('admin', 'ai_error:copilot') n)::text),
  ('AI', 'Account alerts: 1 analysis with error (the 3 Copilot errors do not count)', '1 análisis de IA con error en 24 h',
    (select a ->> 'message' from jsonb_array_elements(pg_temp.r('alerts') -> 'alerts') a where a ->> 'type' = 'ai_errors')),
  ('Read', 'Nothing seen yet: unread = all', 'true',
    ((pg_temp.r('admin') ->> 'unread')::int = jsonb_array_length(pg_temp.r('admin') -> 'items'))::text);

-- 2. The same advice in a newer analysis keeps its key (it does not come back as new).
select pg_temp.as_owner();
insert into dk_ai_insights (kitchen_id, feature_key, status, input, output, created_at)
select kitchen_id, feature_key, status, input, output, now() - interval '1 minute' from dk_ai_insights
where kitchen_id = pg_temp.k('A') and feature_key = 'kitchen_insights' and created_at = now() - interval '10 minutes';
select pg_temp.act_as('00000000-0000-0000-0000-000000037a01', pg_temp.k('A'));
set local role authenticated;
insert into _r values ('admin-2', dk_my_notifications());
reset role;
insert into _t (area, test, expected, got) values
  ('AI', 'Same advice, same keys', 'true',
    ((select array_agg(n ->> 'key' order by n ->> 'key') from pg_temp.items('admin', 'ai:') n) = (select array_agg(n ->> 'key' order by n ->> 'key') from pg_temp.items('admin-2', 'ai:') n))::text);

-- 3. «Visto»: the admin marks the AI notices; they stay, read, and go after the unread ones.
insert into _ctx values ('dummy', null);
select pg_temp.act_as('00000000-0000-0000-0000-000000037a01', pg_temp.k('A'));
set local role authenticated;
insert into _r values ('marked', to_jsonb(dk_mark_notifications_read((select array_agg(n ->> 'key') from pg_temp.items('admin', 'ai:') n))));
insert into _r values ('marked-again', to_jsonb(dk_mark_notifications_read((select array_agg(n ->> 'key') from pg_temp.items('admin', 'ai:') n))));
insert into _r values ('admin-3', dk_my_notifications());
insert into _r values ('too-many', to_jsonb(pg_temp.blocked(format('select dk_mark_notifications_read(%L::text[])', (select array_agg('k' || g)::text from generate_series(1, 201) g)))));
reset role;
insert into _t (area, test, expected, got) values
  ('Read', 'Marking returns how many were new; again, none', '2 · 0', (pg_temp.r('marked') #>> '{}') || ' · ' || (pg_temp.r('marked-again') #>> '{}')),
  ('Read', 'Unread goes down by the ones seen', 'true', ((pg_temp.r('admin-3') ->> 'unread')::int = (pg_temp.r('admin-2') ->> 'unread')::int - 2)::text),
  ('Read', 'The seen ones are marked read and listed after the unread', 'true · true',
    (select bool_and((n ->> 'read')::boolean) from pg_temp.items('admin-3', 'ai:kitchen_insights:') n)::text || ' · ' ||
    (select bool_and(not (n ->> 'read')::boolean) from (select n from jsonb_array_elements(pg_temp.r('admin-3') -> 'items') with ordinality x(n, o) order by o limit (pg_temp.r('admin-3') ->> 'unread')::int) y)::text),
  ('Read', 'More than 200 keys at once: rejected', 'blocked', pg_temp.r('too-many') #>> '{}');

-- 4. Caja: operation yes; the AI failures, the quota and the plan, no. Its «visto» is its own.
select pg_temp.act_as('00000000-0000-0000-0000-000000037a02', pg_temp.k('A'));
set local role authenticated;
insert into _r values ('cashier', dk_my_notifications());
insert into _r values ('cashier-reads', to_jsonb((select count(*) from dk_notification_reads)));
insert into _r values ('cashier-forge', to_jsonb(pg_temp.blocked(format('insert into dk_notification_reads (profile_id, kitchen_id, key) values (%L, %L, %L)',
  '10000000-0000-0000-0000-000000037a01', pg_temp.k('A'), 'forged'))));
reset role;
insert into _t (area, test, expected, got) values
  ('Roles', 'Caja: the order to confirm, yes', 'true', (exists (select 1 from pg_temp.items('cashier', 'to_confirm:') n))::text),
  ('Roles', 'Caja: no failed analyses, quota or plan notices', '0',
    (select count(*)::text from jsonb_array_elements(pg_temp.r('cashier') -> 'items') n where n ->> 'type' in ('ai_error', 'ai_quota', 'trial', 'plan_limit'))),
  ('Roles', 'Caja: no stock notices (no inventory.view)', '0', (select count(*)::text from pg_temp.items('cashier', 'low_stock:') n)),
  ('Roles', 'Caja: the kitchen AI notices too (kitchen.view)', '2', (select count(*)::text from pg_temp.items('cashier', 'ai:kitchen_insights:') n)),
  ('Read', 'Caja does not see what the admin has seen', '0', pg_temp.r('cashier-reads') #>> '{}'),
  ('Read', 'Nobody can write a «visto» for someone else', 'blocked', pg_temp.r('cashier-forge') #>> '{}'),
  ('Read', 'The admin''s «visto» does not mark it for Caja', 'false',
    (select bool_or((n ->> 'read')::boolean) from pg_temp.items('cashier', 'ai:kitchen_insights:') n)::text);

-- 5. No account (no header): rejected.
select pg_temp.act_as('00000000-0000-0000-0000-000000037a03', null);
set local role authenticated;
insert into _r values ('no-account', to_jsonb(pg_temp.blocked('select dk_my_notifications()')));
reset role;
insert into _t (area, test, expected, got) values
  ('Access', 'Without an active account: rejected', 'blocked', pg_temp.r('no-account') #>> '{}');

select area, test, expected, got, case when expected is not distinct from got then 'PASS' else 'FAIL' end as result, detail from _t order by n;
rollback;
