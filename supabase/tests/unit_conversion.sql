-- ADR 0056: automatic unit conversion — one rule (dk_unit_factor), purchases in kg and boxes,
-- recipes in any compatible unit (stored in the base unit), consumption and cost in the base
-- unit, waste and adjustments with a unit, the base-unit lock, permissions and isolation.
-- The whole chain the user asked to see: buy 2 kg → 2000 g → recipe 150 g → order of 3 →
-- 450 g consumed → waste 0.1 kg → 1450 g. Rolled-back transaction.
--
--   python3 supabase/tests/run.py unit_conversion

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, v jsonb) on commit drop;
grant all on _t, _ctx to authenticated, anon, service_role;
grant usage on sequence _t_n_seq to authenticated, anon, service_role;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', (case when p_kitchen is null then '{}'::jsonb else jsonb_build_object('x-dk-kitchen-id', p_kitchen) end)::text, true);
$$;
create or replace function pg_temp.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role": "anon"}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return sqlerrm; end;
$$;
create or replace function pg_temp.blocked(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return 'blocked'; end;
$$;
grant execute on function pg_temp.k(text), pg_temp.err(text), pg_temp.blocked(text) to anon;


create or replace function pg_temp.v(p_key text) returns jsonb language sql as $$ select v from _ctx where key = p_key $$;
-- An order of the web menu of A (anon), as ADR 0052.
create or replace function pg_temp.web_order(p_phone text, p_opt_in boolean, p_fulfillment text default 'delivery', p_key text default null) returns jsonb language sql as $$
  select dk_public_place_order('wa-a-prueba', jsonb_build_object(
    'idempotencyKey', coalesce(p_key, gen_random_uuid()::text), 'customer', jsonb_build_object('name', 'Laura Gómez', 'phone', p_phone),
    'fulfillment', p_fulfillment, 'address', 'Calle 10 # 20-30', 'paymentMethod', 'Efectivo', 'whatsappOptIn', p_opt_in,
    'items', jsonb_build_array(jsonb_build_object('productId', '52000000-0000-0000-0000-000000057a01', 'quantity', 2))))
$$;
create or replace function pg_temp.order_id(p_number text) returns uuid language sql as $$
  select id from dk_orders where kitchen_id = (select id from _ctx where key = 'A') and order_number = p_number::integer
$$;
create or replace function pg_temp.notices(p_order uuid) returns text language sql as $$
  select coalesce(string_agg(event || ':' || status, ',' order by created_at), '-') from dk_wa_outbox where order_id = p_order
$$;
grant execute on function pg_temp.web_order(text, boolean, text, text), pg_temp.v(text) to anon;
grant execute on function pg_temp.k(text), pg_temp.v(text), pg_temp.err(text), pg_temp.blocked(text), pg_temp.notices(uuid), pg_temp.order_id(text) to service_role, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000057a01', 'duena.un@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000057a02', 'cocina.un@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000057a03', 'caja.un@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-000000057a01', '00000000-0000-0000-0000-000000057a01', 'Dueña', true),
  ('10000000-0000-0000-0000-000000057a02', '00000000-0000-0000-0000-000000057a02', 'Cocina', true),
  ('10000000-0000-0000-0000-000000057a03', '00000000-0000-0000-0000-000000057a03', 'Caja', true);
insert into dk_organizations (slug, name, owner_user_id, sector, category) values ('grupo-un', 'Grupo Unidades', '10000000-0000-0000-0000-000000057a01', 'fast_food', 'burgers');
insert into _ctx (key, id) values ('org', (select id from dk_organizations where slug = 'grupo-un')),
  ('owner', '00000000-0000-0000-0000-000000057a01'), ('cook', '00000000-0000-0000-0000-000000057a02'), ('cashier', '00000000-0000-0000-0000-000000057a03');
select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('A', dk_create_kitchen('Unidades A', 'un-a-prueba', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();
update dk_subscriptions set plan_key = 'business' where organization_id = pg_temp.k('org');
select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('B', dk_create_kitchen('Unidades B', 'un-b-prueba', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
  select pg_temp.k('A'), '10000000-0000-0000-0000-000000057a02', id from dk_roles where is_system and key = 'KITCHEN';
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
  select pg_temp.k('A'), '10000000-0000-0000-0000-000000057a03', id from dk_roles where is_system and key = 'CASHIER';

create or replace function pg_temp.unit(p_code text) returns uuid language sql as $$ select id from dk_units where code = p_code $$;
-- A number without trailing zeros (150 → 150, 0.0050 → 0.005).
create or replace function pg_temp.n(p numeric) returns text language sql as $$
  select case when p = trunc(p) then trunc(p)::text else rtrim(rtrim(p::text, '0'), '.') end
$$;
create or replace function pg_temp.stock(p_id uuid) returns text language sql as $$
  select pg_temp.n(stock_on_hand) || ' / ' || pg_temp.n(stock_available) from dk_ingredient_stock where ingredient_id = p_id
$$;
grant execute on function pg_temp.unit(text), pg_temp.stock(uuid), pg_temp.n(numeric) to authenticated;

-- Account A: meat in grams, eggs by unit, coarse salt in KILOS (like 3 real ingredients today), milk in ml.
insert into dk_suppliers (id, kitchen_id, name) values ('60000000-0000-0000-0000-000000057a01', pg_temp.k('A'), 'Proveedor');
insert into dk_ingredients (id, kitchen_id, code, name, base_unit_id) values
  ('61000000-0000-0000-0000-000000057a01', pg_temp.k('A'), 'CARNE', 'Carne de res', pg_temp.unit('g')),
  ('61000000-0000-0000-0000-000000057a02', pg_temp.k('A'), 'HUEVO', 'Huevo', pg_temp.unit('unidad')),
  ('61000000-0000-0000-0000-000000057a03', pg_temp.k('A'), 'SAL', 'Sal gruesa', pg_temp.unit('kg')),
  ('61000000-0000-0000-0000-000000057a04', pg_temp.k('A'), 'LECHE', 'Leche', pg_temp.unit('ml')),
  ('61000000-0000-0000-0000-000000057a05', pg_temp.k('A'), 'NUEVO', 'Insumo sin historia', pg_temp.unit('g'));
insert into _ctx (key, id) values ('carne', '61000000-0000-0000-0000-000000057a01'), ('huevo', '61000000-0000-0000-0000-000000057a02'),
  ('sal', '61000000-0000-0000-0000-000000057a03'), ('leche', '61000000-0000-0000-0000-000000057a04'), ('nuevo', '61000000-0000-0000-0000-000000057a05');
insert into dk_products (id, kitchen_id, code, name, price, uses_inventory) values ('52000000-0000-0000-0000-000000057a01', pg_temp.k('A'), 'HAMB', 'Hamburguesa', 18000, true);

-- ---------------------------------------------------------------------------
-- 1. The rule (dk_unit_factor)
-- ---------------------------------------------------------------------------
insert into _t (area, test, expected, got) values
  ('Regla', 'Carne (g): kg → 1000 · g → 1 · l → no · unidad → no', '1000 · 1 · null · null',
    coalesce(dk_unit_factor(pg_temp.k('carne'), pg_temp.unit('kg'))::int::text, 'null') || ' · ' || coalesce(dk_unit_factor(pg_temp.k('carne'), pg_temp.unit('g'))::int::text, 'null') || ' · ' ||
    coalesce(dk_unit_factor(pg_temp.k('carne'), pg_temp.unit('l'))::text, 'null') || ' · ' || coalesce(dk_unit_factor(pg_temp.k('carne'), pg_temp.unit('unidad'))::text, 'null')),
  ('Regla', 'Sal (kg): g → 0,001 · Leche (ml): l → 1000 · Huevo: docena → 12', '0.001 · 1000 · 12',
    pg_temp.n(dk_unit_factor(pg_temp.k('sal'), pg_temp.unit('g'))) || ' · ' || dk_unit_factor(pg_temp.k('leche'), pg_temp.unit('l'))::int || ' · ' ||
    dk_unit_factor(pg_temp.k('huevo'), pg_temp.unit('docena'))::int),
  ('Regla', 'Una «caja» genérica no se adivina: necesita el empaque del insumo', 'null', coalesce(dk_unit_factor(pg_temp.k('huevo'), pg_temp.unit('caja'))::text, 'null'));

-- ---------------------------------------------------------------------------
-- 2. Purchases: buy in kg and in boxes; inventory and cost land in the base unit
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_p uuid;
begin
  perform dk_ingredient_set_purchase_unit(pg_temp.k('huevo'), pg_temp.unit('caja'), 12);
  insert into _t (area, test, expected, got) values
    ('Empaques', '«Caja de huevos = 12 unidades» queda guardado', '12', dk_unit_factor(pg_temp.k('huevo'), pg_temp.unit('caja'))::int::text),
    ('Empaques', 'kg no se redefine: ya convierte solo', 'kg ya se convierte solo a g (1 kg = 1000.000000 g)',
      pg_temp.err(format($q$select dk_ingredient_set_purchase_unit(%L, %L, 900)$q$, pg_temp.k('carne'), pg_temp.unit('kg'))));
  insert into dk_purchases (supplier_id, invoice_number, invoice_date) values ('60000000-0000-0000-0000-000000057a01', 'F-UN-1', current_date) returning id into v_p;
  insert into dk_purchase_items (purchase_id, ingredient_id, quantity, purchase_unit_id, unit_cost) values
    (v_p, pg_temp.k('carne'), 2, pg_temp.unit('kg'), 20000),
    (v_p, pg_temp.k('huevo'), 1, pg_temp.unit('caja'), 9600),
    (v_p, pg_temp.k('sal'), 500, pg_temp.unit('g'), 1),
    (v_p, pg_temp.k('leche'), 2, pg_temp.unit('l'), 4000);
  perform dk_confirm_purchase(v_p, '{"mode": "cash", "method": "Efectivo"}');
  insert into _t (area, test, expected, got) values
    ('Compras', '2 kg de carne a $20.000/kg ($40.000) → 2000 g a $20/g', '2000 / 2000 · 20', pg_temp.stock(pg_temp.k('carne')) || ' · ' || pg_temp.n((select avg_cost from dk_ingredients where id = pg_temp.k('carne')))),
    ('Compras', '1 caja × 12 de huevos a $9.600 → 12 unidades a $800', '12 / 12 · 800', pg_temp.stock(pg_temp.k('huevo')) || ' · ' || (select avg_cost::int from dk_ingredients where id = pg_temp.k('huevo'))),
    ('Compras', '500 g de sal (base kg) a $1/g → 0,5 kg a $1.000/kg', '0.5 / 0.5 · 1000', pg_temp.stock(pg_temp.k('sal')) || ' · ' || (select avg_cost::int from dk_ingredients where id = pg_temp.k('sal'))),
    ('Compras', '2 l de leche → 2000 ml', '2000 / 2000', pg_temp.stock(pg_temp.k('leche'))),
    ('Compras', 'La compra convierte con la misma regla (factor de cada movimiento = dk_unit_factor)', '0',
      (select count(*)::text from dk_purchase_items pi join dk_inventory_movements m on m.reference_id = pi.id and m.reference_type = 'purchase_item'
       where pi.purchase_id = v_p and m.quantity_base_unit <> pi.quantity * dk_unit_factor(pi.ingredient_id, pi.purchase_unit_id)));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Recipe in any compatible unit: stored in the base, remembers what was typed, real cost
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_create_recipe_version('52000000-0000-0000-0000-000000057a01', jsonb_build_array(
    jsonb_build_object('ingredient_id', pg_temp.k('carne'), 'quantity', 150, 'unit_id', pg_temp.unit('g')),
    jsonb_build_object('ingredient_id', pg_temp.k('huevo'), 'quantity', 1),
    jsonb_build_object('ingredient_id', pg_temp.k('sal'), 'quantity', 5, 'unit_id', pg_temp.unit('g'))));
  insert into _t (area, test, expected, got) values
    ('Recetas', 'Carne 150 g (su base) · huevo 1 · sal 5 g → 0,005 kg recordando «5 g»', 'CARNE 150 - · HUEVO 1 - · SAL 0.005 5 g',
      (select string_agg(i.code || ' ' || pg_temp.n(ri.quantity) || ' ' ||
              coalesce(pg_temp.n(ri.unit_quantity) || ' ' || u.code, '-'), ' · ' order by i.code)
       from dk_recipe_items ri join dk_products p on p.active_recipe_id = ri.recipe_id join dk_ingredients i on i.id = ri.ingredient_id left join dk_units u on u.id = ri.unit_id
       where p.id = '52000000-0000-0000-0000-000000057a01')),
    ('Recetas', 'Costo del plato: 150 g × $20 + 1 × $800 + 0,005 kg × $1.000 = $3.805', '3805',
      (select estimated_cost::int::text from dk_products where id = '52000000-0000-0000-0000-000000057a01')),
    ('Recetas', 'Una unidad que no convierte (carne en «unidad») se rechaza', 'No hay conversión de unidad a la unidad base de «Carne de res»',
      pg_temp.err(format($q$select dk_create_recipe_version('52000000-0000-0000-0000-000000057a01', '[{"ingredient_id": "%s", "quantity": 1, "unit_id": "%s"}]')$q$, pg_temp.k('carne'), pg_temp.unit('unidad')))),
    ('Recetas', 'Sin unidad sigue funcionando como antes (base)', 'true',
      (dk_create_recipe_version('52000000-0000-0000-0000-000000057a01', jsonb_build_array(jsonb_build_object('ingredient_id', pg_temp.k('huevo'), 'quantity', 2))) is not null)::text);
  -- The recipe used by the order below (in kg for the meat, to show it converts both ways).
  perform dk_create_recipe_version('52000000-0000-0000-0000-000000057a01', jsonb_build_array(
    jsonb_build_object('ingredient_id', pg_temp.k('carne'), 'quantity', 0.15, 'unit_id', pg_temp.unit('kg')),
    jsonb_build_object('ingredient_id', pg_temp.k('huevo'), 'quantity', 1),
    jsonb_build_object('ingredient_id', pg_temp.k('sal'), 'quantity', 5, 'unit_id', pg_temp.unit('g'))));
  insert into _t (area, test, expected, got) values
    ('Recetas', '0,15 kg de carne se guarda como 150 g', '150 · kg',
      (select pg_temp.n(ri.quantity) || ' · ' || u.code from dk_recipe_items ri join dk_products p on p.active_recipe_id = ri.recipe_id
       join dk_units u on u.id = ri.unit_id where p.id = '52000000-0000-0000-0000-000000057a01' and ri.ingredient_id = pg_temp.k('carne')));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Consumption: an order of 3 reserves and consumes in base units
-- ---------------------------------------------------------------------------
insert into dk_customers (id, kitchen_id, full_name) values ('30000000-0000-0000-0000-000000057a01', pg_temp.k('A'), 'Cliente');
insert into dk_orders (id, kitchen_id, customer_id, channel) values ('40000000-0000-0000-0000-000000057a01', pg_temp.k('A'), '30000000-0000-0000-0000-000000057a01', 'MANUAL');
insert into dk_order_items (id, order_id, product_id, quantity, unit_price) values ('41000000-0000-0000-0000-000000057a01', '40000000-0000-0000-0000-000000057a01', '52000000-0000-0000-0000-000000057a01', 3, 18000);
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_confirm_order('40000000-0000-0000-0000-000000057a01');
  insert into _t (area, test, expected, got) values
    ('Consumo', 'Confirmar 3 hamburguesas reserva 450 g de carne (disponible 1550 g)', '2000 / 1550', pg_temp.stock(pg_temp.k('carne'))),
    ('Consumo', '… 3 huevos y 0,015 kg de sal', '12 / 9 · 0.5 / 0.485', pg_temp.stock(pg_temp.k('huevo')) || ' · ' || pg_temp.stock(pg_temp.k('sal')));
  perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000057a01');
  perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000057a01');
  insert into _t (area, test, expected, got) values
    ('Consumo', 'Cocina lo marca listo: CONSUMO de 450 g; quedan 1550 g', '-450 · 1550 / 1550',
      (select trim(trailing '.' from trim(trailing '0' from sum(quantity_base_unit)::text)) from dk_inventory_movements where ingredient_id = pg_temp.k('carne') and movement_type = 'CONSUMO') || ' · ' ||
      pg_temp.stock(pg_temp.k('carne'))),
    ('Consumo', 'El consumo se valora al costo por gramo ($20)', '20', (select unit_cost::int::text from dk_inventory_movements where ingredient_id = pg_temp.k('carne') and movement_type = 'CONSUMO'));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. Waste and adjustments in any compatible unit
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_register_waste(pg_temp.k('carne'), 0.1, 'DANO', null, pg_temp.unit('kg'));
  perform dk_register_adjustment(pg_temp.k('huevo'), 1, 'Conteo', pg_temp.unit('docena'));
  perform dk_register_waste(pg_temp.k('leche'), 250, 'VENCIMIENTO');
  insert into _t (area, test, expected, got) values
    ('Mermas', 'Merma de 0,1 kg de carne → -100 g (quedan 1450 g), y dice cómo se registró', '-100 · 1450 / 1450 · Registrada como 0.1 kg',
      (select pg_temp.n(quantity_base_unit) || ' · ' || pg_temp.stock(pg_temp.k('carne')) || ' · ' || observation
       from dk_inventory_movements where ingredient_id = pg_temp.k('carne') and movement_type = 'MERMA')),
    ('Ajustes', 'Ajuste de +1 docena de huevos → +12 unidades', '12 · 21 / 21',
      (select pg_temp.n(quantity_base_unit) from dk_inventory_movements where ingredient_id = pg_temp.k('huevo') and movement_type = 'AJUSTE') || ' · ' || pg_temp.stock(pg_temp.k('huevo'))),
    ('Mermas', 'Sin unidad, como siempre (en la base)', '1750 / 1750', pg_temp.stock(pg_temp.k('leche'))),
    ('Mermas', 'Una unidad que no convierte se rechaza', 'No hay conversión de esa unidad a la unidad base del insumo',
      pg_temp.err(format($q$select dk_register_waste(%L, 1, 'DANO', null, %L)$q$, pg_temp.k('carne'), pg_temp.unit('unidad'))));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. Options for the screens, the base-unit lock, permissions and isolation
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v jsonb := dk_unit_options(array[pg_temp.k('carne'), pg_temp.k('huevo')]);
begin
  insert into _t (area, test, expected, got) values
    ('Opciones', 'Carne: la base primero, luego las compatibles', 'g:base:1,kg:standard:1000',
      (select string_agg((o ->> 'code') || ':' || (o ->> 'source') || ':' || (o ->> 'factor')::numeric::int, ',') from jsonb_array_elements(v -> pg_temp.k('carne')::text) o)),
    ('Opciones', 'Huevo: unidad, docena y su caja de 12', 'unidad:base:1,docena:standard:12,caja:package:12',
      (select string_agg((o ->> 'code') || ':' || (o ->> 'source') || ':' || (o ->> 'factor')::numeric::int, ',') from jsonb_array_elements(v -> pg_temp.k('huevo')::text) o)),
    ('Unidad base', 'Un insumo con historia no cambia de unidad base', 'base_unit_locked',
      (select case when sqlerrm_ like '%No se puede cambiar la unidad base de «Carne de res»%' then 'base_unit_locked' else sqlerrm_ end
       from (select pg_temp.err(format('update dk_ingredients set base_unit_id = %L where id = %L', pg_temp.unit('kg'), pg_temp.k('carne'))) as sqlerrm_) x)),
    ('Unidad base', 'Uno sin historia sí puede', 'ALLOWED',
      pg_temp.err(format('update dk_ingredients set base_unit_id = %L where id = %L', pg_temp.unit('kg'), pg_temp.k('nuevo'))));
end $$;
reset role;
select pg_temp.act_as(pg_temp.k('cook'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Permisos', 'Cocina no define empaques ni registra mermas', 'blocked · blocked',
      pg_temp.blocked(format($q$select dk_ingredient_set_purchase_unit(%L, %L, 30)$q$, pg_temp.k('huevo'), pg_temp.unit('bolsa'))) || ' · ' ||
      pg_temp.blocked(format($q$select dk_register_waste(%L, 1, 'DANO', null, %L)$q$, pg_temp.k('carne'), pg_temp.unit('kg'))));
end $$;
reset role;
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('B'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Aislamiento', 'B no define empaques de A ni ve sus opciones', 'blocked · {}',
      pg_temp.blocked(format($q$select dk_ingredient_set_purchase_unit(%L, %L, 30)$q$, pg_temp.k('huevo'), pg_temp.unit('bolsa'))) || ' · ' ||
      dk_unit_options(array[pg_temp.k('carne')])::text);
end $$;
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
