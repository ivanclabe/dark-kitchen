-- ADR 0010, sección 3.3: el plan se aplica en la base.
--
-- 1. Funciones: usable = plan incluye ∧ organización ofrece ∧ Cuenta activa ∧
--    permiso (una sola fórmula, la de ADR 0009, con el plan como primer techo).
--    La organización no puede ofrecer lo que su plan no incluye.
-- 2. Cuentas: tope = max_accounts manual (plataforma) o el del plan.
-- 3. Usuarios: tope del plan para miembros activos y pendientes (alta o
--    reactivación), en una guardia de dk_organization_members.
-- 4. dk_create_organization (versión final): recibe el plan, el nombre y el
--    icono de la primera Cuenta; valida el plan (público, elegible en el
--    registro) y deja la suscripción en prueba, todo en la misma transacción.

-- ---------------------------------------------------------------------------
-- 1. Funciones
-- ---------------------------------------------------------------------------
create or replace function dk_feature_available(p_organization_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select f.active and dk_plan_includes(p_organization_id, f.key) and coalesce(ofe.available, f.default_available)
    from dk_features f
    left join dk_organization_features ofe on ofe.organization_id = p_organization_id and ofe.feature_key = f.key
    where f.key = p_key
  ), false);
$$;

create or replace function dk_feature_enabled(p_kitchen_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select dk_feature_available(k.organization_id, f.key) and coalesce(kf.enabled, f.default_enabled)
    from dk_features f
    join dk_kitchens k on k.id = p_kitchen_id
    left join dk_kitchen_features kf on kf.kitchen_id = k.id and kf.feature_key = f.key
    where f.key = p_key
  ), false);
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
  select * into v_feature from dk_features where key = p_key and active;
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
    'includedInPlan', v_in_plan,
    'available', v_available,
    'enabled', v_enabled,
    'usable', v_available and v_enabled and v_allowed,
    'reason', case when not v_in_plan then 'plan' when not v_available then 'organization' when not v_enabled then 'account' when not v_allowed then 'permission' end,
    'settings', v_feature.default_settings || coalesce(v_row.settings, '{}'));
end;
$$;

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
      'includedInPlan', dk_plan_includes(k.organization_id, f.key),
      'available', x.available,
      'enabled', coalesce(kf.enabled, f.default_enabled),
      'usable', x.available and coalesce(kf.enabled, f.default_enabled) and dk_can(f.use_permission),
      'canManage', dk_can(f.manage_permission) or dk_has_org_permission(k.organization_id, 'features.manage'),
      'settings', f.default_settings || coalesce(kf.settings, '{}'),
      'updatedAt', kf.updated_at)
    order by f.sort_order), '[]')
  from dk_features f
  join dk_kitchens k on k.id = dk_current_kitchen_id()
  left join dk_kitchen_features kf on kf.kitchen_id = k.id and kf.feature_key = f.key
  cross join lateral (select dk_feature_available(k.organization_id, f.key) as available) x
  where f.active and dk_effective_role(k.id) is not null;
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
    raise exception 'Solo el SUPER_ADMIN administra las funciones de la organización';
  end if;
  return jsonb_build_object(
    'plan', (select jsonb_build_object('key', p.key, 'name', p.name)
             from dk_subscriptions s join dk_plans p on p.key = s.plan_key where s.organization_id = p_organization_id),
    'features', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'key', f.key, 'category', f.category, 'label', f.label, 'description', f.description, 'usesModel', f.uses_model,
          'includedInPlan', dk_plan_includes(p_organization_id, f.key),
          -- Plan más económico que la incluye (para "Incluida en Business").
          'minPlan', (select p.name from dk_plan_features pf join dk_plans p on p.key = pf.plan_key
                      where pf.feature_key = f.key and p.status = 'public' order by p.sort_order limit 1),
          'available', dk_feature_available(p_organization_id, f.key))
        order by f.sort_order), '[]')
      from dk_features f where f.active),
    'accounts', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', k.id, 'name', k.name, 'slug', k.slug, 'iconKey', k.icon_key, 'active', k.active,
          'enabled', (
            select jsonb_object_agg(f.key, coalesce(kf.enabled, f.default_enabled))
            from dk_features f
            left join dk_kitchen_features kf on kf.kitchen_id = k.id and kf.feature_key = f.key
            where f.active))
        order by k.name), '[]')
      from dk_kitchens k where k.organization_id = p_organization_id));
end;
$$;

create or replace function dk_set_org_feature(p_organization_id uuid, p_key text, p_available boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not dk_has_org_permission(p_organization_id, 'features.manage') then
    raise exception 'Solo el SUPER_ADMIN administra las funciones de la organización';
  end if;
  if not exists (select 1 from dk_features where key = p_key and active) then
    raise exception 'Función desconocida: %', p_key;
  end if;
  if p_available is null then raise exception 'Indica si la función está disponible'; end if;
  if p_available and not dk_plan_includes(p_organization_id, p_key) then
    raise exception 'Tu plan no incluye esta función';
  end if;

  insert into dk_organization_features (organization_id, feature_key, available)
  values (p_organization_id, p_key, p_available)
  on conflict (organization_id, feature_key) do update
    set available = excluded.available, updated_by = dk_current_profile_id(), updated_at = now()
  where dk_organization_features.available is distinct from excluded.available;
end;
$$;

-- Compatibilidad (ADR 0009): el estado efectivo ahora también depende del plan.
create or replace view dk_ai_features with (security_invoker = true) as
  select kf.feature_key,
         kf.enabled and f.active and coalesce(ofe.available, f.default_available)
           and exists (select 1 from dk_subscriptions s join dk_plan_features pf on pf.plan_key = s.plan_key and pf.feature_key = kf.feature_key
                       where s.organization_id = k.organization_id) as enabled,
         f.default_settings || kf.settings as settings,
         kf.updated_by, kf.updated_at, kf.kitchen_id
  from dk_kitchen_features kf
  join dk_features f on f.key = kf.feature_key and f.category = 'ai'
  join dk_kitchens k on k.id = kf.kitchen_id
  left join dk_organization_features ofe on ofe.organization_id = k.organization_id and ofe.feature_key = kf.feature_key;

-- ---------------------------------------------------------------------------
-- 2. Tope de Cuentas
-- ---------------------------------------------------------------------------
create or replace function dk_create_kitchen(
  p_name text,
  p_slug text,
  p_timezone text default null,
  p_currency text default null,
  p_organization_id uuid default null,
  p_icon_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := coalesce(p_organization_id, dk_default_organization_id());
  v_org_row dk_organizations;
  v_me uuid := dk_current_profile_id();
  v_limit integer;
  v_kitchen_id uuid;
begin
  if v_org is null then raise exception 'Indica la organización de la nueva Cuenta'; end if;
  if not dk_has_org_permission(v_org, 'accounts.create') then
    raise exception 'No autorizado para crear Cuentas en esta organización';
  end if;
  select * into v_org_row from dk_organizations where id = v_org;
  -- Tope: el ajuste manual de la plataforma manda; si no hay, el del plan.
  v_limit := coalesce(v_org_row.max_accounts, dk_plan_limit(v_org, 'accounts'));
  if v_limit is not null and (select count(*) from dk_kitchens where organization_id = v_org) >= v_limit then
    raise exception 'Tu plan permite hasta % %. Para agregar más, cambia de plan.', v_limit, case when v_limit = 1 then 'cuenta' else 'cuentas' end;
  end if;

  insert into dk_kitchens (slug, name, timezone, currency, organization_id, created_by, icon_key)
  values (lower(btrim(p_slug)), btrim(p_name), coalesce(p_timezone, v_org_row.default_timezone), coalesce(p_currency, v_org_row.currency),
          v_org, v_me, nullif(btrim(coalesce(p_icon_key, '')), ''))
  returning id into v_kitchen_id;

  insert into dk_kitchen_sla_settings (kitchen_id) values (v_kitchen_id);
  insert into dk_kitchen_counters (kitchen_id, name, last_value) values (v_kitchen_id, 'order_number', 999);

  -- Herencia exclusiva del SUPER_ADMIN que crea la Cuenta (ADR 0009, 3.3).
  if v_me is not null and v_me = v_org_row.owner_user_id then
    insert into dk_kitchen_members (kitchen_id, user_id, default_role_id, active, invited_by)
    values (v_kitchen_id, v_me, (select id from dk_roles where is_system and key = 'ADMIN'), true, v_me);
  end if;

  return v_kitchen_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Tope de usuarios
-- ---------------------------------------------------------------------------
create or replace function dk_guard_org_member_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
begin
  -- Solo cuenta lo que ocupa un puesto: alta activa o pendiente, o reactivación.
  if new.status not in ('active', 'pending') then return new; end if;
  if tg_op = 'UPDATE' and old.status in ('active', 'pending') then return new; end if;

  v_limit := dk_plan_limit(new.organization_id, 'users');
  if v_limit is not null and (
      select count(*) from dk_organization_members
      where organization_id = new.organization_id and status in ('active', 'pending') and user_id <> new.user_id
    ) >= v_limit then
    raise exception 'Tu plan permite hasta % usuarios. Para agregar más, cambia de plan.', v_limit;
  end if;
  return new;
end;
$$;

create trigger dk_trg_org_members_plan_limit before insert or update of status on dk_organization_members
  for each row execute function dk_guard_org_member_limit();

-- ---------------------------------------------------------------------------
-- 4. Registro: organización + suscripción + SUPER_ADMIN + primera Cuenta + ADMIN
-- ---------------------------------------------------------------------------
drop function dk_create_organization(text, text, text, text, text, text, text, text, text, text);

create function dk_create_organization(
  p_name text,
  p_sector text,
  p_category text,
  p_address text default null,
  p_city text default null,
  p_country text default 'CO',
  p_phone text default null,
  p_tax_id text default null,
  p_legal_name text default null,
  p_full_name text default null,
  p_plan text default null,
  p_account_name text default null,
  p_account_icon text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth auth.users;
  v_profile uuid;
  v_org uuid;
  v_kitchen uuid;
  v_slug text;
  v_name text := btrim(coalesce(p_name, ''));
  v_account_name text;
  v_full_name text;
  v_timezone text;
  v_currency text;
  v_plan dk_plans;
  v_constraint text;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para crear tu negocio'; end if;
  select * into v_auth from auth.users where id = auth.uid();
  if v_auth.email_confirmed_at is null then
    raise exception 'Confirma tu correo antes de crear tu negocio';
  end if;

  select id into v_profile from dk_users where auth_user_id = auth.uid();

  -- Idempotente: quien ya es dueño de una organización vuelve a su primera Cuenta.
  if v_profile is not null then
    select k.slug into v_slug
    from dk_organizations o join dk_kitchens k on k.organization_id = o.id
    where o.owner_user_id = v_profile
    order by k.created_at limit 1;
    if v_slug is not null then return v_slug; end if;
    if exists (select 1 from dk_organizations where owner_user_id = v_profile) then
      raise exception 'Ya eres dueño de una organización';
    end if;
  end if;

  -- El plan llega desde el registro (metadatos que la persona puede editar): se valida aquí.
  select * into v_plan from dk_plans where key = p_plan and status = 'public' and self_serve;
  if not found then
    raise exception 'PLAN_NOT_AVAILABLE: el plan elegido no está disponible; elige otro plan';
  end if;

  if char_length(v_name) not between 2 and 80 then raise exception 'El nombre del negocio debe tener entre 2 y 80 caracteres'; end if;
  v_account_name := btrim(coalesce(nullif(btrim(p_account_name), ''), v_name));
  if char_length(v_account_name) not between 2 and 80 then raise exception 'El nombre de la cuenta debe tener entre 2 y 80 caracteres'; end if;

  v_full_name := btrim(coalesce(nullif(btrim(p_full_name), ''), v_auth.raw_user_meta_data ->> 'full_name', split_part(v_auth.email, '@', 1)));
  if char_length(v_full_name) < 2 then v_full_name := split_part(v_auth.email, '@', 1); end if;

  v_timezone := case upper(coalesce(p_country, 'CO'))
    when 'MX' then 'America/Mexico_City' when 'PE' then 'America/Lima' when 'EC' then 'America/Guayaquil'
    when 'CL' then 'America/Santiago' when 'AR' then 'America/Argentina/Buenos_Aires' when 'PA' then 'America/Panama'
    when 'VE' then 'America/Caracas' when 'US' then 'America/New_York' when 'ES' then 'Europe/Madrid'
    else 'America/Bogota' end;
  v_currency := case upper(coalesce(p_country, 'CO'))
    when 'MX' then 'MXN' when 'PE' then 'PEN' when 'CL' then 'CLP' when 'AR' then 'ARS' when 'ES' then 'EUR'
    when 'EC' then 'USD' when 'PA' then 'USD' when 'VE' then 'USD' when 'US' then 'USD'
    else 'COP' end;

  if v_profile is null then
    insert into dk_users (auth_user_id, full_name, active) values (auth.uid(), left(v_full_name, 80), true) returning id into v_profile;
  end if;

  -- La organización (los disparadores dejan al dueño como SUPER_ADMIN activo y
  -- crean su suscripción)…
  insert into dk_organizations (slug, name, address, city, country, sector, category, legal_name, tax_id, phone,
                                currency, default_timezone, owner_user_id, created_by)
  values (dk_unique_slug(dk_slugify(v_name), 'organizations'), v_name, nullif(btrim(p_address), ''), nullif(btrim(p_city), ''),
          upper(coalesce(p_country, 'CO')), nullif(p_sector, ''), nullif(p_category, ''), nullif(btrim(p_legal_name), ''),
          nullif(btrim(p_tax_id), ''), nullif(btrim(p_phone), ''), v_currency, v_timezone, v_profile, v_profile)
  returning id into v_org;

  -- …con el plan elegido (prueba gratis si el plan la tiene)…
  update dk_subscriptions
  set plan_key = v_plan.key,
      status = case when v_plan.trial_days > 0 then 'trialing' else 'active' end,
      billing_period = 'monthly',
      started_at = now(),
      current_period_start = now(),
      trial_ends_at = case when v_plan.trial_days > 0 then now() + make_interval(days => v_plan.trial_days) end,
      current_period_end = case when v_plan.trial_days > 0 then now() + make_interval(days => v_plan.trial_days) else now() + interval '1 month' end
  where organization_id = v_org;

  -- …y su primera Cuenta (el SUPER_ADMIN queda también como ADMIN, ADR 0009).
  v_slug := dk_unique_slug(dk_slugify(v_account_name), 'kitchens');
  v_kitchen := dk_create_kitchen(v_account_name, v_slug, v_timezone, v_currency, v_org, p_account_icon);
  update dk_kitchens
  set address = nullif(btrim(p_address), ''), phone = nullif(btrim(p_phone), ''),
      legal_name = nullif(btrim(p_legal_name), ''), tax_id = nullif(btrim(p_tax_id), '')
  where id = v_kitchen;
  update dk_users set last_account_id = v_kitchen where id = v_profile;

  return v_slug;
exception when check_violation then
  get stacked diagnostics v_constraint = constraint_name;
  if v_constraint = 'dk_kitchens_icon_key_check' then
    raise exception 'El icono de la cuenta no es válido';
  end if;
  raise exception 'Revisa el sector y la categoría del negocio';
end;
$$;

revoke all on function dk_create_organization(text, text, text, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function dk_create_organization(text, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
revoke execute on function dk_guard_org_member_limit() from public, anon, authenticated;

notify pgrst, 'reload schema';
