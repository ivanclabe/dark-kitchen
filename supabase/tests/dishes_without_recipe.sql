-- ADR 0048: platos que no usan inventario. Se confirman sin receta y nunca
-- reservan ni descuentan; los que sí lo usan siguen exigiendo receta.
-- Transacción revertida.
--
--   python3 supabase/tests/run.py dishes_without_recipe

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid) on commit drop;
grant all on _t, _ctx to authenticated;
grant usage on sequence _t_n_seq to authenticated;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', (case when p_kitchen is null then '{}'::jsonb else jsonb_build_object('x-dk-kitchen-id', p_kitchen) end)::text, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
-- The error a call raises, or 'ALLOWED'.
create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return sqlerrm; end;
$$;
-- Movements of an ingredient (count · net quantity).
create or replace function pg_temp.moves(p_ingredient uuid) returns text language sql as $$
  select count(*)::text || ' · ' || coalesce(sum(quantity_base_unit), 0)::numeric(12, 0)::text
  from dk_inventory_movements where ingredient_id = p_ingredient and movement_type <> 'COMPRA'
$$;

-- An owner with her own account.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000048a01', 'duena.sinreceta@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-000000048a01', '00000000-0000-0000-0000-000000048a01', 'Dueña', true);
insert into dk_organizations (slug, name, owner_user_id, sector, category)
  values ('grupo-sin-receta', 'Grupo Sin Receta', '10000000-0000-0000-0000-000000048a01', 'fast_food', 'burgers');
insert into _ctx values ('org', (select id from dk_organizations where slug = 'grupo-sin-receta'));
insert into _ctx values ('owner', '00000000-0000-0000-0000-000000048a01');

select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin insert into _ctx values ('A', dk_create_kitchen('Centro', 'centro-sin-receta', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();

-- Catalog: a burger with a recipe (150 g of meat), a soda that does not use
-- inventory, a dish that uses it and has no recipe, and a dessert that does
-- not use inventory even though it has a recipe.
insert into dk_ingredients (id, code, name, base_unit_id, avg_cost, kitchen_id) values
  ('53000000-0000-0000-0000-000000048a01', 'SR-CARNE', 'Carne', (select id from dk_units where code = 'g'), 10, pg_temp.k('A'));
insert into dk_inventory_movements (ingredient_id, movement_type, quantity_base_unit, unit_cost, kitchen_id) values
  ('53000000-0000-0000-0000-000000048a01', 'COMPRA', 1000, 10, pg_temp.k('A'));
insert into dk_customers (id, full_name, kitchen_id) values ('30000000-0000-0000-0000-000000048a01', 'Cliente', pg_temp.k('A'));
insert into dk_products (id, code, name, price, kitchen_id, uses_inventory) values
  ('52000000-0000-0000-0000-000000048a01', 'SR-HAMB', 'Hamburguesa', 20000, pg_temp.k('A'), true),
  ('52000000-0000-0000-0000-000000048a02', 'SR-GASE', 'Gaseosa', 4000, pg_temp.k('A'), false),
  ('52000000-0000-0000-0000-000000048a03', 'SR-OLVI', 'Plato olvidado', 9000, pg_temp.k('A'), true),
  ('52000000-0000-0000-0000-000000048a04', 'SR-POST', 'Postre', 6000, pg_temp.k('A'), false);

select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_create_recipe_version('52000000-0000-0000-0000-000000048a01', '[{"ingredient_id": "53000000-0000-0000-0000-000000048a01", "quantity": 150}]');
  perform dk_create_recipe_version('52000000-0000-0000-0000-000000048a04', '[{"ingredient_id": "53000000-0000-0000-0000-000000048a01", "quantity": 50}]');
end $$;
reset role;
select pg_temp.as_owner();

insert into _t (area, test, expected, got) values ('Base', 'Un plato nuevo descuenta inventario por defecto', 'true',
  (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'dk_products' and column_name = 'uses_inventory'));
insert into _t (area, test, expected, got) values ('Base', 'Ningún plato existente cambió (todos descuentan inventario)', '0',
  (select count(*)::text from dk_products where not uses_inventory and kitchen_id <> pg_temp.k('A')));

-- Orders: O1 only the soda; O2 burger + soda + dessert; O3 the forgotten dish.
insert into dk_orders (id, customer_id, kitchen_id) values
  ('40000000-0000-0000-0000-000000048a01', '30000000-0000-0000-0000-000000048a01', pg_temp.k('A')),
  ('40000000-0000-0000-0000-000000048a02', '30000000-0000-0000-0000-000000048a01', pg_temp.k('A')),
  ('40000000-0000-0000-0000-000000048a03', '30000000-0000-0000-0000-000000048a01', pg_temp.k('A'));
insert into dk_order_items (id, order_id, product_id, quantity, unit_price, kitchen_id) values
  ('41000000-0000-0000-0000-000000048a01', '40000000-0000-0000-0000-000000048a01', '52000000-0000-0000-0000-000000048a02', 2, 4000, pg_temp.k('A')),
  ('41000000-0000-0000-0000-000000048a02', '40000000-0000-0000-0000-000000048a02', '52000000-0000-0000-0000-000000048a01', 2, 20000, pg_temp.k('A')),
  ('41000000-0000-0000-0000-000000048a03', '40000000-0000-0000-0000-000000048a02', '52000000-0000-0000-0000-000000048a02', 1, 4000, pg_temp.k('A')),
  ('41000000-0000-0000-0000-000000048a04', '40000000-0000-0000-0000-000000048a02', '52000000-0000-0000-0000-000000048a04', 1, 6000, pg_temp.k('A')),
  ('41000000-0000-0000-0000-000000048a05', '40000000-0000-0000-0000-000000048a03', '52000000-0000-0000-0000-000000048a03', 1, 9000, pg_temp.k('A'));

-- 1. Confirm and cook (as the owner, in her account).
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Confirmar', 'Pedido solo con un plato que no usa inventario', 'ALLOWED',
    pg_temp.err($q$select dk_confirm_order('40000000-0000-0000-0000-000000048a01')$q$));
  insert into _t (area, test, expected, got) values ('Confirmar', 'Pedido mixto (con receta, sin inventario y sin inventario con receta)', 'ALLOWED',
    pg_temp.err($q$select dk_confirm_order('40000000-0000-0000-0000-000000048a02')$q$));
  insert into _t (area, test, expected, got) values ('Confirmar', 'Plato que descuenta inventario y no tiene receta: se rechaza con su nombre', 'El plato «Plato olvidado» no tiene receta. Créala o apaga «Descuenta inventario» en el plato.',
    pg_temp.err($q$select dk_confirm_order('40000000-0000-0000-0000-000000048a03')$q$));
end $$;
reset role;
select pg_temp.as_owner();

insert into _t (area, test, expected, got) values ('Confirmar', 'O1 quedó confirmado', 'CONFIRMADO',
  (select status::text from dk_orders where id = '40000000-0000-0000-0000-000000048a01'));
insert into _t (area, test, expected, got) values ('Confirmar', 'O3 sigue nuevo', 'NUEVO',
  (select status::text from dk_orders where id = '40000000-0000-0000-0000-000000048a03'));
insert into _t (area, test, expected, got) values ('Reservas', 'O1 no reserva nada', '0',
  (select count(*)::text from dk_inventory_reservations r join dk_order_items i on i.id = r.order_item_id where i.order_id = '40000000-0000-0000-0000-000000048a01'));
insert into _t (area, test, expected, got) values ('Reservas', 'O2 reserva solo la hamburguesa (2 × 150 g)', '1 · 300',
  (select count(*)::text || ' · ' || sum(r.quantity_base_unit)::numeric(12, 0)::text from dk_inventory_reservations r join dk_order_items i on i.id = r.order_item_id where i.order_id = '40000000-0000-0000-0000-000000048a02'));
insert into _t (area, test, expected, got) values ('Reservas', 'El postre con receta pero sin inventario no congela receta', 'sin receta',
  (select case when recipe_id is null then 'sin receta' else 'con receta' end from dk_order_items where id = '41000000-0000-0000-0000-000000048a04'));
insert into _t (area, test, expected, got) values ('Reservas', 'La hamburguesa congela su receta', 'con receta',
  (select case when recipe_id is null then 'sin receta' else 'con receta' end from dk_order_items where id = '41000000-0000-0000-0000-000000048a02'));
insert into _t (area, test, expected, got) values ('Reservas', 'Stock disponible baja solo por la hamburguesa', '700',
  (select stock_available::numeric(12, 0)::text from dk_ingredient_stock where ingredient_id = '53000000-0000-0000-0000-000000048a01'));

-- 2. Cook: the soda (two steps → Listo), revert it and cook it again; then the whole of O2.
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000048a01');
  perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000048a01');
  perform dk_revert_kitchen_item('41000000-0000-0000-0000-000000048a01');
  perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000048a01');
  perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000048a03');
  perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000048a03');
  perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000048a04');
  perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000048a04');
end $$;
reset role;
select pg_temp.as_owner();

insert into _t (area, test, expected, got) values ('Cocina', 'O1 llega a Listo', 'LISTO',
  (select status::text from dk_orders where id = '40000000-0000-0000-0000-000000048a01'));
insert into _t (area, test, expected, got) values ('Cocina', 'Preparar, retroceder y volver a preparar sin inventario: cero movimientos', '0 · 0',
  pg_temp.moves('53000000-0000-0000-0000-000000048a01'));
insert into _t (area, test, expected, got) values ('Cocina', 'O2: la hamburguesa sigue reservada (aún no está lista)', 'ACTIVE',
  (select string_agg(distinct status::text, ',') from dk_inventory_reservations where order_item_id = '41000000-0000-0000-0000-000000048a02'));

select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000048a02');
  perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000048a02');
end $$;
reset role;
select pg_temp.as_owner();

insert into _t (area, test, expected, got) values ('Cocina', 'O2 listo: solo se descuenta la hamburguesa (1 consumo de 300 g)', '1 · -300',
  pg_temp.moves('53000000-0000-0000-0000-000000048a01'));

-- 3. Cancel: a confirmed order that does not use inventory releases nothing and moves nothing.
insert into dk_orders (id, customer_id, kitchen_id) values
  ('40000000-0000-0000-0000-000000048a04', '30000000-0000-0000-0000-000000048a01', pg_temp.k('A'));
insert into dk_order_items (id, order_id, product_id, quantity, unit_price, kitchen_id) values
  ('41000000-0000-0000-0000-000000048a06', '40000000-0000-0000-0000-000000048a04', '52000000-0000-0000-0000-000000048a02', 1, 4000, pg_temp.k('A'));
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_confirm_order('40000000-0000-0000-0000-000000048a04');
  perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000048a06');
  perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000048a06');
  perform dk_cancel_order('40000000-0000-0000-0000-000000048a04', 'prueba');
end $$;
reset role;
select pg_temp.as_owner();

insert into _t (area, test, expected, got) values ('Cancelar', 'Cancelar un pedido listo sin inventario: cancelado', 'CANCELADO',
  (select status::text from dk_orders where id = '40000000-0000-0000-0000-000000048a04'));
insert into _t (area, test, expected, got) values ('Cancelar', '… sin devolución ni movimientos nuevos', '1 · -300',
  pg_temp.moves('53000000-0000-0000-0000-000000048a01'));
insert into _t (area, test, expected, got) values ('Cancelar', '… y sin marcarlo para revisar', 'false',
  (select requires_review::text from dk_orders where id = '40000000-0000-0000-0000-000000048a04'));

-- 4. Turning «Descuenta inventario» off lets the forgotten dish through.
update dk_products set uses_inventory = false where id = '52000000-0000-0000-0000-000000048a03';
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Confirmar', 'Al apagar «Descuenta inventario» el plato olvidado se confirma', 'ALLOWED',
    pg_temp.err($q$select dk_confirm_order('40000000-0000-0000-0000-000000048a03')$q$));
end $$;
reset role;
select pg_temp.as_owner();

-- 5. Copilot: no recipe → no cost and no margin (before it said 100 %).
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v jsonb := dk_copilot_products(null, null, 40);
begin
  insert into _t (area, test, expected, got) values ('Copilot', 'Gaseosa: sin receta → margen vacío, no usa inventario', 'null · null · false · false',
    (select coalesce(p ->> 'marginPct', 'null') || ' · ' || coalesce(p ->> 'estimatedCost', 'null') || ' · ' || (p ->> 'usesInventory') || ' · ' || (p ->> 'hasRecipe')
     from jsonb_array_elements(v -> 'products') p where p ->> 'name' = 'Gaseosa'));
  insert into _t (area, test, expected, got) values ('Copilot', 'Hamburguesa: margen calculado (costo 1500 de 20000)', '92.5 · true',
    (select (p ->> 'marginPct') || ' · ' || (p ->> 'usesInventory') from jsonb_array_elements(v -> 'products') p where p ->> 'name' = 'Hamburguesa'));
end $$;
reset role;
select pg_temp.as_owner();

-- 6. Permissions unchanged: someone outside the account cannot confirm.
insert into auth.users (id, email, aud, role) values ('00000000-0000-0000-0000-000000048aff', 'ajeno.sinreceta@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values ('10000000-0000-0000-0000-000000048aff', '00000000-0000-0000-0000-000000048aff', 'Ajeno', true);
insert into dk_orders (id, customer_id, kitchen_id) values
  ('40000000-0000-0000-0000-000000048a05', '30000000-0000-0000-0000-000000048a01', pg_temp.k('A'));
insert into dk_order_items (order_id, product_id, quantity, unit_price, kitchen_id) values
  ('40000000-0000-0000-0000-000000048a05', '52000000-0000-0000-0000-000000048a02', 1, 4000, pg_temp.k('A'));
select pg_temp.act_as('00000000-0000-0000-0000-000000048aff', pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Permisos', 'Alguien de otra cuenta no puede confirmar', 'blocked',
    case when pg_temp.err($q$select dk_confirm_order('40000000-0000-0000-0000-000000048a05')$q$) = 'ALLOWED' then 'ALLOWED' else 'blocked' end);
end $$;
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Permisos', '… y el pedido sigue nuevo', 'NUEVO',
  (select status::text from dk_orders where id = '40000000-0000-0000-0000-000000048a05'));

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
