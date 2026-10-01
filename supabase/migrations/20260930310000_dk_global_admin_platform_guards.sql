-- ADR 0019: the platform functions the Global Admin portal reuses (all
-- accounts, an organization's plan) require the Global Admin role AND a
-- second factor, like every dk_platform_* and dk_ga_* function.

create or replace function dk_admin_kitchens()
returns table (
  kitchen_id uuid, slug text, name text, active boolean, created_at timestamptz,
  members_active integer, admins integer, orders_30d integer, last_order_at timestamptz,
  organization_id uuid, organization_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform dk_require_global_admin();
  return query
  select k.id, k.slug, k.name, k.active, k.created_at,
    (select count(*)::int from dk_kitchen_members m where m.kitchen_id = k.id and m.active),
    -- Quien puede administrar la Cuenta: sus Super Admin + miembros con un rol que administra el equipo.
    (select count(*)::int from dk_organization_members om where om.organization_id = k.organization_id and om.is_super_admin and om.status = 'active')
      + (select count(distinct mr.user_id)::int from dk_member_roles mr join dk_kitchen_members m on m.kitchen_id = mr.kitchen_id and m.user_id = mr.user_id and m.active
         join dk_role_permissions rp on rp.role_id = mr.role_id and rp.permission_key = 'team.manage' where mr.kitchen_id = k.id),
    (select count(*)::int from dk_orders o where o.kitchen_id = k.id and o.created_at >= now() - interval '30 days'),
    (select max(o.created_at) from dk_orders o where o.kitchen_id = k.id),
    o.id, o.name
  from dk_kitchens k join dk_organizations o on o.id = k.organization_id
  order by o.name, k.name;
end;
$$;

create or replace function dk_set_subscription(p_organization_id uuid, p_plan_key text, p_status text default null, p_billing_period text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform dk_require_global_admin();
  if not exists (select 1 from dk_organizations where id = p_organization_id) then
    raise exception 'Organización no encontrada';
  end if;
  if not exists (select 1 from dk_plans where key = p_plan_key and status <> 'retired') then
    raise exception 'Plan no disponible: %', p_plan_key;
  end if;

  update dk_subscriptions
  set plan_key = p_plan_key,
      status = coalesce(p_status, status),
      billing_period = coalesce(p_billing_period, billing_period),
      trial_ends_at = case when coalesce(p_status, status) = 'trialing' then coalesce(trial_ends_at, now() + interval '14 days') else trial_ends_at end,
      canceled_at = case when p_status = 'canceled' then now() when p_status is not null then null else canceled_at end,
      current_period_start = case when p_plan_key is distinct from plan_key then now() else current_period_start end
  where organization_id = p_organization_id;
end;
$$;
