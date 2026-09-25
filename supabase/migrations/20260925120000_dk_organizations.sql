-- ADR 0008, Fase C: Organizaciones, Super Admin, varios roles por Cuenta y
-- rol activo.
--
-- Modelo (ver la ADR, secciones 2–7):
--   dk_organizations ──< dk_kitchens (= Cuentas)
--   dk_organization_members (usuario × organización: Super Admin o Miembro)
--   dk_kitchen_members (usuario × Cuenta, con rol predeterminado)
--   dk_member_roles (usuario × Cuenta × rol: varios roles por Cuenta)
--   dk_roles: plantillas del sistema (sin organización) + roles propios de la organización
--
-- Acceso a una Cuenta (dk_effective_role):
--   · administrador de la plataforma → total (aunque la Cuenta o la organización estén desactivadas)
--   · Super Admin activo de la organización → total ('ALL'), o uno de sus roles asignados si lo pide
--   · Miembro activo de la organización con membresía activa en la Cuenta → su rol activo
--   · rol activo = encabezado x-dk-role-id validado contra sus roles asignados; si no, el predeterminado
-- Todas las políticas de las 39 tablas operativas siguen igual: solo cambian
-- las funciones auxiliares que usan.

-- ---------------------------------------------------------------------------
-- 1. Organizaciones
-- ---------------------------------------------------------------------------

create table dk_organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  address text,
  city text,
  country text not null default 'CO',
  sector text check (sector in ('dark_kitchen', 'restaurant', 'fast_food', 'cafe', 'bakery', 'bar', 'catering', 'food_truck', 'other')),
  category text check (category in ('burgers', 'pizza', 'chicken', 'asian', 'mexican', 'traditional', 'grill', 'healthy', 'vegetarian',
                                    'seafood', 'desserts', 'coffee', 'breakfast', 'international', 'other')),
  legal_name text,
  tax_id text,
  phone text,
  currency text not null default 'COP',
  default_timezone text not null default 'America/Bogota',
  -- El dueño: exactamente uno por organización, y una organización propia por persona (ADR D2).
  owner_user_id uuid not null unique references dk_users(id),
  active boolean not null default true,
  -- null = sin tope de Cuentas. Solo la plataforma lo fija (p. ej. ante abuso).
  max_accounts integer check (max_accounts > 0),
  created_by uuid references dk_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table dk_organizations is 'Organización: el negocio o propietario. Agrupa Cuentas (dk_kitchens) y usuarios (ADR 0008).';

create trigger dk_trg_organizations_updated_at before update on dk_organizations
  for each row execute function dk_set_updated_at();

alter table dk_organizations enable row level security;

-- Pertenencia a la organización.
create table dk_organization_members (
  organization_id uuid not null references dk_organizations(id) on delete cascade,
  user_id uuid not null references dk_users(id) on delete cascade,
  is_super_admin boolean not null default false,
  status text not null default 'active' check (status in ('pending', 'active', 'disabled')),
  created_by uuid references dk_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index dk_organization_members_user_idx on dk_organization_members (user_id) where status = 'active';

comment on table dk_organization_members is 'Usuarios de la organización. is_super_admin = acceso total a todas sus Cuentas. status pending = creado, aún sin activar.';

create trigger dk_trg_org_members_updated_at before update on dk_organization_members
  for each row execute function dk_set_updated_at();

alter table dk_organization_members enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Organización inicial y dk_kitchens.organization_id
-- ---------------------------------------------------------------------------

alter table dk_kitchens add column organization_id uuid references dk_organizations(id);

do $$
declare
  v_owner uuid;
  v_org uuid;
begin
  if not exists (select 1 from dk_kitchens) then
    return;  -- instalación vacía: la primera organización se crea al registrarse
  end if;
  select id into v_owner from dk_users where platform_role = 'SUPERADMIN' and active order by created_at limit 1;
  if v_owner is null then
    select m.user_id into v_owner
    from dk_kitchen_members m join dk_role_permissions rp on rp.role_id = m.role_id and rp.permission_key = 'team.manage'
    where m.active order by m.created_at limit 1;
  end if;
  if v_owner is null then
    raise exception 'Fase C: no hay a quién asignar como dueño de la organización inicial';
  end if;

  insert into dk_organizations (slug, name, owner_user_id, created_by, currency, default_timezone)
  select 'dark-kitchen', 'Dark Kitchen', v_owner, v_owner, k.currency, k.timezone
  from dk_kitchens k order by k.created_at limit 1
  returning id into v_org;

  update dk_kitchens set organization_id = v_org;
end $$;

alter table dk_kitchens alter column organization_id set not null;
create index dk_kitchens_organization_idx on dk_kitchens (organization_id);

comment on column dk_kitchens.organization_id is 'Organización dueña de la Cuenta. No cambia (ADR 0008).';

-- Membresías iniciales: el dueño es Super Admin; cada miembro de una Cuenta es Miembro de su organización.
insert into dk_organization_members (organization_id, user_id, is_super_admin, status)
select id, owner_user_id, true, 'active' from dk_organizations;

insert into dk_organization_members (organization_id, user_id, is_super_admin, status)
select distinct k.organization_id, m.user_id, false, 'active'
from dk_kitchen_members m join dk_kitchens k on k.id = m.kitchen_id
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Varios roles por Cuenta
-- ---------------------------------------------------------------------------

alter table dk_kitchen_members rename column role_id to default_role_id;
alter table dk_kitchen_members rename constraint dk_kitchen_members_role_id_fkey to dk_kitchen_members_default_role_id_fkey;
comment on column dk_kitchen_members.default_role_id is 'Rol con el que entra a la Cuenta si no eligió otro. Siempre está entre sus roles asignados (dk_member_roles).';

create table dk_member_roles (
  kitchen_id uuid not null,
  user_id uuid not null,
  role_id uuid not null references dk_roles(id),
  assigned_by uuid references dk_users(id),
  assigned_at timestamptz not null default now(),
  primary key (kitchen_id, user_id, role_id),
  foreign key (kitchen_id, user_id) references dk_kitchen_members (kitchen_id, user_id) on delete cascade
);

create index dk_member_roles_role_idx on dk_member_roles (role_id);

comment on table dk_member_roles is 'Roles asignados a un usuario en una Cuenta (varios). El rol activo se elige entre estos (ADR 0008, 3.4).';

insert into dk_member_roles (kitchen_id, user_id, role_id, assigned_by, assigned_at)
select kitchen_id, user_id, default_role_id, invited_by, created_at from dk_kitchen_members;

alter table dk_member_roles enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Roles propios: de la organización (antes, de cada Cocina)
-- ---------------------------------------------------------------------------

drop policy dk_roles_select on dk_roles;
drop policy dk_roles_write on dk_roles;
drop policy dk_role_permissions_write on dk_role_permissions;

alter table dk_roles add column organization_id uuid references dk_organizations(id) on delete cascade;
update dk_roles r set organization_id = k.organization_id from dk_kitchens k where k.id = r.kitchen_id;
alter table dk_roles drop constraint dk_roles_system_is_global;
alter table dk_roles drop constraint dk_roles_key_unique;
alter table dk_roles drop column kitchen_id;
alter table dk_roles add constraint dk_roles_system_is_global check (not is_system or organization_id is null);
alter table dk_roles add constraint dk_roles_custom_has_organization check (is_system or organization_id is not null);
alter table dk_roles add constraint dk_roles_key_unique unique nulls not distinct (organization_id, key);
create index dk_roles_organization_idx on dk_roles (organization_id);

comment on column dk_roles.organization_id is 'null = plantilla del sistema (igual en toda la plataforma); si no, rol propio de la organización, usable en todas sus Cuentas.';

-- ---------------------------------------------------------------------------
-- 5. Acceso efectivo y permisos
-- ---------------------------------------------------------------------------

create or replace function dk_request_header(p_name text)
returns text
language plpgsql
stable
as $$
begin
  return nullif(current_setting('request.headers', true), '')::json ->> p_name;
exception when others then
  return null;
end;
$$;

-- Rol con el que el usuario actual trabaja en una Cuenta:
--   'ALL'  → acceso total (administrador de la plataforma o Super Admin sin otro rol elegido)
--   <uuid> → id del rol activo
--   null   → sin acceso
create or replace function dk_effective_role(p_kitchen_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_platform boolean;
  v_org uuid;
  v_kitchen_active boolean;
  v_org_active boolean;
  v_super boolean;
  v_member boolean;
  v_default uuid;
  v_header text;
begin
  if p_kitchen_id is null or auth.uid() is null then return null; end if;
  select id into v_user from dk_users where auth_user_id = auth.uid() and active;
  if v_user is null then return null; end if;
  v_platform := dk_is_superadmin();

  select k.organization_id, k.active, o.active into v_org, v_kitchen_active, v_org_active
  from dk_kitchens k join dk_organizations o on o.id = k.organization_id
  where k.id = p_kitchen_id;
  if v_org is null then return null; end if;
  if not v_platform and not (v_kitchen_active and v_org_active) then return null; end if;

  select om.is_super_admin into v_super
  from dk_organization_members om
  where om.organization_id = v_org and om.user_id = v_user and om.status = 'active';
  v_member := found;
  if not v_platform and not v_member then return null; end if;
  v_super := v_platform or coalesce(v_super, false);

  select m.default_role_id into v_default
  from dk_kitchen_members m
  where m.kitchen_id = p_kitchen_id and m.user_id = v_user and m.active;

  -- Rol activo pedido: solo vale para la Cuenta del encabezado y si está asignado.
  if dk_request_header('x-dk-kitchen-id') = p_kitchen_id::text then
    v_header := lower(dk_request_header('x-dk-role-id'));
    if v_header = 'super-admin' and v_super then
      return 'ALL';
    end if;
    if v_header ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and v_default is not null
       and exists (select 1 from dk_member_roles mr where mr.kitchen_id = p_kitchen_id and mr.user_id = v_user and mr.role_id = v_header::uuid) then
      return v_header;
    end if;
  end if;

  if v_super then return 'ALL'; end if;
  return v_default::text;
end;
$$;

comment on function dk_effective_role is 'Rol activo del usuario en una Cuenta: ''ALL'' (acceso total), id de rol o null (sin acceso). ADR 0008, 7.1.';

create or replace function dk_has_kitchen_permission(p_kitchen_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when x.r is null then false
    when x.r = 'ALL' then exists (select 1 from dk_permissions p where p.key = p_permission and p.scope = 'account')
    else exists (select 1 from dk_role_permissions rp where rp.role_id::text = x.r and rp.permission_key = p_permission)
  end
  from (select dk_effective_role(p_kitchen_id) as r) x;
$$;

create or replace function dk_current_kitchen_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_header text := dk_request_header('x-dk-kitchen-id');
begin
  -- Sin encabezado (o inválido) no hay Cuenta activa: la RLS devuelve cero filas.
  if v_header is null or v_header !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  if dk_effective_role(v_header::uuid) is null then
    return null;
  end if;
  return v_header::uuid;
end;
$$;

create or replace function dk_is_kitchen_member(p_kitchen_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select dk_effective_role(p_kitchen_id) is not null;
$$;

create or replace function dk_active_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select dk_effective_role(dk_current_kitchen_id());
$$;

comment on function dk_active_role is 'Rol activo en la Cuenta activa: ''ALL'', id de rol o null.';

-- Pertenece (activo) a alguna organización activa, o es de la plataforma.
create or replace function dk_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select dk_is_superadmin() or exists (
    select 1 from dk_organization_members om
    join dk_users u on u.id = om.user_id and u.active
    join dk_organizations o on o.id = om.organization_id and o.active
    where om.status = 'active' and u.auth_user_id = auth.uid()
  );
$$;

create or replace function dk_is_org_super_admin(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select dk_is_superadmin() or exists (
    select 1 from dk_organization_members om
    join dk_users u on u.id = om.user_id and u.active
    join dk_organizations o on o.id = om.organization_id and o.active
    where om.organization_id = p_organization_id and om.status = 'active' and om.is_super_admin and u.auth_user_id = auth.uid()
  );
$$;

-- Permisos de organización: solo el Super Admin (y la plataforma). Ver la
-- organización: cualquier miembro activo. Transferir la propiedad: el dueño.
create or replace function dk_has_org_permission(p_organization_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_organization_id is null then false
    when not exists (select 1 from dk_permissions p where p.key = p_permission and p.scope = 'organization') then false
    when dk_is_superadmin() then exists (select 1 from dk_organizations where id = p_organization_id)
    when p_permission = 'organization.view' then exists (
      select 1 from dk_organization_members om
      join dk_users u on u.id = om.user_id and u.active
      join dk_organizations o on o.id = om.organization_id and o.active
      where om.organization_id = p_organization_id and om.status = 'active' and u.auth_user_id = auth.uid())
    when p_permission = 'organization.transfer' then exists (
      select 1 from dk_organizations o join dk_users u on u.id = o.owner_user_id and u.active
      where o.id = p_organization_id and o.active and u.auth_user_id = auth.uid())
    else dk_is_org_super_admin(p_organization_id)
  end;
$$;

comment on function dk_has_org_permission is 'Permiso de organización (catálogo, scope organization) del usuario actual. ADR 0008, 4.2.';

create or replace function dk_can_see_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select dk_is_superadmin()
    or p_user_id = dk_current_profile_id()
    or exists (
      select 1 from dk_organization_members om
      where om.user_id = p_user_id and dk_has_org_permission(om.organization_id, 'users.view'))
    or exists (
      select 1 from dk_kitchen_members m
      where m.user_id = p_user_id and dk_has_kitchen_permission(m.kitchen_id, 'team.view'));
$$;

-- Organización por defecto del usuario: la suya propia o, si no, la única donde es Super Admin.
create or replace function dk_default_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select o.id from dk_organizations o join dk_users u on u.id = o.owner_user_id where u.auth_user_id = auth.uid()),
    (select min(om.organization_id::text)::uuid from dk_organization_members om join dk_users u on u.id = om.user_id
      where u.auth_user_id = auth.uid() and om.status = 'active' and om.is_super_admin
      having count(*) = 1)
  );
$$;

-- ---------------------------------------------------------------------------
-- 6. Guardas
-- ---------------------------------------------------------------------------

-- El dueño siempre es Super Admin activo de su organización.
create or replace function dk_guard_org_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from dk_organizations o where o.id = old.organization_id and o.owner_user_id = old.user_id)
     and (tg_op = 'DELETE' or not new.is_super_admin or new.status <> 'active') then
    raise exception 'El dueño de la organización siempre es Super Admin activo; transfiere la propiedad antes';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger dk_trg_org_members_guard_owner before update or delete on dk_organization_members
  for each row execute function dk_guard_org_owner_membership();

-- Al crear la organización (o transferirla), el dueño queda como Super Admin activo.
create or replace function dk_sync_org_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into dk_organization_members (organization_id, user_id, is_super_admin, status, created_by)
  values (new.id, new.owner_user_id, true, 'active', new.owner_user_id)
  on conflict (organization_id, user_id) do update set is_super_admin = true, status = 'active';
  return null;
end;
$$;

create trigger dk_trg_organizations_owner after insert or update of owner_user_id on dk_organizations
  for each row execute function dk_sync_org_owner_membership();

-- Cambios delicados de la organización: dueño (solo por transferencia), activa (dueño o plataforma), tope (plataforma).
create or replace function dk_guard_organization()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null or dk_is_superadmin() then
    return new;
  end if;
  if new.owner_user_id is distinct from old.owner_user_id and coalesce(current_setting('dk.org_transfer', true), '') <> 'on' then
    raise exception 'La propiedad se cambia con "Transferir la propiedad"';
  end if;
  if new.active is distinct from old.active and not dk_has_org_permission(old.id, 'organization.transfer') then
    raise exception 'Solo el dueño puede activar o desactivar la organización';
  end if;
  if new.max_accounts is distinct from old.max_accounts then
    raise exception 'El tope de Cuentas lo fija la plataforma';
  end if;
  return new;
end;
$$;

create trigger dk_trg_organizations_guard before update on dk_organizations
  for each row execute function dk_guard_organization();

-- La Cuenta no cambia de organización; activarla o desactivarla: plataforma o accounts.manage.
create or replace function dk_guard_kitchen_active()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.organization_id is distinct from old.organization_id and auth.uid() is not null then
    raise exception 'Una Cuenta no cambia de organización';
  end if;
  if new.active is distinct from old.active and auth.uid() is not null
     and not dk_has_org_permission(old.organization_id, 'accounts.manage') then
    raise exception 'Solo un Super Admin puede activar o desactivar una Cuenta';
  end if;
  return new;
end;
$$;

-- Membresía en una Cuenta: implica pertenecer a su organización; el rol
-- predeterminado debe ser del sistema o de esa organización y queda asignado.
drop trigger dk_trg_members_guard_role on dk_kitchen_members;
drop function dk_guard_member_role();
drop trigger dk_trg_members_guard_last_admin on dk_kitchen_members;
drop function dk_guard_last_admin();

create or replace function dk_guard_kitchen_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from dk_kitchens where id = coalesce(new.kitchen_id, old.kitchen_id);

  if tg_op in ('UPDATE', 'DELETE') and auth.uid() is not null and not dk_is_superadmin()
     and coalesce(current_setting('dk.assignment_bypass', true), '') <> 'on'
     and coalesce(new.user_id, old.user_id) = dk_current_profile_id()
     and (tg_op = 'DELETE' or new.active is distinct from old.active or new.default_role_id is distinct from old.default_role_id) then
    raise exception 'No puedes cambiar tu propio acceso; pídeselo a otro administrador';
  end if;

  if tg_op = 'DELETE' then return old; end if;

  if not exists (select 1 from dk_roles r where r.id = new.default_role_id and (r.organization_id is null or r.organization_id = v_org)) then
    raise exception 'El rol no pertenece a esta organización';
  end if;

  insert into dk_organization_members (organization_id, user_id, is_super_admin, status, created_by)
  values (v_org, new.user_id, false, 'active', dk_current_profile_id())
  on conflict (organization_id, user_id) do nothing;
  return new;
end;
$$;

create trigger dk_trg_members_guard before insert or update or delete on dk_kitchen_members
  for each row execute function dk_guard_kitchen_member();

create or replace function dk_sync_member_default_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo si es nuevo: así las reglas de asignación se evalúan únicamente sobre roles que de verdad se agregan.
  if not exists (select 1 from dk_member_roles where kitchen_id = new.kitchen_id and user_id = new.user_id and role_id = new.default_role_id) then
    insert into dk_member_roles (kitchen_id, user_id, role_id, assigned_by)
    values (new.kitchen_id, new.user_id, new.default_role_id, dk_current_profile_id());
  end if;
  return null;
end;
$$;

create trigger dk_trg_members_default_role after insert or update of default_role_id on dk_kitchen_members
  for each row execute function dk_sync_member_default_role();

-- Asignar un rol en una Cuenta (reglas contra el escalamiento, ADR 7.4).
create or replace function dk_guard_member_role_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_missing text;
begin
  select organization_id into v_org from dk_kitchens where id = coalesce(new.kitchen_id, old.kitchen_id);

  if tg_op = 'DELETE' then
    if exists (select 1 from dk_kitchen_members m where m.kitchen_id = old.kitchen_id and m.user_id = old.user_id and m.default_role_id = old.role_id) then
      raise exception 'No se puede quitar el rol predeterminado; elige otro predeterminado antes';
    end if;
  else
    if not exists (select 1 from dk_roles r where r.id = new.role_id and (r.organization_id is null or r.organization_id = v_org)) then
      raise exception 'El rol no pertenece a esta organización';
    end if;
  end if;

  if auth.uid() is null or dk_is_org_super_admin(v_org) or coalesce(current_setting('dk.assignment_bypass', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  if coalesce(new.user_id, old.user_id) = dk_current_profile_id() then
    raise exception 'No puedes cambiar tus propios roles; pídeselo a otro administrador';
  end if;
  if not dk_has_kitchen_permission(coalesce(new.kitchen_id, old.kitchen_id), 'team.manage') then
    raise exception 'No autorizado para asignar roles en esta Cuenta';
  end if;
  if tg_op = 'INSERT' then
    select string_agg(rp.permission_key, ', ') into v_missing
    from dk_role_permissions rp
    where rp.role_id = new.role_id and not dk_has_kitchen_permission(new.kitchen_id, rp.permission_key);
    if v_missing is not null then
      raise exception 'No puedes asignar un rol con permisos que tú no tienes (%)', v_missing;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger dk_trg_member_roles_guard before insert or delete on dk_member_roles
  for each row execute function dk_guard_member_role_assignment();

create trigger dk_trg_audit_member_roles after insert or update or delete on dk_member_roles
  for each row execute function dk_audit_row();
create trigger dk_trg_audit_organizations after insert or update or delete on dk_organizations
  for each row execute function dk_audit_row();
create trigger dk_trg_audit_org_members after insert or update or delete on dk_organization_members
  for each row execute function dk_audit_row();

-- Auditoría: registra la organización de cada cambio.
alter table dk_audit_log add column organization_id uuid;
create index dk_audit_log_organization_idx on dk_audit_log (organization_id, created_at desc);

create or replace function dk_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_key text;
  v_kitchen uuid;
begin
  select string_agg(v_row ->> a.attname, '|' order by array_position(i.indkey::int2[], a.attnum))
  into v_key
  from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
  where i.indrelid = tg_relid and i.indisprimary;

  v_kitchen := case
    when tg_table_name = 'dk_kitchens' then (v_row ->> 'id')::uuid
    when v_row ? 'kitchen_id' then (v_row ->> 'kitchen_id')::uuid
  end;

  insert into dk_audit_log (table_name, record_id, record_key, kitchen_id, organization_id, action, old_data, new_data, changed_by)
  values (
    tg_table_name,
    case when v_row ? 'id' then (v_row ->> 'id')::uuid end,
    coalesce(v_key, v_row ->> 'id'),
    v_kitchen,
    case
      when tg_table_name = 'dk_organizations' then (v_row ->> 'id')::uuid
      when v_row ? 'organization_id' then (v_row ->> 'organization_id')::uuid
      when v_kitchen is not null then (select organization_id from dk_kitchens where id = v_kitchen)
    end,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else null end,
    dk_current_profile_id()
  );
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Políticas
-- ---------------------------------------------------------------------------

create policy dk_organizations_select on dk_organizations for select to authenticated
  using ((select dk_has_org_permission(id, 'organization.view')));
create policy dk_organizations_update on dk_organizations for update to authenticated
  using ((select dk_has_org_permission(id, 'organization.manage')))
  with check ((select dk_has_org_permission(id, 'organization.manage')));

create policy dk_org_members_select on dk_organization_members for select to authenticated
  using (user_id = (select dk_current_profile_id()) or (select dk_has_org_permission(organization_id, 'users.view')));

create policy dk_member_roles_select on dk_member_roles for select to authenticated
  using (
    user_id = (select dk_current_profile_id())
    or dk_has_kitchen_permission(kitchen_id, 'team.view')
    or dk_has_org_permission((select k.organization_id from dk_kitchens k where k.id = kitchen_id), 'users.view')
  );

-- Cuentas: las de acceso efectivo, y todas las de la organización para quien administra Cuentas.
alter policy dk_kitchens_select on dk_kitchens
  using (dk_is_kitchen_member(id) or dk_has_org_permission(organization_id, 'accounts.view'));
alter policy dk_kitchens_update on dk_kitchens
  using (dk_has_kitchen_permission(id, 'settings.manage') or dk_has_org_permission(organization_id, 'accounts.manage'))
  with check (dk_has_kitchen_permission(id, 'settings.manage') or dk_has_org_permission(organization_id, 'accounts.manage'));

-- Miembros de una Cuenta: también los ve quien administra usuarios de la organización.
alter policy dk_members_select on dk_kitchen_members
  using (
    user_id = dk_current_profile_id()
    or dk_has_kitchen_permission(kitchen_id, 'team.view')
    or dk_has_org_permission((select k.organization_id from dk_kitchens k where k.id = kitchen_id), 'users.view')
  );
alter policy dk_members_write on dk_kitchen_members
  using (
    dk_has_kitchen_permission(kitchen_id, 'team.manage')
    or dk_has_org_permission((select k.organization_id from dk_kitchens k where k.id = kitchen_id), 'users.manage')
  )
  with check (
    dk_has_kitchen_permission(kitchen_id, 'team.manage')
    or dk_has_org_permission((select k.organization_id from dk_kitchens k where k.id = kitchen_id), 'users.manage')
  );

-- Roles: plantillas para todo el personal; propios, para su organización. Escribir: roles.manage.
create policy dk_roles_select on dk_roles for select to authenticated
  using ((organization_id is null and (select dk_is_staff())) or dk_has_org_permission(organization_id, 'organization.view'));
create policy dk_roles_write on dk_roles for all to authenticated
  using (not is_system and dk_has_org_permission(organization_id, 'roles.manage'))
  with check (not is_system and dk_has_org_permission(organization_id, 'roles.manage'));
create policy dk_role_permissions_write on dk_role_permissions for all to authenticated
  using (exists (select 1 from dk_roles r where r.id = dk_role_permissions.role_id and not r.is_system and dk_has_org_permission(r.organization_id, 'roles.manage')))
  with check (exists (select 1 from dk_roles r where r.id = dk_role_permissions.role_id and not r.is_system and dk_has_org_permission(r.organization_id, 'roles.manage')));

-- ---------------------------------------------------------------------------
-- 8. Menús maestros: de la organización
-- ---------------------------------------------------------------------------

alter table dk_master_menus add column organization_id uuid references dk_organizations(id) on delete cascade;
update dk_master_menus set organization_id = (select id from dk_organizations order by created_at limit 1) where organization_id is null;
alter table dk_master_menus alter column organization_id set not null;
alter table dk_master_menus alter column organization_id set default dk_default_organization_id();
alter table dk_master_menus drop constraint dk_master_menus_name_key;
alter table dk_master_menus add constraint dk_master_menus_name_key unique (organization_id, name);

alter policy dk_master_menus_superadmin on dk_master_menus
  using (dk_has_org_permission(organization_id, 'master_menus.manage'))
  with check (dk_has_org_permission(organization_id, 'master_menus.manage'));
alter policy dk_master_menus_superadmin on dk_master_menus rename to dk_master_menus_manage;
alter policy dk_master_products_superadmin on dk_master_products
  using (exists (select 1 from dk_master_menus mm where mm.id = master_menu_id and dk_has_org_permission(mm.organization_id, 'master_menus.manage')))
  with check (exists (select 1 from dk_master_menus mm where mm.id = master_menu_id and dk_has_org_permission(mm.organization_id, 'master_menus.manage')));
alter policy dk_master_products_superadmin on dk_master_products rename to dk_master_products_manage;
alter policy dk_master_recipe_items_superadmin on dk_master_recipe_items
  using (exists (select 1 from dk_master_products mp join dk_master_menus mm on mm.id = mp.master_menu_id
                 where mp.id = master_product_id and dk_has_org_permission(mm.organization_id, 'master_menus.manage')))
  with check (exists (select 1 from dk_master_products mp join dk_master_menus mm on mm.id = mp.master_menu_id
                 where mp.id = master_product_id and dk_has_org_permission(mm.organization_id, 'master_menus.manage')));
alter policy dk_master_recipe_items_superadmin on dk_master_recipe_items rename to dk_master_recipe_items_manage;
alter policy dk_master_menu_kitchens_select on dk_master_menu_kitchens
  using (dk_is_kitchen_member(kitchen_id)
    or exists (select 1 from dk_master_menus mm where mm.id = master_menu_id and dk_has_org_permission(mm.organization_id, 'master_menus.manage')));

create or replace function dk_guard_master_menu_kitchen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select organization_id from dk_master_menus where id = new.master_menu_id)
     is distinct from (select organization_id from dk_kitchens where id = new.kitchen_id) then
    raise exception 'Un menú maestro solo se comparte con Cuentas de su misma organización';
  end if;
  return new;
end;
$$;

create trigger dk_trg_master_menu_kitchens_guard before insert or update on dk_master_menu_kitchens
  for each row execute function dk_guard_master_menu_kitchen();

create or replace function dk_require_master_menu_manager(p_menu_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not dk_has_org_permission((select organization_id from dk_master_menus where id = p_menu_id), 'master_menus.manage') then
    raise exception 'Solo un Super Admin de la organización administra sus menús maestros';
  end if;
end;
$$;

do $$
declare
  f record;
  v_def text;
  v_new text;
begin
  for f in
    select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('dk_assign_master_menu', 'dk_unassign_master_menu', 'dk_delete_master_menu', 'dk_save_master_product')
  loop
    v_def := pg_get_functiondef(f.oid);
    v_new := regexp_replace(v_def,
      'if not dk_is_superadmin\(\) then raise exception ''[^'']*''; end if;',
      'perform dk_require_master_menu_manager(p_menu_id);');
    if v_new = v_def then raise exception 'Fase C: % no tiene la forma esperada', f.proname; end if;
    execute v_new;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Funciones de Cuentas, equipo, roles e invitaciones
-- ---------------------------------------------------------------------------

drop function dk_create_kitchen(text, text, text, text);
create or replace function dk_create_kitchen(
  p_name text,
  p_slug text,
  p_timezone text default null,
  p_currency text default null,
  p_organization_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := coalesce(p_organization_id, dk_default_organization_id());
  v_org_row dk_organizations;
  v_kitchen_id uuid;
begin
  if v_org is null then raise exception 'Indica la organización de la nueva Cuenta'; end if;
  if not dk_has_org_permission(v_org, 'accounts.create') then
    raise exception 'No autorizado para crear Cuentas en esta organización';
  end if;
  select * into v_org_row from dk_organizations where id = v_org;
  if v_org_row.max_accounts is not null and (select count(*) from dk_kitchens where organization_id = v_org) >= v_org_row.max_accounts then
    raise exception 'La organización llegó a su tope de % Cuentas', v_org_row.max_accounts;
  end if;

  insert into dk_kitchens (slug, name, timezone, currency, organization_id, created_by)
  values (lower(btrim(p_slug)), btrim(p_name), coalesce(p_timezone, v_org_row.default_timezone), coalesce(p_currency, v_org_row.currency), v_org, dk_current_profile_id())
  returning id into v_kitchen_id;

  -- Configuración inicial: mismos valores por defecto que tuvo la primera Cuenta.
  -- Los Super Admin de la organización ya tienen acceso (no necesitan membresía).
  insert into dk_kitchen_sla_settings (kitchen_id) values (v_kitchen_id);
  insert into dk_ai_features (kitchen_id, feature_key, settings) values
    (v_kitchen_id, 'supply_reorder',       '{"coverage_days": 7, "frequency_min": 360}'),
    (v_kitchen_id, 'supply_perishables',   '{"warning_days": 2, "frequency_min": 360}'),
    (v_kitchen_id, 'supply_slow_movers',   '{"slow_days": 21, "overstock_days": 60, "frequency_min": 1440}'),
    (v_kitchen_id, 'kitchen_stall_alerts', '{"dish_stall_min": 12, "repeat_min": 5, "voice": true}'),
    (v_kitchen_id, 'kitchen_insights',     '{"frequency_min": 10, "voice": false}');
  insert into dk_kitchen_counters (kitchen_id, name, last_value) values (v_kitchen_id, 'order_number', 999);
  return v_kitchen_id;
end;
$$;

create or replace function dk_set_kitchens_active(p_kitchen_ids uuid[], p_active boolean)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if exists (select 1 from dk_kitchens k where k.id = any (p_kitchen_ids) and not dk_has_org_permission(k.organization_id, 'accounts.manage')) then
    raise exception 'No autorizado para activar o desactivar alguna de esas Cuentas';
  end if;
  update dk_kitchens set active = p_active where id = any (p_kitchen_ids) and active is distinct from p_active;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

drop function dk_admin_kitchens();
create or replace function dk_admin_kitchens()
returns table (
  kitchen_id uuid, slug text, name text, active boolean, created_at timestamptz,
  members_active integer, admins integer, orders_30d integer, last_order_at timestamptz,
  organization_id uuid, organization_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not dk_is_superadmin() then
    raise exception 'Solo el administrador de la plataforma ve todas las Cuentas';
  end if;
  return query
  select k.id, k.slug, k.name, k.active, k.created_at,
    (select count(*)::int from dk_kitchen_members m where m.kitchen_id = k.id and m.active),
    -- Quien puede administrar la Cuenta: sus Super Admin + miembros con un rol que administra el equipo.
    (select count(*)::int from dk_organization_members om where om.organization_id = k.organization_id and om.is_super_admin and om.status = 'active')
      + (select count(distinct mr.user_id)::int from dk_member_roles mr join dk_kitchen_members m on m.kitchen_id = mr.kitchen_id and m.user_id = mr.user_id and m.active
         join dk_role_permissions rp on rp.role_id = mr.role_id and rp.permission_key = 'team.manage' where mr.kitchen_id = k.id),
    (select count(*)::int from dk_orders o where o.kitchen_id = k.id and o.created_at >= now() - interval '30 days'),
    (select max(o.created_at) from dk_orders o where o.kitchen_id = k.id),
    o.id, o.name
  from dk_kitchens k join dk_organizations o on o.id = k.organization_id
  order by o.name, k.name;
end;
$$;

-- Cuentas del usuario (hasta que la app use dk_my_context, Fase D).
create or replace function dk_my_kitchens()
returns table (kitchen_id uuid, slug text, name text, active boolean, role_key text, role_name text, permissions text[])
language sql
stable
security definer
set search_path = public
as $$
  select k.id, k.slug, k.name, k.active and o.active,
    case when e.er = 'ALL' then case when dk_is_superadmin() then 'SUPERADMIN' else 'SUPER_ADMIN' end else r.key end,
    case when e.er = 'ALL' then case when dk_is_superadmin() then 'Administrador de la plataforma' else 'Super Admin' end else r.name end,
    case
      when e.er is null then '{}'::text[]
      when e.er = 'ALL' then (select array_agg(p.key order by p.key) from dk_permissions p where p.scope = 'account')
      else coalesce((select array_agg(rp.permission_key order by rp.permission_key) from dk_role_permissions rp where rp.role_id = r.id), '{}')
    end
  from dk_kitchens k
  join dk_organizations o on o.id = k.organization_id
  cross join lateral (select dk_effective_role(k.id) as er) e
  left join dk_roles r on r.id::text = e.er
  where e.er is not null
    or dk_has_org_permission(k.organization_id, 'accounts.view')
    or exists (select 1 from dk_kitchen_members m join dk_users u on u.id = m.user_id
               where m.kitchen_id = k.id and m.active and u.auth_user_id = auth.uid())
  order by 3;
$$;

create or replace function dk_kitchen_team()
returns table (user_id uuid, full_name text, email text, role_id uuid, role_name text, role_is_system boolean, active boolean, member_since timestamptz, is_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.full_name, a.email, r.id, r.name, r.is_system, m.active and u.active, m.created_at, u.auth_user_id = auth.uid()
  from dk_kitchen_members m
  join dk_users u on u.id = m.user_id
  left join auth.users a on a.id = u.auth_user_id
  join dk_roles r on r.id = m.default_role_id
  where m.kitchen_id = dk_current_kitchen_id()
    and dk_can('team.view')
  order by m.active desc, u.full_name;
$$;

-- Roles asignados de una persona en una Cuenta (reemplaza sus roles; ADR 7.4).
create or replace function dk_set_member_roles(p_kitchen_id uuid, p_user_id uuid, p_role_ids uuid[], p_default_role_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from dk_kitchens where id = p_kitchen_id;
  if v_org is null then raise exception 'Cuenta no encontrada'; end if;
  if not (dk_is_org_super_admin(v_org) or dk_has_kitchen_permission(p_kitchen_id, 'team.manage')) then
    raise exception 'No autorizado para asignar roles en esta Cuenta';
  end if;
  if p_user_id = dk_current_profile_id() and not dk_is_superadmin() then
    raise exception 'No puedes cambiar tus propios roles; pídeselo a otro administrador';
  end if;
  if coalesce(array_length(p_role_ids, 1), 0) = 0 then raise exception 'Asigna al menos un rol'; end if;
  if not (p_default_role_id = any (p_role_ids)) then raise exception 'El rol predeterminado debe estar entre los asignados'; end if;

  insert into dk_kitchen_members (kitchen_id, user_id, default_role_id, active, invited_by)
  values (p_kitchen_id, p_user_id, p_default_role_id, true, dk_current_profile_id())
  on conflict (kitchen_id, user_id) do update set default_role_id = excluded.default_role_id
  where dk_kitchen_members.default_role_id is distinct from excluded.default_role_id;

  insert into dk_member_roles (kitchen_id, user_id, role_id, assigned_by)
  select p_kitchen_id, p_user_id, r, dk_current_profile_id() from (select distinct unnest(p_role_ids) as r) x
  where not exists (select 1 from dk_member_roles mr where mr.kitchen_id = p_kitchen_id and mr.user_id = p_user_id and mr.role_id = x.r);

  delete from dk_member_roles
  where kitchen_id = p_kitchen_id and user_id = p_user_id and not (role_id = any (p_role_ids));
end;
$$;

drop function dk_save_role(uuid, text, text, text[]);
create or replace function dk_save_role(
  p_role_id uuid,
  p_name text,
  p_description text,
  p_permissions text[],
  p_organization_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_role_id uuid := p_role_id;
  v_key text;
  v_invalid text;
begin
  v_org := coalesce(
    p_organization_id,
    (select organization_id from dk_roles where id = p_role_id),
    (select organization_id from dk_kitchens where id = dk_current_kitchen_id())
  );
  if v_org is null then raise exception 'Indica la organización del rol'; end if;
  if not dk_has_org_permission(v_org, 'roles.manage') then raise exception 'Solo un Super Admin administra los roles de la organización'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'El nombre del rol es obligatorio'; end if;

  -- Solo permisos de Cuenta del catálogo (los de organización son del Super Admin).
  select string_agg(x, ', ') into v_invalid
  from unnest(coalesce(p_permissions, '{}')) x
  where not exists (select 1 from dk_permissions p where p.key = x and p.scope = 'account');
  if v_invalid is not null then raise exception 'Permisos desconocidos: %', v_invalid; end if;

  if v_role_id is null then
    v_key := upper(regexp_replace(translate(btrim(p_name), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'), '[^A-Za-z0-9]+', '_', 'g'));
    v_key := 'C_' || trim(both '_' from v_key);
    insert into dk_roles (organization_id, key, name, description, is_system)
    values (v_org, v_key, btrim(p_name), nullif(btrim(p_description), ''), false)
    returning id into v_role_id;
  else
    if not exists (select 1 from dk_roles where id = v_role_id and organization_id = v_org and not is_system) then
      raise exception 'Solo se pueden editar los roles propios de la organización';
    end if;
    update dk_roles set name = btrim(p_name), description = nullif(btrim(p_description), '') where id = v_role_id;
  end if;

  delete from dk_role_permissions where role_id = v_role_id;
  insert into dk_role_permissions (role_id, permission_key)
  select distinct v_role_id, x from unnest(coalesce(p_permissions, '{}')) x;
  return v_role_id;
exception when unique_violation then
  raise exception 'Ya existe un rol con ese nombre en la organización';
end;
$$;

create or replace function dk_delete_role(p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := (select organization_id from dk_roles where id = p_role_id and not is_system);
begin
  if v_org is null then raise exception 'Solo se pueden eliminar roles propios'; end if;
  if not dk_has_org_permission(v_org, 'roles.manage') then raise exception 'Solo un Super Admin administra los roles de la organización'; end if;
  if exists (select 1 from dk_member_roles where role_id = p_role_id)
     or exists (select 1 from dk_kitchen_invitations where role_id = p_role_id and accepted_at is null and revoked_at is null) then
    raise exception 'El rol está asignado a personas o invitaciones; cámbialas antes de eliminarlo';
  end if;
  delete from dk_roles where id = p_role_id;
end;
$$;

create or replace function dk_create_invitation(p_email text, p_role_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_org uuid;
  v_email text := lower(btrim(p_email));
  v_token text;
  v_missing text;
begin
  if v_kitchen is null then raise exception 'No hay una Cuenta activa'; end if;
  if not dk_can('team.manage') then raise exception 'No autorizado para invitar al equipo'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Correo inválido'; end if;
  select organization_id into v_org from dk_kitchens where id = v_kitchen;
  if not exists (select 1 from dk_roles where id = p_role_id and (organization_id is null or organization_id = v_org)) then
    raise exception 'El rol no pertenece a esta organización';
  end if;
  if not dk_is_org_super_admin(v_org) then
    select string_agg(rp.permission_key, ', ') into v_missing
    from dk_role_permissions rp where rp.role_id = p_role_id and not dk_can(rp.permission_key);
    if v_missing is not null then raise exception 'No puedes invitar con un rol con permisos que tú no tienes (%)', v_missing; end if;
  end if;
  if exists (
    select 1 from dk_kitchen_members m
    join dk_users u on u.id = m.user_id
    join auth.users a on a.id = u.auth_user_id
    where m.kitchen_id = v_kitchen and m.active and lower(a.email) = v_email
  ) then
    raise exception 'Esa persona ya es parte del equipo de esta Cuenta';
  end if;

  -- Una sola invitación vigente por correo y Cuenta: la nueva reemplaza a la anterior.
  update dk_kitchen_invitations set revoked_at = now()
  where kitchen_id = v_kitchen and email = v_email and accepted_at is null and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into dk_kitchen_invitations (kitchen_id, email, role_id, token_hash)
  values (v_kitchen, v_email, p_role_id, dk_hash_token(v_token));
  return v_token;
end;
$$;

create or replace function dk_accept_invitation(p_token text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_inv record;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_profile record;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para aceptar la invitación'; end if;

  select i.*, k.slug, k.active and o.active as kitchen_active into v_inv
  from dk_kitchen_invitations i
  join dk_kitchens k on k.id = i.kitchen_id
  join dk_organizations o on o.id = k.organization_id
  where i.token_hash = dk_hash_token(p_token)
  for update of i;

  if not found then raise exception 'Invitación no válida'; end if;
  if v_inv.accepted_at is not null then raise exception 'Esta invitación ya fue usada'; end if;
  if v_inv.revoked_at is not null then raise exception 'Esta invitación fue anulada'; end if;
  if v_inv.expires_at < now() then raise exception 'Esta invitación venció; pide una nueva'; end if;
  if not v_inv.kitchen_active then raise exception 'La Cuenta está desactivada'; end if;
  if v_email <> v_inv.email then
    raise exception 'Esta invitación es para %; entraste con otro correo', v_inv.email;
  end if;

  select * into v_profile from dk_users where auth_user_id = auth.uid();
  if not found then
    insert into dk_users (auth_user_id, full_name, active)
    values (
      auth.uid(),
      coalesce(nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''), split_part(v_inv.email, '@', 1)),
      true
    )
    returning * into v_profile;
  elsif not v_profile.active then
    raise exception 'Tu usuario está desactivado; contacta al administrador';
  end if;

  -- La invitación ya fue validada por quien la creó: se asigna sin las reglas de "no te asignes a ti mismo".
  perform set_config('dk.assignment_bypass', 'on', true);
  insert into dk_kitchen_members (kitchen_id, user_id, default_role_id, active, invited_by)
  values (v_inv.kitchen_id, v_profile.id, v_inv.role_id, true, v_inv.invited_by)
  on conflict (kitchen_id, user_id) do update set default_role_id = excluded.default_role_id, active = true;
  update dk_organization_members set status = 'active'
  where organization_id = (select organization_id from dk_kitchens where id = v_inv.kitchen_id) and user_id = v_profile.id and status <> 'active';
  perform set_config('dk.assignment_bypass', 'off', true);

  update dk_kitchen_invitations set accepted_at = now(), accepted_by = v_profile.id where id = v_inv.id;
  return v_inv.slug;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Contexto del usuario (organizaciones, Cuentas, roles) y última Cuenta
-- ---------------------------------------------------------------------------

alter table dk_users add column last_account_id uuid references dk_kitchens(id) on delete set null;
comment on column dk_users.last_account_id is 'Última Cuenta usada (para volver a ella al iniciar sesión, en cualquier equipo). Se revalida siempre.';

create or replace function dk_set_last_account(p_kitchen_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kitchen_id is not null and not dk_is_kitchen_member(p_kitchen_id) then
    raise exception 'No tienes acceso a esa Cuenta';
  end if;
  update dk_users set last_account_id = p_kitchen_id where auth_user_id = auth.uid();
end;
$$;

-- Todo lo que la app necesita para saber dónde está y qué puede hacer (ADR 0008, 13.1).
create or replace function dk_my_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user dk_users;
  v_platform boolean := dk_is_superadmin();
begin
  select * into v_user from dk_users where auth_user_id = auth.uid();
  if not found then return null; end if;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_user.id, 'fullName', v_user.full_name, 'avatarKey', v_user.avatar_key,
      'active', v_user.active, 'isPlatformAdmin', v_platform, 'lastAccountId', v_user.last_account_id),
    'accountPermissions', (select coalesce(jsonb_agg(p.key order by p.sort_order), '[]') from dk_permissions p where p.scope = 'account'),
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', o.id, 'slug', o.slug, 'name', o.name, 'active', o.active,
          'isOwner', o.owner_user_id = v_user.id,
          'isSuperAdmin', v_platform or coalesce(om.is_super_admin and om.status = 'active', false),
          'status', coalesce(om.status, 'active'),
          'permissions', (select coalesce(jsonb_agg(p.key order by p.sort_order), '[]') from dk_permissions p
                          where p.scope = 'organization' and dk_has_org_permission(o.id, p.key)))
        order by o.name)
      from dk_organizations o
      left join dk_organization_members om on om.organization_id = o.id and om.user_id = v_user.id
      where v_platform or om.user_id is not null
    ), '[]'),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', k.id, 'slug', k.slug, 'name', k.name, 'organizationId', k.organization_id,
          'active', k.active and o.active,
          'superAdmin', v_platform or coalesce(om.is_super_admin and om.status = 'active', false),
          'defaultRoleId', m.default_role_id,
          'roles', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', r.id, 'key', r.key, 'name', r.name, 'isSystem', r.is_system,
                'permissions', (select coalesce(jsonb_agg(rp.permission_key order by rp.permission_key), '[]') from dk_role_permissions rp where rp.role_id = r.id))
              order by r.id = m.default_role_id desc, r.name)
            from dk_member_roles mr join dk_roles r on r.id = mr.role_id
            where mr.kitchen_id = k.id and mr.user_id = v_user.id and m.active
          ), '[]'))
        order by o.name, k.name)
      from dk_kitchens k
      join dk_organizations o on o.id = k.organization_id
      left join dk_organization_members om on om.organization_id = k.organization_id and om.user_id = v_user.id
      left join dk_kitchen_members m on m.kitchen_id = k.id and m.user_id = v_user.id
      where v_platform
         or (om.status = 'active' and (om.is_super_admin or m.active))
    ), '[]')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Permisos de ejecución
-- ---------------------------------------------------------------------------

revoke all on dk_organizations, dk_organization_members, dk_member_roles from anon;
grant select, update on dk_organizations to authenticated;
grant select on dk_organization_members, dk_member_roles to authenticated;

revoke execute on function
  dk_request_header(text), dk_effective_role(uuid), dk_active_role(), dk_is_org_super_admin(uuid),
  dk_has_org_permission(uuid, text), dk_default_organization_id(), dk_set_member_roles(uuid, uuid, uuid[], uuid),
  dk_save_role(uuid, text, text, text[], uuid), dk_create_kitchen(text, text, text, text, uuid), dk_admin_kitchens(),
  dk_set_last_account(uuid), dk_my_context(), dk_require_master_menu_manager(uuid)
from public, anon;
grant execute on function
  dk_request_header(text), dk_effective_role(uuid), dk_active_role(), dk_is_org_super_admin(uuid),
  dk_has_org_permission(uuid, text), dk_default_organization_id(), dk_set_member_roles(uuid, uuid, uuid[], uuid),
  dk_save_role(uuid, text, text, text[], uuid), dk_create_kitchen(text, text, text, text, uuid), dk_admin_kitchens(),
  dk_set_last_account(uuid), dk_my_context(), dk_require_master_menu_manager(uuid)
to authenticated;
