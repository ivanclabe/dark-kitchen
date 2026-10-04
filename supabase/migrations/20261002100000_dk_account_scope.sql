-- ADR 0024: the Account is the only visible level. The administration that
-- lived in the organization center now lives inside the account, and it only
-- shows THAT account: an administrator of several accounts (or the owner)
-- working in A never sees B's people or activity.
--
--   dk_account_users()   members of the active account, with their roles in it.
--   dk_account_events()  activity log of the active account.
-- Nothing is dropped: dk_org_users / dk_org_events stay for compatibility.

create or replace function dk_account_users()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_org uuid;
  v_me uuid := dk_current_profile_id();
  v_activity boolean;
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  select organization_id into v_org from dk_kitchens where id = v_kitchen;
  if not (dk_can('team.view') or dk_can('team.manage') or dk_has_org_permission(v_org, 'users.view')) then
    raise exception 'No autorizado para ver el equipo de esta cuenta' using errcode = '42501';
  end if;
  v_activity := dk_has_org_permission(v_org, 'users.view') or dk_can('team.manage');

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
          'joinedAt', om.created_at,
          'lastSignInAt', case when v_activity then (select a.last_sign_in_at from auth.users a where a.id = u.auth_user_id) end,
          'lastActivityAt', case when v_activity then (select max(l.created_at) from dk_audit_log l where l.changed_by = u.id and l.kitchen_id = v_kitchen) end,
          'activationExpiresAt', (select max(a.expires_at) from dk_user_activations a
                                  where a.organization_id = om.organization_id and a.user_id = u.id and a.used_at is null and a.revoked_at is null),
          -- Only THIS account, never the person's other accounts.
          'accounts', coalesce((
            select jsonb_agg(jsonb_build_object(
                'kitchenId', k.id, 'kitchenName', k.name, 'active', m.active, 'defaultRoleId', m.default_role_id,
                'roleIds', (select coalesce(jsonb_agg(mr.role_id order by mr.assigned_at), '[]') from dk_member_roles mr where mr.kitchen_id = m.kitchen_id and mr.user_id = m.user_id)))
            from dk_kitchen_members m join dk_kitchens k on k.id = m.kitchen_id
            where m.user_id = u.id and m.kitchen_id = v_kitchen
          ), '[]')
        ) as u
      from dk_organization_members om
      join dk_users u on u.id = om.user_id
      join dk_organizations o on o.id = om.organization_id
      where om.organization_id = v_org
        -- Members of this account, plus whoever has full access to it (the owner / super admins).
        and (om.is_super_admin or exists (select 1 from dk_kitchen_members m where m.kitchen_id = v_kitchen and m.user_id = u.id))
    ) x
  ), '[]');
end;
$$;

create or replace function dk_account_events(
  p_category text default null,
  p_actor uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_search text default null,
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_org uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_rows jsonb;
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  select organization_id into v_org from dk_kitchens where id = v_kitchen;
  if not (dk_can('audit.view') or dk_has_org_permission(v_org, 'observability.view')) then
    raise exception 'No autorizado para ver la actividad de esta cuenta' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(e order by e ->> 'createdAt' desc, e ->> 'id' desc), '[]') into v_rows
  from (
    select jsonb_build_object(
      'id', a.id, 'createdAt', a.created_at, 'eventType', a.event_type, 'category', a.category, 'summary', a.summary,
      'result', a.result, 'source', a.source, 'action', a.action, 'table', a.table_name, 'recordKey', a.record_key,
      'context', a.context,
      'actor', case when u.id is null then null else jsonb_build_object('id', u.id, 'name', u.full_name, 'avatarKey', u.avatar_key) end,
      'account', case when k.id is null then null else jsonb_build_object('id', k.id, 'name', k.name, 'iconKey', k.icon_key) end,
      'changes', case when a.action = 'UPDATE' then (
          select jsonb_object_agg(c.key, jsonb_build_object('from', a.old_data -> c.key, 'to', c.value))
          from jsonb_each(a.new_data) c) end) as e
    from dk_audit_log a
    left join dk_users u on u.id = a.changed_by
    left join dk_kitchens k on k.id = a.kitchen_id
    where a.kitchen_id = v_kitchen
      and (p_category is null or a.category = p_category)
      and (p_actor is null or a.changed_by = p_actor)
      and (p_from is null or a.created_at >= p_from)
      and (p_to is null or a.created_at < p_to)
      and (p_search is null or a.summary ilike '%' || p_search || '%')
      and (p_before_at is null or (a.created_at, a.id) < (p_before_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by a.created_at desc, a.id desc
    limit v_limit + 1
  ) x;

  return jsonb_build_object(
    'events', (select coalesce(jsonb_agg(v order by ord), '[]') from jsonb_array_elements(v_rows) with ordinality t(v, ord) where ord <= v_limit),
    'hasMore', jsonb_array_length(v_rows) > v_limit);
end;
$$;

revoke execute on function dk_account_users(), dk_account_events(text, uuid, timestamptz, timestamptz, text, timestamptz, uuid, integer) from public, anon;
grant execute on function dk_account_users(), dk_account_events(text, uuid, timestamptz, timestamptz, text, timestamptz, uuid, integer) to authenticated;
