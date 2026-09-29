-- Pruebas de la cuota de IA y los rangos de parámetros (ADR 0011, H1 y H2).
-- Transacción revertida.
--
--   python3 supabase/tests/run.py ai_quota

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid) on commit drop;
grant all on _t, _ctx to authenticated;
grant usage on sequence _t_n_seq to authenticated;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', jsonb_build_object('x-dk-kitchen-id', p_kitchen)::text, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.role_id(p_key text) returns uuid language sql as $$ select id from dk_roles where is_system and key = p_key $$;

insert into _ctx values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000a1a01', 'admin.cuota@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a1a02', 'cocina.cuota@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-0000000a1a01', '00000000-0000-0000-0000-0000000a1a01', 'Admin cuota', true),
  ('10000000-0000-0000-0000-0000000a1a02', '00000000-0000-0000-0000-0000000a1a02', 'Cocina cuota', true);
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id) values
  ((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-0000000a1a01', pg_temp.role_id('ADMIN')),
  ((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-0000000a1a02', pg_temp.role_id('KITCHEN'));
insert into _t (area, test, expected, got) values ('Planes', 'Tope diario en el catálogo (D1)', '200 · 1000',
  (select (select limits ->> 'ai_runs_per_day' from dk_plans where key = 'business') || ' · ' || (select limits ->> 'ai_runs_per_day' from dk_plans where key = 'enterprise')));
-- Punto de partida: sin análisis previos en la Cuenta A.
delete from dk_ai_insights where kitchen_id = (select id from _ctx where key = 'A');

-- 1. Rangos de parámetros
select pg_temp.act_as('00000000-0000-0000-0000-0000000a1a01', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  begin perform dk_set_kitchen_feature((select id from _ctx where key = 'A'), 'supply_reorder', true, '{"frequency_min": 0}');
    insert into _t (area, test, expected, got) values ('Rangos', 'Frecuencia 0 (anularía la caché)', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Rangos', 'Frecuencia 0 (anularía la caché)', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin perform dk_set_kitchen_feature((select id from _ctx where key = 'A'), 'supply_reorder', true, '{"frequency_min": -30}');
    insert into _t (area, test, expected, got) values ('Rangos', 'Frecuencia negativa', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Rangos', 'Frecuencia negativa', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin perform dk_set_kitchen_feature((select id from _ctx where key = 'A'), 'supply_reorder', true, '{"coverage_days": 91}');
    insert into _t (area, test, expected, got) values ('Rangos', 'Cobertura sobre el máximo', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Rangos', 'Cobertura sobre el máximo', 'bloqueado', 'bloqueado', sqlerrm); end;
  perform dk_set_kitchen_feature((select id from _ctx where key = 'A'), 'supply_reorder', true, '{"frequency_min": 5, "coverage_days": 90}');
  perform dk_set_kitchen_feature((select id from _ctx where key = 'A'), 'supply_perishables', true);
  perform dk_set_kitchen_feature((select id from _ctx where key = 'A'), 'supply_slow_movers', true);
  insert into _t (area, test, expected, got) values ('Rangos', 'Valores en los bordes del rango', '5 · 90',
    (select (settings ->> 'frequency_min') || ' · ' || (settings ->> 'coverage_days') from dk_kitchen_features
     where kitchen_id = (select id from _ctx where key = 'A') and feature_key = 'supply_reorder'));
end $$;
reset role;

-- Escritura directa (dueño de la base): la guardia también la rechaza.
select pg_temp.as_owner();
do $$ begin
  update dk_kitchen_features set settings = '{"frequency_min": -1}'
  where kitchen_id = (select id from _ctx where key = 'A') and feature_key = 'supply_reorder';
  insert into _t (area, test, expected, got) values ('Rangos', 'Escritura directa fuera de rango', 'bloqueado', 'PERMITIDO');
exception when others then insert into _t (area, test, expected, got, detail) values ('Rangos', 'Escritura directa fuera de rango', 'bloqueado', 'bloqueado', sqlerrm); end $$;

-- 2. Cuota: intervalo mínimo
select pg_temp.act_as('00000000-0000-0000-0000-0000000a1a01', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Cuota', 'Sin análisis previos: se puede', 'true', dk_ai_run_allowed('supply_reorder') ->> 'allowed');
  insert into dk_ai_insights (kitchen_id, feature_key, status, input) values ((select id from _ctx where key = 'A'), 'supply_reorder', 'ok', '{}');
  insert into _t (area, test, expected, got) values ('Cuota', 'Recién analizado: espera (también con "Analizar ahora")', 'false · interval · sí',
    (dk_ai_run_allowed('supply_reorder') ->> 'allowed') || ' · ' || (dk_ai_run_allowed('supply_reorder') ->> 'reason') || ' · ' ||
    case when (dk_ai_run_allowed('supply_reorder') ->> 'retryAfterSeconds')::int between 1 and 120 then 'sí' else 'no' end);
  insert into _t (area, test, expected, got) values ('Cuota', 'El intervalo es por función', 'true', dk_ai_run_allowed('supply_perishables') ->> 'allowed');
end $$;
reset role;

-- Pasado el intervalo, vuelve a poder; los análisis vacíos (sin modelo) no cuentan.
select pg_temp.as_owner();
update dk_ai_insights set created_at = now() - interval '3 minutes' where kitchen_id = (select id from _ctx where key = 'A');
insert into dk_ai_insights (kitchen_id, feature_key, status, input, created_at)
  select (select id from _ctx where key = 'A'), 'supply_reorder', 'empty', '{}', now() - interval '10 seconds';
select pg_temp.act_as('00000000-0000-0000-0000-0000000a1a01', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Cuota', 'Pasado el intervalo (los vacíos no cuentan)', 'true', dk_ai_run_allowed('supply_reorder') ->> 'allowed');
end $$;
reset role;

-- 3. Cuota: tope en 24 h desde el plan (se baja a 3 para la prueba)
select pg_temp.as_owner();
update dk_plans set limits = limits || '{"ai_runs_per_day": 3}' where key = (select plan_key from dk_subscriptions s join dk_kitchens k on k.organization_id = s.organization_id where k.id = (select id from _ctx where key = 'A'));
insert into dk_ai_insights (kitchen_id, feature_key, status, input, created_at)
  select (select id from _ctx where key = 'A'), 'supply_perishables', s, '{}', now() - interval '1 hour' from unnest(array['ok', 'error']) s;
select pg_temp.act_as('00000000-0000-0000-0000-0000000a1a01', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Cuota', 'Tope diario alcanzado (ok y error cuentan)', 'false · daily · 0',
    (dk_ai_run_allowed('supply_slow_movers') ->> 'allowed') || ' · ' || (dk_ai_run_allowed('supply_slow_movers') ->> 'reason') || ' · ' ||
    (dk_ai_run_allowed('supply_slow_movers') ->> 'remainingToday'));
end $$;
reset role;

-- 4. Quien no puede usar la función no tiene cuota
select pg_temp.act_as('00000000-0000-0000-0000-0000000a1a02', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Cuota', 'COCINA no usa Sugerencias de compra', 'false · feature',
    (dk_ai_run_allowed('supply_reorder') ->> 'allowed') || ' · ' || (dk_ai_run_allowed('supply_reorder') ->> 'reason'));
end $$;
reset role;

-- 5. La vista de compatibilidad ya no existe
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Limpieza', 'Vista dk_ai_features retirada', 'no existe',
  case when to_regclass('public.dk_ai_features') is null then 'no existe' else 'existe' end);

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
