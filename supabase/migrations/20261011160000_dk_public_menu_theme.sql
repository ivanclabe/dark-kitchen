-- ADR 0053 — Menú Público premium: plantillas, editor de apariencia y diseño por negocio.
--
-- The DESIGN (template + adjustments) lives next to the web options of the
-- storefront and is only presentation: prices, availability and dishes keep
-- coming from the planner and the catalog. The owner edits a DRAFT; the public
-- page only ever shows what was PUBLISHED. The server validates every design
-- against a closed list (no free CSS, no foreign URLs).

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table dk_storefronts
  add column web_theme jsonb,
  add column web_theme_draft jsonb,
  add column web_theme_previous jsonb,
  add column web_theme_published_at timestamptz;
comment on column dk_storefronts.web_theme is 'ADR 0053: the published design of the public menu (template + adjustments). Presentation only.';
comment on column dk_storefronts.web_theme_draft is 'ADR 0053: the design being edited; never shown publicly until published.';

-- ---------------------------------------------------------------------------
-- 2. Validation (closed list)
-- ---------------------------------------------------------------------------
-- Why a design is not valid, or null when it is. Images must be in the account's branding folder.
create or replace function dk_public_menu_theme_problem(p jsonb, p_kitchen uuid)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  k text;
  v text;
  v_fonts text[] := array['Inter', 'Poppins', 'Nunito', 'Montserrat', 'Lora', 'Playfair Display', 'Cormorant Garamond', 'DM Serif Display', 'Fraunces', 'Caveat'];
  v_image text := '^kitchens/' || p_kitchen::text || '/branding/[A-Za-z0-9._-]+$';
begin
  if p is null then return null; end if;
  if jsonb_typeof(p) <> 'object' then return 'El diseño no es válido'; end if;
  if length(p::text) > 4000 then return 'El diseño es demasiado grande'; end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('template', 'colors', 'fonts', 'background', 'header', 'cards', 'nav', 'buttons') then return 'Opción desconocida: ' || k; end if;
  end loop;
  if coalesce(p ->> 'template', 'modern') not in ('modern', 'elegant', 'artisan', 'dark', 'fresh', 'classic') then return 'Plantilla desconocida'; end if;

  if p ? 'colors' then
    if jsonb_typeof(p -> 'colors') <> 'object' then return 'Colores no válidos'; end if;
    for k, v in select key, value #>> '{}' from jsonb_each(p -> 'colors') loop
      if k not in ('primary', 'background', 'surface', 'text', 'muted', 'price') then return 'Color desconocido: ' || k; end if;
      if v is null or v !~ '^#[0-9A-Fa-f]{6}$' then return 'El color ' || k || ' no es un color válido'; end if;
    end loop;
  end if;

  if p ? 'fonts' then
    if jsonb_typeof(p -> 'fonts') <> 'object' then return 'Tipografía no válida'; end if;
    for k in select jsonb_object_keys(p -> 'fonts') loop
      if k not in ('heading', 'body', 'scale') then return 'Opción de tipografía desconocida: ' || k; end if;
    end loop;
    if (p #>> '{fonts,heading}') is not null and not ((p #>> '{fonts,heading}') = any (v_fonts)) then return 'Fuente de títulos no disponible'; end if;
    if (p #>> '{fonts,body}') is not null and not ((p #>> '{fonts,body}') = any (v_fonts)) then return 'Fuente de texto no disponible'; end if;
    if coalesce(p #>> '{fonts,scale}', 'M') not in ('S', 'M', 'L') then return 'Tamaño de letra no válido'; end if;
  end if;

  if p ? 'background' then
    if jsonb_typeof(p -> 'background') <> 'object' then return 'Fondo no válido'; end if;
    for k in select jsonb_object_keys(p -> 'background') loop
      if k not in ('kind', 'texture', 'image') then return 'Opción de fondo desconocida: ' || k; end if;
    end loop;
    if coalesce(p #>> '{background,kind}', 'solid') not in ('solid', 'gradient', 'texture', 'image') then return 'Tipo de fondo no válido'; end if;
    if coalesce(p #>> '{background,texture}', 'paper') not in ('paper', 'dots', 'lines') then return 'Textura no válida'; end if;
    if (p #>> '{background,image}') is not null and (p #>> '{background,image}') !~ v_image then return 'La imagen de fondo no es de esta cuenta'; end if;
  end if;

  if p ? 'header' then
    if jsonb_typeof(p -> 'header') <> 'object' then return 'Cabecera no válida'; end if;
    for k in select jsonb_object_keys(p -> 'header') loop
      if k not in ('style', 'cover', 'showTagline', 'showHours') then return 'Opción de cabecera desconocida: ' || k; end if;
    end loop;
    if coalesce(p #>> '{header,style}', 'compact') not in ('compact', 'centered', 'cover', 'logo') then return 'Estilo de cabecera no válido'; end if;
    if (p #>> '{header,cover}') is not null and (p #>> '{header,cover}') !~ v_image then return 'La portada no es de esta cuenta'; end if;
    if p #> '{header,showTagline}' is not null and jsonb_typeof(p #> '{header,showTagline}') <> 'boolean' then return 'Opción de cabecera no válida'; end if;
    if p #> '{header,showHours}' is not null and jsonb_typeof(p #> '{header,showHours}') <> 'boolean' then return 'Opción de cabecera no válida'; end if;
  end if;

  if p ? 'cards' then
    if jsonb_typeof(p -> 'cards') <> 'object' then return 'Tarjetas no válidas'; end if;
    for k in select jsonb_object_keys(p -> 'cards') loop
      if k not in ('layout', 'style', 'image', 'imageShape', 'imagePosition', 'description') then return 'Opción de platos desconocida: ' || k; end if;
    end loop;
    if coalesce(p #>> '{cards,layout}', 'list') not in ('list', 'grid', 'large', 'compact', 'carousel', 'menu') then return 'Forma de las tarjetas no válida'; end if;
    if coalesce(p #>> '{cards,style}', 'shadow') not in ('flat', 'shadow', 'outline', 'rough', 'glass') then return 'Estilo de tarjeta no válido'; end if;
    if coalesce(p #>> '{cards,image}', 'show') not in ('show', 'hide') then return 'Opción de imagen no válida'; end if;
    if coalesce(p #>> '{cards,imageShape}', 'rounded') not in ('square', 'rounded', 'circle') then return 'Forma de imagen no válida'; end if;
    if coalesce(p #>> '{cards,imagePosition}', 'left') not in ('left', 'right', 'top') then return 'Posición de imagen no válida'; end if;
    if coalesce(p #>> '{cards,description}', 'clamp') not in ('full', 'clamp', 'hide') then return 'Opción de descripción no válida'; end if;
  end if;

  if coalesce(p ->> 'nav', 'chips') not in ('chips', 'tabs', 'select', 'none') then return 'Navegación no válida'; end if;
  if coalesce(p ->> 'buttons', 'pill') not in ('rounded', 'pill', 'square') then return 'Forma de botones no válida'; end if;
  return null;
end;
$$;
grant execute on function dk_public_menu_theme_problem(jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Draft, publish, discard, revert (storefront.manage)
-- ---------------------------------------------------------------------------
create or replace function dk_public_menu_theme_save_draft(p_theme jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_problem text;
begin
  if v_kitchen is null then raise exception 'No hay una cuenta activa'; end if;
  if not dk_can('storefront.manage') then raise exception 'No autorizado para el menú público'; end if;
  v_problem := dk_public_menu_theme_problem(p_theme, v_kitchen);
  if v_problem is not null then raise exception '%', v_problem using hint = 'invalid_theme'; end if;
  insert into dk_storefronts (kitchen_id, updated_by) values (v_kitchen, dk_current_profile_id()) on conflict (kitchen_id) do nothing;
  update dk_storefronts set web_theme_draft = p_theme, updated_at = now(), updated_by = dk_current_profile_id() where kitchen_id = v_kitchen;
end;
$$;

create or replace function dk_public_menu_theme_publish()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  s dk_storefronts;
begin
  if v_kitchen is null then raise exception 'No hay una cuenta activa'; end if;
  if not dk_can('storefront.manage') then raise exception 'No autorizado para el menú público'; end if;
  select * into s from dk_storefronts where kitchen_id = v_kitchen for update;
  if not found or s.web_theme_draft is null then raise exception 'No hay un diseño para publicar'; end if;
  if s.web_theme is not distinct from s.web_theme_draft then return; end if;
  update dk_storefronts
  set web_theme_previous = web_theme, web_theme = web_theme_draft, web_theme_published_at = now(), updated_at = now(), updated_by = dk_current_profile_id()
  where kitchen_id = v_kitchen;
end;
$$;

-- The draft goes back to what is published.
create or replace function dk_public_menu_theme_discard()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if dk_current_kitchen_id() is null then raise exception 'No hay una cuenta activa'; end if;
  if not dk_can('storefront.manage') then raise exception 'No autorizado para el menú público'; end if;
  update dk_storefronts set web_theme_draft = web_theme, updated_at = now(), updated_by = dk_current_profile_id() where kitchen_id = dk_current_kitchen_id();
end;
$$;

-- The previous published design comes back (and the current one becomes «previous»).
create or replace function dk_public_menu_theme_revert()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  s dk_storefronts;
begin
  if v_kitchen is null then raise exception 'No hay una cuenta activa'; end if;
  if not dk_can('storefront.manage') then raise exception 'No autorizado para el menú público'; end if;
  select * into s from dk_storefronts where kitchen_id = v_kitchen for update;
  if not found or s.web_theme_previous is null then raise exception 'No hay un diseño anterior'; end if;
  update dk_storefronts
  set web_theme = s.web_theme_previous, web_theme_previous = s.web_theme, web_theme_draft = s.web_theme_previous,
      web_theme_published_at = now(), updated_at = now(), updated_by = dk_current_profile_id()
  where kitchen_id = v_kitchen;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. One builder of the public menu: the page (published design) and the staff preview (draft)
-- ---------------------------------------------------------------------------
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
      'autoConfirm', a.auto_confirm),
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

-- The public page: only a published menu, with its PUBLISHED design.
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
  return dk_public_menu_build(a.kitchen_id, (a.sf).web_theme);
end;
$$;

-- The staff preview: today's menu even when not published, with the DRAFT design.
create or replace function dk_public_menu_preview()
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
  return dk_public_menu_build(v_kitchen, (select coalesce(web_theme_draft, web_theme) from dk_storefronts where kitchen_id = v_kitchen));
end;
$$;

-- The staff settings now also say how the design stands.
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
      'hasHours', exists (select 1 from dk_kitchen_hours h where h.kitchen_id = k.id),
      'theme', s.web_theme, 'themeDraft', coalesce(s.web_theme_draft, s.web_theme),
      'themePublishedAt', s.web_theme_published_at, 'hasPreviousTheme', s.web_theme_previous is not null)
    from dk_kitchens k left join dk_storefronts s on s.kitchen_id = k.id
    where k.id = v_kitchen);
end;
$$;

-- Tracking wears the business's published design too.
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
                                   'transferInstructions', s.web_transfer_instructions, 'theme', s.web_theme))
  from dk_orders o
  join dk_kitchens k on k.id = o.kitchen_id
  left join dk_storefronts s on s.kitchen_id = k.id
  where o.public_token = p_token and o.channel = 'WEB'
$$;

revoke all on function dk_public_menu_theme_save_draft(jsonb), dk_public_menu_theme_publish(), dk_public_menu_theme_discard(),
  dk_public_menu_theme_revert(), dk_public_menu_preview() from public, anon;
grant execute on function dk_public_menu_theme_save_draft(jsonb), dk_public_menu_theme_publish(), dk_public_menu_theme_discard(),
  dk_public_menu_theme_revert(), dk_public_menu_preview() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Brand images: kitchens/{account}/branding/ in the public dish-photo bucket (storefront.manage)
-- ---------------------------------------------------------------------------
create policy dk_branding_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'dk-product-images'
         and (storage.foldername(name))[1] = 'kitchens'
         and (storage.foldername(name))[2] = (select dk_current_kitchen_id())::text
         and (storage.foldername(name))[3] = 'branding');
create policy dk_branding_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'dk-product-images'
              and (storage.foldername(name))[1] = 'kitchens'
              and (storage.foldername(name))[2] = (select dk_current_kitchen_id())::text
              and (storage.foldername(name))[3] = 'branding'
              and (select dk_can('storefront.manage')));
create policy dk_branding_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'dk-product-images'
         and (storage.foldername(name))[1] = 'kitchens'
         and (storage.foldername(name))[2] = (select dk_current_kitchen_id())::text
         and (storage.foldername(name))[3] = 'branding'
         and (select dk_can('storefront.manage')));
