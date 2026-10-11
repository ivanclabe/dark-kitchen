-- ADR 0052: the public menu and its orders — today's planner only, server
-- prices, every rule enforced, real orders that reach the kitchen, and nothing
-- else visible to an anonymous visitor. Rolled-back transaction.
--
--   python3 supabase/tests/run.py public_menu

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, v jsonb) on commit drop;
grant all on _t, _ctx to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', (case when p_kitchen is null then '{}'::jsonb else jsonb_build_object('x-dk-kitchen-id', p_kitchen) end)::text, true);
$$;
create or replace function pg_temp.as_anon(p_ip text default '200.1.1.1') returns void language sql as $$
  select set_config('request.jwt.claims', '{"role": "anon"}', true), set_config('request.headers', jsonb_build_object('x-forwarded-for', p_ip)::text, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.v(p_key text) returns jsonb language sql as $$ select v from _ctx where key = p_key $$;
create or replace function pg_temp.unit(p_code text) returns uuid language sql as $$ select id from dk_units where code = p_code $$;
-- The HINT code of a refusal, or 'ALLOWED'.
create or replace function pg_temp.code(p_sql text) returns text language plpgsql as $$
declare v_hint text;
begin execute p_sql; return 'ALLOWED';
exception when others then get stacked diagnostics v_hint = pg_exception_hint; return coalesce(nullif(v_hint, ''), 'error: ' || sqlerrm); end;
$$;
create or replace function pg_temp.blocked(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return 'blocked'; end;
$$;
-- An order payload: lines as [productKey, quantity, (price the browser claims)].
create or replace function pg_temp.order_json(p_key text, p_phone text, p_lines jsonb, p_extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('idempotencyKey', p_key, 'customer', jsonb_build_object('name', 'Ana Ruiz', 'phone', p_phone),
    'fulfillment', 'delivery', 'address', 'Calle 10 # 20-30', 'reference', 'Casa azul', 'paymentMethod', 'Efectivo',
    'items', (select jsonb_agg(jsonb_build_object('productId', pg_temp.k(l ->> 0), 'quantity', (l ->> 1)::integer, 'price', 1, 'note', l ->> 2)) from jsonb_array_elements(p_lines) l))
    || p_extra
$$;
create or replace function pg_temp.place(p_order jsonb) returns jsonb language sql as $$ select dk_public_place_order('menu-a-prueba', p_order) $$;
grant execute on function pg_temp.place(jsonb), pg_temp.order_json(text, text, jsonb, jsonb), pg_temp.code(text), pg_temp.k(text), pg_temp.v(text), pg_temp.blocked(text) to anon;

-- An owner with two accounts.
insert into auth.users (id, email, aud, role) values ('00000000-0000-0000-0000-000000052a01', 'duena.menu@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values ('10000000-0000-0000-0000-000000052a01', '00000000-0000-0000-0000-000000052a01', 'Dueña', true);
insert into dk_organizations (slug, name, owner_user_id, sector, category) values ('grupo-menu', 'Grupo Menú', '10000000-0000-0000-0000-000000052a01', 'fast_food', 'burgers');
insert into _ctx (key, id) values ('org', (select id from dk_organizations where slug = 'grupo-menu')), ('owner', '00000000-0000-0000-0000-000000052a01');
select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('A', dk_create_kitchen('Menú A', 'menu-a-prueba', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();
update dk_subscriptions set plan_key = 'business' where organization_id = pg_temp.k('org');
select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('B', dk_create_kitchen('Menú B', 'menu-b-prueba', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();
insert into _ctx (key, v) values ('today', to_jsonb((now() at time zone 'America/Bogota')::date));

-- Catalog of A: soup (no inventory), burger (150 g of meat, 400 g in stock = 2), dessert (limit 2),
-- juice (from later today), sold-out dish, a dish without recipe that uses inventory, and one not planned today.
insert into dk_product_categories (id, kitchen_id, name) values
  ('51000000-0000-0000-0000-000000052a01', pg_temp.k('A'), 'Sopas'), ('51000000-0000-0000-0000-000000052a02', pg_temp.k('A'), 'Postres');
insert into dk_ingredients (id, kitchen_id, code, name, base_unit_id, avg_cost) values
  ('61000000-0000-0000-0000-000000052a01', pg_temp.k('A'), 'CARNE', 'Carne', pg_temp.unit('g'), 10);
insert into dk_inventory_movements (ingredient_id, movement_type, quantity_base_unit, unit_cost, kitchen_id) values
  ('61000000-0000-0000-0000-000000052a01', 'COMPRA', 400, 10, pg_temp.k('A'));
insert into dk_products (id, kitchen_id, code, name, price, estimated_cost, category_id, uses_inventory, description) values
  ('52000000-0000-0000-0000-000000052a01', pg_temp.k('A'), 'SOPA', 'Sopa', 6000, 1234, '51000000-0000-0000-0000-000000052a01', false, 'Del día'),
  ('52000000-0000-0000-0000-000000052a02', pg_temp.k('A'), 'HAMB', 'Hamburguesa', 20000, 0, null, true, null),
  ('52000000-0000-0000-0000-000000052a03', pg_temp.k('A'), 'POST', 'Postre', 5000, 0, '51000000-0000-0000-0000-000000052a02', false, null),
  ('52000000-0000-0000-0000-000000052a04', pg_temp.k('A'), 'JUGO', 'Jugo', 4000, 0, null, false, null),
  ('52000000-0000-0000-0000-000000052a05', pg_temp.k('A'), 'AGOT', 'Agotado', 9000, 0, null, false, null),
  ('52000000-0000-0000-0000-000000052a06', pg_temp.k('A'), 'ESPE', 'Especial', 15000, 0, null, true, null),
  ('52000000-0000-0000-0000-000000052a07', pg_temp.k('A'), 'NOPL', 'No planificado', 7000, 0, null, false, null);
insert into _ctx (key, id) values ('sopa', '52000000-0000-0000-0000-000000052a01'), ('hamb', '52000000-0000-0000-0000-000000052a02'),
  ('postre', '52000000-0000-0000-0000-000000052a03'), ('jugo', '52000000-0000-0000-0000-000000052a04'), ('agotado', '52000000-0000-0000-0000-000000052a05'),
  ('especial', '52000000-0000-0000-0000-000000052a06'), ('noplan', '52000000-0000-0000-0000-000000052a07');
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin perform dk_create_recipe_version(pg_temp.k('hamb'), '[{"ingredient_id": "61000000-0000-0000-0000-000000052a01", "quantity": 150}]'); end $$;
reset role;
select pg_temp.as_owner();
insert into dk_menu_plan_items (kitchen_id, plan_date, product_id, display_order, is_active, special_price, unit_limit, start_time) values
  (pg_temp.k('A'), (pg_temp.v('today') #>> '{}')::date, pg_temp.k('sopa'), 1, true, 5000, null, null),
  (pg_temp.k('A'), (pg_temp.v('today') #>> '{}')::date, pg_temp.k('hamb'), 2, true, null, null, null),
  (pg_temp.k('A'), (pg_temp.v('today') #>> '{}')::date, pg_temp.k('postre'), 3, true, null, 2, null),
  (pg_temp.k('A'), (pg_temp.v('today') #>> '{}')::date, pg_temp.k('jugo'), 4, true, null, null, '23:59'),
  (pg_temp.k('A'), (pg_temp.v('today') #>> '{}')::date, pg_temp.k('agotado'), 5, false, null, null, null),
  (pg_temp.k('A'), (pg_temp.v('today') #>> '{}')::date, pg_temp.k('especial'), 6, true, null, null, null),
  -- Yesterday's plan and the other account never show.
  (pg_temp.k('A'), (pg_temp.v('today') #>> '{}')::date - 1, pg_temp.k('noplan'), 1, true, null, null, null);

-- Settings (as the owner, staff RPC): published with orders, delivery 3.000, minimum 8.000.
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_public_menu_settings_save('{"published": true, "ordersEnabled": true, "delivery": true, "pickup": true, "deliveryFee": 3000, "minOrder": 8000, "paymentMethods": ["Efectivo", "Transferencia"], "transferInstructions": "Nequi 300 000 0000", "autoConfirm": true}');
  insert into _t (area, test, expected, got) values ('Configuración', 'El personal lee las opciones', 'true · 3000 · Efectivo,Transferencia',
    (dk_public_menu_settings() ->> 'published') || ' · ' || (dk_public_menu_settings() ->> 'deliveryFee') || ' · ' ||
    (select string_agg(x, ',') from jsonb_array_elements_text(dk_public_menu_settings() -> 'paymentMethods') x));
end $$;
reset role;
select pg_temp.as_owner();

-- ---------------------------------------------------------------------------
-- 1. The public page (anonymous)
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
set local role anon;
do $$
declare v jsonb := dk_public_menu('menu-a-prueba');
begin
  insert into _ctx (key, v) values ('menu', v);
end $$;
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values
  ('Página', 'Solo los platos programados hoy (6), no el de ayer', '6', jsonb_array_length(pg_temp.v('menu') -> 'items')::text),
  ('Página', 'Precio promocional y el normal tachado', '5000 · 6000',
    (select (i ->> 'price') || ' · ' || (i ->> 'regularPrice') from jsonb_array_elements(pg_temp.v('menu') -> 'items') i where i ->> 'name' = 'Sopa')),
  ('Página', 'Disponibilidad por plato', 'Agotado:sold_out · Jugo:later · Postre:available(2) · Sopa:available',
    (select string_agg((i ->> 'name') || ':' || (i ->> 'availability') || coalesce('(' || (i ->> 'remaining') || ')', ''), ' · ' order by i ->> 'name')
     from jsonb_array_elements(pg_temp.v('menu') -> 'items') i where i ->> 'name' in ('Agotado', 'Jugo', 'Postre', 'Sopa'))),
  ('Página', 'Categorías en el orden del planificador', 'Sopas · Otros · Postres',
    (select string_agg(c, ' · ' order by o) from (select i ->> 'category' as c, min((i ->> 'categoryOrder')::int) as o from jsonb_array_elements(pg_temp.v('menu') -> 'items') i group by 1) x)),
  ('Página', 'Nunca el costo ni la receta', 'no', case when pg_temp.v('menu')::text ~* 'estimated|cost|1234|recipe' then 'sí' else 'no' end),
  ('Página', 'Opciones de pedido', 'true · 3000 · 8000', (pg_temp.v('menu') #>> '{ordering,enabled}') || ' · ' || (pg_temp.v('menu') #>> '{ordering,deliveryFee}') || ' · ' || (pg_temp.v('menu') #>> '{ordering,minOrder}'));

select pg_temp.as_anon();
set local role anon;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Página', 'Una dirección que no existe', 'false', dk_public_menu('no-existe') ->> 'found'),
    ('Página', 'Una cuenta sin menú publicado', 'false', dk_public_menu('menu-b-prueba') ->> 'found');
end $$;
reset role;
select pg_temp.as_owner();

-- ---------------------------------------------------------------------------
-- 2. Orders
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
set local role anon;
do $$
declare v jsonb;
begin
  -- 2 soups at «$1» (the browser lies): the server charges 5.000 each + 3.000 delivery.
  v := pg_temp.place(pg_temp.order_json('k-1', '3001112233', '[["sopa", 2, "sin cilantro"]]'));
  insert into _ctx (key, v) values ('o1', v);
  insert into _t (area, test, expected, got) values
    ('Pedido', 'El servidor pone los precios y el domicilio', '10000 · 3000 · 13000', (v ->> 'subtotal') || ' · ' || (v ->> 'deliveryFee') || ' · ' || (v ->> 'total')),
    ('Pedido', 'Confirmado solo (va a cocina)', 'true · CONFIRMADO', (v ->> 'confirmed') || ' · ' || (v ->> 'status'));
  v := pg_temp.place(pg_temp.order_json('k-1', '3001112233', '[["sopa", 2]]'));
  insert into _t (area, test, expected, got) values ('Pedido', 'Enviar lo mismo otra vez: el mismo pedido', 'true · sí',
    (v ->> 'repeated') || ' · ' || case when v ->> 'orderNumber' = pg_temp.v('o1') ->> 'orderNumber' then 'sí' else 'no' end);

  insert into _t (area, test, expected, got) values
    ('Reglas', 'Más postres de los que quedan', 'limit', pg_temp.code($q$select pg_temp.place(pg_temp.order_json('k-2', '3002223344', '[["postre", 3], ["sopa", 1]]'))$q$)),
    ('Reglas', 'Los 2 que quedan', 'ALLOWED', pg_temp.code($q$select pg_temp.place(pg_temp.order_json('k-3', '3002223344', '[["postre", 2], ["sopa", 1]]'))$q$)),
    ('Reglas', 'Ya no queda postre', 'unavailable', pg_temp.code($q$select pg_temp.place(pg_temp.order_json('k-4', '3002223344', '[["postre", 1], ["sopa", 2]]'))$q$)),
    ('Reglas', 'Jugo: todavía no es su hora', 'unavailable', pg_temp.code($q$select pg_temp.place(pg_temp.order_json('k-5', '3003334455', '[["jugo", 3]]'))$q$)),
    ('Reglas', 'Plato agotado hoy', 'unavailable', pg_temp.code($q$select pg_temp.place(pg_temp.order_json('k-6', '3003334455', '[["agotado", 1]]'))$q$)),
    ('Reglas', 'Plato que no está en el menú de hoy', 'unavailable', pg_temp.code($q$select pg_temp.place(pg_temp.order_json('k-7', '3003334455', '[["noplan", 2]]'))$q$)),
    ('Reglas', 'Hamburguesas: 3 necesitan 450 g y hay 400', 'stock', pg_temp.code($q$select pg_temp.place(pg_temp.order_json('k-8', '3004445566', '[["hamb", 3]]'))$q$)),
    ('Reglas', '2 hamburguesas sí', 'ALLOWED', pg_temp.code($q$select pg_temp.place(pg_temp.order_json('k-9', '3004445566', '[["hamb", 2]]'))$q$)),
    ('Reglas', 'Otra hamburguesa: quedan 100 g reservables', 'stock', pg_temp.code($q$select pg_temp.place(pg_temp.order_json('k-10', '3004445566', '[["hamb", 1]]'))$q$)),
    ('Reglas', 'Menos que el pedido mínimo (8.000)', 'min_order', pg_temp.code($q$select pg_temp.place(pg_temp.order_json('k-11', '3005556677', '[["sopa", 1]]'))$q$)),
    ('Datos', 'Domicilio sin dirección', 'invalid', pg_temp.code($q$select pg_temp.place(pg_temp.order_json('k-12', '3005556677', '[["sopa", 2]]', '{"address": ""}'))$q$)),
    ('Datos', 'Forma de pago que el negocio no acepta', 'invalid', pg_temp.code($q$select pg_temp.place(pg_temp.order_json('k-13', '3005556677', '[["sopa", 2]]', '{"paymentMethod": "Tarjeta"}'))$q$)),
    ('Datos', 'Celular inválido', 'invalid', pg_temp.code($q$select pg_temp.place(pg_temp.order_json('k-14', '12', '[["sopa", 2]]'))$q$)),
    ('Datos', 'Robot (campo trampa lleno)', 'invalid', pg_temp.code($q$select pg_temp.place(pg_temp.order_json('k-15', '3005556677', '[["sopa", 2]]', '{"website": "x"}'))$q$));

  v := pg_temp.place(pg_temp.order_json('k-16', '3006667788', '[["sopa", 2]]', '{"fulfillment": "pickup", "address": ""}'));
  insert into _ctx (key, v) values ('pickup', v);
  insert into _t (area, test, expected, got) values ('Pedido', 'Recoger: sin dirección ni domicilio', '0 · 10000', (v ->> 'deliveryFee') || ' · ' || (v ->> 'total'));

  -- A dish that uses inventory but has no recipe: received, but it cannot be confirmed → waits, flagged.
  v := pg_temp.place(pg_temp.order_json('k-17', '3007778899', '[["especial", 1]]'));
  insert into _ctx (key, v) values ('review', v);
  insert into _t (area, test, expected, got) values ('Cocina', 'No se pudo confirmar: queda por confirmar', 'false · NUEVO', (v ->> 'confirmed') || ' · ' || (v ->> 'status'));
end $$;
reset role;
select pg_temp.as_owner();

insert into _t (area, test, expected, got) values
  ('Cocina', 'El pedido confirmado tiene su comanda en Cocina', '1',
    (select count(*)::text from dk_kitchen_tickets t join dk_orders o on o.id = t.order_id where o.public_token = (pg_temp.v('o1') ->> 'token')::uuid)),
  ('Cocina', 'Canal Menú web, entrega y dirección en el pedido', 'WEB · delivery · Calle 10 # 20-30 · Casa azul · Efectivo',
    (select channel || ' · ' || fulfillment || ' · ' || delivery_address || ' · ' || delivery_reference || ' · ' || payment_method from dk_orders where public_token = (pg_temp.v('o1') ->> 'token')::uuid)),
  ('Cocina', 'La nota del plato llega a la cocina', 'sin cilantro',
    (select observation from dk_order_items i join dk_orders o on o.id = i.order_id where o.public_token = (pg_temp.v('o1') ->> 'token')::uuid)),
  ('Cocina', 'Las 2 hamburguesas reservaron 300 g', '300',
    (select sum(quantity_base_unit)::numeric(12, 0)::text from dk_inventory_reservations where ingredient_id = '61000000-0000-0000-0000-000000052a01')),
  ('Cocina', 'El que no se pudo confirmar queda marcado para revisar', 'true',
    (select requires_review::text from dk_orders where public_token = (pg_temp.v('review') ->> 'token')::uuid)),
  ('Clientes', 'El cliente queda en Clientes con su celular y su dirección', 'Ana Ruiz · +573001112233 · Calle 10 # 20-30',
    (select full_name || ' · ' || phone || ' · ' || address from dk_customers where kitchen_id = pg_temp.k('A') and phone = '+573001112233')),
  ('Clientes', 'Un mismo celular es un mismo cliente', '1', (select count(*)::text from dk_customers where kitchen_id = pg_temp.k('A') and phone = '+573001112233')),
  ('Pedido', 'Recoger: nota en el pedido', 'Recoge en el local', (select notes from dk_orders where public_token = (pg_temp.v('pickup') ->> 'token')::uuid));

-- ---------------------------------------------------------------------------
-- 3. Tracking, limits, closed, disabled
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
set local role anon;
do $$
declare v jsonb; i integer;
begin
  v := dk_public_order_status((pg_temp.v('o1') ->> 'token')::uuid);
  insert into _t (area, test, expected, got) values
    ('Seguimiento', 'Con su código: estado, platos y total', 'CONFIRMADO · Sopa x2 · 13000',
      (v ->> 'status') || ' · ' || (v #>> '{items,0,name}') || ' x' || (v #>> '{items,0,quantity}') || ' · ' || ((v ->> 'total')::numeric)::text),
    ('Seguimiento', 'Un código inventado no muestra nada', 'null', coalesce(dk_public_order_status(gen_random_uuid())::text, 'null'));
  -- Same phone: 5 per hour (2 already from this phone? no: a fresh one).
  for i in 1..5 loop
    perform pg_temp.place(pg_temp.order_json('rl-' || i, '3009990000', '[["sopa", 2]]'));
  end loop;
  insert into _t (area, test, expected, got) values ('Límites', 'El sexto pedido del mismo celular en una hora', 'rate_limited',
    pg_temp.code($q$select pg_temp.place(pg_temp.order_json('rl-6', '3009990000', '[["sopa", 2]]'))$q$));
end $$;
reset role;
select pg_temp.as_owner();

-- Closed now (every day closed): no orders, and it says so.
insert into dk_kitchen_hours (kitchen_id, day_of_week, is_open, opens_at, closes_at)
select pg_temp.k('A'), d, false, null, null from unnest(enum_range(null::dk_day_of_week)) d
on conflict do nothing;
select pg_temp.as_anon('200.1.1.2');
set local role anon;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Horario', 'Cocina cerrada: no recibe', 'closed', pg_temp.code($q$select pg_temp.place(pg_temp.order_json('c-1', '3011112222', '[["sopa", 2]]'))$q$)),
    ('Horario', 'La página dice que está cerrada', 'closed', dk_public_menu('menu-a-prueba') #>> '{business,openState,state}');
end $$;
reset role;
select pg_temp.as_owner();
delete from dk_kitchen_hours where kitchen_id = pg_temp.k('A');

update dk_storefronts set web_orders_enabled = false where kitchen_id = pg_temp.k('A');
select pg_temp.as_anon('200.1.1.3');
set local role anon;
do $$ begin
  insert into _t (area, test, expected, got) values ('Opciones', 'Sin pedidos por la web: no recibe', 'not_accepting',
    pg_temp.code($q$select pg_temp.place(pg_temp.order_json('d-1', '3012223333', '[["sopa", 2]]'))$q$));
end $$;
reset role;
select pg_temp.as_owner();
update dk_storefronts set web_orders_enabled = true, web_auto_confirm = false where kitchen_id = pg_temp.k('A');
select pg_temp.as_anon('200.1.1.3');
set local role anon;
do $$ begin
  insert into _t (area, test, expected, got) values ('Opciones', 'Sin confirmar solos: llega a Por confirmar', 'NUEVO',
    pg_temp.place(pg_temp.order_json('d-2', '3012223333', '[["sopa", 2]]')) ->> 'status');
end $$;
reset role;
select pg_temp.as_owner();

-- Pick up: cooked, then handed over at the counter (no Despacho); a delivery order cannot.
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_pick uuid := (select id from dk_orders where public_token = (pg_temp.v('pickup') ->> 'token')::uuid);
        v_item uuid := (select id from dk_order_items where order_id = (select id from dk_orders where public_token = (pg_temp.v('pickup') ->> 'token')::uuid));
begin
  perform dk_advance_kitchen_item(v_item);
  perform dk_advance_kitchen_item(v_item);
  perform dk_mark_picked_up(v_pick);
  insert into _t (area, test, expected, got) values
    ('Recoger', 'Listo → entregado en el mostrador', 'ENTREGADO', (select status::text from dk_orders where id = v_pick)),
    ('Recoger', 'Un pedido a domicilio no se entrega así', 'error: Este pedido es a domicilio: se entrega despachándolo',
      pg_temp.code(format('select dk_mark_picked_up(%L)', (select id from dk_orders where public_token = (pg_temp.v('o1') ->> 'token')::uuid))));
end $$;
reset role;
select pg_temp.as_anon();
set local role anon;
do $$ begin
  insert into _t (area, test, expected, got) values ('Recoger', 'El cliente lo ve entregado', 'ENTREGADO', dk_public_order_status((pg_temp.v('pickup') ->> 'token')::uuid) ->> 'status');
end $$;
reset role;
select pg_temp.as_owner();

-- ---------------------------------------------------------------------------
-- 4. What an anonymous visitor can NOT do
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
set local role anon;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Seguridad', 'Leer pedidos, clientes o vitrinas: nada (0 filas o bloqueado)', '0 · 0 · blocked',
      (select count(*)::text from dk_orders) || ' · ' || (select count(*)::text from dk_customers) || ' · ' || pg_temp.blocked('select count(*) from dk_storefronts')),
    ('Seguridad', 'Usar las funciones internas', 'blocked · blocked · blocked',
      pg_temp.blocked(format('select * from dk_public_menu_items(%L)', pg_temp.k('A'))) || ' · ' ||
      pg_temp.blocked(format('select dk_confirm_order_internal(%L)', gen_random_uuid())) || ' · ' ||
      pg_temp.blocked('select count(*) from dk_public_order_attempts')),
    ('Seguridad', 'Confirmar o leer la configuración como personal', 'blocked · blocked',
      pg_temp.blocked(format('select dk_confirm_order(%L)', gen_random_uuid())) || ' · ' || pg_temp.blocked('select dk_public_menu_settings()'));
end $$;
reset role;
select pg_temp.as_owner();

-- The staff confirmation still checks its permission.
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('B'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Seguridad', 'Desde otra cuenta no se confirma un pedido de A', 'blocked',
    pg_temp.blocked(format('select dk_confirm_order(%L)', (select id from dk_orders where public_token = (pg_temp.v('review') ->> 'token')::uuid))));
end $$;
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
