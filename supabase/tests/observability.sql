-- Pruebas de observabilidad y fechas en la zona de la Cuenta (ADR 0012,
-- secciones 4 y A5). Transacción revertida.
--
--   python3 supabase/tests/run.py observability

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, num numeric) on commit drop;
grant all on _t, _ctx to authenticated;
grant usage on sequence _t_n_seq to authenticated;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', (case when p_kitchen is null then '{}'::jsonb else jsonb_build_object('x-dk-kitchen-id', p_kitchen) end)::text, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.role_id(p_key text) returns uuid language sql as $$ select id from dk_roles where is_system and key = p_key $$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000b5b01', 'ana.obs@grupob.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000b5b02', 'carlos.obs@grupoc.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000b5b03', 'cocina.obs@grupob.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-0000000b5b01', '00000000-0000-0000-0000-0000000b5b01', 'Ana', true),
  ('10000000-0000-0000-0000-0000000b5b02', '00000000-0000-0000-0000-0000000b5b02', 'Carlos', true),
  ('10000000-0000-0000-0000-0000000b5b03', '00000000-0000-0000-0000-0000000b5b03', 'Cocina B', true);
insert into dk_organizations (slug, name, owner_user_id, sector, category) values
  ('grupo-b-obs', 'Grupo B', '10000000-0000-0000-0000-0000000b5b01', 'fast_food', 'burgers'),
  ('grupo-c-obs', 'Grupo C', '10000000-0000-0000-0000-0000000b5b02', 'fast_food', 'burgers');
insert into _ctx (key, id) values ('orgB', (select id from dk_organizations where slug = 'grupo-b-obs')), ('orgC', (select id from dk_organizations where slug = 'grupo-c-obs'));

select pg_temp.act_as('00000000-0000-0000-0000-0000000b5b01');
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('B1', dk_create_kitchen('Centro', 'centro-obs', 'America/Bogota', null, (select id from _ctx where key = 'orgB'))); end $$;
reset role;

-- Datos: medianoche local de hoy en Bogotá; un pedido 1 minuto después (hoy) y
-- otro 30 minutos antes (ayer a las 23:30 local: en UTC es el mismo día que hoy).
select pg_temp.as_owner();
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
  values ((select id from _ctx where key = 'B1'), '10000000-0000-0000-0000-0000000b5b03', pg_temp.role_id('KITCHEN'));
insert into _ctx (key, num) values ('midnight', extract(epoch from ((now() at time zone 'America/Bogota')::date::timestamp at time zone 'America/Bogota')));
insert into dk_customers (id, full_name, kitchen_id) values ('30000000-0000-0000-0000-0000000b5b01', 'Cliente obs', (select id from _ctx where key = 'B1'));
insert into dk_orders (id, customer_id, kitchen_id, status, subtotal, created_at) values
  ('40000000-0000-0000-0000-0000000b5b01', '30000000-0000-0000-0000-0000000b5b01', (select id from _ctx where key = 'B1'), 'ENTREGADO', 30000,
   to_timestamp((select num from _ctx where key = 'midnight')) + interval '1 minute'),
  ('40000000-0000-0000-0000-0000000b5b02', '30000000-0000-0000-0000-0000000b5b01', (select id from _ctx where key = 'B1'), 'ENTREGADO', 20000,
   to_timestamp((select num from _ctx where key = 'midnight')) - interval '30 minutes'),
  ('40000000-0000-0000-0000-0000000b5b03', '30000000-0000-0000-0000-0000000b5b01', (select id from _ctx where key = 'B1'), 'CONFIRMADO', 10000,
   now() - interval '40 minutes');
-- El tercero entró a "en cola" hace 30 min (umbral por defecto: 10 min) → atrasado.
insert into dk_order_status_history (order_id, from_status, to_status, changed_at, kitchen_id)
  values ('40000000-0000-0000-0000-0000000b5b03', 'NUEVO', 'CONFIRMADO', now() - interval '30 minutes', (select id from _ctx where key = 'B1'));

-- 1. Zona horaria: Dashboard y reportes
select pg_temp.act_as('00000000-0000-0000-0000-0000000b5b01', (select id from _ctx where key = 'B1'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Zona horaria', 'Ventas de hoy: el pedido de las 23:30 de ayer no cuenta', '40000',
    (dk_dashboard_summary() ->> 'sales_today')::numeric::text);
  insert into _t (area, test, expected, got) values ('Zona horaria', 'Pedidos de hoy', '2', dk_dashboard_summary() ->> 'orders_today');
  insert into _t (area, test, expected, got) values ('Zona horaria', 'Reporte por día: cada pedido en su día local', '1 · 20000 | 2 · 40000',
    (select string_agg(order_count || ' · ' || total::numeric, ' | ' order by day)
     from dk_report_sales_by_day(dk_local_date(now()) - 1, dk_local_date(now()))));
end $$;
reset role;

-- 2. Observabilidad de la organización (SUPER_ADMIN)
select pg_temp.act_as('00000000-0000-0000-0000-0000000b5b01');
set local role authenticated;
do $$
declare v jsonb := dk_org_observability((select id from _ctx where key = 'orgB'));
begin
  insert into _t (area, test, expected, got) values ('Organización', 'Cuentas activas · pedidos hoy · ventas hoy · atrasados', '1 · 2 · 40000 · 1',
    (v -> 'totals' ->> 'accountsActive') || ' · ' || (v -> 'totals' ->> 'ordersToday') || ' · ' || (v -> 'totals' ->> 'salesToday')::numeric || ' · ' || (v -> 'totals' ->> 'late'));
  insert into _t (area, test, expected, got) values ('Organización', 'Por Cuenta: pedidos 7 días', '3', v -> 'accounts' -> 0 ->> 'ordersWeek');
  insert into _t (area, test, expected, got) values ('Organización', 'Alerta de atrasados', 'sí',
    case when exists (select 1 from jsonb_array_elements(v -> 'alerts') a where a ->> 'type' = 'late_orders') then 'sí' else 'no' end);
  insert into _t (area, test, expected, got) values ('Organización', 'Actividad reciente desde la bitácora', 'sí',
    case when jsonb_array_length(v -> 'recentEvents') > 0 then 'sí' else 'no' end);
end $$;
do $$
declare v jsonb := dk_account_observability((select id from _ctx where key = 'orgB'), (select id from _ctx where key = 'B1'));
begin
  insert into _t (area, test, expected, got) values ('Cuenta', 'Hoy: creados · entregados · ventas', '2 · 1 · 40000',
    (v -> 'orders' -> 'today' ->> 'created') || ' · ' || (v -> 'orders' -> 'today' ->> 'delivered') || ' · ' || (v -> 'orders' -> 'today' ->> 'sales')::numeric);
  insert into _t (area, test, expected, got) values ('Cuenta', '7 días por día (7 filas) · atrasados · canal', '7 · 1 · 3',
    jsonb_array_length(v -> 'orders' -> 'byDay') || ' · ' || (v ->> 'late') || ' · ' || (v -> 'orders' -> 'byChannel' ->> 'MANUAL'));
  insert into _t (area, test, expected, got) values ('Cuenta', 'Módulos, equipo y funciones', 'true · 2 · 10',
    (v -> 'modules' ->> 'slaConfigured') || ' · ' || (v -> 'team' ->> 'members') || ' · ' || jsonb_array_length(v -> 'features'));
end $$;
reset role;

-- 3. Aislamiento
select pg_temp.act_as('00000000-0000-0000-0000-0000000b5b02');
set local role authenticated;
do $$ begin
  begin perform dk_org_observability((select id from _ctx where key = 'orgB'));
    insert into _t (area, test, expected, got) values ('Aislamiento', 'Otra organización ve la de B', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Aislamiento', 'Otra organización ve la de B', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin perform dk_account_observability((select id from _ctx where key = 'orgC'), (select id from _ctx where key = 'B1'));
    insert into _t (area, test, expected, got) values ('Aislamiento', 'Su organización + una Cuenta ajena (ID manipulado)', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Aislamiento', 'Su organización + una Cuenta ajena (ID manipulado)', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000b5b03', (select id from _ctx where key = 'B1'));
set local role authenticated;
do $$ begin
  begin perform dk_org_observability((select id from _ctx where key = 'orgB'));
    insert into _t (area, test, expected, got) values ('Aislamiento', 'Un miembro (COCINA) ve la observabilidad', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Aislamiento', 'Un miembro (COCINA) ve la observabilidad', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
