-- ADR 0014 (2/3): who activates what, and layered settings.
--
--   usable = platform.active ∧ plan ∧ organization.offers ∧ account.enabled ∧ use permission
--
--   * Activating a feature for an account is now an ORGANIZATION decision
--     (features.manage: the SUPER_ADMIN, or platform support). The account's
--     ADMIN/GERENTE keep the operational settings through
--     dk_set_kitchen_feature_settings, only when the feature is enabled and the
--     organization allows account customization.
--   * Settings are layered: platform defaults (dk_features.default_settings)
--     ← organization (dk_organization_features.settings) ← account
--     (dk_kitchen_features.settings, only if allow_account_override).
--   * A feature switched off by the platform is still listed (reason
--     'platform') so screens can explain it; its data is kept.

alter table dk_organization_features
  add column settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object');
comment on column dk_organization_features.settings is
  'ADR 0014: organization defaults for the feature (same keys as dk_features.default_settings) plus allow_account_override (boolean, default true).';

-- ---------------------------------------------------------------------------
-- Layered settings helpers
-- ---------------------------------------------------------------------------
create or replace function dk_feature_override_allowed(p_organization_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select (settings ->> 'allow_account_override')::boolean
    from dk_organization_features where organization_id = p_organization_id and feature_key = p_key
  ), true);
$$;

-- Platform ← organization (without the account layer).
create or replace function dk_feature_inherited_settings(p_organization_id uuid, p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select f.default_settings || coalesce((
      select ofe.settings - 'allow_account_override'
      from dk_organization_features ofe where ofe.organization_id = p_organization_id and ofe.feature_key = f.key
    ), '{}')
  from dk_features f where f.key = p_key;
$$;

-- Platform ← organization ← account (if allowed).
create or replace function dk_feature_effective_settings(p_kitchen_id uuid, p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select dk_feature_inherited_settings(k.organization_id, p_key)
         || case when dk_feature_override_allowed(k.organization_id, p_key)
                 then coalesce((select kf.settings from dk_kitchen_features kf where kf.kitchen_id = k.id and kf.feature_key = p_key), '{}')
                 else '{}' end
  from dk_kitchens k where k.id = p_kitchen_id;
$$;

-- Keeps only known keys with the default's type, then validates the ranges.
create or replace function dk_feature_clean_settings(p_key text, p_settings jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_defaults jsonb;
  v_clean jsonb;
  v_error text;
begin
  if p_settings is null then return null; end if;
  if jsonb_typeof(p_settings) <> 'object' then raise exception 'Parámetros inválidos'; end if;
  select default_settings into v_defaults from dk_features where key = p_key;
  select coalesce(jsonb_object_agg(s.key, s.value), '{}') into v_clean
  from jsonb_each(p_settings) s
  where v_defaults ? s.key and jsonb_typeof(s.value) = jsonb_typeof(v_defaults -> s.key);
  v_error := dk_feature_settings_error(p_key, v_clean);
  if v_error is not null then raise exception 'Parámetro inválido: %', v_error; end if;
  return v_clean;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading: what the active account sees
-- ---------------------------------------------------------------------------
create or replace function dk_my_features()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'key', f.key,
      'category', f.category,
      'label', f.label,
      'description', f.description,
      'usesModel', f.uses_model,
      'platformActive', f.active,
      'includedInPlan', dk_plan_includes(k.organization_id, f.key),
      'available', x.available,
      'enabled', x.enabled,
      'usable', x.available and x.enabled and dk_can(f.use_permission),
      -- Activation belongs to the organization (ADR 0014).
      'canManage', dk_has_org_permission(k.organization_id, 'features.manage'),
      -- Operational settings: account managers, only if the organization allows it.
      'canConfigure', dk_has_org_permission(k.organization_id, 'features.manage')
                      or (dk_can(f.manage_permission) and dk_feature_override_allowed(k.organization_id, f.key)),
      'accountOverride', dk_feature_override_allowed(k.organization_id, f.key),
      'settings', dk_feature_effective_settings(k.id, f.key),
      'inheritedSettings', dk_feature_inherited_settings(k.organization_id, f.key),
      'dependsOn', to_jsonb(f.depends_on),
      'updatedAt', kf.updated_at)
    order by f.sort_order), '[]')
  from dk_features f
  join dk_kitchens k on k.id = dk_current_kitchen_id()
  left join dk_kitchen_features kf on kf.kitchen_id = k.id and kf.feature_key = f.key
  cross join lateral (select dk_feature_available(k.organization_id, f.key) as available,
                             coalesce(kf.enabled, f.default_enabled) as enabled) x
  where dk_effective_role(k.id) is not null;
$$;

create or replace function dk_feature_state(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_feature dk_features;
  v_org uuid;
  v_row dk_kitchen_features;
  v_in_plan boolean;
  v_available boolean;
  v_enabled boolean;
  v_allowed boolean;
begin
  select * into v_feature from dk_features where key = p_key;
  if not found or v_kitchen is null then
    return jsonb_build_object('key', p_key, 'usable', false, 'reason', case when v_kitchen is null then 'account' else 'unknown' end);
  end if;
  select organization_id into v_org from dk_kitchens where id = v_kitchen;
  select * into v_row from dk_kitchen_features where kitchen_id = v_kitchen and feature_key = p_key;
  v_in_plan := dk_plan_includes(v_org, p_key);
  v_available := dk_feature_available(v_org, p_key);
  v_enabled := coalesce(v_row.enabled, v_feature.default_enabled);
  v_allowed := dk_can(v_feature.use_permission);
  return jsonb_build_object(
    'key', p_key,
    'platformActive', v_feature.active,
    'includedInPlan', v_in_plan,
    'available', v_available,
    'enabled', v_enabled,
    'usable', v_available and v_enabled and v_allowed,
    'reason', case when not v_feature.active then 'platform' when not v_in_plan then 'plan' when not v_available then 'organization'
                   when not v_enabled then 'account' when not v_allowed then 'permission' end,
    'settings', dk_feature_effective_settings(v_kitchen, p_key));
end;
$$;

-- ---------------------------------------------------------------------------
-- Writing
-- ---------------------------------------------------------------------------

-- Activation per account: organization (features.manage) or platform only.
create or replace function dk_set_kitchen_feature(p_kitchen_id uuid, p_key text, p_enabled boolean, p_settings jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_feature dk_features;
  v_settings jsonb;
  v_current boolean;
begin
  select organization_id into v_org from dk_kitchens where id = p_kitchen_id;
  if v_org is null then raise exception 'Cuenta no encontrada'; end if;
  select * into v_feature from dk_features where key = p_key;
  if not found then raise exception 'Función desconocida: %', p_key; end if;
  if not dk_has_org_permission(v_org, 'features.manage') then
    raise exception 'Solo el SUPER_ADMIN de la organización activa o desactiva funciones en una cuenta' using errcode = '42501';
  end if;
  if not v_feature.active then raise exception 'La plataforma tiene apagada esta función'; end if;
  if p_enabled is null then raise exception 'Indica si la función está activada'; end if;

  select coalesce((select enabled from dk_kitchen_features where kitchen_id = p_kitchen_id and feature_key = p_key), v_feature.default_enabled)
  into v_current;
  if p_enabled and not v_current and not dk_feature_available(v_org, p_key) then
    raise exception 'Tu organización no tiene disponible esta función';
  end if;
  v_settings := dk_feature_clean_settings(p_key, p_settings);

  update dk_kitchen_features
  set enabled = p_enabled, settings = coalesce(v_settings, settings)
  where kitchen_id = p_kitchen_id and feature_key = p_key;
  if not found then
    insert into dk_kitchen_features (kitchen_id, feature_key, enabled, settings, updated_by)
    values (p_kitchen_id, p_key, p_enabled, coalesce(v_settings, '{}'), dk_current_profile_id());
  end if;
end;
$$;

-- Operational settings of an account (replaces the account's own settings;
-- '{}' = back to the organization/platform values).
create or replace function dk_set_kitchen_feature_settings(p_kitchen_id uuid, p_key text, p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_feature dk_features;
  v_is_org_admin boolean;
  v_settings jsonb;
begin
  select organization_id into v_org from dk_kitchens where id = p_kitchen_id;
  if v_org is null then raise exception 'Cuenta no encontrada'; end if;
  select * into v_feature from dk_features where key = p_key;
  if not found then raise exception 'Función desconocida: %', p_key; end if;
  v_is_org_admin := dk_has_org_permission(v_org, 'features.manage');
  if not (v_is_org_admin or dk_has_kitchen_permission(p_kitchen_id, v_feature.manage_permission)) then
    raise exception 'No autorizado para cambiar esta función en la cuenta' using errcode = '42501';
  end if;
  if not v_feature.active then raise exception 'La plataforma tiene apagada esta función'; end if;
  if not v_is_org_admin then
    if not dk_feature_enabled(p_kitchen_id, p_key) then
      raise exception 'Esta función no está activa en la cuenta';
    end if;
    if not dk_feature_override_allowed(v_org, p_key) then
      raise exception 'Tu organización no permite personalizar esta función en cada cuenta';
    end if;
  end if;
  if p_settings is null then raise exception 'Faltan los parámetros'; end if;
  v_settings := dk_feature_clean_settings(p_key, p_settings);

  update dk_kitchen_features set settings = v_settings where kitchen_id = p_kitchen_id and feature_key = p_key;
  if not found then
    insert into dk_kitchen_features (kitchen_id, feature_key, enabled, settings, updated_by)
    values (p_kitchen_id, p_key, v_feature.default_enabled, v_settings, dk_current_profile_id());
  end if;
end;
$$;
revoke execute on function dk_set_kitchen_feature_settings(uuid, text, jsonb) from public, anon;
comment on function dk_set_kitchen_feature_settings is 'ADR 0014: operational settings of an account (no activation). Account managers only when enabled and allowed by the organization.';

create or replace function dk_set_org_feature(p_organization_id uuid, p_key text, p_available boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feature dk_features;
begin
  if not dk_has_org_permission(p_organization_id, 'features.manage') then
    raise exception 'Solo el SUPER_ADMIN administra las funciones de la organización' using errcode = '42501';
  end if;
  select * into v_feature from dk_features where key = p_key;
  if not found then raise exception 'Función desconocida: %', p_key; end if;
  if not v_feature.active then raise exception 'La plataforma tiene apagada esta función'; end if;
  if p_available is null then raise exception 'Indica si la función está disponible'; end if;
  if p_available and not dk_plan_includes(p_organization_id, p_key) then
    raise exception 'Tu plan no incluye esta función';
  end if;

  update dk_organization_features set available = p_available, updated_by = dk_current_profile_id(), updated_at = now()
  where organization_id = p_organization_id and feature_key = p_key and available is distinct from p_available;
  if not found and not exists (select 1 from dk_organization_features where organization_id = p_organization_id and feature_key = p_key) then
    insert into dk_organization_features (organization_id, feature_key, available) values (p_organization_id, p_key, p_available);
  end if;
end;
$$;

-- Organization defaults of a feature + allow_account_override.
create or replace function dk_set_org_feature_settings(p_organization_id uuid, p_key text, p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feature dk_features;
  v_settings jsonb;
  v_override jsonb;
begin
  if not dk_has_org_permission(p_organization_id, 'features.manage') then
    raise exception 'Solo el SUPER_ADMIN administra las funciones de la organización' using errcode = '42501';
  end if;
  select * into v_feature from dk_features where key = p_key;
  if not found then raise exception 'Función desconocida: %', p_key; end if;
  if not v_feature.active then raise exception 'La plataforma tiene apagada esta función'; end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then raise exception 'Parámetros inválidos'; end if;
  v_override := p_settings -> 'allow_account_override';
  if v_override is not null and jsonb_typeof(v_override) <> 'boolean' then
    raise exception 'Parámetro inválido: "allow_account_override" debe ser sí o no';
  end if;
  v_settings := dk_feature_clean_settings(p_key, p_settings - 'allow_account_override')
                || case when v_override is null then '{}' else jsonb_build_object('allow_account_override', v_override) end;

  update dk_organization_features set settings = v_settings, updated_by = dk_current_profile_id(), updated_at = now()
  where organization_id = p_organization_id and feature_key = p_key;
  if not found then
    insert into dk_organization_features (organization_id, feature_key, available, settings)
    values (p_organization_id, p_key, v_feature.default_available, v_settings);
  end if;
end;
$$;
revoke execute on function dk_set_org_feature_settings(uuid, text, jsonb) from public, anon;
comment on function dk_set_org_feature_settings is 'ADR 0014: organization defaults of a feature and whether each account may customize it (SUPER_ADMIN).';

-- ---------------------------------------------------------------------------
-- Organization matrix (with platform state and organization settings)
-- ---------------------------------------------------------------------------
create or replace function dk_org_feature_matrix(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not dk_has_org_permission(p_organization_id, 'features.manage') then
    raise exception 'Solo el SUPER_ADMIN administra las funciones de la organización' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'plan', (select jsonb_build_object('key', p.key, 'name', p.name)
             from dk_subscriptions s join dk_plans p on p.key = s.plan_key where s.organization_id = p_organization_id),
    'features', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'key', f.key, 'category', f.category, 'label', f.label, 'description', f.description, 'usesModel', f.uses_model,
          'platformActive', f.active,
          'includedInPlan', dk_plan_includes(p_organization_id, f.key),
          'minPlan', (select p.name from dk_plan_features pf join dk_plans p on p.key = pf.plan_key
                      where pf.feature_key = f.key and p.status = 'public' order by p.sort_order limit 1),
          'available', dk_feature_available(p_organization_id, f.key),
          'accountOverride', dk_feature_override_allowed(p_organization_id, f.key),
          'settings', dk_feature_inherited_settings(p_organization_id, f.key),
          'platformSettings', f.default_settings,
          'settingsSchema', f.settings_schema,
          'dependsOn', to_jsonb(f.depends_on))
        order by f.sort_order), '[]')
      from dk_features f),
    'accounts', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', k.id, 'name', k.name, 'slug', k.slug, 'iconKey', k.icon_key, 'active', k.active,
          'enabled', (
            select jsonb_object_agg(f.key, coalesce(kf.enabled, f.default_enabled))
            from dk_features f
            left join dk_kitchen_features kf on kf.kitchen_id = k.id and kf.feature_key = f.key),
          'customized', (
            select coalesce(jsonb_agg(kf.feature_key), '[]') from dk_kitchen_features kf
            where kf.kitchen_id = k.id and kf.settings <> '{}'))
        order by k.name), '[]')
      from dk_kitchens k where k.organization_id = p_organization_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Organization AI usage (no costs: those belong to the platform)
-- ---------------------------------------------------------------------------
create or replace function dk_org_ai_usage(p_organization_id uuid, p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_daily integer;
begin
  if not (dk_has_org_permission(p_organization_id, 'observability.view') or dk_has_org_permission(p_organization_id, 'features.manage')) then
    raise exception 'No autorizado para ver el uso de IA de esta organización' using errcode = '42501';
  end if;
  select coalesce((p.limits ->> 'ai_runs_per_day')::integer, 50) into v_daily
  from dk_subscriptions s join dk_plans p on p.key = s.plan_key where s.organization_id = p_organization_id;
  return (
    with runs as (
      select i.feature_key, i.status, i.created_at, k.id as kitchen_id, k.name as kitchen_name, k.icon_key
      from dk_ai_insights i join dk_kitchens k on k.id = i.kitchen_id
      where k.organization_id = p_organization_id and i.created_at > now() - make_interval(days => v_days) and i.status in ('ok', 'error')
    )
    select jsonb_build_object(
      'days', v_days,
      'dailyLimit', coalesce(v_daily, 50),
      'totals', (select jsonb_build_object('runs', count(*), 'errors', count(*) filter (where status = 'error'),
                   'runs24h', count(*) filter (where created_at > now() - interval '24 hours')) from runs),
      'byFeature', (select coalesce(jsonb_agg(x order by x.runs desc), '[]') from (
          select r.feature_key as key, (select label from dk_features where key = r.feature_key) as label,
                 count(*) as runs, count(*) filter (where status = 'error') as errors
          from runs r group by r.feature_key) x),
      'byAccount', (select coalesce(jsonb_agg(x order by x.runs desc), '[]') from (
          select kitchen_id as id, kitchen_name as name, icon_key as "iconKey", count(*) as runs,
                 count(*) filter (where status = 'error') as errors,
                 count(*) filter (where created_at > now() - interval '24 hours') as "runs24h"
          from runs group by kitchen_id, kitchen_name, icon_key) x)
    ));
end;
$$;
revoke execute on function dk_org_ai_usage(uuid, integer) from public, anon;
comment on function dk_org_ai_usage is 'ADR 0014: AI runs of an organization by account and feature (observability.view or features.manage).';
