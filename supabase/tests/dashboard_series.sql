-- ADR 0072: the series of «Destacado» — buckets by hour and by day in the account's time zone, sales rules,
-- time in the kitchen, cancellations, cost only with permission, isolation and range limits. Transacción revertida.
--
--   python3 supabase/tests/run.py dashboard_series

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, v jsonb) on commit drop;
grant all on _t, _ctx to authenticated;
grant usage on sequence _t_n_seq to authenticated;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', jsonb_build_object('x-dk-kitchen-id', p_kitchen)::text, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.hint(p_sql text) returns text language plpgsql as $$
declare v_hint text; v_state text;
begin execute p_sql; return 'ALLOWED';
exception when others then get stacked diagnostics v_hint = pg_exception_hint, v_state = returned_sqlstate;
  return coalesce(nullif(v_hint, ''), v_state); end;
$$;
grant execute on function pg_temp.hint(text), pg_temp.k(text) to authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000072a01', 'duena.consola@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000072a02', 'analista.consola@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000072a03', 'ajena.consola@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-000000072a01', '00000000-0000-0000-0000-000000072a01', 'Dueña', true),
  ('10000000-0000-0000-0000-000000072a02', '00000000-0000-0000-0000-000000072a02', 'Analista', true),
  ('10000000-0000-0000-0000-000000072a03', '00000000-0000-0000-0000-000000072a03', 'Ajena', true);
insert into dk_organizations (slug, name, owner_user_id, sector, category) values
  ('grupo-consola', 'Grupo Consola', '10000000-0000-0000-0000-000000072a01', 'fast_food', 'burgers'),
  ('grupo-ajeno-consola', 'Grupo Ajeno', '10000000-0000-0000-0000-000000072a03', 'fast_food', 'burgers');
insert into _ctx (key, id) values
  ('org', (select id from dk_organizations where slug = 'grupo-consola')),
  ('org2', (select id from dk_organizations where slug = 'grupo-ajeno-consola')),
  ('owner', '00000000-0000-0000-0000-000000072a01'), ('analyst', '00000000-0000-0000-0000-000000072a02'),
  ('other', '00000000-0000-0000-0000-000000072a03');

select pg_temp.act_as(pg_temp.k('owner'), null);
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('A', dk_create_kitchen('Consola', 'consola-prueba', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.act_as(pg_temp.k('other'), null);
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('B', dk_create_kitchen('Ajena', 'ajena-consola', 'America/Bogota', null, pg_temp.k('org2'))); end $$;
reset role;
select pg_temp.as_owner();

-- An analyst: sees the reports, not the profitability.
insert into dk_roles (id, key, name, organization_id) values ('70000000-0000-0000-0000-000000072a01', 'ANALISTA', 'ANALISTA', pg_temp.k('org'));
insert into dk_role_permissions (role_id, permission_key) values ('70000000-0000-0000-0000-000000072a01', 'reports.view');
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id) values (pg_temp.k('A'), '10000000-0000-0000-0000-000000072a02', '70000000-0000-0000-0000-000000072a01');

insert into dk_customers (id, full_name, kitchen_id) values ('30000000-0000-0000-0000-000000072a01', 'Cliente', pg_temp.k('A'));
insert into dk_customers (id, full_name, kitchen_id) values ('30000000-0000-0000-0000-000000072a02', 'Cliente B', pg_temp.k('B'));
insert into dk_products (id, code, name, price, kitchen_id) values ('52000000-0000-0000-0000-000000072a01', 'CS-SOPA', 'Sopa', 10000, pg_temp.k('A'));

-- Fixed history: written as it happened, without the order triggers (state machine, stock, automatic history).
set local session_replication_role = replica;
-- 2026-10-14 (Bogotá, UTC-5): 12:30 and 12:50 → the 12:00 bucket; 19:10 → 19:00; 23:30 local is 04:30 UTC of the 15th
-- (must stay on the 14th). One cancelled, one still NUEVO (not a sale).
insert into dk_orders (id, order_number, customer_id, kitchen_id, status, channel, subtotal, created_at) values
  ('40000000-0000-0000-0000-000000072a01', 101, '30000000-0000-0000-0000-000000072a01', pg_temp.k('A'), 'ENTREGADO', 'WEB', 20000, '2026-10-14 12:30-05'),
  ('40000000-0000-0000-0000-000000072a02', 102, '30000000-0000-0000-0000-000000072a01', pg_temp.k('A'), 'ENTREGADO', 'MANUAL', 10000, '2026-10-14 12:50-05'),
  ('40000000-0000-0000-0000-000000072a03', 103, '30000000-0000-0000-0000-000000072a01', pg_temp.k('A'), 'CANCELADO', 'MANUAL', 30000, '2026-10-14 19:10-05'),
  ('40000000-0000-0000-0000-000000072a04', 104, '30000000-0000-0000-0000-000000072a01', pg_temp.k('A'), 'LISTO', 'WHATSAPP', 30000, '2026-10-14 23:30-05'),
  ('40000000-0000-0000-0000-000000072a05', 105, '30000000-0000-0000-0000-000000072a01', pg_temp.k('A'), 'NUEVO', 'WEB', 99000, '2026-10-14 13:00-05'),
  -- The week before (comparison): one sale.
  ('40000000-0000-0000-0000-000000072a06', 106, '30000000-0000-0000-0000-000000072a01', pg_temp.k('A'), 'ENTREGADO', 'WEB', 5000, '2026-10-08 12:00-05'),
  -- Another account, same day: never counted.
  ('40000000-0000-0000-0000-000000072a07', 107, '30000000-0000-0000-0000-000000072a02', pg_temp.k('B'), 'ENTREGADO', 'WEB', 77000, '2026-10-14 12:30-05');
insert into dk_order_items (order_id, product_id, quantity, unit_price, kitchen_id, estimated_unit_cost) values
  ('40000000-0000-0000-0000-000000072a01', '52000000-0000-0000-0000-000000072a01', 2, 10000, pg_temp.k('A'), 3000),
  ('40000000-0000-0000-0000-000000072a02', '52000000-0000-0000-0000-000000072a01', 1, 10000, pg_temp.k('A'), 3000);
-- Kitchen: order 1 from 12:35 to 12:55 (20 min), order 2 from 12:55 to 13:05 (10 min) → 15 min in the 12:00 bucket.
insert into dk_order_status_history (order_id, from_status, to_status, changed_at, kitchen_id) values
  ('40000000-0000-0000-0000-000000072a01', 'CONFIRMADO', 'EN_PREPARACION', '2026-10-14 12:35-05', pg_temp.k('A')),
  ('40000000-0000-0000-0000-000000072a01', 'EN_PREPARACION', 'LISTO', '2026-10-14 12:55-05', pg_temp.k('A')),
  ('40000000-0000-0000-0000-000000072a02', 'CONFIRMADO', 'EN_PREPARACION', '2026-10-14 12:55-05', pg_temp.k('A')),
  ('40000000-0000-0000-0000-000000072a02', 'EN_PREPARACION', 'LISTO', '2026-10-14 13:05-05', pg_temp.k('A'));
set local session_replication_role = origin;

select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
begin
  insert into _ctx (key, v) values
    ('day', dk_dashboard_series('2026-10-14', '2026-10-14', 'day')),
    ('hour', dk_dashboard_series('2026-10-14', '2026-10-14', 'hour')),
    ('week', dk_dashboard_series('2026-10-14', '2026-10-20', 'day'));
end $$;
insert into _t (area, test, expected, got) values
  ('Ventas', 'Un día: ventas entregadas y listas, sin cancelados ni nuevos ni de otra cuenta', '3 · 60000 · 20000',
    ((select v from _ctx where key = 'day') #>> '{totals,orders}') || ' · ' || ((select v from _ctx where key = 'day') #>> '{totals,revenue}')
      || ' · ' || ((select v from _ctx where key = 'day') #>> '{totals,averageTicket}')),
  ('Ventas', 'Cancelados sobre los decididos (1 de 4)', '0.2500', (select v from _ctx where key = 'day') #>> '{totals,cancelledRate}'),
  ('Ventas', 'Comparación con los 7 días anteriores… (un día: el anterior)', '2026-10-13 · 0',
    ((select v from _ctx where key = 'day') #>> '{previousPeriod,from}') || ' · ' || ((select v from _ctx where key = 'day') #>> '{previous,orders}')),
  ('Ventas', 'La semana anterior a 7 días tiene su venta', '1 · 5000',
    ((select v from _ctx where key = 'week') #>> '{previous,orders}') || ' · ' || ((select v from _ctx where key = 'week') #>> '{previous,revenue}')),
  ('Cubos', 'Cada hora: 24 cubos', '24', jsonb_array_length((select v from _ctx where key = 'hour') -> 'points')::text),
  ('Cubos', 'Las 12:00 locales tienen las dos ventas de mediodía', '2026-10-14T12:00 · 2 · 30000',
    (select p ->> 't' || ' · ' || (p ->> 'orders') || ' · ' || (p ->> 'revenue') from jsonb_array_elements((select v from _ctx where key = 'hour') -> 'points') p where p ->> 't' = '2026-10-14T12:00')),
  ('Cubos', 'Las 23:30 locales quedan en el día 14 (no en el 15 UTC)', '2026-10-14T23:00 · 1',
    (select p ->> 't' || ' · ' || (p ->> 'orders') from jsonb_array_elements((select v from _ctx where key = 'hour') -> 'points') p where p ->> 't' = '2026-10-14T23:00')),
  ('Cubos', 'Siete días: siete cubos', '7', jsonb_array_length((select v from _ctx where key = 'week') -> 'points')::text),
  ('Cubos', 'Un día sin pedidos: cero pedidos, sin ticket inventado', '0 · null',
    (select (p ->> 'orders') || ' · ' || coalesce(p ->> 'averageTicket', 'null') from jsonb_array_elements((select v from _ctx where key = 'week') -> 'points') p where p ->> 't' = '2026-10-16T00:00')),
  ('Cocina', 'Tiempo en cocina (de Preparando a Listo) en el cubo de las 12', '15.0',
    (select p ->> 'kitchenMinutes' from jsonb_array_elements((select v from _ctx where key = 'hour') -> 'points') p where p ->> 't' = '2026-10-14T12:00')),
  ('Costo', 'La dueña ve el costo de comida (3.000 de cada 10.000)', 'true · 0.3000',
    ((select v from _ctx where key = 'day') ->> 'profitability') || ' · ' || ((select v from _ctx where key = 'day') #>> '{totals,foodCostRate}')),
  ('Canales', 'Por canal, sin cancelados', 'MANUAL:1 WEB:1 WHATSAPP:1',
    (select string_agg((c ->> 'channel') || ':' || (c ->> 'orders'), ' ' order by c ->> 'channel') from jsonb_array_elements((select v from _ctx where key = 'day') -> 'channels') c)),
  ('Platos', 'Más vendidos', 'Sopa:3', (select string_agg((p ->> 'name') || ':' || (p ->> 'units'), ' ') from jsonb_array_elements((select v from _ctx where key = 'day') -> 'topProducts') p)),
  ('Límites', 'Cada hora con más de 7 días', 'invalid', pg_temp.hint($q$select dk_dashboard_series('2026-10-01', '2026-10-14', 'hour')$q$)),
  ('Límites', 'Más de 92 días', 'invalid', pg_temp.hint($q$select dk_dashboard_series('2026-01-01', '2026-10-14', 'day')$q$)),
  ('Límites', 'Rango al revés', 'invalid', pg_temp.hint($q$select dk_dashboard_series('2026-10-14', '2026-10-01', 'day')$q$)),
  ('Límites', 'Granularidad inventada', 'invalid', pg_temp.hint($q$select dk_dashboard_series('2026-10-14', '2026-10-14', 'minute')$q$));
reset role;

select pg_temp.act_as(pg_temp.k('analyst'), pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Costo', 'Sin permiso de rentabilidad: no hay costo (ni en los cubos)', 'false · null · false',
    (select (d ->> 'profitability') || ' · ' || coalesce(d #>> '{totals,foodCostRate}', 'null') || ' · '
            || bool_or(p ? 'foodCostRate')::text
     from (select dk_dashboard_series('2026-10-14', '2026-10-14', 'day') d) x, jsonb_array_elements(d -> 'points') p group by d));
reset role;

select pg_temp.act_as(pg_temp.k('other'), pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Aislamiento', 'Una persona ajena no lee la cuenta', '42501', pg_temp.hint($q$select dk_dashboard_series('2026-10-14', '2026-10-14', 'day')$q$));
reset role;
select pg_temp.act_as(pg_temp.k('other'), pg_temp.k('B'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Aislamiento', 'Su propia cuenta solo ve su pedido', '1 · 77000',
    (select (d #>> '{totals,orders}') || ' · ' || (d #>> '{totals,revenue}') from (select dk_dashboard_series('2026-10-14', '2026-10-14', 'day') d) x));
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;

rollback;
