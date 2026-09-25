-- ADR 0008, Fase E: administración de usuarios de la organización.
--
--   · "Crear usuario": el administrador (Super Admin, o el Administrador de
--     una Cuenta limitado a ella) registra nombre, correo, Cuentas y roles.
--     El usuario queda PENDIENTE hasta que la persona abre su enlace de
--     activación y define su contraseña (o, si ya tiene usuario en la
--     plataforma, inicia sesión y acepta). El administrador nunca ve ni
--     define contraseñas ajenas (ADR D-D).
--   · Si el correo ya es de alguien en la plataforma, se reutiliza su
--     identidad, pero igual debe aceptar: nadie queda dentro de un negocio
--     ajeno sin su consentimiento.
--   · Listado de usuarios con sus Cuentas y roles, Super Admin, activar/
--     desactivar/quitar, y transferir la propiedad.

-- ---------------------------------------------------------------------------
-- 1. Usuarios pendientes: correo en el perfil y auth_user_id opcional
-- ---------------------------------------------------------------------------

alter table dk_users alter column auth_user_id drop not null;
alter table dk_users add column email text;
update dk_users u set email = lower(a.email) from auth.users a where a.id = u.auth_user_id;
alter table dk_users add constraint dk_users_email_format check (email is null or (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));
alter table dk_users add constraint dk_users_identified check (auth_user_id is not null or email is not null);
-- Único entre usuarios activados y, aparte, entre pendientes: una persona puede
-- tener un usuario pendiente (creado por un administrador) y, al mismo tiempo,
-- haberse registrado por su cuenta. Al activar, ambos perfiles se unen.
create unique index dk_users_email_key on dk_users (email) where email is not null and auth_user_id is not null;
create unique index dk_users_pending_email_key on dk_users (email) where email is not null and auth_user_id is null;

comment on column dk_users.email is 'Correo de la persona (copia del de Auth). Un usuario creado por un administrador y aún sin activar solo tiene correo (auth_user_id null).';

-- El correo del perfil sigue al de Auth.
create or replace function dk_sync_user_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update dk_users set email = lower(new.email) where auth_user_id = new.id and email is distinct from lower(new.email);
  return null;
exception when others then
  -- Nunca bloquear una operación de Auth por una copia del correo.
  return null;
end;
$$;

create trigger dk_trg_auth_users_email after update of email on auth.users
  for each row execute function dk_sync_user_email();

-- Un perfil nuevo con usuario de Auth toma su correo (p. ej. al aceptar una invitación).
create or replace function dk_fill_user_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null and new.auth_user_id is not null then
    new.email := (select lower(email) from auth.users where id = new.auth_user_id);
  end if;
  return new;
end;
$$;

create trigger dk_trg_users_fill_email before insert or update of auth_user_id on dk_users
  for each row execute function dk_fill_user_email();

-- ---------------------------------------------------------------------------
-- 2. Enlaces de activación
-- ---------------------------------------------------------------------------

create table dk_user_activations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references dk_organizations(id) on delete cascade,
  user_id uuid not null references dk_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references dk_users(id),
  created_at timestamptz not null default now()
);

create index dk_user_activations_user_idx on dk_user_activations (organization_id, user_id);
comment on table dk_user_activations is 'Enlaces de activación de usuarios creados por un administrador. Solo se guarda el hash del token (sha256); vence en 7 días.';

alter table dk_user_activations enable row level security;
create policy dk_user_activations_select on dk_user_activations for select to authenticated
  using (dk_has_org_permission(organization_id, 'users.view'));
revoke all on dk_user_activations from anon;
grant select on dk_user_activations to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Quién puede administrar a quién
-- ---------------------------------------------------------------------------

-- Super Admin de la organización, o (para usuarios que no son Super Admin)
-- administrador del equipo en TODAS las Cuentas donde la persona está asignada.
create or replace function dk_can_manage_org_user(p_organization_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select dk_has_org_permission(p_organization_id, 'users.manage')
    or (
      not exists (select 1 from dk_organization_members om where om.organization_id = p_organization_id and om.user_id = p_user_id and om.is_super_admin)
      and exists (select 1 from dk_kitchen_members m join dk_kitchens k on k.id = m.kitchen_id
                  where k.organization_id = p_organization_id and m.user_id = p_user_id)
      and not exists (select 1 from dk_kitchen_members m join dk_kitchens k on k.id = m.kitchen_id
                      where k.organization_id = p_organization_id and m.user_id = p_user_id
                        and not dk_has_kitchen_permission(m.kitchen_id, 'team.manage'))
    );
$$;

create or replace function dk_new_activation(p_organization_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  update dk_user_activations set revoked_at = now()
  where organization_id = p_organization_id and user_id = p_user_id and used_at is null and revoked_at is null;
  insert into dk_user_activations (organization_id, user_id, token_hash, created_by)
  values (p_organization_id, p_user_id, dk_hash_token(v_token), dk_current_profile_id());
  return v_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Crear usuario (queda pendiente de activación)
-- ---------------------------------------------------------------------------

-- p_assignments: [{"kitchen_id": uuid, "role_ids": [uuid, …], "default_role_id": uuid}]
create or replace function dk_create_user(
  p_organization_id uuid,
  p_full_name text,
  p_email text,
  p_super_admin boolean default false,
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

  if exists (select 1 from unnest(v_kitchens) k where not exists (select 1 from dk_kitchens where id = k and organization_id = p_organization_id)) then
    raise exception 'Alguna de las Cuentas no pertenece a la organización';
  end if;
  if not v_is_super then
    if coalesce(p_super_admin, false) then raise exception 'Solo un Super Admin nombra Super Admins'; end if;
    if cardinality(v_kitchens) = 0 or exists (select 1 from unnest(v_kitchens) k where not dk_has_kitchen_permission(k, 'team.manage')) then
      raise exception 'No autorizado para crear usuarios en esas Cuentas';
    end if;
  end if;
  if not coalesce(p_super_admin, false) and cardinality(v_kitchens) = 0 then
    raise exception 'Asígnale al menos una Cuenta (o nómbralo Super Admin)';
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
  values (p_organization_id, v_user, coalesce(p_super_admin, false), 'pending', dk_current_profile_id())
  on conflict (organization_id, user_id) do update set status = 'pending', is_super_admin = excluded.is_super_admin;

  for v_assignment in select * from jsonb_array_elements(coalesce(p_assignments, '[]')) loop
    select coalesce(array_agg(r::uuid), '{}') into v_roles from jsonb_array_elements_text(v_assignment -> 'role_ids') r;
    v_default := coalesce((v_assignment ->> 'default_role_id')::uuid, v_roles[1]);
    perform dk_set_member_roles((v_assignment ->> 'kitchen_id')::uuid, v_user, v_roles, v_default);
  end loop;

  v_token := dk_new_activation(p_organization_id, v_user);
  return jsonb_build_object('user_id', v_user, 'token', v_token);
end;
$$;

-- Nuevo enlace (el anterior deja de valer).
create or replace function dk_resend_activation(p_organization_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not dk_can_manage_org_user(p_organization_id, p_user_id) then raise exception 'No autorizado'; end if;
  if not exists (select 1 from dk_organization_members where organization_id = p_organization_id and user_id = p_user_id and status = 'pending') then
    raise exception 'Ese usuario ya está activo';
  end if;
  return dk_new_activation(p_organization_id, p_user_id);
end;
$$;

-- Corregir nombre o correo de un usuario pendiente (aún sin usuario de Auth).
create or replace function dk_update_pending_user(p_organization_id uuid, p_user_id uuid, p_full_name text, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not dk_can_manage_org_user(p_organization_id, p_user_id) then raise exception 'No autorizado'; end if;
  if not exists (select 1 from dk_users u join dk_organization_members om on om.user_id = u.id
                 where u.id = p_user_id and u.auth_user_id is null and om.organization_id = p_organization_id and om.status = 'pending') then
    raise exception 'Solo se corrigen los datos de un usuario que aún no se activa';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Correo inválido'; end if;
  if char_length(btrim(coalesce(p_full_name, ''))) not between 2 and 80 then raise exception 'El nombre debe tener entre 2 y 80 caracteres'; end if;
  update dk_users set full_name = btrim(p_full_name), email = v_email where id = p_user_id;
exception when unique_violation then
  raise exception 'Ese correo ya es de otro usuario';
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Activación
-- ---------------------------------------------------------------------------

create or replace function dk_activation_preview(p_token text)
returns table (organization_name text, full_name text, email text, status text, has_user boolean)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select o.name, u.full_name, u.email,
    case
      when a.used_at is not null then 'used'
      when a.revoked_at is not null then 'revoked'
      when a.expires_at < now() then 'expired'
      when not o.active then 'organization_inactive'
      else 'valid'
    end,
    u.auth_user_id is not null or exists (select 1 from auth.users au where lower(au.email) = u.email)
  from dk_user_activations a
  join dk_users u on u.id = a.user_id
  join dk_organizations o on o.id = a.organization_id
  where a.token_hash = dk_hash_token(p_token);
$$;

create or replace function dk_accept_activation(p_token text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_act record;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_me uuid;
  v_slug text;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para activar tu usuario'; end if;

  select a.*, u.email as target_email, u.auth_user_id as target_auth, o.active as org_active into v_act
  from dk_user_activations a
  join dk_users u on u.id = a.user_id
  join dk_organizations o on o.id = a.organization_id
  where a.token_hash = dk_hash_token(p_token)
  for update of a;

  if not found then raise exception 'Enlace no válido'; end if;
  if v_act.used_at is not null then raise exception 'Este enlace ya fue usado'; end if;
  if v_act.revoked_at is not null then raise exception 'Este enlace fue reemplazado por uno nuevo'; end if;
  if v_act.expires_at < now() then raise exception 'Este enlace venció; pide uno nuevo'; end if;
  if not v_act.org_active then raise exception 'El negocio está desactivado'; end if;
  if v_email <> v_act.target_email then
    raise exception 'Este enlace es para %; entraste con otro correo', v_act.target_email;
  end if;

  perform set_config('dk.assignment_bypass', 'on', true);
  select id into v_me from dk_users where auth_user_id = auth.uid();

  if v_me is null then
    -- Primera vez en la plataforma: el perfil creado por el administrador pasa a ser suyo.
    update dk_users
    set auth_user_id = auth.uid(),
        full_name = coalesce(nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''), full_name)
    where id = v_act.user_id and auth_user_id is null;
    v_me := v_act.user_id;
  elsif v_me <> v_act.user_id then
    -- Ya tenía perfil (p. ej. trabaja en otro negocio): sus asignaciones nuevas pasan a ese perfil.
    insert into dk_organization_members (organization_id, user_id, is_super_admin, status, created_by)
    select organization_id, v_me, is_super_admin, 'pending', created_by from dk_organization_members where user_id = v_act.user_id
    on conflict (organization_id, user_id) do update set is_super_admin = dk_organization_members.is_super_admin or excluded.is_super_admin;
    insert into dk_kitchen_members (kitchen_id, user_id, default_role_id, active, invited_by)
    select kitchen_id, v_me, default_role_id, active, invited_by from dk_kitchen_members where user_id = v_act.user_id
    on conflict (kitchen_id, user_id) do nothing;
    insert into dk_member_roles (kitchen_id, user_id, role_id, assigned_by)
    select mr.kitchen_id, v_me, mr.role_id, mr.assigned_by from dk_member_roles mr where mr.user_id = v_act.user_id
    on conflict do nothing;
    update dk_user_activations set user_id = v_me where user_id = v_act.user_id;
    delete from dk_users where id = v_act.user_id and auth_user_id is null;
  end if;

  update dk_organization_members set status = 'active' where organization_id = v_act.organization_id and user_id = v_me;
  update dk_user_activations set used_at = now() where id = v_act.id;
  perform set_config('dk.assignment_bypass', 'off', true);

  select k.slug into v_slug
  from dk_kitchen_members m join dk_kitchens k on k.id = m.kitchen_id
  where m.user_id = v_me and k.organization_id = v_act.organization_id and m.active and k.active
  order by m.created_at limit 1;
  if v_slug is null then
    select k.slug into v_slug from dk_kitchens k where k.organization_id = v_act.organization_id and k.active order by k.created_at limit 1;
  end if;
  return v_slug;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Usuarios de la organización
-- ---------------------------------------------------------------------------

-- Super Admin (users.view): todos. Administrador de una Cuenta (team.view):
-- solo las personas de sus Cuentas, y solo esas asignaciones.
create or replace function dk_org_users(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_all boolean := dk_has_org_permission(p_organization_id, 'users.view');
  v_me uuid := dk_current_profile_id();
begin
  if not v_all and not exists (
    select 1 from dk_kitchens k where k.organization_id = p_organization_id and dk_has_kitchen_permission(k.id, 'team.view')
  ) then
    raise exception 'No autorizado para ver los usuarios de esta organización';
  end if;

  return coalesce((
    select jsonb_agg(x.u order by x.sort_status, x.name)
    from (
      select
        case om.status when 'active' then 0 when 'pending' then 1 else 2 end as sort_status,
        lower(u.full_name) as name,
        jsonb_build_object(
          'userId', u.id,
          'fullName', u.full_name,
          'email', coalesce(u.email, (select lower(a.email) from auth.users a where a.id = u.auth_user_id)),
          'avatarKey', u.avatar_key,
          'status', case when not u.active then 'disabled' else om.status end,
          'isSuperAdmin', om.is_super_admin,
          'isOwner', o.owner_user_id = u.id,
          'isMe', u.id = v_me,
          'activationExpiresAt', (select max(a.expires_at) from dk_user_activations a
                                  where a.organization_id = om.organization_id and a.user_id = u.id and a.used_at is null and a.revoked_at is null),
          'accounts', coalesce((
            select jsonb_agg(jsonb_build_object(
                'kitchenId', k.id, 'kitchenName', k.name, 'active', m.active,
                'defaultRoleId', m.default_role_id,
                'roleIds', (select coalesce(jsonb_agg(mr.role_id order by mr.assigned_at), '[]') from dk_member_roles mr where mr.kitchen_id = m.kitchen_id and mr.user_id = m.user_id))
              order by k.name)
            from dk_kitchen_members m join dk_kitchens k on k.id = m.kitchen_id
            where m.user_id = u.id and k.organization_id = om.organization_id
              and (v_all or dk_has_kitchen_permission(k.id, 'team.view'))
          ), '[]')
        ) as u
      from dk_organization_members om
      join dk_users u on u.id = om.user_id
      join dk_organizations o on o.id = om.organization_id
      where om.organization_id = p_organization_id
        and (v_all or exists (select 1 from dk_kitchen_members m join dk_kitchens k on k.id = m.kitchen_id
                              where m.user_id = u.id and k.organization_id = om.organization_id and dk_has_kitchen_permission(k.id, 'team.view')))
    ) x
  ), '[]');
end;
$$;

-- Activar/desactivar en la organización y nombrar/quitar Super Admin (solo Super Admin).
create or replace function dk_set_org_member(p_organization_id uuid, p_user_id uuid, p_active boolean default null, p_super_admin boolean default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not dk_has_org_permission(p_organization_id, 'users.manage') then
    raise exception 'Solo un Super Admin administra los usuarios de la organización';
  end if;
  if p_user_id = dk_current_profile_id() and not dk_is_superadmin() then
    raise exception 'No puedes cambiar tu propio acceso; pídeselo a otro Super Admin';
  end if;
  select status into v_status from dk_organization_members where organization_id = p_organization_id and user_id = p_user_id;
  if v_status is null then raise exception 'Esa persona no es parte de la organización'; end if;

  if p_active is not null then
    if p_active and v_status = 'pending' then raise exception 'Ese usuario se activa con su enlace de activación'; end if;
    update dk_organization_members set status = case when p_active then 'active' else 'disabled' end
    where organization_id = p_organization_id and user_id = p_user_id and status <> 'pending';
    if not p_active then
      update dk_user_activations set revoked_at = now()
      where organization_id = p_organization_id and user_id = p_user_id and used_at is null and revoked_at is null;
    end if;
  end if;
  if p_super_admin is not null then
    update dk_organization_members set is_super_admin = p_super_admin where organization_id = p_organization_id and user_id = p_user_id;
  end if;
end;
$$;

-- Quitar a alguien de la organización (y de todas sus Cuentas). Su historial se conserva.
create or replace function dk_remove_org_member(p_organization_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not dk_can_manage_org_user(p_organization_id, p_user_id) then raise exception 'No autorizado'; end if;
  if p_user_id = dk_current_profile_id() then raise exception 'No puedes quitarte a ti mismo'; end if;
  if exists (select 1 from dk_organizations where id = p_organization_id and owner_user_id = p_user_id) then
    raise exception 'El dueño no se puede quitar; transfiere la propiedad antes';
  end if;
  if not dk_has_org_permission(p_organization_id, 'users.manage')
     and exists (select 1 from dk_organization_members where organization_id = p_organization_id and user_id = p_user_id and status <> 'pending') then
    -- El Administrador de una Cuenta quita a la persona de sus Cuentas, no de toda la organización.
    delete from dk_kitchen_members m using dk_kitchens k
    where k.id = m.kitchen_id and k.organization_id = p_organization_id and m.user_id = p_user_id;
    return;
  end if;

  delete from dk_kitchen_members m using dk_kitchens k
  where k.id = m.kitchen_id and k.organization_id = p_organization_id and m.user_id = p_user_id;
  delete from dk_user_activations where organization_id = p_organization_id and user_id = p_user_id;
  delete from dk_organization_members where organization_id = p_organization_id and user_id = p_user_id;
  -- Un usuario creado aquí que nunca se activó y no pertenece a nada más desaparece.
  delete from dk_users u
  where u.id = p_user_id and u.auth_user_id is null
    and not exists (select 1 from dk_organization_members where user_id = u.id);
end;
$$;

-- Transferir la propiedad (dueño o plataforma). El dueño anterior sigue como Super Admin.
create or replace function dk_transfer_ownership(p_organization_id uuid, p_new_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not dk_has_org_permission(p_organization_id, 'organization.transfer') then
    raise exception 'Solo el dueño transfiere la propiedad';
  end if;
  if not exists (select 1 from dk_organization_members om join dk_users u on u.id = om.user_id and u.active and u.auth_user_id is not null
                 where om.organization_id = p_organization_id and om.user_id = p_new_owner_id and om.status = 'active') then
    raise exception 'El nuevo dueño debe ser un usuario activo de la organización';
  end if;
  if exists (select 1 from dk_organizations where owner_user_id = p_new_owner_id and id <> p_organization_id) then
    raise exception 'Esa persona ya es dueña de otra organización';
  end if;
  perform set_config('dk.org_transfer', 'on', true);
  update dk_organizations set owner_user_id = p_new_owner_id where id = p_organization_id;
  perform set_config('dk.org_transfer', 'off', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Permisos de ejecución
-- ---------------------------------------------------------------------------

revoke execute on function
  dk_can_manage_org_user(uuid, uuid), dk_new_activation(uuid, uuid),
  dk_create_user(uuid, text, text, boolean, jsonb), dk_resend_activation(uuid, uuid), dk_update_pending_user(uuid, uuid, text, text),
  dk_accept_activation(text), dk_org_users(uuid), dk_set_org_member(uuid, uuid, boolean, boolean),
  dk_remove_org_member(uuid, uuid), dk_transfer_ownership(uuid, uuid), dk_activation_preview(text)
from public, anon;
grant execute on function
  dk_can_manage_org_user(uuid, uuid),
  dk_create_user(uuid, text, text, boolean, jsonb), dk_resend_activation(uuid, uuid), dk_update_pending_user(uuid, uuid, text, text),
  dk_accept_activation(text), dk_org_users(uuid), dk_set_org_member(uuid, uuid, boolean, boolean),
  dk_remove_org_member(uuid, uuid), dk_transfer_ownership(uuid, uuid), dk_activation_preview(text)
to authenticated;
-- La vista previa del enlace se abre antes de tener sesión.
grant execute on function dk_activation_preview(text) to anon;
