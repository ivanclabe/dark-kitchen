-- ADR 0028: Clientes in the database — search, filters, sort, pagination, figures
-- equal to the orders and dk_receivables, permissions, isolation and a load test
-- (5,000 customers, 20,000 orders). Rolled-back transaction.
--
--   python3 supabase/tests/run.py customers_list

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid) on commit drop;
create temp table _r (key text primary key, v jsonb, ms numeric) on commit drop;
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
create or replace function pg_temp.r(p_key text) returns jsonb language sql as $$ select v from _r where key = p_key $$;
create or replace function pg_temp.names(p jsonb) returns text language sql as $$
  select string_agg(r ->> 'fullName', ', ' order by ord) from jsonb_array_elements(p -> 'rows') with ordinality as x(r, ord)
$$;
create or replace function pg_temp.blocked(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return 'blocked'; end;
$$;
-- Calls dk_customers_list as the current user and stores the result and the time it took.
create or replace function pg_temp.list(p_key text, p_search text default null, p_status text default 'all', p_sort text default null, p_dir text default null,
                                        p_limit int default 25, p_offset int default 0) returns void language plpgsql as $$
declare t0 timestamptz := clock_timestamp(); v jsonb;
begin
  v := dk_customers_list(p_search, p_status, p_sort, p_dir, p_limit, p_offset);
  insert into _r values (p_key, v, extract(epoch from clock_timestamp() - t0) * 1000);
end;
$$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000028a01', 'duena.clientes@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000028a02', 'ventas.clientes@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000028a03', 'cocina.clientes@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-000000028a01', '00000000-0000-0000-0000-000000028a01', 'Dueña', true),
  ('10000000-0000-0000-0000-000000028a02', '00000000-0000-0000-0000-000000028a02', 'Ventas', true),
  ('10000000-0000-0000-0000-000000028a03', '00000000-0000-0000-0000-000000028a03', 'Cocina', true);
insert into dk_organizations (slug, name, owner_user_id, sector, category)
  values ('grupo-clientes', 'Grupo Clientes', '10000000-0000-0000-0000-000000028a01', 'fast_food', 'burgers');
insert into _ctx (key, id) values ('org', (select id from dk_organizations where slug = 'grupo-clientes'));
select pg_temp.act_as('00000000-0000-0000-0000-000000028a01');
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('A', dk_create_kitchen('Centro', 'centro-clientes', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();

-- A custom role that sees customers but not the receivables; and a kitchen user.
insert into dk_roles (id, organization_id, key, name, is_system) values ('60000000-0000-0000-0000-000000028a01', pg_temp.k('org'), 'SOLO_CLIENTES', 'SOLO_CLIENTES', false);
insert into dk_role_permissions (role_id, permission_key) values ('60000000-0000-0000-0000-000000028a01', 'customers.view');
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id) values
  (pg_temp.k('A'), '10000000-0000-0000-0000-000000028a02', '60000000-0000-0000-0000-000000028a01'),
  (pg_temp.k('A'), '10000000-0000-0000-0000-000000028a03', (select id from dk_roles where is_system and key = 'KITCHEN'));
insert into dk_member_roles (kitchen_id, user_id, role_id) values
  (pg_temp.k('A'), '10000000-0000-0000-0000-000000028a02', '60000000-0000-0000-0000-000000028a01'),
  (pg_temp.k('A'), '10000000-0000-0000-0000-000000028a03', (select id from dk_roles where is_system and key = 'KITCHEN'))
on conflict do nothing;

-- Customers and their orders:
--   Ana   2 orders today (10000 + 20000), paid 5000            → 30000 bought, balance 25000, active
--   Bruno 1 order 15000 fully paid + 1 CANCELLED 50000          → 15000 bought, balance 0, active
--   Carla never ordered, registered 200 days ago                → inactive
--   Darío 1 order 100 days ago, 8000 unpaid, due 95 days ago    → overdue 8000, inactive
insert into dk_customers (id, full_name, phone, address, kitchen_id, created_at) values
  ('30000000-0000-0000-0000-000000028a01', 'Ana Pérez', '300 123 4567', 'Calle 10 #5-20', pg_temp.k('A'), now() - interval '30 days'),
  ('30000000-0000-0000-0000-000000028a02', 'Bruno Díaz', '3109998888', 'Carrera 7', pg_temp.k('A'), now() - interval '20 days'),
  ('30000000-0000-0000-0000-000000028a03', 'Carla Gómez', null, null, pg_temp.k('A'), now() - interval '200 days'),
  ('30000000-0000-0000-0000-000000028a04', 'Darío Ruiz', '3205550000', 'Avenida 1', pg_temp.k('A'), now() - interval '120 days');
insert into dk_orders (id, customer_id, kitchen_id, status, subtotal, created_at, due_date) values
  ('40000000-0000-0000-0000-000000028a01', '30000000-0000-0000-0000-000000028a01', pg_temp.k('A'), 'ENTREGADO', 10000, now() - interval '2 hours', null),
  ('40000000-0000-0000-0000-000000028a02', '30000000-0000-0000-0000-000000028a01', pg_temp.k('A'), 'ENTREGADO', 20000, now() - interval '1 hour', null),
  ('40000000-0000-0000-0000-000000028a03', '30000000-0000-0000-0000-000000028a02', pg_temp.k('A'), 'ENTREGADO', 15000, now() - interval '3 hours', null),
  ('40000000-0000-0000-0000-000000028a04', '30000000-0000-0000-0000-000000028a02', pg_temp.k('A'), 'CANCELADO', 50000, now() - interval '3 hours', null),
  ('40000000-0000-0000-0000-000000028a05', '30000000-0000-0000-0000-000000028a04', pg_temp.k('A'), 'ENTREGADO', 8000, now() - interval '100 days', (now() - interval '95 days')::date);
insert into dk_order_payments (order_id, amount, kitchen_id) values
  ('40000000-0000-0000-0000-000000028a01', 5000, pg_temp.k('A')),
  ('40000000-0000-0000-0000-000000028a03', 15000, pg_temp.k('A'));

-- 1. The owner (everything)
select pg_temp.act_as('00000000-0000-0000-0000-000000028a01', pg_temp.k('A'));
set local role authenticated;
select pg_temp.list('default');
select pg_temp.list('search-name', 'ana');
select pg_temp.list('search-phone', '123 45 67');
select pg_temp.list('search-address', 'calle 10');
select pg_temp.list('active', null, 'active');
select pg_temp.list('inactive', null, 'inactive');
select pg_temp.list('debt', null, 'debt');
select pg_temp.list('no-debt', null, 'no_debt');
select pg_temp.list('overdue', null, 'overdue');
select pg_temp.list('by-total', null, 'all', 'total', 'desc');
select pg_temp.list('by-name', null, 'all', 'name', 'asc');
select pg_temp.list('by-last', null, 'all', 'last_order', 'desc');
select pg_temp.list('page2', null, 'all', 'name', 'asc', 2, 2);
insert into _r (key, v) values ('summary', dk_customers_summary()), ('ana', dk_customer_detail('30000000-0000-0000-0000-000000028a01'));
insert into _r (key, v) values ('receivables', (select jsonb_build_object('ana', sum(balance) filter (where customer_id = '30000000-0000-0000-0000-000000028a01'), 'all', sum(balance)) from dk_receivables));
reset role;

insert into _t (area, test, expected, got) values
  ('List', 'Default: who owes most first; 4 customers', '4 · Ana Pérez', (pg_temp.r('default') ->> 'total') || ' · ' || (pg_temp.r('default') -> 'rows' -> 0 ->> 'fullName')),
  ('Search', 'By name (case-insensitive)', 'Ana Pérez', pg_temp.names(pg_temp.r('search-name'))),
  ('Search', 'By phone, ignoring spaces', 'Ana Pérez', pg_temp.names(pg_temp.r('search-phone'))),
  ('Search', 'By address', 'Ana Pérez', pg_temp.names(pg_temp.r('search-address'))),
  ('Filters', 'Active (an order in 90 days)', 'Ana Pérez, Bruno Díaz', pg_temp.names(pg_temp.r('active'))),
  ('Filters', 'Inactive (never ordered or not in 90 days)', 'Darío Ruiz, Carla Gómez', pg_temp.names(pg_temp.r('inactive'))),
  ('Filters', 'With debt', 'Ana Pérez, Darío Ruiz', pg_temp.names(pg_temp.r('debt'))),
  ('Filters', 'Without debt', 'Bruno Díaz, Carla Gómez', pg_temp.names(pg_temp.r('no-debt'))),
  ('Filters', 'Overdue', 'Darío Ruiz', pg_temp.names(pg_temp.r('overdue'))),
  ('Sort', 'By total purchased (cancelled excluded)', 'Ana Pérez, Bruno Díaz, Darío Ruiz, Carla Gómez', pg_temp.names(pg_temp.r('by-total'))),
  ('Sort', 'By name', 'Ana Pérez, Bruno Díaz, Carla Gómez, Darío Ruiz', pg_temp.names(pg_temp.r('by-name'))),
  ('Sort', 'By last order: who never ordered goes last', 'Carla Gómez', pg_temp.r('by-last') -> 'rows' -> 3 ->> 'fullName'),
  ('Pagination', 'Page 2 of 2, with the total', '4 · Carla Gómez, Darío Ruiz', (pg_temp.r('page2') ->> 'total') || ' · ' || pg_temp.names(pg_temp.r('page2'))),
  ('Figures', 'Ana: orders · total purchased · balance · active', '2 · 30000 · 25000 · true',
    (pg_temp.r('ana') ->> 'orders') || ' · ' || trim_scale((pg_temp.r('ana') ->> 'totalPurchased')::numeric) || ' · ' || trim_scale((pg_temp.r('ana') ->> 'balance')::numeric) || ' · ' || (pg_temp.r('ana') ->> 'active')),
  ('Figures', 'Balance equals dk_receivables (Ana · everyone)', 'true · true',
    (trim_scale((pg_temp.r('ana') ->> 'balance')::numeric) = trim_scale((pg_temp.r('receivables') ->> 'ana')::numeric))::text || ' · '
    || (trim_scale((pg_temp.r('summary') ->> 'pendingBalance')::numeric) = trim_scale((pg_temp.r('receivables') ->> 'all')::numeric))::text),
  ('Summary', 'Total · active · with debt · pending · overdue', '4 · 2 · 2 · 33000 · 8000',
    (pg_temp.r('summary') ->> 'total') || ' · ' || (pg_temp.r('summary') ->> 'active') || ' · ' || (pg_temp.r('summary') ->> 'withDebt') || ' · '
    || trim_scale((pg_temp.r('summary') ->> 'pendingBalance')::numeric) || ' · ' || trim_scale((pg_temp.r('summary') ->> 'overdueBalance')::numeric));

-- 2. Customers without the receivables permission: no balance anywhere
select pg_temp.act_as('00000000-0000-0000-0000-000000028a02', pg_temp.k('A'));
set local role authenticated;
select pg_temp.list('no-receivables');
select pg_temp.list('no-receivables-sort', null, 'all', 'balance', 'desc');
insert into _t (area, test, expected, got) values
  ('Permissions', 'No balance nor orders in the rows; summary only the total', 'false · false · {"total": 4, "companies": 0, "preferred": 0}',
    (pg_temp.r('no-receivables') -> 'rows' -> 0 ? 'balance')::text || ' · ' || (pg_temp.r('no-receivables') -> 'rows' -> 0 ? 'orders')::text || ' · ' || dk_customers_summary()::text),
  ('Permissions', 'Sorting by balance falls back to the name', 'name', pg_temp.r('no-receivables-sort') ->> 'sort'),
  ('Permissions', 'Filtering by debt is refused', 'blocked', pg_temp.blocked($q$select dk_customers_list(null, 'debt')$q$));
reset role;

-- 3. Kitchen role, another account, anonymous
select pg_temp.act_as('00000000-0000-0000-0000-000000028a03', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values ('Permissions', 'Kitchen role (no customers.view)', 'blocked', pg_temp.blocked('select dk_customers_list()'));
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000028a01', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
set local role authenticated;
insert into _t (area, test, expected, got) values ('Isolation', 'A header of an account that is not yours', 'blocked', pg_temp.blocked('select dk_customers_list()'));
reset role;
set local role anon;
insert into _t (area, test, expected, got) values ('Isolation', 'Anonymous', 'blocked', pg_temp.blocked('select dk_customers_list()'));
reset role;

-- 4. Load: 5,000 customers and 20,000 orders in the account
select pg_temp.as_owner();
insert into dk_customers (full_name, phone, address, kitchen_id, created_at)
select 'Cliente ' || g, '31' || lpad(g::text, 8, '0'), 'Calle ' || g, pg_temp.k('A'), now() - (g % 400) * interval '1 day'
from generate_series(1, 5000) g;
insert into dk_orders (customer_id, kitchen_id, status, subtotal, created_at, due_date)
select c.id, pg_temp.k('A'), 'ENTREGADO', 5000 + (g % 7) * 1000, now() - (g % 180) * interval '1 day', (now() - (g % 180) * interval '1 day')::date + 15
from generate_series(1, 20000) g
join lateral (select id from dk_customers where kitchen_id = pg_temp.k('A') and full_name = 'Cliente ' || (1 + g % 5000)) c on true;
analyze dk_customers; analyze dk_orders;
select pg_temp.act_as('00000000-0000-0000-0000-000000028a01', pg_temp.k('A'));
set local role authenticated;
select pg_temp.list('load-default');
select pg_temp.list('load-search', '3100000123');
select pg_temp.list('load-total', null, 'debt', 'total', 'desc', 25, 2500);
reset role;
insert into _t (area, test, expected, got, detail) values
  ('Load', '5,004 customers; a page has 25 rows', '5004 · 25', (pg_temp.r('load-default') ->> 'total') || ' · ' || jsonb_array_length(pg_temp.r('load-default') -> 'rows'), (select round(ms) || ' ms' from _r where key = 'load-default')),
  ('Load', 'Search by phone finds the one customer', 'Cliente 123', pg_temp.names(pg_temp.r('load-search')), (select round(ms) || ' ms' from _r where key = 'load-search')),
  ('Load', 'Each page (default, search, filtered + sorted page 101) under 300 ms', 'true',
    (select bool_and(ms < 300)::text from _r where key like 'load-%'), (select string_agg(key || ' ' || round(ms) || ' ms', ', ') from _r where key like 'load-%'));

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
