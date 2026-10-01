-- ADR 0020: the team of the active account for Personal y Turnos — who can
-- get a shift and with which roles. MANAGER plans shifts (staff.manage) but
-- has no team.view, so this reads only what planning needs. Nothing copied.
create or replace function dk_staff_members()
returns table (user_id uuid, full_name text, avatar_key text, active boolean, default_role_id uuid, roles jsonb, rider_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (dk_can('staff.view') or dk_can('staff.manage')) then
    raise exception 'No autorizado: falta el permiso staff.view' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.full_name, u.avatar_key, (m.active and u.active), m.default_role_id,
           coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name) order by r.name)
                     from dk_roles r
                     where r.id in (select mr.role_id from dk_member_roles mr where mr.kitchen_id = m.kitchen_id and mr.user_id = m.user_id)
                        or r.id = m.default_role_id), '[]'::jsonb),
           (select dr.id from dk_delivery_riders dr where dr.kitchen_id = m.kitchen_id and dr.user_id = m.user_id limit 1)
    from dk_kitchen_members m
    join dk_users u on u.id = m.user_id
    where m.kitchen_id = dk_current_kitchen_id()
    order by u.full_name;
end;
$$;

revoke execute on function dk_staff_members() from public, anon;
grant execute on function dk_staff_members() to authenticated;
