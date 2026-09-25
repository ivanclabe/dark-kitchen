-- Dark Kitchen — Fase 2: Inventario (unidades, insumos, proveedores, compras, ledger).

create type dk_unit_type as enum ('WEIGHT','VOLUME','UNIT');
create type dk_movement_type as enum ('COMPRA','MERMA','AJUSTE','CONSUMO','DEVOLUCION');
create type dk_purchase_status as enum ('BORRADOR','CONFIRMADA','ANULADA');
create type dk_waste_reason as enum ('VENCIMIENTO','DANO','ERROR_PREPARACION','OTRO');

-- ---------------------------------------------------------------------------
-- Unidades
-- ---------------------------------------------------------------------------

create table dk_units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  unit_type dk_unit_type not null,
  factor_to_base numeric not null default 1,
  created_at timestamptz not null default now()
);

comment on table dk_units is 'Catalogo de unidades. factor_to_base es respecto a la unidad base de su unit_type (g, ml y unidad son las bases, factor 1).';

insert into dk_units (code, name, unit_type, factor_to_base) values
  ('g', 'Gramo', 'WEIGHT', 1),
  ('kg', 'Kilogramo', 'WEIGHT', 1000),
  ('ml', 'Mililitro', 'VOLUME', 1),
  ('l', 'Litro', 'VOLUME', 1000),
  ('unidad', 'Unidad', 'UNIT', 1),
  ('docena', 'Docena', 'UNIT', 12),
  -- Placeholders de empaque: su factor real y valido depende del insumo y se
  -- define en dk_ingredient_purchase_units; el factor aqui es solo un default.
  ('caja', 'Caja', 'UNIT', 1),
  ('bolsa', 'Bolsa', 'UNIT', 1),
  ('paquete', 'Paquete', 'UNIT', 1);

-- ---------------------------------------------------------------------------
-- Catalogos
-- ---------------------------------------------------------------------------

create table dk_ingredient_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table dk_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tax_id text,
  phone text,
  email text,
  address text,
  contact_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger dk_trg_suppliers_updated_at
  before update on dk_suppliers
  for each row execute function dk_set_updated_at();

-- ---------------------------------------------------------------------------
-- Insumos
-- ---------------------------------------------------------------------------

create table dk_ingredients (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  category_id uuid references dk_ingredient_categories(id),
  base_unit_id uuid not null references dk_units(id),
  primary_supplier_id uuid references dk_suppliers(id),
  min_stock numeric not null default 0,
  max_stock numeric,
  avg_cost numeric not null default 0,
  perishable boolean not null default false,
  shelf_life_days integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dk_ingredients_stock_range check (max_stock is null or max_stock >= min_stock)
);

create trigger dk_trg_ingredients_updated_at
  before update on dk_ingredients
  for each row execute function dk_set_updated_at();

create trigger dk_trg_audit_ingredients
  after insert or update or delete on dk_ingredients
  for each row execute function dk_audit_row();

-- Empaques de compra especificos del insumo (ej. "Caja x24" de un insumo
-- concreto), que no son una conversion universal de unidades.
create table dk_ingredient_purchase_units (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references dk_ingredients(id) on delete cascade,
  unit_id uuid not null references dk_units(id),
  factor_to_base numeric not null check (factor_to_base > 0),
  created_at timestamptz not null default now(),
  unique (ingredient_id, unit_id)
);

create table dk_supplier_ingredients (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references dk_suppliers(id) on delete cascade,
  ingredient_id uuid not null references dk_ingredients(id) on delete cascade,
  agreed_cost numeric,
  created_at timestamptz not null default now(),
  unique (supplier_id, ingredient_id)
);

-- ---------------------------------------------------------------------------
-- Ledger de inventario + caché de stock
-- ---------------------------------------------------------------------------

create table dk_ingredient_stock (
  ingredient_id uuid primary key references dk_ingredients(id) on delete cascade,
  stock_on_hand numeric not null default 0,
  stock_reserved numeric not null default 0,
  stock_available numeric generated always as (stock_on_hand - stock_reserved) stored,
  updated_at timestamptz not null default now()
);

comment on table dk_ingredient_stock is 'Cache de stock por insumo, mantenida por trigger. 100% reconstruible desde dk_inventory_movements (stock_on_hand) y dk_inventory_reservations (stock_reserved, se agrega en fases posteriores).';

create table dk_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references dk_ingredients(id),
  movement_type dk_movement_type not null,
  quantity_base_unit numeric not null,
  unit_cost numeric,
  reference_type text,
  reference_id uuid,
  reason dk_waste_reason,
  observation text,
  created_by uuid references dk_users(id),
  created_at timestamptz not null default now(),
  constraint dk_movements_sign check (
    (movement_type in ('COMPRA','DEVOLUCION') and quantity_base_unit > 0)
    or (movement_type in ('MERMA','CONSUMO') and quantity_base_unit < 0)
    or (movement_type = 'AJUSTE')
  )
);

comment on table dk_inventory_movements is 'Ledger append-only. Sin policies de UPDATE/DELETE: las correcciones se hacen con un movimiento AJUSTE compensatorio.';

create index dk_inventory_movements_ingredient_created_idx
  on dk_inventory_movements (ingredient_id, created_at);

create or replace function dk_apply_movement_to_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into dk_ingredient_stock (ingredient_id, stock_on_hand)
  values (new.ingredient_id, new.quantity_base_unit)
  on conflict (ingredient_id)
  do update set
    stock_on_hand = dk_ingredient_stock.stock_on_hand + excluded.stock_on_hand,
    updated_at = now();
  return new;
end;
$$;

create trigger dk_trg_movements_update_stock
  after insert on dk_inventory_movements
  for each row execute function dk_apply_movement_to_stock();

-- ---------------------------------------------------------------------------
-- Adjuntos genericos (facturas escaneadas, fotos)
-- ---------------------------------------------------------------------------

create table dk_attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  file_path text not null,
  file_name text not null,
  mime_type text,
  uploaded_by uuid references dk_users(id),
  created_at timestamptz not null default now()
);

create index dk_attachments_entity_idx on dk_attachments (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Compras y facturas
-- ---------------------------------------------------------------------------

create table dk_purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references dk_suppliers(id),
  invoice_number text not null,
  invoice_date date not null,
  status dk_purchase_status not null default 'BORRADOR',
  subtotal numeric not null default 0,
  tax numeric not null default 0,
  total numeric not null default 0,
  notes text,
  created_by uuid references dk_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_id, invoice_number)
);

create trigger dk_trg_purchases_updated_at
  before update on dk_purchases
  for each row execute function dk_set_updated_at();

create trigger dk_trg_audit_purchases
  after insert or update or delete on dk_purchases
  for each row execute function dk_audit_row();

create table dk_purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references dk_purchases(id) on delete cascade,
  ingredient_id uuid not null references dk_ingredients(id),
  quantity numeric not null check (quantity > 0),
  purchase_unit_id uuid not null references dk_units(id),
  unit_cost numeric not null check (unit_cost >= 0),
  line_total numeric generated always as (quantity * unit_cost) stored,
  created_at timestamptz not null default now()
);

create or replace function dk_purchase_guard_editable()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status dk_purchase_status;
begin
  select status into v_status from dk_purchases where id = coalesce(new.purchase_id, old.purchase_id);
  if v_status = 'CONFIRMADA' then
    raise exception 'No se pueden editar lineas de una compra ya confirmada (purchase_id=%)', coalesce(new.purchase_id, old.purchase_id);
  end if;
  return coalesce(new, old);
end;
$$;

create trigger dk_trg_purchase_items_guard
  before insert or update or delete on dk_purchase_items
  for each row execute function dk_purchase_guard_editable();

-- ---------------------------------------------------------------------------
-- RPC: confirmar compra -> genera movimientos COMPRA y actualiza costo promedio
-- ---------------------------------------------------------------------------

create or replace function dk_confirm_purchase(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role dk_role;
  v_status dk_purchase_status;
  v_item record;
  v_conversion numeric;
  v_qty_base numeric;
  v_cost_per_base numeric;
  v_current_stock numeric;
  v_current_avg_cost numeric;
  v_new_avg_cost numeric;
  v_subtotal numeric := 0;
begin
  v_role := dk_current_role();
  if v_role not in ('ADMIN','MANAGER','INVENTORY') then
    raise exception 'No autorizado para confirmar compras';
  end if;

  select status into v_status from dk_purchases where id = p_purchase_id for update;
  if v_status is null then
    raise exception 'Compra % no existe', p_purchase_id;
  end if;
  if v_status <> 'BORRADOR' then
    raise exception 'Solo se pueden confirmar compras en estado BORRADOR (actual: %)', v_status;
  end if;

  for v_item in
    select pi.*, i.base_unit_id, i.avg_cost as ingredient_avg_cost
    from dk_purchase_items pi
    join dk_ingredients i on i.id = pi.ingredient_id
    where pi.purchase_id = p_purchase_id
  loop
    if v_item.purchase_unit_id = v_item.base_unit_id then
      v_conversion := 1;
    else
      select factor_to_base into v_conversion
      from dk_ingredient_purchase_units
      where ingredient_id = v_item.ingredient_id and unit_id = v_item.purchase_unit_id;

      if v_conversion is null then
        select pu.factor_to_base / bu.factor_to_base into v_conversion
        from dk_units pu, dk_units bu
        where pu.id = v_item.purchase_unit_id
          and bu.id = v_item.base_unit_id
          and pu.unit_type = bu.unit_type;
      end if;

      if v_conversion is null then
        raise exception 'No hay conversion definida entre la unidad de compra y la unidad base del insumo % (linea %)', v_item.ingredient_id, v_item.id;
      end if;
    end if;

    v_qty_base := v_item.quantity * v_conversion;
    v_cost_per_base := v_item.unit_cost / v_conversion;

    insert into dk_inventory_movements (
      ingredient_id, movement_type, quantity_base_unit, unit_cost,
      reference_type, reference_id, created_by
    ) values (
      v_item.ingredient_id, 'COMPRA', v_qty_base, v_cost_per_base,
      'purchase_item', v_item.id, dk_current_profile_id()
    );

    select coalesce(stock_on_hand, 0) into v_current_stock
    from dk_ingredient_stock where ingredient_id = v_item.ingredient_id;
    v_current_stock := coalesce(v_current_stock, 0) - v_qty_base; -- stock antes de este movimiento (el trigger ya lo aplico)

    v_current_avg_cost := v_item.ingredient_avg_cost;
    if v_current_stock <= 0 then
      v_new_avg_cost := v_cost_per_base;
    else
      v_new_avg_cost := (v_current_stock * v_current_avg_cost + v_qty_base * v_cost_per_base)
                         / (v_current_stock + v_qty_base);
    end if;

    update dk_ingredients set avg_cost = v_new_avg_cost where id = v_item.ingredient_id;

    v_subtotal := v_subtotal + v_item.line_total;
  end loop;

  update dk_purchases
  set status = 'CONFIRMADA', subtotal = v_subtotal, total = v_subtotal + tax
  where id = p_purchase_id;
end;
$$;

revoke execute on function dk_confirm_purchase(uuid) from public;
grant execute on function dk_confirm_purchase(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: mermas y ajustes manuales
-- ---------------------------------------------------------------------------

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
begin
  if dk_current_role() not in ('ADMIN','MANAGER','INVENTORY') then
    raise exception 'No autorizado para registrar mermas';
  end if;
  if p_quantity <= 0 then
    raise exception 'La cantidad de merma debe ser positiva (se registra como salida automaticamente)';
  end if;

  insert into dk_inventory_movements (
    ingredient_id, movement_type, quantity_base_unit, reason, observation, created_by
  ) values (
    p_ingredient_id, 'MERMA', -p_quantity, p_reason, p_observation, dk_current_profile_id()
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

revoke execute on function dk_register_waste(uuid, numeric, dk_waste_reason, text) from public;
grant execute on function dk_register_waste(uuid, numeric, dk_waste_reason, text) to authenticated;

create or replace function dk_register_adjustment(
  p_ingredient_id uuid,
  p_quantity numeric,
  p_observation text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movement_id uuid;
begin
  if dk_current_role() not in ('ADMIN','MANAGER','INVENTORY') then
    raise exception 'No autorizado para registrar ajustes';
  end if;
  if p_quantity = 0 then
    raise exception 'La cantidad de ajuste no puede ser cero';
  end if;

  insert into dk_inventory_movements (
    ingredient_id, movement_type, quantity_base_unit, observation, created_by
  ) values (
    p_ingredient_id, 'AJUSTE', p_quantity, p_observation, dk_current_profile_id()
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

revoke execute on function dk_register_adjustment(uuid, numeric, text) from public;
grant execute on function dk_register_adjustment(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table dk_units enable row level security;
alter table dk_ingredient_categories enable row level security;
alter table dk_suppliers enable row level security;
alter table dk_ingredients enable row level security;
alter table dk_ingredient_purchase_units enable row level security;
alter table dk_supplier_ingredients enable row level security;
alter table dk_ingredient_stock enable row level security;
alter table dk_inventory_movements enable row level security;
alter table dk_attachments enable row level security;
alter table dk_purchases enable row level security;
alter table dk_purchase_items enable row level security;

-- Catalogos de unidades: lectura para cualquier autenticado (se usan en toda
-- la app para mostrar cantidades), escritura solo ADMIN.
create policy dk_units_select on dk_units for select to authenticated using (true);
create policy dk_units_write on dk_units for all to authenticated
  using (dk_current_role() = 'ADMIN') with check (dk_current_role() = 'ADMIN');

create policy dk_ingredient_categories_select on dk_ingredient_categories for select to authenticated using (true);
create policy dk_ingredient_categories_write on dk_ingredient_categories for all to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','INVENTORY'))
  with check (dk_current_role() in ('ADMIN','MANAGER','INVENTORY'));

-- Insumos/proveedores/compras: solo ADMIN, MANAGER, INVENTORY (ver ADR 0005).
create policy dk_suppliers_all on dk_suppliers for all to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','INVENTORY'))
  with check (dk_current_role() in ('ADMIN','MANAGER','INVENTORY'));

create policy dk_ingredients_all on dk_ingredients for all to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','INVENTORY'))
  with check (dk_current_role() in ('ADMIN','MANAGER','INVENTORY'));

create policy dk_ingredient_purchase_units_all on dk_ingredient_purchase_units for all to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','INVENTORY'))
  with check (dk_current_role() in ('ADMIN','MANAGER','INVENTORY'));

create policy dk_supplier_ingredients_all on dk_supplier_ingredients for all to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','INVENTORY'))
  with check (dk_current_role() in ('ADMIN','MANAGER','INVENTORY'));

create policy dk_ingredient_stock_select on dk_ingredient_stock for select to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','INVENTORY'));
-- Sin insert/update/delete directo: solo el trigger (SECURITY DEFINER) la mantiene.

create policy dk_inventory_movements_select on dk_inventory_movements for select to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','INVENTORY'));
-- Sin insert directo: solo via dk_confirm_purchase / dk_register_waste / dk_register_adjustment.
-- Sin policy de update/delete para nadie (ledger append-only).

create policy dk_attachments_all on dk_attachments for all to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','INVENTORY'))
  with check (dk_current_role() in ('ADMIN','MANAGER','INVENTORY'));

create policy dk_purchases_all on dk_purchases for all to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','INVENTORY'))
  with check (dk_current_role() in ('ADMIN','MANAGER','INVENTORY'));

create policy dk_purchase_items_all on dk_purchase_items for all to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','INVENTORY'))
  with check (dk_current_role() in ('ADMIN','MANAGER','INVENTORY'));
