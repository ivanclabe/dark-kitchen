-- Dark Kitchen — Planificador de Menús: unifica Menús/Menú del día/Menú
-- semanal (dk_menus, dk_menu_items, dk_daily_availability, dk_weekly_menu_items)
-- en una sola tabla con fecha real, para poder copiar semanas/días concretos
-- ("lunes 14 -> lunes 21") tal como lo pidió el usuario — algo que el modelo
-- de recurrencia eterna por día-de-semana no podía expresar (no existía el
-- concepto de "esta semana" vs. "la próxima"). Ver docs/audit/menu-semanal-n8n-integration-audit-2026-09.md
-- para el diagnóstico previo y la razón de por qué había dos ejes separados.
--
-- Las tablas viejas NO se borran (datos mínimos de prueba, pero por si acaso)
-- — solo se marcan deprecadas y se sacan de la UI.

create table dk_menu_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_date date not null,
  product_id uuid not null references dk_products(id) on delete cascade,
  display_order integer not null default 0,
  is_active boolean not null default true,
  start_time time,
  end_time time,
  special_price numeric check (special_price is null or special_price >= 0),
  unit_limit integer check (unit_limit is null or unit_limit > 0),
  while_supplies_last boolean not null default false,
  created_by uuid references dk_users(id) default dk_current_profile_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_date, product_id),
  constraint dk_menu_plan_items_schedule check (
    start_time is null or end_time is null or start_time < end_time
  )
);

create index dk_menu_plan_items_date_idx on dk_menu_plan_items (plan_date);
create index dk_menu_plan_items_product_idx on dk_menu_plan_items (product_id);

create trigger dk_trg_menu_plan_items_updated_at
  before update on dk_menu_plan_items
  for each row execute function dk_set_updated_at();

create trigger dk_trg_audit_menu_plan_items
  after insert or update or delete on dk_menu_plan_items
  for each row execute function dk_audit_row();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table dk_menu_plan_items enable row level security;

create policy dk_menu_plan_items_select on dk_menu_plan_items for select to authenticated using (true);

-- Estructura (crear/reordenar/quitar/fechas futuras) solo ADMIN/MANAGER.
create policy dk_menu_plan_items_write on dk_menu_plan_items for all to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER'))
  with check (dk_current_role() in ('ADMIN','MANAGER'));

-- KITCHEN puede marcar agotado/reactivar en caliente durante el servicio,
-- pero solo el día de HOY (mismo alcance que antes tenía sobre
-- dk_daily_availability) — no puede tocar fechas futuras ni crear/borrar filas.
create policy dk_menu_plan_items_kitchen_today on dk_menu_plan_items for update to authenticated
  using (dk_current_role() = 'KITCHEN' and plan_date = current_date)
  with check (dk_current_role() = 'KITCHEN' and plan_date = current_date);

-- ---------------------------------------------------------------------------
-- dk_today_menu: misma vista, mismas columnas (n8n no se entera del cambio),
-- ahora respaldada por dk_menu_plan_items en vez de dk_weekly_menu_items.
-- price ahora refleja la promoción del día si existe (coalesce con
-- special_price) — antes no había forma de tener precio promocional en la
-- rotación semanal.
-- ---------------------------------------------------------------------------

drop view if exists dk_today_menu;

create view dk_today_menu as
  select
    p.id as product_id,
    p.name as product,
    coalesce(m.special_price, p.price) as price,
    p.description,
    pc.name as category,
    m.display_order,
    true as available
  from dk_menu_plan_items m
  join dk_products p on p.id = m.product_id
  left join dk_product_categories pc on pc.id = p.category_id
  where m.plan_date = current_date
    and m.is_active
    and p.active
  order by m.display_order, p.name;

grant select on dk_today_menu to authenticated;

-- ---------------------------------------------------------------------------
-- dk_create_conversational_order: mismo contrato/firma, ahora resuelve
-- disponibilidad Y precio en una sola consulta a dk_today_menu (que ya
-- incluye el precio promocional del día si lo hay) en vez de consultar
-- dk_products por separado — sigue sin aceptar precio del payload jamás.
-- ---------------------------------------------------------------------------

create or replace function dk_create_conversational_order(
  p_phone text,
  p_customer_name text default null,
  p_channel dk_order_channel default 'WHATSAPP',
  p_external_reference text default null,
  p_notes text default null,
  p_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_price numeric;
  v_quantity integer;
begin
  if dk_current_role() not in ('ADMIN','MANAGER','CASHIER') then
    raise exception 'No autorizado para crear pedidos';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe tener al menos un plato';
  end if;

  v_customer_id := dk_find_or_create_customer_by_phone(p_phone, p_customer_name);

  insert into dk_orders (customer_id, channel, external_reference, notes, created_by)
  values (v_customer_id, p_channel, p_external_reference, p_notes, dk_current_profile_id())
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;

    select price into v_price from dk_today_menu where product_id = v_product_id;
    if not found then
      raise exception 'El producto % no está disponible hoy', v_product_id;
    end if;

    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Cantidad inválida para el producto %', v_product_id;
    end if;

    insert into dk_order_items (order_id, product_id, quantity, unit_price, observation)
    values (v_order_id, v_product_id, v_quantity, v_price, nullif(v_item->>'observation', ''));
  end loop;

  return v_order_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: copiar un rango de p_days días desde p_from_date hacia p_to_date.
-- p_days=1 copia un día puntual, p_days=7 copia una semana completa. Siempre
-- reemplaza el destino por completo (nunca duplica) y nunca crea platos ni
-- recetas — solo clona filas de dk_menu_plan_items. Robusto a rangos que se
-- solapan: primero copia el origen a una tabla temporal antes de borrar el
-- destino.
-- ---------------------------------------------------------------------------

create or replace function dk_copy_menu_plan_range(p_from_date date, p_to_date date, p_days integer default 1)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if dk_current_role() not in ('ADMIN','MANAGER') then
    raise exception 'No autorizado para configurar el planificador de menús';
  end if;
  if p_from_date is null or p_to_date is null then
    raise exception 'Debe indicar fecha de origen y destino';
  end if;
  if p_days is null or p_days < 1 or p_days > 31 then
    raise exception 'Rango de días inválido';
  end if;

  create temporary table if not exists tmp_menu_plan_copy (
    plan_date date,
    product_id uuid,
    display_order integer,
    is_active boolean,
    start_time time,
    end_time time,
    special_price numeric,
    unit_limit integer,
    while_supplies_last boolean
  ) on commit drop;
  truncate tmp_menu_plan_copy;

  insert into tmp_menu_plan_copy
  select plan_date, product_id, display_order, is_active, start_time, end_time, special_price, unit_limit, while_supplies_last
  from dk_menu_plan_items
  where plan_date >= p_from_date and plan_date < p_from_date + p_days;

  delete from dk_menu_plan_items
  where plan_date >= p_to_date and plan_date < p_to_date + p_days;

  insert into dk_menu_plan_items (plan_date, product_id, display_order, is_active, start_time, end_time, special_price, unit_limit, while_supplies_last)
  select plan_date + (p_to_date - p_from_date), product_id, display_order, is_active, start_time, end_time, special_price, unit_limit, while_supplies_last
  from tmp_menu_plan_copy;
end;
$$;

revoke execute on function dk_copy_menu_plan_range(date, date, integer) from public, anon;
grant execute on function dk_copy_menu_plan_range(date, date, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Deprecación documentada (sin borrar tablas/datos existentes).
-- ---------------------------------------------------------------------------

comment on table dk_menus is 'Deprecado — reemplazado por dk_menu_plan_items (Planificador de Menús, 2026-09). No se borra por si hay datos que conservar.';
comment on table dk_menu_items is 'Deprecado — reemplazado por dk_menu_plan_items (Planificador de Menús, 2026-09).';
comment on table dk_daily_availability is 'Deprecado — reemplazado por dk_menu_plan_items (Planificador de Menús, 2026-09).';
comment on table dk_weekly_menu_items is 'Deprecado — reemplazado por dk_menu_plan_items, que usa fechas reales en vez de recurrencia eterna por día de semana (Planificador de Menús, 2026-09).';
