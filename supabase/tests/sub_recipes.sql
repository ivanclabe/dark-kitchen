-- ADR 0057: sub-recipes (preparations) made in batches — the three proofs the user asked for:
--   1. a simple one: «Salsa de ajo» (800 g mayonesa + 0,05 kg ajo + 10 g sal; yields 0,85 kg), one batch that
--      really yields 0,82 kg: its components go out once, 820 g come in at the real cost;
--   2. reused in three dishes (hamburguesa 30 g, papas 40 g, wrap 1 porción = 25 g): each dish costs the sauce
--      without copying it; selling one of each takes out only the sauce (95 g), never its raw ingredients;
--      a dearer garlic and a new batch reach the three dishes;
--   3. kg → g: garlic bought in kg, the recipe and the yield written in kg, everything stored in g.
-- Plus: nesting, cycles and depth, voiding a batch, missing stock, consumption rhythm, Finanzas, the
-- purchase block, the locks, permissions and isolation. Rolled-back transaction.
--
--   python3 supabase/tests/run.py sub_recipes

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, v jsonb) on commit drop;
grant all on _t, _ctx to authenticated, anon, service_role;
grant usage on sequence _t_n_seq to authenticated, anon, service_role;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', (case when p_kitchen is null then '{}'::jsonb else jsonb_build_object('x-dk-kitchen-id', p_kitchen) end)::text, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.v(p_key text) returns jsonb language sql as $$ select v from _ctx where key = p_key $$;
create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return sqlerrm; end;
$$;
create or replace function pg_temp.hint(p_sql text) returns text language plpgsql as $$
declare v_hint text;
begin execute p_sql; return 'ALLOWED';
exception when others then get stacked diagnostics v_hint = pg_exception_hint; return coalesce(nullif(v_hint, ''), sqlerrm); end;
$$;
create or replace function pg_temp.blocked(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return 'blocked'; end;
$$;
create or replace function pg_temp.unit(p_code text) returns uuid language sql as $$ select id from dk_units where code = p_code $$;
-- A number without trailing zeros, rounded to 4 decimals (150 → 150, 12.21951… → 12.2195).
create or replace function pg_temp.n(p numeric) returns text language sql as $$ select trim_scale(round(p, 4))::text $$;
create or replace function pg_temp.stock(p_id uuid) returns text language sql as $$
  select coalesce((select pg_temp.n(stock_on_hand) || ' / ' || pg_temp.n(stock_available) from dk_ingredient_stock where ingredient_id = p_id), '0 / 0')
$$;
create or replace function pg_temp.avg(p_id uuid) returns numeric language sql as $$ select avg_cost from dk_ingredients where id = p_id $$;
create or replace function pg_temp.cost(p_product uuid) returns numeric language sql as $$ select estimated_cost from dk_products where id = p_product $$;
-- Movements of an ingredient by type, «PRODUCCION -800, CONSUMO -95».
create or replace function pg_temp.moves(p_id uuid, p_types text[] default null) returns text language sql as $$
  select coalesce(string_agg(movement_type::text || ' ' || pg_temp.n(quantity_base_unit), ', ' order by created_at, quantity_base_unit), '-')
  from dk_inventory_movements where ingredient_id = p_id and (p_types is null or movement_type::text = any (p_types))
$$;
grant execute on function pg_temp.k(text), pg_temp.v(text), pg_temp.err(text), pg_temp.hint(text), pg_temp.blocked(text), pg_temp.unit(text),
  pg_temp.n(numeric), pg_temp.stock(uuid), pg_temp.avg(uuid), pg_temp.cost(uuid), pg_temp.moves(uuid, text[]) to authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000057b01', 'duena.sr@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000057b02', 'cocina.sr@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000057b03', 'caja.sr@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-000000057b01', '00000000-0000-0000-0000-000000057b01', 'Dueña', true),
  ('10000000-0000-0000-0000-000000057b02', '00000000-0000-0000-0000-000000057b02', 'Cocina', true),
  ('10000000-0000-0000-0000-000000057b03', '00000000-0000-0000-0000-000000057b03', 'Caja', true);
insert into dk_organizations (slug, name, owner_user_id, sector, category) values ('grupo-sr', 'Grupo Sub-recetas', '10000000-0000-0000-0000-000000057b01', 'fast_food', 'burgers');
insert into _ctx (key, id) values ('org', (select id from dk_organizations where slug = 'grupo-sr')),
  ('owner', '00000000-0000-0000-0000-000000057b01'), ('cook', '00000000-0000-0000-0000-000000057b02'), ('cashier', '00000000-0000-0000-0000-000000057b03');
select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('A', dk_create_kitchen('Sub-recetas A', 'sr-a-prueba', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();
update dk_subscriptions set plan_key = 'business' where organization_id = pg_temp.k('org');
select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('B', dk_create_kitchen('Sub-recetas B', 'sr-b-prueba', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
  select pg_temp.k('A'), '10000000-0000-0000-0000-000000057b02', id from dk_roles where is_system and key = 'KITCHEN';
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
  select pg_temp.k('A'), '10000000-0000-0000-0000-000000057b03', id from dk_roles where is_system and key = 'CASHIER';

insert into dk_suppliers (id, kitchen_id, name) values ('60000000-0000-0000-0000-000000057b01', pg_temp.k('A'), 'Proveedor');
insert into dk_ingredients (id, kitchen_id, code, name, base_unit_id) values
  ('61000000-0000-0000-0000-000000057b01', pg_temp.k('A'), 'MAYO', 'Mayonesa', pg_temp.unit('g')),
  ('61000000-0000-0000-0000-000000057b02', pg_temp.k('A'), 'AJO', 'Ajo', pg_temp.unit('g')),
  ('61000000-0000-0000-0000-000000057b03', pg_temp.k('A'), 'SAL', 'Sal', pg_temp.unit('g')),
  ('61000000-0000-0000-0000-000000057b04', pg_temp.k('A'), 'PAN', 'Pan de hamburguesa', pg_temp.unit('unidad')),
  ('61000000-0000-0000-0000-000000057b05', pg_temp.k('A'), 'PAPA', 'Papa', pg_temp.unit('g')),
  ('61000000-0000-0000-0000-000000057b06', pg_temp.k('A'), 'TORTILLA', 'Tortilla', pg_temp.unit('unidad')),
  ('61000000-0000-0000-0000-000000057b07', pg_temp.k('A'), 'LECHUGA', 'Lechuga', pg_temp.unit('g')),
  ('61000000-0000-0000-0000-000000057b08', pg_temp.k('A'), 'TOMATE', 'Tomate', pg_temp.unit('g')),
  ('61000000-0000-0000-0000-000000057b09', pg_temp.k('A'), 'PANELA', 'Panela', pg_temp.unit('g')),
  ('61000000-0000-0000-0000-000000057b10', pg_temp.k('A'), 'AGUA', 'Agua', pg_temp.unit('ml'));
insert into _ctx (key, id) values ('mayo', '61000000-0000-0000-0000-000000057b01'), ('ajo', '61000000-0000-0000-0000-000000057b02'),
  ('sal', '61000000-0000-0000-0000-000000057b03'), ('pan', '61000000-0000-0000-0000-000000057b04'), ('papa', '61000000-0000-0000-0000-000000057b05'),
  ('tortilla', '61000000-0000-0000-0000-000000057b06'), ('lechuga', '61000000-0000-0000-0000-000000057b07'), ('tomate', '61000000-0000-0000-0000-000000057b08'),
  ('panela', '61000000-0000-0000-0000-000000057b09'), ('agua', '61000000-0000-0000-0000-000000057b10'), ('vaso', '52000000-0000-0000-0000-000000057b05'),
  ('hamb', '52000000-0000-0000-0000-000000057b01'), ('papas', '52000000-0000-0000-0000-000000057b02'), ('wrap', '52000000-0000-0000-0000-000000057b03');
insert into dk_products (id, kitchen_id, code, name, price, uses_inventory) values
  ('52000000-0000-0000-0000-000000057b01', pg_temp.k('A'), 'HAMB', 'Hamburguesa', 18000, true),
  ('52000000-0000-0000-0000-000000057b02', pg_temp.k('A'), 'PAPAS', 'Papas con salsa', 9000, true),
  ('52000000-0000-0000-0000-000000057b03', pg_temp.k('A'), 'WRAP', 'Wrap', 14000, true),
  ('52000000-0000-0000-0000-000000057b04', pg_temp.k('A'), 'EXTRA', 'Salsa extra', 2000, true),
  ('52000000-0000-0000-0000-000000057b05', pg_temp.k('A'), 'VASO', 'Aguapanela en vaso', 3000, true);

-- ---------------------------------------------------------------------------
-- 0. Purchases in kg (kg → g)
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_p uuid;
begin
  insert into dk_purchases (supplier_id, invoice_number, invoice_date) values ('60000000-0000-0000-0000-000000057b01', 'F-SR-1', current_date) returning id into v_p;
  insert into dk_purchase_items (purchase_id, ingredient_id, quantity, purchase_unit_id, unit_cost) values
    (v_p, pg_temp.k('mayo'), 2, pg_temp.unit('kg'), 12000),
    (v_p, pg_temp.k('ajo'), 1, pg_temp.unit('kg'), 8000),
    (v_p, pg_temp.k('sal'), 1, pg_temp.unit('kg'), 2000),
    (v_p, pg_temp.k('pan'), 10, pg_temp.unit('unidad'), 1000),
    (v_p, pg_temp.k('papa'), 2, pg_temp.unit('kg'), 3000),
    (v_p, pg_temp.k('tortilla'), 10, pg_temp.unit('unidad'), 500),
    (v_p, pg_temp.k('lechuga'), 1, pg_temp.unit('kg'), 4000),
    (v_p, pg_temp.k('tomate'), 1, pg_temp.unit('kg'), 6000),
    (v_p, pg_temp.k('panela'), 1, pg_temp.unit('kg'), 6000),
    (v_p, pg_temp.k('agua'), 10, pg_temp.unit('l'), 500);
  perform dk_confirm_purchase(v_p, '{"mode": "cash", "method": "Efectivo"}');
  insert into _t (area, test, expected, got) values
    ('kg → g', 'Comprar 1 kg de ajo a $8.000/kg → 1000 g a $8/g', '1000 / 1000 · 8', pg_temp.stock(pg_temp.k('ajo')) || ' · ' || pg_temp.n(pg_temp.avg(pg_temp.k('ajo')))),
    ('kg → g', '2 kg de mayonesa → 2000 g a $12/g', '2000 / 2000 · 12', pg_temp.stock(pg_temp.k('mayo')) || ' · ' || pg_temp.n(pg_temp.avg(pg_temp.k('mayo'))));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 1. A simple sub-recipe: «Salsa de ajo»
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_salsa uuid;
begin
  v_salsa := dk_create_preparation('Salsa de ajo', pg_temp.unit('g'));
  insert into _ctx (key, id) values ('salsa', v_salsa);
  -- 0,05 kg of garlic and a yield of 0,85 kg: stored in grams. One portion = 25 g.
  perform dk_create_preparation_version(v_salsa, jsonb_build_array(
    jsonb_build_object('ingredient_id', pg_temp.k('mayo'), 'quantity', 800),
    jsonb_build_object('ingredient_id', pg_temp.k('ajo'), 'quantity', 0.05, 'unit_id', pg_temp.unit('kg')),
    jsonb_build_object('ingredient_id', pg_temp.k('sal'), 'quantity', 10, 'unit_id', pg_temp.unit('g'))),
    0.85, pg_temp.unit('kg'), 25, pg_temp.unit('g'));
  insert into _t (area, test, expected, got) values
    ('Sencilla', 'Se crea como insumo preparado, con código propio', 'true · PREP-001 · g',
      (select is_preparation::text || ' · ' || code || ' · ' || (select code from dk_units where id = base_unit_id) from dk_ingredients where id = v_salsa)),
    ('kg → g', 'Receta: 0,05 kg de ajo → 50 g (recuerda «0.05 kg»); rendimiento 0,85 kg → 850 g', 'AJO 50 0.05 kg · MAYO 800 - · SAL 10 - · rinde 850 (0.85 kg)',
      (select string_agg(i.code || ' ' || pg_temp.n(ri.quantity) || ' ' || coalesce(pg_temp.n(ri.unit_quantity) || ' ' || u.code, '-'), ' · ' order by i.code)
       from dk_recipes r join dk_recipe_items ri on ri.recipe_id = r.id join dk_ingredients i on i.id = ri.ingredient_id left join dk_units u on u.id = ri.unit_id
       where r.ingredient_id = v_salsa and r.is_active) || ' · rinde ' ||
      (select pg_temp.n(yield_quantity) || ' (' || pg_temp.n(yield_unit_quantity) || ' ' || (select code from dk_units where id = yield_unit_id) || ')'
       from dk_recipes where ingredient_id = v_salsa and is_active)),
    ('Sencilla', 'Costo teórico: (800×12 + 50×8 + 10×2) / 850 = $11,7882/g; sin stock, su costo lo sigue', '11.7882 · 11.7882',
      pg_temp.n(dk_preparation_theoretical_cost(v_salsa)) || ' · ' || pg_temp.n(pg_temp.avg(v_salsa))),
    ('Sencilla', 'Porción: 1 porción = 25 g (unidad «porción» del insumo)', '25', pg_temp.n(dk_unit_factor(v_salsa, pg_temp.unit('porcion'))));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. Reused in three dishes, before any batch: each dish costs the sauce
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_create_recipe_version(pg_temp.k('hamb'), jsonb_build_array(
    jsonb_build_object('ingredient_id', pg_temp.k('pan'), 'quantity', 1),
    jsonb_build_object('ingredient_id', pg_temp.k('salsa'), 'quantity', 30, 'unit_id', pg_temp.unit('g'))));
  perform dk_create_recipe_version(pg_temp.k('papas'), jsonb_build_array(
    jsonb_build_object('ingredient_id', pg_temp.k('papa'), 'quantity', 200),
    jsonb_build_object('ingredient_id', pg_temp.k('salsa'), 'quantity', 40)));
  perform dk_create_recipe_version(pg_temp.k('wrap'), jsonb_build_array(
    jsonb_build_object('ingredient_id', pg_temp.k('tortilla'), 'quantity', 1),
    jsonb_build_object('ingredient_id', pg_temp.k('salsa'), 'quantity', 1, 'unit_id', pg_temp.unit('porcion'))));
  insert into _t (area, test, expected, got) values
    ('Tres platos', 'El wrap lleva «1 porción» = 25 g de salsa', '25 · 1 porcion',
      (select pg_temp.n(ri.quantity) || ' · ' || pg_temp.n(ri.unit_quantity) || ' ' || u.code from dk_recipe_items ri join dk_products p on p.active_recipe_id = ri.recipe_id
       join dk_units u on u.id = ri.unit_id where p.id = pg_temp.k('wrap') and ri.ingredient_id = pg_temp.k('salsa'))),
    ('Tres platos', 'Costos desde el día uno (teórico): 1000 + 30 × 11,79 · 600 + 40 × 11,79 · 500 + 25 × 11,79', '1353.6471 · 1071.5294 · 794.7059',
      pg_temp.n(pg_temp.cost(pg_temp.k('hamb'))) || ' · ' || pg_temp.n(pg_temp.cost(pg_temp.k('papas'))) || ' · ' || pg_temp.n(pg_temp.cost(pg_temp.k('wrap'))));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. One batch (the cook prepares it): real yield 0,82 kg
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('cook'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_r jsonb;
begin
  v_r := dk_register_production(pg_temp.k('salsa'), 1, 0.82, pg_temp.unit('kg'), 'Primer lote');
  insert into _ctx (key, id, v) values ('batch1', (v_r ->> 'batchId')::uuid, v_r);
end $$;
reset role;
-- What happened, seen by the owner (the cook prepares but does not see the whole inventory).
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_r jsonb := pg_temp.v('batch1');
begin
  insert into _t (area, test, expected, got) values
    ('Lote', 'Salen 800 g de mayonesa, 50 g de ajo y 10 g de sal, una vez', 'PRODUCCION -800 · PRODUCCION -50 · PRODUCCION -10',
      pg_temp.moves(pg_temp.k('mayo'), array['PRODUCCION']) || ' · ' || pg_temp.moves(pg_temp.k('ajo'), array['PRODUCCION']) || ' · ' || pg_temp.moves(pg_temp.k('sal'), array['PRODUCCION'])),
    ('Lote', 'Quedan 1200 g de mayonesa, 950 g de ajo, 990 g de sal', '1200 / 1200 · 950 / 950 · 990 / 990',
      pg_temp.stock(pg_temp.k('mayo')) || ' · ' || pg_temp.stock(pg_temp.k('ajo')) || ' · ' || pg_temp.stock(pg_temp.k('sal'))),
    ('Lote', 'Entran 820 g de salsa (rendimiento real), no los 850 esperados', 'PRODUCCION 820 · 820 / 820',
      pg_temp.moves(pg_temp.k('salsa')) || ' · ' || pg_temp.stock(pg_temp.k('salsa'))),
    ('Lote', 'Costo real: $10.020 / 820 g = $12,2195/g (el rendimiento menor encarece la unidad)', '10020 · 12.2195 · 12.2195',
      pg_temp.n((v_r ->> 'totalCost')::numeric) || ' · ' || pg_temp.n((v_r ->> 'unitCost')::numeric) || ' · ' || pg_temp.n(pg_temp.avg(pg_temp.k('salsa')))),
    ('Lote', 'Trazabilidad: el lote guarda lo esperado, lo real y lo escrito; sus 4 movimientos lo apuntan', '850 · 820 · 0.82 kg · REGISTRADO · Cocina · 4',
      (select pg_temp.n(expected_yield) || ' · ' || pg_temp.n(actual_yield) || ' · ' || pg_temp.n(yield_unit_quantity) || ' ' || (select code from dk_units where id = yield_unit_id)
              || ' · ' || status || ' · ' || (select full_name from dk_users where id = created_by) from dk_production_batches where id = pg_temp.k('batch1')) || ' · ' ||
      (select count(*)::text from dk_inventory_movements where reference_type = 'production' and reference_id = pg_temp.k('batch1'))),
    ('Lote', 'El detalle muestra la diferencia de rendimiento (-3,5 %) y lo que salió', '-3.5 · Ajo 50, Mayonesa 800, Sal 10',
      (select (b ->> 'variancePct') || ' · ' || (select string_agg((c ->> 'name') || ' ' || pg_temp.n((c ->> 'quantity')::numeric), ', ' order by c ->> 'name') from jsonb_array_elements(b -> 'components') c)
       from jsonb_array_elements(dk_preparation_detail(pg_temp.k('salsa')) -> 'batches') b limit 1));
end $$;
reset role;

-- The three dishes now cost the sauce at its real cost.
insert into _t (area, test, expected, got) values
  ('Tres platos', 'Tras el lote, cada plato usa el costo real de la salsa (sin copiarlo)', 'true · true · true',
    (pg_temp.cost(pg_temp.k('hamb')) = 1000 + 30 * pg_temp.avg(pg_temp.k('salsa')))::text || ' · ' ||
    (pg_temp.cost(pg_temp.k('papas')) = 600 + 40 * pg_temp.avg(pg_temp.k('salsa')))::text || ' · ' ||
    (pg_temp.cost(pg_temp.k('wrap')) = 500 + 25 * pg_temp.avg(pg_temp.k('salsa')))::text);

-- ---------------------------------------------------------------------------
-- 4. Selling one of each: only the sauce goes out (95 g); its raw ingredients do not move
-- ---------------------------------------------------------------------------
insert into dk_customers (id, kitchen_id, full_name) values ('30000000-0000-0000-0000-000000057b01', pg_temp.k('A'), 'Laura Gómez');
insert into dk_orders (id, kitchen_id, customer_id, channel) values ('40000000-0000-0000-0000-000000057b01', pg_temp.k('A'), '30000000-0000-0000-0000-000000057b01', 'MANUAL');
insert into dk_order_items (id, order_id, product_id, quantity, unit_price) values
  ('41000000-0000-0000-0000-000000057b01', '40000000-0000-0000-0000-000000057b01', '52000000-0000-0000-0000-000000057b01', 1, 18000),
  ('41000000-0000-0000-0000-000000057b02', '40000000-0000-0000-0000-000000057b01', '52000000-0000-0000-0000-000000057b02', 1, 9000),
  ('41000000-0000-0000-0000-000000057b03', '40000000-0000-0000-0000-000000057b01', '52000000-0000-0000-0000-000000057b03', 1, 14000);
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_confirm_order('40000000-0000-0000-0000-000000057b01');
  insert into _t (area, test, expected, got) values
    ('Venta', 'Confirmar reserva 95 g de salsa (30 + 40 + 25)', '820 / 725', pg_temp.stock(pg_temp.k('salsa')));
  perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000057b01'); perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000057b01');
  perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000057b02'); perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000057b02');
  perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000057b03'); perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000057b03');
  insert into _t (area, test, expected, got) values
    ('Venta', 'Listos: CONSUMO de la salsa -30, -40, -25 → quedan 725 g', '-25, -30, -40 · 725 / 725',
      (select string_agg(pg_temp.n(quantity_base_unit), ', ' order by quantity_base_unit desc) from dk_inventory_movements where ingredient_id = pg_temp.k('salsa') and movement_type = 'CONSUMO')
      || ' · ' || pg_temp.stock(pg_temp.k('salsa'))),
    ('Venta', 'Descontar una sola vez: mayonesa, ajo y sal no se mueven al vender', 'PRODUCCION -800 · PRODUCCION -50 · PRODUCCION -10',
      pg_temp.moves(pg_temp.k('mayo'), array['PRODUCCION', 'CONSUMO']) || ' · ' || pg_temp.moves(pg_temp.k('ajo'), array['PRODUCCION', 'CONSUMO']) || ' · ' || pg_temp.moves(pg_temp.k('sal'), array['PRODUCCION', 'CONSUMO'])),
    ('Venta', 'El consumo de la salsa se valora a su costo real', '12.2195',
      (select string_agg(distinct pg_temp.n(unit_cost), ',') from dk_inventory_movements where ingredient_id = pg_temp.k('salsa') and movement_type = 'CONSUMO'));
end $$;
reset role;

-- Finanzas: the cost of what was sold is the CONSUMO of the order (dishes' own ingredients + sauce), production is not a sale nor waste.
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_pnl jsonb := dk_finance_pnl(current_date - 1, current_date + 1);
begin
  insert into _t (area, test, expected, got, detail) values
    ('Finanzas', 'Costo de ventas = consumo de los pedidos (pan, papa, tortilla y 95 g de salsa); producir no es venta ni merma', 'true · 0',
      ((v_pnl ->> 'cogs')::numeric = round((select sum(-quantity_base_unit * unit_cost) from dk_inventory_movements where kitchen_id = pg_temp.k('A') and movement_type = 'CONSUMO')))::text
      || ' · ' || coalesce(round((v_pnl ->> 'waste')::numeric)::text, '0'), v_pnl::text);
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. Dearer garlic + a new batch reach the three dishes
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_p uuid; v_before numeric[]; v_r jsonb;
begin
  v_before := array[pg_temp.cost(pg_temp.k('hamb')), pg_temp.cost(pg_temp.k('papas')), pg_temp.cost(pg_temp.k('wrap'))];
  insert into dk_purchases (supplier_id, invoice_number, invoice_date) values ('60000000-0000-0000-0000-000000057b01', 'F-SR-2', current_date) returning id into v_p;
  insert into dk_purchase_items (purchase_id, ingredient_id, quantity, purchase_unit_id, unit_cost) values (v_p, pg_temp.k('ajo'), 1, pg_temp.unit('kg'), 20000);
  perform dk_confirm_purchase(v_p, '{"mode": "cash", "method": "Efectivo"}');
  insert into _t (area, test, expected, got) values
    ('Precio', 'Con stock, la salsa conserva el costo real de su lote (no cambia por la compra de ajo)', '12.2195', pg_temp.n(pg_temp.avg(pg_temp.k('salsa'))));
  v_r := dk_register_production(pg_temp.k('salsa'), 1);
  insert into _ctx (key, id, v) values ('batch2', (v_r ->> 'batchId')::uuid, v_r);
  insert into _t (area, test, expected, got) values
    ('Precio', 'Lote 2 (ajo a $14,15/g; rinde lo esperado): costo $12,1502/g; promedio ponderado con lo que quedaba', '850 · 12.1502 · 12.1821',
      pg_temp.n((v_r ->> 'actualYield')::numeric) || ' · ' || pg_temp.n((v_r ->> 'unitCost')::numeric) || ' · ' || pg_temp.n(pg_temp.avg(pg_temp.k('salsa')))),
    ('Precio', 'Los tres platos se actualizan solos', 'true · true · true',
      (pg_temp.cost(pg_temp.k('hamb')) <> v_before[1] and pg_temp.cost(pg_temp.k('hamb')) = 1000 + 30 * pg_temp.avg(pg_temp.k('salsa')))::text || ' · ' ||
      (pg_temp.cost(pg_temp.k('papas')) <> v_before[2] and pg_temp.cost(pg_temp.k('papas')) = 600 + 40 * pg_temp.avg(pg_temp.k('salsa')))::text || ' · ' ||
      (pg_temp.cost(pg_temp.k('wrap')) <> v_before[3] and pg_temp.cost(pg_temp.k('wrap')) = 500 + 25 * pg_temp.avg(pg_temp.k('salsa')))::text);
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. Voiding a batch, and what cannot be voided
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_void_production(pg_temp.k('batch2'), 'Se registró dos veces');
  insert into _t (area, test, expected, got) values
    ('Anular', 'Anular el lote 2: la salsa vuelve a 725 g y sus insumos regresan (mayonesa 400 → 1200)', '725 / 725 · 1200 / 1200 · ANULADO',
      pg_temp.stock(pg_temp.k('salsa')) || ' · ' || pg_temp.stock(pg_temp.k('mayo')) || ' · ' || (select status from dk_production_batches where id = pg_temp.k('batch2'))),
    ('Anular', 'Nada se borra: el lote anulado conserva sus movimientos y suma los contrarios', '4 · 4',
      (select count(*)::text from dk_inventory_movements where reference_type = 'production' and reference_id = pg_temp.k('batch2')) || ' · ' ||
      (select count(*)::text from dk_inventory_movements where reference_type = 'production_void' and reference_id = pg_temp.k('batch2'))),
    ('Anular', 'El costo de la salsa vuelve al del lote 1', '12.2195', pg_temp.n(pg_temp.avg(pg_temp.k('salsa')))),
    ('Anular', 'Un lote anulado no se anula dos veces', 'Este lote ya está anulado',
      pg_temp.err(format('select dk_void_production(%L)', pg_temp.k('batch2')))),
    ('Anular', 'El lote 1 ya se usó (quedan 725 de 820): no se anula, sugiere merma o ajuste', 'batch_already_used',
      pg_temp.hint(format('select dk_void_production(%L)', pg_temp.k('batch1'))));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. Missing stock, said by name
-- ---------------------------------------------------------------------------
insert into dk_orders (id, kitchen_id, customer_id, channel) values ('40000000-0000-0000-0000-000000057b02', pg_temp.k('A'), '30000000-0000-0000-0000-000000057b01', 'MANUAL');
insert into dk_order_items (id, order_id, product_id, quantity, unit_price) values
  ('41000000-0000-0000-0000-000000057b04', '40000000-0000-0000-0000-000000057b02', '52000000-0000-0000-0000-000000057b04', 15, 2000);
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_create_recipe_version('52000000-0000-0000-0000-000000057b04', jsonb_build_array(
    jsonb_build_object('ingredient_id', pg_temp.k('salsa'), 'quantity', 50)));
  insert into _t (area, test, expected, got) values
    ('Faltantes', 'Preparar 3 lotes sin mayonesa suficiente: dice cuál falta', 'Falta «Mayonesa» para preparar «Salsa de ajo»: hay 1200 g, se necesitan 2400 g',
      pg_temp.err(format('select dk_register_production(%L, 3)', pg_temp.k('salsa')))),
    ('Faltantes', 'Un pedido de 15 salsas extra (750 g, hay 725): pide preparar un lote', 'Falta «Salsa de ajo» (hay 725 g, se necesitan 750 g): prepara un lote en Abastecimiento → Preparaciones',
      pg_temp.err($q$select dk_confirm_order('40000000-0000-0000-0000-000000057b02')$q$));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 8. Nesting: «Ensalada base» inside «Ensalada con salsa»; a preparation without stock follows its recipe
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_base uuid; v_mix uuid; v_p uuid;
begin
  v_base := dk_create_preparation('Ensalada base', pg_temp.unit('g'), 'ENS-BASE');
  v_mix := dk_create_preparation('Ensalada con salsa', pg_temp.unit('g'));
  insert into _ctx (key, id) values ('base', v_base), ('mix', v_mix);
  perform dk_create_preparation_version(v_base, jsonb_build_array(
    jsonb_build_object('ingredient_id', pg_temp.k('lechuga'), 'quantity', 100), jsonb_build_object('ingredient_id', pg_temp.k('tomate'), 'quantity', 50)), 150);
  perform dk_create_preparation_version(v_mix, jsonb_build_array(
    jsonb_build_object('ingredient_id', v_base, 'quantity', 150), jsonb_build_object('ingredient_id', pg_temp.k('salsa'), 'quantity', 20)), 170);
  insert into _t (area, test, expected, got) values
    ('Anidadas', 'Ensalada base sin stock: (100×4 + 50×6)/150 = $4,6667/g', '4.6667', pg_temp.n(pg_temp.avg(v_base)));
  -- Dearer lettuce: the base has no stock, so its cost follows the recipe — and so does the one above it.
  insert into dk_purchases (supplier_id, invoice_number, invoice_date) values ('60000000-0000-0000-0000-000000057b01', 'F-SR-3', current_date) returning id into v_p;
  insert into dk_purchase_items (purchase_id, ingredient_id, quantity, purchase_unit_id, unit_cost) values (v_p, pg_temp.k('lechuga'), 1, pg_temp.unit('kg'), 10000);
  perform dk_confirm_purchase(v_p, '{"mode": "cash", "method": "Efectivo"}');
  insert into _t (area, test, expected, got) values
    ('Anidadas', 'Lechuga más cara ($7/g): la ensalada base (sin stock) pasa a $6,6667/g y la ensalada con salsa la sigue', '6.6667 · true',
      pg_temp.n(pg_temp.avg(v_base)) || ' · ' || (abs(pg_temp.avg(v_mix) - dk_preparation_theoretical_cost(v_mix)) < 0.000001)::text);
  perform dk_register_production(v_base, 1);
  perform dk_register_production(v_mix, 1);
  insert into _t (area, test, expected, got) values
    ('Anidadas', 'El lote de «Ensalada con salsa» descuenta la ensalada base y la salsa, no la lechuga otra vez', '0 / 0 · 705 / 705 · PRODUCCION -100 · 170 / 170',
      pg_temp.stock(v_base) || ' · ' || pg_temp.stock(pg_temp.k('salsa')) || ' · ' || pg_temp.moves(pg_temp.k('lechuga'), array['PRODUCCION']) || ' · ' || pg_temp.stock(v_mix)),
    ('Anidadas', 'Árbol de dependencias: la ensalada con salsa lleva la salsa, que lleva ajo, mayonesa y sal', 'Ensalada base[Lechuga,Tomate] · Salsa de ajo[Ajo,Mayonesa,Sal]',
      (select string_agg((c ->> 'name') || '[' || (select string_agg(g ->> 'name', ',' order by g ->> 'name') from jsonb_array_elements(c -> 'children') g) || ']', ' · ' order by c ->> 'name')
       from jsonb_array_elements(dk_preparation_tree(v_mix)) c)),
    ('Dependencias', 'El ajo se usa en la salsa y, a través de ella, en sus platos', 'Salsa de ajo · Hamburguesa (vía Salsa de ajo), Papas con salsa (vía Salsa de ajo), Salsa extra (vía Salsa de ajo), Wrap (vía Salsa de ajo)',
      (select string_agg(p ->> 'name', ', ') from jsonb_array_elements(dk_ingredient_usage(pg_temp.k('ajo')) -> 'preparations') p) || ' · ' ||
      (select string_agg((d ->> 'name') || ' (vía ' || (d ->> 'via') || ')', ', ' order by d ->> 'name') from jsonb_array_elements(dk_ingredient_usage(pg_temp.k('ajo')) -> 'dishes') d)),
    ('Dependencias', 'La salsa: usada en 4 platos directamente y en 1 preparación (5 recetas)', '4 · Ensalada con salsa · 5',
      (select jsonb_array_length(dk_ingredient_usage(pg_temp.k('salsa')) -> 'dishes')::text) || ' · ' ||
      (select string_agg(p ->> 'name', ', ') from jsonb_array_elements(dk_ingredient_usage(pg_temp.k('salsa')) -> 'preparations') p) || ' · ' ||
      (select x ->> 'usedIn' from jsonb_array_elements(dk_preparation_list()) x where (x ->> 'id')::uuid = pg_temp.k('salsa')));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 9. Cycles and depth
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_prev uuid; v_cur uuid; v_last text;
begin
  insert into _t (area, test, expected, got) values
    ('Ciclos', 'La salsa no puede llevar la ensalada con salsa (que ya lleva la salsa)', 'preparation_cycle',
      pg_temp.hint(format($q$select dk_create_preparation_version(%L, %L::jsonb, 100)$q$, pg_temp.k('salsa'),
        jsonb_build_array(jsonb_build_object('ingredient_id', pg_temp.k('mix'), 'quantity', 10))))),
    ('Ciclos', 'Ni a sí misma', 'preparation_cycle',
      pg_temp.hint(format($q$select dk_create_preparation_version(%L, %L::jsonb, 100)$q$, pg_temp.k('salsa'),
        jsonb_build_array(jsonb_build_object('ingredient_id', pg_temp.k('salsa'), 'quantity', 10)))));
  -- A chain P1 (sal) → P2 (P1) → … : the sixth level is rejected.
  v_prev := pg_temp.k('sal');
  for i in 1..6 loop
    v_cur := dk_create_preparation('Nivel ' || i, pg_temp.unit('g'));
    v_last := pg_temp.hint(format($q$select dk_create_preparation_version(%L, %L::jsonb, 10)$q$, v_cur,
      jsonb_build_array(jsonb_build_object('ingredient_id', v_prev, 'quantity', 10))));
    exit when v_last <> 'ALLOWED';
    v_prev := v_cur;
  end loop;
  insert into _t (area, test, expected, got) values ('Ciclos', 'Hasta 5 niveles de preparaciones anidadas', 'preparation_depth', v_last);
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 10. Purchases, locks, rhythm of consumption
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_p uuid;
begin
  insert into dk_purchases (supplier_id, invoice_number, invoice_date) values ('60000000-0000-0000-0000-000000057b01', 'F-SR-4', current_date) returning id into v_p;
  insert into _ctx (key, id) values ('p4', v_p);
  insert into _t (area, test, expected, got) values
    ('Compras', 'Una preparación no se compra', 'preparation_not_purchasable',
      pg_temp.hint(format($q$insert into dk_purchase_items (purchase_id, ingredient_id, quantity, purchase_unit_id, unit_cost) values (%L, %L, 1, %L, 1)$q$,
        v_p, pg_temp.k('salsa'), pg_temp.unit('g')))),
    ('Bloqueos', 'Con historial, la salsa no deja de ser preparación ni cambia de unidad base', 'preparation_locked · base_unit_locked',
      pg_temp.hint(format('update dk_ingredients set is_preparation = false where id = %L', pg_temp.k('salsa'))) || ' · ' ||
      pg_temp.hint(format('update dk_ingredients set base_unit_id = %L where id = %L', pg_temp.unit('ml'), pg_temp.k('salsa')))),
    ('Ritmo', 'Lo que se gasta en lotes cuenta como consumo del ajo: 50 g del lote 1 (el lote anulado se lo devolvió)', '50',
      (select pg_temp.n(consumed_30d) from dk_supply_suggestions where ingredient_id = pg_temp.k('ajo'))),
    ('Ritmo', 'La salsa: consumo 95 g (ventas) + 20 g (en la ensalada); marcada como preparación', '115 · true',
      (select pg_temp.n(consumed_30d) || ' · ' || is_preparation::text from dk_supply_suggestions where ingredient_id = pg_temp.k('salsa'))),
    ('Ritmo', 'Copilot: a una preparación no le sugiere compra', 'true · null',
      (select (x ->> 'isPreparation') || ' · ' || coalesce(x ->> 'suggestedPurchase', 'null')
       from jsonb_array_elements(dk_copilot_ingredients('Salsa') -> 'ingredients') x limit 1));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 10b. A preparation kept in LITRES: written in g and ml, yield and real yield in ml, a dish in ml
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_ag uuid; v_r jsonb;
begin
  v_ag := dk_create_preparation('Aguapanela', pg_temp.unit('l'));
  insert into _ctx (key, id) values ('aguapanela', v_ag);
  -- 250 g of panela + 2.000 ml of water; yields 2.000 ml = 2 l.
  perform dk_create_preparation_version(v_ag, jsonb_build_array(
    jsonb_build_object('ingredient_id', pg_temp.k('panela'), 'quantity', 0.25, 'unit_id', pg_temp.unit('kg')),
    jsonb_build_object('ingredient_id', pg_temp.k('agua'), 'quantity', 2000)), 2000, pg_temp.unit('ml'));
  insert into _t (area, test, expected, got) values
    ('Litros', 'Se guarda en l: la receta lleva 250 g de panela y 2000 ml de agua; rinde 2000 ml = 2 l', 'l · AGUA 2000 · PANELA 250 · 2 l (2000 ml)',
      (select code from dk_units where id = (select base_unit_id from dk_ingredients where id = v_ag)) || ' · ' ||
      (select string_agg(i.code || ' ' || pg_temp.n(ri.quantity), ' · ' order by i.code) from dk_recipes r join dk_recipe_items ri on ri.recipe_id = r.id
       join dk_ingredients i on i.id = ri.ingredient_id where r.ingredient_id = v_ag and r.is_active) || ' · ' ||
      (select pg_temp.n(yield_quantity) || ' l (' || pg_temp.n(yield_unit_quantity) || ' ml)' from dk_recipes where ingredient_id = v_ag and is_active)),
    ('Litros', 'Costo por litro: (250 × $6 + 2000 × $0,5) / 2 l = $1.250/l', '1250', pg_temp.n(pg_temp.avg(v_ag)));
  -- The real yield written in ml.
  v_r := dk_register_production(v_ag, 1, 1900, pg_temp.unit('ml'));
  insert into _t (area, test, expected, got) values
    ('Litros', 'Rinde 1900 ml → entra 1,9 l a $1.315,79/l', '1.9 / 1.9 · 1315.7895', pg_temp.stock(v_ag) || ' · ' || pg_temp.n(pg_temp.avg(v_ag)));
  perform dk_create_recipe_version(pg_temp.k('vaso'), jsonb_build_array(
    jsonb_build_object('ingredient_id', v_ag, 'quantity', 300, 'unit_id', pg_temp.unit('ml'))));
  insert into _t (area, test, expected, got) values
    ('Litros', 'Un vaso lleva 300 ml → se guarda 0,3 l (recuerda «300 ml»); cuesta 0,3 × $1.315,79', '0.3 · 300 ml · 394.7368',
      (select pg_temp.n(ri.quantity) || ' · ' || pg_temp.n(ri.unit_quantity) || ' ' || u.code from dk_recipe_items ri join dk_products p on p.active_recipe_id = ri.recipe_id
       join dk_units u on u.id = ri.unit_id where p.id = pg_temp.k('vaso')) || ' · ' || pg_temp.n(pg_temp.cost(pg_temp.k('vaso'))));
end $$;
reset role;
insert into dk_orders (id, kitchen_id, customer_id, channel) values ('40000000-0000-0000-0000-000000057b03', pg_temp.k('A'), '30000000-0000-0000-0000-000000057b01', 'MANUAL');
insert into dk_order_items (id, order_id, product_id, quantity, unit_price) values
  ('41000000-0000-0000-0000-000000057b05', '40000000-0000-0000-0000-000000057b03', '52000000-0000-0000-0000-000000057b05', 2, 3000);
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_confirm_order('40000000-0000-0000-0000-000000057b03');
  perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000057b05');
  perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000057b05');
  insert into _t (area, test, expected, got) values
    ('Litros', 'Vender 2 vasos: sale 0,6 l (600 ml) de aguapanela → quedan 1,3 l; panela y agua no se mueven al vender', '-0.6 · 1.3 / 1.3 · PRODUCCION -250 · PRODUCCION -2000',
      (select pg_temp.n(sum(quantity_base_unit)) from dk_inventory_movements where ingredient_id = pg_temp.k('aguapanela') and movement_type = 'CONSUMO') || ' · ' ||
      pg_temp.stock(pg_temp.k('aguapanela')) || ' · ' || pg_temp.moves(pg_temp.k('panela'), array['PRODUCCION', 'CONSUMO']) || ' · ' ||
      pg_temp.moves(pg_temp.k('agua'), array['PRODUCCION', 'CONSUMO'])),
    ('Litros', 'Unidades para escribirla: l, ml (y nada que no convierta)', 'l,ml',
      (select string_agg(o ->> 'code', ',' order by o ->> 'code') from jsonb_array_elements(dk_unit_options(array[pg_temp.k('aguapanela')]) -> pg_temp.k('aguapanela')::text) o));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 11. Permissions and isolation
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('cook'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Permisos', 'Cocina prepara lotes y consulta, pero no crea preparaciones ni cambia recetas', 'ALLOWED · ALLOWED · blocked · blocked',
      pg_temp.blocked(format('select dk_register_production(%L, 1)', pg_temp.k('base'))) || ' · ' ||
      pg_temp.blocked('select dk_preparation_list()') || ' · ' ||
      pg_temp.blocked(format('select dk_create_preparation(%L, %L)', 'Otra', pg_temp.unit('g'))) || ' · ' ||
      pg_temp.blocked(format($q$select dk_create_preparation_version(%L, %L::jsonb, 100)$q$, pg_temp.k('salsa'),
        jsonb_build_array(jsonb_build_object('ingredient_id', pg_temp.k('mayo'), 'quantity', 10))))),
    ('Permisos', 'Nadie escribe la tabla de lotes directamente', 'blocked',
      pg_temp.blocked(format($q$update dk_production_batches set actual_yield = 1 where id = %L$q$, pg_temp.k('batch1'))));
end $$;
reset role;
select pg_temp.act_as(pg_temp.k('cashier'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Permisos', 'Caja no prepara lotes', 'blocked', pg_temp.blocked(format('select dk_register_production(%L, 1)', pg_temp.k('salsa'))));
end $$;
reset role;
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('B'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Aislamiento', 'Desde la cuenta B: no ve, no prepara ni anula lo de A', 'blocked · blocked · blocked · 0 · 0',
      pg_temp.blocked(format('select dk_preparation_detail(%L)', pg_temp.k('salsa'))) || ' · ' ||
      pg_temp.blocked(format('select dk_register_production(%L, 1)', pg_temp.k('salsa'))) || ' · ' ||
      pg_temp.blocked(format('select dk_void_production(%L)', pg_temp.k('batch1'))) || ' · ' ||
      jsonb_array_length(dk_preparation_list())::text || ' · ' ||
      (select count(*)::text from dk_production_batches));
end $$;
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
