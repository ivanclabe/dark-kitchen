-- ADR 0008, Fase B: catálogo central de permisos.
--
-- Qué cambia:
--   1. dk_permissions pasa a ser un catálogo con clave 'módulo.acción'
--      (p. ej. 'orders.confirm'), ámbito ('account' | 'organization'),
--      nombre y descripción. 47 permisos de Cuenta + 10 de organización
--      (estos últimos se usan desde la Fase C). Nadie crea permisos desde la
--      interfaz: solo esta migración (y las futuras).
--   2. dk_role_permissions guarda (role_id, permission_key).
--   3. dk_can(clave) y dk_has_kitchen_permission(cuenta, clave) reemplazan a
--      las versiones (módulo, acción). Todas las políticas y funciones se
--      reescriben con la tabla de equivalencias (_perm_map), y después se
--      aplican a mano las separaciones de la auditoría (H5):
--        orders.create    → crear | orders.confirm (confirmar, reserva inventario)
--        operation.edit   → kitchen.prepare | kitchen.prioritize
--        customers.edit   → editar | customers.delete
--        inventory.edit   → inventory.create | inventory.edit | inventory.delete
--        purchases.*      → purchasing.* | invoices.* (archivos de facturas, H3)
--        settings.manage  → settings.manage | audit.view
--   4. Reportes y dashboard exigen su permiso también en la base (H1).
--   5. Platos y menús: lectura solo con un permiso relacionado (H2).
--   6. Las plantillas del sistema conservan exactamente sus alcances (cada
--      permiso viejo → todas sus claves nuevas), con dos ajustes aprobados en
--      la ADR (4.4): Caja sin rentabilidad y Gerente sin auditoría. La
--      migración lo verifica antes de borrar las tablas viejas.

-- ---------------------------------------------------------------------------
-- 1. Catálogo
-- ---------------------------------------------------------------------------

create table dk_permissions_new (
  key text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  module text not null,
  action text not null,
  scope text not null check (scope in ('account', 'organization')),
  label text not null,
  description text,
  sort_order int not null,
  unique (module, action)
);

insert into dk_permissions_new (key, module, action, scope, label, description, sort_order) values
  -- Cuenta
  ('dashboard.view', 'dashboard', 'view', 'account', 'Ver el dashboard', 'Resumen del negocio: ventas, pedidos, inventario y alertas', 10),
  ('kitchen.view', 'kitchen', 'view', 'account', 'Ver el tablero de cocina', 'Pedidos en preparación y comandas', 20),
  ('kitchen.prepare', 'kitchen', 'prepare', 'account', 'Preparar pedidos', 'Iniciar, marcar listo y retroceder la preparación', 21),
  ('kitchen.prioritize', 'kitchen', 'prioritize', 'account', 'Priorizar pedidos', 'Marcar o quitar prioridad en el tablero', 22),
  ('orders.view', 'orders', 'view', 'account', 'Ver pedidos', 'Pedidos, detalle e historial', 30),
  ('orders.create', 'orders', 'create', 'account', 'Crear pedidos', 'Crear pedidos en borrador (por confirmar)', 31),
  ('orders.edit', 'orders', 'edit', 'account', 'Editar pedidos', 'Cambiar pedidos que aún no se confirman', 32),
  ('orders.confirm', 'orders', 'confirm', 'account', 'Confirmar pedidos', 'Confirmar pedidos: reserva el inventario y los manda a cocina', 33),
  ('orders.cancel', 'orders', 'cancel', 'account', 'Cancelar pedidos', 'Cancelar pedidos (libera o devuelve el inventario)', 34),
  ('dispatch.view', 'dispatch', 'view', 'account', 'Ver despachos', 'Pedidos listos y en ruta', 40),
  ('dispatch.assign', 'dispatch', 'assign', 'account', 'Despachar pedidos', 'Asignar domiciliario y sacar a ruta', 41),
  ('dispatch.deliver', 'dispatch', 'deliver', 'account', 'Marcar entregado', 'Marcar pedidos como entregados (el Domiciliario, solo los suyos)', 42),
  ('dispatch.riders', 'dispatch', 'riders', 'account', 'Administrar domiciliarios', 'Crear, editar y desactivar domiciliarios', 43),
  ('customers.view', 'customers', 'view', 'account', 'Ver clientes', 'Clientes y su historial', 50),
  ('customers.create', 'customers', 'create', 'account', 'Crear clientes', null, 51),
  ('customers.edit', 'customers', 'edit', 'account', 'Editar clientes', null, 52),
  ('customers.delete', 'customers', 'delete', 'account', 'Eliminar clientes', null, 53),
  ('receivables.view', 'receivables', 'view', 'account', 'Ver cartera', 'Saldos, pagos y cartera vencida', 60),
  ('receivables.collect', 'receivables', 'collect', 'account', 'Registrar pagos', 'Registrar pagos de clientes', 61),
  ('menus.view', 'menus', 'view', 'account', 'Ver el planificador de menús', 'Calendario y menú del día', 70),
  ('menus.edit', 'menus', 'edit', 'account', 'Editar el menú del día', 'Programar platos por día: disponibilidad, horarios, precio promocional', 71),
  ('menus.manage', 'menus', 'manage', 'account', 'Planificar menús', 'Copiar semanas o días y administrar menús', 72),
  ('products.view', 'products', 'view', 'account', 'Ver platos', 'Platos, precios y categorías', 80),
  ('products.create', 'products', 'create', 'account', 'Crear platos', 'Crear platos y categorías', 81),
  ('products.edit', 'products', 'edit', 'account', 'Editar platos', 'Editar platos, precios e imagen; activarlos o desactivarlos', 82),
  ('recipes.view', 'recipes', 'view', 'account', 'Ver recetas y costos', 'Recetas, costos y márgenes', 90),
  ('recipes.edit', 'recipes', 'edit', 'account', 'Editar recetas', 'Crear versiones de receta', 91),
  ('inventory.view', 'inventory', 'view', 'account', 'Ver inventario', 'Stock, movimientos y reservas', 100),
  ('inventory.create', 'inventory', 'create', 'account', 'Crear insumos', null, 101),
  ('inventory.edit', 'inventory', 'edit', 'account', 'Editar insumos', 'Insumos, categorías y unidades de compra', 102),
  ('inventory.delete', 'inventory', 'delete', 'account', 'Eliminar insumos', null, 103),
  ('inventory.adjust', 'inventory', 'adjust', 'account', 'Registrar mermas y ajustes', 'Mermas y ajustes de stock', 104),
  ('purchasing.view', 'purchasing', 'view', 'account', 'Ver compras', 'Compras y sugerencias de reposición', 110),
  ('purchasing.create', 'purchasing', 'create', 'account', 'Crear compras', 'Crear y editar compras en borrador', 111),
  ('purchasing.confirm', 'purchasing', 'confirm', 'account', 'Confirmar compras', 'Confirmar compras: entran al inventario y al costo', 112),
  ('suppliers.view', 'suppliers', 'view', 'account', 'Ver proveedores', 'Proveedores y sus insumos', 120),
  ('suppliers.edit', 'suppliers', 'edit', 'account', 'Editar proveedores', 'Crear, editar y eliminar proveedores', 121),
  ('invoices.view', 'invoices', 'view', 'account', 'Ver facturas', 'Facturas de compra y sus archivos', 130),
  ('invoices.upload', 'invoices', 'upload', 'account', 'Subir facturas', 'Subir y eliminar archivos de facturas', 131),
  ('reports.view', 'reports', 'view', 'account', 'Ver reportes', 'Ventas, platos, compras y mermas', 140),
  ('reports.profitability', 'reports', 'profitability', 'account', 'Ver rentabilidad', 'Rentabilidad y costos', 141),
  ('ai.manage', 'ai', 'manage', 'account', 'Configurar IA', 'Activar funciones de IA y ajustar umbrales', 150),
  ('settings.view', 'settings', 'view', 'account', 'Ver configuración', 'Horario, alertas y datos de la Cuenta', 160),
  ('settings.manage', 'settings', 'manage', 'account', 'Editar configuración', 'Datos de la Cuenta, horario y alertas', 161),
  ('team.view', 'team', 'view', 'account', 'Ver el equipo de la Cuenta', 'Quién trabaja en la Cuenta y con qué roles', 170),
  ('team.manage', 'team', 'manage', 'account', 'Administrar el equipo de la Cuenta', 'Asignar usuarios y roles en esta Cuenta', 171),
  ('audit.view', 'audit', 'view', 'account', 'Ver auditoría', 'Registro de cambios de la Cuenta', 180),
  -- Organización (solo Super Admin; se usan desde la Fase C)
  ('organization.view', 'organization', 'view', 'organization', 'Ver la organización', null, 500),
  ('organization.manage', 'organization', 'manage', 'organization', 'Editar la organización', 'Nombre, dirección, sector, categoría y datos legales', 501),
  ('organization.transfer', 'organization', 'transfer', 'organization', 'Transferir la propiedad', 'Solo el dueño', 502),
  ('accounts.view', 'accounts', 'view', 'organization', 'Ver Cuentas', 'Todas las Cuentas de la organización', 510),
  ('accounts.create', 'accounts', 'create', 'organization', 'Crear Cuentas', null, 511),
  ('accounts.manage', 'accounts', 'manage', 'organization', 'Administrar Cuentas', 'Editar, activar y desactivar Cuentas', 512),
  ('users.view', 'users', 'view', 'organization', 'Ver usuarios', 'Usuarios de la organización, sus roles y permisos efectivos', 520),
  ('users.manage', 'users', 'manage', 'organization', 'Administrar usuarios', 'Crear, editar, activar y asignar usuarios a Cuentas y roles', 521),
  ('roles.manage', 'roles', 'manage', 'organization', 'Administrar roles', 'Crear, editar, duplicar y eliminar roles propios', 530),
  ('master_menus.manage', 'master_menus', 'manage', 'organization', 'Menús maestros', 'Menús de la organización compartidos entre Cuentas', 540);

comment on table dk_permissions_new is 'Catálogo central de permisos (ADR 0008). Lo define la aplicación por migración; no se edita desde la interfaz.';

-- Equivalencias viejo (módulo, acción) → claves nuevas. "primary" es la que
-- reemplaza a la llamada vieja en políticas y funciones; las demás salen de
-- las separaciones y se aplican a mano más abajo.
create temp table _perm_map (old_module text, old_action text, new_key text, is_primary boolean) on commit drop;
insert into _perm_map values
  ('ai', 'manage', 'ai.manage', true),
  ('customers', 'create', 'customers.create', true),
  ('customers', 'edit', 'customers.edit', true),
  ('customers', 'edit', 'customers.delete', false),
  ('customers', 'view', 'customers.view', true),
  ('dashboard', 'view', 'dashboard.view', true),
  ('dispatch', 'create', 'dispatch.assign', true),
  ('dispatch', 'edit', 'dispatch.deliver', true),
  ('dispatch', 'manage', 'dispatch.riders', true),
  ('dispatch', 'view', 'dispatch.view', true),
  ('inventory', 'create', 'inventory.adjust', true),
  ('inventory', 'edit', 'inventory.edit', true),
  ('inventory', 'edit', 'inventory.create', false),
  ('inventory', 'edit', 'inventory.delete', false),
  ('inventory', 'view', 'inventory.view', true),
  ('members', 'manage', 'team.manage', true),
  ('members', 'view', 'team.view', true),
  ('menu_planner', 'edit', 'menus.edit', true),
  ('menu_planner', 'manage', 'menus.manage', true),
  ('menu_planner', 'view', 'menus.view', true),
  ('operation', 'edit', 'kitchen.prepare', true),
  ('operation', 'edit', 'kitchen.prioritize', false),
  ('operation', 'view', 'kitchen.view', true),
  ('orders', 'create', 'orders.create', true),
  ('orders', 'create', 'orders.confirm', false),
  ('orders', 'delete', 'orders.cancel', true),
  ('orders', 'edit', 'orders.edit', true),
  ('orders', 'view', 'orders.view', true),
  ('products', 'create', 'products.create', true),
  ('products', 'edit', 'products.edit', true),
  ('products', 'view', 'products.view', true),
  ('purchases', 'create', 'purchasing.create', true),
  ('purchases', 'create', 'invoices.upload', false),
  ('purchases', 'manage', 'purchasing.confirm', true),
  ('purchases', 'view', 'purchasing.view', true),
  ('purchases', 'view', 'invoices.view', false),
  ('receivables', 'create', 'receivables.collect', true),
  ('receivables', 'view', 'receivables.view', true),
  ('recipes', 'create', 'recipes.edit', true),
  ('recipes', 'view', 'recipes.view', true),
  ('reports', 'view', 'reports.view', true),
  ('reports', 'view', 'reports.profitability', false),
  ('settings', 'manage', 'settings.manage', true),
  ('settings', 'manage', 'audit.view', false),
  ('settings', 'view', 'settings.view', true),
  ('suppliers', 'edit', 'suppliers.edit', true),
  ('suppliers', 'view', 'suppliers.view', true);

do $$
declare v_missing text;
begin
  select string_agg(p.module || ':' || p.action, ', ') into v_missing
  from dk_permissions p
  where not exists (select 1 from _perm_map m where m.old_module = p.module and m.old_action = p.action and m.is_primary);
  if v_missing is not null then
    raise exception 'Fase B: permisos viejos sin equivalencia: %', v_missing;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Asignaciones de roles
-- ---------------------------------------------------------------------------

create table dk_role_permissions_new (
  role_id uuid not null references dk_roles(id) on delete cascade,
  permission_key text not null references dk_permissions_new(key) on update cascade,
  primary key (role_id, permission_key)
);

insert into dk_role_permissions_new (role_id, permission_key)
select distinct rp.role_id, m.new_key
from dk_role_permissions rp
join _perm_map m on m.old_module = rp.module and m.old_action = rp.action;

-- Ajustes aprobados en la ADR 0008 (4.4): Caja sin rentabilidad; Gerente sin auditoría.
delete from dk_role_permissions_new rp using dk_roles r
where r.id = rp.role_id and r.is_system
  and ((r.key = 'CASHIER' and rp.permission_key = 'reports.profitability')
    or (r.key = 'MANAGER' and rp.permission_key = 'audit.view'));

-- Equivalencia: cada permiso viejo de cada rol quedó con TODAS sus claves
-- nuevas (salvo los dos ajustes), y no apareció ninguna clave sin origen.
do $$
declare v_diff text;
begin
  select string_agg(distinct r.key || ' ' || x.k, ', ') into v_diff
  from (
    select rp.role_id, m.new_key as k
    from dk_role_permissions rp join _perm_map m on m.old_module = rp.module and m.old_action = rp.action
    except
    select role_id, permission_key from dk_role_permissions_new
  ) x join dk_roles r on r.id = x.role_id
  where not (r.is_system and ((r.key = 'CASHIER' and x.k = 'reports.profitability') or (r.key = 'MANAGER' and x.k = 'audit.view')));
  if v_diff is not null then raise exception 'Fase B: permisos perdidos al migrar: %', v_diff; end if;

  select string_agg(r.key || ' ' || x.permission_key, ', ') into v_diff
  from (
    select role_id, permission_key from dk_role_permissions_new
    except
    select rp.role_id, m.new_key from dk_role_permissions rp join _perm_map m on m.old_module = rp.module and m.old_action = rp.action
  ) x join dk_roles r on r.id = x.role_id;
  if v_diff is not null then raise exception 'Fase B: permisos nuevos sin origen: %', v_diff; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Cambio de tablas (las viejas quedan como *_legacy hasta el final)
-- ---------------------------------------------------------------------------

alter table dk_role_permissions rename to dk_role_permissions_legacy;
alter table dk_permissions rename to dk_permissions_legacy;
alter table dk_role_permissions_legacy rename constraint dk_role_permissions_pkey to dk_role_permissions_legacy_pkey;
alter table dk_permissions_legacy rename constraint dk_permissions_pkey to dk_permissions_legacy_pkey;
alter table dk_permissions_new rename to dk_permissions;
alter table dk_role_permissions_new rename to dk_role_permissions;
alter table dk_permissions rename constraint dk_permissions_new_pkey to dk_permissions_pkey;
alter table dk_permissions rename constraint dk_permissions_new_module_action_key to dk_permissions_module_action_key;
alter table dk_role_permissions rename constraint dk_role_permissions_new_pkey to dk_role_permissions_pkey;
alter table dk_role_permissions rename constraint dk_role_permissions_new_role_id_fkey to dk_role_permissions_role_id_fkey_v2;
alter table dk_role_permissions rename constraint dk_role_permissions_new_permission_key_fkey to dk_role_permissions_permission_key_fkey;

alter table dk_permissions enable row level security;
alter table dk_role_permissions enable row level security;

create index dk_role_permissions_key_idx on dk_role_permissions (permission_key);

-- ---------------------------------------------------------------------------
-- 4. Funciones de autorización por clave
-- ---------------------------------------------------------------------------

create or replace function dk_has_kitchen_permission(p_kitchen_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_kitchen_id is null then false
    when dk_is_superadmin() then exists (select 1 from dk_kitchens where id = p_kitchen_id)
    else exists (
      select 1
      from dk_kitchen_members m
      join dk_users u on u.id = m.user_id and u.active
      join dk_kitchens k on k.id = m.kitchen_id and k.active
      join dk_role_permissions rp on rp.role_id = m.role_id
      where m.kitchen_id = p_kitchen_id
        and m.active
        and u.auth_user_id = auth.uid()
        and rp.permission_key = p_permission
    )
  end;
$$;

create or replace function dk_can(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select dk_has_kitchen_permission(dk_current_kitchen_id(), p_permission);
$$;

comment on function dk_can(text) is 'Permiso (clave del catálogo, p. ej. ''orders.view'') del usuario en la Cuenta activa.';

-- Para funciones que deben exigir un permiso y fallar con un mensaje claro.
create or replace function dk_require(p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(dk_can(p_permission), false) then
    raise exception 'No autorizado: falta el permiso %', p_permission using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Reescritura de políticas y funciones al catálogo
-- ---------------------------------------------------------------------------

create or replace function pg_temp.dk_map_permission_calls(p_src text)
returns text
language plpgsql
as $$
declare
  v text := p_src;
  r record;
begin
  if v is null then return null; end if;
  for r in select * from _perm_map where is_primary loop
    v := regexp_replace(v,
      'dk_can\(\s*''' || r.old_module || '''(::text)?\s*,\s*''' || r.old_action || '''(::text)?\s*\)',
      'dk_can(''' || r.new_key || ''')', 'g');
    v := regexp_replace(v,
      'dk_has_kitchen_permission\(\s*([a-z_][a-z0-9_.]*)\s*,\s*''' || r.old_module || '''(::text)?\s*,\s*''' || r.old_action || '''(::text)?\s*\)',
      'dk_has_kitchen_permission(\1, ''' || r.new_key || ''')', 'g');
  end loop;
  return v;
end;
$$;

-- 5a. Políticas (public y storage).
do $$
declare
  p record;
  v_qual text;
  v_check text;
  v_sql text;
begin
  for p in
    select schemaname, tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
      and coalesce(qual, '') || coalesce(with_check, '') ~ '(dk_can|dk_has_kitchen_permission)\('
  loop
    v_qual := pg_temp.dk_map_permission_calls(p.qual);
    v_check := pg_temp.dk_map_permission_calls(p.with_check);
    if v_qual is not distinct from p.qual and v_check is not distinct from p.with_check then continue; end if;
    v_sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if v_qual is not null then v_sql := v_sql || ' using (' || v_qual || ')'; end if;
    if v_check is not null then v_sql := v_sql || ' with check (' || v_check || ')'; end if;
    execute v_sql;
  end loop;
end $$;

-- 5b. Funciones que llaman dk_can / dk_has_kitchen_permission con (módulo, acción).
do $$
declare
  f record;
  v_def text;
  v_new text;
begin
  for f in
    select p.oid, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc ~ '(dk_can|dk_has_kitchen_permission)\([^)]*''[a-z_]+''\s*,\s*''[a-z_]+''\s*\)'
  loop
    v_def := pg_get_functiondef(f.oid);
    v_new := pg_temp.dk_map_permission_calls(v_def);
    if v_new <> v_def then execute v_new; end if;
  end loop;
end $$;

-- 5b'. Vistas que usan dk_can (conservan sus opciones, p. ej. security_invoker).
do $$
declare
  v record;
  v_new text;
begin
  for v in
    select c.oid, c.relname, pg_get_viewdef(c.oid, true) as def, array_to_string(c.reloptions, ', ') as opts
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v' and pg_get_viewdef(c.oid, true) ~ '(dk_can|dk_has_kitchen_permission)\('
  loop
    v_new := pg_temp.dk_map_permission_calls(v.def);
    if v_new = v.def then continue; end if;
    execute format('create or replace view %I %s as %s', v.relname,
      case when coalesce(v.opts, '') <> '' then 'with (' || v.opts || ')' else '' end, v_new);
  end loop;
end $$;

-- 5c. Separaciones (H5) en funciones.
do $$
declare
  v_def text;
begin
  -- Confirmar un pedido (reserva inventario) ≠ crearlo.
  v_def := pg_get_functiondef('public.dk_confirm_order(uuid)'::regprocedure);
  if v_def !~ 'dk_can\(''orders\.create''\)' then raise exception 'Fase B: dk_confirm_order no tiene la forma esperada'; end if;
  execute replace(v_def, 'dk_can(''orders.create'')', 'dk_can(''orders.confirm'')');

  -- Priorizar ≠ preparar.
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'dk_set_ticket_priority';
  if v_def !~ 'dk_can\(''kitchen\.prepare''\)' then raise exception 'Fase B: dk_set_ticket_priority no tiene la forma esperada'; end if;
  execute replace(v_def, 'dk_can(''kitchen.prepare'')', 'dk_can(''kitchen.prioritize'')');
end $$;

-- 5d. Separaciones (H3, H5) en políticas.
alter policy dk_customers_delete_customers_edit on dk_customers
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('customers.delete')));
alter policy dk_customers_delete_customers_edit on dk_customers rename to dk_customers_delete;

alter policy dk_ingredients_insert_inventory_edit on dk_ingredients
  with check (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('inventory.create')));
alter policy dk_ingredients_insert_inventory_edit on dk_ingredients rename to dk_ingredients_insert;
alter policy dk_ingredients_delete_inventory_edit on dk_ingredients
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('inventory.delete')));
alter policy dk_ingredients_delete_inventory_edit on dk_ingredients rename to dk_ingredients_delete;

-- Archivos de facturas (dk_attachments y Storage): permiso propio "Facturas".
do $$
declare
  p record;
  v_qual text;
  v_check text;
  v_sql text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check from pg_policies
    where (schemaname = 'public' and tablename = 'dk_attachments')
       or (schemaname = 'storage' and tablename = 'objects' and policyname like 'dk_attachments_storage_%')
  loop
    -- Las políticas ya reescritas se leen como dk_can('purchasing.create'::text).
    v_qual := regexp_replace(regexp_replace(p.qual, 'dk_can\(''purchasing\.create''(::text)?\)', 'dk_can(''invoices.upload'')', 'g'), 'dk_can\(''purchasing\.view''(::text)?\)', 'dk_can(''invoices.view'')', 'g');
    v_check := regexp_replace(regexp_replace(p.with_check, 'dk_can\(''purchasing\.create''(::text)?\)', 'dk_can(''invoices.upload'')', 'g'), 'dk_can\(''purchasing\.view''(::text)?\)', 'dk_can(''invoices.view'')', 'g');
    v_sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if v_qual is not null then v_sql := v_sql || ' using (' || v_qual || ')'; end if;
    if v_check is not null then v_sql := v_sql || ' with check (' || v_check || ')'; end if;
    execute v_sql;
  end loop;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where ((schemaname = 'public' and tablename = 'dk_attachments') or (schemaname = 'storage' and policyname like 'dk_attachments_storage_%'))
             and coalesce(qual, '') || coalesce(with_check, '') ~ 'purchasing\.') then
    raise exception 'Fase B: los archivos de facturas aún usan permisos de compras';
  end if;
end $$;
alter policy dk_attachments_all_purchases_create on dk_attachments rename to dk_attachments_write;
alter policy dk_attachments_select_purchases_view on dk_attachments rename to dk_attachments_select;

-- Auditoría: permiso propio.
alter policy dk_audit_log_select on dk_audit_log
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('audit.view')));

-- H2: platos y menús solo con un permiso relacionado (antes: cualquier miembro).
do $$
declare
  t text;
  v_perm constant text := '((select dk_can(''products.view'')) or (select dk_can(''menus.view'')) or (select dk_can(''orders.view''))'
    || ' or (select dk_can(''kitchen.view'')) or (select dk_can(''dispatch.view'')) or (select dk_can(''recipes.view'')) or (select dk_can(''reports.view'')))';
begin
  foreach t in array array['dk_products', 'dk_product_categories', 'dk_menus', 'dk_menu_items', 'dk_menu_plan_items', 'dk_weekly_menu_items', 'dk_daily_availability'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_select') then
      raise exception 'Fase B: falta la política %_select', t;
    end if;
    execute format('alter policy %I on %I using (kitchen_id = (select dk_current_kitchen_id()) and %s)', t || '_select', t, v_perm);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Funciones que leían (módulo, acción) directamente
-- ---------------------------------------------------------------------------

create or replace function dk_my_kitchens()
returns table (kitchen_id uuid, slug text, name text, active boolean, role_key text, role_name text, permissions text[])
language sql
stable
security definer
set search_path = public
as $$
  select k.id, k.slug, k.name, k.active, r.key, r.name,
    coalesce(array_agg(rp.permission_key order by rp.permission_key) filter (where rp.permission_key is not null), '{}')
  from dk_kitchen_members m
  join dk_users u on u.id = m.user_id and u.active and u.auth_user_id = auth.uid()
  join dk_kitchens k on k.id = m.kitchen_id
  join dk_roles r on r.id = m.role_id
  left join dk_role_permissions rp on rp.role_id = r.id
  where m.active and not dk_is_superadmin()
  group by k.id, r.id
  union all
  select k.id, k.slug, k.name, k.active, 'SUPERADMIN', 'Superusuario',
    (select array_agg(p.key order by p.key) from dk_permissions p where p.scope = 'account')
  from dk_kitchens k
  where dk_is_superadmin()
  order by 3;
$$;

create or replace function dk_save_role(p_role_id uuid, p_name text, p_description text, p_permissions text[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_role_id uuid := p_role_id;
  v_key text;
  v_invalid text;
begin
  if v_kitchen is null then raise exception 'No hay una Cuenta activa'; end if;
  if not dk_can('team.manage') then raise exception 'No autorizado para administrar roles'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'El nombre del rol es obligatorio'; end if;

  -- Solo permisos de Cuenta del catálogo (los de organización son del Super Admin).
  select string_agg(x, ', ') into v_invalid
  from unnest(coalesce(p_permissions, '{}')) x
  where not exists (select 1 from dk_permissions p where p.key = x and p.scope = 'account');
  if v_invalid is not null then raise exception 'Permisos desconocidos: %', v_invalid; end if;

  if v_role_id is null then
    v_key := upper(regexp_replace(translate(btrim(p_name), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'), '[^A-Za-z0-9]+', '_', 'g'));
    v_key := 'C_' || trim(both '_' from v_key);
    insert into dk_roles (kitchen_id, key, name, description, is_system)
    values (v_kitchen, v_key, btrim(p_name), nullif(btrim(p_description), ''), false)
    returning id into v_role_id;
  else
    if not exists (select 1 from dk_roles where id = v_role_id and kitchen_id = v_kitchen and not is_system) then
      raise exception 'Solo se pueden editar los roles propios de esta Cuenta';
    end if;
    update dk_roles set name = btrim(p_name), description = nullif(btrim(p_description), '') where id = v_role_id;
  end if;

  delete from dk_role_permissions where role_id = v_role_id;
  insert into dk_role_permissions (role_id, permission_key)
  select distinct v_role_id, x from unnest(coalesce(p_permissions, '{}')) x;

  -- No se puede dejar sin administrador a la Cuenta quitándole el permiso al rol.
  if not exists (
    select 1 from dk_kitchen_members m
    join dk_role_permissions rp on rp.role_id = m.role_id and rp.permission_key = 'team.manage'
    where m.kitchen_id = v_kitchen and m.active
  ) and exists (select 1 from dk_kitchen_members where kitchen_id = v_kitchen) and not dk_is_superadmin() then
    raise exception 'La Cuenta debe conservar al menos un miembro activo que administre el equipo';
  end if;

  return v_role_id;
exception when unique_violation then
  raise exception 'Ya existe un rol con ese nombre en esta Cuenta';
end;
$$;

do $$
declare
  v_def text;
  f text;
begin
  foreach f in array array['dk_guard_last_admin', 'dk_admin_kitchens'] loop
    select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = f;
    if position('rp.module = ''members'' and rp.action = ''manage''' in v_def) = 0 then
      raise exception 'Fase B: % no tiene la forma esperada', f;
    end if;
    execute replace(v_def, 'rp.module = ''members'' and rp.action = ''manage''', 'rp.permission_key = ''team.manage''');
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. H1: reportes y dashboard exigen su permiso en la base
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  v_def text;
begin
  for r in
    select p.oid, p.proname,
      case p.proname
        when 'dk_report_profitability' then 'reports.profitability'
        when 'dk_dashboard_summary' then 'dashboard.view'
        else 'reports.view'
      end as perm
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname ~ '^dk_(report_[a-z_]+|dashboard_summary)$'
  loop
    v_def := pg_get_functiondef(r.oid);
    if position('LANGUAGE sql' in v_def) = 0 or position('AS $function$' in v_def) = 0 then
      raise exception 'Fase B: % no tiene la forma esperada', r.proname;
    end if;
    execute replace(v_def, 'AS $function$', 'AS $function$' || E'\n  select dk_require(''' || r.perm || ''');');
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Verificación y limpieza
-- ---------------------------------------------------------------------------

-- Las versiones viejas: si alguna política aún las usara, estos DROP fallan.
drop function dk_can(text, text);
drop function dk_has_kitchen_permission(uuid, text, text);

do $$
declare v_left text;
begin
  -- Ninguna llamada vieja (módulo, acción) ni lectura de rp.module / rp.action.
  select string_agg(p.proname, ', ') into v_left
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (p.prosrc ~ '(dk_can|dk_has_kitchen_permission)\([^)]*''[a-z_]+''\s*,\s*''[a-z_]+''\s*\)'
      or p.prosrc ~ 'rp\.(module|action)\M');
  if v_left is not null then raise exception 'Fase B: funciones con permisos viejos: %', v_left; end if;

  select string_agg(tablename || '.' || policyname, ', ') into v_left
  from pg_policies
  where schemaname in ('public', 'storage')
    and coalesce(qual, '') || coalesce(with_check, '') ~ '(dk_can|dk_has_kitchen_permission)\([^)]*''[a-z_]+''(::text)?\s*,\s*''[a-z_]+''(::text)?\s*\)';
  if v_left is not null then raise exception 'Fase B: políticas con permisos viejos: %', v_left; end if;

  -- Toda clave usada en la base existe en el catálogo.
  select string_agg(distinct k, ', ') into v_left
  from (
    select (regexp_matches(p.prosrc, '(?:dk_can|dk_require|dk_has_kitchen_permission)\((?:[a-z_][a-z0-9_.]*\s*,\s*)?''([a-z_]+\.[a-z_]+)''', 'g'))[1] as k
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
    union all
    select (regexp_matches(coalesce(qual, '') || ' ' || coalesce(with_check, ''), '(?:dk_can|dk_has_kitchen_permission)\((?:[a-z_][a-z0-9_.]*\s*,\s*)?''([a-z_]+\.[a-z_]+)''', 'g'))[1]
    from pg_policies where schemaname in ('public', 'storage')
  ) used
  where not exists (select 1 from dk_permissions p where p.key = used.k);
  if v_left is not null then raise exception 'Fase B: claves que no existen en el catálogo: %', v_left; end if;
end $$;

drop table dk_role_permissions_legacy;
drop table dk_permissions_legacy;

-- Políticas y auditoría de las tablas nuevas (mismas reglas que tenían).
create policy dk_permissions_select on dk_permissions for select to authenticated
  using ((select dk_is_staff()));

create policy dk_role_permissions_select on dk_role_permissions for select to authenticated
  using (exists (select 1 from dk_roles r where r.id = dk_role_permissions.role_id));

create policy dk_role_permissions_write on dk_role_permissions for all to authenticated
  using (exists (
    select 1 from dk_roles r
    where r.id = dk_role_permissions.role_id and not r.is_system
      and (dk_is_superadmin() or (r.kitchen_id = dk_current_kitchen_id() and dk_can('team.manage')))
  ))
  with check (exists (
    select 1 from dk_roles r
    where r.id = dk_role_permissions.role_id and not r.is_system
      and (dk_is_superadmin() or (r.kitchen_id = dk_current_kitchen_id() and dk_can('team.manage')))
  ));

create trigger dk_trg_audit_role_permissions
  after insert or update or delete on dk_role_permissions
  for each row execute function dk_audit_row();

revoke all on dk_permissions, dk_role_permissions from anon;
grant select on dk_permissions to authenticated;
grant select, insert, update, delete on dk_role_permissions to authenticated;

revoke execute on function dk_can(text), dk_has_kitchen_permission(uuid, text), dk_require(text) from public, anon;
grant execute on function dk_can(text), dk_has_kitchen_permission(uuid, text), dk_require(text) to authenticated;
