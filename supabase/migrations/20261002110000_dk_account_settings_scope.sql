-- ADR 0024 (phase 2): Configuración inside the account. AI, AI usage and
-- alerts are read for the ACTIVE account only; nothing about other accounts
-- reaches the browser. Permissions are the same ones as before (the
-- organization ones are still required), now applied to the active account.
--
--   dk_account_feature_matrix()  dk_org_feature_matrix limited to the active account (+ how many accounts share the general values).
--   dk_account_ai_usage(days)    AI usage of the active account.
--   dk_account_alerts()          alerts of the active account (plan alerts only for whoever sees billing).

create or replace function dk_account_feature_matrix()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_org uuid;
  v_matrix jsonb;
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  select organization_id into v_org from dk_kitchens where id = v_kitchen;
  -- dk_org_feature_matrix checks features.manage itself.
  v_matrix := dk_org_feature_matrix(v_org);
  return v_matrix
    || jsonb_build_object(
         'accounts', coalesce((select jsonb_agg(a) from jsonb_array_elements(v_matrix -> 'accounts') a where (a ->> 'id')::uuid = v_kitchen), '[]'),
         'accountCount', (select count(*) from dk_kitchens where organization_id = v_org));
end;
$$;

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
  return (
    with runs as (
      select i.feature_key, i.status, i.created_at from dk_ai_insights i
      where i.kitchen_id = v_kitchen and i.created_at > now() - make_interval(days => v_days) and i.status in ('ok', 'error')
    )
    select jsonb_build_object(
      'days', v_days,
      'dailyLimit', coalesce(v_daily, 50),
      'totals', (select jsonb_build_object('runs', count(*), 'errors', count(*) filter (where status = 'error'),
                   'runs24h', count(*) filter (where created_at > now() - interval '24 hours')) from runs),
      'byFeature', (select coalesce(jsonb_agg(x order by x.runs desc), '[]') from (
          select r.feature_key as key, (select label from dk_features where key = r.feature_key) as label,
                 count(*) as runs, count(*) filter (where status = 'error') as errors
          from runs r group by r.feature_key) x)));
end;
$$;

create or replace function dk_account_alerts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_k dk_kitchens;
  v_sub dk_subscriptions;
  v_limits jsonb;
  v_daily integer;
  v_late integer;
  v_low integer;
  v_ai_runs integer;
  v_ai_errors integer;
  v_alerts jsonb := '[]';
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  if not dk_can('dashboard.view') then
    raise exception 'No autorizado para ver las alertas de esta cuenta' using errcode = '42501';
  end if;
  select * into v_k from dk_kitchens where id = v_kitchen;
  select * into v_sub from dk_subscriptions where organization_id = v_k.organization_id;
  select limits into v_limits from dk_plans where key = v_sub.plan_key;
  v_daily := coalesce((v_limits ->> 'ai_runs_per_day')::integer, 50);

  v_late := dk_late_orders_count(v_kitchen);
  select count(*) into v_low from dk_ingredient_stock s join dk_ingredients i on i.id = s.ingredient_id
  where s.kitchen_id = v_kitchen and i.active and s.stock_available <= i.min_stock;
  select count(*) filter (where status in ('ok', 'error')), count(*) filter (where status = 'error') into v_ai_runs, v_ai_errors
  from dk_ai_insights where kitchen_id = v_kitchen and created_at > now() - interval '24 hours';

  if v_late > 0 then
    v_alerts := v_alerts || jsonb_build_object('severity', 'warning', 'type', 'late_orders',
      'message', format('%s %s atrasado%s ahora', v_late, case when v_late = 1 then 'pedido' else 'pedidos' end, case when v_late = 1 then '' else 's' end));
  end if;
  if v_low > 0 then
    v_alerts := v_alerts || jsonb_build_object('severity', 'info', 'type', 'low_stock',
      'message', format('%s %s bajo el mínimo', v_low, case when v_low = 1 then 'insumo' else 'insumos' end));
  end if;
  if v_ai_errors > 0 then
    v_alerts := v_alerts || jsonb_build_object('severity', 'error', 'type', 'ai_errors',
      'message', format('%s análisis de IA con error en 24 h', v_ai_errors));
  end if;
  if v_ai_runs >= 0.8 * v_daily then
    v_alerts := v_alerts || jsonb_build_object('severity', 'warning', 'type', 'ai_quota',
      'message', format('Esta cuenta usó %s de %s análisis de IA en 24 h', v_ai_runs, v_daily));
  end if;

  -- The plan covers all the accounts of the business: only whoever sees billing gets these.
  if dk_has_org_permission(v_k.organization_id, 'billing.view') then
    if v_sub.status = 'trialing' and v_sub.trial_ends_at < now() + interval '3 days' then
      v_alerts := v_alerts || jsonb_build_object('severity', case when v_sub.trial_ends_at < now() then 'error' else 'warning' end, 'type', 'trial',
        'message', case when v_sub.trial_ends_at < now() then 'La prueba gratis terminó' else format('La prueba gratis termina el %s', to_char(v_sub.trial_ends_at, 'DD/MM/YYYY')) end);
    end if;
    if (v_limits ->> 'accounts') is not null
       and (select count(*) from dk_kitchens where organization_id = v_k.organization_id) >= (v_limits ->> 'accounts')::integer then
      v_alerts := v_alerts || jsonb_build_object('severity', 'info', 'type', 'plan_limit', 'message', 'Llegaste al límite de cuentas de tu plan');
    end if;
    if (v_limits ->> 'users') is not null
       and (select count(*) from dk_organization_members where organization_id = v_k.organization_id and status in ('active', 'pending')) >= (v_limits ->> 'users')::integer then
      v_alerts := v_alerts || jsonb_build_object('severity', 'info', 'type', 'plan_limit', 'message', 'Llegaste al límite de usuarios de tu plan');
    end if;
  end if;

  return jsonb_build_object('generatedAt', now(), 'alerts', v_alerts);
end;
$$;

revoke all on function dk_account_feature_matrix() from public, anon;
revoke all on function dk_account_ai_usage(integer) from public, anon;
revoke all on function dk_account_alerts() from public, anon;
grant execute on function dk_account_feature_matrix() to authenticated;
grant execute on function dk_account_ai_usage(integer) to authenticated;
grant execute on function dk_account_alerts() to authenticated;
