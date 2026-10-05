-- ADR 0027: Insights — real figures, account time zone, real cost per sold item,
-- comparison with the previous period, permissions and isolation. Rolled-back transaction.
--
--   python3 supabase/tests/run.py insights

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, d date) on commit drop;
create temp table _r (key text primary key, v jsonb) on commit drop;
grant all on _t, _ctx, _r to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', (case when p_kitchen is null then '{}'::jsonb else jsonb_build_object('x-dk-kitchen-id', p_kitchen) end)::text, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.d(p_key text) returns date language sql as $$ select d from _ctx where key = p_key $$;
create or replace function pg_temp.r(p_key text) returns jsonb language sql as $$ select v from _r where key = p_key $$;
create or replace function pg_temp.role_id(p_key text) returns uuid language sql as $$ select id from dk_roles where is_system and key = p_key $$;
create or replace function pg_temp.blocked(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return 'blocked'; end;
$$;

-- An owner, a cashier (reports.view without profitability) and a kitchen user (no reports).
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000027a01', 'duena.insights@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000027a02', 'caja.insights@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000027a03', 'cocina.insights@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-000000027a01', '00000000-0000-0000-0000-000000027a01', 'Dueña', true),
  ('10000000-0000-0000-0000-000000027a02', '00000000-0000-0000-0000-000000027a02', 'Caja', true),
  ('10000000-0000-0000-0000-000000027a03', '00000000-0000-0000-0000-000000027a03', 'Cocina', true);
insert into dk_organizations (slug, name, owner_user_id, sector, category)
  values ('grupo-insights', 'Grupo Insights', '10000000-0000-0000-0000-000000027a01', 'fast_food', 'burgers');
insert into _ctx (key, id) values ('org', (select id from dk_organizations where slug = 'grupo-insights'));

select pg_temp.act_as('00000000-0000-0000-0000-000000027a01');
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('A', dk_create_kitchen('Centro', 'centro-insights', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();

-- Periods (local dates in Bogotá): current = the last 7 days, previous = the 7 before.
insert into _ctx (key, d) values ('today', dk_local_date(now(), 'America/Bogota'));
insert into _ctx (key, d) values ('from', pg_temp.d('today') - 6), ('pfrom', pg_temp.d('today') - 13), ('pto', pg_temp.d('today') - 7);

insert into dk_kitchen_members (kitchen_id, user_id, default_role_id) values
  (pg_temp.k('A'), '10000000-0000-0000-0000-000000027a02', pg_temp.role_id('CASHIER')),
  (pg_temp.k('A'), '10000000-0000-0000-0000-000000027a03', pg_temp.role_id('KITCHEN'));
insert into dk_member_roles (kitchen_id, user_id, role_id) values
  (pg_temp.k('A'), '10000000-0000-0000-0000-000000027a02', pg_temp.role_id('CASHIER')),
  (pg_temp.k('A'), '10000000-0000-0000-0000-000000027a03', pg_temp.role_id('KITCHEN'))
on conflict do nothing;

-- Catalog: a category, three products (with recipe cost estimate, and one without any cost).
insert into dk_product_categories (id, name, kitchen_id) values ('51000000-0000-0000-0000-000000027a01', 'Bebidas', pg_temp.k('A'));
insert into dk_products (id, code, name, price, estimated_cost, category_id, kitchen_id) values
  ('52000000-0000-0000-0000-000000027a01', 'INS-SOPA', 'Sopa', 8000, 3000, null, pg_temp.k('A')),
  ('52000000-0000-0000-0000-000000027a02', 'INS-LIMO', 'Limonada', 4000, 1000, '51000000-0000-0000-0000-000000027a01', pg_temp.k('A')),
  ('52000000-0000-0000-0000-000000027a03', 'INS-PAN', 'Pan', 1000, 0, null, pg_temp.k('A'));
insert into dk_ingredients (id, code, name, base_unit_id, avg_cost, kitchen_id) values
  ('53000000-0000-0000-0000-000000027a01', 'INS-POLLO', 'Pollo', (select id from dk_units where code = 'g'), 10, pg_temp.k('A'));
insert into dk_customers (id, full_name, kitchen_id) values ('30000000-0000-0000-0000-000000027a01', 'Cliente', pg_temp.k('A'));

-- Orders:
--   O1 today: 2 Sopa (16000) + 1 Limonada (4000), delivery 5000 → total 25000
--   O2 today, CANCELLED (excluded)
--   O4 today: 1 Pan (1000), no cost at all
--   O5 at 23:30 local of the day before the period (previous period, not current)
--   O3 in the previous period: 1 Sopa (8000)
insert into dk_orders (id, customer_id, kitchen_id, status, subtotal, discount, delivery_fee, created_at) values
  ('40000000-0000-0000-0000-000000027a01', '30000000-0000-0000-0000-000000027a01', pg_temp.k('A'), 'NUEVO', 20000, 0, 5000, now() - interval '5 minutes'),
  ('40000000-0000-0000-0000-000000027a02', '30000000-0000-0000-0000-000000027a01', pg_temp.k('A'), 'NUEVO', 8000, 0, 0, now() - interval '5 minutes'),
  ('40000000-0000-0000-0000-000000027a04', '30000000-0000-0000-0000-000000027a01', pg_temp.k('A'), 'NUEVO', 1000, 0, 0, now() - interval '4 minutes'),
  ('40000000-0000-0000-0000-000000027a05', '30000000-0000-0000-0000-000000027a01', pg_temp.k('A'), 'NUEVO', 3000, 0, 0,
     dk_local_start(pg_temp.d('from'), 'America/Bogota') - interval '30 minutes'),
  ('40000000-0000-0000-0000-000000027a03', '30000000-0000-0000-0000-000000027a01', pg_temp.k('A'), 'NUEVO', 8000, 0, 0,
     dk_local_start(pg_temp.d('pfrom') + 2, 'America/Bogota') + interval '12 hours');
insert into dk_order_items (id, order_id, product_id, quantity, unit_price, kitchen_id) values
  ('41000000-0000-0000-0000-000000027a01', '40000000-0000-0000-0000-000000027a01', '52000000-0000-0000-0000-000000027a01', 2, 8000, pg_temp.k('A')),
  ('41000000-0000-0000-0000-000000027a02', '40000000-0000-0000-0000-000000027a01', '52000000-0000-0000-0000-000000027a02', 1, 4000, pg_temp.k('A')),
  ('41000000-0000-0000-0000-000000027a03', '40000000-0000-0000-0000-000000027a02', '52000000-0000-0000-0000-000000027a01', 1, 8000, pg_temp.k('A')),
  ('41000000-0000-0000-0000-000000027a04', '40000000-0000-0000-0000-000000027a04', '52000000-0000-0000-0000-000000027a03', 1, 1000, pg_temp.k('A')),
  ('41000000-0000-0000-0000-000000027a05', '40000000-0000-0000-0000-000000027a05', '52000000-0000-0000-0000-000000027a03', 3, 1000, pg_temp.k('A')),
  ('41000000-0000-0000-0000-000000027a06', '40000000-0000-0000-0000-000000027a03', '52000000-0000-0000-0000-000000027a01', 1, 8000, pg_temp.k('A'));
-- Items are only added to open orders; then each order gets its final state.
update dk_orders set status = 'ENTREGADO' where id in ('40000000-0000-0000-0000-000000027a01', '40000000-0000-0000-0000-000000027a03',
  '40000000-0000-0000-0000-000000027a04', '40000000-0000-0000-0000-000000027a05');
update dk_orders set status = 'CANCELADO' where id = '40000000-0000-0000-0000-000000027a02';
-- Real consumption: the 2 Sopas consumed 200 g at 10 (= 2000) and 100 g came back (correction) → real cost 1000.
-- The previous-period Sopa consumed 90 g at 10 (= 900). The cancelled one consumed too (must not count).
insert into dk_inventory_movements (ingredient_id, movement_type, quantity_base_unit, unit_cost, reference_type, reference_id, kitchen_id) values
  ('53000000-0000-0000-0000-000000027a01', 'CONSUMO', -200, 10, 'order_item', '41000000-0000-0000-0000-000000027a01', pg_temp.k('A')),
  ('53000000-0000-0000-0000-000000027a01', 'DEVOLUCION', 100, null, 'order_item_revert', '41000000-0000-0000-0000-000000027a01', pg_temp.k('A')),
  ('53000000-0000-0000-0000-000000027a01', 'CONSUMO', -90, 10, 'order_item', '41000000-0000-0000-0000-000000027a06', pg_temp.k('A')),
  ('53000000-0000-0000-0000-000000027a01', 'CONSUMO', -100, 10, 'order_item', '41000000-0000-0000-0000-000000027a03', pg_temp.k('A')),
  ('53000000-0000-0000-0000-000000027a01', 'MERMA', -50, 10, null, null, pg_temp.k('A'));
-- Purchases of chicken: 1 kg at 10000 now, 1 kg at 8000 in the previous period (+25 %).
insert into dk_suppliers (id, name, kitchen_id) values ('54000000-0000-0000-0000-000000027a01', 'Avícola', pg_temp.k('A'));
insert into dk_purchases (id, supplier_id, invoice_number, invoice_date, status, subtotal, total, kitchen_id, created_at) values
  ('55000000-0000-0000-0000-000000027a01', '54000000-0000-0000-0000-000000027a01', 'F-1', pg_temp.d('today'), 'BORRADOR', 10000, 10000, pg_temp.k('A'), now() - interval '1 hour'),
  ('55000000-0000-0000-0000-000000027a02', '54000000-0000-0000-0000-000000027a01', 'F-0', pg_temp.d('pfrom') + 1, 'BORRADOR', 8000, 8000, pg_temp.k('A'),
     dk_local_start(pg_temp.d('pfrom') + 1, 'America/Bogota') + interval '12 hours');
insert into dk_purchase_items (purchase_id, ingredient_id, quantity, purchase_unit_id, unit_cost, kitchen_id) values
  ('55000000-0000-0000-0000-000000027a01', '53000000-0000-0000-0000-000000027a01', 1, (select id from dk_units where code = 'kg'), 10000, pg_temp.k('A')),
  ('55000000-0000-0000-0000-000000027a02', '53000000-0000-0000-0000-000000027a01', 1, (select id from dk_units where code = 'kg'), 8000, pg_temp.k('A'));
update dk_purchases set status = 'CONFIRMADA' where id in ('55000000-0000-0000-0000-000000027a01', '55000000-0000-0000-0000-000000027a02');

-- 1. The owner (SUPER_ADMIN: everything) in A
select pg_temp.act_as('00000000-0000-0000-0000-000000027a01', pg_temp.k('A'));
set local role authenticated;
insert into _r values ('all', dk_insights(pg_temp.d('from'), pg_temp.d('today'), pg_temp.d('pfrom'), pg_temp.d('pto')));
insert into _r values ('sopa', dk_insights(pg_temp.d('from'), pg_temp.d('today'), pg_temp.d('pfrom'), pg_temp.d('pto'), null, '52000000-0000-0000-0000-000000027a01'));
insert into _r values ('orders', dk_insights_product_orders('52000000-0000-0000-0000-000000027a01', pg_temp.d('from'), pg_temp.d('today')));
reset role;

insert into _t (area, test, expected, got) values
  ('KPIs', 'Revenue = Σ total of non-cancelled orders of the period', '26000', trim_scale((pg_temp.r('all') -> 'current' ->> 'revenue')::numeric)),
  ('KPIs', 'Net product revenue = Σ subtotal − discount (no delivery)', '21000', trim_scale((pg_temp.r('all') -> 'current' ->> 'netRevenue')::numeric)),
  ('KPIs', 'Orders · average order value', '2 · 13000', (pg_temp.r('all') -> 'current' ->> 'orders') || ' · ' || trim_scale((pg_temp.r('all') -> 'current' ->> 'averageOrderValue')::numeric)),
  ('Cost', 'COGS: real cost of the Sopas (consumed − returned) + recipe estimate of the Limonada not prepared', '2000', trim_scale((pg_temp.r('all') -> 'current' ->> 'cogs')::numeric)),
  ('Cost', 'Of which estimated', '1000', trim_scale((pg_temp.r('all') -> 'current' ->> 'estimatedCogs')::numeric)),
  ('Cost', 'Gross profit = net revenue − COGS; gross margin', '19000 · 0.9048', trim_scale(((pg_temp.r('all') -> 'current' ->> 'grossProfit')::numeric)) || ' · ' || (pg_temp.r('all') -> 'current' ->> 'grossMargin')),
  ('Cost', 'Cost coverage: the bread has no cost (1000 of 21000)', '0.9524', pg_temp.r('all') -> 'current' ->> 'costCoverage'),
  ('Time zone', 'The order at 23:30 of the day before the period belongs to the previous one', '11000', trim_scale((pg_temp.r('all') -> 'previous' ->> 'revenue')::numeric)),
  ('Time zone', 'One point per day of the period', '7', jsonb_array_length(pg_temp.r('all') -> 'daily')::text),
  ('Compare', 'Previous period COGS (only the real Sopa; the bread has none)', '900', trim_scale((pg_temp.r('all') -> 'previous' ->> 'cogs')::numeric)),
  ('Products', 'Sopa: units · revenue · real unit cost now and before', '2 · 16000 · 500 · 900',
    (select (p ->> 'units') || ' · ' || trim_scale((p ->> 'revenue')::numeric) || ' · ' || trim_scale((p ->> 'unitCost')::numeric) || ' · ' || trim_scale((p ->> 'previousUnitCost')::numeric)
     from jsonb_array_elements(pg_temp.r('all') -> 'products') p where p ->> 'name' = 'Sopa')),
  ('Categories', 'Bebidas and «no category»', 'Bebidas:4000 · -:17000',
    (select string_agg(coalesce(c ->> 'name', '-') || ':' || trim_scale((c ->> 'revenue')::numeric), ' · ' order by c ->> 'name' nulls last)
     from jsonb_array_elements(pg_temp.r('all') -> 'categories') c)),
  ('Filter', 'Product filter: its revenue, orders and cost', '16000 · 1 · 1000',
    trim_scale((pg_temp.r('sopa') -> 'current' ->> 'revenue')::numeric) || ' · ' || (pg_temp.r('sopa') -> 'current' ->> 'orders') || ' · ' || trim_scale((pg_temp.r('sopa') -> 'current' ->> 'cogs')::numeric)),
  ('Costs', 'Purchases now · before; chicken price per kg now · before', '10000 · 8000 · 10000 · 8000',
    trim_scale((pg_temp.r('all') -> 'purchases' ->> 'total')::numeric) || ' · ' || trim_scale((pg_temp.r('all') -> 'purchases' ->> 'previousTotal')::numeric) || ' · '
    || trim_scale((pg_temp.r('all') -> 'purchases' -> 'ingredients' -> 0 ->> 'averagePrice')::numeric) || ' · ' || trim_scale((pg_temp.r('all') -> 'purchases' -> 'ingredients' -> 0 ->> 'previousAveragePrice')::numeric)),
  ('Costs', 'Waste = 50 g × 10', '500', trim_scale((pg_temp.r('all') -> 'waste' ->> 'total')::numeric)),
  ('Drill-down', 'Orders of the Sopa in the period, with its real cost', '1 · real · 1000',
    jsonb_array_length(pg_temp.r('orders')) || ' · ' || (pg_temp.r('orders') -> 0 ->> 'costSource') || ' · ' || trim_scale((pg_temp.r('orders') -> 0 ->> 'cost')::numeric));

-- 2. The cashier: sales yes, costs no
select pg_temp.act_as('00000000-0000-0000-0000-000000027a02', pg_temp.k('A'));
set local role authenticated;
insert into _r values ('cashier', dk_insights(pg_temp.d('from'), pg_temp.d('today'), pg_temp.d('pfrom'), pg_temp.d('pto')));
reset role;
insert into _t (area, test, expected, got) values
  ('Permissions', 'Cashier sees revenue', '26000', trim_scale((pg_temp.r('cashier') -> 'current' ->> 'revenue')::numeric)),
  ('Permissions', 'Cashier gets no COGS, gross profit nor product cost', 'false · false · false',
    (pg_temp.r('cashier') -> 'current' ? 'cogs')::text || ' · ' || (pg_temp.r('cashier') -> 'current' ? 'grossProfit')::text || ' · '
    || (pg_temp.r('cashier') -> 'products' -> 0 ? 'cogs')::text);

-- 3. Kitchen role, another account and anonymous: blocked or empty
select pg_temp.act_as('00000000-0000-0000-0000-000000027a03', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Permissions', 'Kitchen role (no reports.view) is blocked', 'blocked', pg_temp.blocked(format('select dk_insights(%L, %L)', pg_temp.d('from'), pg_temp.d('today'))));
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000027a01', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Isolation', 'A header of an account that is not yours is blocked', 'blocked', pg_temp.blocked(format('select dk_insights(%L, %L)', pg_temp.d('from'), pg_temp.d('today'))));
reset role;
set local role anon;
insert into _t (area, test, expected, got) values
  ('Isolation', 'Anonymous is blocked', 'blocked', pg_temp.blocked(format('select dk_insights(%L, %L)', pg_temp.d('from'), pg_temp.d('today'))));
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
