-- ADR 0018: AI and voice settings belong to the organization.
--
--   * Only the organization (features.manage) writes feature settings, for
--     itself or as an exception for one account. Accounts no longer configure
--     AI (dk_set_kitchen_feature_settings no longer accepts account managers).
--   * "allow_account_override" goes away: an account exception, when the
--     organization sets one, always applies.
--   * Data: values every account of an organization shares move up to the
--     organization; values that differ stay as that account's exception.
--     The migration checks that no account's effective settings change.
--   * Reading (dk_my_features, dk_feature_effective_settings) keeps its shape,
--     so the kitchen and the AI Edge Function are unaffected.

-- ---------------------------------------------------------------------------
-- 0. What every account uses today
-- ---------------------------------------------------------------------------
create temp table _dk_effective_before on commit drop as
select k.id as kitchen_id, f.key as feature_key, dk_feature_effective_settings(k.id, f.key) as settings
from dk_kitchens k cross join dk_features f;

-- ---------------------------------------------------------------------------
-- 1. Stored account values the organization did not allow were ignored:
--    dropping them changes nothing. Then the flag itself goes.
-- ---------------------------------------------------------------------------
update dk_kitchen_features kf set settings = '{}'
from dk_kitchens k
where k.id = kf.kitchen_id and kf.settings <> '{}' and not dk_feature_override_allowed(k.organization_id, kf.feature_key);

update dk_organization_features set settings = settings - 'allow_account_override'
where settings ? 'allow_account_override';

create or replace function dk_feature_override_allowed(p_organization_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- ADR 0018: an account exception set by the organization always applies.
  select true;
$$;

-- ---------------------------------------------------------------------------
-- 2. Lift the values every account shares to the organization
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_key text;
  v_values integer;
  v_value jsonb;
begin
  for r in
    select distinct k.organization_id, kf.feature_key
    from dk_kitchen_features kf join dk_kitchens k on k.id = kf.kitchen_id
    where kf.settings <> '{}'
  loop
    for v_key in
      select distinct jsonb_object_keys(kf.settings)
      from dk_kitchen_features kf join dk_kitchens k on k.id = kf.kitchen_id
      where k.organization_id = r.organization_id and kf.feature_key = r.feature_key
    loop
      select count(distinct b.settings -> v_key), min((b.settings -> v_key)::text)::jsonb
      into v_values, v_value
      from _dk_effective_before b join dk_kitchens k on k.id = b.kitchen_id
      where k.organization_id = r.organization_id and b.feature_key = r.feature_key;

      if v_values = 1 and v_value is not null then
        insert into dk_organization_features (organization_id, feature_key, available, settings)
        values (r.organization_id, r.feature_key, (select default_available from dk_features where key = r.feature_key),
                jsonb_build_object(v_key, v_value))
        on conflict (organization_id, feature_key)
        do update set settings = dk_organization_features.settings || excluded.settings;

        update dk_kitchen_features kf set settings = kf.settings - v_key
        from dk_kitchens k
        where k.id = kf.kitchen_id and k.organization_id = r.organization_id and kf.feature_key = r.feature_key;
      end if;
    end loop;
  end loop;

  -- Account values equal to what the organization now gives are not exceptions.
  update dk_kitchen_features kf
  set settings = (
    select coalesce(jsonb_object_agg(e.key, e.value), '{}')
    from jsonb_each(kf.settings) e
    where dk_feature_inherited_settings(k.organization_id, kf.feature_key) -> e.key is distinct from e.value)
  from dk_kitchens k
  where k.id = kf.kitchen_id and kf.settings <> '{}';

  if exists (
    select 1 from _dk_effective_before b
    where dk_feature_effective_settings(b.kitchen_id, b.feature_key) is distinct from b.settings
  ) then
    raise exception 'ADR 0018: moving settings to the organization would change an account''s behaviour';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Writing: only the organization
-- ---------------------------------------------------------------------------
create or replace function dk_set_kitchen_feature_settings(p_kitchen_id uuid, p_key text, p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_feature dk_features;
  v_settings jsonb;
begin
  -- ADR 0018: an account exception, set by the organization. `{}` removes it.
  select organization_id into v_org from dk_kitchens where id = p_kitchen_id;
  if v_org is null then raise exception 'Cuenta no encontrada'; end if;
  if not dk_has_org_permission(v_org, 'features.manage') then
    raise exception 'La IA y la voz las configura la organización' using errcode = '42501';
  end if;
  select * into v_feature from dk_features where key = p_key;
  if not found then raise exception 'Función desconocida: %', p_key; end if;
  if not v_feature.active then raise exception 'La plataforma tiene apagada esta función'; end if;
  if p_settings is null then raise exception 'Faltan los parámetros'; end if;
  v_settings := dk_feature_clean_settings(p_key, p_settings);

  update dk_kitchen_features set settings = v_settings where kitchen_id = p_kitchen_id and feature_key = p_key;
  if not found then
    insert into dk_kitchen_features (kitchen_id, feature_key, enabled, settings, updated_by)
    values (p_kitchen_id, p_key, v_feature.default_enabled, v_settings, dk_current_profile_id());
  end if;
end;
$$;

create or replace function dk_set_org_feature_settings(p_organization_id uuid, p_key text, p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feature dk_features;
  v_settings jsonb;
begin
  if not dk_has_org_permission(p_organization_id, 'features.manage') then
    raise exception 'Solo el SUPER_ADMIN administra las funciones de la organización' using errcode = '42501';
  end if;
  select * into v_feature from dk_features where key = p_key;
  if not found then raise exception 'Función desconocida: %', p_key; end if;
  if not v_feature.active then raise exception 'La plataforma tiene apagada esta función'; end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then raise exception 'Parámetros inválidos'; end if;
  -- "allow_account_override" is ignored since ADR 0018 (older clients may still send it).
  v_settings := dk_feature_clean_settings(p_key, p_settings - 'allow_account_override');

  update dk_organization_features set settings = v_settings, updated_by = dk_current_profile_id(), updated_at = now()
  where organization_id = p_organization_id and feature_key = p_key;
  if not found then
    insert into dk_organization_features (organization_id, feature_key, available, settings)
    values (p_organization_id, p_key, v_feature.default_available, v_settings);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Reading: the account can no longer configure; the organization sees exceptions
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
      -- Activation and settings belong to the organization (ADR 0014, ADR 0018).
      'canManage', dk_has_org_permission(k.organization_id, 'features.manage'),
      'canConfigure', dk_has_org_permission(k.organization_id, 'features.manage'),
      'accountOverride', true,
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
          'accountOverride', true,
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
            where kf.kitchen_id = k.id and kf.settings <> '{}'),
          -- ADR 0018: the account exceptions themselves, so the organization can see and edit them.
          'overrides', (
            select coalesce(jsonb_object_agg(kf.feature_key, kf.settings), '{}') from dk_kitchen_features kf
            where kf.kitchen_id = k.id and kf.settings <> '{}'))
        order by k.name), '[]')
      from dk_kitchens k where k.organization_id = p_organization_id));
end;
$$;
