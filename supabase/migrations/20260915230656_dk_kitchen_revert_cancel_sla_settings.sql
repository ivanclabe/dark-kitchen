-- Dark Kitchen — Cocina: retroceso de estado, cancelacion desde Cocina, y
-- umbrales de alerta configurables.

-- ---------------------------------------------------------------------------
-- dk_cancel_order: permite tambien al rol KITCHEN cancelar (antes solo
-- ADMIN/MANAGER/CASHIER). Sin otro cambio de comportamiento.
-- ---------------------------------------------------------------------------

create or replace function dk_cancel_order(p_order_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status dk_order_status;
  v_res record;
  v_needs_review boolean := false;
begin
  if dk_current_role() not in ('ADMIN','MANAGER','CASHIER','KITCHEN') then
    raise exception 'No autorizado para cancelar pedidos';
  end if;

  select status into v_status from dk_orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido % no existe', p_order_id;
  end if;
  if v_status in ('CANCELADO','ENTREGADO') then
    raise exception 'No se puede cancelar un pedido en estado %', v_status;
  end if;

  for v_res in
    select r.id, r.ingredient_id, r.quantity_base_unit, r.status
    from dk_inventory_reservations r
    join dk_order_items oi on oi.id = r.order_item_id
    where oi.order_id = p_order_id
  loop
    if v_res.status = 'ACTIVE' then
      update dk_inventory_reservations set status = 'RELEASED', resolved_at = now() where id = v_res.id;
    elsif v_res.status = 'CONSUMED' then
      insert into dk_inventory_movements (
        ingredient_id, movement_type, quantity_base_unit, reference_type, reference_id, observation, created_by
      ) values (
        v_res.ingredient_id, 'DEVOLUCION', v_res.quantity_base_unit, 'order_cancellation', p_order_id,
        'Devolucion por cancelacion tardia de pedido (post-consumo)', dk_current_profile_id()
      );
      v_needs_review := true;
    end if;
  end loop;

  update dk_orders set status = 'CANCELADO', requires_review = v_needs_review where id = p_order_id;

  insert into dk_order_status_history (order_id, from_status, to_status, changed_by, note)
  values (p_order_id, v_status, 'CANCELADO', dk_current_profile_id(), p_reason);
end;
$$;

revoke execute on function dk_cancel_order(uuid, text) from public, anon;
grant execute on function dk_cancel_order(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- dk_revert_kitchen_item: espejo de dk_advance_kitchen_item, pero hacia
-- atras. Permite corregir un movimiento accidental en el Kanban de Cocina
-- (LISTO -> EN_PREPARACION -> PENDIENTE). Si el item ya estaba LISTO, su
-- reserva de inventario ya fue CONSUMED de forma permanente (ledger
-- append-only, ver dk_inventory_movements) — retroceder inserta un
-- movimiento DEVOLUCION compensatorio por cada reserva consumida de ese
-- item, igual que ya hace dk_cancel_order al cancelar un pedido con platos
-- ya preparados, y marca requires_review para que un admin lo audite.
-- El estado del pedido se recalcula desde los items (todos PENDIENTE ->
-- CONFIRMADO; todos LISTO -> LISTO; mezcla -> EN_PREPARACION), la misma
-- invariante que ya cumple dk_advance_kitchen_item.
-- ---------------------------------------------------------------------------

create or replace function dk_revert_kitchen_item(p_order_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_status dk_order_status;
  v_current dk_kitchen_item_status;
  v_prev dk_kitchen_item_status;
  v_res record;
  v_had_consumed boolean := false;
  v_new_order_status dk_order_status;
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
  if v_order_status not in ('CONFIRMADO','EN_PREPARACION','LISTO') then
    raise exception 'El pedido debe estar CONFIRMADO, EN_PREPARACION o LISTO (actual %)', v_order_status;
  end if;

  if v_current = 'LISTO' then
    v_prev := 'EN_PREPARACION';
  elsif v_current = 'EN_PREPARACION' then
    v_prev := 'PENDIENTE';
  else
    raise exception 'El plato ya esta PENDIENTE';
  end if;

  update dk_order_items set kitchen_status = v_prev where id = p_order_item_id;

  if v_current = 'LISTO' then
    for v_res in
      select id, ingredient_id, quantity_base_unit
      from dk_inventory_reservations
      where order_item_id = p_order_item_id and status = 'CONSUMED'
    loop
      insert into dk_inventory_movements (
        ingredient_id, movement_type, quantity_base_unit, reference_type, reference_id, observation, created_by
      ) values (
        v_res.ingredient_id, 'DEVOLUCION', v_res.quantity_base_unit, 'order_item_revert', p_order_item_id,
        'Devolucion por correccion de estado de cocina (item revertido de LISTO)', dk_current_profile_id()
      );
      v_had_consumed := true;
    end loop;
  end if;

  select
    case
      when not exists (select 1 from dk_order_items where order_id = v_order_id and kitchen_status <> 'PENDIENTE') then 'CONFIRMADO'
      when not exists (select 1 from dk_order_items where order_id = v_order_id and kitchen_status <> 'LISTO') then 'LISTO'
      else 'EN_PREPARACION'
    end into v_new_order_status;

  if v_new_order_status <> v_order_status then
    update dk_orders
    set status = v_new_order_status, requires_review = requires_review or v_had_consumed
    where id = v_order_id;

    insert into dk_order_status_history (order_id, from_status, to_status, changed_by, note)
    values (v_order_id, v_order_status, v_new_order_status, dk_current_profile_id(), 'Retroceso manual de estado de cocina');
  elsif v_had_consumed then
    update dk_orders set requires_review = true where id = v_order_id;
  end if;
end;
$$;

revoke execute on function dk_revert_kitchen_item(uuid) from public, anon;
grant execute on function dk_revert_kitchen_item(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- dk_kitchen_sla_settings: umbrales de alerta por estado, configurables.
-- Fila unica (singleton). Reemplaza los TIME_WARN_MIN/TIME_LATE_MIN fijos
-- que hoy vive en el cliente (src/modules/kitchen/lib/ticketVisuals.ts).
-- ---------------------------------------------------------------------------

create table dk_kitchen_sla_settings (
  id smallint primary key default 1 check (id = 1),
  confirmado_alert_min integer not null default 10 check (confirmado_alert_min > 0),
  en_preparacion_alert_min integer not null default 20 check (en_preparacion_alert_min > 0),
  listo_alert_min integer not null default 15 check (listo_alert_min > 0),
  near_threshold_pct integer not null default 80 check (near_threshold_pct between 1 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references dk_users(id)
);

insert into dk_kitchen_sla_settings (id) values (1);

create trigger dk_trg_kitchen_sla_settings_updated_at
  before update on dk_kitchen_sla_settings
  for each row execute function dk_set_updated_at();

alter table dk_kitchen_sla_settings enable row level security;

create policy dk_kitchen_sla_settings_select on dk_kitchen_sla_settings for select to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','CASHIER','KITCHEN'));

create policy dk_kitchen_sla_settings_update on dk_kitchen_sla_settings for update to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER'))
  with check (dk_current_role() in ('ADMIN','MANAGER'));

revoke insert, delete on dk_kitchen_sla_settings from authenticated;
grant update (confirmado_alert_min, en_preparacion_alert_min, listo_alert_min, near_threshold_pct, updated_by) on dk_kitchen_sla_settings to authenticated;
