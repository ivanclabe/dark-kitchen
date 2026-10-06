-- ADR 0033: «Reintentar» works at once. The 5 s between Copilot questions no
-- longer counts a question that failed (it still counts for the daily limit);
-- the automatic analyses keep their rule.
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

  select count(*), min(created_at) into v_used, v_oldest from dk_ai_insights
  where kitchen_id = v_kitchen and status in ('ok', 'error', 'running') and created_at > now() - interval '24 hours'
    and (case when v_copilot then feature_key = 'copilot' else feature_key <> 'copilot' end);
  if v_used >= v_daily then
    return jsonb_build_object('allowed', false, 'reason', 'daily',
      'retryAfterSeconds', ceil(extract(epoch from (v_oldest + interval '24 hours') - now()))::integer,
      'remainingToday', 0);
  end if;

  return jsonb_build_object('allowed', true, 'reason', null, 'retryAfterSeconds', null, 'remainingToday', v_daily - v_used,
    'model', (select m.key from dk_ai_models m where m.key = v_feature.model_key and m.active));
end;
$$;
