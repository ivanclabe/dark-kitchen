-- ADR 0011, H1 + H2 + H6: cuota de IA en el servidor, parámetros con esquema
-- en la base y retiro de la vista de compatibilidad.
--
-- 1. dk_features.settings_schema: tipo, mínimo y máximo de cada parámetro
--    (los mismos rangos que la app; una prueba de la app los compara). La RPC
--    y una guardia rechazan valores fuera de rango, también ante escritura
--    directa: una frecuencia 0 o negativa ya no anula la caché.
-- 2. Cuota de IA con modelo (D1), consultada por la Edge Function ANTES de
--    llamar al modelo:
--    - intervalo mínimo por Cuenta y función, también con "Analizar ahora"
--      (dk_plans.limits.ai_min_interval_seconds; si falta, 120 s);
--    - tope por Cuenta en 24 h móviles (dk_plans.limits.ai_runs_per_day; si
--      falta, 50: nunca ilimitado). Business 200, Enterprise 1000.
--    Cuentan los análisis 'ok' y 'error' (llamaron al modelo); 'empty' no.
-- 3. Se retira la vista dk_ai_features (ningún código la usa, D2).

-- ---------------------------------------------------------------------------
-- 1. Esquema de parámetros
-- ---------------------------------------------------------------------------
alter table dk_features add column settings_schema jsonb not null default '{}' check (jsonb_typeof(settings_schema) = 'object');
comment on column dk_features.settings_schema is 'Por parámetro: {"type": "number"|"boolean", "min": n, "max": n}. La base valida con esto; los textos (etiqueta, unidad, ayuda) están en la app.';

update dk_features set settings_schema = case key
  when 'supply_reorder' then '{"coverage_days": {"type": "number", "min": 1, "max": 90}, "frequency_min": {"type": "number", "min": 5, "max": 10080}}'
  when 'supply_perishables' then '{"warning_days": {"type": "number", "min": 0, "max": 30}, "frequency_min": {"type": "number", "min": 5, "max": 10080}}'
  when 'supply_slow_movers' then '{"slow_days": {"type": "number", "min": 3, "max": 365}, "overstock_days": {"type": "number", "min": 7, "max": 365}, "frequency_min": {"type": "number", "min": 5, "max": 10080}}'
  when 'kitchen_stall_alerts' then '{"dish_stall_min": {"type": "number", "min": 3, "max": 120}, "repeat_min": {"type": "number", "min": 1, "max": 60}, "voice": {"type": "boolean"}}'
  when 'kitchen_insights' then '{"frequency_min": {"type": "number", "min": 3, "max": 120}, "voice": {"type": "boolean"}}'
  else '{}' end::jsonb;

-- Primer problema de unos parámetros según el esquema de la función; NULL = válidos.
create or replace function dk_feature_settings_error(p_feature_key text, p_settings jsonb)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_schema jsonb;
  v_item record;
  v_rule jsonb;
  v_number numeric;
begin
  select settings_schema into v_schema from dk_features where key = p_feature_key;
  if v_schema is null or p_settings is null then return null; end if;
  for v_item in select key, value from jsonb_each(p_settings) loop
    v_rule := v_schema -> v_item.key;
    if v_rule is null then continue; end if; -- claves desconocidas: las descarta la RPC
    if v_rule ->> 'type' = 'number' then
      if jsonb_typeof(v_item.value) <> 'number' then return format('"%s" debe ser un número', v_item.key); end if;
      v_number := (v_item.value #>> '{}')::numeric;
      if v_rule ? 'min' and v_number < (v_rule ->> 'min')::numeric
         or v_rule ? 'max' and v_number > (v_rule ->> 'max')::numeric then
        return format('"%s" debe estar entre %s y %s', v_item.key, v_rule ->> 'min', v_rule ->> 'max');
      end if;
    elsif v_rule ->> 'type' = 'boolean' and jsonb_typeof(v_item.value) <> 'boolean' then
      return format('"%s" debe ser sí o no', v_item.key);
    end if;
  end loop;
  return null;
end;
$$;

-- Guardia: también ante escrituras que no pasen por la RPC. Se suma a la
-- guardia de disponibilidad existente (dk_guard_kitchen_feature).
create or replace function dk_guard_kitchen_feature_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_error text;
begin
  if tg_op = 'UPDATE' and new.settings is not distinct from old.settings then return new; end if;
  v_error := dk_feature_settings_error(new.feature_key, new.settings);
  if v_error is not null then raise exception 'Parámetro inválido: %', v_error; end if;
  return new;
end;
$$;

create trigger dk_trg_kitchen_features_settings before insert or update on dk_kitchen_features
  for each row execute function dk_guard_kitchen_feature_settings();

-- Filas guardadas fuera de rango (hoy ninguna): se ajustan al rango.
update dk_kitchen_features kf
set settings = (
  select jsonb_object_agg(s.key,
    case when f.settings_schema -> s.key ->> 'type' = 'number' and jsonb_typeof(s.value) = 'number' then
      to_jsonb(least(greatest((s.value #>> '{}')::numeric,
                              coalesce((f.settings_schema -> s.key ->> 'min')::numeric, (s.value #>> '{}')::numeric)),
                     coalesce((f.settings_schema -> s.key ->> 'max')::numeric, (s.value #>> '{}')::numeric)))
    else s.value end)
  from jsonb_each(kf.settings) s)
from dk_features f
where f.key = kf.feature_key and kf.settings <> '{}' and dk_feature_settings_error(kf.feature_key, kf.settings) is not null;

-- La RPC valida el rango con un mensaje claro (antes de guardar).
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
  v_error text;
begin
  select organization_id into v_org from dk_kitchens where id = p_kitchen_id;
  if v_org is null then raise exception 'Cuenta no encontrada'; end if;
  select * into v_feature from dk_features where key = p_key and active;
  if not found then raise exception 'Función desconocida: %', p_key; end if;
  if not (dk_has_org_permission(v_org, 'features.manage') or dk_has_kitchen_permission(p_kitchen_id, v_feature.manage_permission)) then
    raise exception 'No autorizado para cambiar esta función en la Cuenta';
  end if;
  if p_enabled is null then raise exception 'Indica si la función está activada'; end if;

  -- Activarla exige que el plan y la organización la ofrezcan; si ya estaba
  -- activada, se pueden ajustar sus parámetros.
  select coalesce((select enabled from dk_kitchen_features where kitchen_id = p_kitchen_id and feature_key = p_key), v_feature.default_enabled)
  into v_current;
  if p_enabled and not v_current and not dk_feature_available(v_org, p_key) then
    raise exception 'Tu organización no tiene disponible esta función';
  end if;

  if p_settings is not null then
    if jsonb_typeof(p_settings) <> 'object' then raise exception 'Parámetros inválidos'; end if;
    select coalesce(jsonb_object_agg(s.key, s.value), '{}') into v_settings
    from jsonb_each(p_settings) s
    where v_feature.default_settings ? s.key
      and jsonb_typeof(s.value) = jsonb_typeof(v_feature.default_settings -> s.key);
    v_error := dk_feature_settings_error(p_key, v_settings);
    if v_error is not null then raise exception 'Parámetro inválido: %', v_error; end if;
  end if;

  update dk_kitchen_features
  set enabled = p_enabled, settings = coalesce(v_settings, settings)
  where kitchen_id = p_kitchen_id and feature_key = p_key;
  if not found then
    insert into dk_kitchen_features (kitchen_id, feature_key, enabled, settings, updated_by)
    values (p_kitchen_id, p_key, p_enabled, coalesce(v_settings, '{}'), dk_current_profile_id());
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Cuota de IA
-- ---------------------------------------------------------------------------
update dk_plans set limits = limits || '{"ai_runs_per_day": 200}' where key = 'business';
update dk_plans set limits = limits || '{"ai_runs_per_day": 1000}' where key = 'enterprise';

-- ¿Puede la Cuenta actual llamar al modelo para esta función ahora?
-- {allowed, reason: 'feature'|'interval'|'daily'|null, retryAfterSeconds, remainingToday}
create or replace function dk_ai_run_allowed(p_feature_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_org uuid;
  v_limits jsonb;
  v_interval integer;
  v_daily integer;
  v_last timestamptz;
  v_used integer;
  v_oldest timestamptz;
begin
  if v_kitchen is null or not dk_can_use_feature(p_feature_key) then
    return jsonb_build_object('allowed', false, 'reason', 'feature', 'retryAfterSeconds', null, 'remainingToday', 0);
  end if;
  select organization_id into v_org from dk_kitchens where id = v_kitchen;
  select p.limits into v_limits from dk_subscriptions s join dk_plans p on p.key = s.plan_key where s.organization_id = v_org;
  v_interval := coalesce((v_limits ->> 'ai_min_interval_seconds')::integer, 120);
  v_daily := coalesce((v_limits ->> 'ai_runs_per_day')::integer, 50);

  select max(created_at) into v_last from dk_ai_insights
  where kitchen_id = v_kitchen and feature_key = p_feature_key and status in ('ok', 'error');
  if v_last is not null and v_last > now() - make_interval(secs => v_interval) then
    return jsonb_build_object('allowed', false, 'reason', 'interval',
      'retryAfterSeconds', ceil(extract(epoch from (v_last + make_interval(secs => v_interval)) - now()))::integer,
      'remainingToday', null);
  end if;

  select count(*), min(created_at) into v_used, v_oldest from dk_ai_insights
  where kitchen_id = v_kitchen and status in ('ok', 'error') and created_at > now() - interval '24 hours';
  if v_used >= v_daily then
    return jsonb_build_object('allowed', false, 'reason', 'daily',
      'retryAfterSeconds', ceil(extract(epoch from (v_oldest + interval '24 hours') - now()))::integer,
      'remainingToday', 0);
  end if;

  return jsonb_build_object('allowed', true, 'reason', null, 'retryAfterSeconds', null, 'remainingToday', v_daily - v_used);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Retiro de la vista de compatibilidad (ADR 0009)
-- ---------------------------------------------------------------------------
drop view dk_ai_features;

revoke execute on function dk_feature_settings_error(text, jsonb), dk_guard_kitchen_feature_settings(), dk_ai_run_allowed(text) from public, anon;
revoke execute on function dk_feature_settings_error(text, jsonb), dk_guard_kitchen_feature_settings() from authenticated;
grant execute on function dk_ai_run_allowed(text) to authenticated;

notify pgrst, 'reload schema';
