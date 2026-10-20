-- ADR 0072: the series behind «Destacado» (the account's home). Read-only, for the ACTIVE account and in its
-- time zone: orders, sales, average ticket, time in the kitchen, cancellations, channels and best sellers, by
-- hour (up to 7 days) or by day (up to 92). The cost of food only with reports.profitability. Sales follow the
-- same rule as Insights (dk_is_sale_status: neither new nor cancelled).

create or replace function dk_dashboard_series(p_from date, p_to date, p_granularity text default 'day')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_tz text;
  v_currency text;
  v_costs boolean;
  v_step interval;
  v_start timestamptz;
  v_end timestamptz;
  v_days integer := p_to - p_from + 1;
  v_prev_from date := p_from - (p_to - p_from + 1);
  v_prev_to date := p_from - 1;
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta' using errcode = '42501'; end if;
  if not (dk_can('dashboard.view') or dk_can('reports.view')) then
    raise exception 'No tienes permiso para ver las métricas de la cuenta' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Rango de fechas inválido' using hint = 'invalid'; end if;
  if v_days > 92 then raise exception 'El rango puede tener hasta 92 días' using hint = 'invalid'; end if;
  if p_granularity not in ('hour', 'day') then raise exception 'Granularidad inválida' using hint = 'invalid'; end if;
  if p_granularity = 'hour' and v_days > 7 then raise exception 'Cada hora solo hasta 7 días' using hint = 'invalid'; end if;

  select timezone, currency into v_tz, v_currency from dk_kitchens where id = v_kitchen;
  v_costs := dk_can('reports.profitability');
  v_step := case p_granularity when 'hour' then interval '1 hour' else interval '1 day' end;
  v_start := dk_local_start(p_from, v_tz);
  v_end := dk_local_start(p_to + 1, v_tz);

  return (
    with buckets as (
      -- Local wall-clock buckets (a day is a local day even across a DST change).
      select b as local_start
      from generate_series((v_start at time zone v_tz), (v_end at time zone v_tz) - v_step, v_step) b
    ),
    orders as (
      select o.id, o.status, o.channel, o.total, date_trunc(p_granularity, o.created_at at time zone v_tz) as bucket
      from dk_orders o
      where o.kitchen_id = v_kitchen and o.created_at >= v_start and o.created_at < v_end
    ),
    kitchen as (
      -- From the first «En preparación» to the first «Listo» of each order (minutes).
      select date_trunc(p_granularity, s.started at time zone v_tz) as bucket,
             extract(epoch from (r.ready - s.started)) / 60.0 as minutes
      from (select order_id, min(changed_at) as started from dk_order_status_history
            where kitchen_id = v_kitchen and to_status = 'EN_PREPARACION' and changed_at >= v_start and changed_at < v_end
            group by order_id) s
      join (select order_id, min(changed_at) as ready from dk_order_status_history
            where kitchen_id = v_kitchen and to_status = 'LISTO' group by order_id) r on r.order_id = s.order_id and r.ready >= s.started
    ),
    items as (
      select date_trunc(p_granularity, i.order_at at time zone v_tz) as bucket, i.product_id, i.product_name, i.quantity, i.line_total, i.cost
      from dk_insights_items(v_kitchen, p_from, p_to, v_tz, null, null) i
    ),
    points as (
      select b.local_start,
             count(o.id) filter (where dk_is_sale_status(o.status)) as orders,
             coalesce(sum(o.total) filter (where dk_is_sale_status(o.status)), 0) as revenue,
             count(o.id) filter (where o.status = 'CANCELADO') as cancelled,
             count(o.id) filter (where o.status <> 'NUEVO') as decided
      from buckets b left join orders o on o.bucket = b.local_start
      group by b.local_start
    ),
    kitchen_points as (
      select bucket, avg(minutes) as minutes from kitchen group by bucket
    ),
    cost_points as (
      select bucket, sum(cost) as cost, sum(line_total) filter (where cost is not null) as covered_revenue from items group by bucket
    ),
    totals as (
      select count(*) filter (where dk_is_sale_status(status)) as orders,
             coalesce(sum(total) filter (where dk_is_sale_status(status)), 0) as revenue,
             count(*) filter (where status = 'CANCELADO') as cancelled,
             count(*) filter (where status <> 'NUEVO') as decided
      from orders
    ),
    previous as (
      select count(*) filter (where dk_is_sale_status(status)) as orders,
             coalesce(sum(total) filter (where dk_is_sale_status(status)), 0) as revenue,
             count(*) filter (where status = 'CANCELADO') as cancelled,
             count(*) filter (where status <> 'NUEVO') as decided
      from dk_orders
      where kitchen_id = v_kitchen and created_at >= dk_local_start(v_prev_from, v_tz) and created_at < dk_local_start(v_prev_to + 1, v_tz)
    ),
    previous_kitchen as (
      select avg(extract(epoch from (r.ready - s.started)) / 60.0) as minutes
      from (select order_id, min(changed_at) as started from dk_order_status_history
            where kitchen_id = v_kitchen and to_status = 'EN_PREPARACION'
              and changed_at >= dk_local_start(v_prev_from, v_tz) and changed_at < v_start group by order_id) s
      join (select order_id, min(changed_at) as ready from dk_order_status_history
            where kitchen_id = v_kitchen and to_status = 'LISTO' group by order_id) r on r.order_id = s.order_id and r.ready >= s.started
    )
    select jsonb_build_object(
      'timezone', v_tz,
      'currency', v_currency,
      'granularity', p_granularity,
      'profitability', v_costs,
      'period', jsonb_build_object('from', p_from, 'to', p_to),
      'previousPeriod', jsonb_build_object('from', v_prev_from, 'to', v_prev_to),
      'points', coalesce((
        select jsonb_agg(jsonb_build_object(
          't', to_char(p.local_start, 'YYYY-MM-DD"T"HH24:MI'),
          'orders', p.orders,
          'revenue', p.revenue,
          'averageTicket', case when p.orders > 0 then round(p.revenue / p.orders) end,
          'cancelledRate', case when p.decided > 0 then round(p.cancelled::numeric / p.decided, 4) end,
          'kitchenMinutes', round(k.minutes::numeric, 1)
        ) || case when v_costs then jsonb_build_object('foodCostRate', case when c.covered_revenue > 0 then round(c.cost / c.covered_revenue, 4) end) else '{}' end
        order by p.local_start)
        from points p
        left join kitchen_points k on k.bucket = p.local_start
        left join cost_points c on c.bucket = p.local_start), '[]'),
      'totals', (
        select jsonb_build_object(
          'orders', t.orders,
          'revenue', t.revenue,
          'averageTicket', case when t.orders > 0 then round(t.revenue / t.orders) end,
          'cancelledRate', case when t.decided > 0 then round(t.cancelled::numeric / t.decided, 4) end,
          'kitchenMinutes', (select round(avg(minutes)::numeric, 1) from kitchen)
        ) || case when v_costs then jsonb_build_object('foodCostRate',
               (select case when sum(line_total) filter (where cost is not null) > 0
                            then round(sum(cost) / sum(line_total) filter (where cost is not null), 4) end from items)) else '{}' end
        from totals t),
      'previous', (
        select jsonb_build_object(
          'orders', pv.orders,
          'revenue', pv.revenue,
          'averageTicket', case when pv.orders > 0 then round(pv.revenue / pv.orders) end,
          'cancelledRate', case when pv.decided > 0 then round(pv.cancelled::numeric / pv.decided, 4) end,
          'kitchenMinutes', (select round(minutes::numeric, 1) from previous_kitchen))
        from previous pv),
      'channels', coalesce((
        select jsonb_agg(jsonb_build_object('channel', x.channel, 'orders', x.orders, 'revenue', x.revenue) order by x.orders desc)
        from (select channel::text as channel, count(*) as orders, sum(total) as revenue from orders
              where dk_is_sale_status(status) group by channel) x), '[]'),
      'topProducts', coalesce((
        select jsonb_agg(jsonb_build_object('id', x.product_id, 'name', x.product_name, 'units', x.units, 'revenue', x.revenue) order by x.units desc, x.revenue desc)
        from (select product_id, max(product_name) as product_name, sum(quantity) as units, sum(line_total) as revenue
              from items group by product_id order by sum(quantity) desc, sum(line_total) desc limit 5) x), '[]')
    )
  );
end;
$$;

revoke all on function dk_dashboard_series(date, date, text) from public, anon;
grant execute on function dk_dashboard_series(date, date, text) to authenticated;

comment on function dk_dashboard_series(date, date, text) is 'Series de «Destacado» (ADR 0072): por hora (hasta 7 días) o por día (hasta 92), en la zona horaria de la cuenta activa. Costo de comida solo con reports.profitability.';
