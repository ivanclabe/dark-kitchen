-- ADR 0012, secciones 4 y 13: observabilidad y fechas en la zona de la Cuenta.
--
-- 1. Índices por tiempo para ventanas acotadas por Cuenta.
-- 2. Zona horaria (A5): "hoy", semana, mes y los reportes usaban la fecha UTC
--    (created_at::date): de 7 p. m. a 12 a. m. (Bogotá) los pedidos caían en el
--    día siguiente. Helpers dk_kitchen_tz / dk_local_start / dk_local_date y
--    reescritura MECÁNICA de dk_dashboard_summary y los 6 reportes (con
--    verificación de que no queda ninguna comparación por fecha UTC).
-- 3. dk_org_observability(org) y dk_account_observability(org, cuenta):
--    solo métricas que salen de datos reales, en ventanas acotadas, con
--    observability.view y la Cuenta verificada como de esa organización.

-- ---------------------------------------------------------------------------
-- 1. Índices
-- ---------------------------------------------------------------------------
create index if not exists dk_orders_kitchen_created_idx on dk_orders (kitchen_id, created_at desc);
create index if not exists dk_order_status_history_kitchen_changed_idx on dk_order_status_history (kitchen_id, changed_at desc);
create index if not exists dk_inventory_movements_kitchen_created_idx on dk_inventory_movements (kitchen_id, created_at desc);
create index if not exists dk_ai_insights_kitchen_created_idx on dk_ai_insights (kitchen_id, created_at desc);
create index if not exists dk_order_payments_kitchen_created_idx on dk_order_payments (kitchen_id, created_at desc);
create index if not exists dk_audit_log_kitchen_category_idx on dk_audit_log (kitchen_id, category, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Fechas en la zona de la Cuenta
-- ---------------------------------------------------------------------------
create or replace function dk_kitchen_tz(p_kitchen_id uuid default null)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select timezone from dk_kitchens where id = coalesce(p_kitchen_id, dk_current_kitchen_id())), 'America/Bogota');
$$;

-- Medianoche local de un día (como instante): comparable con created_at e indexable.
create or replace function dk_local_start(p_day date, p_tz text default null)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select (p_day::timestamp) at time zone coalesce(p_tz, dk_kitchen_tz());
$$;

-- Día local de un instante.
create or replace function dk_local_date(p_at timestamptz, p_tz text default null)
returns date
language sql
stable
set search_path = public
as $$
  select (p_at at time zone coalesce(p_tz, dk_kitchen_tz()))::date;
$$;

do $$
declare
  v_fn text;
  v_def text;
begin
  foreach v_fn in array array['dk_dashboard_summary', 'dk_report_profitability', 'dk_report_purchases_by_supplier', 'dk_report_sales_by_day',
                              'dk_report_top_ingredients_purchased', 'dk_report_top_products', 'dk_report_waste'] loop
    select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = v_fn;
    -- Rangos de fechas: [medianoche local de p_from, medianoche local del día después de p_to).
    v_def := regexp_replace(v_def, '((\w+\.)?created_at)::date between p_from and p_to',
                            '\1 >= dk_local_start(p_from) and \1 < dk_local_start(p_to + 1)', 'g');
    -- "Hoy" del Dashboard.
    v_def := regexp_replace(v_def, '((\w+\.)?created_at)::date = dk_kitchen_today\(\)',
                            '\1 >= dk_local_start(dk_kitchen_today())', 'g');
    -- Semana y mes: desde la medianoche local del primer día.
    v_def := regexp_replace(v_def, 'date_trunc\(''(week|month)'', dk_kitchen_today\(\)\)',
                            'dk_local_start(date_trunc(''\1'', dk_kitchen_today())::date)', 'g');
    -- Agrupar por día local.
    v_def := regexp_replace(v_def, '((\w+\.)?created_at)::date', 'dk_local_date(\1)', 'g');
    if v_def ~ 'created_at::date' or v_def ~ 'current_date' then
      raise exception 'Quedó una fecha UTC en %', v_fn;
    end if;
    execute v_def;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Observabilidad
-- ---------------------------------------------------------------------------

-- Pedidos en curso atrasados ahora, según las alertas de tiempo (SLA) de la Cuenta:
-- minutos desde que el pedido entró a su estado actual contra el umbral de ese estado.
create or replace function dk_late_orders_count(p_kitchen_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from dk_orders o
  left join dk_kitchen_sla_settings s on s.kitchen_id = o.kitchen_id
  cross join lateral (
    select coalesce(max(h.changed_at), o.created_at) as since
    from dk_order_status_history h where h.order_id = o.id and h.to_status = o.status
  ) st
  where o.kitchen_id = p_kitchen_id
    and o.status in ('CONFIRMADO', 'EN_PREPARACION', 'LISTO')
    and now() - st.since > make_interval(mins => case o.status
          when 'CONFIRMADO' then coalesce(s.confirmado_alert_min, 10)
          when 'EN_PREPARACION' then coalesce(s.en_preparacion_alert_min, 20)
          else coalesce(s.listo_alert_min, 10) end);
$$;

create or replace function dk_org_observability(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_accounts jsonb;
  v_sub dk_subscriptions;
  v_limits jsonb;
  v_alerts jsonb := '[]';
  v_active_users integer;
  v_users integer;
  v_account record;
begin
  if not dk_has_org_permission(p_organization_id, 'observability.view') then
    raise exception 'No autorizado para ver la observabilidad de esta organización';
  end if;
  select * into v_sub from dk_subscriptions where organization_id = p_organization_id;
  select limits into v_limits from dk_plans where key = v_sub.plan_key;

  select coalesce(jsonb_agg(a order by (a ->> 'active')::boolean desc, a ->> 'name'), '[]') into v_accounts
  from (
    select jsonb_build_object(
      'id', k.id, 'name', k.name, 'slug', k.slug, 'iconKey', k.icon_key, 'active', k.active, 'timezone', k.timezone,
      'ordersToday', t.orders_today, 'salesToday', t.sales_today, 'cancelledToday', t.cancelled_today, 'deliveredToday', t.delivered_today,
      'ordersWeek', t.orders_week, 'salesWeek', t.sales_week,
      'inProgress', (select count(*) from dk_orders o where o.kitchen_id = k.id and o.status in ('NUEVO', 'CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'DESPACHADO')),
      'late', dk_late_orders_count(k.id),
      'lowStock', (select count(*) from dk_ingredient_stock s join dk_ingredients i on i.id = s.ingredient_id
                   where s.kitchen_id = k.id and i.active and s.stock_available <= i.min_stock),
      'aiRuns24h', (select count(*) from dk_ai_insights ai where ai.kitchen_id = k.id and ai.status in ('ok', 'error') and ai.created_at > now() - interval '24 hours'),
      'aiErrors24h', (select count(*) from dk_ai_insights ai where ai.kitchen_id = k.id and ai.status = 'error' and ai.created_at > now() - interval '24 hours'),
      'lastActivityAt', greatest(
        (select max(o.created_at) from dk_orders o where o.kitchen_id = k.id),
        (select max(l.created_at) from dk_audit_log l where l.kitchen_id = k.id))) as a
    from dk_kitchens k
    cross join lateral (
      select
        count(*) filter (where o.created_at >= dk_local_start(dk_local_date(now(), k.timezone), k.timezone) and o.status <> 'CANCELADO') as orders_today,
        coalesce(sum(o.total) filter (where o.created_at >= dk_local_start(dk_local_date(now(), k.timezone), k.timezone) and o.status <> 'CANCELADO'), 0) as sales_today,
        count(*) filter (where o.created_at >= dk_local_start(dk_local_date(now(), k.timezone), k.timezone) and o.status = 'CANCELADO') as cancelled_today,
        count(*) filter (where o.created_at >= dk_local_start(dk_local_date(now(), k.timezone), k.timezone) and o.status = 'ENTREGADO') as delivered_today,
        count(*) filter (where o.status <> 'CANCELADO') as orders_week,
        coalesce(sum(o.total) filter (where o.status <> 'CANCELADO'), 0) as sales_week
      from dk_orders o
      where o.kitchen_id = k.id and o.created_at >= dk_local_start(dk_local_date(now(), k.timezone) - 6, k.timezone)
    ) t
    where k.organization_id = p_organization_id
  ) x;

  select count(*) into v_users from dk_organization_members where organization_id = p_organization_id and status = 'active';
  select count(*) into v_active_users
  from dk_organization_members om join dk_users u on u.id = om.user_id
  where om.organization_id = p_organization_id and om.status = 'active'
    and ((select a.last_sign_in_at from auth.users a where a.id = u.auth_user_id) > now() - interval '7 days'
         or exists (select 1 from dk_audit_log l where l.changed_by = u.id and l.organization_id = p_organization_id and l.created_at > now() - interval '7 days'));

  -- Alertas (solo de datos reales).
  for v_account in select * from jsonb_to_recordset(v_accounts) as r(id uuid, name text, active boolean, late int, "lowStock" int, "aiErrors24h" int, "aiRuns24h" int, "lastActivityAt" timestamptz) loop
    if v_account.active and (v_account."lastActivityAt" is null or v_account."lastActivityAt" < now() - interval '7 days') then
      v_alerts := v_alerts || jsonb_build_object('severity', 'warning', 'type', 'inactive_account', 'accountId', v_account.id,
        'message', format('%s no tiene actividad hace más de 7 días', v_account.name));
    end if;
    if v_account.late > 0 then
      v_alerts := v_alerts || jsonb_build_object('severity', 'warning', 'type', 'late_orders', 'accountId', v_account.id,
        'message', format('%s: %s %s atrasado%s ahora', v_account.name, v_account.late, case when v_account.late = 1 then 'pedido' else 'pedidos' end, case when v_account.late = 1 then '' else 's' end));
    end if;
    if v_account."lowStock" > 0 then
      v_alerts := v_alerts || jsonb_build_object('severity', 'info', 'type', 'low_stock', 'accountId', v_account.id,
        'message', format('%s: %s %s bajo el mínimo', v_account.name, v_account."lowStock", case when v_account."lowStock" = 1 then 'insumo' else 'insumos' end));
    end if;
    if v_account."aiErrors24h" > 0 then
      v_alerts := v_alerts || jsonb_build_object('severity', 'error', 'type', 'ai_errors', 'accountId', v_account.id,
        'message', format('%s: %s análisis de IA con error en 24 h', v_account.name, v_account."aiErrors24h"));
    end if;
    if v_account."aiRuns24h" >= 0.8 * coalesce((v_limits ->> 'ai_runs_per_day')::integer, 50) then
      v_alerts := v_alerts || jsonb_build_object('severity', 'warning', 'type', 'ai_quota', 'accountId', v_account.id,
        'message', format('%s usó %s de %s análisis de IA en 24 h', v_account.name, v_account."aiRuns24h", coalesce((v_limits ->> 'ai_runs_per_day')::integer, 50)));
    end if;
  end loop;
  if v_sub.status = 'trialing' and v_sub.trial_ends_at < now() + interval '3 days' then
    v_alerts := v_alerts || jsonb_build_object('severity', case when v_sub.trial_ends_at < now() then 'error' else 'warning' end, 'type', 'trial',
      'message', case when v_sub.trial_ends_at < now() then 'La prueba gratis terminó' else format('La prueba gratis termina el %s', to_char(v_sub.trial_ends_at, 'DD/MM/YYYY')) end);
  end if;
  if (v_limits ->> 'accounts') is not null and jsonb_array_length(v_accounts) >= (v_limits ->> 'accounts')::integer then
    v_alerts := v_alerts || jsonb_build_object('severity', 'info', 'type', 'plan_limit', 'message', 'Llegaste al límite de cuentas de tu plan');
  end if;
  if (v_limits ->> 'users') is not null
     and (select count(*) from dk_organization_members where organization_id = p_organization_id and status in ('active', 'pending')) >= (v_limits ->> 'users')::integer then
    v_alerts := v_alerts || jsonb_build_object('severity', 'info', 'type', 'plan_limit', 'message', 'Llegaste al límite de usuarios de tu plan');
  end if;

  return jsonb_build_object(
    'generatedAt', now(),
    'totals', jsonb_build_object(
      'accountsActive', (select count(*) from jsonb_array_elements(v_accounts) a where (a ->> 'active')::boolean),
      'accountsInactive', (select count(*) from jsonb_array_elements(v_accounts) a where not (a ->> 'active')::boolean),
      'users', v_users,
      'activeUsers7d', v_active_users,
      'ordersToday', (select coalesce(sum((a ->> 'ordersToday')::int), 0) from jsonb_array_elements(v_accounts) a),
      'salesToday', (select coalesce(sum((a ->> 'salesToday')::numeric), 0) from jsonb_array_elements(v_accounts) a),
      'late', (select coalesce(sum((a ->> 'late')::int), 0) from jsonb_array_elements(v_accounts) a),
      'aiErrors24h', (select coalesce(sum((a ->> 'aiErrors24h')::int), 0) from jsonb_array_elements(v_accounts) a)),
    'accounts', v_accounts,
    'alerts', v_alerts,
    'recentEvents', (
      select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'createdAt', l.created_at, 'eventType', l.event_type, 'category', l.category,
                                                   'summary', l.summary, 'result', l.result,
                                                   'actor', (select full_name from dk_users where id = l.changed_by),
                                                   'account', (select name from dk_kitchens where id = l.kitchen_id))
                                order by l.created_at desc), '[]')
      from (select * from dk_audit_log
            where organization_id = p_organization_id and category <> 'operations'
            order by created_at desc limit 10) l));
end;
$$;

create or replace function dk_account_observability(p_organization_id uuid, p_kitchen_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_k dk_kitchens;
  v_today timestamptz;
  v_week timestamptz;
  v_limits jsonb;
begin
  if not dk_has_org_permission(p_organization_id, 'observability.view') then
    raise exception 'No autorizado para ver la observabilidad de esta organización';
  end if;
  select * into v_k from dk_kitchens where id = p_kitchen_id and organization_id = p_organization_id;
  if not found then raise exception 'La cuenta no pertenece a esta organización'; end if;
  v_today := dk_local_start(dk_local_date(now(), v_k.timezone), v_k.timezone);
  v_week := dk_local_start(dk_local_date(now(), v_k.timezone) - 6, v_k.timezone);
  select p.limits into v_limits from dk_subscriptions s join dk_plans p on p.key = s.plan_key where s.organization_id = p_organization_id;

  return jsonb_build_object(
    'generatedAt', now(),
    'account', jsonb_build_object('id', v_k.id, 'name', v_k.name, 'slug', v_k.slug, 'iconKey', v_k.icon_key, 'active', v_k.active, 'timezone', v_k.timezone),
    'orders', (
      select jsonb_build_object(
        'today', jsonb_build_object(
          'created', count(*) filter (where o.created_at >= v_today),
          'delivered', count(*) filter (where o.created_at >= v_today and o.status = 'ENTREGADO'),
          'cancelled', count(*) filter (where o.created_at >= v_today and o.status = 'CANCELADO'),
          'sales', coalesce(sum(o.total) filter (where o.created_at >= v_today and o.status <> 'CANCELADO'), 0)),
        'week', jsonb_build_object(
          'created', count(*),
          'delivered', count(*) filter (where o.status = 'ENTREGADO'),
          'cancelled', count(*) filter (where o.status = 'CANCELADO'),
          'sales', coalesce(sum(o.total) filter (where o.status <> 'CANCELADO'), 0)),
        'byChannel', (select coalesce(jsonb_object_agg(c.channel, c.n), '{}') from (
            select o2.channel::text as channel, count(*) as n from dk_orders o2
            where o2.kitchen_id = p_kitchen_id and o2.created_at >= v_week group by o2.channel) c),
        'byDay', (select coalesce(jsonb_agg(jsonb_build_object('date', d.day::date, 'orders', coalesce(x.n, 0), 'sales', coalesce(x.sales, 0)) order by d.day), '[]')
                  from generate_series(dk_local_date(now(), v_k.timezone) - 6, dk_local_date(now(), v_k.timezone), interval '1 day') d(day)
                  left join (select dk_local_date(o3.created_at, v_k.timezone) as day, count(*) as n, sum(o3.total) filter (where o3.status <> 'CANCELADO') as sales
                             from dk_orders o3 where o3.kitchen_id = p_kitchen_id and o3.created_at >= v_week and o3.status <> 'CANCELADO'
                             group by 1) x on x.day = d.day::date))
      from dk_orders o where o.kitchen_id = p_kitchen_id and o.created_at >= v_week),
    'inProgress', (select count(*) from dk_orders o where o.kitchen_id = p_kitchen_id and o.status in ('NUEVO', 'CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'DESPACHADO')),
    'late', dk_late_orders_count(p_kitchen_id),
    -- Minutos promedio de "en cola" (confirmado) a "listo", pedidos de los últimos 7 días.
    'avgPrepMinutes', (select round(avg(extract(epoch from l.changed_at - c.changed_at) / 60)::numeric, 1)
                       from dk_order_status_history c
                       join dk_order_status_history l on l.order_id = c.order_id and l.to_status = 'LISTO'
                       where c.kitchen_id = p_kitchen_id and c.to_status = 'CONFIRMADO' and c.changed_at >= v_week and l.changed_at > c.changed_at),
    'inventory', jsonb_build_object(
      'movements', (select coalesce(jsonb_object_agg(m.t, m.n), '{}') from (
          select movement_type::text as t, count(*) as n from dk_inventory_movements
          where kitchen_id = p_kitchen_id and created_at >= v_week group by movement_type) m),
      'lowStock', (select count(*) from dk_ingredient_stock s join dk_ingredients i on i.id = s.ingredient_id
                   where s.kitchen_id = p_kitchen_id and i.active and s.stock_available <= i.min_stock)),
    'purchases', jsonb_build_object(
      'confirmed', (select count(*) from dk_purchases where kitchen_id = p_kitchen_id and status = 'CONFIRMADA' and created_at >= v_week),
      'confirmedAmount', (select coalesce(sum(total), 0) from dk_purchases where kitchen_id = p_kitchen_id and status = 'CONFIRMADA' and created_at >= v_week),
      'drafts', (select count(*) from dk_purchases where kitchen_id = p_kitchen_id and status = 'BORRADOR')),
    'payments', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(amount), 0))
                 from dk_order_payments where kitchen_id = p_kitchen_id and created_at >= v_week),
    'ai', jsonb_build_object(
      'runs24h', (select count(*) from dk_ai_insights where kitchen_id = p_kitchen_id and status in ('ok', 'error') and created_at > now() - interval '24 hours'),
      'errors24h', (select count(*) from dk_ai_insights where kitchen_id = p_kitchen_id and status = 'error' and created_at > now() - interval '24 hours'),
      'limitPerDay', coalesce((v_limits ->> 'ai_runs_per_day')::integer, 50)),
    'features', (select coalesce(jsonb_agg(jsonb_build_object('key', f.key, 'label', f.label, 'category', f.category,
                                                               'includedInPlan', dk_plan_includes(p_organization_id, f.key),
                                                               'enabled', dk_feature_enabled(p_kitchen_id, f.key)) order by f.sort_order), '[]')
                 from dk_features f where f.active),
    'team', jsonb_build_object(
      'members', (select count(*) from dk_kitchen_members m where m.kitchen_id = p_kitchen_id and m.active),
      'active7d', (select count(*) from dk_kitchen_members m join dk_users u on u.id = m.user_id
                   where m.kitchen_id = p_kitchen_id and m.active
                     and ((select a.last_sign_in_at from auth.users a where a.id = u.auth_user_id) > now() - interval '7 days'
                          or exists (select 1 from dk_audit_log l where l.changed_by = u.id and l.kitchen_id = p_kitchen_id and l.created_at > now() - interval '7 days'))),
      'lastSignInAt', (select max(a.last_sign_in_at) from dk_kitchen_members m join dk_users u on u.id = m.user_id join auth.users a on a.id = u.auth_user_id
                       where m.kitchen_id = p_kitchen_id and m.active)),
    'modules', jsonb_build_object(
      'accountActive', v_k.active,
      'hoursConfigured', exists (select 1 from dk_kitchen_hours h where h.kitchen_id = p_kitchen_id and h.is_open),
      'slaConfigured', exists (select 1 from dk_kitchen_sla_settings s where s.kitchen_id = p_kitchen_id)),
    'recentChanges', (
      select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'createdAt', l.created_at, 'eventType', l.event_type, 'category', l.category,
                                                   'summary', l.summary, 'result', l.result,
                                                   'actor', (select full_name from dk_users where id = l.changed_by)) order by l.created_at desc), '[]')
      from (select * from dk_audit_log where kitchen_id = p_kitchen_id and category <> 'operations' order by created_at desc limit 10) l));
end;
$$;

revoke execute on function dk_kitchen_tz(uuid), dk_local_start(date, text), dk_local_date(timestamptz, text), dk_late_orders_count(uuid),
  dk_org_observability(uuid), dk_account_observability(uuid, uuid) from public, anon;
revoke execute on function dk_late_orders_count(uuid) from authenticated;
grant execute on function dk_kitchen_tz(uuid), dk_local_start(date, text), dk_local_date(timestamptz, text),
  dk_org_observability(uuid), dk_account_observability(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
