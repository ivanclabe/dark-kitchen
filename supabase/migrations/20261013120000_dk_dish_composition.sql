-- ADR 0059: configurable dishes — a dish's composition (groups of options: soup, protein, drink, sides),
-- what each customer chose, one rule for price and validation, and one rule for what every component consumes.
--
-- The rest does not change: confirming reserves per order line (now also each chosen component), and the
-- kitchen's CONSUMO, cancellations, reverts and the real cost in Insights and Finanzas come from those
-- reservations, as before. A dish without composition works exactly as today.

-- ---------------------------------------------------------------------------
-- 1. The composition of a dish
-- ---------------------------------------------------------------------------
create table dk_product_option_groups (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default dk_current_kitchen_id() references dk_kitchens (id) on delete cascade,
  product_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  -- Required = at least 1; optional = 0.
  min_select integer not null default 0 check (min_select between 0 and 10),
  max_select integer not null default 1 check (max_select between 1 and 10),
  -- The same option more than once («Patacones ×2»).
  allow_repeat boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dk_product_option_groups_range check (max_select >= min_select),
  constraint dk_product_option_groups_kitchen_id_id_key unique (kitchen_id, id),
  constraint dk_product_option_groups_product_id_fkey foreign key (kitchen_id, product_id) references dk_products (kitchen_id, id) on delete cascade
);
create index dk_product_option_groups_product_idx on dk_product_option_groups (product_id, sort_order);

create table dk_product_options (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default dk_current_kitchen_id() references dk_kitchens (id) on delete cascade,
  group_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  -- included: part of the dish · extra: adds its price · courtesy: on the house.
  pricing text not null default 'included' check (pricing in ('included', 'extra', 'courtesy')),
  price numeric not null default 0 check (price >= 0),
  is_default boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  -- What it consumes, per unit of the option: an ingredient or preparation (in its base unit, as typed), or another dish's recipe.
  component_ingredient_id uuid,
  component_quantity numeric check (component_quantity > 0),
  component_unit_id uuid references dk_units (id),
  component_unit_quantity numeric check (component_unit_quantity > 0),
  component_product_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dk_product_options_price check ((pricing = 'extra' and price > 0) or (pricing <> 'extra' and price = 0)),
  constraint dk_product_options_one_component check (num_nonnulls(component_ingredient_id, component_product_id) <= 1),
  constraint dk_product_options_ingredient_quantity check (component_ingredient_id is null or component_quantity is not null),
  constraint dk_product_options_kitchen_id_id_key unique (kitchen_id, id),
  constraint dk_product_options_group_id_fkey foreign key (kitchen_id, group_id) references dk_product_option_groups (kitchen_id, id) on delete cascade,
  constraint dk_product_options_ingredient_fkey foreign key (kitchen_id, component_ingredient_id) references dk_ingredients (kitchen_id, id),
  constraint dk_product_options_product_fkey foreign key (kitchen_id, component_product_id) references dk_products (kitchen_id, id)
);
create index dk_product_options_group_idx on dk_product_options (group_id, sort_order);

-- What a customer chose, kept with the line (names and prices of that moment; the component resolved).
create table dk_order_item_options (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default dk_current_kitchen_id() references dk_kitchens (id) on delete cascade,
  order_item_id uuid not null,
  option_id uuid references dk_product_options (id) on delete set null,
  group_name text not null,
  option_name text not null,
  pricing text not null check (pricing in ('included', 'extra', 'courtesy')),
  quantity integer not null check (quantity between 1 and 10),
  -- The extra per unit of the option (0 when included or courtesy).
  unit_price numeric not null default 0 check (unit_price >= 0),
  component_ingredient_id uuid,
  component_quantity numeric,
  component_product_id uuid,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint dk_order_item_options_item_fkey foreign key (kitchen_id, order_item_id) references dk_order_items (kitchen_id, id) on delete cascade
);
create index dk_order_item_options_item_idx on dk_order_item_options (order_item_id, sort_order);

-- The cost of what was chosen, at ordering time (Insights uses it until there is real consumption).
alter table dk_order_items add column estimated_unit_cost numeric;

create trigger dk_trg_product_option_groups_updated_at before update on dk_product_option_groups for each row execute function dk_set_updated_at();
create trigger dk_trg_product_options_updated_at before update on dk_product_options for each row execute function dk_set_updated_at();
create trigger dk_trg_audit_product_option_groups after insert or update or delete on dk_product_option_groups for each row execute function dk_audit_row();
create trigger dk_trg_audit_product_options after insert or update or delete on dk_product_options for each row execute function dk_audit_row();
create trigger dk_trg_order_item_options_inherit_kitchen before insert on dk_order_item_options
  for each row execute function dk_inherit_kitchen_id('dk_order_items', 'order_item_id');

alter table dk_product_option_groups enable row level security;
alter table dk_product_options enable row level security;
alter table dk_order_item_options enable row level security;
-- Who sees the dishes sees their composition; who sees the orders sees what was chosen. Writes only through the functions below.
create policy dk_product_option_groups_select on dk_product_option_groups for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and ((select dk_can('products.view')) or (select dk_can('menus.view')) or (select dk_can('orders.view'))
         or (select dk_can('kitchen.view')) or (select dk_can('dispatch.view')) or (select dk_can('recipes.view')) or (select dk_can('reports.view'))));
create policy dk_product_options_select on dk_product_options for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and ((select dk_can('products.view')) or (select dk_can('menus.view')) or (select dk_can('orders.view'))
         or (select dk_can('kitchen.view')) or (select dk_can('dispatch.view')) or (select dk_can('recipes.view')) or (select dk_can('reports.view'))));
create policy dk_order_item_options_select on dk_order_item_options for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and ((select dk_can('orders.view')) or (select dk_can('orders.edit'))));
revoke all on dk_product_option_groups, dk_product_options, dk_order_item_options from anon, authenticated;
grant select on dk_product_option_groups, dk_product_options, dk_order_item_options to authenticated;

-- ---------------------------------------------------------------------------
-- 2. One rule for price and validation
-- ---------------------------------------------------------------------------
-- What one unit of an option costs today (its component at average cost).
create or replace function dk_option_unit_cost(p_ingredient uuid, p_quantity numeric, p_product uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select case
    when p_ingredient is not null then coalesce((select avg_cost from dk_ingredients where id = p_ingredient), 0) * p_quantity
    when p_product is not null then coalesce((select dk_calculate_recipe_cost(active_recipe_id) from dk_products where id = p_product), 0)
    else 0 end;
$$;

/*
 * A dish as chosen → its normalized options, unit price and estimated cost. The only rule (ADR 0059, D3):
 * the public menu, WhatsApp and the cashier all go through it. `p_selections` = [{optionId, quantity}];
 * null or missing groups take their default options. Raises (hint) when something is wrong.
 */
create or replace function dk_dish_configuration(p_product_id uuid, p_base_price numeric, p_selections jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_product dk_products;
  g record;
  o record;
  -- No choice at all (SQL null or a JSON null): the defaults.
  v_sel jsonb := case when p_selections is null or jsonb_typeof(p_selections) = 'null' then '[]'::jsonb else p_selections end;
  v_picked jsonb;
  v_count integer;
  v_out jsonb := '[]'::jsonb;
  v_extras numeric := 0;
  v_cost numeric;
  v_qty integer;
  v_known uuid[];
begin
  select * into v_product from dk_products where id = p_product_id;
  if jsonb_typeof(v_sel) <> 'array' then
    raise exception 'Las opciones del plato no son válidas' using hint = 'invalid';
  end if;
  -- Every chosen option must be an active option of this dish.
  select coalesce(array_agg(o2.id), '{}') into v_known
  from dk_product_options o2 join dk_product_option_groups g2 on g2.id = o2.group_id
  where g2.product_id = p_product_id and o2.active;
  if exists (select 1 from jsonb_array_elements(v_sel) s where not ((s ->> 'optionId')::uuid = any (v_known))) then
    raise exception 'Una opción de «%» ya no está disponible', v_product.name using hint = 'option_unavailable', detail = p_product_id::text;
  end if;

  v_cost := coalesce(dk_calculate_recipe_cost(v_product.active_recipe_id), 0);
  for g in select * from dk_product_option_groups where product_id = p_product_id order by sort_order, created_at loop
    -- What was chosen in this group (the same option twice adds up).
    select coalesce(jsonb_agg(jsonb_build_object('optionId', x.option_id, 'quantity', x.qty)), '[]'::jsonb), coalesce(sum(x.qty), 0)
    into v_picked, v_count
    from (select (s ->> 'optionId')::uuid as option_id, sum(greatest(coalesce((s ->> 'quantity')::integer, 1), 0))::integer as qty
          from jsonb_array_elements(v_sel) s
          join dk_product_options op on op.id = (s ->> 'optionId')::uuid and op.group_id = g.id
          group by 1) x
    where x.qty > 0;
    if not g.allow_repeat and exists (select 1 from jsonb_array_elements(v_picked) p where (p ->> 'quantity')::integer > 1) then
      raise exception 'En «%» no se repite la misma opción', g.name using hint = 'option_repeat', detail = g.id::text;
    end if;
    if v_count = 0 and g.min_select > 0 then
      -- Nobody chose: the defaults (WhatsApp, a quick order).
      select coalesce(jsonb_agg(jsonb_build_object('optionId', d.id, 'quantity', 1) order by d.sort_order), '[]'::jsonb), count(*)
      into v_picked, v_count
      from (select id, sort_order from dk_product_options where group_id = g.id and active and is_default order by sort_order limit g.max_select) d;
    end if;
    if v_count < g.min_select then
      raise exception 'Elige %: %', case when g.min_select = 1 then 'una opción' else g.min_select || ' opciones' end, g.name
        using hint = 'option_required', detail = g.id::text;
    end if;
    if v_count > g.max_select then
      raise exception 'En «%» puedes elegir hasta %', g.name, g.max_select using hint = 'option_max', detail = g.id::text;
    end if;
    for o in
      select op.*, (p ->> 'quantity')::integer as qty
      from jsonb_array_elements(v_picked) p join dk_product_options op on op.id = (p ->> 'optionId')::uuid
      order by op.sort_order, op.name
    loop
      v_qty := o.qty;
      v_extras := v_extras + case when o.pricing = 'extra' then o.price * v_qty else 0 end;
      v_cost := v_cost + dk_option_unit_cost(o.component_ingredient_id, o.component_quantity, o.component_product_id) * v_qty;
      v_out := v_out || jsonb_build_object(
        'optionId', o.id, 'groupId', g.id, 'groupName', g.name, 'name', o.name, 'quantity', v_qty, 'pricing', o.pricing,
        'unitPrice', case when o.pricing = 'extra' then o.price else 0 end,
        'componentIngredientId', o.component_ingredient_id, 'componentQuantity', o.component_quantity, 'componentProductId', o.component_product_id,
        'sortOrder', jsonb_array_length(v_out));
    end loop;
  end loop;

  return jsonb_build_object('unitPrice', coalesce(p_base_price, v_product.price) + v_extras, 'extras', v_extras,
                            'estimatedUnitCost', round(v_cost, 4), 'options', v_out);
end;
$$;
revoke all on function dk_dish_configuration(uuid, numeric, jsonb), dk_option_unit_cost(uuid, numeric, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. One rule for what a line consumes
-- ---------------------------------------------------------------------------
/*
 * Lines → what each needs, per ingredient, in its base unit (ADR 0059, D4). A line:
 *   {key, quantity, usesInventory, recipeId, options: [{quantity, componentIngredientId, componentQuantity, componentProductId}]}
 * The dish's recipe × quantity, plus each component × the option's quantity × the line's quantity
 * (an ingredient or preparation as converted; another dish through its active recipe). Used to check stock
 * when ordering and to reserve when confirming, so they can never disagree.
 */
create or replace function dk_order_line_requirements(p_lines jsonb)
returns table (line_key text, ingredient_id uuid, required numeric)
language sql
stable
set search_path = public
as $$
  with lines as (
    select l ->> 'key' as line_key, (l ->> 'quantity')::numeric as qty, (l ->> 'recipeId')::uuid as recipe_id, coalesce(l -> 'options', '[]'::jsonb) as options
    from jsonb_array_elements(p_lines) l
    where coalesce((l ->> 'usesInventory')::boolean, true)
  ),
  parts as (
    select ln.line_key, ri.ingredient_id, ri.quantity * ln.qty as required
    from lines ln join dk_recipe_items ri on ri.recipe_id = ln.recipe_id
    union all
    select ln.line_key, (op ->> 'componentIngredientId')::uuid, (op ->> 'componentQuantity')::numeric * (op ->> 'quantity')::numeric * ln.qty
    from lines ln cross join jsonb_array_elements(ln.options) op
    where op ->> 'componentIngredientId' is not null
    union all
    select ln.line_key, ri.ingredient_id, ri.quantity * (op ->> 'quantity')::numeric * ln.qty
    from lines ln cross join jsonb_array_elements(ln.options) op
    join dk_products cp on cp.id = (op ->> 'componentProductId')::uuid
    join dk_recipe_items ri on ri.recipe_id = cp.active_recipe_id
    where op ->> 'componentProductId' is not null
  )
  select line_key, ingredient_id, sum(required) from parts group by line_key, ingredient_id;
$$;
revoke all on function dk_order_line_requirements(jsonb) from public, anon, authenticated;

-- The lines of an order, as dk_order_line_requirements reads them.
create or replace function dk_order_lines(p_order_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', oi.id, 'quantity', oi.quantity, 'usesInventory', p.uses_inventory, 'recipeId', oi.recipe_id, 'name', p.name,
    'options', coalesce((select jsonb_agg(jsonb_build_object('quantity', x.quantity, 'componentIngredientId', x.component_ingredient_id,
                                                            'componentQuantity', x.component_quantity, 'componentProductId', x.component_product_id))
                         from dk_order_item_options x where x.order_item_id = oi.id), '[]'::jsonb))), '[]'::jsonb)
  from dk_order_items oi join dk_products p on p.id = oi.product_id
  where oi.order_id = p_order_id;
$$;
revoke all on function dk_order_lines(uuid) from public, anon, authenticated;

-- A line and what was chosen, into the order (used by the shared order core and by the cashier).
create or replace function dk_order_insert_line(p_order_id uuid, p_product_id uuid, p_quantity integer, p_config jsonb, p_observation text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item uuid;
begin
  insert into dk_order_items (order_id, product_id, quantity, unit_price, observation, estimated_unit_cost)
  values (p_order_id, p_product_id, p_quantity, (p_config ->> 'unitPrice')::numeric, nullif(btrim(coalesce(p_observation, '')), ''),
          (p_config ->> 'estimatedUnitCost')::numeric)
  returning id into v_item;
  insert into dk_order_item_options (order_item_id, option_id, group_name, option_name, pricing, quantity, unit_price,
                                     component_ingredient_id, component_quantity, component_product_id, sort_order)
  select v_item, (o ->> 'optionId')::uuid, o ->> 'groupName', o ->> 'name', o ->> 'pricing', (o ->> 'quantity')::integer, (o ->> 'unitPrice')::numeric,
         (o ->> 'componentIngredientId')::uuid, (o ->> 'componentQuantity')::numeric, (o ->> 'componentProductId')::uuid, (o ->> 'sortOrder')::integer
  from jsonb_array_elements(coalesce(p_config -> 'options', '[]'::jsonb)) o;
  return v_item;
end;
$$;
revoke all on function dk_order_insert_line(uuid, uuid, integer, jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Confirming reserves every component (per line: the kitchen, cancellations and costs follow)
-- ---------------------------------------------------------------------------
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
  v_lines jsonb;
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
    select oi.id, p.name, p.active_recipe_id, p.uses_inventory, p.master_product_id,
           exists (select 1 from dk_order_item_options x where x.order_item_id = oi.id
                   and (x.component_ingredient_id is not null or x.component_product_id is not null)) as has_components
    from dk_order_items oi
    join dk_products p on p.id = oi.product_id
    where oi.order_id = p_order_id
  loop
    if not v_item.uses_inventory then
      update dk_order_items set recipe_id = null where id = v_item.id;
      continue;
    end if;
    -- ADR 0059: a composed dish may consume only through its components.
    if v_item.active_recipe_id is null and not v_item.has_components then
      if v_item.master_product_id is not null then
        raise exception 'El plato «%» no tiene receta en su menú maestro. Pide que se la agreguen o que apaguen «Descuenta inventario» en el plato.', v_item.name;
      end if;
      raise exception 'El plato «%» no tiene receta. Créala o apaga «Descuenta inventario» en el plato.', v_item.name;
    end if;
    update dk_order_items set recipe_id = v_item.active_recipe_id where id = v_item.id;
  end loop;

  v_lines := dk_order_lines(p_order_id);

  for v_req in
    select r.ingredient_id, i.name, i.is_preparation, u.code as unit_code, sum(r.required) as required
    from dk_order_line_requirements(v_lines) r
    join dk_ingredients i on i.id = r.ingredient_id
    join dk_units u on u.id = i.base_unit_id
    group by r.ingredient_id, i.name, i.is_preparation, u.code
    order by r.ingredient_id
  loop
    select stock_available into v_available from dk_ingredient_stock where ingredient_id = v_req.ingredient_id for update;
    if coalesce(v_available, 0) < v_req.required then
      -- ADR 0057: the ingredient by name; a preparation asks for a batch.
      if v_req.is_preparation then
        raise exception 'Falta «%» (hay %, se necesitan %): prepara un lote en Abastecimiento → Preparaciones', v_req.name,
          dk_format_quantity(coalesce(v_available, 0), v_req.unit_code), dk_format_quantity(v_req.required, v_req.unit_code)
          using hint = 'insufficient_stock';
      end if;
      raise exception 'Stock insuficiente de «%» (disponible %, requerido %)', v_req.name,
        dk_format_quantity(coalesce(v_available, 0), v_req.unit_code), dk_format_quantity(v_req.required, v_req.unit_code)
        using hint = 'insufficient_stock';
    end if;
  end loop;

  -- One reservation per line and ingredient: the kitchen consumes it, a cancellation releases it.
  insert into dk_inventory_reservations (ingredient_id, order_item_id, quantity_base_unit)
  select r.ingredient_id, r.line_key::uuid, r.required
  from dk_order_line_requirements(v_lines) r
  where r.required > 0;

  insert into dk_kitchen_tickets (order_id) values (p_order_id)
  on conflict (order_id) do nothing;

  update dk_orders set status = 'CONFIRMADO' where id = p_order_id;

  insert into dk_order_status_history (order_id, from_status, to_status, changed_by)
  values (p_order_id, 'NUEVO', 'CONFIRMADO', dk_current_profile_id());
end;
$$;
revoke all on function dk_confirm_order_internal(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. The shared order core (public menu, WhatsApp): lines with options, priced by the server
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dk_place_order_internal(p_kitchen uuid, p_order jsonb, p_channel dk_order_channel)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  sf dk_storefronts;
  v_open jsonb;
  v_key text := nullif(btrim(coalesce(p_order ->> 'idempotencyKey', '')), '');
  v_name text := btrim(coalesce(p_order #>> '{customer,name}', ''));
  v_phone text;
  v_fulfillment text := p_order ->> 'fulfillment';
  v_address text := nullif(btrim(coalesce(p_order ->> 'address', '')), '');
  v_reference text := nullif(btrim(coalesce(p_order ->> 'reference', '')), '');
  v_payment text := p_order ->> 'paymentMethod';
  v_notes text := nullif(btrim(coalesce(p_order ->> 'notes', '')), '');
  v_opt_in boolean := coalesce((p_order ->> 'whatsappOptIn')::boolean, false);
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
  v_config jsonb;
  v_signature text;
  v_found integer;
begin
  select * into sf from dk_storefronts where kitchen_id = p_kitchen;
  if not found then raise exception 'Este negocio no recibe pedidos por aquí' using hint = 'not_accepting'; end if;

  -- The same submission again: the same order.
  if v_key is not null then
    select o.id, o.order_number, o.public_token, o.status, o.subtotal, o.delivery_fee, o.total into v_existing
    from dk_orders o where o.kitchen_id = p_kitchen and o.channel = p_channel and o.external_reference = v_key;
    if found then
      return jsonb_build_object('orderId', v_existing.id, 'orderNumber', v_existing.order_number, 'token', v_existing.public_token,
                                'status', v_existing.status, 'confirmed', v_existing.status <> 'NUEVO', 'subtotal', v_existing.subtotal,
                                'deliveryFee', v_existing.delivery_fee, 'total', v_existing.total, 'repeated', true);
    end if;
  end if;

  v_open := dk_storefront_open_state(p_kitchen, now());
  if v_open ->> 'state' = 'closed' then
    raise exception 'El negocio está cerrado en este momento' using hint = 'closed', detail = coalesce(v_open ->> 'opens_at', '');
  end if;

  -- What the person typed.
  if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'Escribe tu nombre' using hint = 'invalid'; end if;
  v_phone := dk_normalize_phone(p_order #>> '{customer,phone}');
  if v_phone is null or v_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Revisa tu número de celular' using hint = 'invalid'; end if;
  if v_fulfillment = 'delivery' and not sf.web_delivery or v_fulfillment = 'pickup' and not sf.web_pickup
     or v_fulfillment is null or v_fulfillment not in ('delivery', 'pickup') then
    raise exception 'Elige cómo recibes tu pedido' using hint = 'invalid';
  end if;
  if v_fulfillment = 'delivery' and (v_address is null or char_length(v_address) < 5) then
    raise exception 'Escribe la dirección de entrega' using hint = 'invalid';
  end if;
  if v_payment is null or not (v_payment = any (sf.web_payment_methods)) then
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
  if (select count(*) from dk_public_order_attempts where kitchen_id = p_kitchen and phone = v_phone and created_at > now() - interval '1 hour') >= 5
     or (v_ip is not null and (select count(*) from dk_public_order_attempts where ip = v_ip and created_at > now() - interval '1 hour') >= 20)
     or (select count(*) from dk_public_order_attempts where kitchen_id = p_kitchen and created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Demasiados pedidos seguidos. Espera un momento o escríbele al negocio por WhatsApp.' using hint = 'rate_limited';
  end if;

  -- One order at a time per account: limits and stock are checked against what is really left.
  perform pg_advisory_xact_lock(hashtextextended('dk_public_order:' || p_kitchen::text, 0));

  -- Lines: prices come from today's menu and the dish's composition, never from the client (ADR 0059: the same
  -- dish chosen two ways is two lines; chosen the same way, one line).
  for v_line in select x from jsonb_array_elements(p_order -> 'items') x loop
    v_qty := (v_line ->> 'quantity')::integer;
    if v_qty is null or v_qty <= 0 or v_qty > 50 then raise exception 'Revisa las cantidades' using hint = 'invalid'; end if;
    select * into v_item from dk_public_menu_items(p_kitchen) i where i.product_id = (v_line ->> 'productId')::uuid;
    if not found then
      raise exception 'Un plato ya no está en el menú de hoy' using hint = 'unavailable', detail = v_line ->> 'productId';
    end if;
    if v_item.availability <> 'available' then
      raise exception '«%» no está disponible en este momento', v_item.name using hint = 'unavailable', detail = v_item.product_id::text;
    end if;
    v_config := dk_dish_configuration(v_item.product_id, v_item.price, v_line -> 'options');
    v_signature := v_item.product_id::text || ':' || coalesce((select string_agg((o ->> 'optionId') || 'x' || (o ->> 'quantity'), ',' order by o ->> 'optionId')
                                                                from jsonb_array_elements(v_config -> 'options') o), '');
    v_found := null;
    select (idx - 1)::integer into v_found from jsonb_array_elements(v_lines) with ordinality t(l, idx) where l ->> 'signature' = v_signature;
    if v_found is not null then
      v_lines := jsonb_set(v_lines, array[v_found::text],
        (v_lines -> v_found) || jsonb_build_object('quantity', (v_lines -> v_found ->> 'quantity')::integer + v_qty,
                                                   'note', left(concat_ws(' · ', nullif(v_lines -> v_found ->> 'note', ''), nullif(btrim(v_line ->> 'note'), '')), 200)));
    else
      v_lines := v_lines || jsonb_build_object('key', jsonb_array_length(v_lines)::text, 'signature', v_signature,
        'productId', v_item.product_id, 'name', v_item.name, 'quantity', v_qty, 'config', v_config,
        'note', left(nullif(btrim(v_line ->> 'note'), ''), 200), 'usesInventory', v_item.uses_inventory, 'recipeId', v_item.active_recipe_id,
        'options', v_config -> 'options');
    end if;
  end loop;

  -- Unit limits count every line of the same dish.
  for v_req in
    select (l ->> 'productId')::uuid as product_id, min(l ->> 'name') as name, sum((l ->> 'quantity')::integer) as qty
    from jsonb_array_elements(v_lines) l group by 1
  loop
    select * into v_item from dk_public_menu_items(p_kitchen) i where i.product_id = v_req.product_id;
    if v_item.remaining is not null and v_req.qty > v_item.remaining then
      raise exception 'De «%» solo quedan %', v_item.name, v_item.remaining using hint = 'limit', detail = v_item.product_id::text;
    end if;
  end loop;
  select coalesce(sum((l ->> 'quantity')::integer * (l #>> '{config,unitPrice}')::numeric), 0) into v_subtotal from jsonb_array_elements(v_lines) l;

  -- Stock: the same rule as the reservation when confirming (dishes that use inventory, with their components).
  for v_req in
    select r.ingredient_id, sum(r.required) as required,
           string_agg(distinct (select l ->> 'name' from jsonb_array_elements(v_lines) l where l ->> 'key' = r.line_key), ', ') as dishes
    from dk_order_line_requirements(v_lines) r
    group by r.ingredient_id
  loop
    select stock_available into v_available from dk_ingredient_stock where ingredient_id = v_req.ingredient_id;
    if coalesce(v_available, 0) < v_req.required then
      raise exception 'Se agotó: %', v_req.dishes using hint = 'stock';
    end if;
  end loop;

  if v_subtotal < sf.web_min_order then
    raise exception 'El pedido mínimo es de %', sf.web_min_order using hint = 'min_order', detail = sf.web_min_order::text;
  end if;
  v_fee := case when v_fulfillment = 'delivery' then sf.web_delivery_fee else 0 end;

  insert into dk_public_order_attempts (kitchen_id, phone, ip) values (p_kitchen, v_phone, v_ip);

  -- The customer: by phone in this account, or new; the delivery address goes to their history.
  select id into v_customer from dk_customers where kitchen_id = p_kitchen and (phone = v_phone or whatsapp_id = v_phone) limit 1;
  if v_customer is null then
    insert into dk_customers (kitchen_id, full_name, phone) values (p_kitchen, v_name, v_phone) returning id into v_customer;
  end if;
  if v_fulfillment = 'delivery' then
    update dk_customers set address = v_address where id = v_customer and address is distinct from v_address;
  end if;
  -- Consent for order notices, given when ordering (ADR 0055). Writing to the business on WhatsApp counts as well.
  if v_opt_in or p_channel = 'WHATSAPP' then
    update dk_customers
    set whatsapp_opt_in = true, whatsapp_opt_in_at = now(), whatsapp_opt_out_at = null,
        whatsapp_opt_in_source = case when p_channel = 'WHATSAPP' then 'whatsapp' else 'web' end,
        whatsapp_id = case when p_channel = 'WHATSAPP' then coalesce(whatsapp_id, v_phone) else whatsapp_id end
    where id = v_customer and (not whatsapp_opt_in or whatsapp_opt_out_at is not null or p_channel = 'WHATSAPP');
  end if;

  insert into dk_orders (kitchen_id, customer_id, channel, external_reference, notes, delivery_fee, payment_method,
                         fulfillment, delivery_address, delivery_reference, public_token)
  values (p_kitchen, v_customer, p_channel, v_key,
          nullif(concat_ws(' · ', case when v_fulfillment = 'pickup' then 'Recoge en el local' end, v_notes), ''),
          v_fee, v_payment, v_fulfillment, case when v_fulfillment = 'delivery' then v_address end,
          case when v_fulfillment = 'delivery' then v_reference end, v_token)
  returning id, order_number into v_order, v_number;

  for v_line in select l from jsonb_array_elements(v_lines) l loop
    perform dk_order_insert_line(v_order, (v_line ->> 'productId')::uuid, (v_line ->> 'quantity')::integer, v_line -> 'config', v_line ->> 'note');
  end loop;

  -- To the kitchen: the same confirmation as always. If it cannot (stock changed), it waits in «Por confirmar», flagged.
  if sf.web_auto_confirm then
    begin
      perform dk_confirm_order_internal(v_order);
      v_confirmed := true;
    exception when others then
      update dk_orders set requires_review = true where id = v_order;
    end;
  end if;

  return jsonb_build_object('orderId', v_order, 'orderNumber', v_number, 'token', v_token, 'status', case when v_confirmed then 'CONFIRMADO' else 'NUEVO' end,
                            'confirmed', v_confirmed, 'subtotal', v_subtotal, 'deliveryFee', v_fee, 'total', v_subtotal + v_fee, 'repeated', false);
exception when unique_violation then
  -- Two identical submissions at the same instant: return the one that won.
  select o.id, o.order_number, o.public_token, o.status, o.subtotal, o.delivery_fee, o.total into v_existing
  from dk_orders o where o.kitchen_id = p_kitchen and o.channel = p_channel and o.external_reference = v_key;
  if found then
    return jsonb_build_object('orderId', v_existing.id, 'orderNumber', v_existing.order_number, 'token', v_existing.public_token,
                              'status', v_existing.status, 'confirmed', v_existing.status <> 'NUEVO', 'subtotal', v_existing.subtotal,
                              'deliveryFee', v_existing.delivery_fee, 'total', v_existing.total, 'repeated', true);
  end if;
  raise;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. The cashier: one line with its options, through the same rule (the base price stays editable)
-- ---------------------------------------------------------------------------
create or replace function dk_order_add_item(p_order_id uuid, p_product_id uuid, p_quantity integer, p_options jsonb default null,
                                             p_base_price numeric default null, p_observation text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status dk_order_status;
  v_config jsonb;
begin
  perform dk_assert_in_active_kitchen('dk_orders', p_order_id);
  perform dk_assert_in_active_kitchen('dk_products', p_product_id);
  if not dk_can('orders.edit') then
    raise exception 'No autorizado para modificar pedidos';
  end if;
  select status into v_status from dk_orders where id = p_order_id;
  if v_status <> 'NUEVO' then
    raise exception 'Solo se agregan platos a un pedido por confirmar' using hint = 'not_editable';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 100 then
    raise exception 'Revisa la cantidad' using hint = 'invalid';
  end if;
  if p_base_price is not null and p_base_price < 0 then
    raise exception 'El precio no puede ser negativo' using hint = 'invalid';
  end if;
  if char_length(coalesce(p_observation, '')) > 300 then
    raise exception 'La observación es demasiado larga' using hint = 'invalid';
  end if;
  v_config := dk_dish_configuration(p_product_id, p_base_price, p_options);
  return dk_order_insert_line(p_order_id, p_product_id, p_quantity, v_config, p_observation);
end;
$$;
revoke all on function dk_order_add_item(uuid, uuid, integer, jsonb, numeric, text) from public, anon;
grant execute on function dk_order_add_item(uuid, uuid, integer, jsonb, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Reading and saving a composition
-- ---------------------------------------------------------------------------
-- A dish's composition, with what each option costs today (for the admin, the cashier and the public menu).
create or replace function dk_product_composition_json(p_product_id uuid, p_public boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name, 'minSelect', g.min_select, 'maxSelect', g.max_select, 'allowRepeat', g.allow_repeat, 'sortOrder', g.sort_order,
    'options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'name', o.name, 'pricing', o.pricing, 'price', o.price, 'isDefault', o.is_default, 'active', o.active, 'sortOrder', o.sort_order,
        -- Public: only what the customer needs (no costs, no recipes), and whether there is stock for one unit.
        'available', case when not p.uses_inventory then true
                          when o.component_ingredient_id is not null then
                            coalesce((select stock_available from dk_ingredient_stock where ingredient_id = o.component_ingredient_id), 0) >= o.component_quantity
                          when o.component_product_id is not null then not exists (
                            select 1 from dk_products cp join dk_recipe_items ri on ri.recipe_id = cp.active_recipe_id
                            left join dk_ingredient_stock st on st.ingredient_id = ri.ingredient_id
                            where cp.id = o.component_product_id and coalesce(st.stock_available, 0) < ri.quantity)
                          else true end)
        || case when p_public then '{}'::jsonb else jsonb_build_object(
             'componentIngredientId', o.component_ingredient_id, 'componentQuantity', o.component_quantity,
             'componentUnitId', o.component_unit_id, 'componentUnitQuantity', o.component_unit_quantity, 'componentProductId', o.component_product_id,
             'componentName', coalesce((select name from dk_ingredients where id = o.component_ingredient_id), (select name from dk_products where id = o.component_product_id)),
             'componentUnitCode', (select u.code from dk_ingredients i join dk_units u on u.id = i.base_unit_id where i.id = o.component_ingredient_id),
             'unitCost', round(dk_option_unit_cost(o.component_ingredient_id, o.component_quantity, o.component_product_id), 4)) end
        order by o.sort_order, o.name)
      from dk_product_options o where o.group_id = g.id and (not p_public or o.active)), '[]'::jsonb))
    order by g.sort_order, g.created_at), '[]'::jsonb)
  from dk_product_option_groups g join dk_products p on p.id = g.product_id
  where g.product_id = p_product_id;
$$;
revoke all on function dk_product_composition_json(uuid, boolean) from public, anon, authenticated;

create or replace function dk_product_composition(p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_product dk_products;
begin
  perform dk_assert_in_active_kitchen('dk_products', p_product_id);
  if not (dk_can('products.view') or dk_can('menus.view') or dk_can('orders.view') or dk_can('orders.edit')) then
    raise exception 'No autorizado';
  end if;
  select * into v_product from dk_products where id = p_product_id;
  return jsonb_build_object('productId', v_product.id, 'name', v_product.name, 'price', v_product.price,
                            'usesInventory', v_product.uses_inventory, 'masterCopy', v_product.master_product_id is not null,
                            'recipeCost', round(coalesce(dk_calculate_recipe_cost(v_product.active_recipe_id), 0), 4),
                            'groups', dk_product_composition_json(p_product_id, false));
end;
$$;

/*
 * Saves the whole composition of a dish (what is not sent is removed; ids sent are kept so orders keep pointing
 * to them). p_groups = [{id?, name, minSelect, maxSelect, allowRepeat, options: [{id?, name, pricing, price, isDefault,
 * active, componentIngredientId?, componentQuantity?, componentUnitId?, componentProductId?}]}].
 */
create or replace function dk_product_composition_save(p_product_id uuid, p_groups jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product dk_products;
  g jsonb;
  o jsonb;
  v_gi integer := 0;
  v_oi integer;
  v_group uuid;
  v_option uuid;
  v_keep_groups uuid[] := '{}';
  v_keep_options uuid[] := '{}';
  v_ing uuid;
  v_prod uuid;
  v_unit uuid;
  v_qty numeric;
  v_factor numeric;
  v_pricing text;
  v_price numeric;
  v_min integer;
  v_max integer;
  v_defaults integer;
begin
  perform dk_assert_in_active_kitchen('dk_products', p_product_id);
  if not dk_can('products.edit') then
    raise exception 'No autorizado para editar platos';
  end if;
  select * into v_product from dk_products where id = p_product_id;
  if v_product.master_product_id is not null then
    raise exception 'Este plato viene de un menú maestro: su composición no se edita aquí' using hint = 'master_copy';
  end if;
  if p_groups is null or jsonb_typeof(p_groups) <> 'array' then
    raise exception 'La composición no es válida' using hint = 'invalid';
  end if;
  if jsonb_array_length(p_groups) > 12 then
    raise exception 'Un plato puede tener hasta 12 grupos de opciones' using hint = 'invalid';
  end if;

  for g in select * from jsonb_array_elements(p_groups) loop
    v_gi := v_gi + 1;
    v_min := coalesce((g ->> 'minSelect')::integer, 0);
    v_max := coalesce((g ->> 'maxSelect')::integer, 1);
    if nullif(btrim(g ->> 'name'), '') is null then raise exception 'Cada grupo necesita un nombre' using hint = 'invalid'; end if;
    if v_max < 1 or v_max > 10 or v_min < 0 or v_min > v_max then
      raise exception 'En «%» revisa cuántas opciones se eligen', g ->> 'name' using hint = 'invalid';
    end if;
    if jsonb_typeof(g -> 'options') <> 'array' or jsonb_array_length(g -> 'options') = 0 then
      raise exception '«%» necesita al menos una opción', g ->> 'name' using hint = 'invalid';
    end if;
    if jsonb_array_length(g -> 'options') > 20 then
      raise exception '«%» puede tener hasta 20 opciones', g ->> 'name' using hint = 'invalid';
    end if;
    v_group := nullif(g ->> 'id', '')::uuid;
    if v_group is not null and not exists (select 1 from dk_product_option_groups where id = v_group and product_id = p_product_id) then
      v_group := null;
    end if;
    if v_group is null then
      insert into dk_product_option_groups (kitchen_id, product_id, name, min_select, max_select, allow_repeat, sort_order)
      values (v_product.kitchen_id, p_product_id, btrim(g ->> 'name'), v_min, v_max, coalesce((g ->> 'allowRepeat')::boolean, false), v_gi)
      returning id into v_group;
    else
      update dk_product_option_groups
      set name = btrim(g ->> 'name'), min_select = v_min, max_select = v_max, allow_repeat = coalesce((g ->> 'allowRepeat')::boolean, false), sort_order = v_gi
      where id = v_group;
    end if;
    v_keep_groups := v_keep_groups || v_group;

    v_oi := 0;
    v_defaults := 0;
    for o in select * from jsonb_array_elements(g -> 'options') loop
      v_oi := v_oi + 1;
      if nullif(btrim(o ->> 'name'), '') is null then raise exception 'Cada opción de «%» necesita un nombre', g ->> 'name' using hint = 'invalid'; end if;
      v_pricing := coalesce(o ->> 'pricing', 'included');
      v_price := case when v_pricing = 'extra' then coalesce((o ->> 'price')::numeric, 0) else 0 end;
      if v_pricing not in ('included', 'extra', 'courtesy') then raise exception 'Tipo de precio no válido' using hint = 'invalid'; end if;
      if v_pricing = 'extra' and v_price <= 0 then
        raise exception '«%» es un extra: escribe su precio', o ->> 'name' using hint = 'invalid';
      end if;
      if coalesce((o ->> 'isDefault')::boolean, false) and coalesce((o ->> 'active')::boolean, true) then v_defaults := v_defaults + 1; end if;

      v_ing := nullif(o ->> 'componentIngredientId', '')::uuid;
      v_prod := nullif(o ->> 'componentProductId', '')::uuid;
      v_unit := nullif(o ->> 'componentUnitId', '')::uuid;
      v_qty := nullif(o ->> 'componentQuantity', '')::numeric;
      v_factor := null;
      if v_ing is not null and v_prod is not null then
        raise exception '«%» consume un insumo o un plato, no ambos', o ->> 'name' using hint = 'invalid';
      end if;
      if v_ing is not null then
        if not exists (select 1 from dk_ingredients where id = v_ing and kitchen_id = v_product.kitchen_id) then
          raise exception 'Un insumo de «%» no es de esta cuenta', o ->> 'name' using hint = 'invalid';
        end if;
        if v_qty is null or v_qty <= 0 then raise exception 'Escribe cuánto lleva «%»', o ->> 'name' using hint = 'invalid'; end if;
        -- ADR 0056: any compatible unit, stored in the base unit.
        v_factor := case when v_unit is null or v_unit = (select base_unit_id from dk_ingredients where id = v_ing) then 1 else dk_unit_factor(v_ing, v_unit) end;
        if v_factor is null then
          raise exception 'No hay conversión de % a la unidad base de «%»', (select code from dk_units where id = v_unit), (select name from dk_ingredients where id = v_ing)
            using hint = 'no_conversion';
        end if;
      end if;
      if v_prod is not null then
        if v_prod = p_product_id or not exists (select 1 from dk_products where id = v_prod and kitchen_id = v_product.kitchen_id) then
          raise exception '«%» no puede consumir ese plato', o ->> 'name' using hint = 'invalid';
        end if;
      end if;

      v_option := nullif(o ->> 'id', '')::uuid;
      if v_option is not null and not exists (select 1 from dk_product_options op join dk_product_option_groups gg on gg.id = op.group_id
                                              where op.id = v_option and gg.product_id = p_product_id) then
        v_option := null;
      end if;
      if v_option is null then
        insert into dk_product_options (kitchen_id, group_id, name, pricing, price, is_default, active, sort_order,
                                        component_ingredient_id, component_quantity, component_unit_id, component_unit_quantity, component_product_id)
        values (v_product.kitchen_id, v_group, btrim(o ->> 'name'), v_pricing, v_price, coalesce((o ->> 'isDefault')::boolean, false),
                coalesce((o ->> 'active')::boolean, true), v_oi,
                v_ing, case when v_ing is not null then v_qty * v_factor end,
                case when v_ing is not null and v_factor <> 1 then v_unit end, case when v_ing is not null and v_factor <> 1 then v_qty end, v_prod)
        returning id into v_option;
      else
        update dk_product_options
        set group_id = v_group, name = btrim(o ->> 'name'), pricing = v_pricing, price = v_price, is_default = coalesce((o ->> 'isDefault')::boolean, false),
            active = coalesce((o ->> 'active')::boolean, true), sort_order = v_oi,
            component_ingredient_id = v_ing, component_quantity = case when v_ing is not null then v_qty * v_factor end,
            component_unit_id = case when v_ing is not null and v_factor <> 1 then v_unit end,
            component_unit_quantity = case when v_ing is not null and v_factor <> 1 then v_qty end,
            component_product_id = v_prod
        where id = v_option;
      end if;
      v_keep_options := v_keep_options || v_option;
    end loop;
    if v_defaults > v_max then
      raise exception 'En «%» hay más predeterminadas que las que se pueden elegir', g ->> 'name' using hint = 'invalid';
    end if;
  end loop;

  -- What was not sent goes away (orders keep their names and prices: dk_order_item_options keeps a copy).
  delete from dk_product_options o using dk_product_option_groups gg
  where gg.id = o.group_id and gg.product_id = p_product_id and not (o.id = any (v_keep_options));
  delete from dk_product_option_groups where product_id = p_product_id and not (id = any (v_keep_groups));
  return dk_product_composition(p_product_id);
end;
$$;
revoke all on function dk_product_composition(uuid), dk_product_composition_save(uuid, jsonb) from public, anon;
grant execute on function dk_product_composition(uuid), dk_product_composition_save(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. The public menu carries each dish's options; Insights estimates with what was chosen
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dk_public_menu_build(p_kitchen uuid, p_theme jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a record;
begin
  select k.id, k.name, k.slug, k.icon_key, coalesce(k.cuisine, o.category) as cuisine, coalesce(k.timezone, 'America/Bogota') as timezone,
         coalesce(k.currency, 'COP') as currency, s.tagline, s.whatsapp_phone, s.web_message,
         coalesce(s.web_orders_enabled, false) as orders_enabled, coalesce(s.web_delivery, true) as delivery, coalesce(s.web_pickup, true) as pickup,
         coalesce(s.web_delivery_fee, 0) as delivery_fee, coalesce(s.web_min_order, 0) as min_order,
         coalesce(s.web_payment_methods, array['Efectivo']) as payment_methods, s.web_transfer_instructions, coalesce(s.web_auto_confirm, true) as auto_confirm
  into a
  from dk_kitchens k
  join dk_organizations o on o.id = k.organization_id
  left join dk_storefronts s on s.kitchen_id = k.id
  where k.id = p_kitchen;
  if not found then return jsonb_build_object('found', false); end if;
  return jsonb_build_object(
    'found', true,
    'business', jsonb_build_object(
      'name', a.name, 'slug', a.slug, 'iconKey', a.icon_key, 'cuisine', a.cuisine, 'tagline', a.tagline,
      'whatsapp', a.whatsapp_phone, 'timezone', a.timezone, 'currency', a.currency, 'message', a.web_message,
      'openState', dk_storefront_open_state(a.id, now())),
    'ordering', jsonb_build_object(
      'enabled', a.orders_enabled, 'delivery', a.delivery, 'pickup', a.pickup,
      'deliveryFee', a.delivery_fee, 'minOrder', a.min_order,
      'paymentMethods', to_jsonb(a.payment_methods), 'transferInstructions', a.web_transfer_instructions,
      'autoConfirm', a.auto_confirm,
      -- ADR 0055: the business sends order notices by WhatsApp (the page offers the opt-in).
      'whatsappNotices', exists (select 1 from dk_wa_accounts w where w.kitchen_id = a.id and w.status = 'connected' and w.notifications_enabled)
                         and dk_feature_enabled(a.id, 'whatsapp_notifications')),
    'theme', p_theme,
    'today', (now() at time zone a.timezone)::date,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.product_id, 'name', i.name, 'description', i.description, 'categoryId', i.category_id,
        'category', coalesce(i.category, 'Otros'), 'categoryOrder', i.category_order,
        'price', i.price, 'regularPrice', i.regular_price, 'imagePath', i.image_path, 'images', i.images,
        'availableFrom', to_char(i.start_time, 'HH24:MI'), 'availableUntil', to_char(i.end_time, 'HH24:MI'),
        'remaining', i.remaining, 'availability', i.availability,
        -- ADR 0059: the dish's options (only what the customer needs: no costs, no recipes).
        'groups', dk_product_composition_json(i.product_id, true)) order by i.category_order, i.display_order, i.name)
      from dk_public_menu_items(a.id) i), '[]'::jsonb));
end;
$function$;

CREATE OR REPLACE FUNCTION public.dk_insights_items(p_kitchen uuid, p_from date, p_to date, p_tz text, p_category uuid, p_product uuid)
 RETURNS TABLE(item_id uuid, order_id uuid, order_at timestamp with time zone, local_day date, product_id uuid, product_name text, category_id uuid, category_name text, quantity integer, line_total numeric, cost numeric, cost_source text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with items as (
    -- ADR 0059: the cost of what was chosen at ordering time, when known; else the dish's recipe cost.
    select oi.id, oi.order_id, o.created_at, dk_local_date(o.created_at, p_tz) as local_day, oi.product_id, p.name as product_name,
           p.category_id, c.name as category_name, oi.quantity, oi.line_total, coalesce(oi.estimated_unit_cost, p.estimated_cost) as estimated_cost
    from dk_order_items oi
    join dk_orders o on o.id = oi.order_id
    join dk_products p on p.id = oi.product_id
    left join dk_product_categories c on c.id = p.category_id
    where o.kitchen_id = p_kitchen
      and dk_is_sale_status(o.status)
      and o.created_at >= dk_local_start(p_from, p_tz)
      and o.created_at < dk_local_start(p_to + 1, p_tz)
      and (p_category is null or p.category_id = p_category)
      and (p_product is null or oi.product_id = p_product)
  ),
  consumed as (
    select m.reference_id as item_id, m.ingredient_id,
           sum(-m.quantity_base_unit) as qty,
           sum(-m.quantity_base_unit * coalesce(m.unit_cost, 0)) as cost
    from dk_inventory_movements m
    where m.kitchen_id = p_kitchen and m.reference_type = 'order_item' and m.movement_type = 'CONSUMO'
      and m.reference_id in (select id from items)
    group by 1, 2
  ),
  returned as (
    select m.reference_id as item_id, m.ingredient_id, sum(m.quantity_base_unit) as qty
    from dk_inventory_movements m
    where m.kitchen_id = p_kitchen and m.reference_type = 'order_item_revert' and m.movement_type = 'DEVOLUCION'
      and m.reference_id in (select id from items)
    group by 1, 2
  ),
  real_cost as (
    -- What stays consumed, at the cost it was consumed with.
    select c.item_id,
           sum(case when c.qty > 0 then c.cost * greatest(c.qty - coalesce(r.qty, 0), 0) / c.qty else 0 end) as cost,
           sum(greatest(c.qty - coalesce(r.qty, 0), 0)) as net_qty
    from consumed c left join returned r on r.item_id = c.item_id and r.ingredient_id = c.ingredient_id
    group by c.item_id
  )
  select i.id, i.order_id, i.created_at, i.local_day, i.product_id, i.product_name, i.category_id, i.category_name, i.quantity, i.line_total,
         case when rc.net_qty > 0 then round(rc.cost, 2)
              when coalesce(i.estimated_cost, 0) > 0 then round(i.quantity * i.estimated_cost, 2)
              else null end,
         case when rc.net_qty > 0 then 'real'
              when coalesce(i.estimated_cost, 0) > 0 then 'estimated'
              else 'none' end
  from items i left join real_cost rc on rc.item_id = i.id;
$function$;
