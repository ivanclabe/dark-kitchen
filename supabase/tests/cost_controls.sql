-- ADR 0063, fase 2: inventario, costos y compras con reglas (sin IA). Transacción revertida.
--   · la función «Control de costos» y sus ajustes efectivos;
--   · compras: factura opcional en el borrador y obligatoria al confirmar, IVA por %, obligación por el total;
--   · precios de referencia (última compra y promedio de 90 días por unidad base) y bitácora de cambios del costo;
--   · reposición: sin «bajo mínimo» cuando no hay mínimo, cantidad = consumo × días objetivo;
--   · conteo físico: foto del sistema, lo contado en cualquier unidad, ajuste «Conteo físico», permisos;
--   · margen de los platos frente al objetivo.
--
--   python3 supabase/tests/run.py cost_controls

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, v jsonb) on commit drop;
grant all on _t, _ctx to authenticated;
grant usage on sequence _t_n_seq to authenticated;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', case when p_kitchen is null then '{}' else jsonb_build_object('x-dk-kitchen-id', p_kitchen)::text end, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.unit(p_code text) returns uuid language sql as $$ select id from dk_units where code = p_code $$;
create or replace function pg_temp.n(p numeric) returns text language sql as $$ select trim_scale(round(p, 4))::text $$;
create or replace function pg_temp.check(p_area text, p_test text, p_expected text, p_got text, p_detail text default null) returns void language sql as $$
  insert into _t (area, test, expected, got, detail) values (p_area, p_test, p_expected, coalesce(p_got, '∅'), p_detail)
$$;
create or replace function pg_temp.stock(p_ingredient uuid) returns numeric language sql as $$
  select coalesce((select stock_on_hand from dk_ingredient_stock where ingredient_id = p_ingredient), 0)
$$;
grant execute on function pg_temp.k(text), pg_temp.unit(text), pg_temp.n(numeric), pg_temp.check(text, text, text, text, text), pg_temp.stock(uuid) to authenticated;

-- A new organization with one account, its owner and a cashier.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000c0e01', 'duena.costos@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c0e02', 'caja.costos@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-0000000c0e01', '00000000-0000-0000-0000-0000000c0e01', 'Dueña costos', true),
  ('10000000-0000-0000-0000-0000000c0e02', '00000000-0000-0000-0000-0000000c0e02', 'Caja costos', true);
insert into dk_organizations (slug, name, owner_user_id, sector, category) values ('grupo-costos', 'Grupo Costos', '10000000-0000-0000-0000-0000000c0e01', 'fast_food', 'burgers');
insert into _ctx (key, id) values ('org', (select id from dk_organizations where slug = 'grupo-costos')),
  ('owner', '00000000-0000-0000-0000-0000000c0e01'), ('cashier', '00000000-0000-0000-0000-0000000c0e02');
select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('A', dk_create_kitchen('Costos A', 'costos-a-prueba', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
  select pg_temp.k('A'), '10000000-0000-0000-0000-0000000c0e02', id from dk_roles where is_system and key = 'CASHIER';

insert into dk_suppliers (id, kitchen_id, name, default_vat_pct) values ('60000000-0000-0000-0000-0000000c0e01', pg_temp.k('A'), 'Plaza', 19);
insert into dk_ingredient_categories (id, kitchen_id, name) values ('62000000-0000-0000-0000-0000000c0e01', pg_temp.k('A'), 'Granos');
insert into dk_ingredients (id, kitchen_id, code, name, base_unit_id, category_id, primary_supplier_id, min_stock, max_stock) values
  ('61000000-0000-0000-0000-0000000c0e01', pg_temp.k('A'), 'ARROZ', 'Arroz', pg_temp.unit('g'), '62000000-0000-0000-0000-0000000c0e01', '60000000-0000-0000-0000-0000000c0e01', 0, null),
  ('61000000-0000-0000-0000-0000000c0e02', pg_temp.k('A'), 'POLLO', 'Pollo', pg_temp.unit('g'), null, '60000000-0000-0000-0000-0000000c0e01', 0, 20000),
  ('61000000-0000-0000-0000-0000000c0e03', pg_temp.k('A'), 'LIMON', 'Limón', pg_temp.unit('unidad'), null, null, 0, null);
insert into _ctx (key, id) values ('arroz', '61000000-0000-0000-0000-0000000c0e01'), ('pollo', '61000000-0000-0000-0000-0000000c0e02'),
  ('limon', '61000000-0000-0000-0000-0000000c0e03'), ('plaza', '60000000-0000-0000-0000-0000000c0e01'), ('granos', '62000000-0000-0000-0000-0000000c0e01');

-- ---------------------------------------------------------------------------
-- 1. La función y sus ajustes
-- ---------------------------------------------------------------------------
select pg_temp.check('Función', '«Control de costos» es general, en todos los planes, encendida por defecto', 'general · true · true',
  (select concat_ws(' · ', category, default_enabled::text, (select (count(*) = (select count(*) from dk_plans))::text from dk_plan_features where feature_key = 'cost_controls')) from dk_features where key = 'cost_controls'));
select pg_temp.check('Función', 'Ajustes efectivos por defecto', 'true · 35 · 10 · 7',
  (select concat_ws(' · ', v ->> 'enabled', v ->> 'target_food_cost_pct', v ->> 'price_change_pct', v ->> 'reorder_days') from (select dk_cost_settings(pg_temp.k('A')) v) x));
update dk_organization_features set settings = '{"reorder_days": 10}' where organization_id = pg_temp.k('org') and feature_key = 'cost_controls';
insert into dk_organization_features (organization_id, feature_key, available, settings)
select pg_temp.k('org'), 'cost_controls', true, '{"reorder_days": 10}'
where not exists (select 1 from dk_organization_features where organization_id = pg_temp.k('org') and feature_key = 'cost_controls');
select pg_temp.check('Función', 'La organización cambia los días de reposición', '10',
  (select dk_cost_settings(pg_temp.k('A')) ->> 'reorder_days'));

-- ---------------------------------------------------------------------------
-- 2. Compras: factura opcional en el borrador, IVA por %
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_p uuid; v_q uuid; v_hint text;
begin
  -- Old purchase (100 days ago): 2 kg of rice at 3.000/kg → outside the 90-day average.
  insert into dk_purchases (supplier_id, invoice_number, invoice_date) values (pg_temp.k('plaza'), 'F-OLD', current_date - 100) returning id into v_p;
  insert into dk_purchase_items (purchase_id, ingredient_id, quantity, purchase_unit_id, unit_cost) values (v_p, pg_temp.k('arroz'), 2, pg_temp.unit('kg'), 3000);
  perform dk_confirm_purchase(v_p, '{"mode": "cash", "method": "Efectivo"}');

  -- Draft without invoice number, with VAT 19 %.
  insert into dk_purchases (supplier_id, invoice_number, invoice_date, tax_pct) values (pg_temp.k('plaza'), null, current_date - 10, 19) returning id into v_q;
  insert into _ctx (key, id) values ('p1', v_q);
  insert into dk_purchase_items (purchase_id, ingredient_id, quantity, purchase_unit_id, unit_cost) values
    (v_q, pg_temp.k('arroz'), 4, pg_temp.unit('kg'), 4000),
    (v_q, pg_temp.k('pollo'), 2, pg_temp.unit('kg'), 16000);
  perform pg_temp.check('Compras', 'El borrador se crea sin número de factura', 'BORRADOR · ∅',
    (select concat_ws(' · ', status, coalesce(invoice_number, '∅')) from dk_purchases where id = v_q));
  begin
    perform dk_confirm_purchase(v_q, '{"mode": "cash", "method": "Efectivo"}');
    v_hint := 'CONFIRMADA';
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  perform pg_temp.check('Compras', 'Sin número no se confirma (y lo dice)', 'invoice_number_required', v_hint);
  update dk_purchases set invoice_number = 'F-100', invoice_date = current_date - 9 where id = v_q;
  perform pg_temp.check('Compras', 'Quien crea compras edita la cabecera del borrador', 'F-100',
    (select invoice_number from dk_purchases where id = v_q));
  perform dk_confirm_purchase(v_q, '{"mode": "credit", "dueDate": "2099-01-01"}');
  -- 4 × 4.000 + 2 × 16.000 = 48.000; IVA 19 % = 9.120.
  perform pg_temp.check('Compras', 'Al confirmar, IVA = subtotal × %', '48000 · 9120 · 57120',
    (select concat_ws(' · ', pg_temp.n(subtotal), pg_temp.n(tax), pg_temp.n(total)) from dk_purchases where id = v_q));
  perform pg_temp.check('Compras', 'La cuenta por pagar es por el total con IVA', '57120',
    (select pg_temp.n(amount) from dk_obligations where purchase_id = v_q));
  -- Two drafts without number from the same supplier do not collide.
  insert into dk_purchases (supplier_id, invoice_number, invoice_date) values (pg_temp.k('plaza'), null, current_date), (pg_temp.k('plaza'), null, current_date);
  perform pg_temp.check('Compras', 'Varios borradores sin número del mismo proveedor', '2',
    (select count(*)::text from dk_purchases where supplier_id = pg_temp.k('plaza') and invoice_number is null));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Precios de referencia y bitácora del costo
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_p uuid; r jsonb;
begin
  -- Latest purchase: rice at 5.000/kg (5 per g); the 90-day average mixes 4 kg at 4 and 1 kg at 5.
  insert into dk_purchases (supplier_id, invoice_number, invoice_date) values (pg_temp.k('plaza'), 'F-101', current_date - 1) returning id into v_p;
  insert into dk_purchase_items (purchase_id, ingredient_id, quantity, purchase_unit_id, unit_cost) values (v_p, pg_temp.k('arroz'), 1, pg_temp.unit('kg'), 5000);
  perform dk_confirm_purchase(v_p, '{"mode": "cash", "method": "Efectivo"}');
  r := dk_price_references(array[pg_temp.k('arroz'), pg_temp.k('limon')]);
  perform pg_temp.check('Precios', 'Última compra: fecha, unidad y precio por unidad base', 'F · kg · 5000 · 5',
    concat_ws(' · ', case when (r -> (pg_temp.k('arroz')::text) -> 'last' ->> 'date')::date = current_date - 1 then 'F' else 'otra' end,
      r -> (pg_temp.k('arroz')::text) -> 'last' ->> 'unitCode', pg_temp.n((r -> (pg_temp.k('arroz')::text) -> 'last' ->> 'unitCost')::numeric),
      pg_temp.n((r -> (pg_temp.k('arroz')::text) -> 'last' ->> 'perBase')::numeric)));
  -- (4 × 4.000 + 1 × 5.000) / 5.000 g = 4,2 per g; the purchase of 100 days ago is left out.
  perform pg_temp.check('Precios', 'Promedio de 90 días por unidad base', '4.2',
    pg_temp.n((r -> (pg_temp.k('arroz')::text) ->> 'avg90PerBase')::numeric));
  perform pg_temp.check('Precios', 'Sin compras: sin última ni promedio', 'null · null',
    concat_ws(' · ', coalesce(r -> (pg_temp.k('limon')::text) ->> 'last', 'null'), coalesce(r -> (pg_temp.k('limon')::text) ->> 'avg90PerBase', 'null')));
  perform pg_temp.check('Precios', 'Cada subida del costo promedio queda registrada', 'true',
    (select (count(*) >= 1 and bool_and(change_pct > 0))::text from dk_ingredient_cost_changes where ingredient_id = pg_temp.k('arroz')));
end $$;
reset role;
select pg_temp.act_as(pg_temp.k('cashier'), pg_temp.k('A'));
set local role authenticated;
select pg_temp.check('Precios', 'La caja no ve precios de compra ni la bitácora', '{} · 0',
  concat_ws(' · ', dk_price_references(array[pg_temp.k('arroz')])::text, (select count(*) from dk_ingredient_cost_changes)::text));
reset role;

-- ---------------------------------------------------------------------------
-- 4. Reposición
-- ---------------------------------------------------------------------------
select pg_temp.as_owner();
-- Chicken: 25 days × 60 g = 1.500 g consumed in 30 days → 50 g a day.
insert into dk_inventory_movements (ingredient_id, movement_type, quantity_base_unit, unit_cost, kitchen_id, created_at)
select pg_temp.k('pollo'), 'CONSUMO', -60, 16, pg_temp.k('A'), now() - (d || ' days')::interval from generate_series(1, 25) d;
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
-- 10 target days → 500 g; it has 2.000 − 1.500 = 500 g → suggests 0 (it covers the target).
select pg_temp.check('Reposición', 'Sin mínimo no es «bajo mínimo»', 'false',
  (select below_min::text from dk_supply_suggestions where ingredient_id = pg_temp.k('limon')));
select pg_temp.check('Reposición', 'Con consumo: cubre los días objetivo', '50 · 0',
  (select concat_ws(' · ', pg_temp.n(daily_burn), pg_temp.n(suggested_quantity)) from dk_supply_suggestions where ingredient_id = pg_temp.k('pollo')));
reset role;
update dk_organization_features set settings = '{"reorder_days": 30}' where organization_id = pg_temp.k('org') and feature_key = 'cost_controls';
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
-- 30 days × 50 g = 1.500 g − 500 g available = 1.000 g.
select pg_temp.check('Reposición', 'Más días objetivo, más cantidad (tope: el máximo)', '1000',
  (select pg_temp.n(suggested_quantity) from dk_supply_suggestions where ingredient_id = pg_temp.k('pollo')));
reset role;

-- ---------------------------------------------------------------------------
-- 5. Conteo físico
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_c uuid; v_l uuid; r jsonb; v_hint text;
begin
  v_c := dk_stock_count_start(p_category_id => pg_temp.k('granos'));
  insert into _ctx (key, id) values ('count', v_c);
  perform pg_temp.check('Conteo', 'Por categoría: solo sus insumos, con lo que dice el sistema', 'Categoría: Granos · 1 · 7000',
    concat_ws(' · ', (select scope from dk_stock_counts where id = v_c), (select count(*) from dk_stock_count_lines where count_id = v_c),
      (select pg_temp.n(system_qty) from dk_stock_count_lines where count_id = v_c)));
  begin
    perform dk_stock_count_start();
    v_hint := 'abrió otro';
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  perform pg_temp.check('Conteo', 'Un conteo abierto a la vez', 'count_open', v_hint);
  select id into v_l from dk_stock_count_lines where count_id = v_c;
  perform dk_stock_count_set(v_l, 6.5, pg_temp.unit('kg'));
  perform pg_temp.check('Conteo', 'Lo contado en kg se guarda en la unidad base', '6.5 · 6500',
    (select concat_ws(' · ', pg_temp.n(counted_qty), pg_temp.n(counted_base_qty)) from dk_stock_count_lines where id = v_l));
  begin
    perform dk_stock_count_set(v_l, 3, pg_temp.unit('ml'));
    v_hint := 'aceptó ml';
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  perform pg_temp.check('Conteo', 'Una unidad que no convierte se rechaza', 'no_conversion', v_hint);
  r := dk_stock_count_apply(v_c);
  perform pg_temp.check('Conteo', 'Aplicar: un ajuste por la diferencia, valorizado', '1 · 1 · 6500',
    concat_ws(' · ', r ->> 'adjusted', r ->> 'counted', pg_temp.n(pg_temp.stock(pg_temp.k('arroz')))));
  perform pg_temp.check('Conteo', 'El ajuste dice de dónde viene', 'AJUSTE · -500 · Conteo físico',
    (select concat_ws(' · ', movement_type, pg_temp.n(quantity_base_unit), observation) from dk_inventory_movements where reference_type = 'stock_count' and reference_id = v_c));
  perform pg_temp.check('Conteo', 'Queda aplicado (no se aplica dos veces)', 'applied',
    (select status from dk_stock_counts where id = v_c));
  -- Discard: nothing moves.
  v_c := dk_stock_count_start();
  perform dk_stock_count_set((select id from dk_stock_count_lines where count_id = v_c and ingredient_id = pg_temp.k('pollo')), 0, null);
  perform dk_stock_count_cancel(v_c);
  perform pg_temp.check('Conteo', 'Descartar no toca el inventario', 'cancelled · 500',
    concat_ws(' · ', (select status from dk_stock_counts where id = v_c), pg_temp.n(pg_temp.stock(pg_temp.k('pollo')))));
end $$;
reset role;
select pg_temp.act_as(pg_temp.k('cashier'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_stock_count_start();
  perform pg_temp.check('Conteo', 'La caja no cuenta el inventario', 'bloqueado', 'PERMITIDO');
exception when others then perform pg_temp.check('Conteo', 'La caja no cuenta el inventario', 'bloqueado', 'bloqueado');
end $$;
select pg_temp.check('Conteo', 'La caja no ve los conteos', '0', (select count(*)::text from dk_stock_counts));
reset role;

-- ---------------------------------------------------------------------------
-- 6. Margen de los platos
-- ---------------------------------------------------------------------------
select pg_temp.as_owner();
insert into dk_products (id, kitchen_id, code, name, price, uses_inventory, estimated_cost) values
  ('52000000-0000-0000-0000-0000000c0e01', pg_temp.k('A'), 'OK', 'Plato ok', 20000, true, 6000),
  ('52000000-0000-0000-0000-0000000c0e02', pg_temp.k('A'), 'ALTO', 'Plato caro de hacer', 15000, true, 7000),
  ('52000000-0000-0000-0000-0000000c0e03', pg_temp.k('A'), 'BAJO', 'Plato bajo costo', 5000, true, 5200),
  ('52000000-0000-0000-0000-0000000c0e04', pg_temp.k('A'), 'SIN', 'Plato sin receta', 9000, false, 0);
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
select pg_temp.check('Margen', 'Estado de cada plato frente al 35 %', 'BAJO below_cost · ALTO above_target 46.7 20000 · OK ok 30 · SIN no_cost',
  (select string_agg(case d ->> 'name'
      when 'Plato ok' then 'OK ' || (d ->> 'status') || ' ' || pg_temp.n((d ->> 'foodCostPct')::numeric)
      when 'Plato caro de hacer' then 'ALTO ' || (d ->> 'status') || ' ' || pg_temp.n((d ->> 'foodCostPct')::numeric) || ' ' || pg_temp.n((d ->> 'suggestedPrice')::numeric)
      when 'Plato bajo costo' then 'BAJO ' || (d ->> 'status')
      else 'SIN ' || (d ->> 'status') end, ' · ' order by d ->> 'name')
   from jsonb_array_elements(dk_dish_margins() -> 'dishes') d));
reset role;

select pg_temp.as_owner();
select pg_temp.check('Permisos', 'Sin sesión no se cuenta ni se ven precios', 'false · false',
  concat_ws(' · ', has_function_privilege('anon', 'dk_stock_count_start(uuid, uuid)', 'execute')::text, has_function_privilege('anon', 'dk_price_references(uuid[])', 'execute')::text));

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
