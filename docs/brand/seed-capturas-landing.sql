\set ON_ERROR_STOP on
\set kitchen '4efd6f28-6d81-45c9-8bd6-ac7dec032bd2'
insert into dk_products (id, kitchen_id, code, name, price, category_id, uses_inventory, description) values
  ('52000000-0000-0000-0000-00000000f301', :'kitchen', 'HAMB', 'Hamburguesa de la casa', 22000, '51000000-0000-0000-0000-00000000e2e1', false, 'Carne de res, queso, tocineta y papas a la francesa.'),
  ('52000000-0000-0000-0000-00000000f302', :'kitchen', 'BAND', 'Bandeja paisa', 28000, '51000000-0000-0000-0000-00000000e2e1', false, 'Frijoles, arroz, carne molida, chicharrón, huevo, maduro y arepa.'),
  ('52000000-0000-0000-0000-00000000f303', :'kitchen', 'AJIA', 'Ajiaco santafereño', 24000, '51000000-0000-0000-0000-00000000e2e1', false, 'Con pollo desmechado, mazorca, crema y alcaparras.'),
  ('52000000-0000-0000-0000-00000000f304', :'kitchen', 'SALC', 'Salchipapa', 15000, '51000000-0000-0000-0000-00000000e2e3', false, 'Papas, salchicha y salsas de la casa.'),
  ('52000000-0000-0000-0000-00000000f305', :'kitchen', 'JUGO', 'Jugo de mora en agua', 6000, '51000000-0000-0000-0000-00000000e2e2', false, 'Natural, sin conservantes.');
insert into dk_menu_plan_items (kitchen_id, plan_date, product_id, display_order, is_active)
select :'kitchen', (now() at time zone 'America/Bogota')::date, p, 3 + n, true
from unnest(array['52000000-0000-0000-0000-00000000f301'::uuid, '52000000-0000-0000-0000-00000000f302', '52000000-0000-0000-0000-00000000f303', '52000000-0000-0000-0000-00000000f304', '52000000-0000-0000-0000-00000000f305']) with ordinality u(p, n);

-- Fictional customers and orders (Laura Gómez is the local test user; the rest are invented).
insert into dk_customers (id, kitchen_id, full_name) values
  ('30000000-0000-0000-0000-00000000f001', :'kitchen', 'Andrés Pérez'),
  ('30000000-0000-0000-0000-00000000f002', :'kitchen', 'Valentina Ríos'),
  ('30000000-0000-0000-0000-00000000f003', :'kitchen', 'Camilo Duarte'),
  ('30000000-0000-0000-0000-00000000f004', :'kitchen', 'Sofía Martínez'),
  ('30000000-0000-0000-0000-00000000f005', :'kitchen', 'Mateo Castaño'),
  ('30000000-0000-0000-0000-00000000f006', :'kitchen', 'Isabella Torres'),
  ('30000000-0000-0000-0000-00000000f007', :'kitchen', 'Julián Herrera'),
  ('30000000-0000-0000-0000-00000000f008', :'kitchen', 'Daniela Ortiz');
insert into dk_orders (id, kitchen_id, customer_id, channel, created_at) values
  ('40000000-0000-0000-0000-00000000f001', :'kitchen', '30000000-0000-0000-0000-00000000f001', 'WHATSAPP', now() - interval '3 min'),
  ('40000000-0000-0000-0000-00000000f002', :'kitchen', '30000000-0000-0000-0000-00000000f002', 'WEB', now() - interval '1 min'),
  ('40000000-0000-0000-0000-00000000f003', :'kitchen', '30000000-0000-0000-0000-00000000f003', 'MANUAL', now() - interval '6 min'),
  ('40000000-0000-0000-0000-00000000f004', :'kitchen', '30000000-0000-0000-0000-00000000f004', 'WEB', now() - interval '9 min'),
  ('40000000-0000-0000-0000-00000000f005', :'kitchen', '30000000-0000-0000-0000-00000000f005', 'WHATSAPP', now() - interval '14 min'),
  ('40000000-0000-0000-0000-00000000f006', :'kitchen', '30000000-0000-0000-0000-00000000f006', 'PHONE', now() - interval '18 min'),
  ('40000000-0000-0000-0000-00000000f007', :'kitchen', '30000000-0000-0000-0000-00000000f007', 'WEB', now() - interval '22 min'),
  ('40000000-0000-0000-0000-00000000f008', :'kitchen', '30000000-0000-0000-0000-00000000f008', 'MANUAL', now() - interval '26 min');
insert into dk_order_items (order_id, product_id, quantity, unit_price) values
  ('40000000-0000-0000-0000-00000000f001', '52000000-0000-0000-0000-00000000f301', 2, 22000),
  ('40000000-0000-0000-0000-00000000f001', '52000000-0000-0000-0000-00000000f305', 2, 6000),
  ('40000000-0000-0000-0000-00000000f002', '52000000-0000-0000-0000-00000000f303', 1, 24000),
  ('40000000-0000-0000-0000-00000000f003', '52000000-0000-0000-0000-00000000f302', 1, 28000),
  ('40000000-0000-0000-0000-00000000f004', '52000000-0000-0000-0000-00000000f304', 3, 15000),
  ('40000000-0000-0000-0000-00000000f005', '52000000-0000-0000-0000-00000000f301', 1, 22000),
  ('40000000-0000-0000-0000-00000000f005', '52000000-0000-0000-0000-00000000f305', 1, 6000),
  ('40000000-0000-0000-0000-00000000f006', '52000000-0000-0000-0000-00000000f303', 2, 24000),
  ('40000000-0000-0000-0000-00000000f007', '52000000-0000-0000-0000-00000000f302', 1, 28000),
  ('40000000-0000-0000-0000-00000000f008', '52000000-0000-0000-0000-00000000f304', 1, 15000);
select set_config('request.jwt.claims', json_build_object('sub', (select auth_user_id from dk_users where id = '10000000-0000-0000-0000-00000000e2e1'), 'role', 'authenticated')::text, false);
select set_config('request.headers', json_build_object('x-dk-kitchen-id', :'kitchen')::text, false);
set role authenticated;
-- f001, f002: por confirmar. f003..f008: confirmados; f005, f006 en preparación; f007, f008 listos.
select dk_confirm_order(id) from dk_orders where id in ('40000000-0000-0000-0000-00000000f003','40000000-0000-0000-0000-00000000f004','40000000-0000-0000-0000-00000000f005','40000000-0000-0000-0000-00000000f006','40000000-0000-0000-0000-00000000f007','40000000-0000-0000-0000-00000000f008');
select dk_advance_kitchen_item(id) from dk_order_items where order_id in ('40000000-0000-0000-0000-00000000f005','40000000-0000-0000-0000-00000000f006','40000000-0000-0000-0000-00000000f007','40000000-0000-0000-0000-00000000f008');
select dk_advance_kitchen_item(id) from dk_order_items where order_id in ('40000000-0000-0000-0000-00000000f007','40000000-0000-0000-0000-00000000f008');
reset role;
select o.status, count(*) from dk_orders o where kitchen_id = :'kitchen' group by 1;
