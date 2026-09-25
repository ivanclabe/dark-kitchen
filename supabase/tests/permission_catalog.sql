-- Pruebas del catálogo de permisos (ADR 0008, Fase B). Transacción revertida.
--
--   python3 supabase/tests/run.py permission_catalog

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid) on commit drop;
grant all on _t, _ctx to authenticated;
grant usage on sequence _t_n_seq to authenticated;

insert into _ctx values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx values ('ivan', (select id from auth.users where email = 'ivanclabe@gmail.com'));
insert into _ctx select 'A_order', o.id from dk_orders o join dk_kitchen_tickets t on t.order_id = o.id
  where o.kitchen_id = (select id from _ctx where key = 'A') and o.status in ('CONFIRMADO', 'EN_PREPARACION', 'LISTO') order by o.created_at limit 1;
insert into _ctx select 'A_purchase', id from dk_purchases where kitchen_id = (select id from _ctx where key = 'A') order by created_at limit 1;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', case when p_kitchen is null then '{}' else json_build_object('x-dk-kitchen-id', p_kitchen)::text end, true);
$$;

-- Personas de prueba en la Cuenta A, cada una con un rol.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000c0001', 'caja@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c0002', 'cocina@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c0003', 'domi@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c0004', 'preparar@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c0005', 'clientes@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c0006', 'compras@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000c0001', 'Caja', true),
  ('10000000-0000-0000-0000-0000000c0002', '00000000-0000-0000-0000-0000000c0002', 'Cocina', true),
  ('10000000-0000-0000-0000-0000000c0003', '00000000-0000-0000-0000-0000000c0003', 'Domiciliario', true),
  ('10000000-0000-0000-0000-0000000c0004', '00000000-0000-0000-0000-0000000c0004', 'Solo preparar', true),
  ('10000000-0000-0000-0000-0000000c0005', '00000000-0000-0000-0000-0000000c0005', 'Solo clientes', true),
  ('10000000-0000-0000-0000-0000000c0006', '00000000-0000-0000-0000-0000000c0006', 'Compras sin facturas', true);
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
select (select id from _ctx where key = 'A'), u, (select id from dk_roles where is_system and key = r)
from (values ('10000000-0000-0000-0000-0000000c0001'::uuid, 'CASHIER'), ('10000000-0000-0000-0000-0000000c0002'::uuid, 'KITCHEN'),
             ('10000000-0000-0000-0000-0000000c0003'::uuid, 'DELIVERY')) v(u, r);

-- Claves que usa la app (src/shared/rbac/permissions.ts). permissions.test.ts verifica
-- que esta lista sea idéntica a la de la app; aquí se compara con la base.
-- app-keys:begin
create temp table _app_keys (key text primary key) on commit drop;
insert into _app_keys values
  ('dashboard.view'),
  ('kitchen.view'),
  ('kitchen.prepare'),
  ('kitchen.prioritize'),
  ('orders.view'),
  ('orders.create'),
  ('orders.edit'),
  ('orders.confirm'),
  ('orders.cancel'),
  ('dispatch.view'),
  ('dispatch.assign'),
  ('dispatch.deliver'),
  ('dispatch.riders'),
  ('customers.view'),
  ('customers.create'),
  ('customers.edit'),
  ('customers.delete'),
  ('receivables.view'),
  ('receivables.collect'),
  ('menus.view'),
  ('menus.edit'),
  ('menus.manage'),
  ('products.view'),
  ('products.create'),
  ('products.edit'),
  ('recipes.view'),
  ('recipes.edit'),
  ('inventory.view'),
  ('inventory.create'),
  ('inventory.edit'),
  ('inventory.delete'),
  ('inventory.adjust'),
  ('purchasing.view'),
  ('purchasing.create'),
  ('purchasing.confirm'),
  ('suppliers.view'),
  ('suppliers.edit'),
  ('invoices.view'),
  ('invoices.upload'),
  ('reports.view'),
  ('reports.profitability'),
  ('ai.manage'),
  ('settings.view'),
  ('settings.manage'),
  ('team.view'),
  ('team.manage'),
  ('audit.view'),
  ('organization.view'),
  ('organization.manage'),
  ('accounts.view'),
  ('accounts.create'),
  ('accounts.manage'),
  ('users.view'),
  ('users.manage'),
  ('roles.manage'),
  ('master_menus.manage'),
  ('features.manage');
-- app-keys:end

-- 1. Catálogo y plantillas (como dueño de la base)
do $$ begin
  insert into _t (area, test, expected, got) values ('Catálogo', 'Permisos: total · Cuenta · organización', '57 · 47 · 10',
    (select count(*) || ' · ' || count(*) filter (where scope = 'account') || ' · ' || count(*) filter (where scope = 'organization') from dk_permissions));
  insert into _t (area, test, expected, got) values ('Catálogo', 'La base y la app tienen las mismas claves (faltan en la app · faltan en la base)', '0 · 0',
    (select count(*) from dk_permissions p where not exists (select 1 from _app_keys a where a.key = p.key))::text || ' · ' ||
    (select count(*) from _app_keys a where not exists (select 1 from dk_permissions p where p.key = a.key))::text);
  insert into _t (area, test, expected, got) values ('Catálogo', 'Claves con formato módulo.acción', '0',
    (select count(*)::text from dk_permissions where key <> module || '.' || action));
  insert into _t (area, test, expected, got) values ('Plantillas', 'ADMIN tiene todos los permisos de Cuenta', '47',
    (select count(*)::text from dk_role_permissions rp join dk_roles r on r.id = rp.role_id where r.is_system and r.key = 'ADMIN'));
  insert into _t (area, test, expected, got) values ('Plantillas', 'Ningún rol tiene permisos de organización', '0',
    (select count(*)::text from dk_role_permissions rp join dk_permissions p on p.key = rp.permission_key where p.scope = 'organization'));
  insert into _t (area, test, expected, got) values ('Plantillas', 'Caja: confirma pedidos · reportes · sin rentabilidad', 'sí · sí · no',
    (select string_agg(case when exists (select 1 from dk_role_permissions rp join dk_roles r on r.id = rp.role_id where r.is_system and r.key = 'CASHIER' and rp.permission_key = k) then 'sí' else 'no' end, ' · ' order by o)
     from unnest(array['orders.confirm', 'reports.view', 'reports.profitability']) with ordinality as x(k, o)));
  insert into _t (area, test, expected, got) values ('Plantillas', 'Gerente: configuración · sin auditoría · sin equipo', 'sí · no · no',
    (select string_agg(case when exists (select 1 from dk_role_permissions rp join dk_roles r on r.id = rp.role_id where r.is_system and r.key = 'MANAGER' and rp.permission_key = k) then 'sí' else 'no' end, ' · ' order by o)
     from unnest(array['settings.manage', 'audit.view', 'team.manage']) with ordinality as x(k, o)));
  insert into _t (area, test, expected, got) values ('Plantillas', 'Cocina: prepara · prioriza · cancela', 'sí · sí · sí',
    (select string_agg(case when exists (select 1 from dk_role_permissions rp join dk_roles r on r.id = rp.role_id where r.is_system and r.key = 'KITCHEN' and rp.permission_key = k) then 'sí' else 'no' end, ' · ' order by o)
     from unnest(array['kitchen.prepare', 'kitchen.prioritize', 'orders.cancel']) with ordinality as x(k, o)));
  insert into _t (area, test, expected, got) values ('Plantillas', 'Inventario: facturas (ver · subir) · crear y borrar insumos', 'sí · sí · sí · sí',
    (select string_agg(case when exists (select 1 from dk_role_permissions rp join dk_roles r on r.id = rp.role_id where r.is_system and r.key = 'INVENTORY' and rp.permission_key = k) then 'sí' else 'no' end, ' · ' order by o)
     from unnest(array['invoices.view', 'invoices.upload', 'inventory.create', 'inventory.delete']) with ordinality as x(k, o)));
end $$;

-- 2. Roles propios para las separaciones (los crea el superusuario en A)
select pg_temp.act_as((select id from _ctx where key = 'ivan'), (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _ctx values ('r_preparar', dk_save_role(null, 'Solo preparar', null, array['kitchen.view', 'kitchen.prepare']));
  insert into _ctx values ('r_clientes', dk_save_role(null, 'Solo clientes', null, array['customers.view']));
  insert into _ctx values ('r_compras', dk_save_role(null, 'Compras sin facturas', null, array['purchasing.view', 'purchasing.create']));
  begin perform dk_save_role(null, 'Con permiso de organización', null, array['users.manage']);
    insert into _t (area, test, expected, got) values ('Roles propios', 'Rol propio con permiso de organización', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Roles propios', 'Rol propio con permiso de organización', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id) values
  ((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-0000000c0004', (select id from _ctx where key = 'r_preparar')),
  ((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-0000000c0005', (select id from _ctx where key = 'r_clientes')),
  ((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-0000000c0006', (select id from _ctx where key = 'r_compras'));

-- 3. Caja
select pg_temp.act_as('00000000-0000-0000-0000-0000000c0001', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Contexto', 'dk_my_kitchens devuelve claves', 'sí',
    (select case when 'orders.confirm' = any(permissions) and not ('reports.profitability' = any(permissions)) then 'sí' else 'no' end from dk_my_kitchens() where slug = 'dark-kitchen-1'));
  begin perform dk_report_sales_by_day(current_date - 30, current_date);
    insert into _t (area, test, expected, got) values ('Reportes (H1)', 'Caja: reporte de ventas', 'permitido', 'permitido');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Reportes (H1)', 'Caja: reporte de ventas', 'permitido', 'bloqueado', sqlerrm); end;
  begin perform dk_report_profitability(current_date - 30, current_date);
    insert into _t (area, test, expected, got) values ('Reportes (H1)', 'Caja: rentabilidad', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Reportes (H1)', 'Caja: rentabilidad', 'bloqueado', 'bloqueado', sqlerrm); end;
  insert into _t (area, test, expected, got) values ('Lecturas (H2)', 'Caja ve platos', '>0', case when (select count(*) from dk_products) > 0 then '>0' else '0' end);
end $$;
reset role;

-- 4. Cocina
select pg_temp.act_as('00000000-0000-0000-0000-0000000c0002', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  begin perform dk_report_sales_by_day(current_date - 30, current_date);
    insert into _t (area, test, expected, got) values ('Reportes (H1)', 'Cocina: reporte de ventas (sin permiso)', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Reportes (H1)', 'Cocina: reporte de ventas (sin permiso)', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin perform dk_dashboard_summary();
    insert into _t (area, test, expected, got) values ('Reportes (H1)', 'Cocina: dashboard (sin permiso)', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Reportes (H1)', 'Cocina: dashboard (sin permiso)', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin perform dk_set_ticket_priority((select id from _ctx where key = 'A_order'), 3);
    insert into _t (area, test, expected, got) values ('Separaciones (H5)', 'Cocina prioriza', 'permitido', 'permitido');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Separaciones (H5)', 'Cocina prioriza', 'permitido', 'bloqueado', sqlerrm); end;
end $$;
reset role;

-- 5. Solo preparar: prepara pero no prioriza
select pg_temp.act_as('00000000-0000-0000-0000-0000000c0004', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  begin perform dk_set_ticket_priority((select id from _ctx where key = 'A_order'), 4);
    insert into _t (area, test, expected, got) values ('Separaciones (H5)', 'Solo preparar: priorizar', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Separaciones (H5)', 'Solo preparar: priorizar', 'bloqueado', 'bloqueado', sqlerrm); end;
  insert into _t (area, test, expected, got) values ('Separaciones (H5)', 'Solo preparar: puede preparar · confirmar pedidos', 'sí · no',
    case when dk_can('kitchen.prepare') then 'sí' else 'no' end || ' · ' || case when dk_can('orders.confirm') then 'sí' else 'no' end);
  insert into _t (area, test, expected, got) values ('Lecturas (H2)', 'Solo preparar ve platos (tablero)', '>0', case when (select count(*) from dk_products) > 0 then '>0' else '0' end);
end $$;
reset role;

-- 6. Solo clientes: no ve platos ni menús
select pg_temp.act_as('00000000-0000-0000-0000-0000000c0005', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Lecturas (H2)', 'Solo clientes: platos · categorías · calendario', '0 · 0 · 0',
    (select count(*) from dk_products)::text || ' · ' || (select count(*) from dk_product_categories)::text || ' · ' || (select count(*) from dk_menu_plan_items)::text);
end $$;
reset role;

-- 7. Domiciliario: ve platos por el tablero
select pg_temp.act_as('00000000-0000-0000-0000-0000000c0003', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Lecturas (H2)', 'Domiciliario ve platos', '>0', case when (select count(*) from dk_products) > 0 then '>0' else '0' end);
end $$;
reset role;

-- 8. Compras sin facturas (H3)
select pg_temp.act_as('00000000-0000-0000-0000-0000000c0006', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Facturas (H3)', 'Ve compras', '>0', case when (select count(*) from dk_purchases) > 0 then '>0' else '0' end);
  begin
    insert into dk_attachments (entity_type, entity_id, file_path, file_name)
    values ('purchase', (select id from _ctx where key = 'A_purchase'), 'kitchens/' || (select id from _ctx where key = 'A') || '/x.pdf', 'x.pdf');
    insert into _t (area, test, expected, got) values ('Facturas (H3)', 'Adjuntar factura sin invoices.upload', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Facturas (H3)', 'Adjuntar factura sin invoices.upload', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

select area, test, expected, got, detail,
  case
    when expected = '>0' then case when got = '>0' then 'PASS' else 'FAIL' end
    when got = expected then 'PASS' else 'FAIL'
  end as result
from _t order by n;
rollback;
