-- ADR 0052 — Menú Público Digital y Pedidos Online.
--
-- The public page reads TODAY's menu from the existing planner
-- (dk_menu_plan_items): nothing is copied. An order placed there is a real
-- order (channel WEB) with server-side prices, the planner's rules (time
-- window, unit limit), stock, opening hours and minimum, and — by default — it
-- is confirmed with the same confirmation as always, so it reaches the kitchen.
--
--   1. Columns: web options on the storefront, delivery and tracking on the order
--   2. One confirmation, two doors (dk_confirm_order → dk_confirm_order_internal)
--   3. Today's public menu, with every rule (dk_public_menu_items)
--   4. dk_public_menu (anon)          5. dk_public_place_order (anon)
--   6. dk_public_order_status (anon)  7. Staff: save the web options

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table dk_storefronts
  add column web_published boolean not null default false,
  add column web_published_at timestamptz,
  add column web_orders_enabled boolean not null default false,
  add column web_delivery boolean not null default true,
  add column web_pickup boolean not null default true,
  add column web_delivery_fee numeric not null default 0 check (web_delivery_fee >= 0),
  add column web_min_order numeric not null default 0 check (web_min_order >= 0),
  add column web_payment_methods text[] not null default array['Efectivo']
    check (web_payment_methods <@ array['Efectivo', 'Transferencia', 'Tarjeta'] and cardinality(web_payment_methods) > 0),
  add column web_transfer_instructions text check (web_transfer_instructions is null or char_length(web_transfer_instructions) <= 300),
  add column web_auto_confirm boolean not null default true,
  add column web_message text check (web_message is null or char_length(web_message) <= 200),
  add constraint dk_storefronts_web_fulfillment check (web_delivery or web_pickup);
comment on column dk_storefronts.web_published is 'ADR 0052: the public menu page (quanela.com/menu/{slug}) is on. Independent from published (Quanela Consumer app).';

alter table dk_orders
  add column fulfillment text check (fulfillment in ('delivery', 'pickup')),
  add column delivery_address text check (delivery_address is null or char_length(delivery_address) <= 200),
  add column delivery_reference text check (delivery_reference is null or char_length(delivery_reference) <= 200),
  add column public_token uuid unique;
comment on column dk_orders.public_token is 'ADR 0052: the tracking code of a public-menu order (unguessable; /menu/{slug}/pedido/{token}).';

-- The same submission twice is one order (idempotency key = external_reference).
create unique index dk_orders_web_idempotency_key on dk_orders (kitchen_id, external_reference)
  where channel = 'WEB' and external_reference is not null;

-- Attempts, for the limits (by phone, network address and account).
create table dk_public_order_attempts (
  id bigint generated always as identity primary key,
  kitchen_id uuid not null references dk_kitchens (id) on delete cascade,
  phone text,
  ip text,
  created_at timestamptz not null default now()
);
create index dk_public_order_attempts_idx on dk_public_order_attempts (kitchen_id, created_at);
alter table dk_public_order_attempts enable row level security;
revoke all on dk_public_order_attempts from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. One confirmation, two doors
-- ---------------------------------------------------------------------------
-- The steps of confirming (freeze recipes, check and reserve stock, ticket,
-- CONFIRMADO). Called by dk_confirm_order (staff, with its checks) and by the
-- public order (auto-confirm). Not callable from the API.
create or replace function dk_confirm_order_internal(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status dk_order_status;
  v_item record;
  v_req record;
  v_available numeric;
begin
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

  for v_item in
    select oi.id, p.name, p.active_recipe_id, p.uses_inventory, p.master_product_id
    from dk_order_items oi
    join dk_products p on p.id = oi.product_id
    where oi.order_id = p_order_id
  loop
    if not v_item.uses_inventory then
      update dk_order_items set recipe_id = null where id = v_item.id;
      continue;
    end if;
    if v_item.active_recipe_id is null then
      if v_item.master_product_id is not null then
        raise exception 'El plato «%» no tiene receta en su menú maestro. Pide que se la agreguen o que apaguen «Descuenta inventario» en el plato.', v_item.name;
      end if;
      raise exception 'El plato «%» no tiene receta. Créala o apaga «Descuenta inventario» en el plato.', v_item.name;
    end if;
    update dk_order_items set recipe_id = v_item.active_recipe_id where id = v_item.id;
  end loop;

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
revoke all on function dk_confirm_order_internal(uuid) from public, anon, authenticated;

create or replace function dk_confirm_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform dk_assert_in_active_kitchen('dk_orders', p_order_id);
  if not dk_can('orders.confirm') then
    raise exception 'No autorizado para confirmar pedidos';
  end if;
  perform dk_confirm_order_internal(p_order_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Today's public menu, with every rule — used by the page AND by the order
-- ---------------------------------------------------------------------------
create or replace function dk_public_menu_items(p_kitchen uuid)
returns table (
  product_id uuid, name text, description text, category_id uuid, category text, category_order integer, display_order integer,
  price numeric, regular_price numeric, image_path text, images jsonb, start_time time, end_time time,
  unit_limit integer, remaining integer, availability text, uses_inventory boolean, active_recipe_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with k as (
    select id, timezone, (now() at time zone coalesce(timezone, 'America/Bogota')) as local_now from dk_kitchens where id = p_kitchen
  ),
  plan as (
    select m.*, p.name, p.description, p.price as base_price, p.category_id, p.image_path, p.uses_inventory, p.active_recipe_id
    from dk_menu_plan_items m
    join dk_products p on p.id = m.product_id and p.active
    join k on true
    where m.kitchen_id = p_kitchen and m.plan_date = k.local_now::date
  ),
  sold as (
    -- Units already asked for today (cancelled orders do not count).
    select oi.product_id, sum(oi.quantity)::integer as qty
    from dk_order_items oi
    join dk_orders o on o.id = oi.order_id
    join k on true
    where o.kitchen_id = p_kitchen and o.status <> 'CANCELADO'
      and o.created_at >= dk_local_start(k.local_now::date, coalesce(k.timezone, 'America/Bogota'))
    group by oi.product_id
  ),
  cats as (
    select pl.category_id, min(pl.display_order) as first_order from plan pl group by pl.category_id
  )
  select pl.product_id, pl.name, pl.description, pl.category_id, c.name,
         dense_rank() over (order by ca.first_order, c.name nulls last)::integer,
         pl.display_order,
         coalesce(pl.special_price, pl.base_price),
         case when pl.special_price is not null and pl.special_price < pl.base_price then pl.base_price end,
         pl.image_path,
         coalesce((select jsonb_agg(i.path order by i.position) from dk_product_images i where i.product_id = pl.product_id), '[]'::jsonb),
         pl.start_time, pl.end_time, pl.unit_limit,
         case when pl.unit_limit is null then null else greatest(pl.unit_limit - coalesce(s.qty, 0), 0) end,
         case
           when not pl.is_active then 'sold_out'
           when pl.unit_limit is not null and coalesce(s.qty, 0) >= pl.unit_limit then 'sold_out'
           when pl.start_time is not null and k.local_now::time < pl.start_time then 'later'
           when pl.end_time is not null and k.local_now::time >= pl.end_time then 'ended'
           else 'available'
         end,
         pl.uses_inventory, pl.active_recipe_id
  from plan pl
  join k on true
  left join dk_product_categories c on c.id = pl.category_id
  left join cats ca on ca.category_id is not distinct from pl.category_id
  left join sold s on s.product_id = pl.product_id
$$;
revoke all on function dk_public_menu_items(uuid) from public, anon, authenticated;

-- The account behind a public slug, if its web menu is published.
create or replace function dk_public_menu_account(p_slug text)
returns table (kitchen_id uuid, name text, slug text, icon_key text, cuisine text, timezone text, currency text, sf dk_storefronts)
language sql
stable
security definer
set search_path = public
as $$
  select k.id, k.name, k.slug, k.icon_key, coalesce(k.cuisine, o.category), coalesce(k.timezone, 'America/Bogota'), coalesce(k.currency, 'COP'), s
  from dk_kitchens k
  join dk_organizations o on o.id = k.organization_id and o.active
  join dk_storefronts s on s.kitchen_id = k.id and s.web_published
  where k.slug = lower(btrim(p_slug)) and k.active
$$;
revoke all on function dk_public_menu_account(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The public menu page (anon)
-- ---------------------------------------------------------------------------
create or replace function dk_public_menu(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a record;
begin
  select * into a from dk_public_menu_account(p_slug);
  if not found then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object(
    'found', true,
    'business', jsonb_build_object(
      'name', a.name, 'slug', a.slug, 'iconKey', a.icon_key, 'cuisine', a.cuisine, 'tagline', (a.sf).tagline,
      'whatsapp', (a.sf).whatsapp_phone, 'timezone', a.timezone, 'currency', a.currency, 'message', (a.sf).web_message,
      'openState', dk_storefront_open_state(a.kitchen_id, now())),
    'ordering', jsonb_build_object(
      'enabled', (a.sf).web_orders_enabled, 'delivery', (a.sf).web_delivery, 'pickup', (a.sf).web_pickup,
      'deliveryFee', (a.sf).web_delivery_fee, 'minOrder', (a.sf).web_min_order,
      'paymentMethods', to_jsonb((a.sf).web_payment_methods), 'transferInstructions', (a.sf).web_transfer_instructions,
      'autoConfirm', (a.sf).web_auto_confirm),
    'today', (now() at time zone a.timezone)::date,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.product_id, 'name', i.name, 'description', i.description, 'categoryId', i.category_id,
        'category', coalesce(i.category, 'Otros'), 'categoryOrder', i.category_order,
        'price', i.price, 'regularPrice', i.regular_price, 'imagePath', i.image_path, 'images', i.images,
        'availableFrom', to_char(i.start_time, 'HH24:MI'), 'availableUntil', to_char(i.end_time, 'HH24:MI'),
        'remaining', i.remaining, 'availability', i.availability) order by i.category_order, i.display_order, i.name)
      from dk_public_menu_items(a.kitchen_id) i), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Place an order from the public menu (anon)
-- ---------------------------------------------------------------------------
-- p_order: { idempotencyKey, customer: { name, phone }, fulfillment: 'delivery'|'pickup', address, reference,
--            paymentMethod, notes, items: [{ productId, quantity, note }], website (honeypot: must be empty) }
-- Errors carry a code in HINT: closed, not_accepting, unavailable, limit, stock, min_order, invalid, rate_limited.
create or replace function dk_public_place_order(p_slug text, p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  v_open jsonb;
  v_key text := nullif(btrim(coalesce(p_order ->> 'idempotencyKey', '')), '');
  v_name text := btrim(coalesce(p_order #>> '{customer,name}', ''));
  v_phone text;
  v_fulfillment text := p_order ->> 'fulfillment';
  v_address text := nullif(btrim(coalesce(p_order ->> 'address', '')), '');
  v_reference text := nullif(btrim(coalesce(p_order ->> 'reference', '')), '');
  v_payment text := p_order ->> 'paymentMethod';
  v_notes text := nullif(btrim(coalesce(p_order ->> 'notes', '')), '');
  v_ip text;
  v_existing record;
  v_line jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_item record;
  v_qty integer;
  v_subtotal numeric := 0;
  v_fee numeric := 0;
  v_customer uuid;
  v_order uuid;
  v_number integer;
  v_token uuid := gen_random_uuid();
  v_confirmed boolean := false;
  v_req record;
  v_available numeric;
begin
  -- A robot fills the hidden field: same answer as any refusal, nothing created.
  if nullif(btrim(coalesce(p_order ->> 'website', '')), '') is not null then
    raise exception 'No pudimos recibir el pedido' using hint = 'invalid';
  end if;

  select * into a from dk_public_menu_account(p_slug);
  if not found then raise exception 'Este menú no está publicado' using hint = 'not_accepting'; end if;
  if not (a.sf).web_orders_enabled then raise exception 'Este negocio no recibe pedidos por aquí. Escríbele por WhatsApp.' using hint = 'not_accepting'; end if;

  -- The same submission again: the same order.
  if v_key is not null then
    select o.order_number, o.public_token, o.status into v_existing
    from dk_orders o where o.kitchen_id = a.kitchen_id and o.channel = 'WEB' and o.external_reference = v_key;
    if found then
      return jsonb_build_object('orderNumber', v_existing.order_number, 'token', v_existing.public_token,
                                'status', v_existing.status, 'confirmed', v_existing.status <> 'NUEVO', 'repeated', true);
    end if;
  end if;

  v_open := dk_storefront_open_state(a.kitchen_id, now());
  if v_open ->> 'state' = 'closed' then
    raise exception 'El negocio está cerrado en este momento' using hint = 'closed', detail = coalesce(v_open ->> 'opens_at', '');
  end if;

  -- What the person typed.
  if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'Escribe tu nombre' using hint = 'invalid'; end if;
  v_phone := dk_normalize_phone(p_order #>> '{customer,phone}');
  if v_phone is null or v_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Revisa tu número de celular' using hint = 'invalid'; end if;
  if v_fulfillment = 'delivery' and not (a.sf).web_delivery or v_fulfillment = 'pickup' and not (a.sf).web_pickup
     or v_fulfillment is null or v_fulfillment not in ('delivery', 'pickup') then
    raise exception 'Elige cómo recibes tu pedido' using hint = 'invalid';
  end if;
  if v_fulfillment = 'delivery' and (v_address is null or char_length(v_address) < 5) then
    raise exception 'Escribe la dirección de entrega' using hint = 'invalid';
  end if;
  if v_payment is null or not (v_payment = any ((a.sf).web_payment_methods)) then
    raise exception 'Elige cómo vas a pagar' using hint = 'invalid';
  end if;
  if char_length(coalesce(v_notes, '')) > 300 or char_length(coalesce(v_address, '')) > 200 or char_length(coalesce(v_reference, '')) > 200 then
    raise exception 'Algún texto es demasiado largo' using hint = 'invalid';
  end if;
  if jsonb_typeof(p_order -> 'items') <> 'array' or jsonb_array_length(p_order -> 'items') = 0 or jsonb_array_length(p_order -> 'items') > 30 then
    raise exception 'El pedido está vacío' using hint = 'invalid';
  end if;

  -- Limits: by phone, by network address and by account (last hour).
  begin
    v_ip := nullif(btrim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for',
                                             current_setting('request.headers', true)::json ->> 'cf-connecting-ip', ''), ',', 1)), '');
  exception when others then v_ip := null;
  end;
  delete from dk_public_order_attempts where created_at < now() - interval '1 day';
  if (select count(*) from dk_public_order_attempts where kitchen_id = a.kitchen_id and phone = v_phone and created_at > now() - interval '1 hour') >= 5
     or (v_ip is not null and (select count(*) from dk_public_order_attempts where ip = v_ip and created_at > now() - interval '1 hour') >= 20)
     or (select count(*) from dk_public_order_attempts where kitchen_id = a.kitchen_id and created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Demasiados pedidos seguidos. Espera un momento o escríbele al negocio por WhatsApp.' using hint = 'rate_limited';
  end if;

  -- One order at a time per account: limits and stock are checked against what is really left.
  perform pg_advisory_xact_lock(hashtextextended('dk_public_order:' || a.kitchen_id::text, 0));

  -- Lines: the same dish twice counts once; prices come from today's menu, never from the browser.
  for v_line in
    select jsonb_build_object('productId', x ->> 'productId', 'quantity', sum((x ->> 'quantity')::integer),
                              'note', string_agg(nullif(btrim(x ->> 'note'), ''), ' · '))
    from jsonb_array_elements(p_order -> 'items') x
    group by x ->> 'productId'
  loop
    v_qty := (v_line ->> 'quantity')::integer;
    if v_qty is null or v_qty <= 0 or v_qty > 50 then raise exception 'Revisa las cantidades' using hint = 'invalid'; end if;
    select * into v_item from dk_public_menu_items(a.kitchen_id) i where i.product_id = (v_line ->> 'productId')::uuid;
    if not found then
      raise exception 'Un plato ya no está en el menú de hoy' using hint = 'unavailable', detail = v_line ->> 'productId';
    end if;
    if v_item.availability <> 'available' then
      raise exception '«%» no está disponible en este momento', v_item.name using hint = 'unavailable', detail = v_item.product_id::text;
    end if;
    if v_item.remaining is not null and v_qty > v_item.remaining then
      raise exception 'De «%» solo quedan %', v_item.name, v_item.remaining using hint = 'limit', detail = v_item.product_id::text;
    end if;
    v_subtotal := v_subtotal + v_item.price * v_qty;
    v_lines := v_lines || jsonb_build_object('productId', v_item.product_id, 'name', v_item.name, 'quantity', v_qty, 'price', v_item.price,
                                             'note', left(v_line ->> 'note', 200), 'usesInventory', v_item.uses_inventory, 'recipeId', v_item.active_recipe_id);
  end loop;

  -- Stock, for the dishes that use inventory (the reservation itself happens when confirming).
  for v_req in
    select ri.ingredient_id, sum(ri.quantity * (l ->> 'quantity')::integer) as required, string_agg(distinct l ->> 'name', ', ') as dishes
    from jsonb_array_elements(v_lines) l
    join dk_recipe_items ri on ri.recipe_id = (l ->> 'recipeId')::uuid
    where (l ->> 'usesInventory')::boolean
    group by ri.ingredient_id
  loop
    select stock_available into v_available from dk_ingredient_stock where ingredient_id = v_req.ingredient_id;
    if coalesce(v_available, 0) < v_req.required then
      raise exception 'Se agotó: %', v_req.dishes using hint = 'stock';
    end if;
  end loop;

  if v_subtotal < (a.sf).web_min_order then
    raise exception 'El pedido mínimo es de %', (a.sf).web_min_order using hint = 'min_order', detail = (a.sf).web_min_order::text;
  end if;
  v_fee := case when v_fulfillment = 'delivery' then (a.sf).web_delivery_fee else 0 end;

  insert into dk_public_order_attempts (kitchen_id, phone, ip) values (a.kitchen_id, v_phone, v_ip);

  -- The customer: by phone in this account, or new; the delivery address goes to their history.
  select id into v_customer from dk_customers where kitchen_id = a.kitchen_id and (phone = v_phone or whatsapp_id = v_phone) limit 1;
  if v_customer is null then
    insert into dk_customers (kitchen_id, full_name, phone) values (a.kitchen_id, v_name, v_phone) returning id into v_customer;
  end if;
  if v_fulfillment = 'delivery' then
    update dk_customers set address = v_address where id = v_customer and address is distinct from v_address;
  end if;

  insert into dk_orders (kitchen_id, customer_id, channel, external_reference, notes, delivery_fee, payment_method,
                         fulfillment, delivery_address, delivery_reference, public_token)
  values (a.kitchen_id, v_customer, 'WEB', v_key,
          nullif(concat_ws(' · ', case when v_fulfillment = 'pickup' then 'Recoge en el local' end, v_notes), ''),
          v_fee, v_payment, v_fulfillment, case when v_fulfillment = 'delivery' then v_address end,
          case when v_fulfillment = 'delivery' then v_reference end, v_token)
  returning id, order_number into v_order, v_number;

  insert into dk_order_items (order_id, product_id, quantity, unit_price, observation)
  select v_order, (l ->> 'productId')::uuid, (l ->> 'quantity')::integer, (l ->> 'price')::numeric, nullif(l ->> 'note', '')
  from jsonb_array_elements(v_lines) l;

  -- To the kitchen: the same confirmation as always. If it cannot (stock changed), it waits in «Por confirmar», flagged.
  if (a.sf).web_auto_confirm then
    begin
      perform dk_confirm_order_internal(v_order);
      v_confirmed := true;
    exception when others then
      update dk_orders set requires_review = true where id = v_order;
    end;
  end if;

  return jsonb_build_object('orderNumber', v_number, 'token', v_token, 'status', case when v_confirmed then 'CONFIRMADO' else 'NUEVO' end,
                            'confirmed', v_confirmed, 'subtotal', v_subtotal, 'deliveryFee', v_fee, 'total', v_subtotal + v_fee, 'repeated', false);
exception when unique_violation then
  -- Two identical submissions at the same instant: return the one that won.
  select o.order_number, o.public_token, o.status into v_existing
  from dk_orders o where o.kitchen_id = a.kitchen_id and o.channel = 'WEB' and o.external_reference = v_key;
  if found then
    return jsonb_build_object('orderNumber', v_existing.order_number, 'token', v_existing.public_token,
                              'status', v_existing.status, 'confirmed', v_existing.status <> 'NUEVO', 'repeated', true);
  end if;
  raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Track an order (anon, with its unguessable code)
-- ---------------------------------------------------------------------------
create or replace function dk_public_order_status(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'found', true,
    'orderNumber', o.order_number, 'status', o.status, 'fulfillment', o.fulfillment,
    'createdAt', o.created_at, 'updatedAt', o.updated_at,
    'deliveryAddress', o.delivery_address, 'paymentMethod', o.payment_method,
    'subtotal', o.subtotal, 'deliveryFee', o.delivery_fee, 'total', o.total,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'quantity', i.quantity, 'unitPrice', i.unit_price,
                                                           'lineTotal', i.line_total, 'note', i.observation) order by i.created_at), '[]')
              from dk_order_items i join dk_products p on p.id = i.product_id where i.order_id = o.id),
    'business', jsonb_build_object('name', k.name, 'slug', k.slug, 'iconKey', k.icon_key, 'whatsapp', s.whatsapp_phone,
                                   'transferInstructions', s.web_transfer_instructions))
  from dk_orders o
  join dk_kitchens k on k.id = o.kitchen_id
  left join dk_storefronts s on s.kitchen_id = k.id
  where o.public_token = p_token and o.channel = 'WEB'
$$;

revoke all on function dk_public_menu(text), dk_public_place_order(text, jsonb), dk_public_order_status(uuid) from public;
grant execute on function dk_public_menu(text), dk_public_place_order(text, jsonb), dk_public_order_status(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Staff: the web options (storefront.manage). Creates the storefront row if missing.
-- ---------------------------------------------------------------------------
-- p: { published, ordersEnabled, delivery, pickup, deliveryFee, minOrder, paymentMethods[], transferInstructions, autoConfirm, message }
create or replace function dk_public_menu_settings_save(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_methods text[];
begin
  if v_kitchen is null then raise exception 'No hay una cuenta activa'; end if;
  if not dk_can('storefront.manage') then raise exception 'No autorizado para el menú público'; end if;
  select coalesce(array_agg(m), array['Efectivo']) into v_methods
  from jsonb_array_elements_text(coalesce(p -> 'paymentMethods', '[]'::jsonb)) m where m in ('Efectivo', 'Transferencia', 'Tarjeta');
  if not (coalesce((p ->> 'delivery')::boolean, true) or coalesce((p ->> 'pickup')::boolean, true)) then
    raise exception 'Elige al menos una forma de entrega (domicilio o recoger)';
  end if;

  insert into dk_storefronts (kitchen_id, updated_by) values (v_kitchen, dk_current_profile_id())
  on conflict (kitchen_id) do nothing;

  update dk_storefronts set
    web_published = coalesce((p ->> 'published')::boolean, web_published),
    web_published_at = case when coalesce((p ->> 'published')::boolean, web_published) and not web_published then now()
                            when not coalesce((p ->> 'published')::boolean, web_published) then null else web_published_at end,
    web_orders_enabled = coalesce((p ->> 'ordersEnabled')::boolean, web_orders_enabled),
    web_delivery = coalesce((p ->> 'delivery')::boolean, web_delivery),
    web_pickup = coalesce((p ->> 'pickup')::boolean, web_pickup),
    web_delivery_fee = coalesce(nullif(p ->> 'deliveryFee', '')::numeric, web_delivery_fee),
    web_min_order = coalesce(nullif(p ->> 'minOrder', '')::numeric, web_min_order),
    web_payment_methods = case when p ? 'paymentMethods' then v_methods else web_payment_methods end,
    web_transfer_instructions = case when p ? 'transferInstructions' then nullif(btrim(p ->> 'transferInstructions'), '') else web_transfer_instructions end,
    web_auto_confirm = coalesce((p ->> 'autoConfirm')::boolean, web_auto_confirm),
    web_message = case when p ? 'message' then nullif(btrim(p ->> 'message'), '') else web_message end,
    updated_at = now(), updated_by = dk_current_profile_id()
  where kitchen_id = v_kitchen;
end;
$$;

-- What the staff module reads (the same identity as Consumer, plus the web options).
create or replace function dk_public_menu_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
begin
  if v_kitchen is null then raise exception 'No hay una cuenta activa'; end if;
  if not dk_can('storefront.manage') then raise exception 'No autorizado para el menú público'; end if;
  return (
    select jsonb_build_object(
      'slug', k.slug, 'name', k.name, 'iconKey', k.icon_key, 'whatsapp', s.whatsapp_phone, 'tagline', s.tagline,
      'published', coalesce(s.web_published, false), 'publishedAt', s.web_published_at,
      'ordersEnabled', coalesce(s.web_orders_enabled, false), 'delivery', coalesce(s.web_delivery, true), 'pickup', coalesce(s.web_pickup, true),
      'deliveryFee', coalesce(s.web_delivery_fee, 0), 'minOrder', coalesce(s.web_min_order, 0),
      'paymentMethods', to_jsonb(coalesce(s.web_payment_methods, array['Efectivo'])), 'transferInstructions', s.web_transfer_instructions,
      'autoConfirm', coalesce(s.web_auto_confirm, true), 'message', s.web_message,
      'openState', dk_storefront_open_state(k.id, now()),
      'hasHours', exists (select 1 from dk_kitchen_hours h where h.kitchen_id = k.id))
    from dk_kitchens k left join dk_storefronts s on s.kitchen_id = k.id
    where k.id = v_kitchen);
end;
$$;

revoke all on function dk_public_menu_settings_save(jsonb), dk_public_menu_settings() from public, anon;
grant execute on function dk_public_menu_settings_save(jsonb), dk_public_menu_settings() to authenticated;
