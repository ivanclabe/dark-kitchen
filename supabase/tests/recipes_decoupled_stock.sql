-- ADR 0069: recipes that do not depend on stock, ingredients created from a recipe, and the inventory deducted
-- when each dish starts its preparation — once, whatever repeats. Transacción revertida.
--
--   python3 supabase/tests/run.py recipes_decoupled_stock

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
create or replace function pg_temp.unit(p_code text) returns uuid language sql as $$ select id from dk_units where code = p_code $$;
-- The error a call raises, or 'ALLOWED'.
create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return sqlerrm; end;
$$;
-- The hint of the error a call raises.
create or replace function pg_temp.hint(p_sql text) returns text language plpgsql as $$
declare v_hint text;
begin execute p_sql; return 'ALLOWED';
exception when others then get stacked diagnostics v_hint = pg_exception_hint; return coalesce(v_hint, '(sin hint)'); end;
$$;
-- Stock of an ingredient: on hand · reserved.
create or replace function pg_temp.stock(p_ingredient uuid) returns text language sql as $$
  select coalesce((select stock_on_hand::numeric(12, 0)::text || ' · ' || stock_reserved::numeric(12, 0)::text
                   from dk_ingredient_stock where ingredient_id = p_ingredient), 'sin fila')
$$;
-- Order-related movements of an ingredient: count by type and net quantity.
create or replace function pg_temp.moves(p_ingredient uuid) returns text language sql as $$
  select coalesce(string_agg(t, ' '), '—') from (
    select movement_type || '×' || count(*) as t from dk_inventory_movements
    where ingredient_id = p_ingredient and movement_type in ('CONSUMO', 'DEVOLUCION')
    group by movement_type order by movement_type
  ) s
$$;
create or replace function pg_temp.net(p_ingredient uuid) returns text language sql as $$
  select coalesce(sum(quantity_base_unit), 0)::numeric(12, 0)::text from dk_inventory_movements
  where ingredient_id = p_ingredient and movement_type in ('CONSUMO', 'DEVOLUCION')
$$;

-- An owner with her account; a cook (Cocina) and a recipe writer (a custom role that only edits recipes).
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000069a01', 'duena.recetas@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000069a02', 'cocina.recetas@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000069a03', 'recetario.recetas@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-000000069a01', '00000000-0000-0000-0000-000000069a01', 'Dueña', true),
  ('10000000-0000-0000-0000-000000069a02', '00000000-0000-0000-0000-000000069a02', 'Cocinero', true),
  ('10000000-0000-0000-0000-000000069a03', '00000000-0000-0000-0000-000000069a03', 'Recetario', true);
insert into dk_organizations (slug, name, owner_user_id, sector, category)
  values ('grupo-recetas', 'Grupo Recetas', '10000000-0000-0000-0000-000000069a01', 'fast_food', 'burgers');
insert into _ctx values ('org', (select id from dk_organizations where slug = 'grupo-recetas'));
insert into _ctx values ('owner', '00000000-0000-0000-0000-000000069a01');
insert into _ctx values ('cook', '00000000-0000-0000-0000-000000069a02');
insert into _ctx values ('writer', '00000000-0000-0000-0000-000000069a03');

select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin insert into _ctx values ('A', dk_create_kitchen('Centro', 'centro-recetas', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();

insert into dk_roles (id, key, name, organization_id) values
  ('70000000-0000-0000-0000-000000069a01', 'RECETARIO', 'RECETARIO', pg_temp.k('org'));
insert into dk_role_permissions (role_id, permission_key) values
  ('70000000-0000-0000-0000-000000069a01', 'recipes.view'), ('70000000-0000-0000-0000-000000069a01', 'recipes.edit');
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
  select pg_temp.k('A'), '10000000-0000-0000-0000-000000069a02', id from dk_roles where is_system and key = 'KITCHEN';
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
  values (pg_temp.k('A'), '10000000-0000-0000-0000-000000069a03', '70000000-0000-0000-0000-000000069a01');

insert into dk_suppliers (id, kitchen_id, name) values ('60000000-0000-0000-0000-000000069a01', pg_temp.k('A'), 'Proveedor');
insert into dk_customers (id, full_name, kitchen_id) values ('30000000-0000-0000-0000-000000069a01', 'Cliente', pg_temp.k('A'));
insert into dk_products (id, code, name, price, kitchen_id) values
  ('52000000-0000-0000-0000-000000069a01', 'RD-SAND', 'Sándwich de queso', 12000, pg_temp.k('A'));

-- 1. Ingredients: one with stock already (bread), one created from the recipe (cheese).
insert into dk_ingredients (id, code, name, base_unit_id, avg_cost, kitchen_id) values
  ('53000000-0000-0000-0000-000000069a01', 'RD-PAN', 'Pan', pg_temp.unit('unidad'), 500, pg_temp.k('A'));
insert into dk_inventory_movements (ingredient_id, movement_type, quantity_base_unit, unit_cost, kitchen_id) values
  ('53000000-0000-0000-0000-000000069a01', 'COMPRA', 10, 500, pg_temp.k('A'));

select pg_temp.act_as(pg_temp.k('writer'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _ctx values ('queso', dk_create_ingredient('Queso doble crema', pg_temp.unit('g')));
  insert into _t (area, test, expected, got) values ('Insumos', 'Quien solo edita recetas crea el insumo que su receta necesita', 'creado',
    case when pg_temp.k('queso') is not null then 'creado' else 'no' end);
  insert into _t (area, test, expected, got) values ('Insumos', 'Mismo nombre con otras mayúsculas, tildes y espacios: rechazado', 'duplicate_ingredient',
    pg_temp.hint($q$select dk_create_ingredient('  queso DOBLE crémá ', pg_temp.unit('g'))$q$));
  insert into _t (area, test, expected, got) values ('Insumos', 'El duplicado dice cuál ya existe', 'Ya existe «Queso doble crema» (código INS-002). Elígelo de la lista.',
    pg_temp.err($q$select dk_create_ingredient('queso doble crema', pg_temp.unit('kg'))$q$));
  insert into _t (area, test, expected, got) values ('Insumos', 'Una caja no es unidad base', 'base_unit',
    pg_temp.hint($q$select dk_create_ingredient('Servilletas', pg_temp.unit('caja'))$q$));
  insert into _t (area, test, expected, got) values ('Insumos', 'Sin nombre: rechazado', 'name_required',
    pg_temp.hint($q$select dk_create_ingredient('   ', pg_temp.unit('g'))$q$));
  insert into _t (area, test, expected, got) values ('Insumos', 'Stock máximo menor que el mínimo: rechazado', 'stock_limits',
    pg_temp.hint($q$select dk_create_ingredient('Tomate', pg_temp.unit('g'), null, null, 500, 100)$q$));
  insert into _t (area, test, expected, got) values ('Insumos', 'Código repetido: rechazado', 'duplicate_code',
    pg_temp.hint($q$select dk_create_ingredient('Tomate', pg_temp.unit('g'), 'rd-pan')$q$));
end $$;
reset role;
select pg_temp.as_owner();

select pg_temp.act_as(pg_temp.k('cook'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Insumos', 'Cocina (ni recetas ni insumos) no crea insumos', 'No autorizado para crear insumos',
    pg_temp.err($q$select dk_create_ingredient('Tomate', pg_temp.unit('g'))$q$));
end $$;
reset role;
select pg_temp.as_owner();

insert into _t (area, test, expected, got) values ('Insumos', 'El código se genera solo', 'INS-002',
  (select code from dk_ingredients where id = pg_temp.k('queso')));
insert into _t (area, test, expected, got) values ('Insumos', 'Queda en el inventario con existencia cero (en mano · reservado)', '0 · 0',
  pg_temp.stock(pg_temp.k('queso')));
insert into _t (area, test, expected, got) values ('Insumos', 'Crearlo no genera movimientos ni compras', '0',
  (select (select count(*) from dk_inventory_movements where ingredient_id = pg_temp.k('queso'))
        + (select count(*) from dk_purchase_items where ingredient_id = pg_temp.k('queso')))::text);
insert into _t (area, test, expected, got) values ('Insumos', 'Todos los insumos tienen su fila de stock', '0',
  (select count(*)::text from dk_ingredients i where not exists (select 1 from dk_ingredient_stock s where s.ingredient_id = i.id)));

-- Renaming onto another name is refused too.
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Insumos', 'Renombrar «Pan» como «Queso doble crema»: rechazado', 'duplicate_ingredient',
    pg_temp.hint($q$update dk_ingredients set name = 'QUESO doble crema' where id = '53000000-0000-0000-0000-000000069a01'$q$));
  insert into _t (area, test, expected, got) values ('Insumos', 'Renombrar «Pan» a «Pan blanco»: permitido', 'ALLOWED',
    pg_temp.err($q$update dk_ingredients set name = 'Pan blanco' where id = '53000000-0000-0000-0000-000000069a01'$q$));
end $$;
reset role;
select pg_temp.as_owner();

-- 2. The recipe: 1 bread + 50 g of cheese (zero stock) saves without asking for stock.
select pg_temp.act_as(pg_temp.k('writer'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Receta', 'Se guarda con un insumo que existe y uno nuevo sin existencias', 'ALLOWED',
    pg_temp.err(format($q$select dk_create_recipe_version('52000000-0000-0000-0000-000000069a01',
      '[{"ingredient_id": "53000000-0000-0000-0000-000000069a01", "quantity": 1}, {"ingredient_id": "%s", "quantity": 0.05, "unit_id": "%s"}]')$q$,
      pg_temp.k('queso'), pg_temp.unit('kg'))));
end $$;
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Receta', 'Conserva su cantidad y unidad (50 g escritos como 0,05 kg)', '50 · 0.05 kg',
  (select ri.quantity::numeric(12, 0)::text || ' · ' || ri.unit_quantity::text || ' ' || u.code
   from dk_recipe_items ri join dk_units u on u.id = ri.unit_id where ri.ingredient_id = pg_temp.k('queso')));
insert into _t (area, test, expected, got) values ('Receta', 'Guardar la receta no movió el inventario', '—',
  pg_temp.moves(pg_temp.k('queso')));

-- 3. Orders: confirming still checks the stock (decided: validate at confirm and at start).
insert into dk_orders (id, customer_id, kitchen_id) values
  ('40000000-0000-0000-0000-000000069a01', '30000000-0000-0000-0000-000000069a01', pg_temp.k('A')),
  ('40000000-0000-0000-0000-000000069a02', '30000000-0000-0000-0000-000000069a01', pg_temp.k('A')),
  ('40000000-0000-0000-0000-000000069a03', '30000000-0000-0000-0000-000000069a01', pg_temp.k('A'));
insert into dk_order_items (id, order_id, product_id, quantity, unit_price, kitchen_id) values
  ('41000000-0000-0000-0000-000000069a01', '40000000-0000-0000-0000-000000069a01', '52000000-0000-0000-0000-000000069a01', 2, 12000, pg_temp.k('A')),
  ('41000000-0000-0000-0000-000000069a02', '40000000-0000-0000-0000-000000069a02', '52000000-0000-0000-0000-000000069a01', 1, 12000, pg_temp.k('A')),
  ('41000000-0000-0000-0000-000000069a03', '40000000-0000-0000-0000-000000069a03', '52000000-0000-0000-0000-000000069a01', 1, 12000, pg_temp.k('A'));

select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Confirmar', 'Sin queso todavía: el pedido no se confirma', 'insufficient_stock',
    pg_temp.hint($q$select dk_confirm_order('40000000-0000-0000-0000-000000069a01')$q$));
end $$;
reset role;
select pg_temp.as_owner();

-- 4. A purchase brings 1 kg of cheese at $40 per g.
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ declare v_p uuid; begin
  insert into dk_purchases (supplier_id, invoice_number, invoice_date) values ('60000000-0000-0000-0000-000000069a01', 'RD-1', current_date) returning id into v_p;
  insert into dk_purchase_items (purchase_id, ingredient_id, quantity, purchase_unit_id, unit_cost) values (v_p, pg_temp.k('queso'), 1, pg_temp.unit('kg'), 40000);
  perform dk_confirm_purchase(v_p, '{"mode": "credit"}');
end $$;
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Compra', 'La compra sube la existencia (1 kg = 1000 g)', '1000 · 0', pg_temp.stock(pg_temp.k('queso')));
insert into _t (area, test, expected, got) values ('Compra', 'Y fija su costo promedio ($40 por g)', '40',
  (select avg_cost::numeric(12, 0)::text from dk_ingredients where id = pg_temp.k('queso')));

-- 5. Confirm reserves (nothing leaves); starting the dish deducts; Listo moves nothing.
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_confirm_order('40000000-0000-0000-0000-000000069a01');
end $$;
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Confirmar', 'Confirmar 2 sándwiches reserva 100 g y no descuenta', '1000 · 100', pg_temp.stock(pg_temp.k('queso')));
insert into _t (area, test, expected, got) values ('Confirmar', 'Ningún consumo al confirmar', '—', pg_temp.moves(pg_temp.k('queso')));

select pg_temp.act_as(pg_temp.k('cook'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000069a01');
end $$;
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Cocina', 'Al empezar a prepararlo se descuenta: 900 en mano, nada reservado', '900 · 0', pg_temp.stock(pg_temp.k('queso')));
insert into _t (area, test, expected, got) values ('Cocina', 'Un consumo de queso y uno de pan', 'CONSUMO×1 · CONSUMO×1',
  pg_temp.moves(pg_temp.k('queso')) || ' · ' || pg_temp.moves('53000000-0000-0000-0000-000000069a01'));
insert into _t (area, test, expected, got) values ('Cocina', 'Por el número de unidades del plato (2 × 1 pan)', '8 · 0',
  pg_temp.stock('53000000-0000-0000-0000-000000069a01'));
insert into _t (area, test, expected, got) values ('Cocina', 'El consumo vale al costo promedio', '40',
  (select unit_cost::numeric(12, 0)::text from dk_inventory_movements where ingredient_id = pg_temp.k('queso') and movement_type = 'CONSUMO'));

select pg_temp.act_as(pg_temp.k('cook'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000069a01');
  insert into _t (area, test, expected, got) values ('Cocina', 'Marcarlo listo otra vez: rechazado', 'El pedido debe estar CONFIRMADO o EN_PREPARACION (actual LISTO)',
    pg_temp.err($q$select dk_advance_kitchen_item('41000000-0000-0000-0000-000000069a01')$q$));
end $$;
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Cocina', 'Marcarlo listo no mueve nada más', 'CONSUMO×1 · 900 · 0',
  pg_temp.moves(pg_temp.k('queso')) || ' · ' || pg_temp.stock(pg_temp.k('queso')));

-- 6. Sent back: Listo → Preparando moves nothing; → Pendiente gives it back once and reserves it again.
select pg_temp.act_as(pg_temp.k('cook'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_revert_kitchen_item('41000000-0000-0000-0000-000000069a01');
end $$;
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Retroceso', 'De Listo a Preparando: sin movimientos', 'CONSUMO×1 · 900 · 0',
  pg_temp.moves(pg_temp.k('queso')) || ' · ' || pg_temp.stock(pg_temp.k('queso')));

select pg_temp.act_as(pg_temp.k('cook'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_revert_kitchen_item('41000000-0000-0000-0000-000000069a01');
end $$;
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Retroceso', 'A Pendiente: vuelve una vez y queda reservado otra vez', 'CONSUMO×1 DEVOLUCION×1 · 1000 · 100',
  pg_temp.moves(pg_temp.k('queso')) || ' · ' || pg_temp.stock(pg_temp.k('queso')));
insert into _t (area, test, expected, got) values ('Retroceso', 'El pedido pide revisión', 'true',
  (select requires_review::text from dk_orders where id = '40000000-0000-0000-0000-000000069a01'));

select pg_temp.act_as(pg_temp.k('cook'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000069a01');
end $$;
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Retroceso', 'Empezarlo otra vez lo descuenta una vez más', 'CONSUMO×2 DEVOLUCION×1 · 900 · 0',
  pg_temp.moves(pg_temp.k('queso')) || ' · ' || pg_temp.stock(pg_temp.k('queso')));
insert into _t (area, test, expected, got) values ('Retroceso', 'Neto: un solo consumo (−100 g)', '-100', pg_temp.net(pg_temp.k('queso')));

-- 7. Cancel after it started: given back once, the review kept; cancelling again is refused.
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_cancel_order('40000000-0000-0000-0000-000000069a01', 'El cliente se fue');
  insert into _t (area, test, expected, got) values ('Cancelar', 'Cancelar dos veces: rechazado', 'No se puede cancelar un pedido en estado CANCELADO',
    pg_temp.err($q$select dk_cancel_order('40000000-0000-0000-0000-000000069a01')$q$));
end $$;
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Cancelar', 'Lo consumido vuelve una sola vez: el inventario queda como al inicio', '0 · 1000 · 0',
  pg_temp.net(pg_temp.k('queso')) || ' · ' || pg_temp.stock(pg_temp.k('queso')));
insert into _t (area, test, expected, got) values ('Cancelar', 'Ninguna reserva queda activa ni consumida', '0',
  (select count(*)::text from dk_inventory_reservations where order_item_id = '41000000-0000-0000-0000-000000069a01' and status <> 'RELEASED'));
insert into _t (area, test, expected, got) values ('Cancelar', 'La revisión se conserva', 'true',
  (select requires_review::text from dk_orders where id = '40000000-0000-0000-0000-000000069a01'));

-- 8. Started, sent back to Pendiente and cancelled: only released, nothing given back twice.
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_confirm_order('40000000-0000-0000-0000-000000069a02');
  perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000069a02');
  perform dk_revert_kitchen_item('41000000-0000-0000-0000-000000069a02');
  perform dk_cancel_order('40000000-0000-0000-0000-000000069a02');
end $$;
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Cancelar', 'Empezado, devuelto a pendiente y cancelado: una devolución, no dos', '1 · 1',
  (select count(*) filter (where movement_type = 'CONSUMO')::text || ' · ' || count(*) filter (where movement_type = 'DEVOLUCION')::text
   from dk_inventory_movements where ingredient_id = pg_temp.k('queso') and (reference_id = '41000000-0000-0000-0000-000000069a02' or reference_id = '40000000-0000-0000-0000-000000069a02')));
insert into _t (area, test, expected, got) values ('Cancelar', 'Y el inventario vuelve a 1000 sin reservas', '1000 · 0', pg_temp.stock(pg_temp.k('queso')));

-- 9. Stock that disappears between confirming and starting (a waste): the kitchen cannot start, nothing goes negative.
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_confirm_order('40000000-0000-0000-0000-000000069a03');
end $$;
reset role;
select pg_temp.as_owner();
insert into dk_inventory_movements (ingredient_id, movement_type, quantity_base_unit, unit_cost, reason, kitchen_id)
  values (pg_temp.k('queso'), 'MERMA', -990, 40, 'VENCIMIENTO', pg_temp.k('A'));

select pg_temp.act_as(pg_temp.k('cook'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Sin stock', 'Empezar sin queso suficiente: rechazado con un mensaje claro',
    'No alcanza «Queso doble crema» para empezar este plato: hay 10 g y necesita 50 g. Registra la compra o un ajuste de inventario.',
    pg_temp.err($q$select dk_advance_kitchen_item('41000000-0000-0000-0000-000000069a03')$q$));
end $$;
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Sin stock', 'El plato sigue pendiente y nada se descontó (sin negativos)', 'PENDIENTE · 10 · 50',
  (select kitchen_status::text from dk_order_items where id = '41000000-0000-0000-0000-000000069a03') || ' · ' || pg_temp.stock(pg_temp.k('queso')));

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
