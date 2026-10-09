-- ADR 0042: Quanela Consumer. Additive only: nothing of products, menus, orders,
-- customers or RLS of the operating app changes.
--   * dk_storefronts / dk_storefront_products: what an account DECIDES to publish
--     (opt-in, default off). Nothing is copied: prices, availability, photos and
--     hours are read live from the private tables.
--   * dk_public_search_dishes(jsonb): the only public read. SECURITY DEFINER with a
--     whitelisted jsonb (never a whole row: dk_products carries estimated_cost).
--     Operational metrics only when the account shares them, aggregated, with a
--     minimum sample. Rating/reviews do not exist: never returned.
--   * dk_consumers / dk_consumer_preferences: the end customer (auth.uid(), usually
--     an anonymous Supabase session). Preferences only with consent. No account
--     can read them.
--   * dk_consumer_ai_allow(): per-consumer limit for the assistant's model calls.
-- Staff writes go through dk_storefront_* with the new permission storefront.manage.

-- 1. Permission ----------------------------------------------------------------
insert into dk_permissions (key, module, action, scope, label, description, sort_order) values
  ('storefront.manage', 'storefront', 'manage', 'account', 'Publicar en Quanela Consumer',
   'Elegir qué platos y datos de la cuenta ven los clientes en Quanela Consumer', 165)
on conflict (key) do nothing;

insert into dk_role_permissions (role_id, permission_key)
select r.id, 'storefront.manage' from dk_roles r where r.is_system and r.key in ('ADMIN', 'MANAGER')
on conflict do nothing;

-- 2. Helpers -------------------------------------------------------------------
/** Lower case without accents: the same folding the assistant applies to the query. */
create or replace function dk_fold(p_text text)
returns text
language sql
immutable
set search_path = public
as $$ select lower(translate(coalesce(p_text, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) $$;

-- 3. Published layer -------------------------------------------------------------
create table dk_storefronts (
  kitchen_id uuid primary key references dk_kitchens(id) on delete cascade,
  published boolean not null default false,
  public_slug text not null unique check (public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(public_slug) between 3 and 60),
  display_name text not null check (length(btrim(display_name)) between 2 and 80),
  tagline text check (tagline is null or length(tagline) <= 140),
  cuisine text check (cuisine is null or cuisine in ('burgers', 'pizza', 'chicken', 'asian', 'mexican', 'traditional', 'grill', 'healthy',
                                                       'vegetarian', 'seafood', 'desserts', 'coffee', 'breakfast', 'international', 'other')),
  latitude numeric(9, 6) check (latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude between -180 and 180),
  whatsapp_phone text check (whatsapp_phone is null or whatsapp_phone ~ '^\+[1-9][0-9]{7,14}$'),
  share_metrics boolean not null default false,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references dk_users(id) default dk_current_profile_id(),
  check ((latitude is null) = (longitude is null))
);
comment on table dk_storefronts is 'ADR 0042: what an account publishes in Quanela Consumer. Opt-in; the private tables stay the source of truth.';
comment on column dk_storefronts.share_metrics is 'Share aggregated prep/response/delivery times, completion and popularity (never amounts).';

create table dk_storefront_products (
  kitchen_id uuid not null references dk_storefronts(kitchen_id) on delete cascade,
  product_id uuid not null references dk_products(id) on delete cascade,
  published boolean not null default false,
  dietary_tags text[] not null default '{}'
    check (dietary_tags <@ array['vegetarian', 'vegan', 'gluten_free', 'spicy', 'healthy']::text[]),
  show_ingredients boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references dk_users(id) default dk_current_profile_id(),
  primary key (kitchen_id, product_id)
);
comment on table dk_storefront_products is 'ADR 0042: dishes published in Quanela Consumer. Dietary tags are declared by the account, never inferred.';
create index dk_storefront_products_published_idx on dk_storefront_products (kitchen_id) where published;

-- The product must belong to the storefront's account (no composite FK on dk_products).
create or replace function dk_storefront_products_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from dk_products where id = new.product_id and kitchen_id = new.kitchen_id) then
    raise exception 'El plato no es de esta cuenta';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger dk_trg_storefront_products_guard before insert or update on dk_storefront_products
  for each row execute function dk_storefront_products_guard();

create trigger dk_trg_audit_storefronts after insert or update or delete on dk_storefronts for each row execute function dk_audit_row();
create trigger dk_trg_audit_storefront_products after insert or update or delete on dk_storefront_products for each row execute function dk_audit_row();

alter table dk_storefronts enable row level security;
alter table dk_storefront_products enable row level security;
-- Staff read their own account's publication; writes only through the RPCs below.
create policy dk_storefronts_select on dk_storefronts for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('storefront.manage')));
create policy dk_storefront_products_select on dk_storefront_products for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('storefront.manage')));
revoke all on dk_storefronts, dk_storefront_products from anon;
revoke insert, update, delete, truncate on dk_storefronts, dk_storefront_products from authenticated;
grant select on dk_storefronts, dk_storefront_products to authenticated;

-- 4. Live signals (private helpers) ------------------------------------------------
/**
 * Open state of an account at p_at, like kitchenStatus() in
 * src/modules/kitchen/lib/schedule.ts: the exception of a date wins over the
 * weekly template; a shift may cross midnight; without hours nothing is claimed.
 */
create or replace function dk_storefront_open_state(p_kitchen_id uuid, p_at timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text;
  v_local timestamp;
  v_day date;
  v_open boolean;
  v_opens time;
  v_closes time;
  v_start timestamp;
  v_end timestamp;
  v_days dk_day_of_week[] := array['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO']::dk_day_of_week[];
begin
  select coalesce(timezone, 'America/Bogota') into v_tz from dk_kitchens where id = p_kitchen_id;
  if v_tz is null then return null; end if;
  if not exists (select 1 from dk_kitchen_hours where kitchen_id = p_kitchen_id)
     and not exists (select 1 from dk_kitchen_hour_exceptions where kitchen_id = p_kitchen_id) then
    return jsonb_build_object('state', 'unconfigured');
  end if;

  v_local := p_at at time zone v_tz;
  for i in -1..7 loop
    v_day := v_local::date + i;
    select e.is_open, e.opens_at, e.closes_at into v_open, v_opens, v_closes
    from dk_kitchen_hour_exceptions e where e.kitchen_id = p_kitchen_id and e.exception_date = v_day;
    if not found then
      select h.is_open, h.opens_at, h.closes_at into v_open, v_opens, v_closes
      from dk_kitchen_hours h where h.kitchen_id = p_kitchen_id and h.day_of_week = v_days[extract(isodow from v_day)::int];
      if not found then v_open := false; end if;
    end if;
    continue when not coalesce(v_open, false) or v_opens is null or v_closes is null;
    v_start := v_day + v_opens;
    v_end := (case when v_closes <= v_opens then v_day + 1 else v_day end) + v_closes;
    if v_start <= v_local and v_local < v_end then
      return jsonb_build_object('state', 'open', 'closes_at', v_end at time zone v_tz);
    end if;
    if v_start > v_local then
      return jsonb_build_object('state', 'closed', 'opens_at', v_start at time zone v_tz);
    end if;
  end loop;
  return jsonb_build_object('state', 'closed');
end;
$$;

/**
 * Aggregated operational metrics of the last 30 days (medians in minutes). A
 * metric with fewer than 10 orders behind it is null (unknown), never a guess.
 * Amounts are never part of it.
 */
create or replace function dk_storefront_metrics(p_kitchen_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with recent as (
    select o.id, o.status, o.created_at
    from dk_orders o
    where o.kitchen_id = p_kitchen_id and o.created_at >= now() - interval '30 days'
  ),
  steps as (
    select r.id, r.created_at,
           min(h.changed_at) filter (where h.to_status = 'CONFIRMADO') as confirmed_at,
           min(h.changed_at) filter (where h.to_status = 'LISTO') as ready_at
    from recent r join dk_order_status_history h on h.order_id = r.id
    group by r.id, r.created_at
  ),
  prep as (
    select count(*) as n, percentile_cont(0.5) within group (order by extract(epoch from ready_at - confirmed_at) / 60) as med
    from steps where confirmed_at is not null and ready_at > confirmed_at
  ),
  response as (
    select count(*) as n, percentile_cont(0.5) within group (order by extract(epoch from confirmed_at - created_at) / 60) as med
    from steps where confirmed_at >= created_at
  ),
  delivery as (
    select count(*) as n, percentile_cont(0.5) within group (order by extract(epoch from d.delivered_at - d.dispatched_at) / 60) as med
    from dk_deliveries d join recent r on r.id = d.order_id
    where d.delivered_at > d.dispatched_at
  ),
  closed as (
    select count(*) as n, count(*) filter (where status = 'CANCELADO') as cancelled
    from recent where created_at < now() - interval '2 hours' and status <> 'NUEVO'
  )
  select jsonb_build_object(
    'prep_minutes', (select case when n >= 10 then round(med::numeric) end from prep),
    'prep_sample', (select n from prep),
    'response_minutes', (select case when n >= 10 then round(med::numeric) end from response),
    'response_sample', (select n from response),
    'delivery_minutes', (select case when n >= 10 then round(med::numeric) end from delivery),
    'delivery_sample', (select n from delivery),
    'completion_rate', (select case when n >= 10 then round(1 - cancelled::numeric / n, 3) end from closed),
    'completion_sample', (select n from closed),
    'active_orders', (select count(*) from dk_orders where kitchen_id = p_kitchen_id and status in ('CONFIRMADO', 'EN_PREPARACION'))
  )
$$;

revoke all on function dk_storefront_open_state(uuid, timestamptz), dk_storefront_metrics(uuid), dk_storefront_products_guard() from public, anon, authenticated;
revoke all on function dk_fold(text) from public, anon;
grant execute on function dk_fold(text) to authenticated;

-- 5. Public read -------------------------------------------------------------------
/**
 * Candidate dishes for Quanela Consumer. p_params (all optional):
 *   terms text[]      folded words; a dish matches if ANY appears in its name,
 *                     category, description, cuisine, tags or PUBLISHED ingredients
 *   ids uuid[]        exact dishes (detail, follow-ups)
 *   storefront text   public_slug
 *   max_price number, tags text[] (all required)
 *   lat, lng          the consumer's position, only to compute a distance
 *   limit int         default 120, max 200
 * Only published dishes of published, active accounts of active organizations.
 * Every field is listed on purpose: costs, recipes, quantities, customers,
 * amounts and internal ids never leave.
 */
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
    select s.*, k.timezone, (now() at time zone coalesce(k.timezone, 'America/Bogota')) as local_now,
           dk_storefront_open_state(k.id) as open_state,
           case when s.share_metrics then dk_storefront_metrics(k.id) end as metrics
    from dk_storefronts s
    join dk_kitchens k on k.id = s.kitchen_id and k.active
    join dk_organizations o on o.id = k.organization_id and o.active
    where s.published and (v_slug is null or s.public_slug = v_slug)
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

revoke all on function dk_public_search_dishes(jsonb) from public;
grant execute on function dk_public_search_dishes(jsonb) to anon, authenticated;

-- 6. Staff: manage the publication --------------------------------------------------
/** The publication of the active account, with every active dish and its state. */
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
    'storefront', (select jsonb_build_object(
        'published', s.published, 'public_slug', s.public_slug, 'display_name', s.display_name, 'tagline', s.tagline,
        'cuisine', s.cuisine, 'latitude', s.latitude, 'longitude', s.longitude, 'whatsapp_phone', s.whatsapp_phone,
        'share_metrics', s.share_metrics, 'published_at', s.published_at)
      from dk_storefronts s where s.kitchen_id = v_kitchen),
    'defaults', (select jsonb_build_object('display_name', k.name, 'public_slug', k.slug, 'cuisine', o.category)
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

/** Create or update the publication of the active account. */
create or replace function dk_storefront_save(p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_slug text := lower(btrim(coalesce(p_data ->> 'public_slug', '')));
  v_name text := btrim(coalesce(p_data ->> 'display_name', ''));
  v_published boolean := coalesce((p_data ->> 'published')::boolean, false);
  v_lat numeric := nullif(p_data ->> 'latitude', '')::numeric;
  v_lng numeric := nullif(p_data ->> 'longitude', '')::numeric;
  v_phone text := nullif(btrim(coalesce(p_data ->> 'whatsapp_phone', '')), '');
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  if not dk_can('storefront.manage') then raise exception 'No autorizado para publicar en Quanela Consumer' using errcode = '42501'; end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) not between 3 and 60 then
    raise exception 'La dirección pública usa de 3 a 60 letras minúsculas, números y guiones';
  end if;
  if exists (select 1 from dk_storefronts where public_slug = v_slug and kitchen_id <> v_kitchen) then
    raise exception 'Esa dirección pública ya la usa otro negocio';
  end if;
  if length(v_name) not between 2 and 80 then raise exception 'Escribe el nombre que verán los clientes'; end if;
  if v_phone is not null then v_phone := dk_normalize_phone(v_phone); end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'El WhatsApp debe ser un teléfono válido'; end if;

  insert into dk_storefronts (kitchen_id, published, public_slug, display_name, tagline, cuisine, latitude, longitude, whatsapp_phone,
                              share_metrics, published_at)
  values (v_kitchen, v_published, v_slug, v_name, nullif(btrim(coalesce(p_data ->> 'tagline', '')), ''), nullif(p_data ->> 'cuisine', ''),
          v_lat, v_lng, v_phone, coalesce((p_data ->> 'share_metrics')::boolean, false), case when v_published then now() end)
  on conflict (kitchen_id) do update set
    published = excluded.published,
    public_slug = excluded.public_slug,
    display_name = excluded.display_name,
    tagline = excluded.tagline,
    cuisine = excluded.cuisine,
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

/** Publish/unpublish dishes: [{product_id, published, dietary_tags, show_ingredients}]. */
create or replace function dk_storefront_products_save(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_item jsonb;
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  if not dk_can('storefront.manage') then raise exception 'No autorizado para publicar en Quanela Consumer' using errcode = '42501'; end if;
  if not exists (select 1 from dk_storefronts where kitchen_id = v_kitchen) then
    raise exception 'Primero guarda los datos del negocio';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then raise exception 'Lista de platos inválida'; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into dk_storefront_products (kitchen_id, product_id, published, dietary_tags, show_ingredients)
    values (v_kitchen, (v_item ->> 'product_id')::uuid, coalesce((v_item ->> 'published')::boolean, false),
            coalesce((select array_agg(distinct t) from jsonb_array_elements_text(coalesce(v_item -> 'dietary_tags', '[]')) t), '{}'),
            coalesce((v_item ->> 'show_ingredients')::boolean, false))
    on conflict (kitchen_id, product_id) do update set
      published = excluded.published,
      dietary_tags = excluded.dietary_tags,
      show_ingredients = excluded.show_ingredients,
      updated_by = dk_current_profile_id();
  end loop;
end;
$$;

revoke all on function dk_storefront_get(), dk_storefront_save(jsonb), dk_storefront_products_save(jsonb) from public, anon;
grant execute on function dk_storefront_get(), dk_storefront_save(jsonb), dk_storefront_products_save(jsonb) to authenticated;

-- 7. The consumer --------------------------------------------------------------------
create table dk_consumers (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or length(btrim(display_name)) between 1 and 80),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  profile_consent boolean not null default false,
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table dk_consumers is 'ADR 0042: the end customer of Quanela Consumer (auth.uid()). Not a business customer: no account reads it.';

create table dk_consumer_preferences (
  id uuid primary key default gen_random_uuid(),
  consumer_id uuid not null references dk_consumers(id) on delete cascade,
  kind text not null check (kind in ('avoid_ingredient', 'like_ingredient', 'dietary', 'favorite_storefront', 'favorite_product',
                                     'max_price', 'max_minutes')),
  value text not null check (length(btrim(value)) between 1 and 80),
  created_at timestamptz not null default now()
);
create unique index dk_consumer_preferences_uq on dk_consumer_preferences (consumer_id, kind, dk_fold(value));

create table dk_consumer_ai_runs (
  id bigint generated always as identity primary key,
  consumer_id uuid not null,
  created_at timestamptz not null default now()
);
create index dk_consumer_ai_runs_idx on dk_consumer_ai_runs (consumer_id, created_at desc);

alter table dk_consumers enable row level security;
alter table dk_consumer_preferences enable row level security;
alter table dk_consumer_ai_runs enable row level security;
-- Everything goes through the RPCs below: no direct table access for anyone.
revoke all on dk_consumers, dk_consumer_preferences, dk_consumer_ai_runs from anon, authenticated;

/** The caller's profile. Without consent only the consent state is returned. */
create or replace function dk_consumer_profile_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row dk_consumers;
begin
  if v_uid is null then raise exception 'Inicia sesión' using errcode = '42501'; end if;
  select * into v_row from dk_consumers where id = v_uid;
  if not found or not v_row.profile_consent then
    return jsonb_build_object('profile_consent', false, 'preferences', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'profile_consent', true,
    'display_name', v_row.display_name,
    'phone', v_row.phone,
    'email', v_row.email,
    'preferences', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'value', value) order by created_at), '[]')
                    from dk_consumer_preferences where consumer_id = v_uid)
  );
end;
$$;

/**
 * Save the caller's profile. p_data: {profile_consent, display_name, phone, email,
 * preferences: [{kind, value}]}. Without consent everything personal is deleted.
 */
create or replace function dk_consumer_profile_save(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_consent boolean := coalesce((p_data ->> 'profile_consent')::boolean, false);
  v_phone text := nullif(btrim(coalesce(p_data ->> 'phone', '')), '');
  v_pref jsonb;
begin
  if v_uid is null then raise exception 'Inicia sesión' using errcode = '42501'; end if;
  if not v_consent then
    delete from dk_consumers where id = v_uid;  -- preferences cascade
    return dk_consumer_profile_get();
  end if;
  if v_phone is not null then v_phone := dk_normalize_phone(v_phone); end if;
  if jsonb_array_length(coalesce(p_data -> 'preferences', '[]')) > 60 then raise exception 'Demasiadas preferencias'; end if;

  insert into dk_consumers (id, display_name, phone, email, profile_consent, consent_at)
  values (v_uid, nullif(btrim(coalesce(p_data ->> 'display_name', '')), ''), v_phone,
          nullif(lower(btrim(coalesce(p_data ->> 'email', ''))), ''), true, now())
  on conflict (id) do update set
    display_name = excluded.display_name, phone = excluded.phone, email = excluded.email,
    profile_consent = true, consent_at = coalesce(dk_consumers.consent_at, now()), updated_at = now();

  if p_data ? 'preferences' then
    delete from dk_consumer_preferences where consumer_id = v_uid;
    for v_pref in select * from jsonb_array_elements(coalesce(p_data -> 'preferences', '[]')) loop
      insert into dk_consumer_preferences (consumer_id, kind, value)
      values (v_uid, v_pref ->> 'kind', btrim(v_pref ->> 'value'))
      on conflict do nothing;
    end loop;
  end if;
  return dk_consumer_profile_get();
end;
$$;

/**
 * May the caller use the assistant's model now? Records the call when allowed.
 * 10 per minute and 200 per day per consumer; without it the assistant still
 * answers with its rule-based parser.
 */
create or replace function dk_consumer_ai_allow()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;
  perform pg_advisory_xact_lock(hashtext('dk_consumer_ai:' || v_uid::text));
  if (select count(*) from dk_consumer_ai_runs where consumer_id = v_uid and created_at > now() - interval '1 minute') >= 10
     or (select count(*) from dk_consumer_ai_runs where consumer_id = v_uid and created_at > now() - interval '1 day') >= 200 then
    return false;
  end if;
  delete from dk_consumer_ai_runs where consumer_id = v_uid and created_at < now() - interval '2 days';
  insert into dk_consumer_ai_runs (consumer_id) values (v_uid);
  return true;
end;
$$;

revoke all on function dk_consumer_profile_get(), dk_consumer_profile_save(jsonb), dk_consumer_ai_allow() from public, anon;
grant execute on function dk_consumer_profile_get(), dk_consumer_profile_save(jsonb), dk_consumer_ai_allow() to authenticated;

notify pgrst, 'reload schema';
