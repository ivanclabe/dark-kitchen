-- ADR 0047: Quanela Consumer inherits the account's identity.
--
--   * The name and the public address customers see are the account's own
--     «Nombre» and «Identificador (URL)» (dk_kitchens.name / slug — the slug is
--     unique across the platform and has the same format).
--   * «Tipo de cocina» is the account's (dk_kitchens.cuisine, Configuración →
--     General); empty = the organization's category, same list of values.
--   * dk_storefronts keeps only what is Consumer's own (tagline, location,
--     WhatsApp, sharing, publication). Its copies of name, address and cuisine
--     are dropped (approved), after copying the cuisine to the account and
--     checking that no copy differs from the account — otherwise this stops.
--   * The public read keeps the same keys (name, slug, cuisine): the
--     customers' app does not change.

alter table dk_kitchens
  add column cuisine text check (cuisine is null or cuisine in ('burgers', 'pizza', 'chicken', 'asian', 'mexican', 'traditional', 'grill', 'healthy',
                                                                 'vegetarian', 'seafood', 'desserts', 'coffee', 'breakfast', 'international', 'other'));
comment on column dk_kitchens.cuisine is 'ADR 0047: the account''s cuisine (Quanela Consumer, Configuración → General); null = dk_organizations.category.';

-- Nothing is lost: a storefront whose name or address differs from its account stops the migration.
do $$
declare
  v_diff int;
begin
  select count(*) into v_diff from dk_storefronts s join dk_kitchens k on k.id = s.kitchen_id
  where s.display_name is distinct from k.name or s.public_slug is distinct from k.slug;
  if v_diff > 0 then
    raise exception 'ADR 0047: % storefront(s) with a name or address different from the account: review them before dropping the copies', v_diff;
  end if;
end;
$$;

-- The cuisine chosen in Consumer moves to its account (when it is not just the organization's).
update dk_kitchens k set cuisine = s.cuisine
from dk_storefronts s, dk_organizations o
where s.kitchen_id = k.id and o.id = k.organization_id and s.cuisine is not null and s.cuisine is distinct from o.category;

alter table dk_storefronts drop column display_name, drop column public_slug, drop column cuisine;

-- Public read (same as ADR 0042, identity from the account).
create or replace function dk_public_search_dishes(p_params jsonb default '{}')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_params jsonb := coalesce(p_params, '{}');
  v_terms text[];
  v_ids uuid[];
  v_tags text[];
  v_slug text := nullif(btrim(v_params ->> 'storefront'), '');
  v_max_price numeric;
  v_lat double precision;
  v_lng double precision;
  v_limit int := least(greatest(coalesce((v_params ->> 'limit')::int, 120), 1), 200);
  v_items jsonb;
begin
  if jsonb_typeof(v_params) <> 'object' then raise exception 'Parámetros inválidos'; end if;
  select coalesce(array_agg(dk_fold(t)) filter (where length(btrim(t)) >= 2), '{}')
    into v_terms from jsonb_array_elements_text(coalesce(v_params -> 'terms', '[]')) t;
  v_terms := v_terms[1:20];
  select coalesce(array_agg(t::uuid), '{}') into v_ids
    from jsonb_array_elements_text(coalesce(v_params -> 'ids', '[]')) t
    where t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_ids := v_ids[1:50];
  select coalesce(array_agg(t), '{}') into v_tags from jsonb_array_elements_text(coalesce(v_params -> 'tags', '[]')) t;
  if v_params ? 'max_price' and jsonb_typeof(v_params -> 'max_price') = 'number' then v_max_price := (v_params ->> 'max_price')::numeric; end if;
  if jsonb_typeof(v_params -> 'lat') = 'number' and jsonb_typeof(v_params -> 'lng') = 'number' then
    v_lat := (v_params ->> 'lat')::double precision;
    v_lng := (v_params ->> 'lng')::double precision;
    if abs(v_lat) > 90 or abs(v_lng) > 180 then v_lat := null; v_lng := null; end if;
  end if;

  with stores as (
    -- ADR 0047: the name, the public address and the cuisine are the account's (the cuisine falls back to the organization's).
    select s.*, k.slug as public_slug, k.name as display_name, coalesce(k.cuisine, o.category) as cuisine,
           k.timezone, (now() at time zone coalesce(k.timezone, 'America/Bogota')) as local_now,
           dk_storefront_open_state(k.id) as open_state,
           case when s.share_metrics then dk_storefront_metrics(k.id) end as metrics
    from dk_storefronts s
    join dk_kitchens k on k.id = s.kitchen_id and k.active
    join dk_organizations o on o.id = k.organization_id and o.active
    where s.published and (v_slug is null or k.slug = v_slug)
  ),
  dishes as (
    select st.kitchen_id, st.local_now, p.id, p.name, p.description, p.price, p.image_path, c.name as category,
           sp.dietary_tags, sp.show_ingredients,
           case when sp.show_ingredients then (
             select coalesce(jsonb_agg(distinct i.name), '[]') from dk_recipe_items ri join dk_ingredients i on i.id = ri.ingredient_id
             where ri.recipe_id = p.active_recipe_id
           ) end as ingredients
    from stores st
    join dk_storefront_products sp on sp.kitchen_id = st.kitchen_id and sp.published
    join dk_products p on p.id = sp.product_id and p.kitchen_id = st.kitchen_id and p.active
    left join dk_product_categories c on c.id = p.category_id
    where (cardinality(v_ids) = 0 or p.id = any(v_ids))
      and sp.dietary_tags @> v_tags
  ),
  matched as (
    select d.* from dishes d
    where cardinality(v_terms) = 0 or exists (
      select 1 from unnest(v_terms) t
      where position(t in dk_fold(concat_ws(' ', d.name, d.category, d.description, array_to_string(d.dietary_tags, ' '),
                                             (select st.cuisine from stores st where st.kitchen_id = d.kitchen_id),
                                             d.ingredients::text))) > 0
    )
  ),
  priced as (
    select m.*, plan.is_active as plan_active, plan.start_time, plan.end_time, plan.unit_limit, plan.special_price,
           exists (select 1 from dk_menu_plan_items x where x.kitchen_id = m.kitchen_id and x.plan_date = m.local_now::date) as has_plan_today,
           coalesce(plan.special_price, m.price) as final_price,
           case when plan.unit_limit is not null then (
             select coalesce(sum(oi.quantity), 0) from dk_order_items oi join dk_orders o on o.id = oi.order_id
             join dk_kitchens k on k.id = o.kitchen_id
             where o.kitchen_id = m.kitchen_id and oi.product_id = m.id and o.status <> 'CANCELADO'
               and (o.created_at at time zone coalesce(k.timezone, 'America/Bogota'))::date = m.local_now::date
           ) end as sold_today
    from matched m
    left join dk_menu_plan_items plan on plan.kitchen_id = m.kitchen_id and plan.product_id = m.id and plan.plan_date = m.local_now::date
  ),
  rated as (
    select pr.*, st.open_state, st.metrics, st.public_slug, st.display_name, st.tagline, st.cuisine, st.whatsapp_phone, st.timezone,
           case
             when pr.has_plan_today and pr.plan_active is null then 'not_today'
             when pr.has_plan_today and not pr.plan_active then 'sold_out'
             when pr.unit_limit is not null and pr.sold_today >= pr.unit_limit then 'sold_out'
             when st.open_state ->> 'state' = 'closed' then 'closed'
             when pr.end_time is not null and pr.local_now::time > pr.end_time then 'ended'
             when pr.start_time is not null and pr.local_now::time < pr.start_time then 'later'
             when pr.has_plan_today then 'available'
             else 'unknown'
           end as availability,
           case when v_lat is not null and st.latitude is not null then
             round((6371 * 2 * asin(sqrt(
               power(sin(radians(st.latitude::double precision - v_lat) / 2), 2)
               + cos(radians(v_lat)) * cos(radians(st.latitude::double precision))
                 * power(sin(radians(st.longitude::double precision - v_lng) / 2), 2))))::numeric, 2)
           end as distance_km
    from priced pr join stores st on st.kitchen_id = pr.kitchen_id
    where v_max_price is null or pr.final_price <= v_max_price
  ),
  popular as (
    select oi.product_id, sum(oi.quantity) as units
    from dk_order_items oi join dk_orders o on o.id = oi.order_id
    where o.kitchen_id in (select kitchen_id from stores where share_metrics)
      and oi.product_id in (select id from rated)
      and o.status <> 'CANCELADO' and o.created_at >= now() - interval '30 days'
    group by oi.product_id
  )
  select coalesce(jsonb_agg(item order by sort_key, item ->> 'name'), '[]') into v_items
  from (
    select jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'description', r.description,
      'category', r.category,
      'price', r.final_price,
      'regular_price', case when r.special_price is not null and r.special_price < r.price then r.price end,
      'currency', 'COP',
      'image_path', r.image_path,
      'images', (select coalesce(jsonb_agg(pi.path order by pi.position), '[]') from dk_product_images pi where pi.product_id = r.id),
      'dietary_tags', to_jsonb(r.dietary_tags),
      'ingredients', r.ingredients,
      'availability', r.availability,
      'available_from', case when r.availability = 'later' then to_char(r.start_time, 'HH24:MI') end,
      'available_until', case when r.availability = 'available' and r.end_time is not null then to_char(r.end_time, 'HH24:MI') end,
      'units_sold_30d', case when r.metrics is not null then coalesce((select units from popular where product_id = r.id), 0) end,
      'rating', null,
      'review_count', null,
      'storefront', jsonb_build_object(
        'slug', r.public_slug,
        'name', r.display_name,
        'tagline', r.tagline,
        'cuisine', r.cuisine,
        'open_state', r.open_state,
        'timezone', coalesce(r.timezone, 'America/Bogota'),
        'distance_km', r.distance_km,
        'whatsapp_phone', r.whatsapp_phone,
        'metrics', r.metrics
      )
    ) as item,
    case r.availability when 'available' then 0 when 'unknown' then 1 when 'later' then 2 else 3 end as sort_key
    from rated r
    order by sort_key, r.name
    limit v_limit
  ) x;

  return jsonb_build_object('generated_at', now(), 'items', v_items);
end;
$$;

-- The publication of the active account (staff).
create or replace function dk_storefront_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  if not dk_can('storefront.manage') then raise exception 'No autorizado para publicar en Quanela Consumer' using errcode = '42501'; end if;
  return jsonb_build_object(
    -- ADR 0047: name, public address and cuisine come from the account (same keys as before).
    'storefront', (select jsonb_build_object(
        'published', s.published, 'public_slug', k.slug, 'display_name', k.name, 'tagline', s.tagline,
        'cuisine', coalesce(k.cuisine, o.category), 'latitude', s.latitude, 'longitude', s.longitude, 'whatsapp_phone', s.whatsapp_phone,
        'share_metrics', s.share_metrics, 'published_at', s.published_at)
      from dk_storefronts s join dk_kitchens k on k.id = s.kitchen_id join dk_organizations o on o.id = k.organization_id
      where s.kitchen_id = v_kitchen),
    'defaults', (select jsonb_build_object('display_name', k.name, 'public_slug', k.slug, 'cuisine', coalesce(k.cuisine, o.category))
      from dk_kitchens k join dk_organizations o on o.id = k.organization_id where k.id = v_kitchen),
    'account', (select jsonb_build_object('name', k.name, 'slug', k.slug, 'cuisine', k.cuisine, 'organization_cuisine', o.category)
      from dk_kitchens k join dk_organizations o on o.id = k.organization_id where k.id = v_kitchen),
    'open_state', dk_storefront_open_state(v_kitchen),
    'metrics', dk_storefront_metrics(v_kitchen),
    'products', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'category', c.name, 'price', p.price, 'image_path', p.image_path,
        'has_description', coalesce(length(btrim(p.description)), 0) > 0,
        'has_recipe', p.active_recipe_id is not null,
        'published', coalesce(sp.published, false),
        'dietary_tags', coalesce(to_jsonb(sp.dietary_tags), '[]'),
        'show_ingredients', coalesce(sp.show_ingredients, false)
      ) order by c.name nulls last, p.name), '[]')
      from dk_products p
      left join dk_product_categories c on c.id = p.category_id
      left join dk_storefront_products sp on sp.kitchen_id = v_kitchen and sp.product_id = p.id
      where p.kitchen_id = v_kitchen and p.active)
  );
end;
$$;

/** Create or update the publication of the active account (no name, address or cuisine: they are the account's). */
create or replace function dk_storefront_save(p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_published boolean := coalesce((p_data ->> 'published')::boolean, false);
  v_lat numeric := nullif(p_data ->> 'latitude', '')::numeric;
  v_lng numeric := nullif(p_data ->> 'longitude', '')::numeric;
  v_phone text := nullif(btrim(coalesce(p_data ->> 'whatsapp_phone', '')), '');
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  if not dk_can('storefront.manage') then raise exception 'No autorizado para publicar en Quanela Consumer' using errcode = '42501'; end if;
  if v_phone is not null then v_phone := dk_normalize_phone(v_phone); end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'El WhatsApp debe ser un teléfono válido'; end if;

  insert into dk_storefronts (kitchen_id, published, tagline, latitude, longitude, whatsapp_phone, share_metrics, published_at)
  values (v_kitchen, v_published, nullif(btrim(coalesce(p_data ->> 'tagline', '')), ''),
          v_lat, v_lng, v_phone, coalesce((p_data ->> 'share_metrics')::boolean, false), case when v_published then now() end)
  on conflict (kitchen_id) do update set
    published = excluded.published,
    tagline = excluded.tagline,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    whatsapp_phone = excluded.whatsapp_phone,
    share_metrics = excluded.share_metrics,
    published_at = case when excluded.published and not dk_storefronts.published then now()
                        when excluded.published then dk_storefronts.published_at end,
    updated_at = now(),
    updated_by = dk_current_profile_id();
end;
$$;

notify pgrst, 'reload schema';
