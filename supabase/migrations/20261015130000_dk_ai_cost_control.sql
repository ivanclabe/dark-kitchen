-- ADR 0063, fase 1: la IA bajo control.
--
-- 1. Huella de la entrada (input_hash) y llamadas evitadas (dk_ai_cache_hits): un análisis con
--    los mismos datos que el último no vuelve a llamar al modelo.
-- 2. Medición completa: tokens de caché aparte, la consulta cancelada guarda sus tokens, y cuenta
--    toda corrida que llamó al modelo (también 'empty' con tokens y 'cancelled').
-- 3. Cancelación de Copilot: se PIDE (cancel_requested_at); la corrida se detiene en la ronda
--    siguiente y se cierra con sus tokens.
-- 4. Presupuesto mensual por cuenta (función general 'ai_budget'): al llegarlo, las funciones
--    automáticas se pausan; lo que una persona pide sigue hasta el tope del plan.
-- 5. Ajustes nuevos: Copilot (voz y seguimiento) y Lectura de facturas (leer al soltar).
-- 6. Asistente de Consumer: interruptor y modelo de plataforma, y medición de tokens.
-- 7. Costo del mes y todos los topes visibles para la cuenta (dk_account_ai_cost).
-- 8. Limpieza programada: corridas colgadas y análisis vacíos viejos.

-- ---------------------------------------------------------------------------
-- 1–3. Columnas de medición
-- ---------------------------------------------------------------------------
alter table dk_ai_insights
  add column input_hash text,
  add column cache_read_tokens integer check (cache_read_tokens >= 0),
  add column cache_write_tokens integer check (cache_write_tokens >= 0),
  add column cancel_requested_at timestamptz;

comment on column dk_ai_insights.input_hash is 'Huella de los datos que vio el modelo (ADR 0063): con la misma huella se reutiliza el análisis.';
comment on column dk_ai_insights.input_tokens is 'Tokens de entrada SIN caché (los de caché van en cache_read_tokens / cache_write_tokens).';

create index dk_ai_insights_hash_idx on dk_ai_insights (kitchen_id, feature_key, input_hash, created_at desc) where input_hash is not null;

-- Did this run reach the model (and so count and cost)? 'empty' only when it carries tokens (a document
-- that was not an invoice); the analyses' 'empty' rows never called the model.
create or replace function dk_ai_run_billed(p_status text, p_input_tokens integer)
returns boolean
language sql
immutable
as $$
  select p_status in ('ok', 'error', 'running', 'cancelled') or (p_status = 'empty' and p_input_tokens is not null)
$$;

-- Estimated cost of a run in USD (null when the model has no prices). Cache reads cost 10 % of the
-- input price and cache writes 125 % (Anthropic's prompt caching).
create or replace function dk_ai_run_cost(p_model text, p_input integer, p_output integer, p_cache_read integer, p_cache_write integer)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select (coalesce(p_input, 0) * m.input_price_per_mtok
          + coalesce(p_output, 0) * m.output_price_per_mtok
          + coalesce(p_cache_read, 0) * m.input_price_per_mtok * 0.1
          + coalesce(p_cache_write, 0) * m.input_price_per_mtok * 1.25) / 1000000.0
  from dk_ai_models m
  where m.key = p_model and m.input_price_per_mtok is not null and m.output_price_per_mtok is not null
$$;

-- Calls the cache avoided, per account, function and day (a counter, not a row per hit).
create table dk_ai_cache_hits (
  kitchen_id uuid not null references dk_kitchens (id) on delete cascade,
  feature_key text not null references dk_features (key),
  day date not null,
  hits integer not null default 0 check (hits >= 0),
  primary key (kitchen_id, feature_key, day)
);
alter table dk_ai_cache_hits enable row level security;
revoke all on dk_ai_cache_hits from anon, authenticated;

create or replace function dk_ai_cache_hit(p_feature_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
begin
  if v_kitchen is null or not dk_can_use_feature(p_feature_key) then return; end if;
  insert into dk_ai_cache_hits (kitchen_id, feature_key, day, hits) values (v_kitchen, p_feature_key, current_date, 1)
  on conflict (kitchen_id, feature_key, day) do update set hits = dk_ai_cache_hits.hits + 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Presupuesto mensual por cuenta
-- ---------------------------------------------------------------------------
insert into dk_features (key, category, label, description, use_permission, manage_permission, default_available, default_enabled,
                         default_settings, settings_schema, uses_model, sort_order)
values ('ai_budget', 'general', 'Presupuesto de IA',
        'Un límite mensual de IA para esta cuenta: avisa al acercarse y, al llegar, pausa los análisis automáticos. Lo que una persona pide sigue hasta el tope del plan.',
        'features.manage', 'features.manage', true, false,
        '{"monthly_runs": 1000, "monthly_usd": 0, "alert_pct": 80}',
        '{"monthly_runs": {"type": "number", "min": 0, "max": 100000}, "monthly_usd": {"type": "number", "min": 0, "max": 10000}, "alert_pct": {"type": "number", "min": 50, "max": 100}}',
        false, 200)
on conflict (key) do nothing;
insert into dk_plan_features (plan_key, feature_key) select key, 'ai_budget' from dk_plans on conflict do nothing;

-- The month's use and the budget of an account (month in the account's time zone).
create or replace function dk_ai_budget_status(p_kitchen uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_settings jsonb;
  v_tz text;
  v_from timestamptz;
  v_runs integer;
  v_usd numeric;
  v_runs_cap integer;
  v_usd_cap numeric;
  v_alert integer;
  v_pct numeric;
begin
  select coalesce(kf.enabled, false), coalesce(f.default_settings, '{}') || coalesce(kf.settings, '{}')
  into v_enabled, v_settings
  from dk_features f left join dk_kitchen_features kf on kf.feature_key = f.key and kf.kitchen_id = p_kitchen
  where f.key = 'ai_budget';
  select coalesce(timezone, 'America/Bogota') into v_tz from dk_kitchens where id = p_kitchen;
  v_from := date_trunc('month', now() at time zone v_tz) at time zone v_tz;
  select count(*), sum(dk_ai_run_cost(model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens))
  into v_runs, v_usd
  from dk_ai_insights
  where kitchen_id = p_kitchen and created_at >= v_from and dk_ai_run_billed(status, input_tokens);
  v_runs_cap := nullif((v_settings ->> 'monthly_runs')::integer, 0);
  v_usd_cap := nullif((v_settings ->> 'monthly_usd')::numeric, 0);
  v_alert := coalesce((v_settings ->> 'alert_pct')::integer, 80);
  v_pct := greatest(
    case when v_runs_cap is not null then v_runs * 100.0 / v_runs_cap end,
    case when v_usd_cap is not null and v_usd is not null then v_usd * 100.0 / v_usd_cap end);
  return jsonb_build_object(
    'enabled', coalesce(v_enabled, false),
    'monthStart', v_from,
    'runs', v_runs, 'estimatedUsd', round(coalesce(v_usd, 0), 4), 'priced', v_usd is not null or v_runs = 0,
    'monthlyRuns', v_runs_cap, 'monthlyUsd', v_usd_cap, 'alertPct', v_alert,
    'pct', trim_scale(round(coalesce(v_pct, 0), 1)),
    'alert', coalesce(v_enabled, false) and coalesce(v_pct, 0) >= v_alert,
    'exceeded', coalesce(v_enabled, false) and coalesce(v_pct, 0) >= 100);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cuota: cuenta lo que llamó al modelo y respeta el presupuesto
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
  v_me uuid := dk_current_profile_id();
  v_copilot boolean := p_feature_key = 'copilot';
  v_org uuid;
  v_limits jsonb;
  v_feature dk_features;
  v_interval integer;
  v_daily integer;
  v_last timestamptz;
  v_used integer;
  v_oldest timestamptz;
  v_budget jsonb;
begin
  if v_kitchen is null or not dk_can_use_feature(p_feature_key) then
    return jsonb_build_object('allowed', false, 'reason', 'feature', 'retryAfterSeconds', null, 'remainingToday', 0);
  end if;
  select * into v_feature from dk_features where key = p_feature_key;
  select organization_id into v_org from dk_kitchens where id = v_kitchen;
  select p.limits into v_limits from dk_subscriptions s join dk_plans p on p.key = s.plan_key where s.organization_id = v_org;
  v_interval := coalesce(v_feature.min_interval_seconds, (v_limits ->> 'ai_min_interval_seconds')::integer, 120);
  v_daily := coalesce((v_limits ->> 'ai_runs_per_day')::integer, 50);
  -- ADR 0033 (D5): Copilot has half of the plan's AI runs for itself; the analyses keep theirs.
  if v_copilot then v_daily := greatest(1, ceil(v_daily * 0.5)::integer); end if;

  -- ADR 0063: the automatic analyses pause when the account's monthly budget is used up.
  if p_feature_key in ('kitchen_insights', 'supply_reorder', 'supply_perishables', 'supply_slow_movers') then
    v_budget := dk_ai_budget_status(v_kitchen);
    if (v_budget ->> 'exceeded')::boolean then
      return jsonb_build_object('allowed', false, 'reason', 'budget', 'retryAfterSeconds', null, 'remainingToday', 0);
    end if;
  end if;

  -- The interval: per person for Copilot (a question each), per account for the analyses.
  -- A failed question does not make the person wait to try again (it still counts for the day).
  select max(created_at) into v_last from dk_ai_insights
  where kitchen_id = v_kitchen and feature_key = p_feature_key
    and status in ('ok', 'running', case when v_copilot then 'ok' else 'error' end)
    and (not v_copilot or created_by is not distinct from v_me);
  if v_last is not null and v_last > now() - make_interval(secs => v_interval) then
    return jsonb_build_object('allowed', false, 'reason', 'interval',
      'retryAfterSeconds', ceil(extract(epoch from (v_last + make_interval(secs => v_interval)) - now()))::integer,
      'remainingToday', null);
  end if;

  -- ADR 0063: every run that reached the model counts (also cancelled questions and documents that were not invoices).
  select count(*), min(created_at) into v_used, v_oldest from dk_ai_insights
  where kitchen_id = v_kitchen and dk_ai_run_billed(status, input_tokens) and created_at > now() - interval '24 hours'
    and (case when v_copilot then feature_key = 'copilot' else feature_key not in ('copilot', 'whatsapp_ordering') end);
  if v_used >= v_daily then
    return jsonb_build_object('allowed', false, 'reason', 'daily',
      'retryAfterSeconds', ceil(extract(epoch from (v_oldest + interval '24 hours') - now()))::integer,
      'remainingToday', 0);
  end if;

  return jsonb_build_object('allowed', true, 'reason', null, 'retryAfterSeconds', null, 'remainingToday', v_daily - v_used,
    'model', (select m.key from dk_ai_models m where m.key = v_feature.model_key and m.active));
end;
$$;

-- Reserve: the same, plus the input's fingerprint (the analyses now reserve too: no two calls at once).
drop function dk_ai_run_reserve(text, jsonb);
create function dk_ai_run_reserve(p_feature_key text, p_input jsonb default '{}', p_input_hash text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_quota jsonb;
  v_voice_model text;
  v_id uuid;
begin
  if v_kitchen is null then
    return jsonb_build_object('allowed', false, 'reason', 'feature', 'retryAfterSeconds', null, 'remainingToday', 0);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dk_ai_run:' || v_kitchen::text || ':' || p_feature_key, 0));
  v_quota := dk_ai_run_allowed(p_feature_key);
  if coalesce((v_quota ->> 'allowed')::boolean, false) and p_feature_key = 'copilot' and p_input ->> 'channel' = 'voice' then
    select m.key into v_voice_model
    from dk_features f join dk_ai_models m on m.key = f.voice_model_key and m.active
    where f.key = p_feature_key;
    if v_voice_model is not null then v_quota := v_quota || jsonb_build_object('model', v_voice_model); end if;
  end if;
  if not coalesce((v_quota ->> 'allowed')::boolean, false) or v_quota ->> 'model' is null then
    return v_quota;
  end if;
  insert into dk_ai_insights (kitchen_id, feature_key, status, input, model, created_by, input_hash)
  values (v_kitchen, p_feature_key, 'running', coalesce(p_input, '{}'), v_quota ->> 'model', dk_current_profile_id(), p_input_hash)
  returning id into v_id;
  return v_quota || jsonb_build_object('runId', v_id, 'remainingToday', greatest(0, (v_quota ->> 'remainingToday')::integer - 1));
end;
$$;

-- Finish: with the cache tokens. A run whose cancellation was requested closes as 'cancelled' with its tokens.
drop function dk_ai_run_finish(uuid, text, jsonb, jsonb, integer, integer, integer, text, text, text, jsonb);
create function dk_ai_run_finish(
  p_run_id uuid, p_status text, p_output jsonb default null, p_input jsonb default null,
  p_input_tokens integer default null, p_output_tokens integer default null, p_latency_ms integer default null,
  p_error text default null, p_intent text default null, p_scope text default null, p_timings jsonb default null,
  p_cache_read_tokens integer default null, p_cache_write_tokens integer default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('ok', 'empty', 'error', 'cancelled') then
    raise exception 'Estado de corrida no válido';
  end if;
  update dk_ai_insights set
    status = case when cancel_requested_at is not null and p_status in ('ok', 'error') then 'cancelled' else p_status end,
    output = p_output, input = coalesce(p_input, input),
    input_tokens = p_input_tokens, output_tokens = p_output_tokens, latency_ms = p_latency_ms,
    cache_read_tokens = p_cache_read_tokens, cache_write_tokens = p_cache_write_tokens,
    error = left(p_error, 500), intent = left(p_intent, 40), scope = p_scope,
    timings = case
      when p_timings is null then timings
      when timings ? 'client' or p_timings ? 'client'
        then coalesce(timings, '{}') || p_timings || jsonb_build_object('client', coalesce(timings -> 'client', '{}') || coalesce(p_timings -> 'client', '{}'))
      else coalesce(timings, '{}') || p_timings
    end
  where id = p_run_id and status = 'running'
    and kitchen_id = dk_current_kitchen_id() and created_by is not distinct from dk_current_profile_id();
end;
$$;

-- ⏹ asks the running question to stop; the edge function checks it between rounds.
create or replace function dk_ai_run_request_cancel(p_run_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_found boolean;
begin
  update dk_ai_insights set cancel_requested_at = now()
  where id = p_run_id and status = 'running' and cancel_requested_at is null
    and kitchen_id = dk_current_kitchen_id() and created_by is not distinct from dk_current_profile_id()
  returning true into v_found;
  return coalesce(v_found, false);
end;
$$;

create or replace function dk_ai_run_cancel_requested(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from dk_ai_insights where id = p_run_id and cancel_requested_at is not null
                 and kitchen_id = dk_current_kitchen_id() and created_by is not distinct from dk_current_profile_id())
$$;

-- ---------------------------------------------------------------------------
-- 5. Ajustes nuevos de Copilot y Lectura de facturas
-- ---------------------------------------------------------------------------
update dk_features set
  default_settings = '{"voice_fallback": true, "follow_up": true}',
  settings_schema = '{"voice_fallback": {"type": "boolean"}, "follow_up": {"type": "boolean"}}'
where key = 'copilot';
update dk_features set
  default_settings = '{"read_on_drop": true}',
  settings_schema = '{"read_on_drop": {"type": "boolean"}}'
where key = 'invoice_import';
-- Kitchen insights: a frequency under 5 min never pays off (ADR 0063).
update dk_features set
  settings_schema = jsonb_set(settings_schema, '{frequency_min,min}', '5')
where key = 'kitchen_insights';
update dk_kitchen_features set settings = jsonb_set(settings, '{frequency_min}', '5')
where feature_key = 'kitchen_insights' and (settings ->> 'frequency_min')::numeric < 5;

-- ---------------------------------------------------------------------------
-- 6. Asistente de Consumer: interruptor, modelo y medición
-- ---------------------------------------------------------------------------
insert into dk_platform_settings (key, value) values ('consumer_assistant_active', 'true'), ('consumer_assistant_model', 'claude-haiku-5-5')
on conflict (key) do nothing;

alter table dk_consumer_ai_runs
  add column model text,
  add column status text not null default 'running' check (status in ('running', 'ok', 'error')),
  add column input_tokens integer check (input_tokens >= 0),
  add column output_tokens integer check (output_tokens >= 0),
  add column latency_ms integer check (latency_ms >= 0);
update dk_consumer_ai_runs set status = 'ok' where status = 'running';
create index dk_consumer_ai_runs_created_idx on dk_consumer_ai_runs (created_at desc);

-- Reserve a model call for the signed-in consumer: platform switch, model and the same rate limits as before.
create or replace function dk_consumer_ai_reserve()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_model text;
  v_id bigint;
begin
  if v_uid is null then return jsonb_build_object('allowed', false, 'reason', 'auth'); end if;
  if coalesce((select value from dk_platform_settings where key = 'consumer_assistant_active'), 'true') <> 'true' then
    return jsonb_build_object('allowed', false, 'reason', 'platform');
  end if;
  select m.key into v_model from dk_ai_models m
  where m.key = (select value from dk_platform_settings where key = 'consumer_assistant_model') and m.active;
  if v_model is null then return jsonb_build_object('allowed', false, 'reason', 'model'); end if;
  perform pg_advisory_xact_lock(hashtextextended('dk_consumer_ai:' || v_uid::text, 0));
  if (select count(*) from dk_consumer_ai_runs where consumer_id = v_uid and created_at > now() - interval '1 minute') >= 10
     or (select count(*) from dk_consumer_ai_runs where consumer_id = v_uid and created_at > now() - interval '1 day') >= 200 then
    return jsonb_build_object('allowed', false, 'reason', 'limit');
  end if;
  insert into dk_consumer_ai_runs (consumer_id, model) values (v_uid, v_model) returning id into v_id;
  return jsonb_build_object('allowed', true, 'model', v_model, 'runId', v_id);
end;
$$;

create or replace function dk_consumer_ai_finish(p_run_id bigint, p_ok boolean, p_input_tokens integer, p_output_tokens integer, p_latency_ms integer)
returns void
language sql
security definer
set search_path = public
as $$
  update dk_consumer_ai_runs set status = case when p_ok then 'ok' else 'error' end,
    input_tokens = p_input_tokens, output_tokens = p_output_tokens, latency_ms = p_latency_ms
  where id = p_run_id and consumer_id = auth.uid() and status = 'running'
$$;

-- The old check (still callable by a previous deploy of the function) no longer deletes history:
-- the runs are the metering now; the cleanup job keeps 90 days.
create or replace function dk_consumer_ai_allow()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return coalesce((dk_consumer_ai_reserve() ->> 'allowed')::boolean, false);
end;
$$;

-- Platform admin: the consumer assistant's switch and model.
create or replace function dk_platform_consumer_ai()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform dk_require_platform_admin();
  return jsonb_build_object(
    'active', coalesce((select value from dk_platform_settings where key = 'consumer_assistant_active'), 'true') = 'true',
    'modelKey', (select value from dk_platform_settings where key = 'consumer_assistant_model'));
end;
$$;

create or replace function dk_platform_set_consumer_ai(p_active boolean default null, p_model_key text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform dk_require_platform_admin();
  if p_model_key is not null and not exists (select 1 from dk_ai_models where key = p_model_key and active) then
    raise exception 'Ese modelo no existe o está inactivo';
  end if;
  if p_active is not null then
    insert into dk_platform_settings (key, value) values ('consumer_assistant_active', p_active::text)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
  if p_model_key is not null then
    insert into dk_platform_settings (key, value) values ('consumer_assistant_model', p_model_key)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Costo del mes y topes, para la cuenta
-- ---------------------------------------------------------------------------
create or replace function dk_account_ai_cost()
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
  v_daily integer;
  v_budget jsonb;
  v_from timestamptz;
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  select organization_id into v_org from dk_kitchens where id = v_kitchen;
  if not (dk_has_org_permission(v_org, 'observability.view') or dk_has_org_permission(v_org, 'features.manage')) then
    raise exception 'No autorizado para ver el uso de IA de esta cuenta' using errcode = '42501';
  end if;
  select p.limits into v_limits from dk_subscriptions s join dk_plans p on p.key = s.plan_key where s.organization_id = v_org;
  v_daily := coalesce((v_limits ->> 'ai_runs_per_day')::integer, 50);
  v_budget := dk_ai_budget_status(v_kitchen);
  v_from := (v_budget ->> 'monthStart')::timestamptz;
  return jsonb_build_object(
    'month', v_budget,
    'byFeature', (select coalesce(jsonb_agg(x order by x."runs" desc), '[]') from (
        select f.key, f.label,
               count(i.id) filter (where dk_ai_run_billed(i.status, i.input_tokens)) as "runs",
               coalesce(sum(i.input_tokens) filter (where dk_ai_run_billed(i.status, i.input_tokens)), 0)
                 + coalesce(sum(i.cache_read_tokens), 0) + coalesce(sum(i.cache_write_tokens), 0) as "inputTokens",
               coalesce(sum(i.output_tokens), 0) as "outputTokens",
               round(sum(dk_ai_run_cost(i.model, i.input_tokens, i.output_tokens, i.cache_read_tokens, i.cache_write_tokens)), 4) as "estimatedUsd",
               coalesce((select sum(h.hits) from dk_ai_cache_hits h where h.kitchen_id = v_kitchen and h.feature_key = f.key and h.day >= (v_from at time zone 'UTC')::date), 0) as "avoided"
        from dk_features f
        left join dk_ai_insights i on i.feature_key = f.key and i.kitchen_id = v_kitchen and i.created_at >= v_from
        where f.uses_model
        group by f.key, f.label, f.sort_order
        having count(i.id) > 0 or exists (select 1 from dk_ai_cache_hits h where h.kitchen_id = v_kitchen and h.feature_key = f.key and h.day >= (v_from at time zone 'UTC')::date)) x),
    'limits', jsonb_build_object(
      'analyses', jsonb_build_object('perDay', v_daily, 'used24h', (select count(*) from dk_ai_insights
          where kitchen_id = v_kitchen and dk_ai_run_billed(status, input_tokens) and created_at > now() - interval '24 hours'
            and feature_key not in ('copilot', 'whatsapp_ordering'))),
      'copilot', jsonb_build_object('perDay', greatest(1, ceil(v_daily * 0.5)::integer), 'used24h', (select count(*) from dk_ai_insights
          where kitchen_id = v_kitchen and dk_ai_run_billed(status, input_tokens) and created_at > now() - interval '24 hours'
            and feature_key = 'copilot')),
      'whatsapp', jsonb_build_object('perDay', coalesce((v_limits ->> 'wa_ai_turns_per_day')::integer, 400), 'used24h', (select count(*) from dk_ai_insights
          where kitchen_id = v_kitchen and feature_key = 'whatsapp_ordering' and created_at > now() - interval '24 hours'
            and status in ('ok', 'error', 'running', 'empty')))));
end;
$$;

-- Platform usage: every run that reached the model, cache tokens priced apart, and the consumer assistant.
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
      select i.feature_key, i.status, i.created_at, i.input_tokens, i.latency_ms,
             coalesce(i.input_tokens, 0) + coalesce(i.cache_read_tokens, 0) + coalesce(i.cache_write_tokens, 0) as all_input_tokens,
             i.output_tokens,
             k.id as kitchen_id, k.name as kitchen_name, o.id as organization_id, o.name as organization_name,
             dk_ai_run_cost(i.model, i.input_tokens, i.output_tokens, i.cache_read_tokens, i.cache_write_tokens) as cost
      from dk_ai_insights i
      join dk_kitchens k on k.id = i.kitchen_id
      join dk_organizations o on o.id = k.organization_id
      where i.created_at > now() - make_interval(days => v_days) and dk_ai_run_billed(i.status, i.input_tokens) and i.status <> 'running'
    ), consumer as (
      select c.created_at, c.status, c.input_tokens, c.output_tokens,
             dk_ai_run_cost(c.model, c.input_tokens, c.output_tokens, null, null) as cost
      from dk_consumer_ai_runs c where c.created_at > now() - make_interval(days => v_days) and c.status <> 'running'
    )
    select jsonb_build_object(
      'days', v_days,
      'totals', (select jsonb_build_object(
          'runs', count(*), 'errors', count(*) filter (where status = 'error'),
          'runs24h', count(*) filter (where created_at > now() - interval '24 hours'),
          'meteredRuns', count(*) filter (where input_tokens is not null),
          'inputTokens', coalesce(sum(all_input_tokens), 0), 'outputTokens', coalesce(sum(output_tokens), 0),
          'estimatedCost', sum(cost), 'pricedRuns', count(cost),
          'avgLatencyMs', round(avg(latency_ms))) from runs),
      'meteringSince', (select min(created_at) from dk_ai_insights where input_tokens is not null),
      'byFeature', (select coalesce(jsonb_agg(x order by x.runs desc), '[]') from (
          select r.feature_key as key, (select label from dk_features where key = r.feature_key) as label,
                 count(*) as runs, count(*) filter (where status = 'error') as errors,
                 coalesce(sum(all_input_tokens), 0) + coalesce(sum(output_tokens), 0) as tokens, sum(cost) as "estimatedCost"
          from runs r group by r.feature_key
          union all
          select 'consumer_assistant', 'Asistente de Consumer', count(*), count(*) filter (where status = 'error'),
                 coalesce(sum(input_tokens), 0) + coalesce(sum(output_tokens), 0), sum(cost)
          from consumer having count(*) > 0) x),
      'byOrganization', (select coalesce(jsonb_agg(x order by x.runs desc), '[]') from (
          select organization_id as id, organization_name as name, count(*) as runs, count(*) filter (where status = 'error') as errors,
                 coalesce(sum(all_input_tokens), 0) + coalesce(sum(output_tokens), 0) as tokens, sum(cost) as "estimatedCost"
          from runs group by organization_id, organization_name order by count(*) desc limit 20) x),
      'byAccount', (select coalesce(jsonb_agg(x order by x.runs desc), '[]') from (
          select kitchen_id as id, kitchen_name as name, organization_name as organization, count(*) as runs,
                 count(*) filter (where status = 'error') as errors, sum(cost) as "estimatedCost"
          from runs group by kitchen_id, kitchen_name, organization_name order by count(*) desc limit 20) x),
      'consumer', (select jsonb_build_object('runs', count(*), 'errors', count(*) filter (where status = 'error'),
          'tokens', coalesce(sum(input_tokens), 0) + coalesce(sum(output_tokens), 0), 'estimatedCost', sum(cost)) from consumer),
      'byDay', (select coalesce(jsonb_agg(jsonb_build_object('date', d::date, 'runs', coalesce(c.runs, 0), 'errors', coalesce(c.errors, 0)) order by d), '[]')
          from generate_series(current_date - (v_days - 1), current_date, interval '1 day') d
          left join (select created_at::date as day, count(*) as runs, count(*) filter (where status = 'error') as errors from runs group by 1) c on c.day = d::date)
    ));
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Limpieza programada
-- ---------------------------------------------------------------------------
create or replace function dk_ai_housekeeping()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A run that never finished (the function died) stops counting as «running» after 15 min; it did call the model.
  update dk_ai_insights set status = 'error', error = 'Sin respuesta: se cerró por limpieza'
  where status = 'running' and created_at < now() - interval '15 minutes';
  -- Analyses that found nothing (no model call) are only useful for a while.
  delete from dk_ai_insights where status = 'empty' and input_tokens is null and created_at < now() - interval '30 days';
  delete from dk_ai_cache_hits where day < current_date - 400;
  update dk_consumer_ai_runs set status = 'error' where status = 'running' and created_at < now() - interval '15 minutes';
  delete from dk_consumer_ai_runs where created_at < now() - interval '90 days';
end;
$$;
select cron.schedule('dk-ai-housekeeping', '*/10 * * * *', 'select public.dk_ai_housekeeping()');

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
revoke execute on function
  dk_ai_run_billed(text, integer), dk_ai_run_cost(text, integer, integer, integer, integer), dk_ai_cache_hit(text),
  dk_ai_budget_status(uuid), dk_ai_run_reserve(text, jsonb, text),
  dk_ai_run_finish(uuid, text, jsonb, jsonb, integer, integer, integer, text, text, text, jsonb, integer, integer),
  dk_ai_run_request_cancel(uuid), dk_ai_run_cancel_requested(uuid), dk_consumer_ai_reserve(),
  dk_consumer_ai_finish(bigint, boolean, integer, integer, integer), dk_platform_consumer_ai(),
  dk_platform_set_consumer_ai(boolean, text), dk_account_ai_cost(), dk_ai_housekeeping()
from public, anon;
grant execute on function
  dk_ai_cache_hit(text), dk_ai_run_reserve(text, jsonb, text),
  dk_ai_run_finish(uuid, text, jsonb, jsonb, integer, integer, integer, text, text, text, jsonb, integer, integer),
  dk_ai_run_request_cancel(uuid), dk_ai_run_cancel_requested(uuid), dk_consumer_ai_reserve(),
  dk_consumer_ai_finish(bigint, boolean, integer, integer, integer), dk_platform_consumer_ai(),
  dk_platform_set_consumer_ai(boolean, text), dk_account_ai_cost()
to authenticated;
