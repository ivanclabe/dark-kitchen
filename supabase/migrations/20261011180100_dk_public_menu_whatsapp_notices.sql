-- ADR 0055: the public menu tells the page whether the business sends order
-- notices by WhatsApp, so the checkout offers the customer's opt-in only then.
-- Same builder as ADR 0053, one more field in «ordering».

create or replace function dk_public_menu_build(p_kitchen uuid, p_theme jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
        'remaining', i.remaining, 'availability', i.availability) order by i.category_order, i.display_order, i.name)
      from dk_public_menu_items(a.id) i), '[]'::jsonb));
end;
$$;
revoke all on function dk_public_menu_build(uuid, jsonb) from public, anon, authenticated;
