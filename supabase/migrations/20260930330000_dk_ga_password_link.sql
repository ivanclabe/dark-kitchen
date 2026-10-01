-- ADR 0019: "Enlace para crear contraseña" in the Global Admin portal. The
-- portal shares a one-time link by hand (WhatsApp…) instead of an e-mail;
-- the person sets their OWN password. This function decides which link:
--   * activation: the person still has a pending activation (never activated)
--     → a fresh activation token; the link opens /activar/{token}.
--   * reset: the person already has a login → a recovery link to
--     /set-password.
-- Global Admins are excluded (no login links for another platform admin).
create or replace function dk_ga_password_link_target(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user dk_users;
  v_pending record;
  v_has_login boolean;
  v_token text;
begin
  perform dk_require_global_admin();
  select * into v_user from dk_users where id = p_user_id;
  if not found then raise exception 'Usuario no encontrado'; end if;
  if not v_user.active then raise exception 'Ese usuario está desactivado'; end if;
  if v_user.email is null then raise exception 'Ese usuario no tiene correo'; end if;
  if v_user.platform_role = 'SUPERADMIN' then raise exception 'No se generan enlaces de acceso para un Global Admin'; end if;

  -- Pending: an organization where the person has activation links but never used one.
  select a.organization_id, null::timestamptz as used_at into v_pending
  from dk_user_activations a
  where a.user_id = v_user.id
    and not exists (select 1 from dk_user_activations u where u.user_id = a.user_id and u.organization_id = a.organization_id and u.used_at is not null)
  order by a.created_at desc limit 1;
  v_has_login := v_user.auth_user_id is not null or exists (select 1 from auth.users au where lower(au.email) = lower(v_user.email));

  if v_pending.organization_id is not null then
    if not exists (select 1 from dk_organizations where id = v_pending.organization_id and active) then
      raise exception 'La organización de este usuario está desactivada';
    end if;
    v_token := dk_new_activation(v_pending.organization_id, v_user.id);
  elsif not v_has_login then
    raise exception 'Este usuario todavía no tiene acceso: reenvía su invitación';
  end if;

  perform dk_log_event('global_admin.password_link_created',
    format('Enlace para crear contraseña generado para %s', v_user.email),
    v_pending.organization_id, null, 'success', 'global_admin',
    jsonb_build_object('email', v_user.email, 'mode', case when v_token is null then 'reset' else 'activation' end), null, v_user.id::text);

  return jsonb_build_object('email', v_user.email, 'name', v_user.full_name,
    'mode', case when v_token is null then 'reset' else 'activation' end,
    'organizationId', v_pending.organization_id, 'token', v_token, 'hasLogin', v_has_login);
end;
$$;

revoke execute on function dk_ga_password_link_target(uuid) from public, anon;
grant execute on function dk_ga_password_link_target(uuid) to authenticated;
