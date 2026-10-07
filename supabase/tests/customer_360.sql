-- ADR 0040: the customer 360° sheet — e-mail, the address history (never overwritten,
-- in step with dk_customers.address), preferences by id, complaints as a history,
-- recommendations, behaviour from the real orders, search by e-mail, and the
-- permissions (who reads, who writes, nobody from another account). Rolled back.
--
--   python3 supabase/tests/run.py customer_360

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
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.r(p_key text) returns jsonb language sql as $$ select v from _r where key = p_key $$;
create or replace function pg_temp.blocked(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return 'blocked'; end;
$$;
create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end;
$$;

insert into _ctx values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx values ('B', (select id from dk_kitchens where id <> pg_temp.k('A') order by created_at limit 1));
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000040a01', 'caja.ficha@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000040a02', 'cocina.ficha@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-000000040a01', '00000000-0000-0000-0000-000000040a01', 'Caja Ficha', true),
  ('10000000-0000-0000-0000-000000040a02', '00000000-0000-0000-0000-000000040a02', 'Cocina Ficha', true);
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
select pg_temp.k('A'), m.user_id, (select id from dk_roles where is_system and key = m.role_key)
from (values ('10000000-0000-0000-0000-000000040a01'::uuid, 'CASHIER'), ('10000000-0000-0000-0000-000000040a02'::uuid, 'KITCHEN')) m(user_id, role_key);

-- A customer with an address, two dishes, orders (one cancelled).
insert into dk_customers (id, kitchen_id, full_name, phone, address, email)
values ('30000000-0000-0000-0000-000000040a01', pg_temp.k('A'), 'Cliente Ficha', '3009990401', 'Calle 10 # 20-30', '  Ficha@Correo.COM ');
insert into dk_products (id, kitchen_id, name, price) values
  ('70000000-0000-0000-0000-000000040a01', pg_temp.k('A'), 'Plato Ficha Uno', 10000),
  ('70000000-0000-0000-0000-000000040a02', pg_temp.k('A'), 'Plato Ficha Dos', 11000);
insert into _ctx values ('dish1', '70000000-0000-0000-0000-000000040a01'), ('dish2', '70000000-0000-0000-0000-000000040a02');
insert into _ctx values ('ing', (select id from dk_ingredients where kitchen_id = pg_temp.k('A') order by name limit 1));
insert into dk_orders (id, kitchen_id, customer_id, status, subtotal, created_at) values
  ('40000000-0000-0000-0000-000000040a01', pg_temp.k('A'), '30000000-0000-0000-0000-000000040a01', 'ENTREGADO', 30000, now() - interval '20 days'),
  ('40000000-0000-0000-0000-000000040a02', pg_temp.k('A'), '30000000-0000-0000-0000-000000040a01', 'ENTREGADO', 20000, now() - interval '10 days'),
  ('40000000-0000-0000-0000-000000040a03', pg_temp.k('A'), '30000000-0000-0000-0000-000000040a01', 'CANCELADO', 99000, now() - interval '1 days');
-- Historical data as it is stored (the order guards forbid editing delivered orders; here it is only test data).
set local session_replication_role = replica;
insert into dk_order_items (order_id, kitchen_id, product_id, quantity, unit_price) values
  ('40000000-0000-0000-0000-000000040a01', pg_temp.k('A'), pg_temp.k('dish1'), 2, 10000),
  ('40000000-0000-0000-0000-000000040a01', pg_temp.k('A'), pg_temp.k('dish2'), 1, 10000),
  ('40000000-0000-0000-0000-000000040a02', pg_temp.k('A'), pg_temp.k('dish1'), 2, 10000),
  ('40000000-0000-0000-0000-000000040a03', pg_temp.k('A'), pg_temp.k('dish2'), 9, 11000);
set local session_replication_role = origin;

-- 1. E-mail and the address history (created by the trigger).
insert into _t (area, test, expected, got) values
  ('Email', 'Stored clean', 'ficha@correo.com', (select email from dk_customers where id = '30000000-0000-0000-0000-000000040a01')),
  ('Email', 'An invalid e-mail is rejected', 'blocked',
    pg_temp.blocked('update dk_customers set email = ''ficha@'' where id = ''30000000-0000-0000-0000-000000040a01''')),
  ('Address', 'The customer''s address is already in the history', '1',
    (select count(*)::text from dk_customer_addresses where customer_id = '30000000-0000-0000-0000-000000040a01'));

-- A new address from anywhere (here, as n8n or the edit form would): the old one stays.
update dk_customers set address = 'Carrera 5 # 6-7' where id = '30000000-0000-0000-0000-000000040a01';
update dk_customers set address = '  calle 10   # 20-30 ' where id = '30000000-0000-0000-0000-000000040a01';
insert into _t (area, test, expected, got) values
  ('Address', 'A new address adds a row; the old ones stay (never overwritten)', '2',
    (select count(*)::text from dk_customer_addresses where customer_id = '30000000-0000-0000-0000-000000040a01')),
  ('Address', 'The same address written differently is the same row, now the most recent', 'Calle 10 # 20-30',
    (select address from dk_customer_addresses where customer_id = '30000000-0000-0000-0000-000000040a01' order by last_used_at desc limit 1)),
  ('Address', 'Too short an address from outside never breaks saving the customer', 'ok',
    pg_temp.err('update dk_customers set address = ''x'' where id = ''30000000-0000-0000-0000-000000040a01'''));
update dk_customers set address = 'Calle 10 # 20-30' where id = '30000000-0000-0000-0000-000000040a01';

-- 2. As Caja (customers.edit): addresses, preferences, a complaint, a recommendation.
select pg_temp.act_as('00000000-0000-0000-0000-000000040a01', pg_temp.k('A'));
set local role authenticated;
insert into _ctx values ('addr-new', dk_customer_address_save('30000000-0000-0000-0000-000000040a01', null, 'Avenida 68 # 1-2', 'Torre 3, apto 501', 'Ana', 'Llamar al llegar', true, true));
insert into _ctx values ('addr-old', (select id from dk_customer_addresses where customer_id = '30000000-0000-0000-0000-000000040a01' and address = 'Carrera 5 # 6-7'));
insert into _r values ('archive-current', to_jsonb(pg_temp.err(format('select dk_customer_address_archive(%L)', pg_temp.k('addr-new')))));
insert into _r values ('archive-old', to_jsonb(pg_temp.err(format('select dk_customer_address_archive(%L)', pg_temp.k('addr-old')))));
insert into _r values ('edit-text', to_jsonb(dk_customer_address_save('30000000-0000-0000-0000-000000040a01', pg_temp.k('addr-new'), 'Avenida 68 # 1-20', null, null, null, false, false)));
insert into _r values ('direct-write', to_jsonb(pg_temp.blocked(format('insert into dk_customer_addresses (customer_id, address) values (%L, %L)', '30000000-0000-0000-0000-000000040a01', 'Calle falsa 123'))));

insert into dk_customer_preferences (customer_id, kind, product_id) values ('30000000-0000-0000-0000-000000040a01', 'favorite_dish', pg_temp.k('dish1'));
insert into dk_customer_preferences (customer_id, kind, ingredient_id) values ('30000000-0000-0000-0000-000000040a01', 'disliked_ingredient', pg_temp.k('ing'));
insert into dk_customer_preferences (customer_id, kind, label) values ('30000000-0000-0000-0000-000000040a01', 'dietary', 'Sin gluten');
insert into _r values ('pref-dup', to_jsonb(pg_temp.blocked(format('insert into dk_customer_preferences (customer_id, kind, product_id) values (%L, %L, %L)', '30000000-0000-0000-0000-000000040a01', 'favorite_dish', pg_temp.k('dish1')))));
insert into _r values ('pref-dish-text', to_jsonb(pg_temp.blocked(format('insert into dk_customer_preferences (customer_id, kind, label) values (%L, %L, %L)', '30000000-0000-0000-0000-000000040a01', 'favorite_dish', 'Hamburguesa'))));

insert into dk_customer_complaints (id, customer_id, order_id, category, description)
values ('60000000-0000-0000-0000-000000040a01', '30000000-0000-0000-0000-000000040a01', '40000000-0000-0000-0000-000000040a02', 'delay', 'Llegó 40 minutos tarde');
update dk_customer_complaints set status = 'resolved', resolution = 'Se dio un descuento en el siguiente pedido' where id = '60000000-0000-0000-0000-000000040a01';
insert into _r values ('complaint-rewrite', to_jsonb(pg_temp.err('update dk_customer_complaints set description = ''otra cosa'' where id = ''60000000-0000-0000-0000-000000040a01''')));
delete from dk_customer_complaints where id = '60000000-0000-0000-0000-000000040a01';
insert into _r values ('complaint-delete', to_jsonb(1 - (select count(*) from dk_customer_complaints where id = '60000000-0000-0000-0000-000000040a01')));
insert into _r values ('complaint-other-order', to_jsonb(pg_temp.err(format('insert into dk_customer_complaints (customer_id, order_id, category, description) values (%L, (select id from dk_orders where kitchen_id = %L and customer_id <> %L limit 1), %L, %L)',
  '30000000-0000-0000-0000-000000040a01', pg_temp.k('A'), '30000000-0000-0000-0000-000000040a01', 'quality', 'Pedido de otro'))));

insert into dk_customer_recommendations (customer_id, product_id, title, reason) values ('30000000-0000-0000-0000-000000040a01', pg_temp.k('dish2'), 'Ofrecer el combo', 'Pide siempre lo mismo');
insert into _r values ('rec-auto', to_jsonb(pg_temp.blocked(format('insert into dk_customer_recommendations (customer_id, title, source) values (%L, %L, %L)', '30000000-0000-0000-0000-000000040a01', 'Falsa', 'auto'))));

insert into _r values ('stats', dk_customer_order_stats('30000000-0000-0000-0000-000000040a01'));
insert into _r values ('profile', dk_customer_profile('30000000-0000-0000-0000-000000040a01'));
insert into _r values ('detail', dk_customer_detail('30000000-0000-0000-0000-000000040a01'));
insert into _r values ('search-email', dk_customers_list(p_search => 'ficha@correo'));
insert into _r values ('search-phone', dk_customers_list(p_search => '300 999 0401'));
reset role;

insert into _t (area, test, expected, got) values
  ('Address', 'Saved and made the last delivery address (orders read it)', 'Avenida 68 # 1-2', (select address from dk_customers where id = '30000000-0000-0000-0000-000000040a01')),
  ('Address', 'With its reference, recipient and notes', 'Torre 3, apto 501 · Ana · Llamar al llegar · true',
    (select concat_ws(' · ', reference, recipient_name, delivery_notes, is_frequent::text) from dk_customer_addresses where id = pg_temp.k('addr-new'))),
  ('Address', 'The last delivery address cannot be archived', 'Es la última dirección de envío: usa otra como última antes de archivarla.', pg_temp.r('archive-current') #>> '{}'),
  ('Address', 'An earlier one is archived (kept, not deleted)', 'ok · true',
    (pg_temp.r('archive-old') #>> '{}') || ' · ' || (select (archived_at is not null)::text from dk_customer_addresses where id = pg_temp.k('addr-old'))),
  ('Address', 'Changing the text is a NEW address; the old text stays', 'true · true',
    ((pg_temp.r('edit-text') #>> '{}')::uuid <> pg_temp.k('addr-new'))::text || ' · ' || exists (select 1 from dk_customer_addresses where id = pg_temp.k('addr-new') and address = 'Avenida 68 # 1-2')::text),
  ('Address', 'Nobody writes the history directly (only through the functions)', 'blocked', pg_temp.r('direct-write') #>> '{}'),
  ('Preferences', 'A favourite dish, a disliked ingredient and a dietary note, by id where possible', '3',
    (select count(*)::text from dk_customer_preferences where customer_id = '30000000-0000-0000-0000-000000040a01')),
  ('Preferences', 'The same favourite twice: rejected', 'blocked', pg_temp.r('pref-dup') #>> '{}'),
  ('Preferences', 'A favourite dish must be a dish of the catalog (not text)', 'blocked', pg_temp.r('pref-dish-text') #>> '{}'),
  ('Complaints', 'Resolved: the date and who resolved it are stamped', 'true · true',
    (select (resolved_at is not null)::text || ' · ' || (resolved_by = '10000000-0000-0000-0000-000000040a01')::text from dk_customer_complaints where id = '60000000-0000-0000-0000-000000040a01')),
  ('Complaints', 'What was reported cannot be rewritten', 'Lo que se reportó en una queja no se cambia: registra una nueva o agrega notas internas.', pg_temp.r('complaint-rewrite') #>> '{}'),
  ('Complaints', 'Nobody deletes a complaint', '0', pg_temp.r('complaint-delete') #>> '{}'),
  ('Complaints', 'The order must be the customer''s', 'Ese pedido no es de este cliente', pg_temp.r('complaint-other-order') #>> '{}'),
  ('Complaints', 'Its changes are in the activity log', 'true',
    (exists (select 1 from dk_audit_log where table_name = 'dk_customer_complaints' and record_id = '60000000-0000-0000-0000-000000040a01' and action = 'UPDATE'))::text),
  ('Recommendations', 'A manual one, yes; one posing as automatic, no', '1 · blocked',
    (select count(*)::text from dk_customer_recommendations where customer_id = '30000000-0000-0000-0000-000000040a01') || ' · ' || (pg_temp.r('rec-auto') #>> '{}')),
  ('Orders', 'Behaviour from the real orders (cancelled left out)', '2 · 2',
    (pg_temp.r('stats') ->> 'orders') || ' · ' || (pg_temp.r('stats') ->> 'ordersLast90Days')),
  ('Orders', 'Average days between orders', '10.0', pg_temp.r('stats') ->> 'avgDaysBetween'),
  ('Orders', 'The most ordered dish, by units (the cancelled 9 do not count)', '4',
    (select d ->> 'units' from jsonb_array_elements(pg_temp.r('stats') -> 'topDishes') d where (d ->> 'productId')::uuid = pg_temp.k('dish1'))),
  ('Orders', 'The last order is the last not cancelled', '40000000-0000-0000-0000-000000040a02', pg_temp.r('stats') #>> '{lastOrder,id}'),
  ('Search', 'The detail has the e-mail', 'ficha@correo.com', pg_temp.r('detail') ->> 'email'),
  ('Profile', 'One read with every section; the current address first', 'Avenida 68 # 1-2 · true',
    (pg_temp.r('profile') #>> '{addresses,0,address}') || ' · ' || (pg_temp.r('profile') #>> '{addresses,0,isCurrent}')),
  ('Profile', 'Preferences with their names (Caja reads the ingredient''s name without the inventory)', '3 · 0',
    jsonb_array_length(pg_temp.r('profile') -> 'preferences')::text || ' · ' ||
    (select count(*)::text from jsonb_array_elements(pg_temp.r('profile') -> 'preferences') f where f ->> 'name' is null)),
  ('Profile', 'Complaints with the order number and who registered it', 'true · Caja Ficha',
    ((pg_temp.r('profile') #>> '{complaints,0,orderNumber}') is not null)::text || ' · ' || (pg_temp.r('profile') #>> '{complaints,0,createdBy}')),
  ('Search', 'Found by e-mail', 'true', ((pg_temp.r('search-email') -> 'rows') @> '[{"id": "30000000-0000-0000-0000-000000040a01"}]'::jsonb)::text),
  ('Search', 'Found by phone typed with spaces (stored +57…)', 'true', ((pg_temp.r('search-phone') -> 'rows') @> '[{"id": "30000000-0000-0000-0000-000000040a01"}]'::jsonb)::text);

-- 3. Cocina (no customers.view): reads nothing; another account sees nothing.
select pg_temp.act_as('00000000-0000-0000-0000-000000040a02', pg_temp.k('A'));
set local role authenticated;
insert into _r values ('kitchen-read', to_jsonb((select count(*) from dk_customer_complaints) + (select count(*) from dk_customer_preferences) + (select count(*) from dk_customer_addresses)));
insert into _r values ('kitchen-stats', to_jsonb(pg_temp.blocked('select dk_customer_order_stats(''30000000-0000-0000-0000-000000040a01'')')));
insert into _r values ('kitchen-write', to_jsonb(pg_temp.blocked('insert into dk_customer_complaints (customer_id, category, description) values (''30000000-0000-0000-0000-000000040a01'', ''other'', ''Desde cocina'')')));
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000040a01', pg_temp.k('B'));
set local role authenticated;
insert into _r values ('other-account', to_jsonb(pg_temp.blocked(format('select dk_customer_address_save(%L, null, %L)', '30000000-0000-0000-0000-000000040a01', 'Calle de otra cuenta'))));
reset role;
insert into _t (area, test, expected, got) values
  ('Access', 'Cocina reads no customer data', '0', pg_temp.r('kitchen-read') #>> '{}'),
  ('Access', 'Cocina cannot see the behaviour', 'blocked', pg_temp.r('kitchen-stats') #>> '{}'),
  ('Access', 'Cocina cannot register a complaint', 'blocked', pg_temp.r('kitchen-write') #>> '{}'),
  ('Access', 'From another account (or without being a member there): nothing', 'blocked', pg_temp.r('other-account') #>> '{}');

select area, test, expected, got, case when expected is not distinct from got then 'PASS' else 'FAIL' end as result, detail from _t order by n;
rollback;
