-- Multi-Cocina — Fase 5: administración (ADR 0007, secciones 8, 9 y 12).
--
--   1. Invitaciones por Cocina: el Administrador invita por correo con un
--      rol; la persona crea su cuenta (o entra) con el enlace y queda como
--      miembro. Reemplaza el autorregistro abierto. El token solo se guarda
--      cifrado (sha256) y únicamente sirve para el correo invitado.
--   2. Equipo: listado de miembros de la Cocina activa (con correo) y
--      protección para que una Cocina nunca se quede sin administrador.
--   3. Roles propios: el Administrador de una Cocina crea roles para SU
--      Cocina con la matriz de permisos. Los de sistema siguen intocables.
--   4. Superusuario: listado de todas las Cocinas y activar/desactivar en grupo.
--   5. El rol global heredado (dk_users.role) deja de sincronizarse: el
--      módulo Equipo gestiona membresías directamente.

-- ---------------------------------------------------------------------------
-- 1. Invitaciones
-- ---------------------------------------------------------------------------

create table dk_kitchen_invitations (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references dk_kitchens (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  role_id uuid not null references dk_roles (id),
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references dk_users (id),
  revoked_at timestamptz,
  invited_by uuid references dk_users (id) default dk_current_profile_id(),
  created_at timestamptz not null default now()
);

create unique index dk_kitchen_invitations_one_pending on dk_kitchen_invitations (kitchen_id, email)
  where accepted_at is null and revoked_at is null;

comment on table dk_kitchen_invitations is 'Invitaciones a una Cocina. token_hash = sha256 del token del enlace (el token en claro solo se muestra al crearla).';

create trigger dk_trg_audit_invitations after insert or update or delete on dk_kitchen_invitations
  for each row execute function dk_audit_row();

alter table dk_kitchen_invitations enable row level security;
-- Lectura para quien ve el equipo de esa Cocina; escritura solo por RPC.
create policy dk_kitchen_invitations_select on dk_kitchen_invitations for select to authenticated
  using (dk_has_kitchen_permission(kitchen_id, 'members', 'view'));

create or replace function dk_hash_token(p_token text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- Crear invitación en la Cocina activa. Devuelve el token (única vez que existe en claro).
create or replace function dk_create_invitation(p_email text, p_role_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_email text := lower(btrim(p_email));
  v_token text;
begin
  if v_kitchen is null then raise exception 'No hay una Cocina activa'; end if;
  if not dk_can('members', 'manage') then raise exception 'No autorizado para invitar al equipo'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Correo inválido'; end if;
  if not exists (select 1 from dk_roles where id = p_role_id and (kitchen_id is null or kitchen_id = v_kitchen)) then
    raise exception 'El rol no pertenece a esta Cocina';
  end if;
  if exists (
    select 1 from dk_kitchen_members m
    join dk_users u on u.id = m.user_id
    join auth.users a on a.id = u.auth_user_id
    where m.kitchen_id = v_kitchen and m.active and lower(a.email) = v_email
  ) then
    raise exception 'Esa persona ya es parte del equipo de esta Cocina';
  end if;

  -- Una sola invitación vigente por correo y Cocina: la nueva reemplaza a la anterior.
  update dk_kitchen_invitations set revoked_at = now()
  where kitchen_id = v_kitchen and email = v_email and accepted_at is null and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into dk_kitchen_invitations (kitchen_id, email, role_id, token_hash)
  values (v_kitchen, v_email, p_role_id, dk_hash_token(v_token));
  return v_token;
end;
$$;

create or replace function dk_revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform dk_assert_in_active_kitchen('dk_kitchen_invitations', p_invitation_id);
  if not dk_can('members', 'manage') then raise exception 'No autorizado'; end if;
  update dk_kitchen_invitations set revoked_at = now()
  where id = p_invitation_id and accepted_at is null and revoked_at is null;
end;
$$;

-- Vista previa del enlace (también sin sesión): solo Cocina, rol, correo y estado.
create or replace function dk_invitation_preview(p_token text)
returns table (kitchen_name text, role_name text, email text, status text)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select k.name, r.name, i.email,
    case
      when i.accepted_at is not null then 'used'
      when i.revoked_at is not null then 'revoked'
      when i.expires_at < now() then 'expired'
      when not k.active then 'kitchen_inactive'
      else 'valid'
    end
  from dk_kitchen_invitations i
  join dk_kitchens k on k.id = i.kitchen_id
  join dk_roles r on r.id = i.role_id
  where i.token_hash = dk_hash_token(p_token);
$$;

-- Aceptar: la persona con sesión (y el MISMO correo invitado) queda como miembro.
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
  v_role_key text;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para aceptar la invitación'; end if;

  select i.*, k.slug, k.active as kitchen_active into v_inv
  from dk_kitchen_invitations i join dk_kitchens k on k.id = i.kitchen_id
  where i.token_hash = dk_hash_token(p_token)
  for update of i;

  if not found then raise exception 'Invitación no válida'; end if;
  if v_inv.accepted_at is not null then raise exception 'Esta invitación ya fue usada'; end if;
  if v_inv.revoked_at is not null then raise exception 'Esta invitación fue anulada'; end if;
  if v_inv.expires_at < now() then raise exception 'Esta invitación venció; pide una nueva'; end if;
  if not v_inv.kitchen_active then raise exception 'La Cocina está desactivada'; end if;
  if v_email <> v_inv.email then
    raise exception 'Esta invitación es para %; entraste con otro correo', v_inv.email;
  end if;

  select key into v_role_key from dk_roles where id = v_inv.role_id;

  select * into v_profile from dk_users where auth_user_id = auth.uid();
  if not found then
    insert into dk_users (auth_user_id, full_name, role, active)
    values (
      auth.uid(),
      coalesce(nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''), split_part(v_inv.email, '@', 1)),
      -- Rol global heredado (se retira en la Fase 6): el de sistema equivalente, o Caja.
      case when v_role_key in ('ADMIN','MANAGER','KITCHEN','INVENTORY','CASHIER','DELIVERY') then v_role_key::dk_role else 'CASHIER' end,
      true
    )
    returning * into v_profile;
  elsif not v_profile.active and not exists (select 1 from dk_kitchen_members where user_id = v_profile.id) then
    -- Autorregistro pendiente de aprobación: la invitación es la aprobación.
    update dk_users set active = true where id = v_profile.id;
  elsif not v_profile.active then
    raise exception 'Tu cuenta está desactivada; contacta al administrador';
  end if;

  insert into dk_kitchen_members (kitchen_id, user_id, role_id, active, invited_by)
  values (v_inv.kitchen_id, v_profile.id, v_inv.role_id, true, v_inv.invited_by)
  on conflict (kitchen_id, user_id) do update set role_id = excluded.role_id, active = true;

  update dk_kitchen_invitations set accepted_at = now(), accepted_by = v_profile.id where id = v_inv.id;
  return v_inv.slug;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Equipo
-- ---------------------------------------------------------------------------

create or replace function dk_kitchen_team()
returns table (
  user_id uuid,
  full_name text,
  email text,
  role_id uuid,
  role_name text,
  role_is_system boolean,
  active boolean,
  member_since timestamptz,
  is_me boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.full_name, a.email, r.id, r.name, r.is_system, m.active and u.active, m.created_at, u.auth_user_id = auth.uid()
  from dk_kitchen_members m
  join dk_users u on u.id = m.user_id
  left join auth.users a on a.id = u.auth_user_id
  join dk_roles r on r.id = m.role_id
  where m.kitchen_id = dk_current_kitchen_id()
    and dk_can('members', 'view')
  order by m.active desc, u.full_name;
$$;

-- Una Cocina con equipo nunca se queda sin quien lo administre (salvo que lo haga el superusuario).
create or replace function dk_guard_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := coalesce(old.kitchen_id, new.kitchen_id);
begin
  if auth.uid() is null or dk_is_superadmin() then
    return null;
  end if;
  if not exists (
    select 1 from dk_kitchen_members m
    join dk_users u on u.id = m.user_id and u.active
    join dk_role_permissions rp on rp.role_id = m.role_id and rp.module = 'members' and rp.action = 'manage'
    where m.kitchen_id = v_kitchen and m.active
  ) then
    raise exception 'La Cocina debe conservar al menos un miembro activo que administre el equipo';
  end if;
  return null;
end;
$$;

create trigger dk_trg_members_guard_last_admin after update or delete on dk_kitchen_members
  for each row execute function dk_guard_last_admin();

-- ---------------------------------------------------------------------------
-- 3. Roles propios de la Cocina
-- ---------------------------------------------------------------------------

drop policy dk_roles_write on dk_roles;
create policy dk_roles_write on dk_roles for all to authenticated
  using (not is_system and ((select dk_is_superadmin()) or (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('members', 'manage')))))
  with check (not is_system and ((select dk_is_superadmin()) or (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('members', 'manage')))));

drop policy dk_role_permissions_write on dk_role_permissions;
create policy dk_role_permissions_write on dk_role_permissions for all to authenticated
  using (exists (
    select 1 from dk_roles r where r.id = role_id and not r.is_system
      and (dk_is_superadmin() or (r.kitchen_id = dk_current_kitchen_id() and dk_can('members', 'manage')))
  ))
  with check (exists (
    select 1 from dk_roles r where r.id = role_id and not r.is_system
      and (dk_is_superadmin() or (r.kitchen_id = dk_current_kitchen_id() and dk_can('members', 'manage')))
  ));

-- Crear o editar un rol propio con su matriz completa, en una sola transacción.
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
  if v_kitchen is null then raise exception 'No hay una Cocina activa'; end if;
  if not dk_can('members', 'manage') then raise exception 'No autorizado para administrar roles'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'El nombre del rol es obligatorio'; end if;

  select string_agg(x, ', ') into v_invalid
  from unnest(coalesce(p_permissions, '{}')) x
  where not exists (select 1 from dk_permissions p where p.module || ':' || p.action = x);
  if v_invalid is not null then raise exception 'Permisos desconocidos: %', v_invalid; end if;

  if v_role_id is null then
    v_key := upper(regexp_replace(translate(btrim(p_name), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'), '[^A-Za-z0-9]+', '_', 'g'));
    v_key := 'C_' || trim(both '_' from v_key);
    insert into dk_roles (kitchen_id, key, name, description, is_system)
    values (v_kitchen, v_key, btrim(p_name), nullif(btrim(p_description), ''), false)
    returning id into v_role_id;
  else
    if not exists (select 1 from dk_roles where id = v_role_id and kitchen_id = v_kitchen and not is_system) then
      raise exception 'Solo se pueden editar los roles propios de esta Cocina';
    end if;
    update dk_roles set name = btrim(p_name), description = nullif(btrim(p_description), '') where id = v_role_id;
  end if;

  delete from dk_role_permissions where role_id = v_role_id;
  insert into dk_role_permissions (role_id, module, action)
  select v_role_id, split_part(x, ':', 1), split_part(x, ':', 2)
  from (select distinct unnest(coalesce(p_permissions, '{}')) as x) s;

  -- No se puede dejar sin administrador a la Cocina quitándole el permiso al rol.
  if not exists (
    select 1 from dk_kitchen_members m
    join dk_role_permissions rp on rp.role_id = m.role_id and rp.module = 'members' and rp.action = 'manage'
    where m.kitchen_id = v_kitchen and m.active
  ) and exists (select 1 from dk_kitchen_members where kitchen_id = v_kitchen) and not dk_is_superadmin() then
    raise exception 'La Cocina debe conservar al menos un miembro activo que administre el equipo';
  end if;

  return v_role_id;
exception when unique_violation then
  raise exception 'Ya existe un rol con ese nombre en esta Cocina';
end;
$$;

create or replace function dk_delete_role(p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not dk_can('members', 'manage') then raise exception 'No autorizado para administrar roles'; end if;
  if not exists (select 1 from dk_roles where id = p_role_id and kitchen_id = dk_current_kitchen_id() and not is_system) then
    raise exception 'Solo se pueden eliminar los roles propios de esta Cocina';
  end if;
  if exists (select 1 from dk_kitchen_members where role_id = p_role_id)
     or exists (select 1 from dk_kitchen_invitations where role_id = p_role_id and accepted_at is null and revoked_at is null) then
    raise exception 'El rol está asignado a personas o invitaciones; cámbialas antes de eliminarlo';
  end if;
  delete from dk_roles where id = p_role_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Superusuario: todas las Cocinas y acciones en grupo
-- ---------------------------------------------------------------------------

create or replace function dk_admin_kitchens()
returns table (
  kitchen_id uuid,
  slug text,
  name text,
  active boolean,
  created_at timestamptz,
  members_active integer,
  admins integer,
  orders_30d integer,
  last_order_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not dk_is_superadmin() then
    raise exception 'Solo el superusuario administra la plataforma';
  end if;
  return query
  select k.id, k.slug, k.name, k.active, k.created_at,
    (select count(*)::int from dk_kitchen_members m where m.kitchen_id = k.id and m.active),
    (select count(*)::int from dk_kitchen_members m
      join dk_role_permissions rp on rp.role_id = m.role_id and rp.module = 'members' and rp.action = 'manage'
      where m.kitchen_id = k.id and m.active),
    (select count(*)::int from dk_orders o where o.kitchen_id = k.id and o.created_at >= now() - interval '30 days'),
    (select max(o.created_at) from dk_orders o where o.kitchen_id = k.id)
  from dk_kitchens k
  order by k.name;
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
  if not dk_is_superadmin() then
    raise exception 'Solo el superusuario puede activar o desactivar Cocinas';
  end if;
  update dk_kitchens set active = p_active where id = any (p_kitchen_ids) and active is distinct from p_active;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Fin de la sincronización del rol global heredado
-- ---------------------------------------------------------------------------

drop trigger dk_trg_users_sync_membership on dk_users;
drop function dk_sync_legacy_profile_to_membership();

-- El autorregistro ya no crea perfiles: se entra por invitación (dk_accept_invitation).
-- Queda solo el arranque de una instalación vacía (primer perfil = administrador).
drop policy dk_users_insert on dk_users;
create policy dk_users_insert on dk_users for insert to authenticated
  with check (
    (select dk_is_superadmin())
    or (
      auth_user_id = (select auth.uid())
      and not dk_has_any_profile()
      and role = 'ADMIN'
    )
  );

-- ---------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------

revoke execute on function
  dk_hash_token(text), dk_create_invitation(text, uuid), dk_revoke_invitation(uuid), dk_invitation_preview(text),
  dk_accept_invitation(text), dk_kitchen_team(), dk_guard_last_admin(), dk_save_role(uuid, text, text, text[]),
  dk_delete_role(uuid), dk_admin_kitchens(), dk_set_kitchens_active(uuid[], boolean)
from public, anon;

grant execute on function
  dk_create_invitation(text, uuid), dk_revoke_invitation(uuid), dk_invitation_preview(text), dk_accept_invitation(text),
  dk_kitchen_team(), dk_save_role(uuid, text, text, text[]), dk_delete_role(uuid), dk_admin_kitchens(),
  dk_set_kitchens_active(uuid[], boolean)
to authenticated;

-- El enlace de invitación se abre antes de tener cuenta: la vista previa es pública
-- (solo devuelve Cocina, rol, correo y estado para quien tiene el token).
grant execute on function dk_invitation_preview(text) to anon;
