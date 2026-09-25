-- Pruebas de menús maestros compartidos (ADR 0007, sección 15). Transacción revertida.
--
--   supabase db query --linked -f supabase/tests/master_menus.sql

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid) on commit drop;
grant all on _t, _ctx to authenticated;
grant usage on sequence _t_n_seq to authenticated;

insert into _ctx values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx values ('ivan', (select id from auth.users where email = 'ivanclabe@gmail.com'));
insert into auth.users (id, email, aud, role) values ('00000000-0000-0000-0000-00000000ad01', 'admin.a@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, role, active) values ('11000000-0000-0000-0000-00000000ad01', '00000000-0000-0000-0000-00000000ad01', 'Admin A', 'ADMIN', true);
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
  select (select id from _ctx where key = 'A'), '11000000-0000-0000-0000-00000000ad01', id from dk_roles where is_system and key = 'ADMIN';

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', case when p_kitchen is null then '{}' else json_build_object('x-dk-kitchen-id', p_kitchen)::text end, true);
$$;

-- 1. Superusuario crea el menú, un plato con receta y lo comparte con A y B.
select pg_temp.act_as((select id from _ctx where key = 'ivan'), null);
set local role authenticated;
do $$
declare v_menu uuid; v_product uuid; v_b uuid;
begin
  v_b := dk_create_kitchen('Cocina Prueba B', 'cocina-prueba-b');
  insert into _ctx values ('B', v_b);
  insert into dk_master_menus (name) values ('Menú Burger') returning id into v_menu;
  insert into _ctx values ('menu', v_menu);
  v_product := dk_save_master_product(v_menu, null, 'BURG-M', 'Burger Maestra', 'La de la casa', 'Hamburguesas', 20000, true,
    '[{"ingredient_code": "PAN-M", "ingredient_name": "Pan brioche", "unit_code": "unidad", "quantity": 1},
      {"ingredient_code": "CARNE-01", "ingredient_name": "Carne de res", "unit_code": "g", "quantity": 150}]');
  insert into _ctx values ('mp', v_product);
  insert into _t (area, test, expected, got) values ('Compartir', 'Compartir con A y B', '2',
    dk_assign_master_menu(v_menu, array[(select id from _ctx where key = 'A'), v_b])::text);
end $$;
reset role;

-- Verificación como dueño de la base
do $$
declare v_a uuid := (select id from _ctx where key = 'A'); v_b uuid := (select id from _ctx where key = 'B'); v_mp uuid := (select id from _ctx where key = 'mp');
begin
  insert into _t (area, test, expected, got) values ('Copia', 'A recibe el plato (precio · categoría)', '20000 · Hamburguesas',
    (select p.price::int || ' · ' || c.name from dk_products p left join dk_product_categories c on c.id = p.category_id where p.kitchen_id = v_a and p.master_product_id = v_mp));
  insert into _t (area, test, expected, got) values ('Copia', 'A: receta con 2 insumos', '2',
    (select count(*)::text from dk_recipe_items ri join dk_products p on p.active_recipe_id = ri.recipe_id where p.kitchen_id = v_a and p.master_product_id = v_mp));
  insert into _t (area, test, expected, got) values ('Copia', 'A reutiliza su insumo CARNE-01 (no lo duplica)', '1',
    (select count(*)::text from dk_ingredients where kitchen_id = v_a and code = 'CARNE-01'));
  insert into _t (area, test, expected, got) values ('Copia', 'A crea el insumo que le faltaba (PAN-M)', '1',
    (select count(*)::text from dk_ingredients where kitchen_id = v_a and code = 'PAN-M'));
  insert into _t (area, test, expected, got) values ('Copia', 'B recibe su propia copia con sus propios insumos', '1 plato · 2 insumos',
    (select count(*) from dk_products where kitchen_id = v_b and master_product_id = v_mp)::text || ' plato · ' ||
    (select count(*) from dk_ingredients where kitchen_id = v_b)::text || ' insumos');
end $$;

-- 2. La Cocina A ajusta precio; no puede cambiar nombre ni receta.
select pg_temp.act_as('00000000-0000-0000-0000-00000000ad01', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$
declare v_prod uuid := (select id from dk_products where master_product_id = (select id from _ctx where key = 'mp'));
begin
  update dk_products set price = 22000 where id = v_prod;
  insert into _t (area, test, expected, got) values ('Ajustes', 'A fija su precio propio', '22000 · propio',
    (select price::int || case when price_is_local then ' · propio' else ' · maestro' end from dk_products where id = v_prod));
  begin update dk_products set name = 'Otra' where id = v_prod;
    insert into _t (area, test, expected, got) values ('Ajustes', 'A cambia el nombre', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Ajustes', 'A cambia el nombre', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin perform dk_create_recipe_version(v_prod, jsonb_build_array(jsonb_build_object('ingredient_id', (select id from dk_ingredients where code = 'PAN-M'), 'quantity', 2)));
    insert into _t (area, test, expected, got) values ('Ajustes', 'A cambia la receta', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Ajustes', 'A cambia la receta', 'bloqueado', 'bloqueado', sqlerrm); end;
  insert into _t (area, test, expected, got) values ('Aislamiento', 'A ve menús maestros de la plataforma', '0', (select count(*)::text from dk_master_menus));
  begin perform dk_assign_master_menu((select id from _ctx where key = 'menu'), array[(select id from _ctx where key = 'A')]);
    insert into _t (area, test, expected, got) values ('Aislamiento', 'A comparte un menú maestro', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Aislamiento', 'A comparte un menú maestro', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

-- 3. El superusuario cambia precio y receta: se aplica solo (respetando el precio propio de A).
select pg_temp.act_as((select id from _ctx where key = 'ivan'), null);
set local role authenticated;
do $$ begin
  update dk_master_products set price = 25000 where id = (select id from _ctx where key = 'mp');
  perform dk_save_master_product((select id from _ctx where key = 'menu'), (select id from _ctx where key = 'mp'), 'BURG-M', 'Burger Maestra', 'La de la casa', 'Hamburguesas', 25000, true,
    '[{"ingredient_code": "PAN-M", "ingredient_name": "Pan brioche", "unit_code": "unidad", "quantity": 1},
      {"ingredient_code": "CARNE-01", "ingredient_name": "Carne de res", "unit_code": "g", "quantity": 180}]');
  begin
    perform dk_save_master_product((select id from _ctx where key = 'menu'), null, 'MAL-01', 'Unidad equivocada', null, null, 1000, true,
      '[{"ingredient_code": "CARNE-01", "ingredient_name": "Carne", "unit_code": "kg", "quantity": 1}]');
    insert into _t (area, test, expected, got) values ('Cambios', 'Receta con unidad distinta a la de la Cocina', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Cambios', 'Receta con unidad distinta a la de la Cocina', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

do $$
declare v_a uuid := (select id from _ctx where key = 'A'); v_b uuid := (select id from _ctx where key = 'B'); v_mp uuid := (select id from _ctx where key = 'mp');
begin
  insert into _t (area, test, expected, got) values ('Cambios', 'Precio nuevo: A conserva el suyo, B toma el del maestro', 'A 22000 · B 25000',
    'A ' || (select price::int from dk_products where kitchen_id = v_a and master_product_id = v_mp) || ' · B ' ||
    (select price::int from dk_products where kitchen_id = v_b and master_product_id = v_mp));
  insert into _t (area, test, expected, got) values ('Cambios', 'Receta nueva llega a A (versión 2, 180 g)', 'v2 · 180',
    (select 'v' || r.version || ' · ' || (select ri.quantity::int from dk_recipe_items ri join dk_ingredients i on i.id = ri.ingredient_id where ri.recipe_id = r.id and i.code = 'CARNE-01')
     from dk_products p join dk_recipes r on r.id = p.active_recipe_id where p.kitchen_id = v_a and p.master_product_id = v_mp));
end $$;

-- 4. A vuelve al precio del maestro.
select pg_temp.act_as('00000000-0000-0000-0000-00000000ad01', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  update dk_products set price_is_local = false where master_product_id = (select id from _ctx where key = 'mp');
  insert into _t (area, test, expected, got) values ('Ajustes', 'A vuelve al precio del maestro', '25000 · maestro',
    (select price::int || case when price_is_local then ' · propio' else ' · maestro' end from dk_products where master_product_id = (select id from _ctx where key = 'mp')));
end $$;
reset role;

-- 5. Dejar de compartir con B: su copia queda local y desactivada.
select pg_temp.act_as((select id from _ctx where key = 'ivan'), null);
set local role authenticated;
do $$ begin
  perform dk_unassign_master_menu((select id from _ctx where key = 'menu'), array[(select id from _ctx where key = 'B')]);
end $$;
reset role;
do $$ begin
  insert into _t (area, test, expected, got) values ('Dejar de compartir', 'B: el plato queda local y desactivado', 'local · inactivo',
    (select case when master_product_id is null then 'local' else 'enlazado' end || ' · ' || case when active then 'activo' else 'inactivo' end
     from dk_products where kitchen_id = (select id from _ctx where key = 'B') and name = 'Burger Maestra'));
  insert into _t (area, test, expected, got) values ('Dejar de compartir', 'A sigue enlazado', 'enlazado',
    (select case when master_product_id is null then 'local' else 'enlazado' end from dk_products where kitchen_id = (select id from _ctx where key = 'A') and name = 'Burger Maestra'));
end $$;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
