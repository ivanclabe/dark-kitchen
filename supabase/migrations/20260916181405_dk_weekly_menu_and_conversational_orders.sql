-- Dark Kitchen — Menu semanal (recurrente por dia de la semana) y RPC de
-- preparacion para pedidos conversacionales (n8n/WhatsApp). No toca el
-- sistema de Menus existente (dk_menus/dk_menu_items/dk_daily_availability)
-- — resuelve un eje distinto (agrupaciones con nombre + excepciones por
-- fecha exacta) que sigue funcionando igual. Ver docs/adr/0006-whatsapp-boundary.md.

create type dk_day_of_week as enum ('LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO','DOMINGO');

-- ---------------------------------------------------------------------------
-- Menu semanal: que productos se venden cada dia de la semana, y en que orden.
-- ---------------------------------------------------------------------------

create table dk_weekly_menu_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references dk_products(id) on delete cascade,
  day_of_week dk_day_of_week not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, day_of_week)
);

create trigger dk_trg_weekly_menu_items_updated_at
  before update on dk_weekly_menu_items
  for each row execute function dk_set_updated_at();

create trigger dk_trg_audit_weekly_menu_items
  after insert or update or delete on dk_weekly_menu_items
  for each row execute function dk_audit_row();

alter table dk_weekly_menu_items enable row level security;

-- Lectura abierta (cocina/caja/n8n necesitan saber que se vende hoy); solo
-- ADMIN/MANAGER configura la rotacion semanal — mismo patron que dk_menu_items.
create policy dk_weekly_menu_items_select on dk_weekly_menu_items for select to authenticated using (true);
create policy dk_weekly_menu_items_write on dk_weekly_menu_items for all to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER'))
  with check (dk_current_role() in ('ADMIN','MANAGER'));

-- ---------------------------------------------------------------------------
-- Menu del dia: fuente de verdad unica, consultable en una sola llamada
-- (por la app y por n8n). Vista, no funcion: se recalcula sola en cada
-- consulta via CURRENT_DATE, sin logica duplicada del lado del cliente.
-- ---------------------------------------------------------------------------

create or replace function dk_today_day_of_week()
returns dk_day_of_week
language sql
stable
as $$
  select (array['LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO','DOMINGO']::dk_day_of_week[])[extract(isodow from current_date)::int];
$$;

create view dk_today_menu as
  select
    p.id as product_id,
    p.name as product,
    p.price,
    p.description,
    pc.name as category,
    w.display_order,
    true as available
  from dk_weekly_menu_items w
  join dk_products p on p.id = w.product_id
  left join dk_product_categories pc on pc.id = p.category_id
  where w.day_of_week = dk_today_day_of_week()
    and w.is_active
    and p.active
  order by w.display_order, p.name;

grant select on dk_today_menu to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: copiar la configuracion de un dia a otro (reemplaza el destino por
-- completo — nunca duplica productos, solo clona las asociaciones).
-- ---------------------------------------------------------------------------

create or replace function dk_copy_weekly_menu_day(p_from_day dk_day_of_week, p_to_day dk_day_of_week)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if dk_current_role() not in ('ADMIN','MANAGER') then
    raise exception 'No autorizado para configurar el menú semanal';
  end if;
  if p_from_day = p_to_day then
    raise exception 'El día de origen y destino deben ser diferentes';
  end if;

  delete from dk_weekly_menu_items where day_of_week = p_to_day;

  insert into dk_weekly_menu_items (product_id, day_of_week, display_order, is_active)
  select product_id, p_to_day, display_order, is_active
  from dk_weekly_menu_items
  where day_of_week = p_from_day;
end;
$$;

revoke execute on function dk_copy_weekly_menu_day(dk_day_of_week, dk_day_of_week) from public, anon;
grant execute on function dk_copy_weekly_menu_day(dk_day_of_week, dk_day_of_week) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: buscar-o-crear cliente por telefono — usado por el flujo
-- conversacional (n8n) y reutilizable por cualquier flujo futuro que
-- identifique clientes por telefono. Nunca duplica: busca por phone o por
-- whatsapp_id antes de crear.
-- ---------------------------------------------------------------------------

create or replace function dk_find_or_create_customer_by_phone(p_phone text, p_full_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
begin
  if dk_current_role() not in ('ADMIN','MANAGER','CASHIER') then
    raise exception 'No autorizado para gestionar clientes';
  end if;
  if p_phone is null or length(trim(p_phone)) = 0 then
    raise exception 'El teléfono es obligatorio';
  end if;

  select id into v_customer_id from dk_customers where phone = p_phone or whatsapp_id = p_phone limit 1;

  if found then
    update dk_customers set whatsapp_id = coalesce(whatsapp_id, p_phone) where id = v_customer_id;
    return v_customer_id;
  end if;

  insert into dk_customers (full_name, phone, whatsapp_id)
  values (coalesce(nullif(trim(p_full_name), ''), p_phone), p_phone, p_phone)
  returning id into v_customer_id;

  return v_customer_id;
end;
$$;

revoke execute on function dk_find_or_create_customer_by_phone(text, text) from public, anon;
grant execute on function dk_find_or_create_customer_by_phone(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: crear un pedido conversacional en borrador (NUEVO). Resuelve el
-- cliente, valida cada item contra dk_today_menu (existe, activo,
-- disponible HOY) y SIEMPRE resuelve el precio desde dk_products.price en
-- este momento — el parametro no acepta precio, nunca confia en uno
-- externo. Deja el pedido en NUEVO; confirmar/cancelar sigue usando
-- dk_confirm_order/dk_cancel_order sin cambios, igual que el resto de la app.
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
  v_active boolean;
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

    select price, active into v_price, v_active from dk_products where id = v_product_id;
    if not found or not v_active then
      raise exception 'El producto % no existe o no está activo', v_product_id;
    end if;
    if not exists (select 1 from dk_today_menu where product_id = v_product_id) then
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

revoke execute on function dk_create_conversational_order(text, text, dk_order_channel, text, text, jsonb) from public, anon;
grant execute on function dk_create_conversational_order(text, text, dk_order_channel, text, text, jsonb) to authenticated;
