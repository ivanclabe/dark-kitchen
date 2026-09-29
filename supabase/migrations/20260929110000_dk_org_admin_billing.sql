-- ADR 0012, secciones 6, 7 y 12: facturación y equipos en el centro de
-- administración.
--
-- 1. Permiso de organización billing.view (SUPER_ADMIN). La suscripción y
--    dk_my_subscription lo exigen: los roles operativos ya no leen plan, uso
--    ni límites (antes bastaba organization.view). Siguen viendo qué pueden
--    usar vía dk_my_features.
-- 2. dk_invoices: estructura de facturas, VACÍA hasta que haya pagos (no se
--    inventan facturas). Lectura con billing.view; sin escrituras desde la API.
-- 3. dk_my_subscription suma la cuota de IA y su uso en 24 h.
-- 4. dk_org_users suma incorporación, último inicio de sesión y última
--    actividad (solo para quien administra usuarios de la organización).

insert into dk_permissions (key, module, action, scope, label, description, sort_order) values
  ('billing.view', 'billing', 'view', 'organization', 'Ver facturación',
   'Ver el plan, la suscripción, los límites, el uso y las facturas de la organización', 560);

-- ---------------------------------------------------------------------------
-- 1. Suscripción solo con billing.view
-- ---------------------------------------------------------------------------
alter policy dk_subscriptions_select on dk_subscriptions
  using ((select dk_has_org_permission(organization_id, 'billing.view')));

create or replace function dk_my_subscription(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sub dk_subscriptions;
  v_plan dk_plans;
begin
  if not dk_has_org_permission(p_organization_id, 'billing.view') then
    raise exception 'No autorizado para ver la facturación de esta organización';
  end if;
  select * into v_sub from dk_subscriptions where organization_id = p_organization_id;
  if not found then return null; end if;
  select * into v_plan from dk_plans where key = v_sub.plan_key;
  return jsonb_build_object(
    'plan', jsonb_build_object('key', v_plan.key, 'name', v_plan.name, 'description', v_plan.description,
                               'priceMonthly', v_plan.price_monthly, 'priceYearly', v_plan.price_yearly, 'currency', v_plan.currency,
                               'highlights', to_jsonb(v_plan.highlights), 'contactUrl',
                               (select contact_url from dk_plans where cta = 'contact_sales' and status = 'public' order by sort_order limit 1)),
    'status', v_sub.status,
    'isCurrent', dk_subscription_is_current(p_organization_id),
    'billingPeriod', v_sub.billing_period,
    'startedAt', v_sub.started_at,
    'trialEndsAt', v_sub.trial_ends_at,
    'currentPeriodStart', v_sub.current_period_start,
    'currentPeriodEnd', v_sub.current_period_end,
    'cancelAtPeriodEnd', v_sub.cancel_at_period_end,
    'canceledAt', v_sub.canceled_at,
    'paymentsEnabled', v_sub.provider is not null,
    'limits', jsonb_build_object('accounts', v_plan.limits -> 'accounts', 'users', v_plan.limits -> 'users',
                                 'aiRunsPerDay', coalesce(v_plan.limits -> 'ai_runs_per_day', '50'::jsonb)),
    'usage', jsonb_build_object(
      'accounts', (select count(*) from dk_kitchens where organization_id = p_organization_id),
      'users', (select count(*) from dk_organization_members where organization_id = p_organization_id and status in ('active', 'pending')),
      -- El tope de IA es por Cuenta: se informa el de la Cuenta que más usó en 24 h.
      'aiRunsMax24h', coalesce((select max(c) from (
          select count(*) c from dk_ai_insights i join dk_kitchens k on k.id = i.kitchen_id
          where k.organization_id = p_organization_id and i.status in ('ok', 'error') and i.created_at > now() - interval '24 hours'
          group by i.kitchen_id) x), 0)),
    'features', (select coalesce(jsonb_agg(pf.feature_key order by f.sort_order), '[]')
                 from dk_plan_features pf join dk_features f on f.key = pf.feature_key where pf.plan_key = v_plan.key));
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Facturas (estructura para cuando haya pagos)
-- ---------------------------------------------------------------------------
create table dk_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references dk_organizations(id) on delete restrict,
  subscription_id uuid references dk_subscriptions(id) on delete set null,
  number text not null,
  period_start timestamptz,
  period_end timestamptz,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'COP' check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in ('draft', 'open', 'paid', 'void', 'uncollectible')),
  issued_at timestamptz not null default now(),
  due_at timestamptz,
  paid_at timestamptz,
  provider text,
  provider_invoice_id text,
  pdf_url text,
  created_at timestamptz not null default now(),
  unique (organization_id, number)
);

comment on table dk_invoices is 'Facturas de la suscripción (ADR 0012). Vacía hasta integrar un proveedor de pagos: nunca se inventan. Retención indefinida (contable). Escritura solo del proveedor/plataforma.';

create index dk_invoices_org_issued_idx on dk_invoices (organization_id, issued_at desc);

alter table dk_invoices enable row level security;
create policy dk_invoices_select on dk_invoices for select to authenticated
  using ((select dk_has_org_permission(organization_id, 'billing.view')));
revoke insert, update, delete, truncate on dk_invoices from anon, authenticated;
revoke all on dk_invoices from anon;

create trigger dk_trg_audit_invoices after insert or update or delete on dk_invoices
  for each row execute function dk_audit_row();

-- ---------------------------------------------------------------------------
-- 4. Equipos: incorporación y actividad
-- ---------------------------------------------------------------------------
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
          'joinedAt', om.created_at,
          -- Actividad: solo para quien administra los usuarios de la organización.
          'lastSignInAt', case when v_all then (select a.last_sign_in_at from auth.users a where a.id = u.auth_user_id) end,
          'lastActivityAt', case when v_all then (select max(l.created_at) from dk_audit_log l
                                                  where l.changed_by = u.id and l.organization_id = p_organization_id) end,
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

notify pgrst, 'reload schema';
