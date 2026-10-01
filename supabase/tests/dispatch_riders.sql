-- ADR 0020, D4: riders in Pedidos → Despacho (their orders and customers only; no kitchen.view). Rolled-back transaction.
--
--   python3 supabase/tests/run.py dispatch_riders

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid) on commit drop;
grant all on _t, _ctx to authenticated;
grant usage on sequence _t_n_seq to authenticated;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', json_build_object('x-dk-kitchen-id', p_kitchen)::text, true);
$$;

insert into _ctx values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into auth.users (id, email, aud, role) values ('00000000-0000-0000-0000-0000000d1e01', 'moto.despacho@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values ('10000000-0000-0000-0000-0000000d1e01', '00000000-0000-0000-0000-0000000d1e01', 'Moto Despacho', true);
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
  values ((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-0000000d1e01', (select id from dk_roles where is_system and key = 'DELIVERY'));
insert into dk_delivery_riders (id, kitchen_id, user_id, full_name)
  values ('20000000-0000-0000-0000-0000000d1e01', (select id from _ctx where key = 'A'), '10000000-0000-0000-0000-0000000d1e01', 'Moto Despacho');

-- Two customers with an order each; only the first order is assigned to the rider.
insert into dk_customers (id, kitchen_id, full_name, address, phone) values
  ('30000000-0000-0000-0000-0000000d1e01', (select id from _ctx where key = 'A'), 'Cliente Asignado', 'Calle 1 # 2-3', '3001110001'),
  ('30000000-0000-0000-0000-0000000d1e02', (select id from _ctx where key = 'A'), 'Cliente Ajeno', 'Calle 9 # 9-9', '3001110002');
insert into dk_orders (id, kitchen_id, customer_id) values
  ('40000000-0000-0000-0000-0000000d1e01', (select id from _ctx where key = 'A'), '30000000-0000-0000-0000-0000000d1e01'),
  ('40000000-0000-0000-0000-0000000d1e02', (select id from _ctx where key = 'A'), '30000000-0000-0000-0000-0000000d1e02');
insert into dk_deliveries (kitchen_id, order_id, rider_id)
  values ((select id from _ctx where key = 'A'), '40000000-0000-0000-0000-0000000d1e01', '20000000-0000-0000-0000-0000000d1e01');

insert into _t (area, test, expected, got) values ('Role', 'System DELIVERY role has no kitchen.view', 'false',
  exists (select 1 from dk_role_permissions rp join dk_roles r on r.id = rp.role_id where r.is_system and r.key = 'DELIVERY' and rp.permission_key = 'kitchen.view')::text);
insert into _t (area, test, expected, got) values ('Role', 'System DELIVERY role keeps dispatch.view and dispatch.deliver', '2',
  (select count(*)::text from dk_role_permissions rp join dk_roles r on r.id = rp.role_id where r.is_system and r.key = 'DELIVERY' and rp.permission_key in ('dispatch.view', 'dispatch.deliver')));

select pg_temp.act_as('00000000-0000-0000-0000-0000000d1e01', (select id from _ctx where key = 'A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Rider', 'Sees their assigned order', '1', (select count(*)::text from dk_orders where id = '40000000-0000-0000-0000-0000000d1e01')),
  ('Rider', 'Does not see another order', '0', (select count(*)::text from dk_orders where id = '40000000-0000-0000-0000-0000000d1e02')),
  ('Rider', 'Sees the address of their customer', 'Calle 1 # 2-3', (select address from dk_customers where id = '30000000-0000-0000-0000-0000000d1e01')),
  ('Rider', 'Does not see another customer', '0', (select count(*)::text from dk_customers where id = '30000000-0000-0000-0000-0000000d1e02')),
  ('Rider', 'Customer embedded in their order', 'Cliente Asignado',
    (select c.full_name from dk_orders o join dk_customers c on c.id = o.customer_id where o.id = '40000000-0000-0000-0000-0000000d1e01')),
  ('Rider', 'No kitchen.view in the account', 'false', dk_can('kitchen.view')::text);
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
