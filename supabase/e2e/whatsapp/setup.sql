\set ON_ERROR_STOP on
insert into dk_users (id, auth_user_id, full_name, active, email)
select '10000000-0000-0000-0000-00000000e2e1', id, 'Laura Gómez', true, email from auth.users where email = 'laura@negocio.co'
on conflict do nothing;
insert into dk_organizations (slug, name, owner_user_id, sector, category) values ('negocio-e2e', 'Negocio E2E', '10000000-0000-0000-0000-00000000e2e1', 'fast_food', 'burgers');
select set_config('request.jwt.claims', json_build_object('sub', (select auth_user_id from dk_users where id = '10000000-0000-0000-0000-00000000e2e1'), 'role', 'authenticated')::text, false);
set role authenticated;
select dk_create_kitchen('Sopas E2E', 'sopas-e2e', 'America/Bogota', null, (select id from dk_organizations where slug = 'negocio-e2e')) as kitchen \gset
reset role;
update dk_subscriptions set plan_key = 'business' where organization_id = (select id from dk_organizations where slug = 'negocio-e2e');
insert into dk_products (id, kitchen_id, code, name, price, uses_inventory) values
  ('52000000-0000-0000-0000-00000000e2e1', :'kitchen', 'SOPA', 'Sopa de la casa', 12000, false),
  ('52000000-0000-0000-0000-00000000e2e2', :'kitchen', 'JUGO', 'Jugo de lulo', 5000, false);
insert into dk_menu_plan_items (kitchen_id, plan_date, product_id, display_order, is_active) values
  (:'kitchen', (now() at time zone 'America/Bogota')::date, '52000000-0000-0000-0000-00000000e2e1', 1, true),
  (:'kitchen', (now() at time zone 'America/Bogota')::date, '52000000-0000-0000-0000-00000000e2e2', 2, true);
select :'kitchen' as kitchen_id;
