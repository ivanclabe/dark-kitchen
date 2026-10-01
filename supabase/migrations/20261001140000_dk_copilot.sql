-- ADR 0020: Quanela Copilot — questions about the account's real data.
--
-- The model never touches tables. It calls read-only "tools", one database
-- function each (dk_copilot_*). Every tool:
--   * is SECURITY INVOKER: it runs as the person, so RLS keeps it inside the
--     active account and shows only what that person sees in the app;
--   * requires its permission first (dk_require), with a clear error;
--   * returns small, already-summed JSON (row limits), never raw tables.
-- Nothing is stored here: each question is recorded by the Edge Function in
-- dk_ai_insights (feature 'copilot'), like every other AI run.

-- ---------------------------------------------------------------------------
-- 0. A conversation needs seconds between questions, not the 30 s floor of the
--    automatic analyses. The floor goes down to 2 s; every feature keeps its
--    own value (only Copilot uses a short one). Same change in the platform
--    function that edits it (same body, only the floor).
-- ---------------------------------------------------------------------------
alter table dk_features drop constraint dk_features_min_interval_seconds_check;
alter table dk_features add constraint dk_features_min_interval_seconds_check check (min_interval_seconds between 2 and 86400);

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
  if p_min_interval_seconds is not null and p_min_interval_seconds <> 0 and p_min_interval_seconds not between 2 and 86400 then
    raise exception 'El intervalo mínimo debe estar entre 2 segundos y 24 horas';
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

-- ---------------------------------------------------------------------------
-- 1. Permission and feature
-- ---------------------------------------------------------------------------
insert into dk_permissions (key, module, action, scope, label, description, sort_order) values
  ('copilot.use', 'copilot', 'use', 'account', 'Usar Quanela Copilot', 'Hacer preguntas sobre los datos de la cuenta; responde solo con lo que el rol puede ver', 185)
on conflict (key) do nothing;

-- Every system role can ask (each tool still checks its own permission).
insert into dk_role_permissions (role_id, permission_key)
select r.id, 'copilot.use' from dk_roles r where r.is_system
on conflict do nothing;

insert into dk_features (key, category, label, description, uses_model, model_key, use_permission, manage_permission,
                         default_available, default_enabled, active, min_interval_seconds, settings_schema, default_settings, depends_on, sort_order)
values ('copilot', 'ai', 'Quanela Copilot', 'Responde preguntas sobre ventas, pedidos, cocina, platos, insumos, clientes, entregas y turnos con los datos reales de la cuenta.',
        true, 'claude-sonnet-5-5', 'copilot.use', 'ai.manage', true, true, true, 5, '{}'::jsonb, '{}'::jsonb, '{}', 5)
on conflict (key) do nothing;

-- Same plans as the other AI features (D6).
insert into dk_plan_features (plan_key, feature_key)
select distinct pf.plan_key, 'copilot' from dk_plan_features pf where pf.feature_key = 'kitchen_insights'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------
create or replace function dk_account_tz()
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce((select timezone from dk_kitchens where id = dk_current_kitchen_id()), 'America/Bogota');
$$;

-- Guard for date ranges: required, ordered, at most ~13 months.
create or replace function dk_copilot_range(p_from date, p_to date)
returns void
language plpgsql
immutable
as $$
begin
  if p_from is null or p_to is null then raise exception 'Indica el rango de fechas'; end if;
  if p_to < p_from then raise exception 'La fecha final es anterior a la inicial'; end if;
  if p_to - p_from > 400 then raise exception 'El rango máximo es de un año'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Tools
-- ---------------------------------------------------------------------------

-- Sales: totals of the period, grouped, and optionally against the previous period of the same length.
create or replace function dk_copilot_sales(p_from date, p_to date, p_group_by text default 'day', p_compare boolean default false)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  tz text := dk_account_tz();
  v_summary jsonb;
  v_groups jsonb;
  v_prev jsonb;
  v_days integer := p_to - p_from + 1;
begin
  perform dk_require('reports.view');
  perform dk_copilot_range(p_from, p_to);

  select jsonb_build_object('from', p_from, 'to', p_to, 'orders', count(*), 'total', coalesce(sum(total), 0), 'avgTicket', coalesce(round(avg(total)), 0))
    into v_summary
  from dk_orders where status <> 'CANCELADO' and (created_at at time zone tz)::date between p_from and p_to;

  if p_group_by = 'product' then
    select coalesce(jsonb_agg(x), '[]') into v_groups from (
      select jsonb_build_object('productId', p.id, 'product', p.name, 'quantity', sum(i.quantity), 'total', sum(i.line_total)) x
      from dk_order_items i join dk_orders o on o.id = i.order_id join dk_products p on p.id = i.product_id
      where o.status <> 'CANCELADO' and (o.created_at at time zone tz)::date between p_from and p_to
      group by p.id, p.name order by sum(i.line_total) desc limit 20) t;
  elsif p_group_by = 'customer' then
    select coalesce(jsonb_agg(x), '[]') into v_groups from (
      select jsonb_build_object('customerId', c.id, 'customer', c.full_name, 'orders', count(*), 'total', sum(o.total)) x
      from dk_orders o join dk_customers c on c.id = o.customer_id
      where o.status <> 'CANCELADO' and (o.created_at at time zone tz)::date between p_from and p_to
      group by c.id, c.full_name order by sum(o.total) desc limit 20) t;
  elsif p_group_by in ('channel', 'payment', 'weekday', 'hour') then
    select coalesce(jsonb_agg(x order by k), '[]') into v_groups from (
      select k, jsonb_build_object('key', k, 'orders', count(*), 'total', sum(total)) x from (
        select total, case p_group_by
          when 'channel' then channel::text
          when 'payment' then coalesce(payment_method, 'sin definir')
          when 'weekday' then extract(isodow from created_at at time zone tz)::text   -- 1 = lunes
          else lpad(extract(hour from created_at at time zone tz)::text, 2, '0') end k
        from dk_orders where status <> 'CANCELADO' and (created_at at time zone tz)::date between p_from and p_to) s
      group by k) t;
  else
    select coalesce(jsonb_agg(jsonb_build_object('day', d, 'orders', n, 'total', s) order by d), '[]') into v_groups from (
      select (created_at at time zone tz)::date d, count(*) n, sum(total) s
      from dk_orders where status <> 'CANCELADO' and (created_at at time zone tz)::date between p_from and p_to
      group by 1) t;
  end if;

  if p_compare then
    select jsonb_build_object('from', p_from - v_days, 'to', p_from - 1, 'orders', count(*), 'total', coalesce(sum(total), 0))
      into v_prev
    from dk_orders where status <> 'CANCELADO' and (created_at at time zone tz)::date between p_from - v_days and p_from - 1;
  end if;

  return v_summary || jsonb_build_object('groupBy', coalesce(p_group_by, 'day'), 'groups', v_groups, 'previous', v_prev, 'cancelledExcluded', true);
end;
$$;

-- Orders: search and list (with how long they took to be ready).
create or replace function dk_copilot_orders(
  p_from date default null, p_to date default null, p_statuses text[] default null, p_search text default null,
  p_min_minutes integer default null, p_limit integer default 20)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  tz text := dk_account_tz();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_rows jsonb;
  v_count integer;
begin
  perform dk_require('orders.view');
  if p_from is not null or p_to is not null then perform dk_copilot_range(coalesce(p_from, p_to), coalesce(p_to, p_from)); end if;

  with base as (
    select o.*, c.full_name customer,
      (select min(h.changed_at) from dk_order_status_history h where h.order_id = o.id and h.to_status = 'CONFIRMADO') confirmed_at,
      (select min(h.changed_at) from dk_order_status_history h where h.order_id = o.id and h.to_status = 'LISTO') ready_at
    from dk_orders o left join dk_customers c on c.id = o.customer_id
    where (p_from is null or (o.created_at at time zone tz)::date >= p_from)
      and (p_to is null or (o.created_at at time zone tz)::date <= p_to)
      and (p_statuses is null or o.status::text = any (p_statuses))
      and (p_search is null or o.id in (select dk_order_search(p_search, null, null, null, null, null, 200, 0)))
  ), timed as (
    select b.*, round(extract(epoch from (coalesce(b.ready_at, case when b.status in ('CONFIRMADO', 'EN_PREPARACION') then now() end) - b.confirmed_at)) / 60) prep_minutes
    from base b
  )
  select count(*), coalesce(jsonb_agg(x) filter (where rn <= v_limit), '[]') into v_count, v_rows from (
    select row_number() over (order by t.created_at desc) rn, jsonb_build_object(
      'id', t.id, 'number', t.order_number, 'status', t.status, 'channel', t.channel, 'customer', t.customer, 'total', t.total,
      'createdAt', to_char(t.created_at at time zone tz, 'YYYY-MM-DD HH24:MI'), 'prepMinutes', t.prep_minutes,
      'items', (select string_agg(i.quantity || '× ' || p.name, ', ') from dk_order_items i join dk_products p on p.id = i.product_id where i.order_id = t.id)) x
    from timed t
    where p_min_minutes is null or t.prep_minutes >= p_min_minutes) s;

  return jsonb_build_object('count', v_count, 'shown', least(v_count, v_limit), 'orders', v_rows,
    'note', 'prepMinutes = de confirmado a listo (o hasta ahora si sigue en cocina)');
end;
$$;

-- One order in detail (the most recent with that number: numbers cycle).
create or replace function dk_copilot_order(p_number integer)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  tz text := dk_account_tz();
  v_order dk_orders;
begin
  perform dk_require('orders.view');
  select * into v_order from dk_orders where order_number = p_number order by created_at desc limit 1;
  if not found then return jsonb_build_object('found', false); end if;
  return jsonb_build_object(
    'found', true, 'id', v_order.id, 'number', v_order.order_number, 'status', v_order.status, 'channel', v_order.channel,
    'createdAt', to_char(v_order.created_at at time zone tz, 'YYYY-MM-DD HH24:MI'),
    'customer', (select jsonb_build_object('id', c.id, 'name', c.full_name) from dk_customers c where c.id = v_order.customer_id),
    'total', v_order.total, 'paymentMethod', v_order.payment_method, 'notes', v_order.notes,
    'paid', (select coalesce(sum(amount), 0) from dk_order_payments where order_id = v_order.id),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('productId', p.id, 'product', p.name, 'quantity', i.quantity, 'total', i.line_total,
                                                           'kitchenStatus', i.kitchen_status, 'observation', i.observation)), '[]')
              from dk_order_items i join dk_products p on p.id = i.product_id where i.order_id = v_order.id),
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('at', to_char(h.changed_at at time zone tz, 'YYYY-MM-DD HH24:MI'), 'to', h.to_status,
                                                              'by', u.full_name, 'note', h.note) order by h.changed_at), '[]')
                 from dk_order_status_history h left join dk_users u on u.id = h.changed_by where h.order_id = v_order.id),
    'delivery', (select jsonb_build_object('rider', r.full_name, 'status', d.status,
                                           'dispatchedAt', to_char(d.dispatched_at at time zone tz, 'YYYY-MM-DD HH24:MI'),
                                           'deliveredAt', to_char(d.delivered_at at time zone tz, 'YYYY-MM-DD HH24:MI'))
                 from dk_deliveries d left join dk_delivery_riders r on r.id = d.rider_id where d.order_id = v_order.id));
end;
$$;

-- Kitchen performance: preparation times against the account's targets.
create or replace function dk_copilot_kitchen(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  tz text := dk_account_tz();
  v_target integer;
  v jsonb;
begin
  perform dk_require('kitchen.view');
  perform dk_copilot_range(p_from, p_to);
  select confirmado_alert_min + en_preparacion_alert_min into v_target from dk_kitchen_sla_settings where kitchen_id = dk_current_kitchen_id();
  v_target := coalesce(v_target, 30);

  with prep as (
    select o.id, o.order_number,
      extract(epoch from (r.ts - c.ts)) / 60 minutes
    from dk_orders o
    join lateral (select min(changed_at) ts from dk_order_status_history where order_id = o.id and to_status = 'CONFIRMADO') c on true
    join lateral (select min(changed_at) ts from dk_order_status_history where order_id = o.id and to_status = 'LISTO') r on true
    where c.ts is not null and r.ts is not null and (c.ts at time zone tz)::date between p_from and p_to
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'targetMinutes', v_target,
    'ordersPrepared', count(*),
    'avgMinutes', round(avg(minutes)::numeric, 1),
    'medianMinutes', round((percentile_cont(0.5) within group (order by minutes::float8))::numeric, 1),
    'p90Minutes', round((percentile_cont(0.9) within group (order by minutes::float8))::numeric, 1),
    'overTarget', count(*) filter (where minutes > v_target),
    'slowest', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'number', order_number, 'minutes', round(minutes::numeric))), '[]')
                from (select * from prep order by minutes desc limit 5) s))
    into v
  from prep;

  return v || jsonb_build_object('inKitchenNow', (
    select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'number', o.order_number, 'status', o.status,
                                                 'minutesSinceConfirmed', round(extract(epoch from now() - h.ts) / 60))), '[]')
    from dk_orders o
    join lateral (select min(changed_at) ts from dk_order_status_history where order_id = o.id and to_status = 'CONFIRMADO') h on true
    where o.status in ('CONFIRMADO', 'EN_PREPARACION', 'LISTO')));
end;
$$;

-- Dishes: price, cost/margin (with reports.profitability), recipe (with recipes.view), sales of the last 30 days.
-- p_ingredient: the dishes whose active recipe uses that ingredient.
create or replace function dk_copilot_products(p_search text default null, p_ingredient text default null, p_limit integer default 15)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 15), 1), 40);
  v_cost boolean := dk_can('reports.profitability');
  v_recipes boolean := dk_can('recipes.view');
begin
  perform dk_require('products.view');
  return (
    select jsonb_build_object('products', coalesce(jsonb_agg(x), '[]'), 'costVisible', v_cost, 'recipesVisible', v_recipes)
    from (
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'active', p.active, 'price', p.price,
        'category', (select name from dk_product_categories where id = p.category_id),
        'estimatedCost', case when v_cost then p.estimated_cost end,
        'marginPct', case when v_cost and p.price > 0 then round((1 - p.estimated_cost / p.price) * 100, 1) end,
        'sold30d', (select coalesce(sum(i.quantity), 0) from dk_order_items i join dk_orders o on o.id = i.order_id
                    where i.product_id = p.id and o.status <> 'CANCELADO' and o.created_at > now() - interval '30 days'),
        'recipe', case when v_recipes then (
          select coalesce(jsonb_agg(jsonb_build_object('ingredientId', g.id, 'ingredient', g.name, 'quantity', ri.quantity, 'unit', u.code)), '[]')
          from dk_recipe_items ri join dk_ingredients g on g.id = ri.ingredient_id join dk_units u on u.id = g.base_unit_id
          where ri.recipe_id = p.active_recipe_id) end) x
      from dk_products p
      where (p_search is null or p.name ilike '%' || p_search || '%')
        and (p_ingredient is null or exists (
              select 1 from dk_recipe_items ri join dk_ingredients g on g.id = ri.ingredient_id
              where ri.recipe_id = p.active_recipe_id and g.name ilike '%' || p_ingredient || '%'))
      order by p.active desc, p.name
      limit v_limit) t);
end;
$$;

-- Ingredients: stock, coverage, consumption and waste (the same view Abastecimiento uses).
create or replace function dk_copilot_ingredients(p_search text default null, p_only_low boolean default false, p_limit integer default 20)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_products boolean := dk_can('products.view');
begin
  perform dk_require('inventory.view');
  return (
    select jsonb_build_object('ingredients', coalesce(jsonb_agg(x), '[]'))
    from (
      select jsonb_build_object(
        'id', s.ingredient_id, 'name', s.name, 'unit', s.base_unit_code,
        'stockAvailable', round(s.stock_available, 2), 'minStock', s.min_stock, 'belowMin', s.below_min,
        'coverageDays', round(s.coverage_days, 1), 'dailyBurn', round(s.daily_burn, 2),
        'consumed30d', round(s.consumed_30d, 2), 'wasted30d', round(s.wasted_30d, 2),
        'suggestedPurchase', round(s.suggested_quantity, 2), 'supplier', s.supplier_name, 'avgCost', s.avg_cost,
        'usedIn', case when v_products then (
          select coalesce(jsonb_agg(distinct p.name), '[]') from dk_recipe_items ri join dk_products p on p.active_recipe_id = ri.recipe_id
          where ri.ingredient_id = s.ingredient_id and p.active) end) x
      from dk_supply_suggestions s
      where (p_search is null or s.name ilike '%' || p_search || '%')
        and (not coalesce(p_only_low, false) or s.below_min or s.coverage_days < 3)
      order by s.below_min desc, s.coverage_days nulls last, s.name
      limit v_limit) t);
end;
$$;

-- Purchases: spend by supplier and by ingredient (confirmed purchases).
create or replace function dk_copilot_purchases(p_from date, p_to date, p_supplier text default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  perform dk_require('purchasing.view');
  perform dk_copilot_range(p_from, p_to);
  return jsonb_build_object(
    'from', p_from, 'to', p_to,
    'bySupplier', (select coalesce(jsonb_agg(x), '[]') from (
      select jsonb_build_object('supplier', s.name, 'purchases', count(*), 'total', sum(pu.total)) x
      from dk_purchases pu join dk_suppliers s on s.id = pu.supplier_id
      where pu.status = 'CONFIRMADA' and pu.invoice_date between p_from and p_to and (p_supplier is null or s.name ilike '%' || p_supplier || '%')
      group by s.name order by sum(pu.total) desc limit 15) t),
    'byIngredient', (select coalesce(jsonb_agg(x), '[]') from (
      select jsonb_build_object('ingredient', g.name, 'total', sum(pi.line_total)) x
      from dk_purchase_items pi join dk_purchases pu on pu.id = pi.purchase_id join dk_ingredients g on g.id = pi.ingredient_id
      left join dk_suppliers s on s.id = pu.supplier_id
      where pu.status = 'CONFIRMADA' and pu.invoice_date between p_from and p_to and (p_supplier is null or s.name ilike '%' || p_supplier || '%')
      group by g.name order by sum(pi.line_total) desc limit 15) t));
end;
$$;

-- Customers: orders, spend, last order; balance only with receivables.view.
create or replace function dk_copilot_customers(p_search text default null, p_order_by text default 'spend', p_from date default null, p_to date default null, p_limit integer default 10)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  tz text := dk_account_tz();
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 30);
  v_balance boolean := dk_can('receivables.view');
begin
  perform dk_require('customers.view');
  return (
    select jsonb_build_object('customers', coalesce(jsonb_agg(x order by ord), '[]'), 'balanceVisible', v_balance)
    from (
      select row_number() over (order by
          case p_order_by when 'orders' then -orders when 'recent' then -extract(epoch from last_order) when 'balance' then -coalesce(balance, 0) else -spend end) ord,
        jsonb_build_object('id', id, 'name', full_name, 'phone', phone, 'orders', orders, 'spend', spend,
                           'lastOrder', to_char(last_order at time zone tz, 'YYYY-MM-DD'), 'balance', balance) x
      from (
        select c.id, c.full_name, c.phone,
          count(o.id) orders, coalesce(sum(o.total), 0) spend, max(o.created_at) last_order,
          case when v_balance then (select coalesce(sum(r.balance), 0) from dk_receivables r where r.customer_id = c.id) end balance
        from dk_customers c
        left join dk_orders o on o.customer_id = c.id and o.status <> 'CANCELADO'
          and (p_from is null or (o.created_at at time zone tz)::date >= p_from)
          and (p_to is null or (o.created_at at time zone tz)::date <= p_to)
        where p_search is null or c.full_name ilike '%' || p_search || '%' or c.phone ilike '%' || p_search || '%'
        group by c.id) c
      order by 1 limit v_limit) t);
end;
$$;

-- Deliveries: by rider, with delivery times (a rider sees only their own: RLS).
create or replace function dk_copilot_deliveries(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  tz text := dk_account_tz();
begin
  perform dk_require('dispatch.view');
  perform dk_copilot_range(p_from, p_to);
  return jsonb_build_object(
    'from', p_from, 'to', p_to,
    'byRider', (select coalesce(jsonb_agg(x), '[]') from (
      select jsonb_build_object('rider', coalesce(r.full_name, 'Sin asignar'), 'delivered', count(*) filter (where d.status = 'ENTREGADO'),
                                'failed', count(*) filter (where d.status = 'FALLIDO'), 'onRoute', count(*) filter (where d.status = 'EN_RUTA'),
                                'avgMinutes', round((avg(extract(epoch from d.delivered_at - d.dispatched_at) / 60) filter (where d.delivered_at is not null))::numeric, 1)) x
      from dk_deliveries d left join dk_delivery_riders r on r.id = d.rider_id
      where (d.dispatched_at at time zone tz)::date between p_from and p_to
      group by r.full_name order by count(*) desc) t));
end;
$$;

-- Shifts: who works on a day and who is on shift now (staff.view; otherwise only your own, by RLS).
create or replace function dk_copilot_staff(p_day date default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  tz text := dk_account_tz();
  v_day date := coalesce(p_day, (now() at time zone tz)::date);
begin
  perform dk_require('copilot.use');
  return jsonb_build_object(
    'day', v_day, 'wholeTeam', dk_can('staff.view'),
    'shifts', (select coalesce(jsonb_agg(jsonb_build_object(
        'person', u.full_name, 'role', r.name,
        'from', to_char(s.starts_at at time zone tz, 'HH24:MI'), 'to', to_char(s.ends_at at time zone tz, 'HH24:MI'),
        'clockIn', to_char(s.clock_in_at at time zone tz, 'HH24:MI'), 'clockOut', to_char(s.clock_out_at at time zone tz, 'HH24:MI'),
        'unplanned', s.unplanned) order by s.starts_at), '[]')
      from dk_shifts s join dk_users u on u.id = s.user_id join dk_roles r on r.id = s.role_id
      where s.status = 'scheduled' and (s.starts_at at time zone tz)::date = v_day),
    'onShiftNow', case when dk_can('staff.view') or dk_can('dispatch.view') or dk_can('dispatch.assign') then (
      select coalesce(jsonb_agg(jsonb_build_object('person', full_name, 'role', role_name, 'clockedIn', clocked_in)), '[]') from dk_shifts_now()) end);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------------------
revoke execute on function
  dk_account_tz(), dk_copilot_range(date, date),
  dk_copilot_sales(date, date, text, boolean), dk_copilot_orders(date, date, text[], text, integer, integer), dk_copilot_order(integer),
  dk_copilot_kitchen(date, date), dk_copilot_products(text, text, integer), dk_copilot_ingredients(text, boolean, integer),
  dk_copilot_purchases(date, date, text), dk_copilot_customers(text, text, date, date, integer), dk_copilot_deliveries(date, date),
  dk_copilot_staff(date)
from public, anon;
grant execute on function
  dk_account_tz(), dk_copilot_range(date, date),
  dk_copilot_sales(date, date, text, boolean), dk_copilot_orders(date, date, text[], text, integer, integer), dk_copilot_order(integer),
  dk_copilot_kitchen(date, date), dk_copilot_products(text, text, integer), dk_copilot_ingredients(text, boolean, integer),
  dk_copilot_purchases(date, date, text), dk_copilot_customers(text, text, date, date, integer), dk_copilot_deliveries(date, date),
  dk_copilot_staff(date)
to authenticated;
