-- Permite marcar/quitar prioridad manual en una comanda de cocina.
-- La columna dk_kitchen_tickets.priority ya existia sin ninguna via de
-- escritura desde la app; se expone via RPC siguiendo el mismo patron de
-- dk_advance_kitchen_item (solo roles de cocina/gestion, sin grant directo
-- de UPDATE sobre la tabla).
create or replace function dk_set_ticket_priority(p_order_id uuid, p_priority integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if dk_current_role() not in ('ADMIN','MANAGER','KITCHEN') then
    raise exception 'No autorizado para actualizar la prioridad de cocina';
  end if;

  if p_priority < 0 then
    raise exception 'La prioridad no puede ser negativa';
  end if;

  update dk_kitchen_tickets
  set priority = p_priority
  where order_id = p_order_id;

  if not found then
    raise exception 'No existe comanda de cocina para el pedido %', p_order_id;
  end if;
end;
$$;

revoke execute on function dk_set_ticket_priority(uuid, integer) from public, anon;
grant execute on function dk_set_ticket_priority(uuid, integer) to authenticated;
