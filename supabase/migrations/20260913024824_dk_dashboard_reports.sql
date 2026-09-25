-- Dark Kitchen — Fase 8: Dashboard y Reportes.
-- Funciones de solo lectura (SECURITY INVOKER, el default): heredan el RLS
-- de quien llama, asi que un rol como INVENTORY o CASHIER automaticamente
-- solo ve lo que sus policies ya le permiten ver en las tablas base (ver
-- ADR 0005) sin necesidad de repetir la logica de permisos aqui.

create or replace function dk_dashboard_summary()
returns jsonb
language sql
stable
set search_path = public
as $$
  with sales as (
    select
      coalesce(sum(total) filter (where created_at::date = current_date), 0) as sales_today,
      coalesce(sum(total) filter (where created_at >= date_trunc('week', current_date)), 0) as sales_week,
      coalesce(sum(total) filter (where created_at >= date_trunc('month', current_date)), 0) as sales_month,
      count(*) filter (where created_at::date = current_date) as orders_today,
      count(*) filter (where created_at >= date_trunc('week', current_date)) as orders_week,
      count(*) filter (where created_at >= date_trunc('month', current_date)) as orders_month
    from dk_orders
    where status <> 'CANCELADO'
  ),
  inventory as (
    select
      coalesce(sum(s.stock_on_hand * i.avg_cost), 0) as inventory_value,
      count(*) filter (where s.stock_available <= i.min_stock) as low_stock_count
    from dk_ingredient_stock s
    join dk_ingredients i on i.id = s.ingredient_id
    where i.active
  ),
  waste as (
    select coalesce(sum(-quantity_base_unit * coalesce(unit_cost, 0)), 0) as waste_value_month
    from dk_inventory_movements m
    join dk_ingredients i on i.id = m.ingredient_id
    where m.movement_type = 'MERMA' and m.created_at >= date_trunc('month', current_date)
  ),
  purchases as (
    select coalesce(sum(total), 0) as purchases_month
    from dk_purchases
    where status = 'CONFIRMADA' and created_at >= date_trunc('month', current_date)
  ),
  operational as (
    select
      count(*) filter (where status = 'NUEVO') as nuevo,
      count(*) filter (where status = 'CONFIRMADO') as confirmado,
      count(*) filter (where status = 'EN_PREPARACION') as en_preparacion,
      count(*) filter (where status = 'LISTO') as listo,
      count(*) filter (where status = 'DESPACHADO') as despachado
    from dk_orders
  )
  select jsonb_build_object(
    'sales_today', sales.sales_today,
    'sales_week', sales.sales_week,
    'sales_month', sales.sales_month,
    'orders_today', sales.orders_today,
    'orders_week', sales.orders_week,
    'orders_month', sales.orders_month,
    'avg_ticket_month', case when sales.orders_month > 0 then sales.sales_month / sales.orders_month else 0 end,
    'inventory_value', inventory.inventory_value,
    'low_stock_count', inventory.low_stock_count,
    'waste_value_month', waste.waste_value_month,
    'purchases_month', purchases.purchases_month,
    'orders_nuevo', operational.nuevo,
    'orders_confirmado', operational.confirmado,
    'orders_en_preparacion', operational.en_preparacion,
    'orders_listo', operational.listo,
    'orders_despachado', operational.despachado
  )
  from sales, inventory, waste, purchases, operational;
$$;

revoke execute on function dk_dashboard_summary() from public, anon;
grant execute on function dk_dashboard_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- Reportes con rango de fecha
-- ---------------------------------------------------------------------------

create or replace function dk_report_sales_by_day(p_from date, p_to date)
returns table(day date, order_count bigint, total numeric)
language sql
stable
set search_path = public
as $$
  select created_at::date as day, count(*) as order_count, coalesce(sum(total), 0) as total
  from dk_orders
  where status <> 'CANCELADO' and created_at::date between p_from and p_to
  group by created_at::date
  order by day;
$$;

create or replace function dk_report_top_products(p_from date, p_to date)
returns table(product_id uuid, product_name text, qty_sold bigint, revenue numeric, estimated_cost numeric, margin numeric)
language sql
stable
set search_path = public
as $$
  select
    p.id, p.name,
    sum(oi.quantity) as qty_sold,
    sum(oi.line_total) as revenue,
    p.estimated_cost,
    sum(oi.line_total) - (sum(oi.quantity) * p.estimated_cost) as margin
  from dk_order_items oi
  join dk_orders o on o.id = oi.order_id
  join dk_products p on p.id = oi.product_id
  where o.status <> 'CANCELADO' and o.created_at::date between p_from and p_to
  group by p.id, p.name, p.estimated_cost
  order by qty_sold desc;
$$;

create or replace function dk_report_purchases_by_supplier(p_from date, p_to date)
returns table(supplier_id uuid, supplier_name text, purchase_count bigint, total numeric)
language sql
stable
set search_path = public
as $$
  select s.id, s.name, count(*) as purchase_count, coalesce(sum(pu.total), 0) as total
  from dk_purchases pu
  join dk_suppliers s on s.id = pu.supplier_id
  where pu.status = 'CONFIRMADA' and pu.created_at::date between p_from and p_to
  group by s.id, s.name
  order by total desc;
$$;

create or replace function dk_report_top_ingredients_purchased(p_from date, p_to date)
returns table(ingredient_id uuid, ingredient_name text, quantity numeric, total_cost numeric)
language sql
stable
set search_path = public
as $$
  select i.id, i.name, sum(m.quantity_base_unit) as quantity, sum(m.quantity_base_unit * coalesce(m.unit_cost, 0)) as total_cost
  from dk_inventory_movements m
  join dk_ingredients i on i.id = m.ingredient_id
  where m.movement_type = 'COMPRA' and m.created_at::date between p_from and p_to
  group by i.id, i.name
  order by total_cost desc;
$$;

create or replace function dk_report_waste(p_from date, p_to date)
returns table(ingredient_id uuid, ingredient_name text, quantity numeric, estimated_value numeric)
language sql
stable
set search_path = public
as $$
  select i.id, i.name, sum(-m.quantity_base_unit) as quantity, sum(-m.quantity_base_unit * coalesce(m.unit_cost, 0)) as estimated_value
  from dk_inventory_movements m
  join dk_ingredients i on i.id = m.ingredient_id
  where m.movement_type = 'MERMA' and m.created_at::date between p_from and p_to
  group by i.id, i.name
  order by estimated_value desc;
$$;

create or replace function dk_report_profitability(p_from date, p_to date)
returns table(revenue numeric, cogs numeric, gross_margin numeric)
language sql
stable
set search_path = public
as $$
  with rev as (
    select coalesce(sum(total), 0) as revenue
    from dk_orders
    where status <> 'CANCELADO' and created_at::date between p_from and p_to
  ),
  cost as (
    select coalesce(sum(-quantity_base_unit * coalesce(unit_cost, 0)), 0) as cogs
    from dk_inventory_movements
    where movement_type = 'CONSUMO' and created_at::date between p_from and p_to
  )
  select rev.revenue, cost.cogs, rev.revenue - cost.cogs
  from rev, cost;
$$;

revoke execute on function dk_report_sales_by_day(date, date) from public, anon;
grant execute on function dk_report_sales_by_day(date, date) to authenticated;
revoke execute on function dk_report_top_products(date, date) from public, anon;
grant execute on function dk_report_top_products(date, date) to authenticated;
revoke execute on function dk_report_purchases_by_supplier(date, date) from public, anon;
grant execute on function dk_report_purchases_by_supplier(date, date) to authenticated;
revoke execute on function dk_report_top_ingredients_purchased(date, date) from public, anon;
grant execute on function dk_report_top_ingredients_purchased(date, date) to authenticated;
revoke execute on function dk_report_waste(date, date) from public, anon;
grant execute on function dk_report_waste(date, date) to authenticated;
revoke execute on function dk_report_profitability(date, date) from public, anon;
grant execute on function dk_report_profitability(date, date) to authenticated;
