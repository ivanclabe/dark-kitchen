-- ADR 0048 — Platos que no usan inventario.
--
-- Cada plato dice si «Descuenta inventario» (`uses_inventory`, encendido por
-- defecto: los platos de hoy no cambian). Apagado, el plato se confirma sin
-- receta y nunca reserva ni descuenta insumos, aunque tenga una. Encendido y
-- sin receta, la confirmación se sigue rechazando: una receta olvidada no
-- deja de descontar en silencio.
--
--   * dk_products.uses_inventory y dk_master_products.uses_inventory (la copia
--     de un menú maestro la hereda al sincronizar y la cuenta no la cambia).
--   * dk_confirm_order: se recrea desde su cuerpo vigente (permiso
--     orders.confirm y cuenta activa) y exige receta solo si uses_inventory.
--     Los platos que no usan inventario quedan con recipe_id nulo: no hay
--     reservas, así que preparar, retroceder y cancelar no mueven el stock.
--   * dk_save_master_product: recibe p_uses_inventory (al final, con valor
--     por defecto: las llamadas de antes siguen sirviendo).
--   * dk_copilot_products: sin receta no hay margen (antes decía 100 %), y
--     dice si el plato usa inventario.

-- ---------------------------------------------------------------------------
-- Columnas
-- ---------------------------------------------------------------------------

alter table dk_products add column uses_inventory boolean not null default true;
comment on column dk_products.uses_inventory is
  'Descuenta inventario (ADR 0048). false: el plato se confirma sin receta y nunca reserva ni descuenta insumos.';

alter table dk_master_products add column uses_inventory boolean not null default true;
comment on column dk_master_products.uses_inventory is
  'Descuenta inventario (ADR 0048). Se copia a los platos de cada cuenta al sincronizar.';

-- ---------------------------------------------------------------------------
-- Confirmar un pedido
-- ---------------------------------------------------------------------------

create or replace function dk_confirm_order(p_order_id uuid)
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
  perform dk_assert_in_active_kitchen('dk_orders', p_order_id);
  if not dk_can('orders.confirm') then
    raise exception 'No autorizado para confirmar pedidos';
  end if;

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

  -- Congela la receta vigente de cada plato que usa inventario. Los que no lo
  -- usan quedan sin receta: no reservan ni descuentan nada (ADR 0048).
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

  -- Valida stock disponible agregando requerimientos por insumo (un mismo
  -- insumo puede repetirse en varios platos del mismo pedido).
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

-- ---------------------------------------------------------------------------
-- Menús maestros
-- ---------------------------------------------------------------------------

-- La copia de un plato maestro tampoco cambia «Descuenta inventario» en la cuenta.
create or replace function dk_guard_master_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.master_product_id is null or dk_is_syncing_master() then
    return new;
  end if;
  if new.name is distinct from old.name
     or new.code is distinct from old.code
     or new.description is distinct from old.description
     or new.category_id is distinct from old.category_id
     or new.active is distinct from old.active
     or new.active_recipe_id is distinct from old.active_recipe_id
     or new.uses_inventory is distinct from old.uses_inventory
     or new.master_product_id is distinct from old.master_product_id
     or new.kitchen_id is distinct from old.kitchen_id then
    raise exception 'Este plato viene de un menú maestro: aquí solo puedes cambiar su precio y en qué días se ofrece';
  end if;
  if new.price_is_local is distinct from old.price_is_local and not new.price_is_local then
    -- Volver al precio del maestro.
    new.price := (select price from dk_master_products where id = old.master_product_id);
  elsif new.price is distinct from old.price then
    new.price_is_local := true;
  end if;
  return new;
end;
$$;

create or replace function dk_sync_master_menu_kitchen(p_menu_id uuid, p_kitchen_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_menu_active boolean;
  mp record;
  ri record;
  v_category uuid;
  v_product record;
  v_ingredient record;
  v_unit uuid;
  v_desired jsonb;
  v_current jsonb;
  v_recipe uuid;
begin
  perform set_config('dk.syncing_master', 'on', true);
  select active into v_menu_active from dk_master_menus where id = p_menu_id;

  for mp in select * from dk_master_products where master_menu_id = p_menu_id order by sort_order, name loop
    -- Categoría (por nombre, dentro de la Cocina)
    v_category := null;
    if nullif(btrim(mp.category_name), '') is not null then
      select id into v_category from dk_product_categories where kitchen_id = p_kitchen_id and name = btrim(mp.category_name);
      if v_category is null then
        insert into dk_product_categories (kitchen_id, name) values (p_kitchen_id, btrim(mp.category_name)) returning id into v_category;
      end if;
    end if;

    -- Plato
    select * into v_product from dk_products where kitchen_id = p_kitchen_id and master_product_id = mp.id;
    if not found then
      insert into dk_products (kitchen_id, code, name, description, category_id, price, active, uses_inventory, master_product_id)
      values (
        p_kitchen_id,
        -- Si la Cocina ya usa ese código en un plato propio, la copia queda sin código (no se pisa lo local).
        case when exists (select 1 from dk_products where kitchen_id = p_kitchen_id and code = mp.code) then null else mp.code end,
        mp.name, mp.description, v_category, mp.price, mp.active and v_menu_active, mp.uses_inventory, mp.id
      )
      returning * into v_product;
    else
      update dk_products
      set name = mp.name,
          description = mp.description,
          category_id = v_category,
          price = case when price_is_local then price else mp.price end,
          active = mp.active and v_menu_active,
          uses_inventory = mp.uses_inventory
      where id = v_product.id
      returning * into v_product;
    end if;

    -- Receta: insumos por código en el inventario de la Cocina (se crean si faltan).
    v_desired := '[]'::jsonb;
    for ri in select * from dk_master_recipe_items where master_product_id = mp.id order by ingredient_code loop
      select id into v_unit from dk_units where code = ri.unit_code;
      select * into v_ingredient from dk_ingredients where kitchen_id = p_kitchen_id and code = ri.ingredient_code;
      if not found then
        insert into dk_ingredients (kitchen_id, code, name, base_unit_id)
        values (p_kitchen_id, ri.ingredient_code, ri.ingredient_name, v_unit)
        returning * into v_ingredient;
      elsif v_ingredient.base_unit_id <> v_unit then
        raise exception 'En la cocina "%" el insumo % (%) usa otra unidad base; ajústala o cambia la receta del menú maestro',
          (select name from dk_kitchens where id = p_kitchen_id), ri.ingredient_code, v_ingredient.name;
      end if;
      v_desired := v_desired || jsonb_build_object('ingredient_id', v_ingredient.id, 'quantity', ri.quantity);
    end loop;

    select coalesce(jsonb_agg(jsonb_build_object('ingredient_id', i.ingredient_id, 'quantity', i.quantity) order by i.ingredient_id::text), '[]'::jsonb)
    into v_current
    from dk_recipe_items i where i.recipe_id = v_product.active_recipe_id;
    -- (ambas listas ordenadas por el id del insumo como texto, para compararlas)

    select coalesce(jsonb_agg(d order by d ->> 'ingredient_id'), '[]'::jsonb) into v_desired from jsonb_array_elements(v_desired) d;

    if jsonb_array_length(v_desired) > 0 and v_desired <> v_current then
      update dk_recipes set is_active = false where product_id = v_product.id and is_active;
      insert into dk_recipes (product_id, version, is_active, created_by)
      values (v_product.id, (select coalesce(max(version), 0) + 1 from dk_recipes where product_id = v_product.id), true, dk_current_profile_id())
      returning id into v_recipe;
      insert into dk_recipe_items (recipe_id, ingredient_id, quantity)
      select v_recipe, (d ->> 'ingredient_id')::uuid, (d ->> 'quantity')::numeric from jsonb_array_elements(v_desired) d;
      update dk_products set active_recipe_id = v_recipe, estimated_cost = dk_calculate_recipe_cost(v_recipe) where id = v_product.id;
    end if;
  end loop;

  perform set_config('dk.syncing_master', 'off', true);
end;
$$;

drop function dk_save_master_product(uuid, uuid, text, text, text, text, numeric, boolean, jsonb);

create function dk_save_master_product(
  p_menu_id uuid, p_product_id uuid, p_code text, p_name text, p_description text, p_category text,
  p_price numeric, p_active boolean, p_recipe jsonb, p_uses_inventory boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_product_id;
  v_kitchen uuid;
begin
  perform dk_require_master_menu_manager(p_menu_id);
  perform set_config('dk.master_batch', 'on', true);

  if v_id is null then
    insert into dk_master_products (master_menu_id, code, name, description, category_name, price, active, uses_inventory, sort_order)
    values (p_menu_id, upper(btrim(p_code)), btrim(p_name), nullif(btrim(p_description), ''), nullif(btrim(p_category), ''), p_price, coalesce(p_active, true),
      coalesce(p_uses_inventory, true),
      (select coalesce(max(sort_order), 0) + 1 from dk_master_products where master_menu_id = p_menu_id))
    returning id into v_id;
  else
    update dk_master_products
    set code = upper(btrim(p_code)), name = btrim(p_name), description = nullif(btrim(p_description), ''),
        category_name = nullif(btrim(p_category), ''), price = p_price, active = coalesce(p_active, true),
        uses_inventory = coalesce(p_uses_inventory, true)
    where id = v_id and master_menu_id = p_menu_id;
    if not found then raise exception 'Plato no encontrado en este menú'; end if;
  end if;

  delete from dk_master_recipe_items where master_product_id = v_id;
  insert into dk_master_recipe_items (master_product_id, ingredient_code, ingredient_name, unit_code, quantity)
  select v_id, upper(btrim(r ->> 'ingredient_code')), btrim(r ->> 'ingredient_name'), r ->> 'unit_code', (r ->> 'quantity')::numeric
  from jsonb_array_elements(coalesce(p_recipe, '[]'::jsonb)) r;

  perform set_config('dk.master_batch', 'off', true);
  for v_kitchen in select kitchen_id from dk_master_menu_kitchens where master_menu_id = p_menu_id loop
    perform dk_sync_master_menu_kitchen(p_menu_id, v_kitchen);
  end loop;
  return v_id;
exception when unique_violation then
  raise exception 'Ya existe un plato con ese código (o un insumo repetido en la receta) en este menú';
end;
$$;

revoke all on function dk_save_master_product(uuid, uuid, text, text, text, text, numeric, boolean, jsonb, boolean) from public, anon;
grant execute on function dk_save_master_product(uuid, uuid, text, text, text, text, numeric, boolean, jsonb, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Copilot: sin receta no hay margen
-- ---------------------------------------------------------------------------

create or replace function dk_copilot_products(p_search text default null, p_ingredient text default null, p_limit integer default 15)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 15), 1), 40);
  v_cost boolean := dk_can('reports.profitability');
  v_recipes boolean := dk_can('recipes.view');
begin
  perform dk_require('products.view');
  return (
    select jsonb_build_object('products', coalesce(jsonb_agg(x), '[]'), 'costVisible', v_cost, 'recipesVisible', v_recipes)
    from (
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'active', p.active, 'price', p.price,
        'category', (select name from dk_product_categories where id = p.category_id),
        'usesInventory', p.uses_inventory,
        'hasRecipe', p.active_recipe_id is not null,
        -- Sin receta no hay costo registrado: ni costo ni margen (no un 100 %).
        'estimatedCost', case when v_cost and p.active_recipe_id is not null then p.estimated_cost end,
        'marginPct', case when v_cost and p.active_recipe_id is not null and p.price > 0 then round((1 - p.estimated_cost / p.price) * 100, 1) end,
        'sold30d', (select coalesce(sum(i.quantity), 0) from dk_order_items i join dk_orders o on o.id = i.order_id
                    where i.product_id = p.id and o.status <> 'CANCELADO' and o.created_at > now() - interval '30 days'),
        'recipe', case when v_recipes then (
          select coalesce(jsonb_agg(jsonb_build_object('ingredientId', g.id, 'ingredient', g.name, 'quantity', ri.quantity, 'unit', u.code)), '[]')
          from dk_recipe_items ri join dk_ingredients g on g.id = ri.ingredient_id join dk_units u on u.id = g.base_unit_id
          where ri.recipe_id = p.active_recipe_id) end) x
      from dk_products p
      where (p_search is null or p.name ilike '%' || p_search || '%')
        and (p_ingredient is null or exists (
              select 1 from dk_recipe_items ri join dk_ingredients g on g.id = ri.ingredient_id
              where ri.recipe_id = p.active_recipe_id and g.name ilike '%' || p_ingredient || '%'))
      order by p.active desc, p.name
      limit v_limit) t);
end;
$$;
