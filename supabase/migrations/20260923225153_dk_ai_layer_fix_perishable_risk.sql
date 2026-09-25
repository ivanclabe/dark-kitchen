create or replace function dk_inventory_signals(
  p_coverage_days numeric default 7,
  p_warning_days integer default 2,
  p_slow_days integer default 21,
  p_overstock_days integer default 60
)
returns table (
  ingredient_id uuid,
  code text,
  name text,
  base_unit_code text,
  primary_supplier_id uuid,
  supplier_name text,
  stock_on_hand numeric,
  stock_available numeric,
  min_stock numeric,
  max_stock numeric,
  avg_cost numeric,
  stock_value numeric,
  consumed_30d numeric,
  consumed_7d numeric,
  wasted_30d numeric,
  daily_burn numeric,
  daily_burn_7d numeric,
  coverage_days numeric,
  below_min boolean,
  suggested_quantity numeric,
  last_consumed_at timestamptz,
  days_since_consumption integer,
  perishable boolean,
  shelf_life_days integer,
  oldest_stock_at timestamptz,
  oldest_stock_qty numeric,
  est_days_to_expiry numeric,
  projected_waste_qty numeric,
  needs_reorder boolean,
  perishable_risk boolean,
  slow_mover boolean,
  overstock boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with recent as (
    select m.ingredient_id,
      coalesce(sum(-m.quantity_base_unit) filter (where m.movement_type = 'CONSUMO' and m.created_at >= now() - interval '7 days'), 0) as consumed_7d,
      max(m.created_at) filter (where m.movement_type = 'CONSUMO') as last_consumed_at
    from dk_inventory_movements m
    group by m.ingredient_id
  ),
  entries as (
    select m.ingredient_id, m.created_at, m.quantity_base_unit as qty,
      sum(m.quantity_base_unit) over (partition by m.ingredient_id order by m.created_at desc, m.id) as cum
    from dk_inventory_movements m
    where m.movement_type in ('COMPRA', 'AJUSTE') and m.quantity_base_unit > 0
  ),
  oldest as (
    select distinct on (e.ingredient_id)
      e.ingredient_id,
      e.created_at as oldest_stock_at,
      least(e.qty, st.stock_on_hand - (e.cum - e.qty)) as oldest_stock_qty
    from entries e
    join dk_ingredient_stock st on st.ingredient_id = e.ingredient_id
    where st.stock_on_hand > 0 and e.cum - e.qty < st.stock_on_hand
    order by e.ingredient_id, e.created_at asc
  ),
  facts as (
    select
      s.*,
      coalesce(st.stock_on_hand, 0) as on_hand,
      coalesce(r.consumed_7d, 0) as c7,
      r.last_consumed_at as last_c,
      i.perishable as is_perishable,
      i.shelf_life_days as life,
      o.oldest_stock_at as oldest_at,
      o.oldest_stock_qty as oldest_qty,
      case
        when i.perishable and i.shelf_life_days is not null and o.oldest_stock_at is not null
          then round(i.shelf_life_days - extract(epoch from now() - o.oldest_stock_at) / 86400.0, 1)
      end as days_left
    from dk_supply_suggestions s
    join dk_ingredients i on i.id = s.ingredient_id
    left join dk_ingredient_stock st on st.ingredient_id = s.ingredient_id
    left join recent r on r.ingredient_id = s.ingredient_id
    left join oldest o on o.ingredient_id = s.ingredient_id
  )
  select
    f.ingredient_id, f.code, f.name, f.base_unit_code, f.primary_supplier_id, f.supplier_name,
    f.on_hand, f.stock_available, f.min_stock, f.max_stock, f.avg_cost,
    round(f.on_hand * coalesce(f.avg_cost, 0), 2),
    f.consumed_30d, f.c7, f.wasted_30d, f.daily_burn, round(f.c7 / 7.0, 4), f.coverage_days,
    f.below_min, f.suggested_quantity,
    f.last_c,
    case when f.last_c is not null then floor(extract(epoch from now() - f.last_c) / 86400.0)::integer end,
    f.is_perishable, f.life, f.oldest_at, f.oldest_qty, f.days_left,
    case
      when f.days_left is not null
        then round(greatest(0, f.oldest_qty - f.daily_burn * greatest(f.days_left, 0)), 3)
    end,
    f.below_min or (f.coverage_days is not null and f.coverage_days < p_coverage_days),
    f.days_left is not null and (
      f.days_left <= p_warning_days or f.oldest_qty - f.daily_burn * greatest(f.days_left, 0) > 0
    ),
    f.on_hand > 0
      and coalesce(f.oldest_at < now() - make_interval(days => p_slow_days), false)
      and (f.last_c is null or f.last_c < now() - make_interval(days => p_slow_days)),
    coalesce(f.coverage_days > p_overstock_days, false)
  from facts f;
$$;
