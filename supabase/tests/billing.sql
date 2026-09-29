-- Pruebas de facturación y equipos en el centro de administración (ADR 0012,
-- secciones 6, 7 y A3). Transacción revertida.
--
--   python3 supabase/tests/run.py billing

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
create or replace function pg_temp.role_id(p_key text) returns uuid language sql as $$ select id from dk_roles where is_system and key = p_key $$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000b1b01', 'ana.fact@grupob.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000b1b02', 'carlos.fact@grupoc.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000b1b03', 'caja.fact@grupob.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-0000000b1b01', '00000000-0000-0000-0000-0000000b1b01', 'Ana', true),
  ('10000000-0000-0000-0000-0000000b1b02', '00000000-0000-0000-0000-0000000b1b02', 'Carlos', true),
  ('10000000-0000-0000-0000-0000000b1b03', '00000000-0000-0000-0000-0000000b1b03', 'Caja B', true);
insert into dk_organizations (slug, name, owner_user_id, sector, category) values
  ('grupo-b-fact', 'Grupo B', '10000000-0000-0000-0000-0000000b1b01', 'fast_food', 'burgers'),
  ('grupo-c-fact', 'Grupo C', '10000000-0000-0000-0000-0000000b1b02', 'fast_food', 'burgers');
insert into _ctx values ('orgB', (select id from dk_organizations where slug = 'grupo-b-fact')), ('orgC', (select id from dk_organizations where slug = 'grupo-c-fact'));

select pg_temp.act_as('00000000-0000-0000-0000-0000000b1b01');
set local role authenticated;
do $$ begin insert into _ctx values ('B1', dk_create_kitchen('Centro', 'centro-fact', null, null, (select id from _ctx where key = 'orgB'))); end $$;
reset role;

select pg_temp.as_owner();
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
  values ((select id from _ctx where key = 'B1'), '10000000-0000-0000-0000-0000000b1b03', pg_temp.role_id('CASHIER'));
-- Una factura de prueba (hoy solo la escribiría el proveedor de pagos).
insert into dk_invoices (organization_id, subscription_id, number, amount, status)
  values ((select id from _ctx where key = 'orgB'), (select id from dk_subscriptions where organization_id = (select id from _ctx where key = 'orgB')), 'DK-0001', 49900, 'paid');

-- 1. SUPER_ADMIN: plan, facturas y equipo con actividad
select pg_temp.act_as('00000000-0000-0000-0000-0000000b1b01');
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Facturación', 'SUPER_ADMIN ve su suscripción y su factura', '1 · 1',
    (select count(*) from dk_subscriptions) || ' · ' || (select count(*) from dk_invoices));
  insert into _t (area, test, expected, got) values ('Facturación', 'Plan con cuota de IA y uso', 'standard · 50 · 0',
    (select (s -> 'plan' ->> 'key') || ' · ' || (s -> 'limits' ->> 'aiRunsPerDay') || ' · ' || (s -> 'usage' ->> 'aiRunsMax24h')
     from (select dk_my_subscription((select id from _ctx where key = 'orgB')) s) x));
  begin insert into dk_invoices (organization_id, number, amount, status) values ((select id from _ctx where key = 'orgB'), 'FALSA', 1, 'paid');
    insert into _t (area, test, expected, got) values ('Facturación', 'Crear facturas desde la API', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Facturación', 'Crear facturas desde la API', 'bloqueado', 'bloqueado', sqlerrm); end;
  insert into _t (area, test, expected, got) values ('Equipos', 'Incorporación y actividad visibles', 'sí',
    (select case when bool_and(u ? 'joinedAt' and u ->> 'joinedAt' is not null and u ? 'lastActivityAt') then 'sí' else 'no' end
     from jsonb_array_elements(dk_org_users((select id from _ctx where key = 'orgB'))) u));
end $$;
reset role;

-- 2. Un miembro operativo: sin plan ni facturas, pero sigue viendo sus funciones
select pg_temp.act_as('00000000-0000-0000-0000-0000000b1b03', (select id from _ctx where key = 'B1'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Aislamiento', 'CAJA no lee suscripción ni facturas', '0 · 0',
    (select count(*) from dk_subscriptions) || ' · ' || (select count(*) from dk_invoices));
  begin perform dk_my_subscription((select id from _ctx where key = 'orgB'));
    insert into _t (area, test, expected, got) values ('Aislamiento', 'CAJA pide el plan de su organización', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Aislamiento', 'CAJA pide el plan de su organización', 'bloqueado', 'bloqueado', sqlerrm); end;
  insert into _t (area, test, expected, got) values ('Compatibilidad', 'CAJA sigue viendo sus funciones', 'sí',
    case when jsonb_array_length(dk_my_features()) > 0 then 'sí' else 'no' end);
end $$;
reset role;

-- 3. Otra organización
select pg_temp.act_as('00000000-0000-0000-0000-0000000b1b02');
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Aislamiento', 'Otra organización: facturas y suscripción de B', '0 · 0',
    (select count(*) from dk_invoices where organization_id = (select id from _ctx where key = 'orgB')) || ' · ' ||
    (select count(*) from dk_subscriptions where organization_id = (select id from _ctx where key = 'orgB')));
  begin perform dk_my_subscription((select id from _ctx where key = 'orgB'));
    insert into _t (area, test, expected, got) values ('Aislamiento', 'Otra organización pide el plan de B', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Aislamiento', 'Otra organización pide el plan de B', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin perform dk_org_users((select id from _ctx where key = 'orgB'));
    insert into _t (area, test, expected, got) values ('Aislamiento', 'Otra organización pide el equipo de B', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Aislamiento', 'Otra organización pide el equipo de B', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
