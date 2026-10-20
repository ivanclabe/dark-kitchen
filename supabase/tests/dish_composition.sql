-- ADR 0059: configurable dishes. The proofs the user asked for:
--   · a composed dish — «Corrientazo» $18.000: soup (sancocho, a preparation kept in LITRES, 350 ml), protein
--     (chicken or beef +$3.000), drink (lemonade = another dish's recipe, or a soda) and optional sides
--     (patacones +$2.000 from a reusable sub-recipe, tajadas +$1.500, yuca on the house in KG);
--   · a reusable sub-recipe — «Patacón» in the corrientazo and in another dish;
--   · optional sides that affect the inventory and the order total correctly.
-- Plus: defaults, limits, prices the browser cannot set, two ways of the same dish, availability, the cashier,
-- WhatsApp, Insights and Finanzas, cancellation, permissions and isolation. Rolled-back transaction.
--
--   python3 supabase/tests/run.py dish_composition

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, v jsonb) on commit drop;
grant all on _t, _ctx to authenticated, anon, service_role;
grant usage on sequence _t_n_seq to authenticated, anon, service_role;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', (case when p_kitchen is null then '{}'::jsonb else jsonb_build_object('x-dk-kitchen-id', p_kitchen) end)::text, true);
$$;
create or replace function pg_temp.as_anon(p_ip text default '200.9.9.9') returns void language sql as $$
  select set_config('request.jwt.claims', '{"role": "anon"}', true), set_config('request.headers', jsonb_build_object('x-forwarded-for', p_ip)::text, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.v(p_key text) returns jsonb language sql as $$ select v from _ctx where key = p_key $$;
create or replace function pg_temp.unit(p_code text) returns uuid language sql as $$ select id from dk_units where code = p_code $$;
create or replace function pg_temp.n(p numeric) returns text language sql as $$ select trim_scale(round(p, 4))::text $$;
create or replace function pg_temp.code(p_sql text) returns text language plpgsql as $$
declare v_hint text;
begin execute p_sql; return 'ALLOWED';
exception when others then get stacked diagnostics v_hint = pg_exception_hint; return coalesce(nullif(v_hint, ''), 'error: ' || sqlerrm); end;
$$;
create or replace function pg_temp.blocked(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return 'blocked'; end;
$$;
-- An option of the corrientazo (or of another dish) by its name.
-- (kept in _ctx after saving the composition: the anonymous customer cannot read the composition tables, and must not)
create or replace function pg_temp.opt(p_name text, p_product text default 'corr') returns uuid language sql as $$
  select id from _ctx where key = 'opt:' || p_product || ':' || p_name
$$;
create or replace function pg_temp.sel(p_name text, p_qty integer default 1, p_product text default 'corr') returns jsonb language sql as $$
  select jsonb_build_object('optionId', pg_temp.opt(p_name, p_product), 'quantity', p_qty)
$$;
-- A public order: lines [productKey, quantity, options], the browser always claims a price of $1.
create or replace function pg_temp.order_json(p_key text, p_phone text, p_lines jsonb) returns jsonb language sql as $$
  select jsonb_build_object('idempotencyKey', p_key, 'customer', jsonb_build_object('name', 'Laura Gómez', 'phone', p_phone),
    'fulfillment', 'pickup', 'paymentMethod', 'Efectivo', 'privacyAccepted', true,
    'items', (select jsonb_agg(jsonb_build_object('productId', pg_temp.k(l ->> 0), 'quantity', (l ->> 1)::integer, 'price', 1, 'options', l -> 2)) from jsonb_array_elements(p_lines) l))
$$;
-- The order behind a public answer (the public function gives the tracking token, not the internal id).
create or replace function pg_temp.order_of(p_key text) returns uuid language sql as $$
  select id from dk_orders where public_token = ((select v from _ctx where key = p_key) ->> 'token')::uuid
$$;
create or replace function pg_temp.place(p_order jsonb) returns jsonb language sql as $$ select dk_public_place_order('comp-a-prueba', p_order) $$;
-- What a line reserved / consumed, «INGREDIENTE cantidad» sorted.
create or replace function pg_temp.reserved(p_item uuid) returns text language sql as $$
  select string_agg(i.code || ' ' || pg_temp.n(r.quantity_base_unit), ' · ' order by i.code)
  from dk_inventory_reservations r join dk_ingredients i on i.id = r.ingredient_id where r.order_item_id = p_item
$$;
create or replace function pg_temp.stock(p_code text) returns numeric language sql as $$
  select coalesce(st.stock_available, 0) from dk_ingredients i left join dk_ingredient_stock st on st.ingredient_id = i.id
  where i.kitchen_id = (select id from _ctx where key = 'A') and i.code = p_code
$$;
grant execute on function pg_temp.place(jsonb), pg_temp.order_json(text, text, jsonb), pg_temp.code(text), pg_temp.k(text), pg_temp.v(text),
  pg_temp.blocked(text), pg_temp.opt(text, text), pg_temp.sel(text, integer, text), pg_temp.n(numeric) to anon, authenticated;
grant execute on function pg_temp.unit(text), pg_temp.reserved(uuid), pg_temp.stock(text), pg_temp.order_of(text) to authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000059a01', 'duena.comp@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000059a02', 'caja.comp@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-000000059a01', '00000000-0000-0000-0000-000000059a01', 'Dueña', true),
  ('10000000-0000-0000-0000-000000059a02', '00000000-0000-0000-0000-000000059a02', 'Caja', true);
insert into dk_organizations (slug, name, owner_user_id, sector, category) values ('grupo-comp', 'Grupo Composición', '10000000-0000-0000-0000-000000059a01', 'fast_food', 'burgers');
insert into _ctx (key, id) values ('org', (select id from dk_organizations where slug = 'grupo-comp')),
  ('owner', '00000000-0000-0000-0000-000000059a01'), ('cashier', '00000000-0000-0000-0000-000000059a02');
select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('A', dk_create_kitchen('Composición A', 'comp-a-prueba', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();
update dk_subscriptions set plan_key = 'business' where organization_id = pg_temp.k('org');
select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('B', dk_create_kitchen('Composición B', 'comp-b-prueba', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
  select pg_temp.k('A'), '10000000-0000-0000-0000-000000059a02', id from dk_roles where is_system and key = 'CASHIER';

insert into dk_suppliers (id, kitchen_id, name) values ('60000000-0000-0000-0000-000000059a01', pg_temp.k('A'), 'Plaza');
insert into dk_ingredients (id, kitchen_id, code, name, base_unit_id) values
  ('61000000-0000-0000-0000-000000059a01', pg_temp.k('A'), 'ARROZ', 'Arroz', pg_temp.unit('g')),
  ('61000000-0000-0000-0000-000000059a02', pg_temp.k('A'), 'POLLO', 'Pollo', pg_temp.unit('g')),
  ('61000000-0000-0000-0000-000000059a03', pg_temp.k('A'), 'RES', 'Carne de res', pg_temp.unit('g')),
  ('61000000-0000-0000-0000-000000059a04', pg_temp.k('A'), 'LIMON', 'Limón', pg_temp.unit('unidad')),
  ('61000000-0000-0000-0000-000000059a05', pg_temp.k('A'), 'AZUCAR', 'Azúcar', pg_temp.unit('g')),
  ('61000000-0000-0000-0000-000000059a06', pg_temp.k('A'), 'GASEOSA', 'Gaseosa', pg_temp.unit('unidad')),
  ('61000000-0000-0000-0000-000000059a07', pg_temp.k('A'), 'PLATANO', 'Plátano verde', pg_temp.unit('g')),
  ('61000000-0000-0000-0000-000000059a08', pg_temp.k('A'), 'YUCA', 'Yuca', pg_temp.unit('g'));
insert into dk_ingredients (id, kitchen_id, code, name, base_unit_id) values ('61000000-0000-0000-0000-000000059b01', pg_temp.k('B'), 'AJENO', 'De la cuenta B', pg_temp.unit('g'));
insert into dk_product_categories (id, kitchen_id, name) values ('51000000-0000-0000-0000-000000059a01', pg_temp.k('A'), 'Almuerzos');
insert into dk_products (id, kitchen_id, code, name, price, category_id, uses_inventory) values
  ('52000000-0000-0000-0000-000000059a01', pg_temp.k('A'), 'CORR', 'Corrientazo', 18000, '51000000-0000-0000-0000-000000059a01', true),
  ('52000000-0000-0000-0000-000000059a02', pg_temp.k('A'), 'LIMO', 'Limonada', 5000, null, true),
  ('52000000-0000-0000-0000-000000059a03', pg_temp.k('A'), 'PATA', 'Patacones con hogao', 8000, null, true),
  ('52000000-0000-0000-0000-000000059a04', pg_temp.k('A'), 'COMBO', 'Combo sin predeterminada', 9000, null, false);
insert into _ctx (key, id) values ('corr', '52000000-0000-0000-0000-000000059a01'), ('limo', '52000000-0000-0000-0000-000000059a02'),
  ('pata', '52000000-0000-0000-0000-000000059a03'), ('combo', '52000000-0000-0000-0000-000000059a04');
insert into dk_menu_plan_items (kitchen_id, plan_date, product_id, display_order, is_active)
select pg_temp.k('A'), (now() at time zone 'America/Bogota')::date, p, n, true
from unnest(array['52000000-0000-0000-0000-000000059a01'::uuid, '52000000-0000-0000-0000-000000059a02', '52000000-0000-0000-0000-000000059a03']) with ordinality u(p, n);

-- ---------------------------------------------------------------------------
-- 0. Purchases (kg), the sub-recipes and their batches, the recipes
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_p uuid; v_san uuid; v_pat uuid;
begin
  insert into dk_purchases (supplier_id, invoice_number, invoice_date) values ('60000000-0000-0000-0000-000000059a01', 'F-COMP-1', current_date) returning id into v_p;
  insert into dk_purchase_items (purchase_id, ingredient_id, quantity, purchase_unit_id, unit_cost) values
    (v_p, '61000000-0000-0000-0000-000000059a01', 2, pg_temp.unit('kg'), 4000),
    (v_p, '61000000-0000-0000-0000-000000059a02', 2, pg_temp.unit('kg'), 16000),
    (v_p, '61000000-0000-0000-0000-000000059a03', 2, pg_temp.unit('kg'), 24000),
    (v_p, '61000000-0000-0000-0000-000000059a04', 30, pg_temp.unit('unidad'), 300),
    (v_p, '61000000-0000-0000-0000-000000059a05', 1, pg_temp.unit('kg'), 3000),
    (v_p, '61000000-0000-0000-0000-000000059a06', 10, pg_temp.unit('unidad'), 1500),
    (v_p, '61000000-0000-0000-0000-000000059a07', 3, pg_temp.unit('kg'), 3000),
    (v_p, '61000000-0000-0000-0000-000000059a08', 3, pg_temp.unit('kg'), 2000);
  perform dk_confirm_purchase(v_p, '{"mode": "cash", "method": "Efectivo"}');
  -- Sancocho, kept in LITRES: 400 g of chicken + 600 g of yuca → 4.000 ml. One batch.
  v_san := dk_create_preparation('Sancocho', pg_temp.unit('l'), 'SANCOCHO');
  perform dk_create_preparation_version(v_san, jsonb_build_array(
    jsonb_build_object('ingredient_id', '61000000-0000-0000-0000-000000059a02', 'quantity', 400),
    jsonb_build_object('ingredient_id', '61000000-0000-0000-0000-000000059a08', 'quantity', 600)), 4000, pg_temp.unit('ml'));
  perform dk_register_production(v_san, 1);
  -- Patacón, the reusable sub-recipe: 300 g of green plantain → 6 units. Two batches.
  v_pat := dk_create_preparation('Patacón', pg_temp.unit('unidad'), 'PATACON');
  perform dk_create_preparation_version(v_pat, jsonb_build_array(jsonb_build_object('ingredient_id', '61000000-0000-0000-0000-000000059a07', 'quantity', 300)), 6);
  perform dk_register_production(v_pat, 2);
  insert into _ctx (key, id) values ('sancocho', v_san), ('patacon', v_pat);
  perform dk_create_recipe_version(pg_temp.k('corr'), jsonb_build_array(jsonb_build_object('ingredient_id', '61000000-0000-0000-0000-000000059a01', 'quantity', 150)));
  perform dk_create_recipe_version(pg_temp.k('limo'), jsonb_build_array(
    jsonb_build_object('ingredient_id', '61000000-0000-0000-0000-000000059a04', 'quantity', 2),
    jsonb_build_object('ingredient_id', '61000000-0000-0000-0000-000000059a05', 'quantity', 30)));
  perform dk_create_recipe_version(pg_temp.k('pata'), jsonb_build_array(jsonb_build_object('ingredient_id', v_pat, 'quantity', 3)));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 1. The composition (saved through the admin function, in any unit)
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v jsonb;
begin
  v := dk_product_composition_save(pg_temp.k('corr'), jsonb_build_array(
    jsonb_build_object('name', 'Sopa', 'minSelect', 1, 'maxSelect', 1, 'options', jsonb_build_array(
      jsonb_build_object('name', 'Sancocho', 'pricing', 'included', 'isDefault', true,
                         'componentIngredientId', pg_temp.k('sancocho'), 'componentQuantity', 350, 'componentUnitId', pg_temp.unit('ml')))),
    jsonb_build_object('name', 'Proteína', 'minSelect', 1, 'maxSelect', 1, 'options', jsonb_build_array(
      jsonb_build_object('name', 'Pollo', 'pricing', 'included', 'isDefault', true, 'componentIngredientId', '61000000-0000-0000-0000-000000059a02', 'componentQuantity', 180),
      jsonb_build_object('name', 'Res', 'pricing', 'extra', 'price', 3000, 'componentIngredientId', '61000000-0000-0000-0000-000000059a03', 'componentQuantity', 180))),
    jsonb_build_object('name', 'Bebida', 'minSelect', 1, 'maxSelect', 1, 'options', jsonb_build_array(
      jsonb_build_object('name', 'Limonada', 'pricing', 'included', 'isDefault', true, 'componentProductId', pg_temp.k('limo')),
      jsonb_build_object('name', 'Gaseosa', 'pricing', 'included', 'componentIngredientId', '61000000-0000-0000-0000-000000059a06', 'componentQuantity', 1))),
    jsonb_build_object('name', 'Acompañantes', 'minSelect', 0, 'maxSelect', 3, 'allowRepeat', true, 'options', jsonb_build_array(
      jsonb_build_object('name', 'Patacones', 'pricing', 'extra', 'price', 2000, 'componentIngredientId', pg_temp.k('patacon'), 'componentQuantity', 2),
      jsonb_build_object('name', 'Tajadas', 'pricing', 'extra', 'price', 1500, 'componentIngredientId', '61000000-0000-0000-0000-000000059a07', 'componentQuantity', 120),
      jsonb_build_object('name', 'Yuca', 'pricing', 'courtesy', 'componentIngredientId', '61000000-0000-0000-0000-000000059a08',
                         'componentQuantity', 0.15, 'componentUnitId', pg_temp.unit('kg'))))));
  insert into _ctx (key, v) values ('comp', v);
  insert into _ctx (key, id)
  select 'opt:corr:' || o.name, o.id from dk_product_options o join dk_product_option_groups g on g.id = o.group_id where g.product_id = pg_temp.k('corr');
  perform dk_product_composition_save(pg_temp.k('combo'), jsonb_build_array(
    jsonb_build_object('name', 'Bebida', 'minSelect', 1, 'maxSelect', 1, 'options', jsonb_build_array(jsonb_build_object('name', 'Jugo', 'pricing', 'included')))));
  insert into _t (area, test, expected, got) values
    ('Composición', '4 grupos: Sopa, Proteína, Bebida (obligatorios) y Acompañantes (opcional, hasta 3, repite)', 'Sopa 1-1 · Proteína 1-1 · Bebida 1-1 · Acompañantes 0-3 repite',
      (select string_agg((g ->> 'name') || ' ' || (g ->> 'minSelect') || '-' || (g ->> 'maxSelect') || case when (g ->> 'allowRepeat')::boolean then ' repite' else '' end, ' · ')
       from jsonb_array_elements(v -> 'groups') g)),
    ('Unidades', 'Sancocho 350 ml → 0,35 l (se guarda en litros); yuca 0,15 kg → 150 g', '0.35 l · 150 g',
      pg_temp.n((select component_quantity from dk_product_options where id = pg_temp.opt('Sancocho'))) || ' l · ' ||
      pg_temp.n((select component_quantity from dk_product_options where id = pg_temp.opt('Yuca'))) || ' g'),
    ('Costos', 'Costo de cada opción hoy: sancocho 0,35 l × $1.900 · res 180 g × $24 · limonada (su receta) · patacones 2 × $150 · yuca 150 g × $2',
      '665 · 4320 · 690 · 300 · 300',
      (select string_agg(pg_temp.n((o ->> 'unitCost')::numeric), ' · ' order by array_position(array['Sancocho','Res','Limonada','Patacones','Yuca'], o ->> 'name'))
       from jsonb_array_elements(v -> 'groups') g, jsonb_array_elements(g -> 'options') o where o ->> 'name' in ('Sancocho','Res','Limonada','Patacones','Yuca'))),
    ('Composición', 'Un extra sin precio, un plato que se consume a sí mismo, un insumo de otra cuenta y una unidad que no convierte se rechazan', 'invalid · invalid · invalid · no_conversion',
      pg_temp.code(format($q$select dk_product_composition_save(%L, '[{"name":"X","options":[{"name":"Y","pricing":"extra"}]}]')$q$, pg_temp.k('corr'))) || ' · ' ||
      pg_temp.code(format($q$select dk_product_composition_save(%L, '[{"name":"X","options":[{"name":"Y","componentProductId":"%s"}]}]')$q$, pg_temp.k('corr'), pg_temp.k('corr'))) || ' · ' ||
      pg_temp.code(format($q$select dk_product_composition_save(%L, '[{"name":"X","options":[{"name":"Y","componentIngredientId":"61000000-0000-0000-0000-000000059b01","componentQuantity":1}]}]')$q$, pg_temp.k('corr'))) || ' · ' ||
      pg_temp.code(format($q$select dk_product_composition_save(%L, '[{"name":"X","options":[{"name":"Y","componentIngredientId":"61000000-0000-0000-0000-000000059a01","componentQuantity":1,"componentUnitId":"%s"}]}]')$q$, pg_temp.k('corr'), pg_temp.unit('ml'))));
  perform dk_public_menu_settings_save('{"published": true, "ordersEnabled": true, "delivery": false, "pickup": true, "minOrder": 0, "paymentMethods": ["Efectivo"], "autoConfirm": true}');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. The rule: price, defaults, limits (dk_dish_configuration)
-- ---------------------------------------------------------------------------
select pg_temp.as_owner();
insert into _ctx (key, id)
select 'opt:combo:' || o.name, o.id from dk_product_options o join dk_product_option_groups g on g.id = o.group_id where g.product_id = pg_temp.k('combo');
insert into _t (area, test, expected, got) values
  ('Precio', 'Res + limonada + patacones ×2 + yuca: $18.000 + $3.000 + 2 × $2.000 = $25.000; la yuca es cortesía ($0)', '25000 · 7000 · yuca courtesy 0',
    (select (c ->> 'unitPrice') || ' · ' || (c ->> 'extras') || ' · yuca ' || (select (o ->> 'pricing') || ' ' || (o ->> 'unitPrice') from jsonb_array_elements(c -> 'options') o where o ->> 'name' = 'Yuca')
     from (select dk_dish_configuration(pg_temp.k('corr'), 18000, jsonb_build_array(pg_temp.sel('Sancocho'), pg_temp.sel('Res'), pg_temp.sel('Limonada'), pg_temp.sel('Patacones', 2), pg_temp.sel('Yuca'))) c) x)),
  ('Precio', 'Sin elegir nada: las predeterminadas (sancocho, pollo, limonada) y el precio base', '18000 · Sancocho, Pollo, Limonada',
    (select (c ->> 'unitPrice') || ' · ' || (select string_agg(o ->> 'name', ', ' order by (o ->> 'sortOrder')::int) from jsonb_array_elements(c -> 'options') o)
     from (select dk_dish_configuration(pg_temp.k('corr'), 18000, null) c) x)),
  ('Costo', 'Costo estimado: arroz 150 g ($600) + 665 + 4.320 + 690 + 2 × 300 + 300 = $7.175', '7175',
    pg_temp.n((dk_dish_configuration(pg_temp.k('corr'), 18000, jsonb_build_array(pg_temp.sel('Sancocho'), pg_temp.sel('Res'), pg_temp.sel('Limonada'), pg_temp.sel('Patacones', 2), pg_temp.sel('Yuca'))) ->> 'estimatedUnitCost')::numeric)),
  ('Reglas', 'Obligatorio sin predeterminada · más de 3 acompañantes · repetir la proteína · una opción de otro plato',
    'option_required · option_max · option_repeat · option_unavailable',
    pg_temp.code(format('select dk_dish_configuration(%L, 9000, %L)', pg_temp.k('combo'), '[]')) || ' · ' ||
    pg_temp.code(format('select dk_dish_configuration(%L, 18000, %L)', pg_temp.k('corr'), jsonb_build_array(pg_temp.sel('Patacones', 3), pg_temp.sel('Yuca')))) || ' · ' ||
    pg_temp.code(format('select dk_dish_configuration(%L, 18000, %L)', pg_temp.k('corr'), jsonb_build_array(pg_temp.sel('Res', 2)))) || ' · ' ||
    pg_temp.code(format('select dk_dish_configuration(%L, 18000, %L)', pg_temp.k('corr'), jsonb_build_array(pg_temp.sel('Jugo', 1, 'combo')))));

-- ---------------------------------------------------------------------------
-- 3. The public page and an order with options
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
set local role anon;
do $$ begin insert into _ctx (key, v) values ('menu', dk_public_menu('comp-a-prueba')); end $$;
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values
  ('Página', 'El corrientazo trae sus 4 grupos; la limonada ninguno', '4 · 0',
    (select jsonb_array_length(i -> 'groups')::text from jsonb_array_elements(pg_temp.v('menu') -> 'items') i where i ->> 'name' = 'Corrientazo') || ' · ' ||
    (select jsonb_array_length(i -> 'groups')::text from jsonb_array_elements(pg_temp.v('menu') -> 'items') i where i ->> 'name' = 'Limonada')),
  ('Página', 'Precio de cada opción para el cliente, sin costos ni recetas', 'Res extra 3000 · Yuca courtesy 0 · no',
    (select string_agg((o ->> 'name') || ' ' || (o ->> 'pricing') || ' ' || (o ->> 'price'), ' · ' order by o ->> 'name')
     from jsonb_array_elements(pg_temp.v('menu') -> 'items') i, jsonb_array_elements(i -> 'groups') g, jsonb_array_elements(g -> 'options') o
     where i ->> 'name' = 'Corrientazo' and o ->> 'name' in ('Res', 'Yuca')) || ' · ' ||
    case when (pg_temp.v('menu') -> 'items')::text ~* 'cost|component|recipe' then 'sí' else 'no' end);

select pg_temp.as_anon();
set local role anon;
do $$
declare v jsonb;
begin
  -- 2 corrientazos (res, limonada, patacones ×2, yuca) + 1 corrientazo as it comes + 1 «Patacones con hogao». The browser claims $1.
  v := pg_temp.place(pg_temp.order_json('comp-1', '3001119901', jsonb_build_array(
    jsonb_build_array('corr', 2, jsonb_build_array(pg_temp.sel('Sancocho'), pg_temp.sel('Res'), pg_temp.sel('Limonada'), pg_temp.sel('Patacones', 2), pg_temp.sel('Yuca'))),
    jsonb_build_array('corr', 1, null),
    jsonb_build_array('pata', 1, null))));
  insert into _ctx (key, v) values ('o1', v);
end $$;
reset role;
select pg_temp.as_owner();
insert into _ctx (key, id) values
  ('l1', (select oi.id from dk_order_items oi where oi.order_id = pg_temp.order_of('o1') and oi.unit_price = 25000)),
  ('l2', (select oi.id from dk_order_items oi where oi.order_id = pg_temp.order_of('o1') and oi.unit_price = 18000)),
  ('l3', (select oi.id from dk_order_items oi where oi.order_id = pg_temp.order_of('o1') and oi.product_id = pg_temp.k('pata')));
insert into _t (area, test, expected, got) values
  ('Pedido', 'Total del servidor: 2 × $25.000 + $18.000 + $8.000 = $76.000 (el navegador decía $1)', '76000 · CONFIRMADO',
    (pg_temp.v('o1') ->> 'total') || ' · ' || (pg_temp.v('o1') ->> 'status')),
  ('Pedido', 'Tres líneas: el mismo plato elegido de dos formas son dos líneas', '3 · 50000 · 18000 · 8000',
    (select count(*)::text from dk_order_items where order_id = pg_temp.order_of('o1')) || ' · ' ||
    (select line_total::int::text from dk_order_items where id = pg_temp.k('l1')) || ' · ' || (select line_total::int::text from dk_order_items where id = pg_temp.k('l2')) || ' · ' ||
    (select line_total::int::text from dk_order_items where id = pg_temp.k('l3'))),
  ('Pedido', 'Lo elegido queda en la línea (nombre, cantidad y extra del momento)', 'Sopa: Sancocho · Proteína: Res +3000 · Bebida: Limonada · Acompañantes: Patacones ×2 +2000 · Acompañantes: Yuca',
    (select string_agg(group_name || ': ' || option_name || case when quantity > 1 then ' ×' || quantity else '' end || case when unit_price > 0 then ' +' || unit_price::int else '' end, ' · ' order by sort_order)
     from dk_order_item_options where order_item_id = pg_temp.k('l1'))),
  ('Inventario', 'Reserva exacta de la línea de 2: arroz 300 g, sancocho 0,7 l, res 360 g, limón 4, azúcar 60 g, patacón 8, yuca 300 g',
    'ARROZ 300 · AZUCAR 60 · LIMON 4 · PATACON 8 · RES 360 · SANCOCHO 0.7 · YUCA 300', pg_temp.reserved(pg_temp.k('l1'))),
  ('Inventario', 'La línea sin elecciones reserva sus predeterminadas: arroz, sancocho, pollo y la limonada', 'ARROZ 150 · AZUCAR 30 · LIMON 2 · POLLO 180 · SANCOCHO 0.35', pg_temp.reserved(pg_temp.k('l2'))),
  ('Sub-receta', 'El patacón también sirve en «Patacones con hogao» (3) y sale de su stock, no del plátano', 'PATACON 3 · 1 · 2400',
    pg_temp.reserved(pg_temp.k('l3')) || ' · ' || pg_temp.n(pg_temp.stock('PATACON')) || ' · ' || pg_temp.n(pg_temp.stock('PLATANO'))),
  ('Costo', 'Cada línea guarda el costo de lo elegido: $7.175 y $4.835', '7175 · 4835',
    pg_temp.n((select estimated_unit_cost from dk_order_items where id = pg_temp.k('l1'))) || ' · ' || pg_temp.n((select estimated_unit_cost from dk_order_items where id = pg_temp.k('l2'))));

-- Insights estimates with what was chosen while nothing is consumed yet.
insert into _t (area, test, expected, got) values
  ('Insights', 'Costo estimado de la línea: 2 × $7.175 = $14.350 (antes: el costo del plato solo)', '14350 · estimated',
    (select round(cost)::text || ' · ' || cost_source from dk_insights_items(pg_temp.k('A'), current_date - 1, current_date + 1, 'America/Bogota', null, null) where item_id = pg_temp.k('l1')));

-- The customer's tracking page says what was chosen.
select pg_temp.as_anon();
set local role anon;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Seguimiento', 'El cliente ve lo que eligió en cada línea', 'Sancocho · Res · Limonada · Patacones ×2 · Yuca',
      (select i ->> 'options' from jsonb_array_elements(dk_public_order_status((pg_temp.v('o1') ->> 'token')::uuid) -> 'items') i where (i ->> 'unitPrice')::numeric = 25000));
end $$;
reset role;
select pg_temp.as_owner();

-- With the patacones nearly gone (1 left, 2 needed) the option shows as sold out.
select pg_temp.as_anon();
set local role anon;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Página', 'Con 1 patacón y 2 por porción, «Patacones» sale agotado; «Yuca» no', 'false · true',
      (select string_agg(o ->> 'available', ' · ' order by o ->> 'name')
       from jsonb_array_elements(dk_public_menu('comp-a-prueba') -> 'items') i, jsonb_array_elements(i -> 'groups') g, jsonb_array_elements(g -> 'options') o
       where i ->> 'name' = 'Corrientazo' and o ->> 'name' in ('Patacones', 'Yuca')));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. The kitchen: consumption of every component, and the real cost
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_item uuid; v_pnl jsonb;
begin
  for v_item in select id from dk_order_items where order_id = pg_temp.order_of('o1') loop
    perform dk_advance_kitchen_item(v_item);
    perform dk_advance_kitchen_item(v_item);
  end loop;
  insert into _t (area, test, expected, got) values
    ('Cocina', 'CONSUMO de la línea de 2 = lo reservado, componente por componente', 'ARROZ -300 · AZUCAR -60 · LIMON -4 · PATACON -8 · RES -360 · SANCOCHO -0.7 · YUCA -300',
      (select string_agg(i.code || ' ' || pg_temp.n(m.quantity_base_unit), ' · ' order by i.code) from dk_inventory_movements m join dk_ingredients i on i.id = m.ingredient_id
       where m.reference_type = 'order_item' and m.reference_id = pg_temp.k('l1') and m.movement_type = 'CONSUMO')),
    ('Cocina', 'Quedan: sancocho 4 − 1,05 = 2,95 l · patacón 12 − 11 = 1 · res 1.640 g · plátano 2.400 g (no se tocó al vender)', '2.95 · 1 · 1640 · 2400',
      pg_temp.n(pg_temp.stock('SANCOCHO')) || ' · ' || pg_temp.n(pg_temp.stock('PATACON')) || ' · ' || pg_temp.n(pg_temp.stock('RES')) || ' · ' || pg_temp.n(pg_temp.stock('PLATANO')));
  v_pnl := dk_finance_pnl(current_date - 1, current_date + 1);
  insert into _t (area, test, expected, got, detail) values
    ('Finanzas', 'Ventas $76.000 y costo de ventas = todo lo consumido por el pedido', '76000 · true',
      round((v_pnl ->> 'netSales')::numeric)::text || ' · ' ||
      ((v_pnl ->> 'cogs')::numeric = round((select sum(-m.quantity_base_unit * m.unit_cost) from dk_inventory_movements m
                                            where m.reference_type = 'order_item' and m.movement_type = 'CONSUMO' and m.kitchen_id = pg_temp.k('A'))))::text, v_pnl::text);
end $$;
reset role;

select pg_temp.as_owner();
insert into _t (area, test, expected, got) values
  ('Costo real', 'Costo real de la línea de 2 (consumo): $14.350 = 2 × $7.175', '14350 · real',
    (select round(cost)::text || ' · ' || cost_source from dk_insights_items(pg_temp.k('A'), current_date - 1, current_date + 1, 'America/Bogota', null, null) where item_id = pg_temp.k('l1')));

-- ---------------------------------------------------------------------------
-- 5. Cancelling gives everything back; WhatsApp takes the defaults; the cashier uses the same rule
-- ---------------------------------------------------------------------------
select pg_temp.as_anon('200.9.9.8');
set local role anon;
do $$ begin
  insert into _ctx (key, v) values ('o2', pg_temp.place(pg_temp.order_json('comp-2', '3001119902', jsonb_build_array(
    jsonb_build_array('corr', 1, jsonb_build_array(pg_temp.sel('Sancocho'), pg_temp.sel('Pollo'), pg_temp.sel('Gaseosa'), pg_temp.sel('Tajadas')))))));
end $$;
reset role;
select pg_temp.as_owner();
insert into _ctx (key, v) values ('before_cancel', jsonb_build_object('gaseosa', pg_temp.stock('GASEOSA'), 'platano', pg_temp.stock('PLATANO')));
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got, detail) values
    ('Cancelar', 'Gaseosa y tajadas: $18.000 + $1.500; reserva gaseosa 1 y plátano 120 g', '19500 · 9 · 2280',
      (pg_temp.v('o2') ->> 'total') || ' · ' || pg_temp.n(pg_temp.stock('GASEOSA')) || ' · ' || pg_temp.n(pg_temp.stock('PLATANO')), pg_temp.v('o2')::text);
  perform dk_cancel_order(pg_temp.order_of('o2'), 'Prueba');
  insert into _t (area, test, expected, got) values
    ('Cancelar', 'Al cancelar, todo lo reservado vuelve (gaseosa 10, plátano 2.400)', '10 · 2400', pg_temp.n(pg_temp.stock('GASEOSA')) || ' · ' || pg_temp.n(pg_temp.stock('PLATANO')));
end $$;
reset role;

select pg_temp.as_owner();
do $$
declare v jsonb;
begin
  v := dk_place_order_internal(pg_temp.k('A'), pg_temp.order_json('comp-wa', '3001119903', jsonb_build_array(jsonb_build_array('corr', 1, null), jsonb_build_array('corr', 1, null))), 'WHATSAPP');
  insert into _t (area, test, expected, got) values
    ('WhatsApp', 'Sin elecciones (el asistente): las predeterminadas, y las dos líneas iguales se juntan', '1 · 2 · 36000 · Sancocho, Pollo, Limonada',
      (select count(*)::text from dk_order_items where order_id = (v ->> 'orderId')::uuid) || ' · ' ||
      (select quantity::text from dk_order_items where order_id = (v ->> 'orderId')::uuid) || ' · ' || (v ->> 'total') || ' · ' ||
      (select string_agg(x.option_name, ', ' order by x.sort_order) from dk_order_item_options x join dk_order_items oi on oi.id = x.order_item_id where oi.order_id = (v ->> 'orderId')::uuid));
end $$;

insert into dk_customers (id, kitchen_id, full_name) values ('30000000-0000-0000-0000-000000059a01', pg_temp.k('A'), 'Laura Gómez');
insert into dk_orders (id, kitchen_id, customer_id, channel) values ('40000000-0000-0000-0000-000000059a01', pg_temp.k('A'), '30000000-0000-0000-0000-000000059a01', 'MANUAL');
select pg_temp.act_as(pg_temp.k('cashier'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_item uuid;
begin
  -- The cashier charges $17.000 for the dish today and picks beef: the extra comes from the rule.
  v_item := dk_order_add_item('40000000-0000-0000-0000-000000059a01', pg_temp.k('corr'), 1, jsonb_build_array(pg_temp.sel('Res')), 17000, 'Sin cebolla');
  insert into _t (area, test, expected, got) values
    ('Caja', 'Precio base de la caja + extra de la regla: $17.000 + $3.000; lo obligatorio que no eligió toma la predeterminada', '20000 · Sancocho, Res, Limonada · Sin cebolla',
      (select unit_price::int::text || ' · ' || (select string_agg(option_name, ', ' order by sort_order) from dk_order_item_options where order_item_id = v_item) || ' · ' || observation
       from dk_order_items where id = v_item)),
    ('Caja', 'La caja no edita la composición; lee la del plato', 'blocked · 4',
      pg_temp.blocked(format($q$select dk_product_composition_save(%L, '[]')$q$, pg_temp.k('corr'))) || ' · ' ||
      jsonb_array_length(dk_product_composition(pg_temp.k('corr')) -> 'groups')::text);
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. Isolation
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('B'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Aislamiento', 'Desde B: no lee ni edita la composición de A, ni agrega líneas a sus pedidos; no ve sus opciones', 'blocked · blocked · blocked · 0 · 0',
      pg_temp.blocked(format('select dk_product_composition(%L)', pg_temp.k('corr'))) || ' · ' ||
      pg_temp.blocked(format($q$select dk_product_composition_save(%L, '[]')$q$, pg_temp.k('corr'))) || ' · ' ||
      pg_temp.blocked(format('select dk_order_add_item(%L, %L, 1)', '40000000-0000-0000-0000-000000059a01', pg_temp.k('corr'))) || ' · ' ||
      (select count(*)::text from dk_product_options) || ' · ' || (select count(*)::text from dk_order_item_options));
end $$;
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
