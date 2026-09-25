-- Pruebas de aislamiento multi-cocina (ADR 0007, sección 6).
--
-- Corre TODO dentro de una transacción que se revierte: crea una Cocina B,
-- usuarios de prueba y datos, intenta cruzar Cocinas por todas las vías
-- (lectura, escritura, RPC, encabezado falso) y devuelve una fila por prueba
-- con PASS/FAIL. No deja rastro en la base.
--
--   supabase db query --linked -f supabase/tests/multikitchen_isolation.sql

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid) on commit drop;
grant all on _t, _ctx to authenticated;
grant usage on sequence _t_n_seq to authenticated;

-- Contexto: Cocina A = dark-kitchen-1 (datos reales), Cocina B nueva, usuarios de prueba.
insert into _ctx values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx values ('ivan', (select id from auth.users where email = 'ivanclabe@gmail.com'));

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'cajero.a@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', 'cajero.b@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'cocina.a@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ab', 'multi@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ff', 'ajeno@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, role, active) values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Cajero A', 'CASHIER', true),
  ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'Cajero B', 'CASHIER', true),
  ('10000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2', 'Cocina A', 'KITCHEN', true),
  ('10000000-0000-0000-0000-0000000000ab', '00000000-0000-0000-0000-0000000000ab', 'Multi', 'CASHIER', true);

-- Cocina B (como superusuario) y membresías.
select set_config('request.jwt.claims', json_build_object('sub', (select id from _ctx where key = 'ivan'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _ctx select 'B', dk_create_kitchen('Cocina Prueba B', 'cocina-prueba-b');
reset role;

insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
select k.id, u.id, r.id
from (values
  ('A', '10000000-0000-0000-0000-0000000000a1'::uuid, 'CASHIER'),
  ('B', '10000000-0000-0000-0000-0000000000b1'::uuid, 'CASHIER'),
  ('A', '10000000-0000-0000-0000-0000000000a2'::uuid, 'KITCHEN'),
  ('A', '10000000-0000-0000-0000-0000000000ab'::uuid, 'CASHIER'),
  ('B', '10000000-0000-0000-0000-0000000000ab'::uuid, 'INVENTORY')
) as m(kitchen, user_id, role_key)
join _ctx k on k.key = m.kitchen
join dk_users u on u.id = m.user_id
join dk_roles r on r.is_system and r.key = m.role_key;

insert into dk_customers (id, kitchen_id, full_name, phone)
  values ('20000000-0000-0000-0000-00000000000a', (select id from _ctx where key = 'A'), 'Cliente Tel A', '3999999999');
insert into _ctx values ('A_phone_customer', '20000000-0000-0000-0000-00000000000a');
-- Un pedido de A que ya está en cocina (tiene comanda), para poder priorizarlo.
insert into _ctx select 'A_order', o.id from dk_orders o join dk_kitchen_tickets t on t.order_id = o.id
  where o.kitchen_id = (select id from _ctx where key = 'A') and o.status in ('CONFIRMADO', 'EN_PREPARACION', 'LISTO') order by o.created_at limit 1;
insert into _ctx select 'A_customer', customer_id from dk_orders where id = (select id from _ctx where key = 'A_order');
insert into _ctx select 'A_ingredient', id from dk_ingredients where kitchen_id = (select id from _ctx where key = 'A') limit 1;

-- Helper: actuar como un usuario, con o sin encabezado de Cocina.
create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', case when p_kitchen is null then '{}' else json_build_object('x-dk-kitchen-id', p_kitchen)::text end, true);
$$;

-- Datos de la Cocina B (como Cajero B, con encabezado B): mismo teléfono que un cliente de A.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1', (select id from _ctx where key = 'B'));
set local role authenticated;
do $$
declare v_customer uuid;
begin
  v_customer := dk_find_or_create_customer_by_phone('3999999999', 'Cliente B');
  insert into _ctx values ('B_customer', v_customer);
  insert into dk_orders (customer_id) values (v_customer);
  insert into _ctx select 'B_order', id from dk_orders order by created_at desc limit 1;
  insert into _t (area, test, expected, got)
    select 'Escritura', 'Cajero B: pedido nuevo cae en B con #1000', 'B #1000',
      case when kitchen_id = (select id from _ctx where key = 'B') then 'B' else 'A' end || ' #' || order_number
    from dk_orders where id = (select id from _ctx where key = 'B_order');
  insert into _t (area, test, expected, got) values ('Escritura', 'Mismo teléfono en B crea OTRO cliente (no reutiliza el de A)', 'otro',
    case when v_customer = (select id from _ctx where key = 'A_phone_customer') then 'el de A' when v_customer is null then 'ninguno' else 'otro' end);
end;
$$;
reset role;

-- 1. Cajero B con encabezado B no ve NADA de A en ninguna tabla.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1', (select id from _ctx where key = 'B'));
set local role authenticated;
do $$
declare v_table text; v_count bigint; v_a uuid := (select id from _ctx where key = 'A');
begin
  foreach v_table in array array[
    'dk_ingredient_categories', 'dk_suppliers', 'dk_ingredients', 'dk_ingredient_purchase_units', 'dk_supplier_ingredients',
    'dk_ingredient_stock', 'dk_inventory_movements', 'dk_inventory_reservations', 'dk_purchases', 'dk_purchase_items',
    'dk_attachments', 'dk_product_categories', 'dk_products', 'dk_recipes', 'dk_recipe_items', 'dk_menu_plan_items',
    'dk_menus', 'dk_menu_items', 'dk_daily_availability', 'dk_weekly_menu_items', 'dk_customers', 'dk_orders',
    'dk_order_items', 'dk_order_status_history', 'dk_kitchen_tickets', 'dk_delivery_riders', 'dk_deliveries',
    'dk_order_payments', 'dk_kitchen_sla_settings', 'dk_kitchen_hours', 'dk_kitchen_hour_exceptions', 'dk_ai_features',
    'dk_ai_insights', 'dk_audit_log'
  ] loop
    execute format('select count(*) from public.%I where kitchen_id = $1', v_table) into v_count using v_a;
    insert into _t (area, test, expected, got) values ('Lectura', 'Cajero B (B) ve filas de A en ' || v_table, '0', v_count::text);
  end loop;
  insert into _t (area, test, expected, got) values ('Lectura', 'Cajero B (B) en dk_receivables: pedidos de A', '0',
    (select count(*)::text from dk_receivables where order_id in (select id from dk_orders where kitchen_id = v_a)));
  insert into _t (area, test, expected, got) values ('Lectura', 'Cajero B (B): cocinas visibles', '1', (select count(*)::text from dk_kitchens));
  insert into _t (area, test, expected, got) values ('Lectura', 'Cajero B (B): perfiles de otros visibles', '0',
    (select count(*)::text from dk_users where auth_user_id <> auth.uid()));
end;
$$;
reset role;

-- 2. Encabezado falso: Cajero A pide la Cocina B.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1', (select id from _ctx where key = 'B'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Encabezado', 'Cajero A con encabezado de B: Cocina activa', 'NULL', coalesce(dk_current_kitchen_id()::text, 'NULL'));
  insert into _t (area, test, expected, got) values ('Encabezado', 'Cajero A con encabezado de B: pedidos visibles', '0', (select count(*)::text from dk_orders));
  insert into _t (area, test, expected, got) values ('Encabezado', 'Cajero A con encabezado de B: clientes visibles', '0', (select count(*)::text from dk_customers));
  begin
    insert into dk_customers (full_name) values ('Intruso');
    insert into _t (area, test, expected, got) values ('Encabezado', 'Cajero A con encabezado de B: crear cliente', 'bloqueado', 'PERMITIDO');
  exception when others then
    insert into _t (area, test, expected, got, detail) values ('Encabezado', 'Cajero A con encabezado de B: crear cliente', 'bloqueado', 'bloqueado', sqlerrm);
  end;
end $$;
reset role;

-- Encabezado con basura
select set_config('request.headers', '{"x-dk-kitchen-id": "no-es-un-uuid"}', true);
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Encabezado', 'Encabezado inválido: Cocina activa', 'NULL', coalesce(dk_current_kitchen_id()::text, 'NULL'));
end $$;
reset role;

-- 3. Sin encabezado: no hay Cocina activa (el modo compatibilidad se retiró en la Fase 6).
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1', null);
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Sin encabezado', 'Cajero A (una sola Cocina): Cocina activa', 'NULL', coalesce(dk_current_kitchen_id()::text, 'NULL'));
  insert into _t (area, test, expected, got) values ('Sin encabezado', 'Cajero A: pedidos visibles', '0', (select count(*)::text from dk_orders));
  begin perform dk_set_ticket_priority((select id from _ctx where key = 'A_order'), 5);
    insert into _t (area, test, expected, got) values ('Sin encabezado', 'Cajero A: RPC sobre un pedido de A', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Sin encabezado', 'Cajero A: RPC sobre un pedido de A', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000ab', null);
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Sin encabezado', 'Usuario con 2 Cocinas: Cocina activa', 'NULL', coalesce(dk_current_kitchen_id()::text, 'NULL'));
  insert into _t (area, test, expected, got) values ('Sin encabezado', 'Usuario con 2 Cocinas: pedidos visibles', '0', (select count(*)::text from dk_orders));
  insert into _t (area, test, expected, got) values ('Sin encabezado', 'Sigue viendo sus Cocinas (selector)', '2', (select count(*)::text from dk_my_kitchens()));
end $$;
reset role;

-- 4. Mismo usuario, distinto rol por Cocina.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000ab', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Roles', 'Multi en A (Caja): ve pedidos', 'sí', case when dk_can('orders.view') then 'sí' else 'no' end);
  insert into _t (area, test, expected, got) values ('Roles', 'Multi en A (Caja): ve inventario', 'no', case when dk_can('inventory.view') then 'sí' else 'no' end);
end $$;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000ab', (select id from _ctx where key = 'B'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Roles', 'Multi en B (Inventario): ve pedidos', 'no', case when dk_can('orders.view') then 'sí' else 'no' end);
  insert into _t (area, test, expected, got) values ('Roles', 'Multi en B (Inventario): ve inventario', 'sí', case when dk_can('inventory.view') then 'sí' else 'no' end);
  insert into _t (area, test, expected, got) values ('Roles', 'Multi en B: pedidos visibles', '0', (select count(*)::text from dk_orders));
end $$;
reset role;

-- 5. Funciones del servidor sobre datos de otra Cocina (Cajero B, encabezado B).
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1', (select id from _ctx where key = 'B'));
set local role authenticated;
do $$
declare v_order uuid := (select id from _ctx where key = 'A_order');
begin
  begin perform dk_cancel_order(v_order, 'intento');
    insert into _t (area, test, expected, got) values ('RPC', 'Cajero B cancela pedido de A', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('RPC', 'Cajero B cancela pedido de A', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin perform dk_register_payment(v_order, 1000, 'efectivo', null);
    insert into _t (area, test, expected, got) values ('RPC', 'Cajero B registra pago en pedido de A', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('RPC', 'Cajero B registra pago en pedido de A', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin perform dk_confirm_order(v_order);
    insert into _t (area, test, expected, got) values ('RPC', 'Cajero B confirma pedido de A', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('RPC', 'Cajero B confirma pedido de A', 'bloqueado', 'bloqueado', sqlerrm); end;
end;
$$;
reset role;

-- Superusuario operando en B tampoco toca A desde B.
select pg_temp.act_as((select id from _ctx where key = 'ivan'), (select id from _ctx where key = 'B'));
set local role authenticated;
do $$
begin
  insert into _t (area, test, expected, got) values ('Superusuario', 'Superusuario con encabezado B: Cocina activa = B', 'B',
    case dk_current_kitchen_id() when (select id from _ctx where key = 'B') then 'B' else coalesce(dk_current_kitchen_id()::text, 'NULL') end);
  insert into _t (area, test, expected, got) values ('Superusuario', 'Superusuario en B: pedidos de A visibles', '0',
    (select count(*)::text from dk_orders where kitchen_id = (select id from _ctx where key = 'A')));
  insert into _t (area, test, expected, got) values ('Superusuario', 'Superusuario en B: ve el pedido de B', '1', (select count(*)::text from dk_orders));
  begin perform dk_register_waste((select id from _ctx where key = 'A_ingredient'), 1, 'OTRO', 'intento');
    insert into _t (area, test, expected, got) values ('Superusuario', 'Superusuario en B registra merma de insumo de A', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Superusuario', 'Superusuario en B registra merma de insumo de A', 'bloqueado', 'bloqueado', sqlerrm); end;
end;
$$;
reset role;

-- 6. Lo legítimo sigue funcionando (Cocina A).
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$
begin
  begin perform dk_set_ticket_priority((select id from _ctx where key = 'A_order'), 1);
    insert into _t (area, test, expected, got) values ('Legítimo', 'Cocina A prioriza pedido de A', 'permitido', 'permitido');
  exception when others then insert into _t (area, test, expected, got) values ('Legítimo', 'Cocina A prioriza pedido de A', 'permitido', 'BLOQUEADO: ' || sqlerrm); end;
  begin perform dk_cancel_order((select id from _ctx where key = 'B_order'), 'intento');
    insert into _t (area, test, expected, got) values ('Legítimo', 'Cocina A cancela pedido de B', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Legítimo', 'Cocina A cancela pedido de B', 'bloqueado', 'bloqueado', sqlerrm); end;
  insert into _t (area, test, expected, got) values ('Legítimo', 'Cocina A no ve clientes (como antes)', '0', (select count(*)::text from dk_customers));
end;
$$;
reset role;

select pg_temp.act_as((select id from _ctx where key = 'ivan'), null);
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Sin encabezado', 'Superusuario sin encabezado: pedidos visibles', '0', (select count(*)::text from dk_orders));
end $$;
reset role;

select pg_temp.act_as((select id from _ctx where key = 'ivan'), (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Legítimo', 'Ivan en A: ve sus pedidos reales', '>0',
    case when (select count(*) from dk_orders) > 0 then '>0' else '0' end);
  insert into _t (area, test, expected, got) values ('Legítimo', 'Ivan: menú de hoy usa la fecha de la Cocina', 'ok',
    case when dk_kitchen_today() = (now() at time zone 'America/Bogota')::date then 'ok' else 'distinta' end);
end $$;
reset role;

-- 7. Usuario autenticado sin perfil.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000ff', null);
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Sin perfil', 'Sin perfil: pedidos visibles', '0', (select count(*)::text from dk_orders));
  insert into _t (area, test, expected, got) values ('Sin perfil', 'Sin perfil: productos visibles', '0', (select count(*)::text from dk_products));
  insert into _t (area, test, expected, got) values ('Sin perfil', 'Sin perfil: unidades visibles', '0', (select count(*)::text from dk_units));
  begin perform dk_set_ticket_priority((select id from _ctx where key = 'A_order'), 5);
    insert into _t (area, test, expected, got) values ('Sin perfil', 'Sin perfil: RPC', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Sin perfil', 'Sin perfil: RPC', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

select area, test, expected, got, detail,
  case
    when expected = '>0' then case when got = '>0' then 'PASS' else 'FAIL' end
    when got = expected then 'PASS' else 'FAIL'
  end as result
from _t order by n;

rollback;
