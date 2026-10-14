-- ADR 0059: the customer's tracking page shows what was chosen in each configurable dish.
CREATE OR REPLACE FUNCTION public.dk_public_order_status(p_token uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'found', true,
    'orderNumber', o.order_number, 'status', o.status, 'fulfillment', o.fulfillment,
    'createdAt', o.created_at, 'updatedAt', o.updated_at,
    'deliveryAddress', o.delivery_address, 'paymentMethod', o.payment_method,
    'subtotal', o.subtotal, 'deliveryFee', o.delivery_fee, 'total', o.total,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'quantity', i.quantity, 'unitPrice', i.unit_price,
                                                           'lineTotal', i.line_total, 'note', i.observation,
                                                           -- ADR 0059: what was chosen, «Sancocho · Res · Patacones ×2».
                                                           'options', (select string_agg(x.option_name || case when x.quantity > 1 then ' ×' || x.quantity else '' end, ' · ' order by x.sort_order)
                                                                       from dk_order_item_options x where x.order_item_id = i.id)) order by i.created_at), '[]')
              from dk_order_items i join dk_products p on p.id = i.product_id where i.order_id = o.id),
    'business', jsonb_build_object('name', k.name, 'slug', k.slug, 'iconKey', k.icon_key, 'whatsapp', s.whatsapp_phone,
                                   'transferInstructions', s.web_transfer_instructions, 'theme', s.web_theme))
  from dk_orders o
  join dk_kitchens k on k.id = o.kitchen_id
  left join dk_storefronts s on s.kitchen_id = k.id
  where o.public_token = p_token
$function$;
