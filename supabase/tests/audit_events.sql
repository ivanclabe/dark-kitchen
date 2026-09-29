-- Pruebas de la bitácora (ADR 0012, sección 5). Transacción revertida.
--
--   python3 supabase/tests/run.py audit_events

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, txt text) on commit drop;
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
-- Último evento de un tipo en la organización (como dueño de la base).
create or replace function pg_temp.last_event(p_type text) returns dk_audit_log language sql as $$
  select * from dk_audit_log where event_type = p_type order by created_at desc, id desc limit 1
$$;

insert into _ctx (key, id) values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx (key, id) values ('orgA', (select organization_id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx (key, id) values ('ivanAuth', (select id from auth.users where email = 'ivanclabe@gmail.com'));
insert into _ctx (key, id) values ('ivan', (select id from dk_users where auth_user_id = (select id from auth.users where email = 'ivanclabe@gmail.com')));

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000e0e01', 'ana.bitacora@grupob.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e0e02', 'admin.bitacora@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-0000000e0e01', '00000000-0000-0000-0000-0000000e0e01', 'Ana (dueña de B)', true),
  ('10000000-0000-0000-0000-0000000e0e02', '00000000-0000-0000-0000-0000000e0e02', 'Admin Bitácora', true);
insert into dk_organizations (slug, name, owner_user_id, sector, category)
values ('grupo-b-bitacora', 'Grupo B', '10000000-0000-0000-0000-0000000e0e01', 'fast_food', 'burgers');

-- 0. Lo existente quedó clasificado
insert into _t (area, test, expected, got) values ('Migración', 'Todas las filas existentes tienen tipo y categoría', '0',
  (select count(*)::text from dk_audit_log where event_type is null or category is null));

-- 1. Eventos del SUPER_ADMIN
select pg_temp.act_as((select id from _ctx where key = 'ivanAuth'), (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _ctx (key, id) values ('C', dk_create_kitchen('Cocina Bitácora', 'cocina-bitacora-prueba', null, null, (select id from _ctx where key = 'orgA'), 'taco'));
  perform dk_set_member_roles((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-0000000e0e02',
    array[pg_temp.role_id('ADMIN'), pg_temp.role_id('KITCHEN')], pg_temp.role_id('ADMIN'));
  update dk_kitchens set name = 'Cocina Bitácora 2' where id = (select id from _ctx where key = 'C');
  perform dk_set_org_feature((select id from _ctx where key = 'orgA'), 'kitchen_insights', false);
  perform dk_set_kitchen_feature((select id from _ctx where key = 'A'), 'supply_reorder', true, '{"coverage_days": 9}');
  perform dk_set_kitchen_feature((select id from _ctx where key = 'A'), 'supply_reorder', true, '{"coverage_days": 10}');
  perform dk_set_kitchens_active(array[(select id from _ctx where key = 'C')], false);
end $$;
reset role;

select pg_temp.as_owner();
insert into _t (area, test, expected, got) values
  ('Clasificación', 'Cuenta creada', 'account.created · accounts · Creó la cuenta Cocina Bitácora',
    (select event_type || ' · ' || category || ' · ' || summary from dk_audit_log where event_type = 'account.created' and kitchen_id = (select id from _ctx where key = 'C'))),
  ('Clasificación', 'Rol asignado (con nombres)', 'sí',
    (select case when count(*) = 2 and bool_and(summary like 'Asignó el rol % a Admin Bitácora en ' || (select name from dk_kitchens where id = (select id from _ctx where key = 'A'))) then 'sí' else 'no: ' || string_agg(summary, ' | ') end
     from dk_audit_log where event_type = 'role.assigned' and (new_data ->> 'user_id') = '10000000-0000-0000-0000-0000000e0e02')),
  ('Clasificación', 'Acceso a la Cuenta', 'account_access.granted',
    (select event_type from dk_audit_log where table_name = 'dk_kitchen_members' and (new_data ->> 'user_id') = '10000000-0000-0000-0000-0000000e0e02')),
  ('Clasificación', 'Cuenta editada: solo lo que cambió', 'account.updated · ["name"] · Cocina Bitácora 2',
    (select event_type || ' · ' || (select jsonb_agg(k) from jsonb_object_keys(new_data) k)::text || ' · ' || (new_data ->> 'name')
     from dk_audit_log where event_type = 'account.updated' and kitchen_id = (select id from _ctx where key = 'C'))),
  ('Clasificación', 'Cuenta desactivada', 'Desactivó la cuenta Cocina Bitácora 2',
    (select summary from dk_audit_log where event_type = 'account.deactivated' and kitchen_id = (select id from _ctx where key = 'C'))),
  ('Clasificación', 'Función de la organización (sin Cuenta)', 'feature.org_changed · features · Dejó de ofrecer Sugerencias de Cocina en vivo en la organización · sin cuenta',
    (select event_type || ' · ' || category || ' · ' || summary || ' · ' || coalesce(kitchen_id::text, 'sin cuenta') from pg_temp.last_event('feature.org_changed'))),
  ('Clasificación', 'Parámetros de IA', 'ai.settings_changed · ai · Cambió los parámetros de Sugerencias de compra en ' || (select name from dk_kitchens where id = (select id from _ctx where key = 'A')),
    (select event_type || ' · ' || category || ' · ' || summary from pg_temp.last_event('ai.settings_changed')));

-- Ruido: cambiar la "última cuenta" no deja fila
do $$
declare v_before integer := (select count(*) from dk_audit_log where table_name = 'dk_users');
begin
  update dk_users set last_account_id = (select id from _ctx where key = 'A') where id = '10000000-0000-0000-0000-0000000e0e02';
  insert into _t (area, test, expected, got) values ('Ruido', 'Cambiar la última cuenta no se audita', '0',
    ((select count(*) from dk_audit_log where table_name = 'dk_users') - v_before)::text);
end $$;

-- Plan (plataforma)
select pg_temp.act_as((select id from _ctx where key = 'ivanAuth'));
set local role authenticated;
do $$ begin perform dk_set_subscription((select id from dk_organizations where slug = 'grupo-b-bitacora'), 'business'); end $$;
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Clasificación', 'Cambio de plan', 'plan.changed · billing · standard → business',
  (select event_type || ' · ' || category || ' · ' || (context ->> 'from') || ' → ' || (context ->> 'to') from pg_temp.last_event('plan.changed')));

-- 2. Eventos que no son filas
select pg_temp.act_as((select id from _ctx where key = 'ivanAuth'), (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into dk_ai_insights (kitchen_id, feature_key, status, input, error) values ((select id from _ctx where key = 'A'), 'supply_reorder', 'error', '{}', 'timeout del modelo');
  perform dk_log_sign_in();
  perform dk_log_sign_in();
end $$;
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values
  ('Eventos', 'Fallo de IA en la bitácora', 'ai.run_failed · failure · edge · sí',
    (select event_type || ' · ' || result || ' · ' || source || ' · ' || case when summary like '%timeout del modelo%' then 'sí' else 'no' end from pg_temp.last_event('ai.run_failed'))),
  ('Eventos', 'Inicio de sesión: uno por minuto', '1',
    (select count(*)::text from dk_audit_log where event_type = 'auth.signed_in' and changed_by = (select id from _ctx where key = 'ivan') and created_at > now() - interval '1 minute'));

-- 3. Solo agregar
select pg_temp.act_as((select id from _ctx where key = 'ivanAuth'), (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  begin delete from dk_audit_log;
    insert into _t (area, test, expected, got) values ('Solo agregar', 'Borrar desde la API', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Solo agregar', 'Borrar desde la API', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin insert into dk_audit_log (table_name, record_key, action, event_type, summary) values ('falso', 'x', 'EVENT', 'account.created', 'Evento inventado');
    insert into _t (area, test, expected, got) values ('Solo agregar', 'Insertar eventos desde la API', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Solo agregar', 'Insertar eventos desde la API', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;
select pg_temp.as_owner();
do $$ begin
  begin update dk_audit_log set summary = 'alterado';
    insert into _t (area, test, expected, got) values ('Solo agregar', 'Modificar como dueño de la base', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Solo agregar', 'Modificar como dueño de la base', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin truncate dk_audit_log;
    insert into _t (area, test, expected, got) values ('Solo agregar', 'Vaciar (TRUNCATE)', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Solo agregar', 'Vaciar (TRUNCATE)', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin perform dk_purge_audit_log(10);
    insert into _t (area, test, expected, got) values ('Retención', 'Retención menor al mínimo', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Retención', 'Retención menor al mínimo', 'bloqueado', 'bloqueado', sqlerrm); end;
  insert into _t (area, test, expected, got) values ('Retención', 'La purga de 400 días funciona', 'sí', case when dk_purge_audit_log(400) >= 0 then 'sí' else 'no' end);
  insert into _t (area, test, expected, got) values ('Retención', 'Tarea nocturna programada', '1', (select count(*)::text from cron.job where jobname = 'dk-purge-audit-log'));
end $$;

-- 4. Lectura
select pg_temp.act_as((select id from _ctx where key = 'ivanAuth'));
set local role authenticated;
do $$
declare v_page jsonb; v_next jsonb; v_last jsonb;
begin
  v_page := dk_org_events((select id from _ctx where key = 'orgA'), p_limit => 3);
  insert into _t (area, test, expected, got) values ('Lectura', 'SUPER_ADMIN pagina la bitácora', '3 · true', jsonb_array_length(v_page -> 'events') || ' · ' || (v_page ->> 'hasMore'));
  v_last := v_page -> 'events' -> 2;
  v_next := dk_org_events((select id from _ctx where key = 'orgA'), p_limit => 3, p_before_at => (v_last ->> 'createdAt')::timestamptz, p_before_id => (v_last ->> 'id')::uuid);
  insert into _t (area, test, expected, got) values ('Lectura', 'La página siguiente no repite eventos', '0',
    (select count(*)::text from jsonb_array_elements(v_page -> 'events') a join jsonb_array_elements(v_next -> 'events') b on a ->> 'id' = b ->> 'id'));
  insert into _t (area, test, expected, got) values ('Lectura', 'Incluye eventos de nivel organización', 'sí',
    case when exists (select 1 from jsonb_array_elements(dk_org_events((select id from _ctx where key = 'orgA'), p_category => 'features', p_limit => 50) -> 'events') e
                      where e ->> 'eventType' = 'feature.org_changed') then 'sí' else 'no' end);
  insert into _t (area, test, expected, got) values ('Lectura', 'Filtro por categoría y búsqueda', 'sí',
    case when (select bool_and(e ->> 'category' = 'roles' and e ->> 'summary' ilike '%Admin Bitácora%')
               from jsonb_array_elements(dk_org_events((select id from _ctx where key = 'orgA'), p_category => 'roles', p_search => 'Admin Bitácora') -> 'events') e) then 'sí' else 'no' end);
  insert into _t (area, test, expected, got) values ('Lectura', 'Muestra quién y en qué Cuenta', 'sí',
    (select case when e -> 'actor' ->> 'id' = (select id from _ctx where key = 'ivan')::text and e -> 'account' ->> 'id' = (select id from _ctx where key = 'A')::text then 'sí' else 'no' end
     from jsonb_array_elements(dk_org_events((select id from _ctx where key = 'orgA'), p_category => 'roles', p_search => 'Admin Bitácora') -> 'events') e limit 1));
end $$;
reset role;

-- ADMIN de Cuenta (sin permiso de organización): solo su Cuenta
select pg_temp.act_as('00000000-0000-0000-0000-0000000e0e02', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  begin perform dk_org_events((select id from _ctx where key = 'orgA'));
    insert into _t (area, test, expected, got) values ('Aislamiento', 'ADMIN de Cuenta ve la bitácora de la organización', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Aislamiento', 'ADMIN de Cuenta ve la bitácora de la organización', 'bloqueado', 'bloqueado', sqlerrm); end;
  insert into _t (area, test, expected, got) values ('Aislamiento', 'ADMIN de Cuenta: solo filas de su Cuenta', '0 · sí',
    (select count(*) filter (where kitchen_id is distinct from (select id from _ctx where key = 'A'))::text || ' · ' || case when count(*) > 0 then 'sí' else 'no' end from dk_audit_log));
end $$;
reset role;

-- Otra organización: nada
select pg_temp.act_as('00000000-0000-0000-0000-0000000e0e01');
set local role authenticated;
do $$ begin
  begin perform dk_org_events((select id from _ctx where key = 'orgA'));
    insert into _t (area, test, expected, got) values ('Aislamiento', 'Otra organización pide la bitácora de A', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Aislamiento', 'Otra organización pide la bitácora de A', 'bloqueado', 'bloqueado', sqlerrm); end;
  insert into _t (area, test, expected, got) values ('Aislamiento', 'Otra organización lee filas de A directo', '0',
    (select count(*)::text from dk_audit_log where organization_id = (select id from _ctx where key = 'orgA')));
  insert into _t (area, test, expected, got) values ('Aislamiento', 'Ve la bitácora de la suya', 'sí',
    case when jsonb_array_length(dk_org_events((select id from dk_organizations where slug = 'grupo-b-bitacora')) -> 'events') > 0 then 'sí' else 'no' end);
end $$;
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
