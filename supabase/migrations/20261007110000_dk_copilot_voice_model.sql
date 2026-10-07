-- ADR 0041 (D8): a model for the questions said to «Oye Quanela».
--
-- A spoken question is waiting for an answer out loud: a faster model may be
-- worth it there while the chat keeps its own. The platform chooses it per
-- feature (only Copilot has a voice channel); empty = the feature's model.
-- It starts empty: nothing changes until the platform picks one, after
-- measuring it with `copilot-eval --channel voice`.

alter table dk_features
  add column voice_model_key text references dk_ai_models(key),
  add constraint dk_features_voice_model_only_with_model check (uses_model or voice_model_key is null);
comment on column dk_features.voice_model_key is 'ADR 0041: model for questions asked by voice (channel = voice); null = model_key.';

-- Checks and reserves in one step: two requests at once cannot both pass.
-- ADR 0041: a Copilot question by voice uses the voice model when there is an active one.
create or replace function dk_ai_run_reserve(p_feature_key text, p_input jsonb default '{}')
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
  insert into dk_ai_insights (kitchen_id, feature_key, status, input, model, created_by)
  values (v_kitchen, p_feature_key, 'running', coalesce(p_input, '{}'), v_quota ->> 'model', dk_current_profile_id())
  returning id into v_id;
  return v_quota || jsonb_build_object('runId', v_id, 'remainingToday', greatest(0, (v_quota ->> 'remainingToday')::integer - 1));
end;
$$;

-- Sets (or clears, with null) the voice model of a feature. Platform admins only.
create or replace function dk_platform_set_voice_model(p_key text, p_model_key text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feature dk_features;
begin
  perform dk_require_platform_admin();
  select * into v_feature from dk_features where key = p_key;
  if not found then raise exception 'Función desconocida: %', p_key; end if;
  if p_key <> 'copilot' then raise exception 'Solo Copilot recibe preguntas por voz'; end if;
  if p_model_key is not null and not exists (select 1 from dk_ai_models where key = p_model_key and active) then
    raise exception 'Modelo desconocido o inactivo: %', p_model_key;
  end if;
  update dk_features set voice_model_key = p_model_key where key = p_key;
end;
$$;
revoke execute on function dk_platform_set_voice_model(text, text) from public, anon;

-- A model in use (also as the voice model) cannot be switched off.
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
  if not coalesce(p_active, true) and exists (select 1 from dk_features where model_key = p_key or voice_model_key = p_key) then
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

-- The platform's AI view: each feature also says its voice model, and a model is «in use» by it too.
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
          'active', f.active, 'usesModel', f.uses_model, 'modelKey', f.model_key, 'voiceModelKey', f.voice_model_key,
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
          'usedBy', (select coalesce(jsonb_agg(f.key order by f.sort_order), '[]') from dk_features f where f.model_key = m.key or f.voice_model_key = m.key))
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
