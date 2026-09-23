-- Dark Kitchen — Sugerencia de reposición basada en consumo real.
--
-- Hasta ahora "qué comprar" se decidía solo con la regla estática
-- stock_available <= min_stock, calculada en el cliente. Eso deja fuera el
-- caso más común de una cocina: un insumo que TODAVÍA está por encima del
-- mínimo pero que, al ritmo al que se está consumiendo, se acaba en dos días.
--
-- Esta vista no inventa ninguna política de compra: expone los hechos que ya
-- viven en el ledger (dk_inventory_movements) y en la configuración del
-- insumo (min_stock/max_stock), y deja el umbral de "cobertura corta" a quien
-- consume la vista (la UI hoy, n8n mañana).
--
-- Decisiones explícitas:
--   * daily_burn se calcula SOLO con movimientos CONSUMO (demanda real de
--     cocina). La merma se expone aparte (wasted_30d) para no inflar la
--     demanda con una pérdida puntual y poder señalarla por separado.
--   * suggested_quantity usa la misma regla que ya usaba la UI
--     (max_stock, o el doble del mínimo cuando no hay máximo definido),
--     ahora en un solo lugar y consultable por fuera de la app.
--   * security_invoker = true: la vista corre con los permisos/RLS de quien
--     consulta, igual que dk_receivables (ver migración 20260917150100).

create or replace view dk_supply_suggestions
with (security_invoker = true)
as
with outflow as (
  select
    ingredient_id,
    sum(case when movement_type = 'CONSUMO' then -quantity_base_unit else 0 end) as consumed_30d,
    sum(case when movement_type = 'MERMA' then -quantity_base_unit else 0 end) as wasted_30d
  from dk_inventory_movements
  where created_at >= now() - interval '30 days'
  group by ingredient_id
)
select
  i.id as ingredient_id,
  i.code,
  i.name,
  u.code as base_unit_code,
  i.primary_supplier_id,
  s.name as supplier_name,
  coalesce(st.stock_available, 0) as stock_available,
  i.min_stock,
  i.max_stock,
  i.avg_cost,
  coalesce(o.consumed_30d, 0) as consumed_30d,
  coalesce(o.wasted_30d, 0) as wasted_30d,
  round(coalesce(o.consumed_30d, 0) / 30.0, 4) as daily_burn,
  -- Días que alcanza el stock disponible al ritmo de consumo de los últimos
  -- 30 días. NULL = no hubo consumo en el período, así que no hay ritmo que
  -- proyectar (no es lo mismo que "cero días").
  case
    when coalesce(o.consumed_30d, 0) > 0
      then round(coalesce(st.stock_available, 0) / (o.consumed_30d / 30.0), 1)
    else null
  end as coverage_days,
  coalesce(st.stock_available, 0) <= i.min_stock as below_min,
  greatest(0, coalesce(i.max_stock, i.min_stock * 2) - coalesce(st.stock_available, 0)) as suggested_quantity
from dk_ingredients i
join dk_units u on u.id = i.base_unit_id
left join dk_ingredient_stock st on st.ingredient_id = i.id
left join dk_suppliers s on s.id = i.primary_supplier_id
left join outflow o on o.ingredient_id = i.id
where i.active
  and dk_current_role() in ('ADMIN','MANAGER','INVENTORY');

comment on view dk_supply_suggestions is 'Insumos activos con su ritmo de consumo real (30 días), días de cobertura y cantidad sugerida de reposición. Los umbrales de alerta los decide quien consulta: la vista solo expone hechos.';

grant select on dk_supply_suggestions to authenticated;
