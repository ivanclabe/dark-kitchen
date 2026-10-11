-- ADR 0055: the same order sent twice (a repeated «sí» on WhatsApp, a double tap on the web)
-- answers with the order's real totals, as the first time. Only the «repeated» answers change.

create or replace function dk_place_order_internal(p_kitchen uuid, p_order jsonb, p_channel dk_order_channel)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  -- Lines: the same dish twice counts once; prices come from today's menu, never from the client.
  for v_line in
    select jsonb_build_object('productId', x ->> 'productId', 'quantity', sum((x ->> 'quantity')::integer),
                              'note', string_agg(nullif(btrim(x ->> 'note'), ''), ' · '))
    from jsonb_array_elements(p_order -> 'items') x
    group by x ->> 'productId'
  loop
    v_qty := (v_line ->> 'quantity')::integer;
    if v_qty is null or v_qty <= 0 or v_qty > 50 then raise exception 'Revisa las cantidades' using hint = 'invalid'; end if;
    select * into v_item from dk_public_menu_items(p_kitchen) i where i.product_id = (v_line ->> 'productId')::uuid;
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

  insert into dk_order_items (order_id, product_id, quantity, unit_price, observation)
  select v_order, (l ->> 'productId')::uuid, (l ->> 'quantity')::integer, (l ->> 'price')::numeric, nullif(l ->> 'note', '')
  from jsonb_array_elements(v_lines) l;

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
$$;
revoke all on function dk_place_order_internal(uuid, jsonb, dk_order_channel) from public, anon, authenticated;
