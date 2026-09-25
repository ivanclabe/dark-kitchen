-- Multi-Cocina — Fase 6: cierre (ADR 0007, sección 7 pasos 6–7 y fase 6).
--
-- 1. Se retira el rol GLOBAL heredado. Desde la Fase 1 el rol de una persona
--    es por Cocina (dk_kitchen_members); dk_users.role quedó solo por
--    compatibilidad. La columna se CONSERVA (no se borran datos) pero deja
--    de ser obligatoria y nada la lee ni la escribe. dk_current_role(), que
--    ya no usa ninguna política ni función, se elimina.
-- 2. Arranque de una instalación vacía: el primer perfil es el
--    SUPERUSUARIO (antes: "ADMIN" global). Luego crea las Cocinas.
-- 3. Fin del modo compatibilidad: sin encabezado x-dk-kitchen-id NO hay
--    Cocina activa (cero filas). Toda petición debe indicar su Cocina; la
--    app ya lo hace siempre y las integraciones (n8n) deben enviarlo
--    (docs/integrations/n8n-whatsapp-integration.md).

-- ---------------------------------------------------------------------------
-- 1. Rol global retirado
-- ---------------------------------------------------------------------------

-- dk_confirm_purchase conservaba una variable con el rol global que ya no se usa.
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.dk_confirm_purchase(uuid)'::regprocedure) into v_def;
  v_new := replace(v_def, E'  v_role dk_role;\n', '');
  v_new := replace(v_new, E'  v_role := dk_current_role();\n', '');
  if v_new = v_def or v_new like '%v_role%' then
    raise exception 'Fase 6: dk_confirm_purchase no tiene la forma esperada';
  end if;
  execute v_new;
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

  select * into v_profile from dk_users where auth_user_id = auth.uid();
  if not found then
    -- El rol vive solo en la membresía (dk_users.role, global, quedó retirado en la Fase 6).
    insert into dk_users (auth_user_id, full_name, active)
    values (
      auth.uid(),
      coalesce(nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''), split_part(v_inv.email, '@', 1)),
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

alter table dk_users alter column role drop not null;
alter table dk_users alter column role drop default;
comment on column dk_users.role is 'RETIRADO (Fase 6, ADR 0007): el rol es por Cocina en dk_kitchen_members. Se conserva solo como histórico.';

drop function dk_current_role();

-- ---------------------------------------------------------------------------
-- 2. Arranque: el primer perfil es el superusuario
-- ---------------------------------------------------------------------------

drop policy dk_users_insert on dk_users;
create policy dk_users_insert on dk_users for insert to authenticated
  with check (
    (select dk_is_superadmin())
    or (
      auth_user_id = (select auth.uid())
      and not dk_has_any_profile()
      and platform_role = 'SUPERADMIN'
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Sin encabezado, sin Cocina
-- ---------------------------------------------------------------------------

create or replace function dk_current_kitchen_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_header text;
  v_kitchen_id uuid;
begin
  begin
    v_header := nullif(current_setting('request.headers', true), '')::json ->> 'x-dk-kitchen-id';
  exception when others then
    v_header := null;
  end;

  -- Sin encabezado (o inválido) no hay Cocina activa: la RLS devuelve cero filas.
  if v_header is null or v_header !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  v_kitchen_id := v_header::uuid;

  if dk_is_superadmin() then
    return (select id from dk_kitchens where id = v_kitchen_id);
  end if;
  return (
    select m.kitchen_id
    from dk_kitchen_members m
    join dk_users u on u.id = m.user_id and u.active
    join dk_kitchens k on k.id = m.kitchen_id and k.active
    where m.kitchen_id = v_kitchen_id and m.active and u.auth_user_id = auth.uid()
  );
end;
$$;

comment on function dk_current_kitchen_id is 'Cocina activa de la petición: encabezado x-dk-kitchen-id validado contra la membresía (o superusuario). Sin encabezado válido: NULL (cero filas).';
