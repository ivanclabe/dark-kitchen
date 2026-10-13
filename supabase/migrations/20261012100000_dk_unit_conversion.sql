-- ADR 0056 — Conversión automática de unidades.
--
-- The base unit of each ingredient stays the truth: stock, movements, cost per base unit,
-- reservations and consumption do not change. What changes: any quantity entered in another
-- compatible unit (recipes, waste, adjustments, master menus) is converted when saved, with ONE
-- rule (dk_unit_factor). No new tables: dk_units, dk_ingredient_purchase_units and two optional
-- columns on dk_recipe_items.

-- ---------------------------------------------------------------------------
-- 1. The rule: how many base units does 1 of this unit hold, for this ingredient?
--    same unit → 1 · the ingredient's own package → its factor · same kind (kg↔g, l↔ml, docena↔unidad) →
--    ratio of factors · generic packages (caja, bolsa, paquete) only with the ingredient's factor · else none.
-- ---------------------------------------------------------------------------
create or replace function dk_unit_factor(p_ingredient_id uuid, p_unit_id uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select case
    when u.id = i.base_unit_id then 1::numeric
    when ipu.factor_to_base is not null then ipu.factor_to_base
    when u.code in ('caja', 'bolsa', 'paquete') or b.code in ('caja', 'bolsa', 'paquete') then null
    when u.unit_type = b.unit_type then u.factor_to_base / b.factor_to_base
  end
  from dk_ingredients i
  join dk_units b on b.id = i.base_unit_id
  join dk_units u on u.id = p_unit_id
  left join dk_ingredient_purchase_units ipu on ipu.ingredient_id = i.id and ipu.unit_id = u.id
  where i.id = p_ingredient_id;
$$;
comment on function dk_unit_factor(uuid, uuid) is 'ADR 0056: base units in 1 of p_unit for this ingredient (null = no conversion).';
revoke all on function dk_unit_factor(uuid, uuid) from public, anon;
grant execute on function dk_unit_factor(uuid, uuid) to authenticated, service_role;

-- The units a person may use for each ingredient (the base, the same kind, its own packages), with their factor.
create or replace function dk_unit_options(p_ingredient_ids uuid[])
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_object_agg(x.ingredient_id, x.options), '{}'::jsonb)
  from (
    select i.id as ingredient_id,
      jsonb_agg(jsonb_build_object('unitId', u.id, 'code', u.code, 'name', u.name, 'factor', dk_unit_factor(i.id, u.id),
                                   'source', case when u.id = i.base_unit_id then 'base' when ipu.unit_id is not null then 'package' else 'standard' end)
                order by (u.id <> i.base_unit_id), dk_unit_factor(i.id, u.id)) as options
    from dk_ingredients i
    cross join dk_units u
    left join dk_ingredient_purchase_units ipu on ipu.ingredient_id = i.id and ipu.unit_id = u.id
    where i.id = any (p_ingredient_ids) and dk_unit_factor(i.id, u.id) is not null
    group by i.id) x;
$$;
revoke all on function dk_unit_options(uuid[]) from public, anon;
grant execute on function dk_unit_options(uuid[]) to authenticated;

-- An ingredient's own package («caja = 12 unidades»): kept for purchases, recipes and waste. Null factor removes it.
create or replace function dk_ingredient_set_purchase_unit(p_ingredient_id uuid, p_unit_id uuid, p_factor numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  i dk_ingredients;
  u dk_units;
  b dk_units;
begin
  perform dk_assert_in_active_kitchen('dk_ingredients', p_ingredient_id);
  if not (dk_can('inventory.edit') or dk_can('purchasing.create')) then
    raise exception 'No autorizado para definir empaques de insumos';
  end if;
  select * into i from dk_ingredients where id = p_ingredient_id;
  select * into u from dk_units where id = p_unit_id;
  select * into b from dk_units where id = i.base_unit_id;
  if u.id is null then raise exception 'Unidad desconocida'; end if;
  if u.id = b.id then raise exception 'Es la unidad base del insumo: no necesita conversión' using hint = 'invalid'; end if;
  if p_factor is null then
    delete from dk_ingredient_purchase_units where ingredient_id = p_ingredient_id and unit_id = p_unit_id;
    return;
  end if;
  if p_factor <= 0 then raise exception 'La cantidad debe ser mayor que cero' using hint = 'invalid'; end if;
  -- kg, l, docena… already convert by themselves: a different number would contradict the standard.
  if u.unit_type = b.unit_type and u.code not in ('caja', 'bolsa', 'paquete') and b.code not in ('caja', 'bolsa', 'paquete') then
    raise exception '% ya se convierte solo a % (1 % = % %)', u.code, b.code, u.code, round(u.factor_to_base / b.factor_to_base, 6), b.code using hint = 'standard';
  end if;
  insert into dk_ingredient_purchase_units (ingredient_id, unit_id, factor_to_base)
  values (p_ingredient_id, p_unit_id, p_factor)
  on conflict (ingredient_id, unit_id) do update set factor_to_base = excluded.factor_to_base;
end;
$$;
revoke all on function dk_ingredient_set_purchase_unit(uuid, uuid, numeric) from public, anon;
grant execute on function dk_ingredient_set_purchase_unit(uuid, uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Recipes in any compatible unit: quantity stays in the base unit; the unit used is remembered
-- ---------------------------------------------------------------------------
alter table dk_recipe_items
  add column if not exists unit_id uuid references dk_units (id),
  add column if not exists unit_quantity numeric check (unit_quantity is null or unit_quantity > 0),
  add constraint dk_recipe_items_unit_pair check ((unit_id is null) = (unit_quantity is null));
comment on column dk_recipe_items.quantity is 'Cantidad en la unidad base del insumo: lo que consume y lo que cuesta (ADR 0056: siempre convertida al guardar).';
comment on column dk_recipe_items.unit_id is 'ADR 0056: la unidad en que se escribió la línea (null = la unidad base).';
comment on column dk_recipe_items.unit_quantity is 'ADR 0056: lo que se escribió en unit_id (p. ej. 150 g de un insumo en kg).';

create or replace function dk_create_recipe_version(p_product_id uuid, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_version integer;
  v_recipe_id uuid;
  v_cost numeric;
  v_item jsonb;
  v_ingredient uuid;
  v_unit uuid;
  v_qty numeric;
  v_factor numeric;
  v_base uuid;
begin
  perform dk_assert_in_active_kitchen('dk_products', p_product_id);
  if not dk_can('recipes.edit') then
    raise exception 'No autorizado para modificar recetas';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'La receta debe tener al menos un ingrediente';
  end if;

  update dk_recipes set is_active = false
  where product_id = p_product_id and is_active;

  select coalesce(max(version), 0) + 1 into v_next_version
  from dk_recipes where product_id = p_product_id;

  insert into dk_recipes (product_id, version, is_active, created_by)
  values (p_product_id, v_next_version, true, dk_current_profile_id())
  returning id into v_recipe_id;

  -- ADR 0056: each line in the unit the person chose; stored converted to the base unit.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_ingredient := (v_item ->> 'ingredient_id')::uuid;
    v_qty := (v_item ->> 'quantity')::numeric;
    v_unit := nullif(v_item ->> 'unit_id', '')::uuid;
    select base_unit_id into v_base from dk_ingredients where id = v_ingredient;
    if v_unit is null or v_unit = v_base then
      insert into dk_recipe_items (recipe_id, ingredient_id, quantity) values (v_recipe_id, v_ingredient, v_qty);
    else
      v_factor := dk_unit_factor(v_ingredient, v_unit);
      if v_factor is null then
        raise exception 'No hay conversión de % a la unidad base de «%»', (select code from dk_units where id = v_unit),
          (select name from dk_ingredients where id = v_ingredient) using hint = 'no_conversion';
      end if;
      insert into dk_recipe_items (recipe_id, ingredient_id, quantity, unit_id, unit_quantity)
      values (v_recipe_id, v_ingredient, v_qty * v_factor, v_unit, v_qty);
    end if;
  end loop;

  v_cost := dk_calculate_recipe_cost(v_recipe_id);

  update dk_products
  set active_recipe_id = v_recipe_id, estimated_cost = v_cost
  where id = p_product_id;

  return v_recipe_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Waste and adjustments in any compatible unit (the movement stays in the base unit)
-- ---------------------------------------------------------------------------
drop function if exists dk_register_waste(uuid, numeric, dk_waste_reason, text);
create function dk_register_waste(p_ingredient_id uuid, p_quantity numeric, p_reason dk_waste_reason, p_observation text default null, p_unit_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movement_id uuid;
  v_avg_cost numeric;
  v_factor numeric := 1;
  v_base uuid;
begin
  perform dk_assert_in_active_kitchen('dk_ingredients', p_ingredient_id);
  if not dk_can('inventory.adjust') then
    raise exception 'No autorizado para registrar mermas';
  end if;
  if p_quantity <= 0 then
    raise exception 'La cantidad de merma debe ser positiva (se registra como salida automaticamente)';
  end if;

  select avg_cost, base_unit_id into v_avg_cost, v_base from dk_ingredients where id = p_ingredient_id;
  if p_unit_id is not null and p_unit_id <> v_base then
    v_factor := dk_unit_factor(p_ingredient_id, p_unit_id);
    if v_factor is null then raise exception 'No hay conversión de esa unidad a la unidad base del insumo' using hint = 'no_conversion'; end if;
    p_observation := concat_ws(' · ', nullif(btrim(p_observation), ''), format('Registrada como %s %s', p_quantity, (select code from dk_units where id = p_unit_id)));
  end if;

  insert into dk_inventory_movements (
    ingredient_id, movement_type, quantity_base_unit, unit_cost, reason, observation, created_by
  ) values (
    p_ingredient_id, 'MERMA', -(p_quantity * v_factor), v_avg_cost, p_reason, p_observation, dk_current_profile_id()
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;
revoke all on function dk_register_waste(uuid, numeric, dk_waste_reason, text, uuid) from public, anon;
grant execute on function dk_register_waste(uuid, numeric, dk_waste_reason, text, uuid) to authenticated, service_role;

drop function if exists dk_register_adjustment(uuid, numeric, text);
create function dk_register_adjustment(p_ingredient_id uuid, p_quantity numeric, p_observation text default null, p_unit_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movement_id uuid;
  v_factor numeric := 1;
  v_base uuid;
begin
  perform dk_assert_in_active_kitchen('dk_ingredients', p_ingredient_id);
  if not dk_can('inventory.adjust') then
    raise exception 'No autorizado para registrar ajustes';
  end if;
  if p_quantity = 0 then
    raise exception 'La cantidad de ajuste no puede ser cero';
  end if;
  select base_unit_id into v_base from dk_ingredients where id = p_ingredient_id;
  if p_unit_id is not null and p_unit_id <> v_base then
    v_factor := dk_unit_factor(p_ingredient_id, p_unit_id);
    if v_factor is null then raise exception 'No hay conversión de esa unidad a la unidad base del insumo' using hint = 'no_conversion'; end if;
    p_observation := concat_ws(' · ', nullif(btrim(p_observation), ''), format('Registrado como %s %s', p_quantity, (select code from dk_units where id = p_unit_id)));
  end if;

  -- ADR 0051 (D5): valued at the average cost, like waste.
  insert into dk_inventory_movements (
    ingredient_id, movement_type, quantity_base_unit, unit_cost, observation, created_by
  ) values (
    p_ingredient_id, 'AJUSTE', p_quantity * v_factor, (select avg_cost from dk_ingredients where id = p_ingredient_id), p_observation, dk_current_profile_id()
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;
revoke all on function dk_register_adjustment(uuid, numeric, text, uuid) from public, anon;
grant execute on function dk_register_adjustment(uuid, numeric, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The base unit of an ingredient with history cannot change (it would silently rescale stock and cost)
-- ---------------------------------------------------------------------------
create or replace function dk_ingredients_guard_base_unit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.base_unit_id is distinct from old.base_unit_id and (
       exists (select 1 from dk_inventory_movements where ingredient_id = old.id)
    or exists (select 1 from dk_recipe_items where ingredient_id = old.id)
    or exists (select 1 from dk_purchase_items where ingredient_id = old.id)) then
    raise exception 'No se puede cambiar la unidad base de «%»: ya tiene movimientos, compras o recetas. Puedes comprar y usar otras unidades compatibles (se convierten solas).', old.name
      using hint = 'base_unit_locked';
  end if;
  return new;
end;
$$;
drop trigger if exists dk_trg_ingredients_guard_base_unit on dk_ingredients;
create trigger dk_trg_ingredients_guard_base_unit before update of base_unit_id on dk_ingredients
  for each row execute function dk_ingredients_guard_base_unit();

-- ---------------------------------------------------------------------------
-- 5. Master menus: the organization's recipe unit is converted to each account's base unit
-- ---------------------------------------------------------------------------
create or replace function dk_sync_master_menu_kitchen(p_menu_id uuid, p_kitchen_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  v_menu_active boolean;
  mp record;
  ri record;
  v_category uuid;
  v_product record;
  v_ingredient record;
  v_unit uuid;
  v_factor numeric;
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
      end if;
      -- ADR 0056: the master recipe's unit is converted to the account's base unit (kg ↔ g); only incompatible units fail.
      v_factor := dk_unit_factor(v_ingredient.id, v_unit);
      if v_factor is null then
        raise exception 'En la cocina "%" el insumo % (%) usa una unidad base que no convierte desde %; ajústala o cambia la receta del menú maestro',
          (select name from dk_kitchens where id = p_kitchen_id), ri.ingredient_code, v_ingredient.name, ri.unit_code;
      end if;
      v_desired := v_desired || jsonb_build_object('ingredient_id', v_ingredient.id, 'quantity', ri.quantity * v_factor,
        'unit_id', case when v_unit <> v_ingredient.base_unit_id then v_unit end,
        'unit_quantity', case when v_unit <> v_ingredient.base_unit_id then ri.quantity end);
    end loop;

    select coalesce(jsonb_agg(jsonb_build_object('ingredient_id', i.ingredient_id, 'quantity', i.quantity, 'unit_id', i.unit_id, 'unit_quantity', i.unit_quantity) order by i.ingredient_id::text), '[]'::jsonb)
    into v_current
    from dk_recipe_items i where i.recipe_id = v_product.active_recipe_id;
    -- (ambas listas ordenadas por el id del insumo como texto, para compararlas)

    select coalesce(jsonb_agg(d order by d ->> 'ingredient_id'), '[]'::jsonb) into v_desired from jsonb_array_elements(v_desired) d;

    if jsonb_array_length(v_desired) > 0 and v_desired <> v_current then
      update dk_recipes set is_active = false where product_id = v_product.id and is_active;
      insert into dk_recipes (product_id, version, is_active, created_by)
      values (v_product.id, (select coalesce(max(version), 0) + 1 from dk_recipes where product_id = v_product.id), true, dk_current_profile_id())
      returning id into v_recipe;
      insert into dk_recipe_items (recipe_id, ingredient_id, quantity, unit_id, unit_quantity)
      select v_recipe, (d ->> 'ingredient_id')::uuid, (d ->> 'quantity')::numeric, (d ->> 'unit_id')::uuid, (d ->> 'unit_quantity')::numeric
      from jsonb_array_elements(v_desired) d;
      update dk_products set active_recipe_id = v_recipe, estimated_cost = dk_calculate_recipe_cost(v_recipe) where id = v_product.id;
    end if;
  end loop;

  perform set_config('dk.syncing_master', 'off', true);
end;
$$;
