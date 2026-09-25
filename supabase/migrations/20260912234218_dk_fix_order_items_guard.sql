-- Fix: dk_order_items_guard_editable bloqueaba tambien las actualizaciones
-- de sistema (kitchen_status/recipe_id) hechas por los RPC de cocina/confirmar
-- pedido, no solo las ediciones de cliente (quantity/unit_price/observation)
-- que es lo que realmente debia impedir tras confirmar el pedido.
create or replace function dk_order_items_guard_editable()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status dk_order_status;
begin
  if tg_op = 'UPDATE'
     and new.quantity = old.quantity
     and new.unit_price = old.unit_price
     and new.observation is not distinct from old.observation
  then
    -- Solo cambiaron columnas de sistema (recipe_id/kitchen_status),
    -- gestionadas exclusivamente por los RPC; no aplica la restriccion.
    return new;
  end if;

  select status into v_status from dk_orders where id = coalesce(new.order_id, old.order_id);
  if v_status <> 'NUEVO' then
    raise exception 'No se pueden modificar los platos de un pedido en estado % (order_id=%)', v_status, coalesce(new.order_id, old.order_id);
  end if;
  return coalesce(new, old);
end;
$$;
