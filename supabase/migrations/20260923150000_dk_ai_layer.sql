-- Dark Kitchen — Capa de IA (Abastecimiento, Inventario y Cocina).
--
-- Principio: la lógica determinística vive aquí (SQL) y en la app; la IA
-- (Edge Function dk-ai-insights) solo PRIORIZA y EXPLICA señales ya
-- calculadas con datos reales. Nunca ejecuta compras ni acciones: cada acción
-- sale de un botón que pulsa una persona.
--
--   1. dk_order_items.kitchen_status_changed_at — hora del último cambio de
--      estado de cada plato. Sin ella no se puede saber "este plato lleva 15
--      min sin avanzar" (solo existía created_at).
--   2. dk_ai_features — configuración por función de IA (activar/desactivar,
--      umbrales, frecuencia). Una fila por función, sembrada DESACTIVADA.
--   3. dk_ai_insights — cada análisis generado: qué datos se le dieron al
--      modelo (input) y qué devolvió ya validado (output). Append-only:
--      trazabilidad de toda recomendación.
--   4. dk_inventory_signals() / dk_kitchen_signals() — las señales
--      determinísticas. Las usan tanto la app (para mostrar cifras) como la
--      Edge Function (para armar el contexto del modelo): una sola fuente.

-- ---------------------------------------------------------------------------
-- 1. Hora de cambio de estado por plato
-- ---------------------------------------------------------------------------

alter table dk_order_items add column kitchen_status_changed_at timestamptz not null default now();

-- Relleno para filas existentes: la última transición registrada del pedido
-- es la mejor aproximación disponible (antes no se guardaba por plato).
-- Sin el trigger de subtotal: recalcularía dk_orders y movería su
-- updated_at a hoy (lo que inflaría "Entregados hoy", que filtra por updated_at).
alter table dk_order_items disable trigger dk_trg_recalc_order_subtotal;
update dk_order_items oi
set kitchen_status_changed_at = coalesce(
  (select max(h.changed_at) from dk_order_status_history h where h.order_id = oi.order_id),
  oi.created_at
);
alter table dk_order_items enable trigger dk_trg_recalc_order_subtotal;

create or replace function dk_touch_kitchen_status_changed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.kitchen_status is distinct from old.kitchen_status then
    new.kitchen_status_changed_at = now();
  end if;
  return new;
end;
$$;

create trigger dk_trg_order_items_kitchen_status_changed_at
  before update of kitchen_status on dk_order_items
  for each row execute function dk_touch_kitchen_status_changed_at();

comment on column dk_order_items.kitchen_status_changed_at is 'Hora del último cambio de kitchen_status (trigger). Base de las alertas de platos sin avanzar.';

-- ---------------------------------------------------------------------------
-- 2. Configuración de funciones de IA
-- ---------------------------------------------------------------------------

create table dk_ai_features (
  feature_key text primary key check (feature_key in (
    'supply_reorder', 'supply_perishables', 'supply_slow_movers', 'kitchen_stall_alerts', 'kitchen_insights'
  )),
  enabled boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references dk_users(id),
  updated_at timestamptz not null default now()
);

comment on table dk_ai_features is 'Configuración de cada función de IA: activa o no, umbrales y frecuencia (settings). Sembrada desactivada; la activa un ADMIN/MANAGER.';

-- Valores por defecto de configuración (no datos de negocio): umbrales y frecuencias iniciales.
insert into dk_ai_features (feature_key, settings) values
  ('supply_reorder',       '{"coverage_days": 7, "frequency_min": 360}'),
  ('supply_perishables',   '{"warning_days": 2, "frequency_min": 360}'),
  ('supply_slow_movers',   '{"slow_days": 21, "overstock_days": 60, "frequency_min": 1440}'),
  ('kitchen_stall_alerts', '{"dish_stall_min": 12, "repeat_min": 5, "voice": true}'),
  ('kitchen_insights',     '{"frequency_min": 10, "voice": false}');

create or replace function dk_touch_ai_feature()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  new.updated_by = dk_current_profile_id();
  return new;
end;
$$;

create trigger dk_trg_ai_features_touch
  before update on dk_ai_features
  for each row execute function dk_touch_ai_feature();

create trigger dk_trg_audit_ai_features
  after insert or update or delete on dk_ai_features
  for each row execute function dk_audit_row();

alter table dk_ai_features enable row level security;

-- Todo el personal lee la configuración (Cocina necesita saber si las alertas están activas).
create policy dk_ai_features_select on dk_ai_features for select to authenticated
  using (dk_current_role() is not null);
-- Solo se editan filas existentes: las funciones las define la app, no el usuario.
create policy dk_ai_features_update on dk_ai_features for update to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER'))
  with check (dk_current_role() in ('ADMIN','MANAGER'));

-- ---------------------------------------------------------------------------
-- 3. Análisis generados
-- ---------------------------------------------------------------------------

create table dk_ai_insights (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null references dk_ai_features(feature_key),
  status text not null check (status in ('ok', 'empty', 'error')),
  input jsonb not null,
  output jsonb,
  model text,
  error text,
  created_by uuid references dk_users(id) default dk_current_profile_id(),
  created_at timestamptz not null default now()
);

create index dk_ai_insights_feature_created_idx on dk_ai_insights (feature_key, created_at desc);

comment on table dk_ai_insights is 'Cada análisis de IA: input = señales determinísticas enviadas al modelo; output = respuesta ya validada contra ese input. Append-only.';

alter table dk_ai_insights enable row level security;

-- Mismos roles que el módulo de cada función: Abastecimiento o Cocina.
create or replace function dk_ai_feature_allowed(p_feature_key text)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when p_feature_key like 'supply_%' then dk_current_role() in ('ADMIN','MANAGER','INVENTORY')
    when p_feature_key like 'kitchen_%' then dk_current_role() in ('ADMIN','MANAGER','CASHIER','KITCHEN','DELIVERY')
    else false
  end;
$$;

create policy dk_ai_insights_select on dk_ai_insights for select to authenticated
  using (dk_ai_feature_allowed(feature_key));
create policy dk_ai_insights_insert on dk_ai_insights for insert to authenticated
  with check (dk_ai_feature_allowed(feature_key));
-- Sin UPDATE/DELETE: el historial de recomendaciones no se reescribe.

-- ---------------------------------------------------------------------------
-- 4a. Señales de inventario
-- ---------------------------------------------------------------------------
-- Se apoya en dk_supply_suggestions (consumo 30 d, cobertura, sugerido,
-- filtro de rol) y agrega lo que la vista no tiene: consumo de 7 días
-- (tendencia), último consumo, edad estimada del stock y riesgo de
-- vencimiento.
--
-- Edad del stock (perecederos): no hay lotes ni fechas de vencimiento, así
-- que se ESTIMA con FIFO sobre las entradas (COMPRA y AJUSTE positivos): el
-- stock en mano se atribuye a las entradas más recientes, y la más antigua
-- que todavía "cabe" en el stock es el lote más viejo. Es una estimación y
-- la app la presenta como tal.
--
-- needs_reorder replica la regla de src/modules/supply/lib/coverage.ts
-- (urgencyOf): bajo mínimo o cobertura < p_coverage_days.

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
    -- needs_reorder (mismo criterio que coverage.ts)
    f.below_min or (f.coverage_days is not null and f.coverage_days < p_coverage_days),
    -- perishable_risk: el lote más viejo vence pronto o no se alcanza a consumir antes de vencer
    coalesce(f.days_left <= p_warning_days
      or f.oldest_qty - f.daily_burn * greatest(f.days_left, 0) > 0, false),
    -- slow_mover: hay stock, lleva tiempo guardado y no se consume hace p_slow_days
    f.on_hand > 0
      and coalesce(f.oldest_at < now() - make_interval(days => p_slow_days), false)
      and (f.last_c is null or f.last_c < now() - make_interval(days => p_slow_days)),
    -- overstock: al ritmo actual, el stock dura más de p_overstock_days
    coalesce(f.coverage_days > p_overstock_days, false)
  from facts f;
$$;

comment on function dk_inventory_signals is 'Señales determinísticas de inventario (reposición, perecederos, poco movimiento). Fuente única para la app y para dk-ai-insights.';

-- ---------------------------------------------------------------------------
-- 4b. Señales de Cocina
-- ---------------------------------------------------------------------------
-- Foto del momento de los pedidos en cocina (En cola, Preparando, Listo):
-- tiempo desde creado (criterio SLA de la app), tiempo en el estado actual
-- y, por plato, tiempo sin avanzar. stalled = supera el umbral.

create or replace function dk_kitchen_signals(p_dish_stall_min integer default 12)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with sla as (
    select confirmado_alert_min, en_preparacion_alert_min, listo_alert_min, near_threshold_pct
    from dk_kitchen_sla_settings where id = 1
  ),
  active_orders as (
    select o.id, o.order_number, o.status, coalesce(t.priority, 0) as priority, o.created_at,
      coalesce((select max(h.changed_at) from dk_order_status_history h where h.order_id = o.id and h.to_status = o.status), o.created_at) as status_since,
      case o.status
        when 'CONFIRMADO' then (select confirmado_alert_min from sla)
        when 'EN_PREPARACION' then (select en_preparacion_alert_min from sla)
        when 'LISTO' then (select listo_alert_min from sla)
      end as alert_min
    from dk_orders o
    left join dk_kitchen_tickets t on t.order_id = o.id
    where o.status in ('CONFIRMADO', 'EN_PREPARACION', 'LISTO')
  ),
  items as (
    select oi.order_id, oi.id, p.name as product, oi.quantity, oi.kitchen_status, oi.observation,
      round(extract(epoch from now() - oi.kitchen_status_changed_at) / 60.0) as minutes_in_status
    from dk_order_items oi
    join dk_products p on p.id = oi.product_id
    where oi.order_id in (select id from active_orders)
  )
  select jsonb_build_object(
    'generated_at', now(),
    'dish_stall_min', p_dish_stall_min,
    'sla', (select to_jsonb(sla) from sla),
    'riders_active', (select count(*) from dk_delivery_riders where active),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'order_id', a.id,
        'order_number', a.order_number,
        'status', a.status,
        'priority', a.priority,
        'minutes_since_created', round(extract(epoch from now() - a.created_at) / 60.0),
        'minutes_in_status', round(extract(epoch from now() - a.status_since) / 60.0),
        'alert_min', a.alert_min,
        'late', extract(epoch from now() - a.created_at) / 60.0 > a.alert_min,
        'stalled', extract(epoch from now() - a.status_since) / 60.0 > a.alert_min,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'item_id', i.id,
            'product', i.product,
            'quantity', i.quantity,
            'kitchen_status', i.kitchen_status,
            'has_observation', i.observation is not null,
            'minutes_in_status', i.minutes_in_status,
            -- Plato detenido: en preparación demasiado tiempo, o pendiente
            -- mientras el resto del pedido ya arrancó.
            'stalled', i.minutes_in_status > p_dish_stall_min and (
              i.kitchen_status = 'EN_PREPARACION' or (i.kitchen_status = 'PENDIENTE' and a.status = 'EN_PREPARACION')
            )
          ) order by i.product)
          from items i where i.order_id = a.id
        ), '[]'::jsonb)
      ) order by a.priority desc, a.created_at)
      from active_orders a
    ), '[]'::jsonb)
  );
$$;

comment on function dk_kitchen_signals is 'Foto determinística de la cocina (tiempos, atrasos, platos detenidos). Fuente única para las alertas por voz y para dk-ai-insights.';
