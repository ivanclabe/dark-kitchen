-- Nombres de rol y SUPER_ADMIN (decisión del 2026-09-25, ADR 0008 §19).
--
-- 1. Todos los roles se nombran en MAYÚSCULAS y con "_" en vez de espacios:
--    ADMIN, GERENTE, CAJA, COCINA, INVENTARIO, DOMICILIARIO y los roles propios
--    (p. ej. "Encargado de turno" → ENCARGADO_DE_TURNO). La base lo exige.
-- 2. SUPER_ADMIN (acceso global a la organización) es SOLO del creador de la
--    organización: no se asigna a nadie más y es intransferible. Se retiran
--    "nombrar Super Admin" y "transferir la propiedad".
-- 3. ADMIN es el rol de Cuenta con todas sus opciones y configuraciones; se
--    asigna a usuarios en una o varias Cuentas.

-- ---------------------------------------------------------------------------
-- 1. Nombres de rol
-- ---------------------------------------------------------------------------

create or replace function dk_normalize_role_name(p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select upper(regexp_replace(regexp_replace(btrim(coalesce(p_name, '')), '[^[:alnum:][:space:]_]+', '', 'g'), '[[:space:]]+', '_', 'g'));
$$;

comment on function dk_normalize_role_name is 'Nombre de rol en MAYÚSCULAS con "_" en vez de espacios (p. ej. "Encargado de turno" → ENCARGADO_DE_TURNO).';

update dk_roles set name = case key
    when 'ADMIN' then 'ADMIN'
    when 'MANAGER' then 'GERENTE'
    when 'CASHIER' then 'CAJA'
    when 'KITCHEN' then 'COCINA'
    when 'INVENTORY' then 'INVENTARIO'
    when 'DELIVERY' then 'DOMICILIARIO'
    else dk_normalize_role_name(name)
  end
where is_system;
update dk_roles set name = dk_normalize_role_name(name) where not is_system;

alter table dk_roles add constraint dk_roles_name_format
  check (name = dk_normalize_role_name(name) and char_length(name) between 2 and 40);

-- La plantilla ADMIN tiene TODOS los permisos de Cuenta (también los que se agreguen al catálogo).
insert into dk_role_permissions (role_id, permission_key)
select r.id, p.key from dk_roles r cross join dk_permissions p
where r.is_system and r.key = 'ADMIN' and p.scope = 'account'
on conflict do nothing;

create or replace function dk_grant_new_permission_to_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.scope = 'account' then
    insert into dk_role_permissions (role_id, permission_key)
    select id, new.key from dk_roles where is_system and key = 'ADMIN'
    on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger dk_trg_permissions_admin_gets_all after insert on dk_permissions
  for each row execute function dk_grant_new_permission_to_admin();

-- Guardar un rol propio: el nombre se normaliza (MAYÚSCULAS, "_").
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
  v_name text := dk_normalize_role_name(p_name);
  v_key text;
  v_invalid text;
begin
  v_org := coalesce(
    p_organization_id,
    (select organization_id from dk_roles where id = p_role_id),
    (select organization_id from dk_kitchens where id = dk_current_kitchen_id())
  );
  if v_org is null then raise exception 'Indica la organización del rol'; end if;
  if not dk_has_org_permission(v_org, 'roles.manage') then raise exception 'Solo el SUPER_ADMIN administra los roles de la organización'; end if;
  if char_length(v_name) < 2 then raise exception 'El nombre del rol es obligatorio'; end if;
  if v_name in ('SUPER_ADMIN', 'ADMIN') then raise exception 'Ese nombre está reservado'; end if;

  -- Solo permisos de Cuenta del catálogo (los de organización son del SUPER_ADMIN).
  select string_agg(x, ', ') into v_invalid
  from unnest(coalesce(p_permissions, '{}')) x
  where not exists (select 1 from dk_permissions p where p.key = x and p.scope = 'account');
  if v_invalid is not null then raise exception 'Permisos desconocidos: %', v_invalid; end if;

  if v_role_id is null then
    v_key := 'C_' || upper(regexp_replace(translate(v_name, 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '[^A-Z0-9]+', '_', 'g'));
    insert into dk_roles (organization_id, key, name, description, is_system)
    values (v_org, v_key, v_name, nullif(btrim(p_description), ''), false)
    returning id into v_role_id;
  else
    if not exists (select 1 from dk_roles where id = v_role_id and organization_id = v_org and not is_system) then
      raise exception 'Solo se pueden editar los roles propios de la organización';
    end if;
    update dk_roles set name = v_name, description = nullif(btrim(p_description), '') where id = v_role_id;
  end if;

  delete from dk_role_permissions where role_id = v_role_id;
  insert into dk_role_permissions (role_id, permission_key)
  select distinct v_role_id, x from unnest(coalesce(p_permissions, '{}')) x;
  return v_role_id;
exception when unique_violation then
  raise exception 'Ya existe un rol con ese nombre en la organización';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. SUPER_ADMIN: solo el creador, intransferible
-- ---------------------------------------------------------------------------

update dk_organization_members om set is_super_admin = (om.user_id = o.owner_user_id)
from dk_organizations o where o.id = om.organization_id and om.is_super_admin <> (om.user_id = o.owner_user_id);

comment on column dk_organization_members.is_super_admin is 'SUPER_ADMIN: solo el creador de la organización (owner_user_id). No se asigna a nadie más ni se transfiere.';
comment on column dk_organizations.owner_user_id is 'Creador de la organización y su único SUPER_ADMIN. Intransferible.';

create or replace function dk_guard_org_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := (select owner_user_id from dk_organizations where id = coalesce(new.organization_id, old.organization_id));
begin
  if tg_op = 'DELETE' then
    if old.user_id = v_owner and exists (select 1 from dk_organizations where id = old.organization_id) then
      raise exception 'El creador de la organización (SUPER_ADMIN) no se puede quitar';
    end if;
    return old;
  end if;
  if new.is_super_admin and new.user_id is distinct from v_owner then
    raise exception 'SUPER_ADMIN es solo del creador de la organización; no se asigna a otros usuarios';
  end if;
  if new.user_id = v_owner and (not new.is_super_admin or new.status <> 'active') then
    raise exception 'El creador de la organización siempre es SUPER_ADMIN activo';
  end if;
  return new;
end;
$$;

drop trigger dk_trg_org_members_guard_owner on dk_organization_members;
create trigger dk_trg_org_members_guard_owner before insert or update or delete on dk_organization_members
  for each row execute function dk_guard_org_owner_membership();

-- La organización: dueño inmutable; activarla/desactivarla, su creador o la plataforma; tope, la plataforma.
create or replace function dk_guard_organization()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'El SUPER_ADMIN (creador de la organización) es intransferible';
  end if;
  if dk_is_superadmin() then
    return new;
  end if;
  if new.active is distinct from old.active and old.owner_user_id is distinct from dk_current_profile_id() then
    raise exception 'Solo el SUPER_ADMIN puede activar o desactivar la organización';
  end if;
  if new.max_accounts is distinct from old.max_accounts then
    raise exception 'El tope de Cuentas lo fija la plataforma';
  end if;
  return new;
end;
$$;

drop function dk_transfer_ownership(uuid, uuid);

-- El permiso de transferir desaparece del catálogo.
delete from dk_permissions where key = 'organization.transfer';

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
    else dk_is_org_super_admin(p_organization_id)
  end;
$$;

-- Crear usuario: ya no se puede nombrar SUPER_ADMIN.
drop function dk_create_user(uuid, text, text, boolean, jsonb);
create or replace function dk_create_user(
  p_organization_id uuid,
  p_full_name text,
  p_email text,
  p_assignments jsonb default '[]'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_full_name, ''));
  v_is_super boolean := dk_has_org_permission(p_organization_id, 'users.manage');
  v_kitchens uuid[];
  v_user uuid;
  v_status text;
  v_assignment jsonb;
  v_roles uuid[];
  v_default uuid;
  v_token text;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Correo inválido'; end if;
  if char_length(v_name) not between 2 and 80 then raise exception 'El nombre debe tener entre 2 y 80 caracteres'; end if;

  select coalesce(array_agg((a ->> 'kitchen_id')::uuid), '{}') into v_kitchens
  from jsonb_array_elements(coalesce(p_assignments, '[]')) a;

  if cardinality(v_kitchens) = 0 then raise exception 'Asígnale al menos una Cuenta'; end if;
  if exists (select 1 from unnest(v_kitchens) k where not exists (select 1 from dk_kitchens where id = k and organization_id = p_organization_id)) then
    raise exception 'Alguna de las Cuentas no pertenece a la organización';
  end if;
  if not v_is_super and exists (select 1 from unnest(v_kitchens) k where not dk_has_kitchen_permission(k, 'team.manage')) then
    raise exception 'No autorizado para crear usuarios en esas Cuentas';
  end if;

  -- Identidad: primero una persona ya registrada con ese correo; si no, un pendiente; si no, uno nuevo.
  select u.id into v_user from dk_users u join auth.users a on a.id = u.auth_user_id where lower(a.email) = v_email;
  if v_user is null then
    select id into v_user from dk_users where email = v_email and auth_user_id is null;
  end if;
  if v_user is null then
    insert into dk_users (auth_user_id, email, full_name, active) values (null, v_email, v_name, true) returning id into v_user;
  end if;

  select status into v_status from dk_organization_members where organization_id = p_organization_id and user_id = v_user;
  if v_status in ('active', 'pending') then
    raise exception 'Esa persona ya es parte de la organización';
  end if;

  insert into dk_organization_members (organization_id, user_id, is_super_admin, status, created_by)
  values (p_organization_id, v_user, false, 'pending', dk_current_profile_id())
  on conflict (organization_id, user_id) do update set status = 'pending';

  for v_assignment in select * from jsonb_array_elements(coalesce(p_assignments, '[]')) loop
    select coalesce(array_agg(r::uuid), '{}') into v_roles from jsonb_array_elements_text(v_assignment -> 'role_ids') r;
    v_default := coalesce((v_assignment ->> 'default_role_id')::uuid, v_roles[1]);
    perform dk_set_member_roles((v_assignment ->> 'kitchen_id')::uuid, v_user, v_roles, v_default);
  end loop;

  v_token := dk_new_activation(p_organization_id, v_user);
  return jsonb_build_object('user_id', v_user, 'token', v_token);
end;
$$;

-- Activar/desactivar en la organización (el SUPER_ADMIN ya no se "nombra").
drop function dk_set_org_member(uuid, uuid, boolean, boolean);
create or replace function dk_set_org_member(p_organization_id uuid, p_user_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not dk_has_org_permission(p_organization_id, 'users.manage') then
    raise exception 'Solo el SUPER_ADMIN administra los usuarios de la organización';
  end if;
  if p_user_id = dk_current_profile_id() and not dk_is_superadmin() then
    raise exception 'No puedes cambiar tu propio acceso';
  end if;
  select status into v_status from dk_organization_members where organization_id = p_organization_id and user_id = p_user_id;
  if v_status is null then raise exception 'Esa persona no es parte de la organización'; end if;
  if p_active and v_status = 'pending' then raise exception 'Ese usuario se activa con su enlace de activación'; end if;

  update dk_organization_members set status = case when p_active then 'active' else 'disabled' end
  where organization_id = p_organization_id and user_id = p_user_id and status <> 'pending';
  if not p_active then
    update dk_user_activations set revoked_at = now()
    where organization_id = p_organization_id and user_id = p_user_id and used_at is null and revoked_at is null;
  end if;
end;
$$;

-- Nombre del rol de acceso total en la lista de Cuentas del usuario.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.dk_my_kitchens()'::regprocedure);
  v_def := replace(v_def, '''Administrador de la plataforma''', '''SUPER_ADMIN''');
  v_def := replace(v_def, '''Super Admin''', '''SUPER_ADMIN''');
  if position('SUPER_ADMIN''' in v_def) = 0 then raise exception 'dk_my_kitchens no tiene la forma esperada'; end if;
  execute v_def;
end $$;

revoke execute on function dk_create_user(uuid, text, text, jsonb), dk_set_org_member(uuid, uuid, boolean), dk_grant_new_permission_to_admin() from public, anon;
grant execute on function dk_create_user(uuid, text, text, jsonb), dk_set_org_member(uuid, uuid, boolean) to authenticated;
revoke execute on function dk_grant_new_permission_to_admin() from authenticated;
