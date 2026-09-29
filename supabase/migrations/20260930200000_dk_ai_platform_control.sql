-- ADR 0014 (1/3): platform control of AI features.
--
--   * dk_ai_models: model catalog (provider, prices used only to ESTIMATE cost;
--     null until the platform enters them — no invented prices).
--   * dk_features gains model_key, min_interval_seconds and depends_on. The
--     existing `active` column becomes the platform-wide switch (it already
--     gated dk_feature_available); it now has a UI and RPCs.
--   * dk_ai_insights records tokens and latency from now on.
--   * Platform-only RPCs (dk_is_superadmin): overview, feature/model/plan-limit
--     changes, usage. Nothing here is writable through the Data API.
--   * Audit: platform tables are audited and get their own event types.

-- ---------------------------------------------------------------------------
-- Model catalog
-- ---------------------------------------------------------------------------
create table dk_ai_models (
  key text primary key check (length(key) between 3 and 80),
  provider text not null check (provider in ('anthropic')),
  label text not null check (length(label) between 2 and 80),
  input_price_per_mtok numeric(10, 4) check (input_price_per_mtok >= 0),
  output_price_per_mtok numeric(10, 4) check (output_price_per_mtok >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references dk_users(id) default dk_current_profile_id()
);
comment on table dk_ai_models is 'ADR 0014: AI models the platform allows. Prices (USD per million tokens) only feed cost estimates; null = unknown.';

alter table dk_ai_models enable row level security;
revoke insert, update, delete, truncate on dk_ai_models from anon, authenticated;
grant select on dk_ai_models to authenticated;
create policy dk_ai_models_select on dk_ai_models for select to authenticated using ((select dk_is_superadmin()));

create trigger dk_trg_ai_models_touch before update on dk_ai_models for each row execute function dk_touch_ai_feature();

insert into dk_ai_models (key, provider, label, sort_order) values
  ('claude-haiku-4-5-20251001', 'anthropic', 'Claude Haiku 4.5', 10),
  ('claude-sonnet-5-5', 'anthropic', 'Claude Sonnet 5.5', 20),
  ('claude-opus-5-5', 'anthropic', 'Claude Opus 5.5', 30);

-- ---------------------------------------------------------------------------
-- Feature catalog: model, minimum interval, dependencies
-- ---------------------------------------------------------------------------
alter table dk_features
  add column model_key text references dk_ai_models(key),
  add column min_interval_seconds integer check (min_interval_seconds between 30 and 86400),
  add column depends_on text[] not null default '{}',
  add constraint dk_features_model_only_with_model check (uses_model or model_key is null);

comment on column dk_features.active is 'ADR 0014: platform-wide switch. Off = no organization or account can use it; their settings are kept.';
comment on column dk_features.model_key is 'ADR 0014: model used by the Edge Function for this feature.';
comment on column dk_features.min_interval_seconds is 'ADR 0014: minimum seconds between model runs per account; null = plan limit (default 120).';
comment on column dk_features.depends_on is 'ADR 0014: features this one relies on (shown to admins; e.g. spoken alerts need voice_speech).';

-- H3: the supply model id did not match a current model; both now come from the catalog.
update dk_features set model_key = 'claude-haiku-4-5-20251001' where key = 'kitchen_insights';
update dk_features set model_key = 'claude-sonnet-5-5' where key in ('supply_reorder', 'supply_perishables', 'supply_slow_movers');
update dk_features set depends_on = '{voice_speech}' where key in ('kitchen_stall_alerts', 'kitchen_insights');

-- ---------------------------------------------------------------------------
-- Usage metering
-- ---------------------------------------------------------------------------
alter table dk_ai_insights
  add column input_tokens integer check (input_tokens >= 0),
  add column output_tokens integer check (output_tokens >= 0),
  add column latency_ms integer check (latency_ms >= 0);
comment on column dk_ai_insights.input_tokens is 'ADR 0014: tokens reported by the provider (null for runs before metering or without a model call).';

create index if not exists dk_ai_insights_created_idx on dk_ai_insights (created_at desc);

-- ---------------------------------------------------------------------------
-- Quota: per-feature interval + model to use
-- ---------------------------------------------------------------------------
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
  v_feature dk_features;
  v_interval integer;
  v_daily integer;
  v_last timestamptz;
  v_used integer;
  v_oldest timestamptz;
begin
  if v_kitchen is null or not dk_can_use_feature(p_feature_key) then
    return jsonb_build_object('allowed', false, 'reason', 'feature', 'retryAfterSeconds', null, 'remainingToday', 0);
  end if;
  select * into v_feature from dk_features where key = p_feature_key;
  select organization_id into v_org from dk_kitchens where id = v_kitchen;
  select p.limits into v_limits from dk_subscriptions s join dk_plans p on p.key = s.plan_key where s.organization_id = v_org;
  v_interval := coalesce(v_feature.min_interval_seconds, (v_limits ->> 'ai_min_interval_seconds')::integer, 120);
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

  return jsonb_build_object('allowed', true, 'reason', null, 'retryAfterSeconds', null, 'remainingToday', v_daily - v_used,
    'model', (select m.key from dk_ai_models m where m.key = v_feature.model_key and m.active));
end;
$$;

-- ---------------------------------------------------------------------------
-- Platform RPCs
-- ---------------------------------------------------------------------------
create or replace function dk_require_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not dk_is_superadmin() then
    raise exception 'Solo la administración de la plataforma puede hacer esto' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function dk_require_platform_admin() from public, anon;

-- Configuration problems of a feature, in plain language (empty = healthy).
create or replace function dk_feature_config_issues(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_feature dk_features;
  v_issues text[] := '{}';
  v_error text;
  v_dep text;
begin
  select * into v_feature from dk_features where key = p_key;
  if not found then return '[]'; end if;
  if v_feature.uses_model and v_feature.model_key is null then
    v_issues := v_issues || 'No tiene un modelo asignado';
  elsif v_feature.uses_model and not exists (select 1 from dk_ai_models where key = v_feature.model_key and active) then
    v_issues := v_issues || 'El modelo asignado está inactivo';
  end if;
  v_error := dk_feature_settings_error(p_key, v_feature.default_settings);
  if v_error is not null then v_issues := v_issues || format('Valor por defecto inválido: %s', v_error); end if;
  foreach v_dep in array v_feature.depends_on loop
    if v_feature.active and not coalesce((select active from dk_features where key = v_dep), false) then
      v_issues := v_issues || format('Depende de «%s», que está apagada', coalesce((select label from dk_features where key = v_dep), v_dep));
    end if;
  end loop;
  return to_jsonb(v_issues);
end;
$$;
revoke execute on function dk_feature_config_issues(text) from public, anon;

create or replace function dk_platform_ai_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform dk_require_platform_admin();
  return jsonb_build_object(
    'features', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'key', f.key, 'category', f.category, 'label', f.label, 'description', f.description,
          'active', f.active, 'usesModel', f.uses_model, 'modelKey', f.model_key,
          'minIntervalSeconds', f.min_interval_seconds, 'dependsOn', to_jsonb(f.depends_on),
          'defaultSettings', f.default_settings, 'settingsSchema', f.settings_schema,
          'plans', (select coalesce(jsonb_agg(pf.plan_key order by p.sort_order), '[]') from dk_plan_features pf join dk_plans p on p.key = pf.plan_key where pf.feature_key = f.key),
          'organizationsOffering', (select count(*) from dk_organizations o where dk_feature_available(o.id, f.key)),
          'organizationsTotal', (select count(*) from dk_organizations),
          'accountsEnabled', (select count(*) from dk_kitchens k where k.active and dk_feature_enabled(k.id, f.key)),
          'accountsTotal', (select count(*) from dk_kitchens k where k.active),
          'errors24h', (select count(*) from dk_ai_insights i where i.feature_key = f.key and i.status = 'error' and i.created_at > now() - interval '24 hours'),
          'lastError', (select jsonb_build_object('at', i.created_at, 'message', left(i.error, 300), 'account', k.name)
                        from dk_ai_insights i join dk_kitchens k on k.id = i.kitchen_id
                        where i.feature_key = f.key and i.status = 'error' and i.created_at > now() - interval '7 days'
                        order by i.created_at desc limit 1),
          'issues', dk_feature_config_issues(f.key))
        order by f.sort_order), '[]')
      from dk_features f),
    'models', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'key', m.key, 'provider', m.provider, 'label', m.label, 'active', m.active,
          'inputPricePerMTok', m.input_price_per_mtok, 'outputPricePerMTok', m.output_price_per_mtok,
          'usedBy', (select coalesce(jsonb_agg(f.key order by f.sort_order), '[]') from dk_features f where f.model_key = m.key))
        order by m.sort_order, m.key), '[]')
      from dk_ai_models m),
    'plans', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'key', p.key, 'name', p.name, 'status', p.status,
          'aiRunsPerDay', (p.limits ->> 'ai_runs_per_day')::integer,
          'aiMinIntervalSeconds', (p.limits ->> 'ai_min_interval_seconds')::integer)
        order by p.sort_order), '[]')
      from dk_plans p),
    'recentChanges', (
      select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'createdAt', a.created_at, 'summary', a.summary, 'eventType', a.event_type,
          'actor', (select full_name from dk_users u where u.id = a.changed_by))
        order by a.created_at desc), '[]')
      from (select * from dk_audit_log
            where organization_id is null and table_name in ('dk_features', 'dk_ai_models', 'dk_voice_profiles', 'dk_plans')
            order by created_at desc limit 15) a));
end;
$$;
revoke execute on function dk_platform_ai_overview() from public, anon;
comment on function dk_platform_ai_overview is 'ADR 0014: platform AI admin view (features, models, plan limits, recent platform changes). Platform admins only.';

-- Updates a feature at platform level. Null arguments leave the value as is;
-- p_min_interval_seconds = 0 clears it (back to the plan limit).
create or replace function dk_platform_set_feature(
  p_key text,
  p_active boolean default null,
  p_model_key text default null,
  p_min_interval_seconds integer default null,
  p_default_settings jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feature dk_features;
  v_settings jsonb;
  v_error text;
begin
  perform dk_require_platform_admin();
  select * into v_feature from dk_features where key = p_key;
  if not found then raise exception 'Función desconocida: %', p_key; end if;

  if p_model_key is not null then
    if not v_feature.uses_model then raise exception 'Esta función no usa un modelo de IA'; end if;
    if not exists (select 1 from dk_ai_models where key = p_model_key and active) then
      raise exception 'Modelo desconocido o inactivo: %', p_model_key;
    end if;
  end if;
  if p_min_interval_seconds is not null and p_min_interval_seconds <> 0 and p_min_interval_seconds not between 30 and 86400 then
    raise exception 'El intervalo mínimo debe estar entre 30 segundos y 24 horas';
  end if;

  if p_default_settings is not null then
    if jsonb_typeof(p_default_settings) <> 'object' then raise exception 'Parámetros inválidos'; end if;
    -- Only known keys with the same type; missing keys keep their current default.
    select v_feature.default_settings || coalesce(jsonb_object_agg(s.key, s.value), '{}') into v_settings
    from jsonb_each(p_default_settings) s
    where v_feature.default_settings ? s.key
      and jsonb_typeof(s.value) = jsonb_typeof(v_feature.default_settings -> s.key);
    v_error := dk_feature_settings_error(p_key, v_settings);
    if v_error is not null then raise exception 'Parámetro inválido: %', v_error; end if;
  end if;

  update dk_features set
    active = coalesce(p_active, active),
    model_key = coalesce(p_model_key, model_key),
    min_interval_seconds = case when p_min_interval_seconds is null then min_interval_seconds
                                when p_min_interval_seconds = 0 then null
                                else p_min_interval_seconds end,
    default_settings = coalesce(v_settings, default_settings)
  where key = p_key;
end;
$$;
revoke execute on function dk_platform_set_feature(text, boolean, text, integer, jsonb) from public, anon;

-- Creates or updates a model of the catalog.
create or replace function dk_platform_set_model(
  p_key text,
  p_label text,
  p_input_price_per_mtok numeric default null,
  p_output_price_per_mtok numeric default null,
  p_active boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform dk_require_platform_admin();
  if p_key is null or length(trim(p_key)) < 3 then raise exception 'Escribe el identificador del modelo'; end if;
  if p_label is null or length(trim(p_label)) < 2 then raise exception 'Escribe el nombre del modelo'; end if;
  if coalesce(p_input_price_per_mtok, 0) < 0 or coalesce(p_output_price_per_mtok, 0) < 0 then
    raise exception 'Los precios no pueden ser negativos';
  end if;
  if not coalesce(p_active, true) and exists (select 1 from dk_features where model_key = p_key) then
    raise exception 'Hay funciones que usan este modelo: asígnales otro antes de desactivarlo';
  end if;

  update dk_ai_models set label = trim(p_label), input_price_per_mtok = p_input_price_per_mtok,
    output_price_per_mtok = p_output_price_per_mtok, active = coalesce(p_active, true)
  where key = trim(p_key);
  if not found then
    insert into dk_ai_models (key, provider, label, input_price_per_mtok, output_price_per_mtok, active, sort_order)
    values (trim(p_key), 'anthropic', trim(p_label), p_input_price_per_mtok, p_output_price_per_mtok, coalesce(p_active, true),
            coalesce((select max(sort_order) from dk_ai_models), 0) + 10);
  end if;
end;
$$;
revoke execute on function dk_platform_set_model(text, text, numeric, numeric, boolean) from public, anon;

-- AI limits of a plan (daily runs per account, minimum interval).
create or replace function dk_platform_set_plan_ai_limits(p_plan_key text, p_ai_runs_per_day integer, p_ai_min_interval_seconds integer default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform dk_require_platform_admin();
  if not exists (select 1 from dk_plans where key = p_plan_key) then raise exception 'Plan desconocido: %', p_plan_key; end if;
  if p_ai_runs_per_day is null or p_ai_runs_per_day not between 0 and 100000 then
    raise exception 'Los análisis por día deben estar entre 0 y 100.000';
  end if;
  if p_ai_min_interval_seconds is not null and p_ai_min_interval_seconds not between 30 and 86400 then
    raise exception 'El intervalo mínimo debe estar entre 30 segundos y 24 horas';
  end if;
  update dk_plans
  set limits = case when p_ai_min_interval_seconds is null then (limits - 'ai_min_interval_seconds') else limits || jsonb_build_object('ai_min_interval_seconds', p_ai_min_interval_seconds) end
               || jsonb_build_object('ai_runs_per_day', p_ai_runs_per_day)
  where key = p_plan_key;
end;
$$;
revoke execute on function dk_platform_set_plan_ai_limits(text, integer, integer) from public, anon;

-- AI usage across the platform, rolling windows (no timezone ambiguity).
-- Cost is an ESTIMATE: only runs with tokens and a model with prices count.
create or replace function dk_platform_ai_usage(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 90);
begin
  perform dk_require_platform_admin();
  return (
    with runs as (
      select i.feature_key, i.status, i.created_at, i.input_tokens, i.output_tokens, i.latency_ms,
             k.id as kitchen_id, k.name as kitchen_name, o.id as organization_id, o.name as organization_name,
             case when i.input_tokens is not null and m.input_price_per_mtok is not null and m.output_price_per_mtok is not null
                  then (i.input_tokens * m.input_price_per_mtok + coalesce(i.output_tokens, 0) * m.output_price_per_mtok) / 1000000.0 end as cost
      from dk_ai_insights i
      join dk_kitchens k on k.id = i.kitchen_id
      join dk_organizations o on o.id = k.organization_id
      left join dk_ai_models m on m.key = i.model
      where i.created_at > now() - make_interval(days => v_days) and i.status in ('ok', 'error')
    )
    select jsonb_build_object(
      'days', v_days,
      'totals', (select jsonb_build_object(
          'runs', count(*), 'errors', count(*) filter (where status = 'error'),
          'runs24h', count(*) filter (where created_at > now() - interval '24 hours'),
          'meteredRuns', count(*) filter (where input_tokens is not null),
          'inputTokens', coalesce(sum(input_tokens), 0), 'outputTokens', coalesce(sum(output_tokens), 0),
          'estimatedCost', sum(cost), 'pricedRuns', count(cost),
          'avgLatencyMs', round(avg(latency_ms))) from runs),
      'meteringSince', (select min(created_at) from dk_ai_insights where input_tokens is not null),
      'byFeature', (select coalesce(jsonb_agg(x order by x.runs desc), '[]') from (
          select r.feature_key as key, (select label from dk_features where key = r.feature_key) as label,
                 count(*) as runs, count(*) filter (where status = 'error') as errors,
                 coalesce(sum(input_tokens), 0) + coalesce(sum(output_tokens), 0) as tokens, sum(cost) as "estimatedCost"
          from runs r group by r.feature_key) x),
      'byOrganization', (select coalesce(jsonb_agg(x order by x.runs desc), '[]') from (
          select organization_id as id, organization_name as name, count(*) as runs, count(*) filter (where status = 'error') as errors,
                 coalesce(sum(input_tokens), 0) + coalesce(sum(output_tokens), 0) as tokens, sum(cost) as "estimatedCost"
          from runs group by organization_id, organization_name order by count(*) desc limit 20) x),
      'byAccount', (select coalesce(jsonb_agg(x order by x.runs desc), '[]') from (
          select kitchen_id as id, kitchen_name as name, organization_name as organization, count(*) as runs,
                 count(*) filter (where status = 'error') as errors, sum(cost) as "estimatedCost"
          from runs group by kitchen_id, kitchen_name, organization_name order by count(*) desc limit 20) x),
      'byDay', (select coalesce(jsonb_agg(jsonb_build_object('date', d::date, 'runs', coalesce(c.runs, 0), 'errors', coalesce(c.errors, 0)) order by d), '[]')
          from generate_series(current_date - (v_days - 1), current_date, interval '1 day') d
          left join (select created_at::date as day, count(*) as runs, count(*) filter (where status = 'error') as errors from runs group by 1) c on c.day = d::date)
    ));
end;
$$;
revoke execute on function dk_platform_ai_usage(integer) from public, anon;
comment on function dk_platform_ai_usage is 'ADR 0014: AI usage of all organizations (runs, errors, tokens since metering, estimated cost only with model prices). byDay is in UTC.';

-- ---------------------------------------------------------------------------
-- Audit: platform tables + event types
-- ---------------------------------------------------------------------------
create trigger dk_trg_audit_features after insert or update or delete on dk_features for each row execute function dk_audit_row();
create trigger dk_trg_audit_ai_models after insert or update or delete on dk_ai_models for each row execute function dk_audit_row();
create trigger dk_trg_audit_plans after insert or update or delete on dk_plans for each row execute function dk_audit_row();

-- Runs after dk_trg_audit_log_classify (triggers fire in name order) and only
-- refines the events of ADR 0014; anything else is left untouched. Never raises.
create or replace function dk_audit_classify_ai()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := coalesce(new.new_data, '{}') || coalesce(new.context -> 'ref', '{}');
  v_key text;
  v_label text;
  v_account text;
  v_old_profile text;
  v_new_profile text;
begin
  if new.table_name = 'dk_features' then
    v_key := coalesce(v_row ->> 'key', new.record_key);
    select label into v_label from dk_features where key = v_key;
    v_label := coalesce(v_label, v_key);
    new.category := 'ai';
    new.context := new.context || jsonb_build_object('feature', v_key);
    if new.action = 'UPDATE' and new.new_data ? 'active' then
      new.event_type := 'feature.platform_changed';
      new.summary := format('%s %s en toda la plataforma', case when (new.new_data ->> 'active')::boolean then 'Encendió' else 'Apagó' end, v_label);
    elsif new.action = 'UPDATE' and new.new_data ? 'model_key' then
      new.event_type := 'ai.model_changed';
      new.summary := format('Cambió el modelo de %s: %s → %s', v_label, coalesce(new.old_data ->> 'model_key', '—'), new.new_data ->> 'model_key');
      new.context := new.context || jsonb_build_object('from', new.old_data ->> 'model_key', 'to', new.new_data ->> 'model_key');
    elsif new.action = 'UPDATE' then
      new.event_type := 'feature.platform_updated';
      new.summary := format('Cambió la configuración global de %s (%s)', v_label,
        (select string_agg(k, ', ' order by k) from jsonb_object_keys(new.new_data) k));
    end if;

  elsif new.table_name = 'dk_ai_models' then
    new.category := 'ai';
    new.event_type := 'ai.model_catalog_changed';
    new.summary := format('%s el modelo %s', case new.action when 'INSERT' then 'Agregó' when 'DELETE' then 'Eliminó' else 'Actualizó' end,
      coalesce(v_row ->> 'label', new.record_key));

  elsif new.table_name = 'dk_plans' and new.action = 'UPDATE' and new.new_data ? 'limits' then
    new.category := 'billing';
    new.event_type := 'plan.limits_changed';
    new.summary := format('Cambió los límites del plan %s', coalesce(v_row ->> 'name', new.record_key));

  elsif new.table_name = 'dk_voice_profiles' then
    new.category := 'features';
    new.event_type := 'voice.catalog_changed';
    new.summary := format('%s la voz %s del catálogo', case new.action when 'INSERT' then 'Agregó' when 'DELETE' then 'Eliminó' else 'Actualizó' end,
      coalesce(v_row ->> 'name', new.record_key));

  elsif new.table_name in ('dk_organization_features', 'dk_kitchen_features')
        and new.action in ('UPDATE', 'INSERT') and new.new_data ? 'settings'
        and v_row ->> 'feature_key' = 'voice_speech' then
    new.category := 'features';
    new.event_type := 'voice.settings_changed';
    select name into v_old_profile from dk_voice_profiles where key = new.old_data -> 'settings' ->> 'profile';
    select name into v_new_profile from dk_voice_profiles where key = new.new_data -> 'settings' ->> 'profile';
    if new.table_name = 'dk_kitchen_features' then
      select name into v_account from dk_kitchens where id = new.kitchen_id;
    end if;
    new.summary := format('Cambió la voz de cocina %s%s',
      case when v_account is null then 'de la organización' else 'de ' || v_account end,
      case when v_old_profile is distinct from v_new_profile and v_new_profile is not null
           then format(': %s → %s', coalesce(v_old_profile, 'por defecto'), v_new_profile) else '' end);
  end if;
  return new;
exception when others then
  return new;
end;
$$;

create trigger dk_trg_audit_log_classify_ai before insert on dk_audit_log for each row execute function dk_audit_classify_ai();
