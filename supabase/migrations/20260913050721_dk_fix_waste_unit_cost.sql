-- Fix: dk_register_waste no guardaba el costo del insumo en el movimiento
-- MERMA (unit_cost quedaba NULL), lo que hacia que cualquier reporte de
-- "valor de mermas" (dashboard, dk_report_waste) siempre diera cero.
-- Ahora toma el avg_cost vigente del insumo, igual que ya hace dk_confirm_purchase
-- para CONSUMO.
create or replace function dk_register_waste(
  p_ingredient_id uuid,
  p_quantity numeric,
  p_reason dk_waste_reason,
  p_observation text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movement_id uuid;
  v_avg_cost numeric;
begin
  if dk_current_role() not in ('ADMIN','MANAGER','INVENTORY') then
    raise exception 'No autorizado para registrar mermas';
  end if;
  if p_quantity <= 0 then
    raise exception 'La cantidad de merma debe ser positiva (se registra como salida automaticamente)';
  end if;

  select avg_cost into v_avg_cost from dk_ingredients where id = p_ingredient_id;

  insert into dk_inventory_movements (
    ingredient_id, movement_type, quantity_base_unit, unit_cost, reason, observation, created_by
  ) values (
    p_ingredient_id, 'MERMA', -p_quantity, v_avg_cost, p_reason, p_observation, dk_current_profile_id()
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;
