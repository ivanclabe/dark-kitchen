-- Multi-Cocina — Fase 1: modelo (ADR 0007, secciones 4, 5 y decisiones 2026-09-24).
--
-- Solo agrega estructura; no cambia ningún permiso existente ni lo que ve la
-- app. Las tablas de negocio se asocian a una Cocina en la Fase 2 y la RLS
-- pasa a aislar por Cocina en la Fase 3.
--
--   dk_kitchens              — la Cocina (cuenta/establecimiento = tenant).
--   dk_users.platform_role   — 'SUPERADMIN': único que crea Cocinas y las
--                              administra todas (decisión 3 y 4).
--   dk_permissions           — catálogo módulo × acción.
--   dk_roles                 — roles. Los de sistema (kitchen_id null) son
--                              plantillas globales NO editables que replican
--                              la matriz actual; más adelante una Cocina podrá
--                              tener roles propios (kitchen_id = la Cocina).
--   dk_role_permissions      — qué puede cada rol.
--   dk_kitchen_members       — persona ↔ Cocina con un rol (N:M).
--
-- Cocina inicial: 'dark-kitchen-1' ("Dark Kitchen 1") con todos los
-- usuarios actuales como miembros, cada uno con su rol de hoy.

-- ---------------------------------------------------------------------------
-- Cocinas
-- ---------------------------------------------------------------------------

create table dk_kitchens (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  legal_name text,
  tax_id text,
  phone text,
  address text,
  logo_path text,
  timezone text not null default 'America/Bogota',
  currency text not null default 'COP',
  active boolean not null default true,
  created_by uuid references dk_users(id) default dk_current_profile_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table dk_kitchens is 'Cocina = cuenta/establecimiento (tenant). id: interno (FK, RLS); slug: público para URLs, nunca autoriza.';

create trigger dk_trg_kitchens_updated_at before update on dk_kitchens
  for each row execute function dk_set_updated_at();
create trigger dk_trg_audit_kitchens after insert or update or delete on dk_kitchens
  for each row execute function dk_audit_row();

-- ---------------------------------------------------------------------------
-- Superusuario de plataforma
-- ---------------------------------------------------------------------------

alter table dk_users add column platform_role text check (platform_role in ('SUPERADMIN'));
comment on column dk_users.platform_role is 'SUPERADMIN = crea y administra todas las Cocinas. Solo lo asigna otro superusuario (o una migración).';

create or replace function dk_is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select platform_role = 'SUPERADMIN' from dk_users where auth_user_id = auth.uid() and active),
    false
  );
$$;

-- Un ADMIN de Cocina puede editar perfiles (política dk_users_update), pero
-- nunca otorgarse ni quitar privilegios de plataforma. auth.uid() null =
-- migración / conexión administrativa.
create or replace function dk_guard_platform_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.platform_role is distinct from old.platform_role
     and auth.uid() is not null
     and not dk_is_superadmin() then
    raise exception 'Solo un superusuario puede cambiar privilegios de plataforma';
  end if;
  return new;
end;
$$;

create trigger dk_trg_users_guard_platform_role before update of platform_role on dk_users
  for each row execute function dk_guard_platform_role();

-- ---------------------------------------------------------------------------
-- Permisos y roles
-- ---------------------------------------------------------------------------

create table dk_permissions (
  module text not null,
  action text not null check (action in ('view', 'create', 'edit', 'delete', 'manage')),
  label text not null,
  primary key (module, action)
);

comment on table dk_permissions is 'Catálogo de permisos (módulo × acción). Lo define la app; no se edita desde la UI.';

create table dk_roles (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid references dk_kitchens(id) on delete cascade,
  key text not null check (key ~ '^[A-Z][A-Z0-9_]*$'),
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  constraint dk_roles_key_unique unique nulls not distinct (kitchen_id, key),
  constraint dk_roles_system_is_global check (not is_system or kitchen_id is null)
);

comment on table dk_roles is 'Roles. kitchen_id null + is_system = plantilla global que replica los roles históricos; kitchen_id = rol propio de una Cocina.';

create table dk_role_permissions (
  role_id uuid not null references dk_roles(id) on delete cascade,
  module text not null,
  action text not null,
  primary key (role_id, module, action),
  foreign key (module, action) references dk_permissions (module, action)
);

create trigger dk_trg_audit_roles after insert or update or delete on dk_roles
  for each row execute function dk_audit_row();
create trigger dk_trg_audit_role_permissions after insert or update or delete on dk_role_permissions
  for each row execute function dk_audit_row();

-- ---------------------------------------------------------------------------
-- Membresías
-- ---------------------------------------------------------------------------

create table dk_kitchen_members (
  kitchen_id uuid not null references dk_kitchens(id) on delete cascade,
  user_id uuid not null references dk_users(id) on delete cascade,
  role_id uuid not null references dk_roles(id),
  active boolean not null default true,
  invited_by uuid references dk_users(id) default dk_current_profile_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (kitchen_id, user_id)
);

create index dk_kitchen_members_user_idx on dk_kitchen_members (user_id) where active;

comment on table dk_kitchen_members is 'Persona ↔ Cocina con un rol. Una persona puede pertenecer a varias Cocinas con roles distintos.';

-- El rol debe ser de sistema o de ESA Cocina: nunca un rol propio de otra.
create or replace function dk_guard_member_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from dk_roles r where r.id = new.role_id and (r.kitchen_id is null or r.kitchen_id = new.kitchen_id)
  ) then
    raise exception 'El rol no pertenece a esta Cocina';
  end if;
  return new;
end;
$$;

create trigger dk_trg_members_guard_role before insert or update of role_id, kitchen_id on dk_kitchen_members
  for each row execute function dk_guard_member_role();
create trigger dk_trg_members_updated_at before update on dk_kitchen_members
  for each row execute function dk_set_updated_at();
create trigger dk_trg_audit_members after insert or update or delete on dk_kitchen_members
  for each row execute function dk_audit_row();

-- ---------------------------------------------------------------------------
-- Funciones de autorización por Cocina
-- ---------------------------------------------------------------------------

-- ¿Puede el usuario actual hacer `action` sobre `module` en esa Cocina?
-- El superusuario puede todo en toda Cocina (decisión 4). Falla cerrado:
-- sin perfil, sin membresía activa o con la Cocina inactiva → false.
create or replace function dk_has_kitchen_permission(p_kitchen_id uuid, p_module text, p_action text)
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
        and rp.module = p_module
        and rp.action = p_action
    )
  end;
$$;

create or replace function dk_is_kitchen_member(p_kitchen_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select dk_is_superadmin() or exists (
    select 1 from dk_kitchen_members m
    join dk_users u on u.id = m.user_id and u.active
    where m.kitchen_id = p_kitchen_id and m.active and u.auth_user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS de las tablas nuevas
-- ---------------------------------------------------------------------------

alter table dk_kitchens enable row level security;
alter table dk_permissions enable row level security;
alter table dk_roles enable row level security;
alter table dk_role_permissions enable row level security;
alter table dk_kitchen_members enable row level security;

-- Cocinas: cada quien ve las suyas (el superusuario, todas). Solo el
-- superusuario crea o borra; el Administrador de la Cocina edita sus datos
-- (Configuración → General), pero activar/desactivar es del superusuario.
create policy dk_kitchens_select on dk_kitchens for select to authenticated
  using (dk_is_kitchen_member(id));
create policy dk_kitchens_insert on dk_kitchens for insert to authenticated
  with check (dk_is_superadmin());
create policy dk_kitchens_update on dk_kitchens for update to authenticated
  using (dk_has_kitchen_permission(id, 'settings', 'manage'))
  with check (dk_has_kitchen_permission(id, 'settings', 'manage'));
create policy dk_kitchens_delete on dk_kitchens for delete to authenticated
  using (dk_is_superadmin());

create or replace function dk_guard_kitchen_active()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.active is distinct from old.active and auth.uid() is not null and not dk_is_superadmin() then
    raise exception 'Solo el superusuario puede activar o desactivar una Cocina';
  end if;
  return new;
end;
$$;

create trigger dk_trg_kitchens_guard_active before update of active on dk_kitchens
  for each row execute function dk_guard_kitchen_active();

-- Catálogo de permisos y roles: lectura para el personal; escritura solo superusuario.
create policy dk_permissions_select on dk_permissions for select to authenticated
  using (dk_current_role() is not null or dk_is_superadmin());
create policy dk_roles_select on dk_roles for select to authenticated
  using ((kitchen_id is null and (dk_current_role() is not null or dk_is_superadmin())) or dk_is_kitchen_member(kitchen_id));
create policy dk_roles_write on dk_roles for all to authenticated
  using (dk_is_superadmin() and not is_system)
  with check (dk_is_superadmin() and not is_system);
create policy dk_role_permissions_select on dk_role_permissions for select to authenticated
  using (exists (select 1 from dk_roles r where r.id = role_id));
create policy dk_role_permissions_write on dk_role_permissions for all to authenticated
  using (dk_is_superadmin() and exists (select 1 from dk_roles r where r.id = role_id and not r.is_system))
  with check (dk_is_superadmin() and exists (select 1 from dk_roles r where r.id = role_id and not r.is_system));

-- Membresías: ves las tuyas; quien administra usuarios de la Cocina ve y gestiona las de esa Cocina.
create policy dk_members_select on dk_kitchen_members for select to authenticated
  using (
    user_id = dk_current_profile_id()
    or dk_has_kitchen_permission(kitchen_id, 'members', 'view')
  );
create policy dk_members_write on dk_kitchen_members for all to authenticated
  using (dk_has_kitchen_permission(kitchen_id, 'members', 'manage'))
  with check (dk_has_kitchen_permission(kitchen_id, 'members', 'manage'));

-- ---------------------------------------------------------------------------
-- Catálogo de permisos
-- ---------------------------------------------------------------------------

insert into dk_permissions (module, action, label) values
  ('dashboard', 'view', 'Ver el dashboard'),
  ('operation', 'view', 'Ver el tablero de cocina'),
  ('operation', 'edit', 'Avanzar, retroceder y priorizar la preparación'),
  ('orders', 'view', 'Ver pedidos'),
  ('orders', 'create', 'Crear y confirmar pedidos'),
  ('orders', 'edit', 'Editar pedidos por confirmar'),
  ('orders', 'delete', 'Cancelar pedidos'),
  ('dispatch', 'view', 'Ver despachos'),
  ('dispatch', 'create', 'Despachar pedidos'),
  ('dispatch', 'edit', 'Marcar pedidos como entregados'),
  ('dispatch', 'manage', 'Administrar domiciliarios'),
  ('customers', 'view', 'Ver clientes'),
  ('customers', 'create', 'Crear clientes'),
  ('customers', 'edit', 'Editar clientes'),
  ('receivables', 'view', 'Ver cartera y saldos'),
  ('receivables', 'create', 'Registrar pagos'),
  ('menu_planner', 'view', 'Ver el planificador de menús'),
  ('menu_planner', 'edit', 'Editar el menú'),
  ('menu_planner', 'manage', 'Copiar semanas y planificar a futuro'),
  ('products', 'view', 'Ver platos'),
  ('products', 'create', 'Crear platos'),
  ('products', 'edit', 'Editar platos y precios'),
  ('recipes', 'view', 'Ver recetas y costos'),
  ('recipes', 'create', 'Crear versiones de receta'),
  ('inventory', 'view', 'Ver stock y movimientos'),
  ('inventory', 'create', 'Registrar mermas y ajustes'),
  ('inventory', 'edit', 'Crear y editar insumos'),
  ('suppliers', 'view', 'Ver proveedores'),
  ('suppliers', 'edit', 'Crear y editar proveedores'),
  ('purchases', 'view', 'Ver compras'),
  ('purchases', 'create', 'Crear compras en borrador'),
  ('purchases', 'manage', 'Confirmar compras'),
  ('reports', 'view', 'Ver reportes'),
  ('ai', 'manage', 'Configurar funciones de IA'),
  ('settings', 'view', 'Ver configuración de la Cocina'),
  ('settings', 'manage', 'Editar configuración de la Cocina'),
  ('members', 'view', 'Ver usuarios de la Cocina'),
  ('members', 'manage', 'Administrar usuarios y roles de la Cocina');

-- ---------------------------------------------------------------------------
-- Roles de sistema = matriz actual (dk_role + RLS + RPC), sin cambios
-- ---------------------------------------------------------------------------

insert into dk_roles (key, name, description, is_system) values
  ('ADMIN', 'Administrador', 'Todos los módulos, incluidos usuarios y configuración', true),
  ('MANAGER', 'Gerente', 'Toda la operación, sin administrar usuarios', true),
  ('CASHIER', 'Caja', 'Pedidos, despacho, clientes, cartera y reportes de ventas', true),
  ('KITCHEN', 'Cocina', 'Tablero de cocina, preparación y menú del día', true),
  ('INVENTORY', 'Inventario', 'Abastecimiento, recetas y reportes de inventario', true),
  ('DELIVERY', 'Domiciliario', 'Sus pedidos asignados y marcar entregas', true);

-- Cada permiso con los roles que HOY lo tienen (según RLS/RPC vigentes).
insert into dk_role_permissions (role_id, module, action)
select r.id, g.module, g.action
from (values
  ('dashboard', 'view', array['ADMIN','MANAGER','INVENTORY','CASHIER']),
  ('operation', 'view', array['ADMIN','MANAGER','CASHIER','KITCHEN','DELIVERY']),
  ('operation', 'edit', array['ADMIN','MANAGER','KITCHEN']),
  ('orders', 'view', array['ADMIN','MANAGER','CASHIER','KITCHEN']),
  ('orders', 'create', array['ADMIN','MANAGER','CASHIER']),
  ('orders', 'edit', array['ADMIN','MANAGER','CASHIER']),
  ('orders', 'delete', array['ADMIN','MANAGER','CASHIER','KITCHEN']),
  ('dispatch', 'view', array['ADMIN','MANAGER','CASHIER','DELIVERY']),
  ('dispatch', 'create', array['ADMIN','MANAGER','CASHIER']),
  ('dispatch', 'edit', array['ADMIN','MANAGER','CASHIER','DELIVERY']),
  ('dispatch', 'manage', array['ADMIN','MANAGER']),
  ('customers', 'view', array['ADMIN','MANAGER','CASHIER']),
  ('customers', 'create', array['ADMIN','MANAGER','CASHIER']),
  ('customers', 'edit', array['ADMIN','MANAGER','CASHIER']),
  ('receivables', 'view', array['ADMIN','MANAGER','CASHIER']),
  ('receivables', 'create', array['ADMIN','MANAGER','CASHIER']),
  ('menu_planner', 'view', array['ADMIN','MANAGER','INVENTORY','KITCHEN','CASHIER']),
  -- KITCHEN edita solo el menú de HOY: la restricción de fecha la sigue aplicando la política de la tabla.
  ('menu_planner', 'edit', array['ADMIN','MANAGER','KITCHEN']),
  ('menu_planner', 'manage', array['ADMIN','MANAGER']),
  ('products', 'view', array['ADMIN','MANAGER','INVENTORY','KITCHEN','CASHIER']),
  ('products', 'create', array['ADMIN','MANAGER']),
  ('products', 'edit', array['ADMIN','MANAGER']),
  ('recipes', 'view', array['ADMIN','MANAGER','INVENTORY','KITCHEN']),
  ('recipes', 'create', array['ADMIN','MANAGER']),
  ('inventory', 'view', array['ADMIN','MANAGER','INVENTORY']),
  ('inventory', 'create', array['ADMIN','MANAGER','INVENTORY']),
  ('inventory', 'edit', array['ADMIN','MANAGER','INVENTORY']),
  ('suppliers', 'view', array['ADMIN','MANAGER','INVENTORY']),
  ('suppliers', 'edit', array['ADMIN','MANAGER','INVENTORY']),
  ('purchases', 'view', array['ADMIN','MANAGER','INVENTORY']),
  ('purchases', 'create', array['ADMIN','MANAGER','INVENTORY']),
  ('purchases', 'manage', array['ADMIN','MANAGER','INVENTORY']),
  ('reports', 'view', array['ADMIN','MANAGER','INVENTORY','CASHIER']),
  ('ai', 'manage', array['ADMIN','MANAGER']),
  ('settings', 'view', array['ADMIN','MANAGER','CASHIER','KITCHEN','DELIVERY']),
  ('settings', 'manage', array['ADMIN','MANAGER']),
  ('members', 'view', array['ADMIN']),
  ('members', 'manage', array['ADMIN'])
) as g(module, action, roles)
join dk_roles r on r.is_system and r.key = any (g.roles);

-- ---------------------------------------------------------------------------
-- Cocina inicial y membresías de los usuarios actuales
-- ---------------------------------------------------------------------------

insert into dk_kitchens (slug, name, created_by)
values ('dark-kitchen-1', 'Dark Kitchen 1', (select id from dk_users where role = 'ADMIN' order by created_at limit 1));

insert into dk_kitchen_members (kitchen_id, user_id, role_id, active, invited_by)
select k.id, u.id, r.id, u.active, null
from dk_users u
join dk_roles r on r.is_system and r.key = u.role::text
cross join dk_kitchens k
where k.slug = 'dark-kitchen-1';

-- El dueño actual de la instalación (el primer ADMIN) es el superusuario.
update dk_users set platform_role = 'SUPERADMIN'
where id = (select id from dk_users where role = 'ADMIN' and active order by created_at limit 1);

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------

-- Las Cocinas del usuario actual con su rol y permisos (el superusuario ve
-- todas, con todos los permisos). Base del selector de Cocina (Fase 4).
create or replace function dk_my_kitchens()
returns table (
  kitchen_id uuid,
  slug text,
  name text,
  active boolean,
  role_key text,
  role_name text,
  permissions text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select k.id, k.slug, k.name, k.active, r.key, r.name,
    coalesce(array_agg(rp.module || ':' || rp.action order by rp.module, rp.action) filter (where rp.module is not null), '{}')
  from dk_kitchen_members m
  join dk_users u on u.id = m.user_id and u.active and u.auth_user_id = auth.uid()
  join dk_kitchens k on k.id = m.kitchen_id
  join dk_roles r on r.id = m.role_id
  left join dk_role_permissions rp on rp.role_id = r.id
  where m.active and not dk_is_superadmin()
  group by k.id, r.id
  union all
  select k.id, k.slug, k.name, k.active, 'SUPERADMIN', 'Superusuario',
    (select array_agg(p.module || ':' || p.action order by p.module, p.action) from dk_permissions p)
  from dk_kitchens k
  where dk_is_superadmin()
  order by 3;
$$;

-- Crear una Cocina (solo superusuario, decisión 3). Deja al creador como
-- Administrador. La configuración por Cocina (SLA, IA, horario) se siembra
-- aquí cuando esas tablas tengan kitchen_id (Fase 2).
create or replace function dk_create_kitchen(p_name text, p_slug text, p_timezone text default 'America/Bogota', p_currency text default 'COP')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen_id uuid;
begin
  if not dk_is_superadmin() then
    raise exception 'Solo el superusuario puede crear Cocinas';
  end if;

  insert into dk_kitchens (slug, name, timezone, currency)
  values (lower(btrim(p_slug)), btrim(p_name), p_timezone, p_currency)
  returning id into v_kitchen_id;

  insert into dk_kitchen_members (kitchen_id, user_id, role_id)
  select v_kitchen_id, dk_current_profile_id(), r.id
  from dk_roles r where r.is_system and r.key = 'ADMIN';

  return v_kitchen_id;
end;
$$;

revoke all on function dk_my_kitchens() from public, anon;
revoke all on function dk_create_kitchen(text, text, text, text) from public, anon;
grant execute on function dk_my_kitchens() to authenticated;
grant execute on function dk_create_kitchen(text, text, text, text) to authenticated;
