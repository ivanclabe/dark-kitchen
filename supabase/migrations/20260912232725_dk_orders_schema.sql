-- Dark Kitchen — Fase 5: Pedidos (clientes, pedidos, reservas, comanda).

create type dk_order_status as enum ('NUEVO','CONFIRMADO','EN_PREPARACION','LISTO','DESPACHADO','ENTREGADO','CANCELADO');
create type dk_order_channel as enum ('MANUAL','WHATSAPP','PHONE');
create type dk_kitchen_item_status as enum ('PENDIENTE','EN_PREPARACION','LISTO');
create type dk_reservation_status as enum ('ACTIVE','RELEASED','CONSUMED');

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------

create table dk_customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text unique,
  address text,
  notes text,
  whatsapp_id text unique, -- reservado para Fase 9 (WhatsApp), ver ADR 0006
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger dk_trg_customers_updated_at
  before update on dk_customers
  for each row execute function dk_set_updated_at();

-- ---------------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------------

create table dk_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references dk_customers(id),
  status dk_order_status not null default 'NUEVO',
  channel dk_order_channel not null default 'MANUAL',
  external_reference text, -- reservado para Fase 9 (id de conversacion/mensaje de WhatsApp)
  subtotal numeric not null default 0,
  discount numeric not null default 0 check (discount >= 0),
  delivery_fee numeric not null default 0 check (delivery_fee >= 0),
  total numeric generated always as (subtotal - discount + delivery_fee) stored,
  payment_method text,
  notes text,
  requires_review boolean not null default false,
  created_by uuid references dk_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column dk_orders.requires_review is 'true si una cancelacion tardia (post-consumo) genero una devolucion de inventario que un admin deberia revisar.';

create trigger dk_trg_orders_updated_at
  before update on dk_orders
  for each row execute function dk_set_updated_at();

create trigger dk_trg_audit_orders
  after insert or update or delete on dk_orders
  for each row execute function dk_audit_row();

create table dk_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references dk_orders(id) on delete cascade,
  product_id uuid not null references dk_products(id),
  recipe_id uuid references dk_recipes(id), -- se congela al confirmar el pedido
  quantity integer not null check (quantity > 0),
  unit_price numeric not null check (unit_price >= 0),
  line_total numeric generated always as (quantity * unit_price) stored,
  observation text,
  kitchen_status dk_kitchen_item_status not null default 'PENDIENTE',
  created_at timestamptz not null default now()
);

create table dk_order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references dk_orders(id) on delete cascade,
  from_status dk_order_status,
  to_status dk_order_status not null,
  changed_by uuid references dk_users(id),
  changed_at timestamptz not null default now(),
  note text
);

-- Comanda: se crea 1 vez al confirmar el pedido. El detalle de platos vive en
-- dk_order_items (ya inmutable tras confirmar); esta tabla solo marca que
-- existe la comanda y datos propios de cocina (prioridad).
create table dk_kitchen_tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references dk_orders(id) on delete cascade unique,
  priority integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Reservas de inventario (stock comprometido, aun no consumido)
-- ---------------------------------------------------------------------------

create table dk_inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references dk_ingredients(id),
  order_item_id uuid not null references dk_order_items(id) on delete cascade,
  quantity_base_unit numeric not null check (quantity_base_unit > 0),
  status dk_reservation_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index dk_inventory_reservations_ingredient_idx on dk_inventory_reservations (ingredient_id, status);

create or replace function dk_apply_reservation_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update dk_ingredient_stock
  set stock_reserved = stock_reserved + new.quantity_base_unit, updated_at = now()
  where ingredient_id = new.ingredient_id;
  return new;
end;
$$;

create trigger dk_trg_reservation_insert
  after insert on dk_inventory_reservations
  for each row execute function dk_apply_reservation_insert();

create or replace function dk_apply_reservation_resolution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'ACTIVE' and new.status in ('RELEASED','CONSUMED') then
    update dk_ingredient_stock
    set stock_reserved = stock_reserved - old.quantity_base_unit, updated_at = now()
    where ingredient_id = old.ingredient_id;
  end if;
  return new;
end;
$$;

create trigger dk_trg_reservation_resolution
  after update of status on dk_inventory_reservations
  for each row execute function dk_apply_reservation_resolution();

revoke execute on function dk_apply_reservation_insert() from public, anon, authenticated;
revoke execute on function dk_apply_reservation_resolution() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Guardas y recalculo de totales
-- ---------------------------------------------------------------------------

create or replace function dk_order_items_guard_editable()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status dk_order_status;
begin
  select status into v_status from dk_orders where id = coalesce(new.order_id, old.order_id);
  if v_status <> 'NUEVO' then
    raise exception 'No se pueden modificar los platos de un pedido en estado % (order_id=%)', v_status, coalesce(new.order_id, old.order_id);
  end if;
  return coalesce(new, old);
end;
$$;

create trigger dk_trg_order_items_guard
  before insert or update or delete on dk_order_items
  for each row execute function dk_order_items_guard_editable();

create or replace function dk_recalc_order_subtotal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  v_order_id := coalesce(new.order_id, old.order_id);
  update dk_orders
  set subtotal = coalesce((select sum(line_total) from dk_order_items where order_id = v_order_id), 0)
  where id = v_order_id;
  return coalesce(new, old);
end;
$$;

create trigger dk_trg_recalc_order_subtotal
  after insert or update or delete on dk_order_items
  for each row execute function dk_recalc_order_subtotal();

revoke execute on function dk_order_items_guard_editable() from public, anon, authenticated;
revoke execute on function dk_recalc_order_subtotal() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: confirmar pedido -> valida stock, reserva insumos, crea comanda
-- ---------------------------------------------------------------------------

create or replace function dk_confirm_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status dk_order_status;
  v_item record;
  v_recipe_id uuid;
  v_req record;
  v_available numeric;
begin
  if dk_current_role() not in ('ADMIN','MANAGER','CASHIER') then
    raise exception 'No autorizado para confirmar pedidos';
  end if;

  select status into v_status from dk_orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido % no existe', p_order_id;
  end if;
  if v_status <> 'NUEVO' then
    raise exception 'Solo se pueden confirmar pedidos en estado NUEVO (actual: %)', v_status;
  end if;
  if not exists (select 1 from dk_order_items where order_id = p_order_id) then
    raise exception 'El pedido no tiene platos';
  end if;

  -- Congela la receta vigente de cada plato en el momento de confirmar.
  for v_item in select id, product_id from dk_order_items where order_id = p_order_id loop
    select active_recipe_id into v_recipe_id from dk_products where id = v_item.product_id;
    if v_recipe_id is null then
      raise exception 'El plato % no tiene una receta activa; no se puede confirmar el pedido', v_item.product_id;
    end if;
    update dk_order_items set recipe_id = v_recipe_id where id = v_item.id;
  end loop;

  -- Valida stock disponible agregando requerimientos por insumo (un mismo
  -- insumo puede repetirse en varios platos del mismo pedido).
  for v_req in
    select ri.ingredient_id, sum(ri.quantity * oi.quantity) as required
    from dk_order_items oi
    join dk_recipe_items ri on ri.recipe_id = oi.recipe_id
    where oi.order_id = p_order_id
    group by ri.ingredient_id
    order by ri.ingredient_id
  loop
    select stock_available into v_available from dk_ingredient_stock where ingredient_id = v_req.ingredient_id for update;
    if coalesce(v_available, 0) < v_req.required then
      raise exception 'Stock insuficiente para el insumo % (disponible %, requerido %)', v_req.ingredient_id, coalesce(v_available, 0), v_req.required;
    end if;
  end loop;

  insert into dk_inventory_reservations (ingredient_id, order_item_id, quantity_base_unit)
  select ri.ingredient_id, oi.id, ri.quantity * oi.quantity
  from dk_order_items oi
  join dk_recipe_items ri on ri.recipe_id = oi.recipe_id
  where oi.order_id = p_order_id;

  insert into dk_kitchen_tickets (order_id) values (p_order_id)
  on conflict (order_id) do nothing;

  update dk_orders set status = 'CONFIRMADO' where id = p_order_id;

  insert into dk_order_status_history (order_id, from_status, to_status, changed_by)
  values (p_order_id, 'NUEVO', 'CONFIRMADO', dk_current_profile_id());
end;
$$;

revoke execute on function dk_confirm_order(uuid) from public, anon;
grant execute on function dk_confirm_order(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: cancelar pedido -> libera reservas activas o devuelve lo ya consumido
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
  if dk_current_role() not in ('ADMIN','MANAGER','CASHIER') then
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
-- RLS
-- ---------------------------------------------------------------------------

alter table dk_customers enable row level security;
alter table dk_orders enable row level security;
alter table dk_order_items enable row level security;
alter table dk_order_status_history enable row level security;
alter table dk_kitchen_tickets enable row level security;
alter table dk_inventory_reservations enable row level security;

-- Clientes: ADMIN/MANAGER/CASHIER leen y escriben (ver ADR 0005).
create policy dk_customers_all on dk_customers for all to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','CASHIER'))
  with check (dk_current_role() in ('ADMIN','MANAGER','CASHIER'));

-- Pedidos: ADMIN/MANAGER/CASHIER crean y editan mientras esta NUEVO; KITCHEN
-- solo lee (necesita ver datos del pedido de su comanda).
create policy dk_orders_select on dk_orders for select to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','CASHIER','KITCHEN'));

create policy dk_orders_insert on dk_orders for insert to authenticated
  with check (dk_current_role() in ('ADMIN','MANAGER','CASHIER'));

create policy dk_orders_update on dk_orders for update to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','CASHIER') and status = 'NUEVO')
  with check (dk_current_role() in ('ADMIN','MANAGER','CASHIER'));

-- El cliente solo puede tocar columnas "de borrador"; el estado y los
-- totales derivados cambian exclusivamente via los RPC (SECURITY DEFINER).
revoke insert, update on dk_orders from authenticated;
grant insert (customer_id, channel, notes, discount, delivery_fee, payment_method, created_by) on dk_orders to authenticated;
grant update (customer_id, channel, notes, discount, delivery_fee, payment_method) on dk_orders to authenticated;

create policy dk_order_items_select on dk_order_items for select to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','CASHIER','KITCHEN'));
create policy dk_order_items_write on dk_order_items for all to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','CASHIER'))
  with check (dk_current_role() in ('ADMIN','MANAGER','CASHIER'));

revoke insert, update on dk_order_items from authenticated;
grant insert (order_id, product_id, quantity, unit_price, observation) on dk_order_items to authenticated;
grant update (quantity, unit_price, observation) on dk_order_items to authenticated;

create policy dk_order_status_history_select on dk_order_status_history for select to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','CASHIER','KITCHEN'));
-- Sin insert/update/delete directo: solo la escriben los RPC de cambio de estado.

create policy dk_kitchen_tickets_select on dk_kitchen_tickets for select to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','CASHIER','KITCHEN'));
-- Sin insert/update/delete directo: solo dk_confirm_order la crea.

create policy dk_inventory_reservations_select on dk_inventory_reservations for select to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','INVENTORY','CASHIER','KITCHEN'));
-- Sin insert/update/delete directo: solo via dk_confirm_order / dk_cancel_order / (Fase 6) dk_mark_order_item_ready.
