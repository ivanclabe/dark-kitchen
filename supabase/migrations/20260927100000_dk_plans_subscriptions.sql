-- ADR 0010: planes y suscripciones.
--
-- 1. dk_plans: catálogo central de planes (precio, periodicidad, límites,
--    viñetas, CTA, estado, orden). La landing, el registro y la organización
--    leen de aquí: un cambio de precio es un UPDATE, sin tocar la app.
-- 2. dk_plan_features: qué funciones (dk_features, ADR 0009) incluye cada plan.
-- 3. dk_subscriptions: UNA por organización (el plan es de la organización,
--    nunca del usuario). Estado, prueba, fechas, periodicidad y campos del
--    proveedor de pagos (vacíos: no hay cobros todavía).
-- 4. Toda organización tiene suscripción: al crearla nace en Standard (prueba)
--    y dk_create_organization la ajusta al plan elegido. Las existentes pasan a
--    Enterprise activo (D5).
-- 5. Lectura pública (sin sesión) solo de los catálogos: planes públicos,
--    funciones por plan y catálogo de funciones.
-- 6. RPC: dk_my_subscription (la ve la organización), dk_set_subscription
--    (solo la plataforma: upgrade, downgrade, cancelación) y
--    dk_subscription_is_current (lista para cuando se cobre; hoy no bloquea).

-- ---------------------------------------------------------------------------
-- 1. Catálogo de planes
-- ---------------------------------------------------------------------------
create table dk_plans (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  name text not null,
  description text not null,
  badge text,
  price_monthly numeric(12, 2) not null check (price_monthly >= 0),
  price_yearly numeric(12, 2) check (price_yearly >= 0),
  currency text not null default 'COP' check (currency ~ '^[A-Z]{3}$'),
  trial_days integer not null default 0 check (trial_days between 0 and 90),
  limits jsonb not null default '{}' check (jsonb_typeof(limits) = 'object'),
  highlights text[] not null default '{}',
  cta text not null check (cta in ('signup', 'contact_sales')),
  cta_label text not null,
  contact_url text,
  self_serve boolean not null default false,
  status text not null default 'public' check (status in ('public', 'hidden', 'retired')),
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cta <> 'contact_sales' or contact_url is not null),
  check (not self_serve or cta = 'signup')
);

comment on table dk_plans is 'Catálogo de planes (ADR 0010). Fuente única de precios, límites y CTA. limits: {"accounts": n|null, "users": n|null} (null = ilimitado).';
comment on column dk_plans.price_yearly is 'Precio anual; NULL = el plan no tiene facturación anual (la app oculta el selector si ningún plan la tiene).';
comment on column dk_plans.self_serve is 'Se puede elegir en el registro público. Enterprise es por ventas.';

create trigger dk_trg_plans_updated_at before update on dk_plans
  for each row execute function dk_set_updated_at();

create table dk_plan_features (
  plan_key text not null references dk_plans(key) on delete cascade,
  feature_key text not null references dk_features(key),
  primary key (plan_key, feature_key)
);

comment on table dk_plan_features is 'Funciones (dk_features) incluidas en cada plan. La organización solo puede ofrecer lo que su plan incluye.';

insert into dk_plans (key, name, description, badge, price_monthly, trial_days, limits, highlights, cta, cta_label, contact_url, self_serve, sort_order) values
  ('standard', 'Standard', 'Para un establecimiento que quiere ordenar su operación.', null, 49900, 14,
   '{"accounts": 1, "users": 5}',
   array['1 cuenta (establecimiento)', 'Hasta 5 usuarios', 'Pedidos, cocina, despacho, menús, inventario, clientes y reportes',
         'Comandos de voz y avisos hablados', 'Alertas de pedidos detenidos'],
   'signup', 'Comenzar gratis', null, true, 10),
  ('business', 'Business', 'Para negocios con varios establecimientos que quieren crecer con IA.', 'Más popular', 99900, 14,
   '{"accounts": 3, "users": 15}',
   array['Hasta 3 cuentas', 'Hasta 15 usuarios', 'Todo lo de Standard', 'IA: sugerencias de compra, perecederos y poco movimiento',
         'Sugerencias de Cocina en vivo con IA', 'Menús maestros compartidos entre cuentas'],
   'signup', 'Comenzar gratis', null, true, 20),
  ('enterprise', 'Enterprise', 'Para grupos y cadenas que necesitan escala, integraciones y acompañamiento.', null, 249900, 0,
   '{"accounts": null, "users": null}',
   array['Cuentas ilimitadas', 'Usuarios ilimitados', 'Todo lo de Business', 'Acompañamiento en la puesta en marcha',
         'Integraciones (pedidos por WhatsApp con n8n)', 'Soporte prioritario'],
   'contact_sales', 'Hablar con ventas', 'mailto:ventas@darkkitchen.co?subject=Plan%20Enterprise', false, 30);

insert into dk_plan_features (plan_key, feature_key) values
  ('standard', 'voice_commands'), ('standard', 'voice_speech'), ('standard', 'kitchen_stall_alerts');
insert into dk_plan_features (plan_key, feature_key)
  select 'business', key from dk_features where key in
    ('voice_commands', 'voice_speech', 'kitchen_stall_alerts', 'supply_reorder', 'supply_perishables', 'supply_slow_movers', 'kitchen_insights');
insert into dk_plan_features (plan_key, feature_key) select 'enterprise', key from dk_features;

alter table dk_plans enable row level security;
alter table dk_plan_features enable row level security;
create policy dk_plans_select on dk_plans for select to anon, authenticated using (status = 'public');
create policy dk_plan_features_select on dk_plan_features for select to anon, authenticated
  using (exists (select 1 from dk_plans p where p.key = plan_key and p.status = 'public'));

-- El catálogo de funciones también es público (la comparativa lo usa).
alter policy dk_features_select on dk_features to anon, authenticated;

revoke insert, update, delete, truncate on dk_plans, dk_plan_features, dk_features from anon, authenticated;
grant select on dk_plans, dk_plan_features, dk_features to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Suscripciones
-- ---------------------------------------------------------------------------
create table dk_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references dk_organizations(id) on delete cascade,
  plan_key text not null references dk_plans(key),
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  billing_period text not null default 'monthly' check (billing_period in ('monthly', 'annual')),
  started_at timestamptz not null default now(),
  trial_ends_at timestamptz,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'trialing' or trial_ends_at is not null)
);

comment on table dk_subscriptions is 'Suscripción de cada organización (ADR 0010). El plan es de la organización, no del usuario. provider_* quedan vacíos hasta integrar pagos. Escritura solo por RPC.';

create index dk_subscriptions_plan_idx on dk_subscriptions (plan_key);

create trigger dk_trg_subscriptions_updated_at before update on dk_subscriptions
  for each row execute function dk_set_updated_at();
create trigger dk_trg_audit_subscriptions after insert or update or delete on dk_subscriptions
  for each row execute function dk_audit_row();

alter table dk_subscriptions enable row level security;
create policy dk_subscriptions_select on dk_subscriptions for select to authenticated
  using ((select dk_has_org_permission(organization_id, 'organization.view')));
revoke insert, update, delete, truncate on dk_subscriptions from anon, authenticated;
revoke all on dk_subscriptions from anon;

-- Toda organización nace con suscripción (Standard en prueba); dk_create_organization
-- la ajusta al plan elegido en la misma transacción.
create or replace function dk_create_default_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan dk_plans;
begin
  select * into v_plan from dk_plans where key = 'standard';
  insert into dk_subscriptions (organization_id, plan_key, status, trial_ends_at, current_period_end)
  values (new.id, v_plan.key,
          case when v_plan.trial_days > 0 then 'trialing' else 'active' end,
          case when v_plan.trial_days > 0 then now() + make_interval(days => v_plan.trial_days) end,
          case when v_plan.trial_days > 0 then now() + make_interval(days => v_plan.trial_days) else now() + interval '1 month' end)
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

create trigger dk_trg_organizations_subscription after insert on dk_organizations
  for each row execute function dk_create_default_subscription();

-- Organizaciones existentes: Enterprise activo (D5).
insert into dk_subscriptions (organization_id, plan_key, status, current_period_end)
select o.id, 'enterprise', 'active', null from dk_organizations o
on conflict (organization_id) do nothing;

-- ---------------------------------------------------------------------------
-- Funciones del plan (internas; las usan otras funciones y guardias)
-- ---------------------------------------------------------------------------
create or replace function dk_plan_includes(p_organization_id uuid, p_feature_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from dk_subscriptions s
    join dk_plan_features pf on pf.plan_key = s.plan_key and pf.feature_key = p_feature_key
    where s.organization_id = p_organization_id
  );
$$;

-- Límite del plan ('accounts' | 'users'); NULL = ilimitado.
create or replace function dk_plan_limit(p_organization_id uuid, p_limit text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (p.limits ->> p_limit)::integer
  from dk_subscriptions s join dk_plans p on p.key = s.plan_key
  where s.organization_id = p_organization_id;
$$;

-- ¿La suscripción está vigente? (prueba sin vencer o activa). Hoy nada se
-- bloquea con esto (D2: no hay pagos); queda lista para cuando se cobre.
create or replace function dk_subscription_is_current(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case s.status
      when 'active' then true
      when 'trialing' then s.trial_ends_at > now()
      else false end
    from dk_subscriptions s where s.organization_id = p_organization_id
  ), false);
$$;

-- Plan, estado, fechas, límites y uso de la organización.
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
  if not dk_has_org_permission(p_organization_id, 'organization.view') then
    raise exception 'No autorizado';
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
    'currentPeriodEnd', v_sub.current_period_end,
    'cancelAtPeriodEnd', v_sub.cancel_at_period_end,
    'limits', jsonb_build_object('accounts', v_plan.limits -> 'accounts', 'users', v_plan.limits -> 'users'),
    'usage', jsonb_build_object(
      'accounts', (select count(*) from dk_kitchens where organization_id = p_organization_id),
      'users', (select count(*) from dk_organization_members where organization_id = p_organization_id and status in ('active', 'pending'))),
    'features', (select coalesce(jsonb_agg(pf.feature_key order by f.sort_order), '[]')
                 from dk_plan_features pf join dk_features f on f.key = pf.feature_key where pf.plan_key = v_plan.key));
end;
$$;

-- Cambiar plan o estado (solo plataforma): upgrade, downgrade, cancelación.
-- No borra nada: al bajar, lo que excede el límite se conserva pero no se
-- puede crear más, y las funciones no incluidas quedan apagadas (su
-- configuración por Cuenta se conserva, ADR 0009).
create or replace function dk_set_subscription(p_organization_id uuid, p_plan_key text, p_status text default null, p_billing_period text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not dk_is_superadmin() then
    raise exception 'Solo la plataforma cambia el plan de una organización';
  end if;
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

revoke execute on function dk_create_default_subscription(), dk_plan_includes(uuid, text), dk_plan_limit(uuid, text),
  dk_subscription_is_current(uuid), dk_my_subscription(uuid), dk_set_subscription(uuid, text, text, text) from public, anon;
revoke execute on function dk_create_default_subscription(), dk_plan_includes(uuid, text), dk_plan_limit(uuid, text) from authenticated;
grant execute on function dk_subscription_is_current(uuid), dk_my_subscription(uuid), dk_set_subscription(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
