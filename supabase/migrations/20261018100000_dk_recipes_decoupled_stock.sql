-- ADR 0069: recipes that do not depend on stock, ingredients created from a recipe, and the inventory
-- deducted when each dish starts its preparation.
--
-- 1. Every ingredient has its stock row from the start, at zero (no movement: nothing is invented).
-- 2. dk_create_ingredient: one way to create an ingredient (inventory forms and the recipe editor), one name
--    per account (the same accent- and case-blind key the invoice import uses), a real base unit.
-- 3. The order lifecycle (ADR 0002, revised):
--      confirm             reserves the recipe's ingredients (unchanged; refuses if stock is short)
--      dish → EN_PREPARACION  deducts its reservation (CONSUMO), after checking the stock is really there
--      dish → LISTO        moves nothing
--      dish back to PENDIENTE  gives back what it consumed (DEVOLUCION) and reserves it again
--      cancel              releases what is reserved; gives back what was consumed, once, and asks for review
--    A reservation goes ACTIVE → CONSUMED → (revert) ACTIVE again, or → RELEASED. Only an ACTIVE reservation is
--    consumed and only a CONSUMED one is given back, under the order's lock: no transition can deduct or give
--    back twice, whatever repeats (a reload, a double tap, a concurrent cancel).

-- ---------------------------------------------------------------------------------------------- 1. Stock rows

create or replace function dk_ingredient_stock_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into dk_ingredient_stock (ingredient_id, kitchen_id)
  values (new.id, new.kitchen_id)
  on conflict (ingredient_id) do nothing;
  return new;
end;
$$;

drop trigger if exists dk_trg_ingredients_stock_row on dk_ingredients;
create trigger dk_trg_ingredients_stock_row
  after insert on dk_ingredients
  for each row execute function dk_ingredient_stock_row();

-- The ingredients that never had a movement get their row too (at zero).
insert into dk_ingredient_stock (ingredient_id, kitchen_id)
select i.id, i.kitchen_id
from dk_ingredients i
where not exists (select 1 from dk_ingredient_stock s where s.ingredient_id = i.id);

-- A reservation always lands on the stock row (before, an ingredient without a row was reserved nowhere).
create or replace function dk_apply_reservation_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into dk_ingredient_stock (ingredient_id, kitchen_id, stock_reserved)
  values (new.ingredient_id, new.kitchen_id, new.quantity_base_unit)
  on conflict (ingredient_id) do update
    set stock_reserved = dk_ingredient_stock.stock_reserved + excluded.stock_reserved, updated_at = now();
  return new;
end;
$$;

-- ACTIVE → RELEASED/CONSUMED frees the reserved quantity; CONSUMED → ACTIVE (a dish sent back) reserves it again.
create or replace function dk_apply_reservation_resolution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'ACTIVE' and new.status in ('RELEASED', 'CONSUMED') then
    update dk_ingredient_stock
    set stock_reserved = stock_reserved - old.quantity_base_unit, updated_at = now()
    where ingredient_id = old.ingredient_id;
  elsif old.status = 'CONSUMED' and new.status = 'ACTIVE' then
    update dk_ingredient_stock
    set stock_reserved = stock_reserved + old.quantity_base_unit, updated_at = now()
    where ingredient_id = old.ingredient_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------- 2. Creating an ingredient

create or replace function dk_create_ingredient(
  p_name text,
  p_base_unit_id uuid,
  p_code text default null,
  p_category_id uuid default null,
  p_min_stock numeric default 0,
  p_max_stock numeric default null,
  p_description text default null,
  p_primary_supplier_id uuid default null,
  p_perishable boolean default false,
  p_shelf_life_days integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_name text := btrim(coalesce(p_name, ''));
  v_code text := upper(nullif(btrim(p_code), ''));
  v_existing record;
  v_n integer;
  v_id uuid;
begin
  if v_kitchen is null then
    raise exception 'No hay una cuenta activa';
  end if;
  -- Whoever edits recipes can add the ingredient a recipe needs (at zero stock, without cost: it moves nothing).
  if not (dk_can('inventory.create') or dk_can('recipes.edit')) then
    raise exception 'No autorizado para crear insumos';
  end if;
  if v_name = '' then
    raise exception 'El insumo necesita un nombre' using hint = 'name_required';
  end if;
  if not exists (select 1 from dk_units where id = p_base_unit_id and code not in ('caja', 'bolsa', 'paquete', 'porcion')) then
    raise exception 'Elige la unidad base del insumo: g, kg, ml, l o unidad. Las cajas y paquetes se configuran después como empaques.'
      using hint = 'base_unit';
  end if;
  if coalesce(p_min_stock, 0) < 0 or (p_max_stock is not null and p_max_stock < coalesce(p_min_stock, 0)) then
    raise exception 'El stock máximo no puede ser menor que el mínimo, y ninguno negativo' using hint = 'stock_limits';
  end if;
  if p_category_id is not null and not exists (select 1 from dk_ingredient_categories where id = p_category_id and kitchen_id = v_kitchen) then
    raise exception 'La categoría no es de esta cuenta';
  end if;

  -- One name per account: «Tomate», «tomate » and «Tomáte» are the same ingredient.
  select id, name, code, active into v_existing
  from dk_ingredients
  where kitchen_id = v_kitchen and dk_match_key(name) = dk_match_key(v_name)
  limit 1;
  if found then
    raise exception '%', case when v_existing.active
        then format('Ya existe «%s» (código %s). Elígelo de la lista.', v_existing.name, v_existing.code)
        else format('Ya existe «%s» (código %s), inactivo. Actívalo en Abastecimiento para usarlo.', v_existing.name, v_existing.code) end
      using hint = 'duplicate_ingredient', detail = v_existing.id::text;
  end if;

  if v_code is null then
    select count(*) + 1 into v_n from dk_ingredients where kitchen_id = v_kitchen and not is_preparation;
    loop
      v_code := 'INS-' || lpad(v_n::text, 3, '0');
      exit when not exists (select 1 from dk_ingredients where kitchen_id = v_kitchen and code = v_code);
      v_n := v_n + 1;
    end loop;
  elsif exists (select 1 from dk_ingredients where kitchen_id = v_kitchen and code = v_code) then
    raise exception 'Ya hay un insumo con el código %', v_code using hint = 'duplicate_code';
  end if;

  insert into dk_ingredients (
    kitchen_id, code, name, description, category_id, base_unit_id, primary_supplier_id,
    min_stock, max_stock, perishable, shelf_life_days
  ) values (
    v_kitchen, v_code, v_name, nullif(btrim(p_description), ''), p_category_id, p_base_unit_id, p_primary_supplier_id,
    coalesce(p_min_stock, 0), p_max_stock, coalesce(p_perishable, false), p_shelf_life_days
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function dk_create_ingredient(text, uuid, text, uuid, numeric, numeric, text, uuid, boolean, integer) from public, anon;
grant execute on function dk_create_ingredient(text, uuid, text, uuid, numeric, numeric, text, uuid, boolean, integer) to authenticated;

-- Renaming an ingredient onto another one's name is refused too (the inventory form edits rows directly).
create or replace function dk_ingredients_guard_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if dk_match_key(new.name) is distinct from dk_match_key(old.name)
     and exists (select 1 from dk_ingredients
                 where kitchen_id = new.kitchen_id and id <> new.id and dk_match_key(name) = dk_match_key(new.name)) then
    raise exception 'Ya existe un insumo llamado «%» en esta cuenta', btrim(new.name) using hint = 'duplicate_ingredient';
  end if;
  return new;
end;
$$;

drop trigger if exists dk_trg_ingredients_guard_name on dk_ingredients;
create trigger dk_trg_ingredients_guard_name
  before update of name on dk_ingredients
  for each row execute function dk_ingredients_guard_name();

-- ------------------------------------------------------------------------------------------ 3. The kitchen

-- Advances a dish: PENDIENTE → EN_PREPARACION → LISTO. Starting it deducts its reserved ingredients.
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
  v_on_hand numeric;
  v_all_ready boolean;
begin
  perform dk_assert_in_active_kitchen('dk_order_items', p_order_item_id);
  if not dk_can('kitchen.prepare') then
    raise exception 'No autorizado para actualizar la cocina';
  end if;

  -- The order first, then the dish: a cancel running at the same time waits (it locks the order too).
  select order_id into v_order_id from dk_order_items where id = p_order_item_id;
  if not found then
    raise exception 'Item de pedido % no existe', p_order_item_id;
  end if;
  select status into v_order_status from dk_orders where id = v_order_id for update;
  select kitchen_status into v_current from dk_order_items where id = p_order_item_id for update;

  if v_order_status not in ('CONFIRMADO', 'EN_PREPARACION') then
    raise exception 'El pedido debe estar CONFIRMADO o EN_PREPARACION (actual %)', v_order_status;
  end if;

  if v_current = 'PENDIENTE' then
    v_next := 'EN_PREPARACION';
  elsif v_current = 'EN_PREPARACION' then
    v_next := 'LISTO';
  else
    raise exception 'El plato ya esta LISTO';
  end if;

  if v_next = 'EN_PREPARACION' then
    -- The dish starts: what it reserved leaves the inventory now, if it is really there (never negative).
    for v_res in
      select r.id, r.ingredient_id, r.quantity_base_unit, i.name, i.avg_cost, u.code as unit_code
      from dk_inventory_reservations r
      join dk_ingredients i on i.id = r.ingredient_id
      join dk_units u on u.id = i.base_unit_id
      where r.order_item_id = p_order_item_id and r.status = 'ACTIVE'
      order by r.ingredient_id
    loop
      select stock_on_hand into v_on_hand from dk_ingredient_stock where ingredient_id = v_res.ingredient_id for update;
      if coalesce(v_on_hand, 0) < v_res.quantity_base_unit then
        raise exception 'No alcanza «%» para empezar este plato: hay % y necesita %. Registra la compra o un ajuste de inventario.',
          v_res.name, dk_format_quantity(greatest(coalesce(v_on_hand, 0), 0), v_res.unit_code), dk_format_quantity(v_res.quantity_base_unit, v_res.unit_code)
          using hint = 'insufficient_stock';
      end if;

      update dk_inventory_reservations set status = 'CONSUMED', resolved_at = now()
      where id = v_res.id and status = 'ACTIVE';

      insert into dk_inventory_movements (
        ingredient_id, movement_type, quantity_base_unit, unit_cost, reference_type, reference_id, created_by
      ) values (
        v_res.ingredient_id, 'CONSUMO', -v_res.quantity_base_unit, v_res.avg_cost, 'order_item', p_order_item_id, dk_current_profile_id()
      );
    end loop;
  end if;

  update dk_order_items set kitchen_status = v_next where id = p_order_item_id;

  if v_order_status = 'CONFIRMADO' then
    update dk_orders set status = 'EN_PREPARACION' where id = v_order_id;
    insert into dk_order_status_history (order_id, from_status, to_status, changed_by)
    values (v_order_id, 'CONFIRMADO', 'EN_PREPARACION', dk_current_profile_id());
  end if;

  if v_next = 'LISTO' then
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

-- Sends a dish back: LISTO → EN_PREPARACION (no stock moves) → PENDIENTE (what it consumed comes back, once, and is
-- reserved again, so starting it again deducts it once more and a cancel gives it back only once).
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
  perform dk_assert_in_active_kitchen('dk_order_items', p_order_item_id);
  if not dk_can('kitchen.prepare') then
    raise exception 'No autorizado para actualizar la cocina';
  end if;

  select order_id into v_order_id from dk_order_items where id = p_order_item_id;
  if not found then
    raise exception 'Item de pedido % no existe', p_order_item_id;
  end if;
  select status into v_order_status from dk_orders where id = v_order_id for update;
  select kitchen_status into v_current from dk_order_items where id = p_order_item_id for update;

  if v_order_status not in ('CONFIRMADO', 'EN_PREPARACION', 'LISTO') then
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

  if v_prev = 'PENDIENTE' then
    for v_res in
      select r.id, r.ingredient_id, r.quantity_base_unit, i.avg_cost
      from dk_inventory_reservations r
      join dk_ingredients i on i.id = r.ingredient_id
      where r.order_item_id = p_order_item_id and r.status = 'CONSUMED'
    loop
      update dk_inventory_reservations set status = 'ACTIVE', resolved_at = null
      where id = v_res.id and status = 'CONSUMED';

      insert into dk_inventory_movements (
        ingredient_id, movement_type, quantity_base_unit, unit_cost, reference_type, reference_id, observation, created_by
      ) values (
        v_res.ingredient_id, 'DEVOLUCION', v_res.quantity_base_unit, v_res.avg_cost, 'order_item_revert', p_order_item_id,
        'Devolución por corrección de estado de cocina (el plato volvió a pendiente)', dk_current_profile_id()
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

-- Cancels an order: releases what is reserved and gives back what was consumed — once (the reservation is closed).
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
  perform dk_assert_in_active_kitchen('dk_orders', p_order_id);
  if not dk_can('orders.cancel') then
    raise exception 'No autorizado para cancelar pedidos';
  end if;

  select status into v_status from dk_orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido % no existe', p_order_id;
  end if;
  if v_status in ('CANCELADO', 'ENTREGADO') then
    raise exception 'No se puede cancelar un pedido en estado %', v_status;
  end if;

  for v_res in
    select r.id, r.ingredient_id, r.quantity_base_unit, r.status, i.avg_cost
    from dk_inventory_reservations r
    join dk_order_items oi on oi.id = r.order_item_id
    join dk_ingredients i on i.id = r.ingredient_id
    where oi.order_id = p_order_id and r.status in ('ACTIVE', 'CONSUMED')
    for update of r
  loop
    if v_res.status = 'ACTIVE' then
      update dk_inventory_reservations set status = 'RELEASED', resolved_at = now() where id = v_res.id;
    else
      update dk_inventory_reservations set status = 'RELEASED', resolved_at = now() where id = v_res.id;
      insert into dk_inventory_movements (
        ingredient_id, movement_type, quantity_base_unit, unit_cost, reference_type, reference_id, observation, created_by
      ) values (
        v_res.ingredient_id, 'DEVOLUCION', v_res.quantity_base_unit, v_res.avg_cost, 'order_cancellation', p_order_id,
        'Devolución por cancelación de un pedido que ya había empezado a prepararse', dk_current_profile_id()
      );
      v_needs_review := true;
    end if;
  end loop;

  -- The review an earlier correction asked for is kept.
  update dk_orders set status = 'CANCELADO', requires_review = requires_review or v_needs_review where id = p_order_id;

  insert into dk_order_status_history (order_id, from_status, to_status, changed_by, note)
  values (p_order_id, v_status, 'CANCELADO', dk_current_profile_id(), p_reason);
end;
$$;

comment on column dk_orders.requires_review is
  'true si se devolvió inventario de un plato que ya había empezado a prepararse (un retroceso o una cancelación), o si una confirmación automática falló: alguien debe revisar.';
