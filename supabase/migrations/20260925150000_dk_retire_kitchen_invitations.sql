-- ADR 0008, Fase G: retiro de las invitaciones por Cocina (ADR 0007, Fase 5).
--
-- Las reemplaza "Crear usuario" con enlace de activación (dk_create_user /
-- dk_accept_activation, Fase E). La tabla estaba vacía; si tuviera filas,
-- esta migración se detiene para no perder invitaciones vigentes.

do $$
begin
  if exists (select 1 from dk_kitchen_invitations where accepted_at is null and revoked_at is null and expires_at > now()) then
    raise exception 'Fase G: hay invitaciones vigentes; conviértelas en usuarios pendientes antes de retirar la tabla';
  end if;
end $$;

-- Eliminar un rol propio: ahora solo importa si alguien lo tiene asignado.
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
  if exists (select 1 from dk_member_roles where role_id = p_role_id) then
    raise exception 'El rol está asignado a personas; cámbialas antes de eliminarlo';
  end if;
  delete from dk_roles where id = p_role_id;
end;
$$;

drop function dk_create_invitation(text, uuid);
drop function dk_accept_invitation(text);
drop function dk_revoke_invitation(uuid);
drop function dk_invitation_preview(text);
drop table dk_kitchen_invitations;
