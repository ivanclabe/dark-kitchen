-- ADR 0027: Insights — how the business is doing, from real data only.
--
-- One aggregated query per screen (nothing is downloaded row by row), always
-- for the ACTIVE account (x-dk-kitchen-id), in its time zone, with the same
-- permissions as the old reports: reports.view for sales, purchases and waste;
-- reports.profitability for cost of goods sold, gross profit and margin.
--
-- Sources (each figure can be traced back):
--   Revenue            dk_orders.total of non-cancelled orders (delivery included)
--   Net product revenue dk_orders.subtotal − discount (with a category/product filter: Σ dk_order_items.line_total)
--   COGS               per sold item, its REAL consumption: dk_inventory_movements CONSUMO with
--                      reference_type 'order_item' (unit_cost = average cost at that moment) minus
--                      what was given back by a correction ('order_item_revert'); an item not prepared
--                      yet uses its recipe estimate (dk_products.estimated_cost) and is reported as such.
--   Gross profit       net product revenue − COGS; gross margin = gross profit / net product revenue
--   Purchases          dk_purchases CONFIRMADA by invoice date (inventory, not COGS); per ingredient from dk_purchase_items
--   Waste              dk_inventory_movements MERMA × unit_cost
-- Revenue and COGS of an order fall on the order's LOCAL date, so both land in the same period.
-- The old dk_report_* functions stay (unused) for compatibility.

create index if not exists dk_inventory_movements_order_item_idx
  on dk_inventory_movements (reference_id) where reference_type in ('order_item', 'order_item_revert');

-- Sold items of the active account in a window, with their cost (internal helper).
create or replace function dk_insights_items(p_kitchen uuid, p_from date, p_to date, p_tz text, p_category uuid, p_product uuid)
returns table (
  item_id uuid, order_id uuid, order_at timestamptz, local_day date, product_id uuid, product_name text,
  category_id uuid, category_name text, quantity integer, line_total numeric, cost numeric, cost_source text
)
language sql
stable
security definer
set search_path = public
as $$
  with items as (
    select oi.id, oi.order_id, o.created_at, dk_local_date(o.created_at, p_tz) as local_day, oi.product_id, p.name as product_name,
           p.category_id, c.name as category_name, oi.quantity, oi.line_total, p.estimated_cost
    from dk_order_items oi
    join dk_orders o on o.id = oi.order_id
    join dk_products p on p.id = oi.product_id
    left join dk_product_categories c on c.id = p.category_id
    where o.kitchen_id = p_kitchen
      and o.status <> 'CANCELADO'
      and o.created_at >= dk_local_start(p_from, p_tz)
      and o.created_at < dk_local_start(p_to + 1, p_tz)
      and (p_category is null or p.category_id = p_category)
      and (p_product is null or oi.product_id = p_product)
  ),
  consumed as (
    select m.reference_id as item_id, m.ingredient_id,
           sum(-m.quantity_base_unit) as qty,
           sum(-m.quantity_base_unit * coalesce(m.unit_cost, 0)) as cost
    from dk_inventory_movements m
    where m.kitchen_id = p_kitchen and m.reference_type = 'order_item' and m.movement_type = 'CONSUMO'
      and m.reference_id in (select id from items)
    group by 1, 2
  ),
  returned as (
    select m.reference_id as item_id, m.ingredient_id, sum(m.quantity_base_unit) as qty
    from dk_inventory_movements m
    where m.kitchen_id = p_kitchen and m.reference_type = 'order_item_revert' and m.movement_type = 'DEVOLUCION'
      and m.reference_id in (select id from items)
    group by 1, 2
  ),
  real_cost as (
    -- What stays consumed, at the cost it was consumed with.
    select c.item_id,
           sum(case when c.qty > 0 then c.cost * greatest(c.qty - coalesce(r.qty, 0), 0) / c.qty else 0 end) as cost,
           sum(greatest(c.qty - coalesce(r.qty, 0), 0)) as net_qty
    from consumed c left join returned r on r.item_id = c.item_id and r.ingredient_id = c.ingredient_id
    group by c.item_id
  )
  select i.id, i.order_id, i.created_at, i.local_day, i.product_id, i.product_name, i.category_id, i.category_name, i.quantity, i.line_total,
         case when rc.net_qty > 0 then round(rc.cost, 2)
              when coalesce(i.estimated_cost, 0) > 0 then round(i.quantity * i.estimated_cost, 2)
              else null end,
         case when rc.net_qty > 0 then 'real'
              when coalesce(i.estimated_cost, 0) > 0 then 'estimated'
              else 'none' end
  from items i left join real_cost rc on rc.item_id = i.id;
$$;
revoke all on function dk_insights_items(uuid, date, date, text, uuid, uuid) from public, anon, authenticated;

-- KPIs of a window (internal helper).
create or replace function dk_insights_kpis(p_kitchen uuid, p_from date, p_to date, p_tz text, p_category uuid, p_product uuid, p_costs boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_filtered boolean := p_category is not null or p_product is not null;
  v_revenue numeric;
  v_net numeric;
  v_orders bigint;
  v_items record;
begin
  select coalesce(sum(line_total), 0) as line_revenue,
         coalesce(sum(cost), 0) as cogs,
         coalesce(sum(cost) filter (where cost_source = 'estimated'), 0) as estimated,
         coalesce(sum(line_total) filter (where cost_source <> 'none'), 0) as covered,
         count(distinct order_id) as orders,
         coalesce(sum(quantity), 0) as units
  into v_items
  from dk_insights_items(p_kitchen, p_from, p_to, p_tz, p_category, p_product);

  if v_filtered then
    v_revenue := v_items.line_revenue;
    v_net := v_items.line_revenue;
    v_orders := v_items.orders;
  else
    select coalesce(sum(total), 0), coalesce(sum(subtotal - discount), 0), count(*)
    into v_revenue, v_net, v_orders
    from dk_orders
    where kitchen_id = p_kitchen and status <> 'CANCELADO'
      and created_at >= dk_local_start(p_from, p_tz) and created_at < dk_local_start(p_to + 1, p_tz);
  end if;

  return jsonb_build_object(
    'revenue', v_revenue,
    'netRevenue', v_net,
    'orders', v_orders,
    'units', v_items.units,
    'averageOrderValue', case when v_orders > 0 then round(v_revenue / v_orders, 2) end)
    || case when p_costs then jsonb_build_object(
      'cogs', v_items.cogs,
      'grossProfit', v_net - v_items.cogs,
      'grossMargin', case when v_net > 0 then round((v_net - v_items.cogs) / v_net, 4) end,
      'estimatedCogs', v_items.estimated,
      'costCoverage', case when v_items.line_revenue > 0 then round(v_items.covered / v_items.line_revenue, 4) end)
    else '{}'::jsonb end;
end;
$$;
revoke all on function dk_insights_kpis(uuid, date, date, text, uuid, uuid, boolean) from public, anon, authenticated;

create or replace function dk_insights(
  p_from date,
  p_to date,
  p_compare_from date default null,
  p_compare_to date default null,
  p_category uuid default null,
  p_product uuid default null
)
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
  v_compare boolean := p_compare_from is not null and p_compare_to is not null;
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  if not dk_can('reports.view') then
    raise exception 'No autorizado para ver Insights de esta cuenta' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Periodo inválido'; end if;
  if p_to - p_from > 400 or (v_compare and (p_compare_to < p_compare_from or p_compare_to - p_compare_from > 400)) then
    raise exception 'El periodo no puede superar 400 días';
  end if;
  select timezone, currency into v_tz, v_currency from dk_kitchens where id = v_kitchen;
  v_costs := dk_can('reports.profitability');

  return jsonb_build_object(
    'timezone', v_tz,
    'currency', v_currency,
    'profitability', v_costs,
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'compare', case when v_compare then jsonb_build_object('from', p_compare_from, 'to', p_compare_to) end,
    'current', dk_insights_kpis(v_kitchen, p_from, p_to, v_tz, p_category, p_product, v_costs),
    'previous', case when v_compare then dk_insights_kpis(v_kitchen, p_compare_from, p_compare_to, v_tz, p_category, p_product, v_costs) end,

    -- Every day of the period (zeros included), in the account's time zone.
    'daily', (
      with items as (select * from dk_insights_items(v_kitchen, p_from, p_to, v_tz, p_category, p_product)),
      orders as (
        select dk_local_date(created_at, v_tz) as day, count(*) as orders, sum(total) as revenue, sum(subtotal - discount) as net
        from dk_orders
        where kitchen_id = v_kitchen and status <> 'CANCELADO'
          and created_at >= dk_local_start(p_from, v_tz) and created_at < dk_local_start(p_to + 1, v_tz)
        group by 1
      ),
      by_item as (
        select local_day as day, count(distinct order_id) as orders, sum(line_total) as revenue, sum(cost) as cogs
        from items group by 1
      )
      select coalesce(jsonb_agg(jsonb_build_object(
          'date', d.day,
          'revenue', coalesce(case when p_category is null and p_product is null then o.revenue else bi.revenue end, 0),
          'netRevenue', coalesce(case when p_category is null and p_product is null then o.net else bi.revenue end, 0),
          'orders', coalesce(case when p_category is null and p_product is null then o.orders else bi.orders end, 0))
          || case when v_costs then jsonb_build_object('cogs', coalesce(bi.cogs, 0)) else '{}'::jsonb end
        order by d.day), '[]')
      from generate_series(p_from, p_to, interval '1 day') as g(ts)
      cross join lateral (select g.ts::date as day) d
      left join orders o on o.day = d.day
      left join by_item bi on bi.day = d.day),

    -- Products: current period, with the previous one for the comparison.
    'products', (
      with cur as (
        select product_id, max(product_name) as name, max(category_id::text) as category_id, max(category_name) as category_name,
               sum(quantity) as units, sum(line_total) as revenue, sum(cost) as cogs,
               sum(line_total) filter (where cost_source = 'none') as uncovered,
               sum(cost) filter (where cost_source = 'real') as real_cost, sum(quantity) filter (where cost_source = 'real') as real_units
        from dk_insights_items(v_kitchen, p_from, p_to, v_tz, p_category, p_product) group by product_id
      ),
      prev as (
        select product_id, sum(quantity) as units, sum(line_total) as revenue,
               sum(cost) filter (where cost_source = 'real') as real_cost, sum(quantity) filter (where cost_source = 'real') as real_units
        from dk_insights_items(v_kitchen, coalesce(p_compare_from, p_from), coalesce(p_compare_to, p_from - 1), v_tz, p_category, p_product)
        where v_compare
        group by product_id
      )
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', c.product_id, 'name', c.name, 'categoryId', c.category_id, 'categoryName', c.category_name,
          'units', c.units, 'revenue', c.revenue, 'previousRevenue', p.revenue, 'previousUnits', p.units)
          || case when v_costs then jsonb_build_object(
            'cogs', c.cogs, 'grossProfit', c.revenue - coalesce(c.cogs, 0),
            'grossMargin', case when c.revenue > 0 and c.cogs is not null then round((c.revenue - c.cogs) / c.revenue, 4) end,
            'costCoverage', case when c.revenue > 0 then round(1 - coalesce(c.uncovered, 0) / c.revenue, 4) end,
            'unitCost', case when c.real_units > 0 then round(c.real_cost / c.real_units, 2) end,
            'previousUnitCost', case when p.real_units > 0 then round(p.real_cost / p.real_units, 2) end,
            'realUnits', coalesce(c.real_units, 0), 'previousRealUnits', coalesce(p.real_units, 0))
          else '{}'::jsonb end
        order by c.revenue desc), '[]')
      from cur c left join prev p on p.product_id = c.product_id),

    -- Categories ("Sin categoría" when a product has none).
    'categories', (
      with cur as (
        select category_id, max(category_name) as name, sum(line_total) as revenue, sum(cost) as cogs, sum(quantity) as units
        from dk_insights_items(v_kitchen, p_from, p_to, v_tz, p_category, p_product) group by category_id
      ),
      prev as (
        select category_id, sum(line_total) as revenue
        from dk_insights_items(v_kitchen, coalesce(p_compare_from, p_from), coalesce(p_compare_to, p_from - 1), v_tz, p_category, p_product)
        where v_compare group by category_id
      )
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', c.category_id, 'name', c.name, 'units', c.units, 'revenue', c.revenue, 'previousRevenue', p.revenue)
          || case when v_costs then jsonb_build_object(
            'cogs', c.cogs, 'grossProfit', c.revenue - coalesce(c.cogs, 0),
            'grossMargin', case when c.revenue > 0 and c.cogs is not null then round((c.revenue - c.cogs) / c.revenue, 4) end)
          else '{}'::jsonb end
        order by c.revenue desc), '[]')
      from cur c left join prev p on p.category_id is not distinct from c.category_id),

    -- When and where it sells (orders of the period; with a filter, the orders that include it).
    'channels', (
      select coalesce(jsonb_agg(jsonb_build_object('channel', x.channel, 'orders', x.orders, 'revenue', x.revenue) order by x.revenue desc), '[]')
      from (
        select o.channel::text as channel, count(*) as orders, sum(o.total) as revenue
        from dk_orders o
        where o.kitchen_id = v_kitchen and o.status <> 'CANCELADO'
          and o.created_at >= dk_local_start(p_from, v_tz) and o.created_at < dk_local_start(p_to + 1, v_tz)
          and (p_category is null and p_product is null
               or o.id in (select order_id from dk_insights_items(v_kitchen, p_from, p_to, v_tz, p_category, p_product)))
        group by o.channel) x),
    'byWeekday', (
      select coalesce(jsonb_agg(jsonb_build_object('weekday', x.dow, 'orders', x.orders, 'revenue', x.revenue) order by x.dow), '[]')
      from (
        select extract(isodow from (o.created_at at time zone v_tz))::int as dow, count(*) as orders, sum(o.total) as revenue
        from dk_orders o
        where o.kitchen_id = v_kitchen and o.status <> 'CANCELADO'
          and o.created_at >= dk_local_start(p_from, v_tz) and o.created_at < dk_local_start(p_to + 1, v_tz)
          and (p_category is null and p_product is null
               or o.id in (select order_id from dk_insights_items(v_kitchen, p_from, p_to, v_tz, p_category, p_product)))
        group by 1) x),
    'byHour', (
      select coalesce(jsonb_agg(jsonb_build_object('hour', x.hour, 'orders', x.orders, 'revenue', x.revenue) order by x.hour), '[]')
      from (
        select extract(hour from (o.created_at at time zone v_tz))::int as hour, count(*) as orders, sum(o.total) as revenue
        from dk_orders o
        where o.kitchen_id = v_kitchen and o.status <> 'CANCELADO'
          and o.created_at >= dk_local_start(p_from, v_tz) and o.created_at < dk_local_start(p_to + 1, v_tz)
          and (p_category is null and p_product is null
               or o.id in (select order_id from dk_insights_items(v_kitchen, p_from, p_to, v_tz, p_category, p_product)))
        group by 1) x),

    -- Purchases (confirmed) and ingredient prices, by their own local date. They do not depend on the product filters.
    'purchases', jsonb_build_object(
      'total', (select coalesce(sum(total), 0) from dk_purchases
                where kitchen_id = v_kitchen and status = 'CONFIRMADA' and invoice_date between p_from and p_to),
      'previousTotal', case when v_compare then (select coalesce(sum(total), 0) from dk_purchases
                where kitchen_id = v_kitchen and status = 'CONFIRMADA' and invoice_date between p_compare_from and p_compare_to) end,
      'bySupplier', (
        select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'purchases', x.n, 'total', x.total) order by x.total desc), '[]')
        from (
          select s.id, s.name, count(*) as n, sum(pu.total) as total
          from dk_purchases pu join dk_suppliers s on s.id = pu.supplier_id
          where pu.kitchen_id = v_kitchen and pu.status = 'CONFIRMADA' and pu.invoice_date between p_from and p_to
          group by s.id, s.name) x),
      'ingredients', (
        -- Average purchase price per ingredient AND unit, so a kilo is never compared with a gram.
        with lines as (
          select pi.ingredient_id, pi.purchase_unit_id, pi.quantity, pi.line_total,
                 pu.invoice_date between p_from and p_to as is_current
          from dk_purchase_items pi join dk_purchases pu on pu.id = pi.purchase_id
          where pu.kitchen_id = v_kitchen and pu.status = 'CONFIRMADA'
            and (pu.invoice_date between p_from and p_to or (v_compare and pu.invoice_date between p_compare_from and p_compare_to))
        ),
        agg as (
          select ingredient_id, purchase_unit_id,
                 sum(quantity) filter (where is_current) as qty, sum(line_total) filter (where is_current) as total,
                 count(*) filter (where is_current) as n,
                 sum(quantity) filter (where not is_current) as prev_qty, sum(line_total) filter (where not is_current) as prev_total,
                 count(*) filter (where not is_current) as prev_n
          from lines group by 1, 2
        )
        select coalesce(jsonb_agg(jsonb_build_object(
            'id', a.ingredient_id, 'name', i.name, 'unit', u.code, 'quantity', a.qty, 'total', a.total, 'purchases', a.n,
            'averagePrice', case when a.qty > 0 then round(a.total / a.qty, 2) end,
            'previousAveragePrice', case when a.prev_qty > 0 then round(a.prev_total / a.prev_qty, 2) end,
            'previousPurchases', a.prev_n)
          order by a.total desc), '[]')
        from agg a join dk_ingredients i on i.id = a.ingredient_id left join dk_units u on u.id = a.purchase_unit_id
        where a.n > 0)),

    -- Waste (a loss, not COGS).
    'waste', jsonb_build_object(
      'total', (select coalesce(sum(-quantity_base_unit * coalesce(unit_cost, 0)), 0) from dk_inventory_movements
                where kitchen_id = v_kitchen and movement_type = 'MERMA'
                  and created_at >= dk_local_start(p_from, v_tz) and created_at < dk_local_start(p_to + 1, v_tz)),
      'previousTotal', case when v_compare then (select coalesce(sum(-quantity_base_unit * coalesce(unit_cost, 0)), 0) from dk_inventory_movements
                where kitchen_id = v_kitchen and movement_type = 'MERMA'
                  and created_at >= dk_local_start(p_compare_from, v_tz) and created_at < dk_local_start(p_compare_to + 1, v_tz)) end,
      'byIngredient', (
        select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'unit', x.unit, 'quantity', x.qty, 'value', x.value) order by x.value desc), '[]')
        from (
          select i.id, i.name, u.code as unit, sum(-m.quantity_base_unit) as qty, sum(-m.quantity_base_unit * coalesce(m.unit_cost, 0)) as value
          from dk_inventory_movements m join dk_ingredients i on i.id = m.ingredient_id left join dk_units u on u.id = i.base_unit_id
          where m.kitchen_id = v_kitchen and m.movement_type = 'MERMA'
            and m.created_at >= dk_local_start(p_from, v_tz) and m.created_at < dk_local_start(p_to + 1, v_tz)
          group by i.id, i.name, u.code) x))
  );
end;
$$;

-- The orders behind a product in the period (drill-down to the order).
create or replace function dk_insights_product_orders(p_product uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_tz text;
  v_costs boolean;
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  if not dk_can('reports.view') then
    raise exception 'No autorizado para ver Insights de esta cuenta' using errcode = '42501';
  end if;
  select timezone into v_tz from dk_kitchens where id = v_kitchen;
  v_costs := dk_can('reports.profitability');
  return coalesce((
    select jsonb_agg(x.row order by x.at desc)
    from (
      select it.order_at as at,
             jsonb_build_object('orderId', it.order_id, 'orderNumber', o.order_number, 'createdAt', it.order_at, 'channel', o.channel,
                                'quantity', it.quantity, 'revenue', it.line_total)
             || case when v_costs then jsonb_build_object('cost', it.cost, 'costSource', it.cost_source) else '{}'::jsonb end as row
      from dk_insights_items(v_kitchen, p_from, p_to, v_tz, null, p_product) it
      join dk_orders o on o.id = it.order_id
      order by it.order_at desc
      limit 100) x), '[]');
end;
$$;

revoke all on function dk_insights(date, date, date, date, uuid, uuid) from public, anon;
revoke all on function dk_insights_product_orders(uuid, date, date) from public, anon;
grant execute on function dk_insights(date, date, date, date, uuid, uuid) to authenticated;
grant execute on function dk_insights_product_orders(uuid, date, date) to authenticated;
