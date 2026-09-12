-- Dark Kitchen — Fase 6: Cocina (cola, preparacion, consumo de inventario).

-- Avanza un item de pedido: PENDIENTE -> EN_PREPARACION -> LISTO.
-- Al pasar a EN_PREPARACION por primera vez, el pedido pasa a EN_PREPARACION.
-- Al pasar a LISTO, cierra la reserva activa del item con un movimiento
-- CONSUMO definitivo; cuando todos los items del pedido quedan LISTO, el
-- pedido completo pasa a LISTO.
create or replace function dk_advance_kitchen_item(p_order_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_status dk_order_status;
  v_current dk_kitchen_item_status;
  v_next dk_kitchen_item_status;
  v_res record;
  v_all_ready boolean;
begin
  if dk_current_role() not in ('ADMIN','MANAGER','KITCHEN') then
    raise exception 'No autorizado para actualizar la cocina';
  end if;

  select oi.order_id, oi.kitchen_status, o.status
  into v_order_id, v_current, v_order_status
  from dk_order_items oi
  join dk_orders o on o.id = oi.order_id
  where oi.id = p_order_item_id
  for update of oi;

  if not found then
    raise exception 'Item de pedido % no existe', p_order_item_id;
  end if;
  if v_order_status not in ('CONFIRMADO','EN_PREPARACION') then
    raise exception 'El pedido debe estar CONFIRMADO o EN_PREPARACION (actual %)', v_order_status;
  end if;

  if v_current = 'PENDIENTE' then
    v_next := 'EN_PREPARACION';
  elsif v_current = 'EN_PREPARACION' then
    v_next := 'LISTO';
  else
    raise exception 'El plato ya esta LISTO';
  end if;

  update dk_order_items set kitchen_status = v_next where id = p_order_item_id;

  if v_order_status = 'CONFIRMADO' then
    update dk_orders set status = 'EN_PREPARACION' where id = v_order_id;
    insert into dk_order_status_history (order_id, from_status, to_status, changed_by)
    values (v_order_id, 'CONFIRMADO', 'EN_PREPARACION', dk_current_profile_id());
  end if;

  if v_next = 'LISTO' then
    for v_res in
      select id, ingredient_id, quantity_base_unit
      from dk_inventory_reservations
      where order_item_id = p_order_item_id and status = 'ACTIVE'
    loop
      update dk_inventory_reservations set status = 'CONSUMED', resolved_at = now() where id = v_res.id;

      insert into dk_inventory_movements (
        ingredient_id, movement_type, quantity_base_unit, unit_cost, reference_type, reference_id, created_by
      )
      select v_res.ingredient_id, 'CONSUMO', -v_res.quantity_base_unit, i.avg_cost, 'order_item', p_order_item_id, dk_current_profile_id()
      from dk_ingredients i where i.id = v_res.ingredient_id;
    end loop;

    select not exists (
      select 1 from dk_order_items where order_id = v_order_id and kitchen_status <> 'LISTO'
    ) into v_all_ready;

    if v_all_ready then
      update dk_orders set status = 'LISTO' where id = v_order_id;
      insert into dk_order_status_history (order_id, from_status, to_status, changed_by)
      values (v_order_id, 'EN_PREPARACION', 'LISTO', dk_current_profile_id());
    end if;
  end if;
end;
$$;

revoke execute on function dk_advance_kitchen_item(uuid) from public, anon;
grant execute on function dk_advance_kitchen_item(uuid) to authenticated;
