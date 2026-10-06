-- ADR 0033, phase 4: how Copilot is doing, in Configuración → IA y voz → Uso y estado.
-- dk_account_ai_usage keeps everything it returned and adds `copilot`:
-- questions, by voice, latency p50/p90, cancelled, the scopes (answered, no
-- data, not allowed, out of scope…) and the 👍/👎 — aggregated, never the
-- questions themselves (those are each person's own, ADR 0033 R1).
create or replace function dk_account_ai_usage(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_org uuid;
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_daily integer;
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  select organization_id into v_org from dk_kitchens where id = v_kitchen;
  if not (dk_has_org_permission(v_org, 'observability.view') or dk_has_org_permission(v_org, 'features.manage')) then
    raise exception 'No autorizado para ver el uso de IA de esta cuenta' using errcode = '42501';
  end if;
  select coalesce((p.limits ->> 'ai_runs_per_day')::integer, 50) into v_daily
  from dk_subscriptions s join dk_plans p on p.key = s.plan_key where s.organization_id = v_org;
  v_daily := coalesce(v_daily, 50);
  return (
    with runs as (
      select i.feature_key, i.status, i.created_at from dk_ai_insights i
      where i.kitchen_id = v_kitchen and i.created_at > now() - make_interval(days => v_days) and i.status in ('ok', 'error')
    ), questions as (
      select i.status, i.scope, i.feedback, i.latency_ms, i.input ->> 'channel' channel from dk_ai_insights i
      where i.kitchen_id = v_kitchen and i.feature_key = 'copilot' and i.created_at > now() - make_interval(days => v_days)
        and i.status in ('ok', 'error', 'cancelled')
    )
    select jsonb_build_object(
      'days', v_days,
      'dailyLimit', v_daily,
      'totals', (select jsonb_build_object('runs', count(*), 'errors', count(*) filter (where status = 'error'),
                   'runs24h', count(*) filter (where created_at > now() - interval '24 hours')) from runs),
      'byFeature', (select coalesce(jsonb_agg(x order by x.runs desc), '[]') from (
          select r.feature_key as key, (select label from dk_features where key = r.feature_key) as label,
                 count(*) as runs, count(*) filter (where status = 'error') as errors
          from runs r group by r.feature_key) x),
      'copilot', (select jsonb_build_object(
          'dailyLimit', greatest(1, ceil(v_daily * 0.5)::integer),
          'questions', count(*),
          'byVoice', count(*) filter (where channel = 'voice'),
          'errors', count(*) filter (where status = 'error'),
          'cancelled', count(*) filter (where status = 'cancelled'),
          'p50Ms', round((percentile_cont(0.5) within group (order by latency_ms) filter (where status = 'ok'))::numeric),
          'p90Ms', round((percentile_cont(0.9) within group (order by latency_ms) filter (where status = 'ok'))::numeric),
          'thumbsUp', count(*) filter (where feedback = 1),
          'thumbsDown', count(*) filter (where feedback = -1),
          'byScope', coalesce((select jsonb_object_agg(scope, n) from (select scope, count(*) n from questions where scope is not null group by scope) s), '{}'))
        from questions)));
end;
$$;
