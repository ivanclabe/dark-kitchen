-- Pruebas del registro público (ADR 0008, Fase F). Transacción revertida.
--
--   python3 supabase/tests/run.py signup

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
grant all on _t to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', '{}', true);
$$;

insert into auth.users (id, email, aud, role, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000f0001', 'sin.confirmar@prueba.test', 'authenticated', 'authenticated', null, '{"full_name": "Sin Confirmar"}'),
  ('00000000-0000-0000-0000-0000000f0002', 'dueña@burgerxyz.test', 'authenticated', 'authenticated', now(), '{"full_name": "Carla Dueña"}'),
  ('00000000-0000-0000-0000-0000000f0003', 'otro@burgerxyz.test', 'authenticated', 'authenticated', now(), '{"full_name": "Otro Dueño"}');

-- 1. Sin confirmar el correo no se crea nada
select pg_temp.act_as('00000000-0000-0000-0000-0000000f0001');
set local role authenticated;
do $$ begin
  begin perform dk_create_organization('Negocio Fantasma', 'fast_food', 'burgers');
    insert into _t (area, test, expected, got) values ('Registro', 'Correo sin confirmar', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Registro', 'Correo sin confirmar', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

-- 2. Correo confirmado: organización + primera Cuenta + dueña Super Admin
select pg_temp.act_as('00000000-0000-0000-0000-0000000f0002');
set local role authenticated;
do $$ declare v_slug text; begin
  v_slug := dk_create_organization('Hamburguesería Centro', 'fast_food', 'burgers', 'Calle 10 #5-20', 'Bogotá', 'CO', '3001234567', null, null, null, 'business');
  insert into _t (area, test, expected, got) values ('Registro', 'Devuelve la primera Cuenta', 'hamburgueseria-centro', v_slug);
  insert into _t (area, test, expected, got) values ('Registro', 'Perfil creado con su nombre y correo', 'Carla Dueña · dueña@burgerxyz.test',
    (select full_name || ' · ' || email from dk_users where auth_user_id = auth.uid()));
  insert into _t (area, test, expected, got) values ('Registro', 'Organización con sus datos (sector · categoría · ciudad · zona horaria)', 'fast_food · burgers · Bogotá · America/Bogota',
    (select sector || ' · ' || category || ' · ' || city || ' · ' || default_timezone from dk_organizations where owner_user_id = dk_current_profile_id()));
  insert into _t (area, test, expected, got) values ('Registro', 'La dueña es Super Admin: contexto con 1 org y 1 Cuenta con acceso total', '1 · 1 · true',
    (select jsonb_array_length(c -> 'organizations') || ' · ' || jsonb_array_length(c -> 'accounts') || ' · ' || (c -> 'accounts' -> 0 ->> 'superAdmin') from (select dk_my_context() c) x));
  insert into _t (area, test, expected, got) values ('Registro', 'Queda como última Cuenta (para volver a entrar)', 'sí',
    (select case when last_account_id = (select id from dk_kitchens where slug = v_slug) then 'sí' else 'no' end from dk_users where auth_user_id = auth.uid()));
  -- Idempotente: abrir el enlace otra vez no crea otra organización.
  insert into _t (area, test, expected, got) values ('Registro', 'Segunda llamada: misma Cuenta, sin duplicar', 'hamburgueseria-centro · 1',
    dk_create_organization('Otro nombre', 'cafe', 'coffee') || ' · ' || (select count(*) from dk_organizations where owner_user_id = dk_current_profile_id()));
end $$;
reset role;

-- La configuración inicial (se verifica como dueño de la base: la RLS la muestra solo dentro de la Cuenta).
select set_config('request.jwt.claims', '{}', true);
do $$ begin
  insert into _t (area, test, expected, got) values ('Registro', 'La Cuenta nace con su configuración (SLA · funciones sin filas: valen las del catálogo · contador)', '1 · 0 · 1',
    (select (select count(*) from dk_kitchen_sla_settings s where s.kitchen_id = k.id) || ' · ' || (select count(*) from dk_kitchen_features f where f.kitchen_id = k.id)
      || ' · ' || (select count(*) from dk_kitchen_counters c where c.kitchen_id = k.id) from dk_kitchens k where k.slug = 'hamburgueseria-centro'));
end $$;

-- 3. Otro negocio con el mismo nombre: identificador con sufijo; sin ver al primero
select pg_temp.act_as('00000000-0000-0000-0000-0000000f0003');
set local role authenticated;
do $$ declare v_slug text; begin
  v_slug := dk_create_organization('Hamburguesería Centro', 'restaurant', 'burgers', p_plan => 'standard');
  insert into _t (area, test, expected, got) values ('Registro', 'Nombre repetido: identificador con sufijo', 'hamburgueseria-centro-2', v_slug);
  insert into _t (area, test, expected, got) values ('Aislamiento', 'No ve la organización del otro dueño', '1', (select count(*)::text from dk_organizations));
  insert into _t (area, test, expected, got) values ('Registro', 'Quien ya es dueño no crea una segunda organización', 'hamburgueseria-centro-2',
    dk_create_organization('Tercera', 'cafe', 'coffee'));
end $$;
reset role;

-- Sector inválido (usuario nuevo)
select set_config('request.jwt.claims', '{}', true);
insert into auth.users (id, email, aud, role, email_confirmed_at) values ('00000000-0000-0000-0000-0000000f0004', 'sector@prueba.test', 'authenticated', 'authenticated', now());
select pg_temp.act_as('00000000-0000-0000-0000-0000000f0004');
set local role authenticated;
do $$ begin
  begin perform dk_create_organization('Con sector raro', 'no_existe', 'burgers', p_plan => 'standard');
    insert into _t (area, test, expected, got) values ('Registro', 'Sector que no está en la lista', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Registro', 'Sector que no está en la lista', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

-- 4. Sin sesión
select set_config('request.jwt.claims', '{}', true);
set local role anon;
do $$ begin
  begin perform dk_create_organization('Anónimo', 'cafe', 'coffee');
    insert into _t (area, test, expected, got) values ('Registro', 'Sin sesión', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Registro', 'Sin sesión', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
