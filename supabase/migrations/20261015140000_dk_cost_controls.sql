-- ADR 0063, fase 2: inventario y costos con reglas (sin IA).
--
-- 1. Función general «Control de costos» (cost_controls): % de costo objetivo de los platos, % de cambio de
--    precio que se avisa y días de cobertura para reponer. En todos los planes.
-- 2. Reposición: la cantidad sugerida usa el consumo real (consumo diario × días objetivo), con el mínimo y el
--    máximo como límites; sin consumo, la regla de siempre.
-- 3. Precios de referencia de cada insumo: la última compra y el promedio de 90 días, por unidad base.
-- 4. Bitácora de cambios del costo promedio (para avisar subidas).
-- 5. Conteo físico: una sesión con lo que dice el sistema y lo contado; al confirmarla se registra la
--    diferencia como ajuste «por conteo».
-- 6. Compras: el número de factura es opcional en el borrador (obligatorio al confirmar), IVA por % con el del
--    proveedor por defecto.
-- 7. Margen de los platos frente al objetivo.

-- ---------------------------------------------------------------------------
-- 1. Control de costos
-- ---------------------------------------------------------------------------
insert into dk_features (key, category, label, description, use_permission, manage_permission, default_available, default_enabled,
                         default_settings, settings_schema, uses_model, sort_order)
values ('cost_controls', 'general', 'Control de costos',
        'Avisa cuando un insumo cambia de precio, cuando un plato pasa el costo objetivo o se vende bajo costo, y define cuántos días cubre la reposición sugerida. Son reglas: no usan IA.',
        'inventory.view', 'features.manage', true, true,
        '{"target_food_cost_pct": 35, "price_change_pct": 10, "reorder_days": 7}',
        '{"target_food_cost_pct": {"type": "number", "min": 10, "max": 90}, "price_change_pct": {"type": "number", "min": 1, "max": 100}, "reorder_days": {"type": "number", "min": 1, "max": 60}}',
        false, 210)
on conflict (key) do nothing;
insert into dk_plan_features (plan_key, feature_key) select key, 'cost_controls' from dk_plans on conflict do nothing;

-- The account's effective cost settings (defaults ← organization ← account) and whether they are on.
create or replace function dk_cost_settings(p_kitchen uuid default dk_current_kitchen_id())
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select f.default_settings
         || coalesce((select of.settings from dk_organization_features of join dk_kitchens k on k.organization_id = of.organization_id
                      where k.id = p_kitchen and of.feature_key = f.key), '{}')
         || coalesce(kf.settings, '{}')
         || jsonb_build_object('enabled', coalesce(kf.enabled, f.default_enabled))
  from dk_features f
  left join dk_kitchen_features kf on kf.feature_key = f.key and kf.kitchen_id = p_kitchen
  where f.key = 'cost_controls'
$$;

-- ---------------------------------------------------------------------------
-- 2. Reposición con el consumo real
-- ---------------------------------------------------------------------------
create or replace view dk_supply_suggestions with (security_invoker = true) as
with outflow as (
  select m.ingredient_id,
    sum(case
          when m.movement_type = 'CONSUMO' then -m.quantity_base_unit
          when m.movement_type = 'PRODUCCION' and pb.id is not null and m.ingredient_id <> pb.ingredient_id then -m.quantity_base_unit
          else 0 end) as consumed_30d,
    sum(case when m.movement_type = 'MERMA' then -m.quantity_base_unit else 0 end) as wasted_30d
  from dk_inventory_movements m
  left join dk_production_batches pb on pb.id = m.reference_id and m.reference_type in ('production', 'production_void')
  where m.created_at >= now() - interval '30 days' and m.kitchen_id = dk_current_kitchen_id()
  group by m.ingredient_id
), target as (
  select coalesce((dk_cost_settings() ->> 'reorder_days')::numeric, 7) as days
)
select i.id as ingredient_id,
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
  case when coalesce(o.consumed_30d, 0) > 0 then round(coalesce(st.stock_available, 0) / (o.consumed_30d / 30.0), 1) end as coverage_days,
  coalesce(st.stock_available, 0) <= i.min_stock and i.min_stock > 0 as below_min,
  -- ADR 0063: with consumption, enough for the target days (at least the minimum, at most the maximum);
  -- without consumption, the rule of always (up to the maximum, or twice the minimum).
  round(greatest(0, case
    when coalesce(o.consumed_30d, 0) > 0 then
      least(coalesce(i.max_stock, 'infinity'::numeric), greatest(i.min_stock, o.consumed_30d / 30.0 * (select days from target)))
    else coalesce(i.max_stock, i.min_stock * 2)
  end - coalesce(st.stock_available, 0)), 3) as suggested_quantity,
  i.is_preparation
from dk_ingredients i
join dk_units u on u.id = i.base_unit_id
left join dk_ingredient_stock st on st.ingredient_id = i.id
left join dk_suppliers s on s.id = i.primary_supplier_id
left join outflow o on o.ingredient_id = i.id
where i.active and i.kitchen_id = dk_current_kitchen_id() and dk_can('inventory.view');

-- ---------------------------------------------------------------------------
-- 3. Precios de referencia por insumo
-- ---------------------------------------------------------------------------
create or replace function dk_price_references(p_ingredient_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with lines as (
    select pi.ingredient_id, p.invoice_date, p.created_at, s.name as supplier, pi.unit_cost, pi.purchase_unit_id, pu.code as unit_code,
           pi.quantity, dk_unit_factor(pi.ingredient_id, pi.purchase_unit_id) as factor
    from dk_purchase_items pi
    join dk_purchases p on p.id = pi.purchase_id and p.status = 'CONFIRMADA'
    join dk_suppliers s on s.id = p.supplier_id
    join dk_units pu on pu.id = pi.purchase_unit_id
    where pi.ingredient_id = any (p_ingredient_ids) and pi.kitchen_id = dk_current_kitchen_id()
  ), last as (
    select distinct on (ingredient_id) * from lines where factor is not null order by ingredient_id, invoice_date desc, created_at desc
  ), avg90 as (
    select ingredient_id, sum(unit_cost * quantity) / nullif(sum(quantity * factor), 0) as per_base
    from lines where factor is not null and invoice_date >= current_date - 90 group by ingredient_id
  )
  select coalesce(jsonb_object_agg(i.id, jsonb_build_object(
    'avgCost', i.avg_cost,
    'last', case when l.ingredient_id is not null then jsonb_build_object(
        'date', l.invoice_date, 'supplier', l.supplier, 'unitId', l.purchase_unit_id, 'unitCode', l.unit_code,
        'unitCost', l.unit_cost, 'perBase', round(l.unit_cost / l.factor, 6)) end,
    'avg90PerBase', round(a.per_base, 6))), '{}')
  from dk_ingredients i
  left join last l on l.ingredient_id = i.id
  left join avg90 a on a.ingredient_id = i.id
  where i.id = any (p_ingredient_ids) and i.kitchen_id = dk_current_kitchen_id()
    and (dk_can('purchasing.view') or dk_can('purchasing.create') or dk_can('inventory.view'))
$$;

-- ---------------------------------------------------------------------------
-- 4. Cambios del costo promedio
-- ---------------------------------------------------------------------------
create table dk_ingredient_cost_changes (
  id bigint generated always as identity primary key,
  kitchen_id uuid not null references dk_kitchens (id) on delete cascade,
  ingredient_id uuid not null references dk_ingredients (id) on delete cascade,
  old_cost numeric not null,
  new_cost numeric not null,
  change_pct numeric not null,
  created_at timestamptz not null default now()
);
create index dk_ingredient_cost_changes_idx on dk_ingredient_cost_changes (kitchen_id, created_at desc);
alter table dk_ingredient_cost_changes enable row level security;
create policy dk_ingredient_cost_changes_select on dk_ingredient_cost_changes for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('inventory.view')));
revoke insert, update, delete on dk_ingredient_cost_changes from anon, authenticated;

create or replace function dk_track_cost_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only real changes of an existing cost (a first purchase is not «a price increase»).
  if old.avg_cost > 0 and new.avg_cost is distinct from old.avg_cost and abs(new.avg_cost - old.avg_cost) / old.avg_cost >= 0.01 then
    insert into dk_ingredient_cost_changes (kitchen_id, ingredient_id, old_cost, new_cost, change_pct)
    values (new.kitchen_id, new.id, old.avg_cost, new.avg_cost, round((new.avg_cost - old.avg_cost) / old.avg_cost * 100, 2));
  end if;
  return new;
end;
$$;
create trigger dk_trg_ingredient_cost_change after update of avg_cost on dk_ingredients
  for each row execute function dk_track_cost_change();

-- ---------------------------------------------------------------------------
-- 5. Conteo físico
-- ---------------------------------------------------------------------------
create table dk_stock_counts (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default dk_current_kitchen_id() references dk_kitchens (id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'applied', 'cancelled')),
  scope text not null,
  created_by uuid default dk_current_profile_id() references dk_users (id),
  created_at timestamptz not null default now(),
  applied_by uuid references dk_users (id),
  applied_at timestamptz
);
create table dk_stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references dk_stock_counts (id) on delete cascade,
  kitchen_id uuid not null references dk_kitchens (id) on delete cascade,
  ingredient_id uuid not null references dk_ingredients (id) on delete cascade,
  system_qty numeric not null,
  counted_qty numeric check (counted_qty >= 0),
  counted_unit_id uuid references dk_units (id),
  counted_base_qty numeric check (counted_base_qty >= 0),
  difference numeric,
  unique (count_id, ingredient_id)
);
create index dk_stock_counts_kitchen_idx on dk_stock_counts (kitchen_id, created_at desc);
alter table dk_stock_counts enable row level security;
alter table dk_stock_count_lines enable row level security;
create policy dk_stock_counts_select on dk_stock_counts for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('inventory.adjust')));
create policy dk_stock_count_lines_select on dk_stock_count_lines for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('inventory.adjust')));
revoke insert, update, delete on dk_stock_counts, dk_stock_count_lines from anon, authenticated;

-- Start a count: every active ingredient (or one category or supplier), with what the system says now.
create or replace function dk_stock_count_start(p_category_id uuid default null, p_supplier_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_id uuid;
  v_scope text;
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  if not dk_can('inventory.adjust') then raise exception 'No autorizado para contar el inventario'; end if;
  if exists (select 1 from dk_stock_counts where kitchen_id = v_kitchen and status = 'open') then
    raise exception 'Ya hay un conteo abierto: termínalo o descártalo antes de empezar otro' using hint = 'count_open';
  end if;
  v_scope := coalesce((select 'Categoría: ' || name from dk_ingredient_categories where id = p_category_id and kitchen_id = v_kitchen),
                      (select 'Proveedor: ' || name from dk_suppliers where id = p_supplier_id and kitchen_id = v_kitchen),
                      'Todo el inventario');
  insert into dk_stock_counts (kitchen_id, scope) values (v_kitchen, v_scope) returning id into v_id;
  insert into dk_stock_count_lines (count_id, kitchen_id, ingredient_id, system_qty)
  select v_id, v_kitchen, i.id, coalesce(st.stock_on_hand, 0)
  from dk_ingredients i left join dk_ingredient_stock st on st.ingredient_id = i.id
  where i.kitchen_id = v_kitchen and i.active
    and (p_category_id is null or i.category_id = p_category_id)
    and (p_supplier_id is null or i.primary_supplier_id = p_supplier_id
         or exists (select 1 from dk_supplier_ingredients si where si.ingredient_id = i.id and si.supplier_id = p_supplier_id));
  if not found then
    delete from dk_stock_counts where id = v_id;
    raise exception 'No hay insumos activos para contar con ese filtro';
  end if;
  return v_id;
end;
$$;

-- What was counted for one line (in any unit of the ingredient; null clears it).
create or replace function dk_stock_count_set(p_line_id uuid, p_quantity numeric, p_unit_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line dk_stock_count_lines;
  v_factor numeric := 1;
begin
  select l.* into v_line from dk_stock_count_lines l join dk_stock_counts c on c.id = l.count_id
  where l.id = p_line_id and l.kitchen_id = dk_current_kitchen_id() and c.status = 'open';
  if v_line.id is null then raise exception 'Ese conteo ya no está abierto'; end if;
  if not dk_can('inventory.adjust') then raise exception 'No autorizado para contar el inventario'; end if;
  if p_quantity is not null and p_quantity < 0 then raise exception 'Lo contado no puede ser negativo'; end if;
  if p_quantity is not null and p_unit_id is not null then
    v_factor := dk_unit_factor(v_line.ingredient_id, p_unit_id);
    if v_factor is null then raise exception 'No hay conversión de esa unidad a la unidad base del insumo' using hint = 'no_conversion'; end if;
  end if;
  update dk_stock_count_lines set counted_qty = p_quantity, counted_unit_id = case when p_quantity is null then null else p_unit_id end,
    counted_base_qty = round(p_quantity * v_factor, 6)
  where id = p_line_id;
end;
$$;

-- Apply: each counted line records the difference with the stock AT THIS MOMENT as an adjustment «por conteo».
create or replace function dk_stock_count_apply(p_count_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count dk_stock_counts;
  v_line record;
  v_diff numeric;
  v_adjusted integer := 0;
  v_value numeric := 0;
begin
  select * into v_count from dk_stock_counts where id = p_count_id and kitchen_id = dk_current_kitchen_id() for update;
  if v_count.id is null or v_count.status <> 'open' then raise exception 'Ese conteo ya no está abierto'; end if;
  if not dk_can('inventory.adjust') then raise exception 'No autorizado para registrar ajustes'; end if;
  if not exists (select 1 from dk_stock_count_lines where count_id = p_count_id and counted_base_qty is not null) then
    raise exception 'Todavía no se contó ningún insumo';
  end if;
  for v_line in
    select l.id, l.ingredient_id, l.counted_base_qty, coalesce(st.stock_on_hand, 0) as on_hand, i.avg_cost
    from dk_stock_count_lines l
    join dk_ingredients i on i.id = l.ingredient_id
    left join dk_ingredient_stock st on st.ingredient_id = l.ingredient_id
    where l.count_id = p_count_id and l.counted_base_qty is not null
    for update of l
  loop
    v_diff := round(v_line.counted_base_qty - v_line.on_hand, 6);
    update dk_stock_count_lines set difference = v_diff where id = v_line.id;
    if v_diff <> 0 then
      insert into dk_inventory_movements (ingredient_id, movement_type, quantity_base_unit, unit_cost, reference_type, reference_id, observation, created_by)
      values (v_line.ingredient_id, 'AJUSTE', v_diff, v_line.avg_cost, 'stock_count', p_count_id, 'Conteo físico', dk_current_profile_id());
      v_adjusted := v_adjusted + 1;
      v_value := v_value + v_diff * coalesce(v_line.avg_cost, 0);
    end if;
  end loop;
  update dk_stock_counts set status = 'applied', applied_at = now(), applied_by = dk_current_profile_id() where id = p_count_id;
  return jsonb_build_object('adjusted', v_adjusted, 'value', round(v_value, 2),
    'counted', (select count(*) from dk_stock_count_lines where count_id = p_count_id and counted_base_qty is not null));
end;
$$;

create or replace function dk_stock_count_cancel(p_count_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not dk_can('inventory.adjust') then raise exception 'No autorizado'; end if;
  update dk_stock_counts set status = 'cancelled' where id = p_count_id and kitchen_id = dk_current_kitchen_id() and status = 'open';
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Compras: factura opcional en el borrador, IVA por %
-- ---------------------------------------------------------------------------
alter table dk_purchases alter column invoice_number drop not null;
alter table dk_purchases add column tax_pct numeric check (tax_pct >= 0 and tax_pct <= 100);
comment on column dk_purchases.tax_pct is 'IVA en % (ADR 0063): al confirmar, tax = subtotal × tax_pct. NULL = el IVA escrito a mano (o el de la factura importada).';
alter table dk_suppliers add column default_vat_pct numeric check (default_vat_pct >= 0 and default_vat_pct <= 100);
comment on column dk_suppliers.default_vat_pct is 'IVA habitual del proveedor (ADR 0063): se propone en sus compras manuales.';

create or replace function dk_purchase_confirm_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'CONFIRMADA' and old.status = 'BORRADOR' then
    if nullif(btrim(new.invoice_number), '') is null then
      raise exception 'Escribe el número de la factura antes de confirmar la compra' using hint = 'invoice_number_required';
    end if;
    if new.tax_pct is not null then
      new.tax := round(new.subtotal * new.tax_pct / 100, 2);
      new.total := new.subtotal + new.tax;
    end if;
  end if;
  return new;
end;
$$;
create trigger dk_trg_purchases_confirm_rules before update of status on dk_purchases
  for each row execute function dk_purchase_confirm_rules();

-- ---------------------------------------------------------------------------
-- 7. Margen de los platos
-- ---------------------------------------------------------------------------
create or replace function dk_dish_margins()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with s as (select dk_cost_settings() as v),
  d as (
    select p.id, p.name, p.price, p.estimated_cost,
      case when p.price > 0 and p.estimated_cost > 0 then round(p.estimated_cost / p.price * 100, 1) end as food_cost_pct
    from dk_products p
    where p.kitchen_id = dk_current_kitchen_id() and p.active
  )
  select jsonb_build_object(
    'targetPct', (s.v ->> 'target_food_cost_pct')::numeric,
    'dishes', coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id, 'name', d.name, 'price', d.price, 'cost', d.estimated_cost, 'foodCostPct', d.food_cost_pct,
      'status', case
        when d.estimated_cost is null or d.estimated_cost <= 0 then 'no_cost'
        when d.price <= d.estimated_cost then 'below_cost'
        when d.food_cost_pct > (s.v ->> 'target_food_cost_pct')::numeric then 'above_target'
        else 'ok' end,
      'suggestedPrice', case when d.estimated_cost > 0 then ceil(d.estimated_cost / ((s.v ->> 'target_food_cost_pct')::numeric / 100) / 100) * 100 end)
      order by d.name), '[]'))
  from d, s
  where dk_can('products.view') or dk_can('reports.profitability')
  group by s.v
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
revoke execute on function dk_cost_settings(uuid), dk_price_references(uuid[]), dk_track_cost_change(), dk_stock_count_start(uuid, uuid),
  dk_stock_count_set(uuid, numeric, uuid), dk_stock_count_apply(uuid), dk_stock_count_cancel(uuid), dk_purchase_confirm_rules(), dk_dish_margins()
from public, anon;
-- Read through RLS (the rows only change through the functions and the trigger).
grant select on dk_ingredient_cost_changes, dk_stock_counts, dk_stock_count_lines to authenticated;
grant execute on function dk_cost_settings(uuid), dk_price_references(uuid[]), dk_stock_count_start(uuid, uuid),
  dk_stock_count_set(uuid, numeric, uuid), dk_stock_count_apply(uuid), dk_stock_count_cancel(uuid), dk_dish_margins()
to authenticated;
