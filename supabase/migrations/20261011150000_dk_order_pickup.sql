-- ADR 0052 (D7): an order to pick up (public menu, fulfillment = pickup) is
-- handed over at the counter: LISTO → ENTREGADO, without Despacho.
create or replace function dk_mark_picked_up(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status dk_order_status;
  v_fulfillment text;
begin
  perform dk_assert_in_active_kitchen('dk_orders', p_order_id);
  if not (dk_can('dispatch.assign') or dk_can('orders.confirm')) then
    raise exception 'No autorizado para entregar pedidos';
  end if;
  select status, fulfillment into v_status, v_fulfillment from dk_orders where id = p_order_id for update;
  if not found then raise exception 'Pedido % no existe', p_order_id; end if;
  if v_fulfillment is distinct from 'pickup' then
    raise exception 'Este pedido es a domicilio: se entrega despachándolo';
  end if;
  if v_status <> 'LISTO' then
    raise exception 'Solo se entrega un pedido listo (actual: %)', v_status;
  end if;
  update dk_orders set status = 'ENTREGADO' where id = p_order_id;
  insert into dk_order_status_history (order_id, from_status, to_status, changed_by)
  values (p_order_id, 'LISTO', 'ENTREGADO', dk_current_profile_id());
end;
$$;
revoke all on function dk_mark_picked_up(uuid) from public, anon;
grant execute on function dk_mark_picked_up(uuid) to authenticated;
