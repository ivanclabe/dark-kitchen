-- Pruebas de funciones por Organización y Cuenta (ADR 0009, sección 3.2).
-- Transacción revertida.
--
--   python3 supabase/tests/run.py features

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid) on commit drop;
grant all on _t, _ctx to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid, p_role text default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers',
    (case when p_kitchen is null then '{}'::jsonb else jsonb_build_object('x-dk-kitchen-id', p_kitchen) end
     || case when p_role is null then '{}'::jsonb else jsonb_build_object('x-dk-role-id', p_role) end)::text, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.role_id(p_key text) returns uuid language sql as $$ select id from dk_roles where is_system and key = p_key $$;
create or replace function pg_temp.feat(p_key text, p_field text) returns text language sql as $$
  select f ->> p_field from jsonb_array_elements(dk_my_features()) f where f ->> 'key' = p_key
$$;
grant execute on function pg_temp.feat(text, text) to authenticated;

insert into _ctx values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx values ('orgA', (select organization_id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx values ('ivan', (select id from auth.users where email = 'ivanclabe@gmail.com'));

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000fe0a0', 'ana.features@grupob.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000fe0b1', 'admin.features@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000fe0b2', 'cocina.features@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-0000000fe0a0', '00000000-0000-0000-0000-0000000fe0a0', 'Ana (dueña de B)', true),
  ('10000000-0000-0000-0000-0000000fe0b1', '00000000-0000-0000-0000-0000000fe0b1', 'Admin de A', true),
  ('10000000-0000-0000-0000-0000000fe0b2', '00000000-0000-0000-0000-0000000fe0b2', 'Cocina de A', true);

insert into dk_organizations (slug, name, owner_user_id, sector, category)
values ('grupo-b-features', 'Grupo B', '10000000-0000-0000-0000-0000000fe0a0', 'fast_food', 'burgers');
insert into _ctx values ('orgB', (select id from dk_organizations where slug = 'grupo-b-features'));

select pg_temp.act_as('00000000-0000-0000-0000-0000000fe0a0', null);
set local role authenticated;
do $$ begin insert into _ctx values ('B1', dk_create_kitchen('Hamburguesas B1', 'hamburguesas-b1-features', null, null, (select id from _ctx where key = 'orgB'))); end $$;
reset role;

select pg_temp.as_owner();
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id) values
  ((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-0000000fe0b1', pg_temp.role_id('ADMIN')),
  ((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-0000000fe0b2', pg_temp.role_id('KITCHEN'));
-- Punto de partida conocido para la Cuenta A (su fila previa puede existir).
delete from dk_kitchen_features where kitchen_id = (select id from _ctx where key = 'A') and feature_key = 'supply_reorder';
delete from dk_organization_features where organization_id = (select id from _ctx where key = 'orgA');

-- 1. Valores por defecto
select pg_temp.act_as('00000000-0000-0000-0000-0000000fe0b1', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Catálogo', 'La Cuenta ve el catálogo activo', '7', jsonb_array_length(dk_my_features())::text);
  insert into _t (area, test, expected, got) values ('Por defecto', 'IA apagada sin fila', 'false · false', pg_temp.feat('supply_reorder', 'enabled') || ' · ' || pg_temp.feat('supply_reorder', 'usable'));
  insert into _t (area, test, expected, got) values ('Por defecto', 'Voz encendida sin fila', 'true', pg_temp.feat('voice_commands', 'usable'));
  insert into _t (area, test, expected, got) values ('Por defecto', 'Parámetros por defecto del catálogo', '7', pg_temp.feat('supply_reorder', 'settings')::jsonb ->> 'coverage_days');
  insert into _t (area, test, expected, got) values ('Por defecto', 'ADMIN puede administrarla', 'true', pg_temp.feat('supply_reorder', 'canManage'));

  -- 2. ADMIN activa y ajusta parámetros (solo claves conocidas y con su tipo)
  perform dk_set_kitchen_feature((select id from _ctx where key = 'A'), 'supply_reorder', true, '{"coverage_days": 10, "hack": 1, "frequency_min": "x"}');
  insert into _t (area, test, expected, got) values ('Cuenta', 'ADMIN la activa', 'true', pg_temp.feat('supply_reorder', 'usable'));
  insert into _t (area, test, expected, got) values ('Cuenta', 'Solo guarda claves y tipos válidos', '{"coverage_days": 10}',
    (select settings::text from dk_kitchen_features where kitchen_id = (select id from _ctx where key = 'A') and feature_key = 'supply_reorder'));
  insert into _t (area, test, expected, got) values ('Cuenta', 'Estado: parámetros = catálogo + Cuenta', '10 · 360',
    (dk_feature_state('supply_reorder') -> 'settings' ->> 'coverage_days') || ' · ' || (dk_feature_state('supply_reorder') -> 'settings' ->> 'frequency_min'));

  -- 3. ADMIN no toca la organización
  begin perform dk_set_org_feature((select id from _ctx where key = 'orgA'), 'supply_reorder', false);
    insert into _t (area, test, expected, got) values ('Permisos', 'ADMIN cambia la disponibilidad de la organización', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Permisos', 'ADMIN cambia la disponibilidad de la organización', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin perform dk_org_feature_matrix((select id from _ctx where key = 'orgA'));
    insert into _t (area, test, expected, got) values ('Permisos', 'ADMIN ve la matriz de la organización', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Permisos', 'ADMIN ve la matriz de la organización', 'bloqueado', 'bloqueado', sqlerrm); end;

  -- 4. Escritura directa: sin política, no cambia nada
  update dk_kitchen_features set enabled = false where feature_key = 'supply_reorder';
end $$;
reset role;

select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Seguridad', 'Escritura directa sin RPC', 'true',
  (select enabled::text from dk_kitchen_features where kitchen_id = (select id from _ctx where key = 'A') and feature_key = 'supply_reorder'));

-- 5. COCINA: usa lo de su permiso; no administra
select pg_temp.act_as('00000000-0000-0000-0000-0000000fe0b2', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Permisos', 'COCINA no usa Sugerencias de compra (permiso)', 'false · permission',
    pg_temp.feat('supply_reorder', 'usable') || ' · ' || (dk_feature_state('supply_reorder') ->> 'reason'));
  insert into _t (area, test, expected, got) values ('Permisos', 'COCINA usa los comandos de voz', 'true', pg_temp.feat('voice_commands', 'usable'));
  insert into _t (area, test, expected, got) values ('Permisos', 'COCINA no administra', 'false', pg_temp.feat('voice_commands', 'canManage'));
  begin perform dk_set_kitchen_feature((select id from _ctx where key = 'A'), 'voice_commands', false);
    insert into _t (area, test, expected, got) values ('Permisos', 'COCINA apaga la voz de la Cuenta', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Permisos', 'COCINA apaga la voz de la Cuenta', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

-- 6. SUPER_ADMIN: la organización deja de ofrecerla → techo para todas sus Cuentas
select pg_temp.act_as((select id from _ctx where key = 'ivan'), (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  perform dk_set_org_feature((select id from _ctx where key = 'orgA'), 'supply_reorder', false);
  perform dk_set_org_feature((select id from _ctx where key = 'orgA'), 'voice_commands', false);
  insert into _t (area, test, expected, got) values ('Organización', 'La matriz lista funciones y Cuentas', '7 · sí',
    jsonb_array_length(dk_org_feature_matrix((select id from _ctx where key = 'orgA')) -> 'features')::text || ' · ' ||
    case when jsonb_array_length(dk_org_feature_matrix((select id from _ctx where key = 'orgA')) -> 'accounts') >= 1 then 'sí' else 'no' end);
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000fe0b1', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Precedencia', 'Organización apagada: la Cuenta no la usa', 'false · organization',
    pg_temp.feat('supply_reorder', 'usable') || ' · ' || (dk_feature_state('supply_reorder') ->> 'reason'));
  insert into _t (area, test, expected, got) values ('Precedencia', 'La elección de la Cuenta se conserva', 'true', pg_temp.feat('supply_reorder', 'enabled'));
  insert into _t (area, test, expected, got) values ('Precedencia', 'Vista de compatibilidad con el estado efectivo', 'false',
    (select enabled::text from dk_ai_features where feature_key = 'supply_reorder'));
  insert into _t (area, test, expected, got) values ('Precedencia', 'Voz apagada por la organización', 'false', pg_temp.feat('voice_commands', 'usable'));
  -- Apagarla en la Cuenta sí se puede; volver a activarla, no.
  perform dk_set_kitchen_feature((select id from _ctx where key = 'A'), 'voice_commands', false);
  begin perform dk_set_kitchen_feature((select id from _ctx where key = 'A'), 'voice_commands', true);
    insert into _t (area, test, expected, got) values ('Precedencia', 'La Cuenta activa lo que la organización no ofrece', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Precedencia', 'La Cuenta activa lo que la organización no ofrece', 'bloqueado', 'bloqueado', sqlerrm); end;
  -- Cambiar parámetros de una ya activada sí se puede.
  perform dk_set_kitchen_feature((select id from _ctx where key = 'A'), 'supply_reorder', true, '{"coverage_days": 12}');
  insert into _t (area, test, expected, got) values ('Precedencia', 'Ajustar parámetros sin reactivar', '12',
    (select settings ->> 'coverage_days' from dk_kitchen_features where kitchen_id = (select id from _ctx where key = 'A') and feature_key = 'supply_reorder'));
  begin insert into dk_ai_insights (kitchen_id, feature_key, status, input) values ((select id from _ctx where key = 'A'), 'supply_reorder', 'ok', '{}');
    insert into _t (area, test, expected, got) values ('Precedencia', 'Guardar un análisis con la función apagada', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Precedencia', 'Guardar un análisis con la función apagada', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

-- Escritura directa como dueño de la base: la guardia también rechaza.
select pg_temp.as_owner();
do $$ begin
  update dk_kitchen_features set enabled = true where kitchen_id = (select id from _ctx where key = 'A') and feature_key = 'voice_commands';
  insert into _t (area, test, expected, got) values ('Seguridad', 'Guardia ante escritura directa', 'bloqueado', 'PERMITIDO');
exception when others then insert into _t (area, test, expected, got, detail) values ('Seguridad', 'Guardia ante escritura directa', 'bloqueado', 'bloqueado', sqlerrm); end $$;

-- 7. La organización la vuelve a ofrecer → la Cuenta retoma su valor
select pg_temp.act_as((select id from _ctx where key = 'ivan'), (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin perform dk_set_org_feature((select id from _ctx where key = 'orgA'), 'supply_reorder', true); end $$;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000fe0b1', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Precedencia', 'Se vuelve a ofrecer: la Cuenta retoma su valor', 'true', pg_temp.feat('supply_reorder', 'usable'));
  begin insert into dk_ai_insights (kitchen_id, feature_key, status, input) values ((select id from _ctx where key = 'A'), 'supply_reorder', 'ok', '{}');
    insert into _t (area, test, expected, got) values ('Precedencia', 'Guardar un análisis con la función usable', 'permitido', 'permitido');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Precedencia', 'Guardar un análisis con la función usable', 'permitido', 'BLOQUEADO', sqlerrm); end;
end $$;
reset role;

-- 8. Aislamiento entre organizaciones
select pg_temp.act_as('00000000-0000-0000-0000-0000000fe0a0', (select id from _ctx where key = 'B1'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Aislamiento', 'Lo que apaga A no afecta a B', 'true', pg_temp.feat('voice_commands', 'usable'));
  insert into _t (area, test, expected, got) values ('Aislamiento', 'Ana no ve la disponibilidad de A', '0',
    (select count(*)::text from dk_organization_features where organization_id = (select id from _ctx where key = 'orgA')));
  insert into _t (area, test, expected, got) values ('Aislamiento', 'Ana no ve la activación de A', '0',
    (select count(*)::text from dk_kitchen_features where kitchen_id = (select id from _ctx where key = 'A')));
  begin perform dk_set_kitchen_feature((select id from _ctx where key = 'A'), 'supply_reorder', false);
    insert into _t (area, test, expected, got) values ('Aislamiento', 'Ana cambia una función de la Cuenta A', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Aislamiento', 'Ana cambia una función de la Cuenta A', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin perform dk_set_org_feature((select id from _ctx where key = 'orgA'), 'supply_reorder', false);
    insert into _t (area, test, expected, got) values ('Aislamiento', 'Ana cambia la organización A', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Aislamiento', 'Ana cambia la organización A', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin perform dk_org_feature_matrix((select id from _ctx where key = 'orgA'));
    insert into _t (area, test, expected, got) values ('Aislamiento', 'Ana ve la matriz de A', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Aislamiento', 'Ana ve la matriz de A', 'bloqueado', 'bloqueado', sqlerrm); end;
  -- Ana es SUPER_ADMIN de B: administra B.
  perform dk_set_org_feature((select id from _ctx where key = 'orgB'), 'kitchen_insights', false);
  insert into _t (area, test, expected, got) values ('Organización', 'SUPER_ADMIN de B administra B', 'false',
    (select available::text from dk_organization_features where organization_id = (select id from _ctx where key = 'orgB') and feature_key = 'kitchen_insights'));
  begin perform dk_set_org_feature((select id from _ctx where key = 'orgB'), 'no_existe', true);
    insert into _t (area, test, expected, got) values ('Catálogo', 'Función desconocida', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Catálogo', 'Función desconocida', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

-- Ana con el encabezado de A: no hay Cuenta, no hay funciones
select pg_temp.act_as('00000000-0000-0000-0000-0000000fe0a0', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Aislamiento', 'Ana con el encabezado de A', '0', jsonb_array_length(dk_my_features())::text);
end $$;
reset role;

-- 9. Sin sesión
select pg_temp.as_owner();
set local role anon;
do $$ begin
  begin perform dk_my_features();
    insert into _t (area, test, expected, got) values ('Seguridad', 'Sin sesión', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Seguridad', 'Sin sesión', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
