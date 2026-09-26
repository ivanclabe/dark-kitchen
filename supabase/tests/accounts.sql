-- Pruebas de Cuentas: icono, creación con herencia SUPER_ADMIN + ADMIN,
-- asignaciones propias y cambio de Cuenta (ADR 0009, secciones 3.1, 3.3 y
-- 3.4). Transacción revertida.
--
--   python3 supabase/tests/run.py accounts

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
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.role_id(p_key text) returns uuid language sql as $$ select id from dk_roles where is_system and key = p_key $$;
-- Roles asignados (nombres) de una persona en una Cuenta.
create or replace function pg_temp.roles_of(p_kitchen uuid, p_user uuid) returns text language sql as $$
  select coalesce(string_agg(r.name, ' + ' order by r.name), '—')
  from dk_member_roles mr join dk_roles r on r.id = mr.role_id where mr.kitchen_id = p_kitchen and mr.user_id = p_user
$$;

insert into _ctx values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx values ('orgA', (select organization_id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx values ('ivanAuth', (select id from auth.users where email = 'ivanclabe@gmail.com'));
insert into _ctx values ('ivan', (select id from dk_users where auth_user_id = (select id from auth.users where email = 'ivanclabe@gmail.com')));

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000ac0a0', 'ana.cuentas@grupob.test', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000ac0b1', 'admin.cuentas@prueba.test', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000ac0b2', 'cocina.cuentas@prueba.test', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000ac0c1', 'nuevo.negocio@prueba.test', 'authenticated', 'authenticated', now());
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-0000000ac0a0', '00000000-0000-0000-0000-0000000ac0a0', 'Ana (dueña de B)', true),
  ('10000000-0000-0000-0000-0000000ac0b1', '00000000-0000-0000-0000-0000000ac0b1', 'Admin de A', true),
  ('10000000-0000-0000-0000-0000000ac0b2', '00000000-0000-0000-0000-0000000ac0b2', 'Cocina de A', true);

insert into dk_organizations (slug, name, owner_user_id, sector, category)
values ('grupo-b-cuentas', 'Grupo B', '10000000-0000-0000-0000-0000000ac0a0', 'fast_food', 'burgers');
insert into _ctx values ('orgB', (select id from dk_organizations where slug = 'grupo-b-cuentas'));
-- Grupo B en Business (3 Cuentas): la prueba crea dos.
update dk_subscriptions set plan_key = 'business' where organization_id = (select id from _ctx where key = 'orgB');

-- Backfill de la migración
do $$ begin
  insert into _t (area, test, expected, got) values ('Backfill', 'El SUPER_ADMIN tiene ADMIN en las Cuentas que creó', '0',
    (select count(*)::text from dk_kitchens k join dk_organizations o on o.id = k.organization_id
     where k.created_by = o.owner_user_id
       and not exists (select 1 from dk_member_roles mr join dk_roles r on r.id = mr.role_id
                       where mr.kitchen_id = k.id and mr.user_id = o.owner_user_id and r.is_system and r.key = 'ADMIN')));
end $$;

-- 1. El SUPER_ADMIN crea una Cuenta con icono: hereda ADMIN (+ SUPER_ADMIN derivado)
select pg_temp.act_as((select id from _ctx where key = 'ivanAuth'), null);
set local role authenticated;
do $$ begin
  insert into _ctx values ('C', dk_create_kitchen('Pizzería Norte', 'pizzeria-norte-prueba', null, null, (select id from _ctx where key = 'orgA'), 'pizza'));
  insert into _t (area, test, expected, got) values ('Icono', 'La Cuenta nace con su icono', 'pizza', (select icon_key from dk_kitchens where id = (select id from _ctx where key = 'C')));
  insert into _t (area, test, expected, got) values ('Herencia', 'SUPER_ADMIN que crea: ADMIN en la Cuenta', 'ADMIN',
    pg_temp.roles_of((select id from _ctx where key = 'C'), (select id from _ctx where key = 'ivan')));
  insert into _t (area, test, expected, got) values ('Herencia', 'ADMIN es el rol predeterminado', 'ADMIN',
    (select r.name from dk_kitchen_members m join dk_roles r on r.id = m.default_role_id
     where m.kitchen_id = (select id from _ctx where key = 'C') and m.user_id = (select id from _ctx where key = 'ivan')));
  insert into _t (area, test, expected, got) values ('Herencia', 'En su contexto: SUPER_ADMIN + ADMIN', 'true · ADMIN',
    (select (a ->> 'superAdmin') || ' · ' || (select string_agg(r ->> 'name', ' + ') from jsonb_array_elements(a -> 'roles') r)
     from jsonb_array_elements(dk_my_context() -> 'accounts') a where (a ->> 'id')::uuid = (select id from _ctx where key = 'C')));
  insert into _t (area, test, expected, got) values ('Icono', 'El contexto trae el icono', 'pizza',
    (select a ->> 'iconKey' from jsonb_array_elements(dk_my_context() -> 'accounts') a where (a ->> 'id')::uuid = (select id from _ctx where key = 'C')));

  begin perform dk_create_kitchen('Icono malo', 'icono-malo-prueba', null, null, (select id from _ctx where key = 'orgA'), 'https://malo.test/logo.png');
    insert into _t (area, test, expected, got) values ('Icono', 'Icono fuera de la galería', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Icono', 'Icono fuera de la galería', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin perform dk_create_kitchen('Avatar como icono', 'avatar-icono-prueba', null, null, (select id from _ctx where key = 'orgA'), 'robot');
    insert into _t (area, test, expected, got) values ('Icono', 'Avatar de persona como icono de Cuenta', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Icono', 'Avatar de persona como icono de Cuenta', 'bloqueado', 'bloqueado', sqlerrm); end;

  -- 2. La plataforma crea en un negocio ajeno: sin herencia para nadie
  insert into _ctx values ('B2', dk_create_kitchen('Cuenta B2', 'cuenta-b2-prueba', null, null, (select id from _ctx where key = 'orgB')));
  insert into _t (area, test, expected, got) values ('Herencia', 'La plataforma crea en B: ella no hereda', '—',
    pg_temp.roles_of((select id from _ctx where key = 'B2'), (select id from _ctx where key = 'ivan')));
  insert into _t (area, test, expected, got) values ('Herencia', 'La plataforma crea en B: la dueña tampoco recibe ADMIN', '—',
    pg_temp.roles_of((select id from _ctx where key = 'B2'), '10000000-0000-0000-0000-0000000ac0a0'));
end $$;
reset role;

-- 3. Ana (SUPER_ADMIN de B) crea en su organización: hereda; y conserva el acceso global a B2
select pg_temp.act_as('00000000-0000-0000-0000-0000000ac0a0', null);
set local role authenticated;
do $$ begin
  insert into _ctx values ('B1', dk_create_kitchen('Hamburguesas B1', 'hamburguesas-b1-cuentas', null, null, (select id from _ctx where key = 'orgB')));
  insert into _t (area, test, expected, got) values ('Herencia', 'SUPER_ADMIN de B crea: ADMIN', 'ADMIN',
    pg_temp.roles_of((select id from _ctx where key = 'B1'), '10000000-0000-0000-0000-0000000ac0a0'));
  insert into _t (area, test, expected, got) values ('Herencia', 'Acceso global del SUPER_ADMIN a una Cuenta sin asignación', 'ALL',
    dk_effective_role((select id from _ctx where key = 'B2')));
end $$;
reset role;

-- 4. Registro público: la primera Cuenta también hereda
select pg_temp.act_as('00000000-0000-0000-0000-0000000ac0c1', null);
set local role authenticated;
do $$
declare v_slug text;
begin
  v_slug := dk_create_organization('Taquería Sur', 'fast_food', 'burgers', p_plan => 'standard');
  insert into _t (area, test, expected, got) values ('Herencia', 'Registro: la primera Cuenta con ADMIN', 'ADMIN',
    pg_temp.roles_of((select id from dk_kitchens where slug = v_slug), dk_current_profile_id()));
end $$;
reset role;

-- Equipo de A: un ADMIN y una COCINA (como dueño de la base)
select pg_temp.as_owner();
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id) values
  ((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-0000000ac0b1', pg_temp.role_id('ADMIN')),
  ((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-0000000ac0b2', pg_temp.role_id('KITCHEN')),
  ((select id from _ctx where key = 'C'), '10000000-0000-0000-0000-0000000ac0b1', pg_temp.role_id('KITCHEN'));

-- 5. Asignaciones propias
select pg_temp.act_as((select id from _ctx where key = 'ivanAuth'), (select id from _ctx where key = 'C'));
set local role authenticated;
do $$ begin
  perform dk_set_member_roles((select id from _ctx where key = 'C'), (select id from _ctx where key = 'ivan'),
    array[pg_temp.role_id('ADMIN'), pg_temp.role_id('KITCHEN')], pg_temp.role_id('ADMIN'));
  insert into _t (area, test, expected, got) values ('Asignaciones', 'El SUPER_ADMIN edita sus propios roles', 'ADMIN + COCINA',
    pg_temp.roles_of((select id from _ctx where key = 'C'), (select id from _ctx where key = 'ivan')));
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000ac0b1', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  begin perform dk_set_member_roles((select id from _ctx where key = 'A'), (select id from _ctx where key = 'ivan'), array[pg_temp.role_id('KITCHEN')], pg_temp.role_id('KITCHEN'));
    insert into _t (area, test, expected, got) values ('Asignaciones', 'ADMIN cambia los roles del SUPER_ADMIN', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Asignaciones', 'ADMIN cambia los roles del SUPER_ADMIN', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin delete from dk_kitchen_members where kitchen_id = (select id from _ctx where key = 'A') and user_id = (select id from _ctx where key = 'ivan');
    insert into _t (area, test, expected, got) values ('Asignaciones', 'ADMIN quita al SUPER_ADMIN de la Cuenta', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Asignaciones', 'ADMIN quita al SUPER_ADMIN de la Cuenta', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin perform dk_set_member_roles((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-0000000ac0b1', array[pg_temp.role_id('ADMIN'), pg_temp.role_id('MANAGER')], pg_temp.role_id('ADMIN'));
    insert into _t (area, test, expected, got) values ('Asignaciones', 'ADMIN cambia sus propios roles', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Asignaciones', 'ADMIN cambia sus propios roles', 'bloqueado', 'bloqueado', sqlerrm); end;
  -- Sí administra al resto del equipo
  perform dk_set_member_roles((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-0000000ac0b2', array[pg_temp.role_id('KITCHEN'), pg_temp.role_id('DELIVERY')], pg_temp.role_id('KITCHEN'));
  insert into _t (area, test, expected, got) values ('Asignaciones', 'ADMIN asigna roles a su equipo', 'COCINA + DOMICILIARIO',
    pg_temp.roles_of((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-0000000ac0b2'));

  -- 6. Icono desde la Cuenta (settings.manage)
  update dk_kitchens set icon_key = 'taco' where id = (select id from _ctx where key = 'A');
end $$;
reset role;

select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Icono', 'ADMIN de la Cuenta cambia su icono', 'taco', (select icon_key from dk_kitchens where id = (select id from _ctx where key = 'A')));

select pg_temp.act_as('00000000-0000-0000-0000-0000000ac0b2', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin update dk_kitchens set icon_key = 'flame' where id = (select id from _ctx where key = 'A'); end $$;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000ac0a0', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin update dk_kitchens set icon_key = 'flame' where id = (select id from _ctx where key = 'A'); end $$;
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Icono', 'COCINA u otra organización no cambian el icono', 'taco', (select icon_key from dk_kitchens where id = (select id from _ctx where key = 'A')));

-- Desde la organización (accounts.manage)
select pg_temp.act_as((select id from _ctx where key = 'ivanAuth'), null);
set local role authenticated;
do $$ begin update dk_kitchens set icon_key = 'donut', name = 'Pizzería Norte 2' where id = (select id from _ctx where key = 'C'); end $$;
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Icono', 'SUPER_ADMIN edita nombre e icono desde la organización', 'Pizzería Norte 2 · donut',
  (select name || ' · ' || icon_key from dk_kitchens where id = (select id from _ctx where key = 'C')));

-- 7. Cambio de Cuenta: los permisos son los de cada Cuenta
select pg_temp.act_as('00000000-0000-0000-0000-0000000ac0b1', (select id from _ctx where key = 'C'), pg_temp.role_id('ADMIN')::text);
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Cambio de Cuenta', 'Rol de A pedido con la cabecera de C: se ignora', 'COCINA',
    (select name from dk_roles where id::text = dk_effective_role((select id from _ctx where key = 'C'))));
  insert into _t (area, test, expected, got) values ('Cambio de Cuenta', 'En C no administra el equipo', 'false', dk_can('team.manage')::text);
end $$;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000ac0b1', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Cambio de Cuenta', 'En A sí administra el equipo', 'true', dk_can('team.manage')::text);
end $$;
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
