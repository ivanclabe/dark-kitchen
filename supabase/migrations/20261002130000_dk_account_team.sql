-- ADR 0024 (phase 3): Usuarios inside the account.
--
--   dk_account_remove_member(user)  takes a person out of the ACTIVE account only
--                                   (an invitation left without accounts is cancelled).
--   dk_account_role_usage()         in how many of your accounts each role is used (D2),
--                                   a number only: nothing about the other accounts.

create or replace function dk_account_remove_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_org uuid;
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  select organization_id into v_org from dk_kitchens where id = v_kitchen;
  if not (dk_has_kitchen_permission(v_kitchen, 'team.manage') or dk_has_org_permission(v_org, 'users.manage')) then
    raise exception 'No autorizado para quitar personas de esta cuenta' using errcode = '42501';
  end if;
  if p_user_id = dk_current_profile_id() then raise exception 'No puedes quitarte a ti mismo'; end if;
  if exists (select 1 from dk_organization_members where organization_id = v_org and user_id = p_user_id and is_super_admin) then
    raise exception 'El SUPER_ADMIN tiene acceso a todas tus cuentas: no se quita de una';
  end if;

  delete from dk_kitchen_members where kitchen_id = v_kitchen and user_id = p_user_id;

  -- An invitation that no longer opens any account is cancelled (same cleanup as dk_remove_org_member).
  if exists (select 1 from dk_organization_members where organization_id = v_org and user_id = p_user_id and status = 'pending')
     and not exists (select 1 from dk_kitchen_members m join dk_kitchens k on k.id = m.kitchen_id
                     where k.organization_id = v_org and m.user_id = p_user_id) then
    delete from dk_user_activations where organization_id = v_org and user_id = p_user_id;
    delete from dk_organization_members where organization_id = v_org and user_id = p_user_id;
    delete from dk_users u
    where u.id = p_user_id and u.auth_user_id is null
      and not exists (select 1 from dk_organization_members where user_id = u.id);
  end if;
end;
$$;

create or replace function dk_account_role_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_org uuid;
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  select organization_id into v_org from dk_kitchens where id = v_kitchen;
  if not (dk_can('team.view') or dk_can('team.manage') or dk_has_org_permission(v_org, 'users.view') or dk_has_org_permission(v_org, 'roles.manage')) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'accountCount', (select count(*) from dk_kitchens where organization_id = v_org),
    'accountsByRole', coalesce((
      select jsonb_object_agg(x.role_id, x.n) from (
        select mr.role_id, count(distinct mr.kitchen_id) as n
        from dk_member_roles mr join dk_kitchens k on k.id = mr.kitchen_id
        where k.organization_id = v_org
        group by mr.role_id) x), '{}'));
end;
$$;

revoke all on function dk_account_remove_member(uuid) from public, anon;
revoke all on function dk_account_role_usage() from public, anon;
grant execute on function dk_account_remove_member(uuid) to authenticated;
grant execute on function dk_account_role_usage() to authenticated;
