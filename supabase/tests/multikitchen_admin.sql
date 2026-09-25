-- Pruebas de administración multi-cocina (ADR 0007 Fase 5, ADR 0008): alta de
-- usuarios con enlace de activación, equipo, roles propios, "nadie cambia
-- su propio acceso" y panel de la plataforma. Transacción revertida.
--
--   supabase db query --linked -f supabase/tests/multikitchen_admin.sql

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, txt text) on commit drop;
grant all on _t, _ctx to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

insert into _ctx (key, id) values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx (key, id) values ('ivan', (select id from auth.users where email = 'ivanclabe@gmail.com'));

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000ad01', 'admin.a@prueba.test', 'authenticated', 'authenticated', '{}'),
  ('00000000-0000-0000-0000-00000000ca01', 'cajero.a@prueba.test', 'authenticated', 'authenticated', '{}'),
  ('00000000-0000-0000-0000-00000000ad02', 'admin.b@prueba.test', 'authenticated', 'authenticated', '{}'),
  ('00000000-0000-0000-0000-00000000ee01', 'nuevo@prueba.test', 'authenticated', 'authenticated', '{"full_name": "Nuevo Mesero"}'),
  ('00000000-0000-0000-0000-00000000ee02', 'otro@prueba.test', 'authenticated', 'authenticated', '{}');
insert into dk_users (id, auth_user_id, full_name, role, active) values
  ('11000000-0000-0000-0000-00000000ad01', '00000000-0000-0000-0000-00000000ad01', 'Admin A', 'ADMIN', true),
  ('11000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000ca01', 'Cajero A', 'CASHIER', true),
  ('11000000-0000-0000-0000-00000000ad02', '00000000-0000-0000-0000-00000000ad02', 'Admin B', 'ADMIN', true);

select set_config('request.jwt.claims', json_build_object('sub', (select id from _ctx where key = 'ivan'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _ctx (key, id) select 'B', dk_create_kitchen('Cocina Prueba B', 'cocina-prueba-b');
reset role;

insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
select k.id, u.id, r.id from (values
  ('A', '11000000-0000-0000-0000-00000000ad01'::uuid, 'ADMIN'),
  ('A', '11000000-0000-0000-0000-00000000ca01'::uuid, 'CASHIER'),
  ('B', '11000000-0000-0000-0000-00000000ad02'::uuid, 'ADMIN')
) m(kitchen, user_id, role_key)
join _ctx k on k.key = m.kitchen join dk_users u on u.id = m.user_id join dk_roles r on r.is_system and r.key = m.role_key;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated',
    'email', (select email from auth.users where id = p_auth),
    'user_metadata', (select raw_user_meta_data from auth.users where id = p_auth))::text, true);
  select set_config('request.headers', case when p_kitchen is null then '{}' else json_build_object('x-dk-kitchen-id', p_kitchen)::text end, true);
$$;

-- 1. Crear usuario (Admin A en A): queda pendiente con enlace de activación
select pg_temp.act_as('00000000-0000-0000-0000-00000000ad01', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ declare r jsonb; v_org uuid := (select organization_id from dk_kitchens where id = (select id from _ctx where key = 'A')); begin
  r := dk_create_user(v_org, 'Nuevo Mesero', 'Nuevo@Prueba.test ', jsonb_build_array(jsonb_build_object(
    'kitchen_id', (select id from _ctx where key = 'A'), 'role_ids', jsonb_build_array((select id from dk_roles where is_system and key = 'CASHIER')))));
  insert into _ctx (key, txt) values ('token', r ->> 'token');
  insert into _t (area, test, expected, got) values ('Alta', 'Admin A crea un usuario: enlace generado', 'sí', case when length(r ->> 'token') = 48 then 'sí' else 'no' end);
  insert into _t (area, test, expected, got) values ('Alta', 'El token NO se guarda en claro', '0',
    (select count(*)::text from dk_user_activations where token_hash = r ->> 'token'));
  begin perform dk_create_user(v_org, 'Cajero A', 'cajero.a@prueba.test', jsonb_build_array(jsonb_build_object(
      'kitchen_id', (select id from _ctx where key = 'A'), 'role_ids', jsonb_build_array((select id from dk_roles where is_system and key = 'CASHIER')))));
    insert into _t (area, test, expected, got) values ('Alta', 'Crear a alguien que ya es del equipo', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Alta', 'Crear a alguien que ya es del equipo', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

-- Cajero no puede crear usuarios; Admin A no puede crearlos en B
select pg_temp.act_as('00000000-0000-0000-0000-00000000ca01', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  begin perform dk_create_user((select organization_id from dk_kitchens where id = (select id from _ctx where key = 'A')), 'X', 'x@prueba.test',
      jsonb_build_array(jsonb_build_object('kitchen_id', (select id from _ctx where key = 'A'), 'role_ids', jsonb_build_array((select id from dk_roles where is_system and key = 'CASHIER')))));
    insert into _t (area, test, expected, got) values ('Alta', 'Cajero crea un usuario', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Alta', 'Cajero crea un usuario', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000ad01', (select id from _ctx where key = 'B'));
set local role authenticated;
do $$ begin
  begin perform dk_create_user((select organization_id from dk_kitchens where id = (select id from _ctx where key = 'B')), 'X', 'x@prueba.test',
      jsonb_build_array(jsonb_build_object('kitchen_id', (select id from _ctx where key = 'B'), 'role_ids', jsonb_build_array((select id from dk_roles where is_system and key = 'CASHIER')))));
    insert into _t (area, test, expected, got) values ('Alta', 'Admin A crea un usuario en la Cuenta B', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Alta', 'Admin A crea un usuario en la Cuenta B', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

-- 2. Vista previa sin sesión
select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
set local role anon;
do $$ begin
  insert into _t (area, test, expected, got) values ('Alta', 'Vista previa sin sesión', 'valid · Dark Kitchen · Nuevo Mesero',
    (select status || ' · ' || organization_name || ' · ' || full_name from dk_activation_preview((select txt from _ctx where key = 'token'))));
  insert into _t (area, test, expected, got) values ('Alta', 'Vista previa con token inventado', '0',
    (select count(*)::text from dk_activation_preview('token-falso')));
end $$;
reset role;

-- 3. Activar con otro correo: bloqueado; nadie crea perfiles por su cuenta
select pg_temp.act_as('00000000-0000-0000-0000-00000000ee02', null);
set local role authenticated;
do $$ begin
  begin perform dk_accept_activation((select txt from _ctx where key = 'token'));
    insert into _t (area, test, expected, got) values ('Alta', 'Activar con otro correo', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Alta', 'Activar con otro correo', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin
    insert into dk_users (auth_user_id, full_name, role, active) values (auth.uid(), 'Colado', 'CASHIER', false);
    insert into _t (area, test, expected, got) values ('Registro', 'Crear perfil sin ser dado de alta', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Registro', 'Crear perfil sin ser dado de alta', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin
    insert into dk_users (auth_user_id, full_name, platform_role, active) values (auth.uid(), 'Colado', 'SUPERADMIN', true);
    insert into _t (area, test, expected, got) values ('Registro', 'Autoproclamarse superusuario (ya hay perfiles)', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Registro', 'Autoproclamarse superusuario (ya hay perfiles)', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

-- 4. Activar con el correo correcto (sin perfil previo)
select pg_temp.act_as('00000000-0000-0000-0000-00000000ee01', null);
set local role authenticated;
do $$ declare v_slug text; begin
  v_slug := dk_accept_activation((select txt from _ctx where key = 'token'));
  insert into _t (area, test, expected, got) values ('Alta', 'Activar → entra a su Cuenta', 'dark-kitchen-1', v_slug);
  insert into _t (area, test, expected, got) values ('Alta', 'Perfil con su nombre (sin rol global)', 'Nuevo Mesero · sin rol global',
    (select full_name || case when role is null then ' · sin rol global' else ' · rol ' || role end from dk_users where auth_user_id = auth.uid()));
  insert into _t (area, test, expected, got) values ('Alta', 'Ya puede trabajar en A (CAJA)', 'dark-kitchen-1 · CAJA',
    (select string_agg(slug || ' · ' || role_name, ', ') from dk_my_kitchens()));
  begin perform dk_accept_activation((select txt from _ctx where key = 'token'));
    insert into _t (area, test, expected, got) values ('Alta', 'Reusar el enlace', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Alta', 'Reusar el enlace', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

-- 5. Roles propios: los crea el Super Admin (de la organización); el Admin de la Cuenta los asigna.
select pg_temp.act_as((select id from _ctx where key = 'ivan'), (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ declare v_role uuid; begin
  v_role := dk_save_role(null, 'Mesero', 'Toma pedidos', array['orders.view', 'orders.create', 'kitchen.view']);
  insert into _ctx (key, id) values ('rol_mesero', v_role);
  insert into _t (area, test, expected, got) values ('Roles', 'SUPER_ADMIN crea rol propio "Mesero" (queda MESERO)', 'MESERO · 3 permisos',
    (select name from dk_roles where id = v_role) || ' · ' || (select count(*)::text || ' permisos' from dk_role_permissions where role_id = v_role));
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000ad01', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ declare v_role uuid := (select id from _ctx where key = 'rol_mesero'); v_nuevo uuid := (select id from dk_users where auth_user_id = '00000000-0000-0000-0000-00000000ee01'); begin
  insert into _t (area, test, expected, got) values ('Equipo', 'Admin A ve el equipo con correos', 'sí',
    case when exists (select 1 from dk_kitchen_team() where email = 'nuevo@prueba.test') then 'sí' else 'no' end);
  begin perform dk_save_role(null, 'Rol del admin de Cuenta', null, array['orders.view']);
    insert into _t (area, test, expected, got) values ('Roles', 'Admin de Cuenta crea un rol (es del SUPER_ADMIN)', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Roles', 'Admin de Cuenta crea un rol (es del SUPER_ADMIN)', 'bloqueado', 'bloqueado', sqlerrm); end;
  perform dk_set_member_roles((select id from _ctx where key = 'A'), v_nuevo, array[v_role], v_role);
  insert into _t (area, test, expected, got) values ('Roles', 'Admin A asigna "MESERO" al nuevo', 'MESERO',
    (select r.name from dk_kitchen_members m join dk_roles r on r.id = m.default_role_id where m.kitchen_id = (select id from _ctx where key = 'A') and m.user_id = v_nuevo));
  begin perform dk_save_role((select id from dk_roles where is_system and key = 'CASHIER'), 'Caja hackeada', null, array['team.manage']);
    insert into _t (area, test, expected, got) values ('Roles', 'Editar un rol de sistema', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Roles', 'Editar un rol de sistema', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin perform dk_delete_role(v_role);
    insert into _t (area, test, expected, got) values ('Roles', 'Eliminar rol asignado', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Roles', 'Eliminar rol asignado', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

select pg_temp.act_as((select id from _ctx where key = 'ivan'), (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  begin perform dk_save_role(null, 'Raro', null, array['orders.fly']);
    insert into _t (area, test, expected, got) values ('Roles', 'Permiso inexistente', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Roles', 'Permiso inexistente', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000ee01', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Roles', 'Mesero: crea pedidos / ve clientes', 'sí / no',
    case when dk_can('orders.create') then 'sí' else 'no' end || ' / ' || case when dk_can('customers.view') then 'sí' else 'no' end);
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000ca01', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Equipo', 'Cajero ve el equipo', '0', (select count(*)::text from dk_kitchen_team()));
  begin insert into dk_roles (organization_id, key, name) values ((select organization_id from dk_kitchens where id = (select id from _ctx where key = 'A')), 'C_X', 'X');
    insert into _t (area, test, expected, got) values ('Roles', 'Cajero crea un rol', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Roles', 'Cajero crea un rol', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

-- 6. Nadie cambia su propio acceso (Admin B intenta bajarse de rol)
select pg_temp.act_as('00000000-0000-0000-0000-00000000ad02', (select id from _ctx where key = 'B'));
set local role authenticated;
do $$ begin
  begin update dk_kitchen_members set default_role_id = (select id from dk_roles where is_system and key = 'CASHIER')
      where kitchen_id = (select id from _ctx where key = 'B') and user_id = '11000000-0000-0000-0000-00000000ad02';
    insert into _t (area, test, expected, got) values ('Equipo', 'Admin se cambia su propio rol', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Equipo', 'Admin se cambia su propio rol', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

-- 7. Superusuario
select pg_temp.act_as('00000000-0000-0000-0000-00000000ad01', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  begin perform dk_admin_kitchens(); insert into _t (area, test, expected, got) values ('Superusuario', 'Admin de Cocina abre el panel de plataforma', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Superusuario', 'Admin de Cocina abre el panel de plataforma', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

select pg_temp.act_as((select id from _ctx where key = 'ivan'), null);
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Superusuario', 'Panel: lista todas las Cuentas de la plataforma', (select count(*)::text from dk_kitchens), (select count(*)::text from dk_admin_kitchens()));
  insert into _t (area, test, expected, got) values ('Superusuario', 'Desactivar B en grupo', '1', dk_set_kitchens_active(array[(select id from _ctx where key = 'B')], false)::text);
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000ad02', (select id from _ctx where key = 'B'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Superusuario', 'Admin B con B desactivada: Cocina activa', 'NULL', coalesce(dk_current_kitchen_id()::text, 'NULL'));
end $$;
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
