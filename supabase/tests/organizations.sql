-- Pruebas de organizaciones, Super Admin, varios roles y rol activo
-- (ADR 0008, Fase C). Transacción revertida.
--
--   python3 supabase/tests/run.py organizations

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid) on commit drop;
grant all on _t, _ctx to authenticated;
grant usage on sequence _t_n_seq to authenticated;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid, p_role text default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers',
    (case when p_kitchen is null then '{}'::jsonb else jsonb_build_object('x-dk-kitchen-id', p_kitchen) end
     || case when p_role is null then '{}'::jsonb else jsonb_build_object('x-dk-role-id', p_role) end)::text, true);
$$;
create or replace function pg_temp.role_id(p_key text) returns uuid language sql as $$ select id from dk_roles where is_system and key = p_key $$;

-- Organización A = la inicial (Dark Kitchen), con la Cuenta A y una Cuenta A2.
insert into _ctx values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx values ('orgA', (select organization_id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx values ('ivan', (select id from auth.users where email = 'ivanclabe@gmail.com'));

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000a0a0', 'ana@grupob.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a0b1', 'juan@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a0b2', 'contador@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a0b3', 'encargado@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a0b4', 'cajero@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-00000000a0a0', '00000000-0000-0000-0000-00000000a0a0', 'Ana (dueña de B)', true),
  ('10000000-0000-0000-0000-00000000a0b1', '00000000-0000-0000-0000-00000000a0b1', 'Juan', true),
  ('10000000-0000-0000-0000-00000000a0b2', '00000000-0000-0000-0000-00000000a0b2', 'Contador', true),
  ('10000000-0000-0000-0000-00000000a0b3', '00000000-0000-0000-0000-00000000a0b3', 'Encargado', true),
  ('10000000-0000-0000-0000-00000000a0b4', '00000000-0000-0000-0000-00000000a0b4', 'Cajero', true);

-- Organización B (dueña Ana) — hasta la Fase F se crea directo en la base.
insert into dk_organizations (slug, name, owner_user_id, sector, category)
values ('grupo-b', 'Grupo B', '10000000-0000-0000-0000-00000000a0a0', 'fast_food', 'burgers');
insert into _ctx values ('orgB', (select id from dk_organizations where slug = 'grupo-b'));

do $$ begin
  insert into _t (area, test, expected, got) values ('Modelo', 'La dueña queda como Super Admin activa', 'sí',
    (select case when is_super_admin and status = 'active' then 'sí' else 'no' end from dk_organization_members
     where organization_id = (select id from _ctx where key = 'orgB') and user_id = '10000000-0000-0000-0000-00000000a0a0'));
end $$;

-- Ivan crea A2 en su organización; Ana crea B1 en la suya.
select pg_temp.act_as((select id from _ctx where key = 'ivan'), null);
set local role authenticated;
do $$ begin insert into _ctx values ('A2', dk_create_kitchen('Cuenta A2', 'cuenta-a2')); end $$;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000a0a0', null);
set local role authenticated;
do $$ begin
  insert into _ctx values ('B1', dk_create_kitchen('Hamburguesas B1', 'hamburguesas-b1', null, null, (select id from _ctx where key = 'orgB')));
  begin perform dk_create_kitchen('Intrusa', 'intrusa-en-a', null, null, (select id from _ctx where key = 'orgA'));
    insert into _t (area, test, expected, got) values ('Aislamiento', 'Ana crea una Cuenta en la organización A', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Aislamiento', 'Ana crea una Cuenta en la organización A', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

-- Asignaciones (como dueño de la base: sin identidad de usuario).
select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id) values
  ((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-00000000a0b1', pg_temp.role_id('ADMIN')),
  ((select id from _ctx where key = 'A2'), '10000000-0000-0000-0000-00000000a0b1', pg_temp.role_id('KITCHEN')),
  ((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-00000000a0b2', pg_temp.role_id('CASHIER')),
  ((select id from _ctx where key = 'B1'), '10000000-0000-0000-0000-00000000a0b2', pg_temp.role_id('INVENTORY')),
  ((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-00000000a0b4', pg_temp.role_id('CASHIER'));
insert into dk_member_roles (kitchen_id, user_id, role_id) values
  ((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-00000000a0b1', pg_temp.role_id('KITCHEN'));

do $$ begin
  insert into _t (area, test, expected, got) values ('Modelo', 'Entrar a una Cuenta hace Miembro de su organización', 'Miembro activo',
    (select case when not is_super_admin and status = 'active' then 'Miembro activo' else 'otro' end from dk_organization_members
     where organization_id = (select id from _ctx where key = 'orgB') and user_id = '10000000-0000-0000-0000-00000000a0b2'));
  insert into _t (area, test, expected, got) values ('Modelo', 'El rol predeterminado queda entre los asignados', '2',
    (select count(*)::text from dk_member_roles where kitchen_id = (select id from _ctx where key = 'A') and user_id = '10000000-0000-0000-0000-00000000a0b1'));
end $$;

-- 1. Ana (Super Admin de B) no ve nada de A
select pg_temp.act_as('00000000-0000-0000-0000-00000000a0a0', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Aislamiento', 'Ana con encabezado de la Cuenta A: Cuenta activa', 'NULL', coalesce(dk_current_kitchen_id()::text, 'NULL'));
  insert into _t (area, test, expected, got) values ('Aislamiento', 'Ana con encabezado de A: pedidos', '0', (select count(*)::text from dk_orders));
  insert into _t (area, test, expected, got) values ('Aislamiento', 'Ana ve organizaciones', 'Grupo B', (select string_agg(name, ', ') from dk_organizations));
  insert into _t (area, test, expected, got) values ('Aislamiento', 'Ana ve Cuentas', 'Hamburguesas B1', (select string_agg(name, ', ') from dk_kitchens));
  insert into _t (area, test, expected, got) values ('Aislamiento', 'Ana ve a Juan (org A)', '0', (select count(*)::text from dk_users where id = '10000000-0000-0000-0000-00000000a0b1'));
  insert into _t (area, test, expected, got) values ('Aislamiento', 'Ana ve membresías de la org A', '0',
    (select count(*)::text from dk_organization_members where organization_id = (select id from _ctx where key = 'orgA')));
  insert into _t (area, test, expected, got) values ('Contexto', 'Ana: dk_my_context (orgs · Cuentas)', '1 · 1',
    (select jsonb_array_length(c -> 'organizations') || ' · ' || jsonb_array_length(c -> 'accounts') from (select dk_my_context() c) x));
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a0a0', (select id from _ctx where key = 'B1'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Super Admin', 'Ana en B1: acceso total', 'ALL · sí', dk_active_role() || ' · ' || case when dk_can('audit.view') then 'sí' else 'no' end);
  insert into _ctx values ('rol_b', dk_save_role(null, 'Parrillero', null, array['kitchen.view', 'kitchen.prepare']));
  insert into _t (area, test, expected, got) values ('Super Admin', 'Ana crea un rol propio en su organización', 'Grupo B',
    (select o.name from dk_roles r join dk_organizations o on o.id = r.organization_id where r.id = (select id from _ctx where key = 'rol_b')));
  begin update dk_organizations set owner_user_id = '10000000-0000-0000-0000-00000000a0b2' where id = (select id from _ctx where key = 'orgB');
    insert into _t (area, test, expected, got) values ('Guardas', 'Cambiar el dueño directamente', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Guardas', 'Cambiar el dueño directamente', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin update dk_organizations set max_accounts = 100 where id = (select id from _ctx where key = 'orgB');
    insert into _t (area, test, expected, got) values ('Guardas', 'Subirse el tope de Cuentas', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Guardas', 'Subirse el tope de Cuentas', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

-- 2. Juan: varios roles en A (Administrador + Cocina) y Cocina en A2
select pg_temp.act_as('00000000-0000-0000-0000-00000000a0b1', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Rol activo', 'Juan en A sin elegir: ADMIN (administra equipo)', 'sí',
    case when dk_can('team.manage') and dk_active_role() = pg_temp.role_id('ADMIN')::text then 'sí' else 'no' end);
  insert into _t (area, test, expected, got) values ('Rol activo', 'Juan ve el rol propio de la org B', '0', (select count(*)::text from dk_roles where id = (select id from _ctx where key = 'rol_b')));
  insert into _t (area, test, expected, got) values ('Contexto', 'Juan: roles en A · predeterminado', '2 · ADMIN',
    (select jsonb_array_length(a -> 'roles') || ' · ' || (select name from dk_roles where id::text = a ->> 'defaultRoleId')
     from jsonb_array_elements(dk_my_context() -> 'accounts') a where a ->> 'id' = (select id from _ctx where key = 'A')::text));
  insert into _t (area, test, expected, got) values ('Organización', 'Juan (Miembro): ver org · administrar usuarios', 'sí · no',
    case when dk_has_org_permission((select id from _ctx where key = 'orgA'), 'organization.view') then 'sí' else 'no' end || ' · ' ||
    case when dk_has_org_permission((select id from _ctx where key = 'orgA'), 'users.manage') then 'sí' else 'no' end);
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a0b1', (select id from _ctx where key = 'A'), pg_temp.role_id('KITCHEN')::text);
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Rol activo', 'Juan cambia a Cocina: prepara · administra equipo', 'sí · no',
    case when dk_can('kitchen.prepare') then 'sí' else 'no' end || ' · ' || case when dk_can('team.manage') then 'sí' else 'no' end);
  insert into _t (area, test, expected, got) values ('Rol activo', 'Como Cocina ve clientes', '0', (select count(*)::text from dk_customers));
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a0b1', (select id from _ctx where key = 'A'), pg_temp.role_id('CASHIER')::text);
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Rol activo', 'Juan pide un rol NO asignado (CAJA): se ignora', 'ADMIN',
    (select name from dk_roles where id::text = dk_active_role()));
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a0b1', (select id from _ctx where key = 'A'), 'super-admin');
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Rol activo', 'Juan pide "super-admin" sin serlo: se ignora', 'ADMIN',
    (select name from dk_roles where id::text = dk_active_role()));
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a0b1', (select id from _ctx where key = 'A2'), pg_temp.role_id('ADMIN')::text);
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Rol activo', 'Juan en A2 pide ADMIN (solo lo tiene en A): se ignora', 'COCINA · no',
    (select name from dk_roles where id::text = dk_active_role()) || ' · ' || case when dk_can('team.manage') then 'sí' else 'no' end);
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a0b1', (select id from _ctx where key = 'B1'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Aislamiento', 'Juan con encabezado de B1', 'NULL', coalesce(dk_current_kitchen_id()::text, 'NULL'));
end $$;
reset role;

-- 3. Contador: usuario de dos organizaciones
select pg_temp.act_as('00000000-0000-0000-0000-00000000a0b2', (select id from _ctx where key = 'B1'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Dos organizaciones', 'Contador en B1 (Inventario): inventario · pedidos', 'sí · no',
    case when dk_can('inventory.view') then 'sí' else 'no' end || ' · ' || case when dk_can('orders.view') then 'sí' else 'no' end);
  insert into _t (area, test, expected, got) values ('Dos organizaciones', 'Contador: organizaciones en su contexto', '2',
    (select jsonb_array_length(dk_my_context() -> 'organizations')::text));
end $$;
reset role;

-- 4. Escalamiento: un "Encargado" con team.manage pero pocos permisos
select pg_temp.act_as((select id from _ctx where key = 'ivan'), (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _ctx values ('r_encargado', dk_save_role(null, 'Encargado', null, array['orders.view', 'team.view', 'team.manage']));
  insert into _ctx values ('r_ver_pedidos', dk_save_role(null, 'Ver pedidos', null, array['orders.view']));
  perform dk_set_member_roles((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-00000000a0b3',
    array[(select id from _ctx where key = 'r_encargado')], (select id from _ctx where key = 'r_encargado'));
  begin perform dk_set_member_roles((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-00000000a0b4',
      array[(select id from _ctx where key = 'rol_b')], (select id from _ctx where key = 'rol_b'));
    insert into _t (area, test, expected, got) values ('Escalamiento', 'Asignar en A un rol de la org B', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Escalamiento', 'Asignar en A un rol de la org B', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a0b3', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  begin perform dk_set_member_roles((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-00000000a0b4',
      array[pg_temp.role_id('ADMIN')], pg_temp.role_id('ADMIN'));
    insert into _t (area, test, expected, got) values ('Escalamiento', 'Encargado da Administrador (más permisos que los suyos)', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Escalamiento', 'Encargado da Administrador (más permisos que los suyos)', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin
    update dk_kitchen_members set default_role_id = pg_temp.role_id('ADMIN')
    where kitchen_id = (select id from _ctx where key = 'A') and user_id = '10000000-0000-0000-0000-00000000a0b4';
    insert into _t (area, test, expected, got) values ('Escalamiento', 'Encargado da Administrador por la tabla (sin RPC)', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Escalamiento', 'Encargado da Administrador por la tabla (sin RPC)', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin perform dk_set_member_roles((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-00000000a0b3',
      array[pg_temp.role_id('ADMIN')], pg_temp.role_id('ADMIN'));
    insert into _t (area, test, expected, got) values ('Escalamiento', 'Encargado se asigna roles a sí mismo', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Escalamiento', 'Encargado se asigna roles a sí mismo', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin perform dk_set_member_roles((select id from _ctx where key = 'A2'), '10000000-0000-0000-0000-00000000a0b4',
      array[(select id from _ctx where key = 'r_ver_pedidos')], (select id from _ctx where key = 'r_ver_pedidos'));
    insert into _t (area, test, expected, got) values ('Escalamiento', 'Encargado asigna en otra Cuenta (A2)', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Escalamiento', 'Encargado asigna en otra Cuenta (A2)', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin perform dk_save_role((select id from _ctx where key = 'r_encargado'), 'Encargado', null, array['orders.view', 'team.manage', 'audit.view']);
    insert into _t (area, test, expected, got) values ('Escalamiento', 'Encargado edita su propio rol', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Escalamiento', 'Encargado edita su propio rol', 'bloqueado', 'bloqueado', sqlerrm); end;
  perform dk_set_member_roles((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-00000000a0b4',
    array[pg_temp.role_id('CASHIER'), (select id from _ctx where key = 'r_ver_pedidos')], pg_temp.role_id('CASHIER'));
  insert into _t (area, test, expected, got) values ('Escalamiento', 'Encargado agrega "Ver pedidos" (dentro de sus permisos)', '2',
    (select count(*)::text from dk_member_roles where kitchen_id = (select id from _ctx where key = 'A') and user_id = '10000000-0000-0000-0000-00000000a0b4'));
end $$;
reset role;

-- 5. Menú maestro de A no se comparte con B1
select pg_temp.act_as((select id from _ctx where key = 'ivan'), null);
set local role authenticated;
do $$ declare v_menu uuid; begin
  insert into dk_master_menus (name) values ('Menú de A') returning id into v_menu;
  insert into _t (area, test, expected, got) values ('Menús maestros', 'El menú queda en la organización del Super Admin', 'Dark Kitchen',
    (select o.name from dk_master_menus m join dk_organizations o on o.id = m.organization_id where m.id = v_menu));
  begin perform dk_assign_master_menu(v_menu, array[(select id from _ctx where key = 'B1')]);
    insert into _t (area, test, expected, got) values ('Menús maestros', 'Compartir con una Cuenta de otra organización', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Menús maestros', 'Compartir con una Cuenta de otra organización', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

-- 6. Guardas del dueño y organizaciones/membresías desactivadas (como dueño de la base)
select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
do $$ begin
  begin update dk_organization_members set is_super_admin = false
      where organization_id = (select id from _ctx where key = 'orgB') and user_id = '10000000-0000-0000-0000-00000000a0a0';
    insert into _t (area, test, expected, got) values ('Guardas', 'Quitarle Super Admin a la dueña', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Guardas', 'Quitarle Super Admin a la dueña', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;

update dk_organizations set active = false where id = (select id from _ctx where key = 'orgB');
update dk_organization_members set status = 'disabled'
  where organization_id = (select id from _ctx where key = 'orgA') and user_id = '10000000-0000-0000-0000-00000000a0b4';

select pg_temp.act_as('00000000-0000-0000-0000-00000000a0a0', (select id from _ctx where key = 'B1'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Desactivación', 'Org B desactivada: Ana en B1', 'NULL', coalesce(dk_current_kitchen_id()::text, 'NULL'));
end $$;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000a0b2', (select id from _ctx where key = 'B1'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Desactivación', 'Org B desactivada: Contador en B1', 'NULL', coalesce(dk_current_kitchen_id()::text, 'NULL'));
end $$;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000a0b2', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Desactivación', 'Contador sigue entrando a A (otra organización)', 'sí',
    case when dk_current_kitchen_id() = (select id from _ctx where key = 'A') then 'sí' else 'no' end);
end $$;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000a0b4', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Desactivación', 'Cajero desactivado en la organización: en A', 'NULL', coalesce(dk_current_kitchen_id()::text, 'NULL'));
end $$;
reset role;
select pg_temp.act_as((select id from _ctx where key = 'ivan'), (select id from _ctx where key = 'B1'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Plataforma', 'Administrador de la plataforma entra a B1 desactivada (soporte)', 'sí · ALL',
    case when dk_current_kitchen_id() = (select id from _ctx where key = 'B1') then 'sí' else 'no' end || ' · ' || dk_active_role());
end $$;
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
