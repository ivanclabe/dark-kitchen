-- Pruebas de usuarios de la organización: crear (pendiente), activar,
-- reutilizar identidad, SUPER_ADMIN (solo el creador, intransferible) y quitar
-- (ADR 0008, Fase E). Transacción revertida.
--
--   python3 supabase/tests/run.py org_users

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, txt text) on commit drop;
grant all on _t, _ctx to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid, p_email text default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated', 'email', p_email)::text, true);
  select set_config('request.headers', case when p_kitchen is null then '{}' else json_build_object('x-dk-kitchen-id', p_kitchen)::text end, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.role_id(p_key text) returns uuid language sql as $$ select id from dk_roles where is_system and key = p_key $$;
create or replace function pg_temp.ctx(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.tok(p_key text) returns text language sql as $$ select txt from _ctx where key = p_key $$;

insert into _ctx (key, id) values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx (key, id) values ('orgA', (select organization_id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx (key, id) values ('ivan', (select id from auth.users where email = 'ivanclabe@gmail.com'));

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000e0001', 'admin.a@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e0002', 'ana@grupob.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e0003', 'juan@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000e0001', 'Admin A', true),
  ('10000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-0000000e0002', 'Ana', true),
  ('10000000-0000-0000-0000-0000000e0003', '00000000-0000-0000-0000-0000000e0003', 'Juan', true);
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id) values
  (pg_temp.ctx('A'), '10000000-0000-0000-0000-0000000e0001', pg_temp.role_id('ADMIN')),
  (pg_temp.ctx('A'), '10000000-0000-0000-0000-0000000e0003', pg_temp.role_id('CASHIER'));
insert into dk_organizations (slug, name, owner_user_id) values ('grupo-b', 'Grupo B', '10000000-0000-0000-0000-0000000e0002');
insert into _ctx (key, id) values ('orgB', (select id from dk_organizations where slug = 'grupo-b'));

do $$ begin
  insert into _t (area, test, expected, got) values ('Perfil', 'El perfil toma el correo de Auth', 'admin.a@prueba.test',
    (select email from dk_users where id = '10000000-0000-0000-0000-0000000e0001'));
end $$;

-- 1. El Super Admin crea a María (Cocina en A, Domiciliario en A2)
select pg_temp.act_as(pg_temp.ctx('ivan'), null);
set local role authenticated;
do $$ declare r jsonb; begin
  insert into _ctx (key, id) values ('A2', dk_create_kitchen('Cuenta A2', 'cuenta-a2'));
  r := dk_create_user(pg_temp.ctx('orgA'), 'María Pérez', 'Maria@Prueba.test ', jsonb_build_array(
    jsonb_build_object('kitchen_id', pg_temp.ctx('A'), 'role_ids', jsonb_build_array(pg_temp.role_id('KITCHEN')), 'default_role_id', pg_temp.role_id('KITCHEN')),
    jsonb_build_object('kitchen_id', pg_temp.ctx('A2'), 'role_ids', jsonb_build_array(pg_temp.role_id('DELIVERY')))));
  insert into _ctx values ('maria', (r ->> 'user_id')::uuid, r ->> 'token');
  insert into _t (area, test, expected, got) values ('Crear usuario', 'Devuelve el enlace (token de 48)', '48', length(r ->> 'token')::text);
  insert into _t (area, test, expected, got) values ('Crear usuario', 'María queda pendiente, sin usuario de Auth, con correo normalizado', 'pending · sin auth · maria@prueba.test',
    (select om.status || ' · ' || case when u.auth_user_id is null then 'sin auth' else 'con auth' end || ' · ' || u.email
     from dk_users u join dk_organization_members om on om.user_id = u.id and om.organization_id = pg_temp.ctx('orgA') where u.id = pg_temp.ctx('maria')));
  insert into _t (area, test, expected, got) values ('Crear usuario', 'El listado la muestra con sus 2 Cuentas', 'pending · 2',
    (select (x ->> 'status') || ' · ' || jsonb_array_length(x -> 'accounts') from jsonb_array_elements(dk_org_users(pg_temp.ctx('orgA'))) x
     where (x ->> 'userId')::uuid = pg_temp.ctx('maria')));
  insert into _t (area, test, expected, got) values ('Crear usuario', 'El token no se guarda en claro', '0',
    (select count(*)::text from dk_user_activations where token_hash = pg_temp.tok('maria')));
  begin perform dk_create_user(pg_temp.ctx('orgA'), 'María otra vez', 'maria@prueba.test',
      jsonb_build_array(jsonb_build_object('kitchen_id', pg_temp.ctx('A'), 'role_ids', jsonb_build_array(pg_temp.role_id('KITCHEN')))));
    insert into _t (area, test, expected, got) values ('Crear usuario', 'Crear el mismo correo dos veces', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Crear usuario', 'Crear el mismo correo dos veces', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

-- Pendiente = sin acceso todavía
select pg_temp.as_owner();
do $$ begin
  insert into _t (area, test, expected, got) values ('Crear usuario', 'Su membresía en A existe pero la organización está pendiente', 'pending',
    (select status from dk_organization_members where organization_id = pg_temp.ctx('orgA') and user_id = pg_temp.ctx('maria')));
end $$;

-- 2. El Administrador de la Cuenta A crea usuarios solo en A
select pg_temp.act_as('00000000-0000-0000-0000-0000000e0001', pg_temp.ctx('A'));
set local role authenticated;
do $$ declare r jsonb; begin
  r := dk_create_user(pg_temp.ctx('orgA'), 'Pedro Caja', 'pedro@prueba.test',
    jsonb_build_array(jsonb_build_object('kitchen_id', pg_temp.ctx('A'), 'role_ids', jsonb_build_array(pg_temp.role_id('CASHIER')))));
  insert into _ctx values ('pedro', (r ->> 'user_id')::uuid, r ->> 'token');
  insert into _t (area, test, expected, got) values ('Admin de Cuenta', 'Crea a Pedro en su Cuenta', 'sí', case when r ? 'token' then 'sí' else 'no' end);
  begin perform dk_create_user(pg_temp.ctx('orgA'), 'Rosa', 'rosa@prueba.test',
      jsonb_build_array(jsonb_build_object('kitchen_id', pg_temp.ctx('A2'), 'role_ids', jsonb_build_array(pg_temp.role_id('CASHIER')))));
    insert into _t (area, test, expected, got) values ('Admin de Cuenta', 'Crea un usuario en otra Cuenta (A2)', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Admin de Cuenta', 'Crea un usuario en otra Cuenta (A2)', 'bloqueado', 'bloqueado', sqlerrm); end;
  insert into _t (area, test, expected, got) values ('Admin de Cuenta', 'Ve solo a la gente de su Cuenta (María solo con A)', '1',
    (select jsonb_array_length(x -> 'accounts')::text from jsonb_array_elements(dk_org_users(pg_temp.ctx('orgA'))) x where (x ->> 'userId')::uuid = pg_temp.ctx('maria')));
  -- Sin política de escritura: el intento directo no cambia nada (se verifica abajo, como dueño de la base).
  update dk_organization_members set is_super_admin = true where organization_id = pg_temp.ctx('orgA') and user_id = pg_temp.ctx('pedro');
  perform dk_update_pending_user(pg_temp.ctx('orgA'), pg_temp.ctx('pedro'), 'Pedro Gómez', 'pedro.gomez@prueba.test');
  insert into _t (area, test, expected, got) values ('Admin de Cuenta', 'Corrige el correo de Pedro (pendiente)', 'pedro.gomez@prueba.test',
    (select x ->> 'email' from jsonb_array_elements(dk_org_users(pg_temp.ctx('orgA'))) x where (x ->> 'userId')::uuid = pg_temp.ctx('pedro')));
end $$;
reset role;

-- 3. Vista previa sin sesión
select pg_temp.as_owner();
set local role anon;
do $$ begin
  insert into _t (area, test, expected, got) values ('Activación', 'Vista previa sin sesión', 'valid · Dark Kitchen · María Pérez · sin usuario',
    (select status || ' · ' || organization_name || ' · ' || full_name || ' · ' || case when has_user then 'con usuario' else 'sin usuario' end
     from dk_activation_preview(pg_temp.tok('maria'))));
end $$;
reset role;

-- 4. María se registra en Auth y activa
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000e0010', 'maria@prueba.test', 'authenticated', 'authenticated', '{"full_name": "María P."}');
select pg_temp.act_as('00000000-0000-0000-0000-0000000e0003', null, 'juan@prueba.test');
set local role authenticated;
do $$ begin
  begin perform dk_accept_activation(pg_temp.tok('maria'));
    insert into _t (area, test, expected, got) values ('Activación', 'Activar con otro correo', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Activación', 'Activar con otro correo', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000e0010', null, 'maria@prueba.test');
set local role authenticated;
do $$ declare v_slug text; begin
  v_slug := dk_accept_activation(pg_temp.tok('maria'));
  insert into _t (area, test, expected, got) values ('Activación', 'Activa y entra a su primera Cuenta', 'dark-kitchen-1', v_slug);
  insert into _t (area, test, expected, got) values ('Activación', 'Su perfil ahora es suyo (mismo id)', 'sí',
    case when dk_current_profile_id() = pg_temp.ctx('maria') then 'sí' else 'no' end);
  begin perform dk_accept_activation(pg_temp.tok('maria'));
    insert into _t (area, test, expected, got) values ('Activación', 'Reusar el enlace', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Activación', 'Reusar el enlace', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000e0010', pg_temp.ctx('A'), 'maria@prueba.test');
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Activación', 'María trabaja en A como COCINA', 'COCINA · prepara',
    (select name from dk_roles where id::text = dk_active_role()) || ' · ' || case when dk_can('kitchen.prepare') then 'prepara' else 'no' end);
end $$;
reset role;

-- 5. Ana (Grupo B) invita a Juan, que ya existe (trabaja en A): se reutiliza su identidad
select pg_temp.act_as('00000000-0000-0000-0000-0000000e0002', null, 'ana@grupob.test');
set local role authenticated;
do $$ declare r jsonb; begin
  insert into _ctx (key, id) values ('B1', dk_create_kitchen('Hamburguesas B1', 'hamburguesas-b1', null, null, pg_temp.ctx('orgB')));
  r := dk_create_user(pg_temp.ctx('orgB'), 'Juan', 'juan@prueba.test',
    jsonb_build_array(jsonb_build_object('kitchen_id', pg_temp.ctx('B1'), 'role_ids', jsonb_build_array(pg_temp.role_id('INVENTORY')))));
  insert into _ctx values ('juanB', (r ->> 'user_id')::uuid, r ->> 'token');
  insert into _t (area, test, expected, got) values ('Identidad', 'Juan conserva su perfil (no se duplica)', 'sí',
    case when (r ->> 'user_id')::uuid = '10000000-0000-0000-0000-0000000e0003' then 'sí' else 'no' end);
end $$;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000e0003', pg_temp.ctx('B1'), 'juan@prueba.test');
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Identidad', 'Antes de aceptar, Juan no entra a B1', 'NULL', coalesce(dk_current_kitchen_id()::text, 'NULL'));
  perform dk_accept_activation(pg_temp.tok('juanB'));
  insert into _t (area, test, expected, got) values ('Identidad', 'Después de aceptar: organizaciones de Juan', '2', (select jsonb_array_length(dk_my_context() -> 'organizations')::text));
end $$;
reset role;

-- 6. Unir identidades: el pendiente se crea, pero la persona ya se había registrado por su cuenta
select pg_temp.act_as(pg_temp.ctx('ivan'), null);
set local role authenticated;
do $$ declare r jsonb; begin
  r := dk_create_user(pg_temp.ctx('orgA'), 'Luis', 'luis@prueba.test',
    jsonb_build_array(jsonb_build_object('kitchen_id', pg_temp.ctx('A'), 'role_ids', jsonb_build_array(pg_temp.role_id('CASHIER')))));
  insert into _ctx values ('luis_pend', (r ->> 'user_id')::uuid, r ->> 'token');
end $$;
reset role;
select pg_temp.as_owner();
insert into auth.users (id, email, aud, role) values ('00000000-0000-0000-0000-0000000e0011', 'luis2@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values ('10000000-0000-0000-0000-0000000e0011', '00000000-0000-0000-0000-0000000e0011', 'Luis (ya registrado)', true);
update auth.users set email = 'luis@prueba.test' where id = '00000000-0000-0000-0000-0000000e0011';
do $$ begin
  insert into _t (area, test, expected, got) values ('Identidad', 'El correo del perfil sigue al de Auth (aunque haya un pendiente con ese correo)', 'luis@prueba.test',
    (select email from dk_users where id = '10000000-0000-0000-0000-0000000e0011'));
end $$;
select pg_temp.act_as('00000000-0000-0000-0000-0000000e0011', null, 'luis@prueba.test');
set local role authenticated;
do $$ begin
  perform dk_accept_activation(pg_temp.tok('luis_pend'));
  insert into _t (area, test, expected, got) values ('Identidad', 'Al activar se unen: queda su perfil con CAJA en A', 'CAJA',
    (select r.name from dk_kitchen_members m join dk_roles r on r.id = m.default_role_id
     where m.kitchen_id = pg_temp.ctx('A') and m.user_id = '10000000-0000-0000-0000-0000000e0011'));
end $$;
reset role;
select pg_temp.as_owner();
do $$ begin
  insert into _t (area, test, expected, got) values ('Identidad', 'El perfil pendiente se elimina', '0', (select count(*)::text from dk_users where id = pg_temp.ctx('luis_pend')));
end $$;

-- 7. SUPER_ADMIN: solo el creador (nadie más lo recibe); desactivar y quitar
-- Ni siquiera el dueño de la base puede dárselo a otro usuario (lo impide el disparador).
select pg_temp.as_owner();
do $$ begin
  insert into _t (area, test, expected, got) values ('SUPER_ADMIN', 'Los intentos de usuarios no cambiaron nada (Pedro · María)', 'false · false',
    (select string_agg(is_super_admin::text, ' · ' order by u) from (
      select 1 as u, is_super_admin from dk_organization_members where organization_id = pg_temp.ctx('orgA') and user_id = pg_temp.ctx('pedro')
      union all select 2, is_super_admin from dk_organization_members where organization_id = pg_temp.ctx('orgA') and user_id = pg_temp.ctx('maria')) x));
  begin update dk_organization_members set is_super_admin = true where organization_id = pg_temp.ctx('orgA') and user_id = pg_temp.ctx('maria');
    insert into _t (area, test, expected, got) values ('SUPER_ADMIN', 'Dar SUPER_ADMIN a otro usuario (directo en la base)', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('SUPER_ADMIN', 'Dar SUPER_ADMIN a otro usuario (directo en la base)', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
select pg_temp.act_as(pg_temp.ctx('ivan'), null);
set local role authenticated;
do $$ begin
  update dk_organization_members set is_super_admin = true where organization_id = pg_temp.ctx('orgA') and user_id = pg_temp.ctx('maria');
  begin perform dk_set_org_member(pg_temp.ctx('orgA'), (select owner_user_id from dk_organizations where id = pg_temp.ctx('orgA')), false);
    insert into _t (area, test, expected, got) values ('SUPER_ADMIN', 'Desactivar al creador', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('SUPER_ADMIN', 'Desactivar al creador', 'bloqueado', 'bloqueado', sqlerrm); end;
  perform dk_set_org_member(pg_temp.ctx('orgA'), '10000000-0000-0000-0000-0000000e0003', false);
end $$;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000e0010', pg_temp.ctx('A2'), 'maria@prueba.test');
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('SUPER_ADMIN', 'María (no es creadora) en A2: su rol, no acceso total', 'DOMICILIARIO',
    (select name from dk_roles where id::text = dk_active_role()));
  begin perform dk_set_org_member(pg_temp.ctx('orgA'), pg_temp.ctx('maria'), false);
    insert into _t (area, test, expected, got) values ('SUPER_ADMIN', 'María desactiva usuarios (no es SUPER_ADMIN)', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('SUPER_ADMIN', 'María desactiva usuarios (no es SUPER_ADMIN)', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000e0003', pg_temp.ctx('A'), 'juan@prueba.test');
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Desactivar', 'Juan desactivado en la org A: entra a A', 'NULL', coalesce(dk_current_kitchen_id()::text, 'NULL'));
end $$;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000e0001', pg_temp.ctx('A'));
set local role authenticated;
do $$ begin
  perform dk_remove_org_member(pg_temp.ctx('orgA'), pg_temp.ctx('pedro'));
  insert into _t (area, test, expected, got) values ('Quitar', 'Pedro (pendiente) quitado: su perfil sin activar desaparece', '0',
    (select count(*)::text from dk_users where id = pg_temp.ctx('pedro')));
end $$;
reset role;

-- 8. SUPER_ADMIN intransferible
select pg_temp.act_as('00000000-0000-0000-0000-0000000e0002', null, 'ana@grupob.test');
set local role authenticated;
do $$ begin
  begin update dk_organizations set owner_user_id = '10000000-0000-0000-0000-0000000e0003' where id = pg_temp.ctx('orgB');
    insert into _t (area, test, expected, got) values ('SUPER_ADMIN', 'Ana cede su organización a Juan', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('SUPER_ADMIN', 'Ana cede su organización a Juan', 'bloqueado', 'bloqueado', sqlerrm); end;
  insert into _t (area, test, expected, got) values ('SUPER_ADMIN', 'Ya no existe la función de transferir', '0',
    (select count(*)::text from pg_proc where proname = 'dk_transfer_ownership'));
end $$;
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
