-- SOLO LOCAL. Datos DE PRUEBA para Quanela Consumer (ADR 0042). Todos los
-- negocios dicen «(prueba)» en el nombre y usan el dominio @local.test. Nunca se
-- corre contra producción. Se puede correr varias veces: borra y recrea lo suyo.
--
--   docker exec -i supabase_db_<proyecto> psql -U postgres -v ON_ERROR_STOP=1 -1 < supabase/tests/fixtures/consumer_demo.sql
--
-- Qué cubre:
--   Burger Lab      hamburguesas; menú de hoy; métricas compartidas (rápido); ubicación; WhatsApp
--   Brasa Urbana    hamburguesas y parrilla; más barato y más lento; un plato agotado y otro con límite alcanzado
--   Verde Vivo      saludable y vegetariano; SIN menú de hoy (disponibilidad sin confirmar); no comparte métricas
--   Nonna           pizza; precio promocional hoy
--   Café Aurora     cerrado hoy por excepción de horario
--   Taco Norte      NO publicado: nunca debe aparecer

do $$
declare
  v_owner uuid := (select id from dk_users order by created_at limit 1);
  v_unit uuid := (select id from dk_units where code = 'g');
  v_org uuid;
  v_kitchen uuid;
  v_cat uuid;
  v_icat uuid;
  v_product uuid;
  v_recipe uuid;
  v_customer uuid;
  v_order uuid;
  v_t timestamptz;
  v_local_today date;
  r record;
  d record;
  i int;
  pass int;
begin
  if v_owner is null then raise exception 'No hay usuarios: corre primero el bootstrap local'; end if;

  -- Limpieza de una corrida anterior (solo lo de prueba): todo lo que cuelga de esas cuentas,
  -- sin sus guardas (historial inmutable, ítems solo en NUEVO) y en varias pasadas hasta
  -- respetar las llaves foráneas.
  for pass in 1 .. 4 loop
    for r in
      select c.conrelid::regclass::text as tbl from pg_constraint c
      where c.confrelid = 'dk_kitchens'::regclass and c.contype = 'f'
        and exists (select 1 from pg_attribute a where a.attrelid = c.conrelid and a.attname = 'kitchen_id')
    loop
      begin
        execute format('alter table %s disable trigger user', r.tbl);
        execute format('delete from %s where kitchen_id in (select id from dk_kitchens where slug like %L)', r.tbl, 'prueba-%');
        execute format('alter table %s enable trigger user', r.tbl);
      exception when others then null;  -- another table still points here: next pass
      end;
    end loop;
  end loop;
  -- The accounts, organizations and owners, without their audit/guard triggers either.
  for r in select unnest(array['dk_audit_log', 'dk_kitchens', 'dk_organizations', 'dk_organization_members', 'dk_subscriptions', 'dk_users',
                               'dk_kitchen_members', 'dk_member_roles', 'dk_storefronts', 'dk_storefront_products']) as tbl loop
    execute format('alter table %s disable trigger user', r.tbl);
  end loop;
  delete from dk_audit_log where kitchen_id in (select id from dk_kitchens where slug like 'prueba-%')
     or organization_id in (select id from dk_organizations where slug like 'prueba-%');
  delete from dk_kitchens where slug like 'prueba-%';
  delete from dk_organization_members where organization_id in (select id from dk_organizations where slug like 'prueba-%');
  delete from dk_subscriptions where organization_id in (select id from dk_organizations where slug like 'prueba-%');
  delete from dk_organizations where slug like 'prueba-%';
  delete from dk_users where email like '%@prueba.local.test';
  delete from auth.users where email like '%@prueba.local.test';
  for r in select unnest(array['dk_audit_log', 'dk_kitchens', 'dk_organizations', 'dk_organization_members', 'dk_subscriptions', 'dk_users',
                               'dk_kitchen_members', 'dk_member_roles', 'dk_storefronts', 'dk_storefront_products']) as tbl loop
    execute format('alter table %s enable trigger user', r.tbl);
  end loop;

  for r in select * from (values
    ('prueba-burger-lab', 'Burger Lab (prueba)', 'burgers', 'burger-lab', 'Smash burgers a la plancha', true, 4.6750, -74.0550, '+573001112233', 'open', 15, 3),
    ('prueba-brasa-urbana', 'Brasa Urbana (prueba)', 'grill', 'brasa-urbana', 'Parrilla y hamburguesas al carbón', true, 4.6500, -74.0600, null, 'open', 28, 9),
    ('prueba-verde-vivo', 'Verde Vivo (prueba)', 'healthy', 'verde-vivo', 'Bowls y wraps', false, 4.6900, -74.0400, null, 'open', null, null),
    ('prueba-nonna', 'Pizzería Nonna (prueba)', 'pizza', 'nonna', 'Pizza napolitana en horno de leña', true, null, null, '+573004445566', 'open', 22, 5),
    ('prueba-cafe-aurora', 'Café Aurora (prueba)', 'coffee', 'cafe-aurora', 'Café y sánduches', false, null, null, null, 'closed', null, null),
    ('prueba-taco-norte', 'Taco Norte (prueba)', 'mexican', 'taco-norte', 'Tacos al pastor', false, null, null, null, 'open', null, null)
  ) as t(slug, name, cuisine, public_slug, tagline, share, lat, lng, wa, hours, prep_min, response_min)
  loop
    -- Cada organización tiene su propio dueño (de prueba).
    -- Token columns must be '' (not null) or GoTrue cannot sign the user in.
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', r.slug || '@prueba.local.test',
            crypt('prueba-local-123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
            '', '', '', '', '', '', '', '')
    returning id into v_owner;
    insert into dk_users (auth_user_id, full_name, email) values (v_owner, 'Dueño ' || r.name, r.slug || '@prueba.local.test') returning id into v_owner;
    insert into dk_organizations (slug, name, owner_user_id, created_by, category)
    values (r.slug, r.name, v_owner, v_owner, r.cuisine) returning id into v_org;
    -- ADR 0047: the name and the cuisine customers see are the account's.
    insert into dk_kitchens (slug, name, cuisine, organization_id, created_by)
    values (r.slug, replace(r.name, ' (prueba)', '') || ' (prueba)', r.cuisine, v_org, v_owner) returning id into v_kitchen;
    -- The owner works in the account as ADMIN (as the sign-up flow leaves it).
    insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
    values (v_kitchen, v_owner, (select id from dk_roles where is_system and key = 'ADMIN')) on conflict do nothing;
    insert into dk_member_roles (kitchen_id, user_id, role_id)
    values (v_kitchen, v_owner, (select id from dk_roles where is_system and key = 'ADMIN')) on conflict do nothing;
    v_local_today := (now() at time zone 'America/Bogota')::date;

    -- Horario: todo el día (00:00 → 23:59); Café Aurora, cerrado hoy.
    insert into dk_kitchen_hours (kitchen_id, day_of_week, is_open, opens_at, closes_at)
    select v_kitchen, wd::dk_day_of_week, true, '00:00', '23:59'
    from unnest(array['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO']) wd;
    if r.hours = 'closed' then
      insert into dk_kitchen_hour_exceptions (kitchen_id, exception_date, is_open, note) values (v_kitchen, v_local_today, false, 'Inventario');
    end if;

    insert into dk_storefronts (kitchen_id, published, tagline, latitude, longitude, whatsapp_phone, share_metrics, published_at)
    values (v_kitchen, r.slug <> 'prueba-taco-norte', r.tagline, r.lat, r.lng, r.wa, r.share, now());

    insert into dk_ingredient_categories (kitchen_id, name) values (v_kitchen, 'General') returning id into v_icat;
    insert into dk_customers (kitchen_id, full_name, phone) values (v_kitchen, 'Cliente de prueba', '+573009990000') returning id into v_customer;

    -- Platos de este negocio: (nombre, categoría, descripción, precio, especial, costo, ingredientes, etiquetas, mostrar ingredientes, menú hoy)
    for d in select * from (values
      ('prueba-burger-lab', 'Cheeseburger', 'Hamburguesas', 'Doble carne smash, queso cheddar y salsa de la casa', 28000, null, 9000, array['Carne de res', 'Queso cheddar', 'Pan brioche', 'Cebolla', 'Pepinillos'], array[]::text[], true, 'on'),
      ('prueba-burger-lab', 'Bacon Burger', 'Hamburguesas', 'Carne smash, tocineta crocante y queso americano', 32000, null, 11000, array['Carne de res', 'Tocineta', 'Queso americano', 'Pan brioche'], array[]::text[], true, 'on'),
      ('prueba-burger-lab', 'Veggie Burger', 'Hamburguesas', 'Medallón de garbanzo con aguacate', 26000, null, 8000, array['Garbanzo', 'Aguacate', 'Pan brioche', 'Lechuga'], array['vegetarian'], true, 'on'),
      ('prueba-burger-lab', 'Papas fritas', 'Acompañamientos', 'Papas en corte grueso', 9000, null, 2500, array['Papa'], array['vegetarian', 'vegan'], true, 'on'),
      ('prueba-brasa-urbana', 'Hamburguesa Clásica', 'Hamburguesas', 'Carne al carbón, queso, lechuga y tomate', 24000, null, 8000, array['Carne de res', 'Queso mozzarella', 'Lechuga', 'Tomate', 'Cebolla'], array[]::text[], true, 'on'),
      ('prueba-brasa-urbana', 'Hamburguesa BBQ', 'Hamburguesas', 'Carne al carbón con salsa BBQ y aros de cebolla', 27000, null, 9000, array['Carne de res', 'Salsa BBQ', 'Cebolla'], array[]::text[], false, 'off'),
      ('prueba-brasa-urbana', 'Picada para dos', 'Parrilla', 'Chorizo, res, cerdo y papa criolla', 45000, null, 17000, array['Chorizo', 'Carne de res', 'Cerdo', 'Papa criolla'], array[]::text[], false, 'limit'),
      ('prueba-verde-vivo', 'Bowl de quinoa', 'Bowls', 'Quinoa, garbanzos, aguacate y vinagreta de limón', 23000, null, 7000, array['Quinoa', 'Garbanzo', 'Aguacate'], array['vegetarian', 'vegan', 'healthy', 'gluten_free'], true, null),
      ('prueba-verde-vivo', 'Wrap de pollo', 'Wraps', 'Pollo a la plancha, lechuga y yogur', 21000, null, 6500, array['Pollo', 'Tortilla', 'Lechuga', 'Yogur'], array['healthy'], false, null),
      ('prueba-nonna', 'Pizza Margarita', 'Pizzas', 'Tomate San Marzano, mozzarella y albahaca', 34000, 29000, 10000, array['Masa', 'Tomate', 'Queso mozzarella', 'Albahaca'], array['vegetarian'], true, 'on'),
      ('prueba-nonna', 'Pizza Pepperoni', 'Pizzas', 'Pepperoni y mozzarella', 38000, null, 12000, array['Masa', 'Tomate', 'Queso mozzarella', 'Pepperoni'], array[]::text[], true, 'on'),
      ('prueba-cafe-aurora', 'Sánduche de jamón y queso', 'Sánduches', 'Pan masa madre', 18000, null, 5000, array['Pan', 'Jamón', 'Queso'], array[]::text[], true, 'on'),
      ('prueba-taco-norte', 'Tacos al pastor', 'Tacos', 'Tres tacos con piña', 22000, null, 7000, array['Cerdo', 'Piña', 'Tortilla'], array[]::text[], true, 'on')
    ) as x(slug, name, category, description, price, special, cost, ingredients, tags, show_ing, plan)
    where x.slug = r.slug
    loop
      select id into v_cat from dk_product_categories where kitchen_id = v_kitchen and name = d.category;
      if v_cat is null then
        insert into dk_product_categories (kitchen_id, name) values (v_kitchen, d.category) returning id into v_cat;
      end if;
      insert into dk_products (kitchen_id, name, description, category_id, price, estimated_cost)
      values (v_kitchen, d.name, d.description, v_cat, d.price, d.cost) returning id into v_product;
      insert into dk_recipes (kitchen_id, product_id, version, is_active) values (v_kitchen, v_product, 1, true) returning id into v_recipe;
      update dk_products set active_recipe_id = v_recipe where id = v_product;
      for i in 1 .. array_length(d.ingredients, 1) loop
        insert into dk_ingredients (kitchen_id, code, name, base_unit_id, category_id, avg_cost)
        values (v_kitchen, 'ING-' || lower(regexp_replace(d.ingredients[i], '\W', '', 'g')), d.ingredients[i], v_unit, v_icat, 10)
        on conflict do nothing;
        insert into dk_recipe_items (kitchen_id, recipe_id, ingredient_id, quantity)
        select v_kitchen, v_recipe, id, 100 from dk_ingredients where kitchen_id = v_kitchen and name = d.ingredients[i];
      end loop;
      insert into dk_storefront_products (kitchen_id, product_id, published, dietary_tags, show_ingredients)
      values (v_kitchen, v_product, true, d.tags, d.show_ing);
      if d.plan is not null then
        insert into dk_menu_plan_items (kitchen_id, plan_date, product_id, is_active, special_price, unit_limit)
        values (v_kitchen, v_local_today, v_product, d.plan <> 'off', d.special, case when d.plan = 'limit' then 2 end);
      end if;
    end loop;

    -- Historial real de pedidos para las métricas (14 entregados + 1 cancelado).
    if r.prep_min is not null then
      for i in 1 .. 15 loop
        v_t := now() - make_interval(days => i % 10 + 1, hours => i % 5);
        select id into v_product from dk_products where kitchen_id = v_kitchen order by name limit 1 offset (i % 2);
        insert into dk_orders (kitchen_id, customer_id, created_at) values (v_kitchen, v_customer, v_t) returning id into v_order;
        insert into dk_order_items (kitchen_id, order_id, product_id, quantity, unit_price)
        select v_kitchen, v_order, id, 1 + i % 2, price from dk_products where id = v_product;
        if i = 15 then
          update dk_orders set status = 'CANCELADO' where id = v_order;
          insert into dk_order_status_history (kitchen_id, order_id, from_status, to_status, changed_at) values (v_kitchen, v_order, 'NUEVO', 'CANCELADO', v_t + interval '5 minutes');
        else
          update dk_orders set status = 'ENTREGADO' where id = v_order;
          insert into dk_order_status_history (kitchen_id, order_id, from_status, to_status, changed_at) values
            (v_kitchen, v_order, 'NUEVO', 'CONFIRMADO', v_t + make_interval(mins => r.response_min + i % 3)),
            (v_kitchen, v_order, 'CONFIRMADO', 'EN_PREPARACION', v_t + make_interval(mins => r.response_min + 1)),
            (v_kitchen, v_order, 'EN_PREPARACION', 'LISTO', v_t + make_interval(mins => r.response_min + r.prep_min + i % 4)),
            (v_kitchen, v_order, 'LISTO', 'DESPACHADO', v_t + make_interval(mins => r.response_min + r.prep_min + 5)),
            (v_kitchen, v_order, 'DESPACHADO', 'ENTREGADO', v_t + make_interval(mins => r.response_min + r.prep_min + 25));
          insert into dk_deliveries (kitchen_id, order_id, status, dispatched_at, delivered_at)
          values (v_kitchen, v_order, 'ENTREGADO', v_t + make_interval(mins => r.response_min + r.prep_min + 5), v_t + make_interval(mins => r.response_min + r.prep_min + 25));
        end if;
      end loop;
    end if;

    -- Brasa Urbana: la «Picada para dos» ya vendió sus 2 unidades de hoy.
    if r.slug = 'prueba-brasa-urbana' then
      insert into dk_orders (kitchen_id, customer_id) values (v_kitchen, v_customer) returning id into v_order;
      insert into dk_order_items (kitchen_id, order_id, product_id, quantity, unit_price)
      select v_kitchen, v_order, id, 2, price from dk_products where kitchen_id = v_kitchen and name = 'Picada para dos';
    end if;
  end loop;
end $$;
