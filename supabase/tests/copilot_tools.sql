-- ADR 0020: Quanela Copilot tools — one per data area, each with its permission, RLS and limits. Rolled-back transaction.
--
--   python3 supabase/tests/run.py copilot_tools

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
-- Runs a tool call; 'blocked' if it raises.
create or replace function pg_temp.blocked(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ALLOWED';
exception when others then
  return 'blocked';
end;
$$;

insert into _ctx values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx values ('B', (select id from dk_kitchens where slug = 'julian-hamburguesas'));

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000c0b01', 'admin.copilot@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c0b02', 'cocina.copilot@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c0b03', 'caja.copilot@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c0b04', 'inventario.copilot@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c0b05', 'caja.b.copilot@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active)
  select ('10000000-0000-0000-0000-0000000c0b0' || n)::uuid, ('00000000-0000-0000-0000-0000000c0b0' || n)::uuid, 'Copilot ' || n, true from generate_series(1, 5) n;
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
select pg_temp.k(m.kitchen), m.user_id, (select id from dk_roles where is_system and key = m.role_key)
from (values ('A', '10000000-0000-0000-0000-0000000c0b01'::uuid, 'ADMIN'), ('A', '10000000-0000-0000-0000-0000000c0b02'::uuid, 'KITCHEN'),
             ('A', '10000000-0000-0000-0000-0000000c0b03'::uuid, 'CASHIER'), ('A', '10000000-0000-0000-0000-0000000c0b04'::uuid, 'INVENTORY'),
             ('B', '10000000-0000-0000-0000-0000000c0b05'::uuid, 'CASHIER')) m(kitchen, user_id, role_key);

-- A customer and an order that exist only in B.
insert into dk_customers (id, kitchen_id, full_name, phone) values ('30000000-0000-0000-0000-0000000c0b01', pg_temp.k('B'), 'Xiomara Solo En B', '3110000777');
insert into dk_orders (id, kitchen_id, customer_id) values ('40000000-0000-0000-0000-0000000c0b01', pg_temp.k('B'), '30000000-0000-0000-0000-0000000c0b01');

-- 0. Catalog
insert into _t (area, test, expected, got) values
  ('Catalog', 'copilot feature: AI, model, own permission', 'ai · claude-sonnet-5-5 · copilot.use',
    (select category || ' · ' || model_key || ' · ' || use_permission from dk_features where key = 'copilot')),
  ('Catalog', 'Same plans as kitchen_insights', 'true',
    ((select array_agg(plan_key order by plan_key) from dk_plan_features where feature_key = 'copilot') = (select array_agg(plan_key order by plan_key) from dk_plan_features where feature_key = 'kitchen_insights'))::text),
  ('Catalog', 'copilot.use for every system role', 'true',
    ((select count(*) from dk_roles where is_system) = (select count(*) from dk_role_permissions rp join dk_roles r on r.id = rp.role_id where r.is_system and rp.permission_key = 'copilot.use'))::text);

-- 1. Admin: every tool answers
select pg_temp.act_as('00000000-0000-0000-0000-0000000c0b01', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Admin', 'sales: total, groups and previous period', 'true',
    (select (v ? 'total') and jsonb_typeof(v -> 'groups') = 'array' and (v -> 'previous') ? 'total' from (select dk_copilot_sales(current_date - 30, current_date, 'product', true) v) x)::text),
  ('Admin', 'sales by hour', 'array', jsonb_typeof(dk_copilot_sales(current_date - 7, current_date, 'hour') -> 'groups')),
  ('Admin', 'orders: count and list', 'true', (select (v ? 'count') and jsonb_typeof(v -> 'orders') = 'array' from (select dk_copilot_orders(current_date - 30, current_date) v) x)::text),
  ('Admin', 'order: unknown number', 'false', (dk_copilot_order(-1) ->> 'found')),
  ('Admin', 'kitchen: target and in kitchen now', 'true', (select (v ? 'targetMinutes') and jsonb_typeof(v -> 'inKitchenNow') = 'array' from (select dk_copilot_kitchen(current_date - 30, current_date) v) x)::text),
  ('Admin', 'products: cost and recipes visible', 'true · true', (select (v ->> 'costVisible') || ' · ' || (v ->> 'recipesVisible') from (select dk_copilot_products() v) x)),
  ('Admin', 'ingredients: list', 'array', jsonb_typeof(dk_copilot_ingredients() -> 'ingredients')),
  ('Admin', 'purchases: by supplier', 'array', jsonb_typeof(dk_copilot_purchases(current_date - 30, current_date) -> 'bySupplier')),
  ('Admin', 'customers: balance visible', 'true', dk_copilot_customers() ->> 'balanceVisible'),
  ('Admin', 'deliveries: by rider', 'array', jsonb_typeof(dk_copilot_deliveries(current_date - 30, current_date) -> 'byRider')),
  ('Admin', 'staff: whole team', 'true', dk_copilot_staff() ->> 'wholeTeam'),
  ('Context', 'Admin: today and all areas', 'true · 12', (select ((v ->> 'today') is not null)::text || ' · ' || jsonb_array_length(v -> 'permissions') from (select dk_copilot_context() v) x)),
  ('Isolation', 'A customer of B is not found from A', '0', jsonb_array_length(dk_copilot_customers('Xiomara') -> 'customers')::text),
  ('Guards', 'Reversed range', 'blocked', pg_temp.blocked('select dk_copilot_sales(current_date, current_date - 1)')),
  ('Guards', 'More than a year', 'blocked', pg_temp.blocked('select dk_copilot_kitchen(current_date - 500, current_date)'));
reset role;

-- 2. Kitchen: kitchen and products yes (no cost); sales, customers, ingredients no
select pg_temp.act_as('00000000-0000-0000-0000-0000000c0b02', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Kitchen', 'sales', 'blocked', pg_temp.blocked('select dk_copilot_sales(current_date - 7, current_date)')),
  ('Kitchen', 'customers', 'blocked', pg_temp.blocked('select dk_copilot_customers()')),
  ('Kitchen', 'ingredients', 'blocked', pg_temp.blocked('select dk_copilot_ingredients()')),
  ('Kitchen', 'kitchen performance', 'ALLOWED', pg_temp.blocked('select dk_copilot_kitchen(current_date - 7, current_date)')),
  ('Kitchen', 'products without cost, with recipes', 'false · true', (select (v ->> 'costVisible') || ' · ' || (v ->> 'recipesVisible') from (select dk_copilot_products() v) x)),
  ('Kitchen', 'staff: only own shifts', 'false', dk_copilot_staff() ->> 'wholeTeam'),
  ('Context', 'Kitchen: no sales area offered', 'false', ((dk_copilot_context() -> 'permissions') ? 'reports.view')::text);
reset role;

-- 3. Cashier: sales, orders, customers yes; ingredients and purchases no
select pg_temp.act_as('00000000-0000-0000-0000-0000000c0b03', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Cashier', 'sales', 'ALLOWED', pg_temp.blocked('select dk_copilot_sales(current_date - 7, current_date)')),
  ('Cashier', 'customers with balance', 'true', dk_copilot_customers() ->> 'balanceVisible'),
  ('Cashier', 'ingredients', 'blocked', pg_temp.blocked('select dk_copilot_ingredients()')),
  ('Cashier', 'purchases', 'blocked', pg_temp.blocked('select dk_copilot_purchases(current_date - 7, current_date)'));
reset role;

-- 4. Inventory: ingredients and purchases yes; customers and orders no
select pg_temp.act_as('00000000-0000-0000-0000-0000000c0b04', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Inventory', 'ingredients', 'ALLOWED', pg_temp.blocked('select dk_copilot_ingredients()')),
  ('Inventory', 'purchases', 'ALLOWED', pg_temp.blocked('select dk_copilot_purchases(current_date - 7, current_date)')),
  ('Inventory', 'customers', 'blocked', pg_temp.blocked('select dk_copilot_customers()')),
  ('Inventory', 'orders', 'blocked', pg_temp.blocked('select dk_copilot_orders()'));
reset role;

-- 5. Cashier of B finds their own customer
select pg_temp.act_as('00000000-0000-0000-0000-0000000c0b05', pg_temp.k('B'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Isolation', 'Cashier of B finds the customer of B', 'Xiomara Solo En B', dk_copilot_customers('Xiomara') -> 'customers' -> 0 ->> 'name');
reset role;

set local role anon;
insert into _t (area, test, expected, got) values ('Access', 'Anonymous', 'blocked', pg_temp.blocked('select dk_copilot_sales(current_date - 7, current_date)'));
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
