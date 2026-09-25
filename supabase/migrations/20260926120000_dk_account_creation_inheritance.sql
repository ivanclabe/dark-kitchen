-- ADR 0009, sección 3.3: creación de Cuentas con icono y herencia
-- SUPER_ADMIN + ADMIN.
--
-- 1. dk_create_kitchen (versión final): recibe el icono y, SOLO si quien crea
--    es el SUPER_ADMIN (creador) de esa organización, le asigna ADMIN en la
--    Cuenta nueva (predeterminado). SUPER_ADMIN en la Cuenta es el rol
--    derivado de ser el creador (no asignable, ADR 0008 §19). Si crea otra
--    persona (hoy solo la plataforma en un negocio ajeno), no hay herencia.
--    El registro público pasa por aquí: la primera Cuenta también hereda.
-- 2. El SUPER_ADMIN puede editar sus propias asignaciones de Cuenta (ya tiene
--    todos los permisos: no hay escalamiento). Nadie más puede editar las
--    suyas, y un ADMIN de Cuenta (team.manage) no toca las del SUPER_ADMIN.
-- 3. Backfill: ADMIN para el SUPER_ADMIN en las Cuentas que él creó y aún no
--    lo tienen.

drop function dk_create_kitchen(text, text, text, text, uuid);

create function dk_create_kitchen(
  p_name text,
  p_slug text,
  p_timezone text default null,
  p_currency text default null,
  p_organization_id uuid default null,
  p_icon_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := coalesce(p_organization_id, dk_default_organization_id());
  v_org_row dk_organizations;
  v_me uuid := dk_current_profile_id();
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

  insert into dk_kitchens (slug, name, timezone, currency, organization_id, created_by, icon_key)
  values (lower(btrim(p_slug)), btrim(p_name), coalesce(p_timezone, v_org_row.default_timezone), coalesce(p_currency, v_org_row.currency),
          v_org, v_me, nullif(btrim(coalesce(p_icon_key, '')), ''))
  returning id into v_kitchen_id;

  -- Configuración inicial. Las funciones (IA, voz) usan los valores del catálogo.
  insert into dk_kitchen_sla_settings (kitchen_id) values (v_kitchen_id);
  insert into dk_kitchen_counters (kitchen_id, name, last_value) values (v_kitchen_id, 'order_number', 999);

  -- Herencia exclusiva del SUPER_ADMIN que crea la Cuenta: ADMIN (el disparador
  -- de membresías agrega el rol predeterminado a sus roles).
  if v_me is not null and v_me = v_org_row.owner_user_id then
    insert into dk_kitchen_members (kitchen_id, user_id, default_role_id, active, invited_by)
    values (v_kitchen_id, v_me, (select id from dk_roles where is_system and key = 'ADMIN'), true, v_me);
  end if;

  return v_kitchen_id;
end;
$$;

revoke all on function dk_create_kitchen(text, text, text, text, uuid, text) from public, anon;
grant execute on function dk_create_kitchen(text, text, text, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Asignaciones propias y del SUPER_ADMIN
-- ---------------------------------------------------------------------------
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
  if p_user_id = dk_current_profile_id() and not dk_is_org_super_admin(v_org) then
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

create or replace function dk_guard_kitchen_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_actor_super boolean;
begin
  select organization_id into v_org from dk_kitchens where id = coalesce(new.kitchen_id, old.kitchen_id);

  if auth.uid() is not null and coalesce(current_setting('dk.assignment_bypass', true), '') <> 'on' then
    v_actor_super := dk_is_org_super_admin(v_org);
    -- Las asignaciones del SUPER_ADMIN solo las cambia él (o la plataforma).
    if not v_actor_super
       and coalesce(new.user_id, old.user_id) = (select owner_user_id from dk_organizations where id = v_org)
       and (tg_op <> 'UPDATE' or new.active is distinct from old.active or new.default_role_id is distinct from old.default_role_id) then
      raise exception 'Solo el SUPER_ADMIN cambia sus propias asignaciones';
    end if;
    -- Nadie más cambia su propio acceso.
    if tg_op in ('UPDATE', 'DELETE') and not v_actor_super
       and coalesce(new.user_id, old.user_id) = dk_current_profile_id()
       and (tg_op = 'DELETE' or new.active is distinct from old.active or new.default_role_id is distinct from old.default_role_id) then
      raise exception 'No puedes cambiar tu propio acceso; pídeselo a otro administrador';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;

  if not exists (select 1 from dk_roles r where r.id = new.default_role_id and (r.organization_id is null or r.organization_id = v_org)) then
    raise exception 'El rol no pertenece a esta organización';
  end if;

  -- Entrar a una Cuenta hace Miembro de su organización. Solo si aún no lo es:
  -- un INSERT … ON CONFLICT dispararía igual la guardia del creador (que ya es
  -- miembro como SUPER_ADMIN) antes de resolver el conflicto.
  if not exists (select 1 from dk_organization_members where organization_id = v_org and user_id = new.user_id) then
    insert into dk_organization_members (organization_id, user_id, is_super_admin, status, created_by)
    values (v_org, new.user_id, false, 'active', dk_current_profile_id());
  end if;
  return new;
end;
$$;

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

  if coalesce(new.user_id, old.user_id) = (select owner_user_id from dk_organizations where id = v_org) then
    raise exception 'Solo el SUPER_ADMIN cambia sus propias asignaciones';
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

-- ---------------------------------------------------------------------------
-- 3. Backfill: ADMIN para el SUPER_ADMIN en las Cuentas que creó
-- ---------------------------------------------------------------------------
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id, active, invited_by)
select k.id, o.owner_user_id, (select id from dk_roles where is_system and key = 'ADMIN'), true, o.owner_user_id
from dk_kitchens k
join dk_organizations o on o.id = k.organization_id
where k.created_by = o.owner_user_id
  and not exists (select 1 from dk_kitchen_members m where m.kitchen_id = k.id and m.user_id = o.owner_user_id);

insert into dk_member_roles (kitchen_id, user_id, role_id, assigned_by)
select k.id, o.owner_user_id, r.id, o.owner_user_id
from dk_kitchens k
join dk_organizations o on o.id = k.organization_id
join dk_kitchen_members m on m.kitchen_id = k.id and m.user_id = o.owner_user_id and m.active
join dk_roles r on r.is_system and r.key = 'ADMIN'
where k.created_by = o.owner_user_id
  and not exists (select 1 from dk_member_roles mr where mr.kitchen_id = k.id and mr.user_id = o.owner_user_id and mr.role_id = r.id);

notify pgrst, 'reload schema';
