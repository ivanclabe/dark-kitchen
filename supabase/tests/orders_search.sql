-- ADR 0020: dk_order_search — Pedidos → Lista (number, customer, phone, dish; filters; RLS). Rolled-back transaction.
--
--   python3 supabase/tests/run.py orders_search

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, txt text) on commit drop;
grant all on _t, _ctx to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', case when p_kitchen is null then '{}' else json_build_object('x-dk-kitchen-id', p_kitchen)::text end, true);
$$;

insert into _ctx (key, id) values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx (key, id) values ('ivan', (select id from auth.users where email = 'ivanclabe@gmail.com'));
insert into _ctx (key, id, txt) select 'product', id, name from dk_products
  where kitchen_id = (select id from _ctx where key = 'A') and active order by created_at limit 1;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000005a1', 'caja.busqueda@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000005a2', 'moto.busqueda@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000005b1', 'caja.b.busqueda@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000005a1', 'Caja Búsqueda', true),
  ('10000000-0000-0000-0000-0000000005a2', '00000000-0000-0000-0000-0000000005a2', 'Moto Búsqueda', true),
  ('10000000-0000-0000-0000-0000000005b1', '00000000-0000-0000-0000-0000000005b1', 'Caja B Búsqueda', true);

select set_config('request.jwt.claims', json_build_object('sub', (select id from _ctx where key = 'ivan'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _ctx (key, id) select 'B', dk_create_kitchen('Cocina Búsqueda B', 'cocina-busqueda-b');
reset role;

insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
select k.id, m.user_id, r.id
from (values ('A', '10000000-0000-0000-0000-0000000005a1'::uuid, 'CASHIER'),
             ('A', '10000000-0000-0000-0000-0000000005a2'::uuid, 'DELIVERY'),
             ('B', '10000000-0000-0000-0000-0000000005b1'::uuid, 'CASHIER')) m(kitchen, user_id, role_key)
join _ctx k on k.key = m.kitchen
join dk_roles r on r.is_system and r.key = m.role_key;

-- An order in A, by the cashier: customer with a unique name and phone, one dish.
select pg_temp.act_as('00000000-0000-0000-0000-0000000005a1', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$
declare v_customer uuid; v_order uuid;
begin
  insert into dk_customers (full_name, phone) values ('Zuleima Búsqueda Única', '3005550199') returning id into v_customer;
  insert into dk_orders (customer_id, channel) values (v_customer, 'WHATSAPP') returning id into v_order;
  insert into dk_order_items (order_id, product_id, quantity, unit_price) values (v_order, (select id from _ctx where key = 'product'), 1, 10000);
  insert into _ctx (key, id, txt) select 'order', id, order_number::text from dk_orders where id = v_order;
end $$;

insert into _t (area, test, expected, got) values
  ('Search', 'By number', 'true', ((select id from _ctx where key = 'order') in (select dk_order_search((select txt from _ctx where key = 'order'))))::text),
  ('Search', 'By number with #', 'true', ((select id from _ctx where key = 'order') in (select dk_order_search('#' || (select txt from _ctx where key = 'order'))))::text),
  ('Search', 'By part of the customer name', 'true', ((select id from _ctx where key = 'order') in (select dk_order_search('búsqueda única')))::text),
  ('Search', 'By phone', 'true', ((select id from _ctx where key = 'order') in (select dk_order_search('5550199')))::text),
  ('Search', 'By dish', 'true', ((select id from _ctx where key = 'order') in (select dk_order_search((select txt from _ctx where key = 'product'))))::text),
  ('Filters', 'Status filter excludes it', 'false', ((select id from _ctx where key = 'order') in (select dk_order_search('Zuleima', p_statuses => array['ENTREGADO']::dk_order_status[])))::text),
  ('Filters', 'Channel filter keeps it', 'true', ((select id from _ctx where key = 'order') in (select dk_order_search('Zuleima', p_channel => 'WHATSAPP')))::text),
  ('Filters', 'Future date range excludes it', 'false', ((select id from _ctx where key = 'order') in (select dk_order_search(null, now() + interval '1 day')))::text),
  ('Filters', 'Huge number does not break', '0', (select count(*)::text from dk_order_search('99999999999999')));
reset role;

-- Other account and other roles
select pg_temp.act_as('00000000-0000-0000-0000-0000000005b1', (select id from _ctx where key = 'B'));
set local role authenticated;
insert into _t (area, test, expected, got) values ('Isolation', 'Cashier of B does not find it', '0', (select count(*)::text from dk_order_search('Zuleima')));
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000005a2', (select id from _ctx where key = 'A'));
set local role authenticated;
insert into _t (area, test, expected, got) values ('Isolation', 'Rider does not find an order not assigned to them', '0', (select count(*)::text from dk_order_search((select txt from _ctx where key = 'order'))));
reset role;

set local role anon;
do $$ begin
  begin perform dk_order_search('x');
    insert into _t (area, test, expected, got) values ('Access', 'Anonymous', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Access', 'Anonymous', 'blocked', 'blocked', sqlerrm); end;
end $$;
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
