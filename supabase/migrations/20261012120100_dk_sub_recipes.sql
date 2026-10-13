-- ADR 0057: sub-recipes as prepared ingredients, made in batches.
--
-- A preparation («Salsa de ajo») is an ingredient (dk_ingredients.is_preparation) whose recipe lives in
-- the same recipe tables as a dish's, with a yield. Preparing a batch takes its components out once
-- (PRODUCCION −) and puts the preparation in at the real cost of the batch (PRODUCCION +). Dishes carry
-- the preparation like any ingredient, so reservations, consumption, kitchen and reports do not change.

-- ---------------------------------------------------------------------------
-- 1. Permission and the «porción» unit
-- ---------------------------------------------------------------------------
insert into dk_permissions (key, module, action, scope, label, description, sort_order) values
  ('inventory.produce', 'inventory', 'produce', 'account', 'Preparar lotes',
   'Registrar y anular lotes de preparaciones (sub-recetas): descuenta sus insumos y suma lo preparado', 105)
on conflict (key) do nothing;

insert into dk_role_permissions (role_id, permission_key)
select r.id, 'inventory.produce' from dk_roles r where r.is_system and r.key in ('ADMIN', 'MANAGER', 'INVENTORY', 'KITCHEN')
on conflict do nothing;

-- Like caja: it only converts with the ingredient's own factor («1 porción = 150 g»).
insert into dk_units (code, name, unit_type, factor_to_base)
select 'porcion', 'Porción', 'UNIT', 1
where not exists (select 1 from dk_units where code = 'porcion');

create or replace function dk_unit_factor(p_ingredient_id uuid, p_unit_id uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select case
    when u.id = i.base_unit_id then 1::numeric
    when ipu.factor_to_base is not null then ipu.factor_to_base
    when u.code in ('caja', 'bolsa', 'paquete', 'porcion') or b.code in ('caja', 'bolsa', 'paquete', 'porcion') then null
    when u.unit_type = b.unit_type then u.factor_to_base / b.factor_to_base
  end
  from dk_ingredients i
  join dk_units b on b.id = i.base_unit_id
  join dk_units u on u.id = p_unit_id
  left join dk_ingredient_purchase_units ipu on ipu.ingredient_id = i.id and ipu.unit_id = u.id
  where i.id = p_ingredient_id;
$$;

-- ---------------------------------------------------------------------------
-- 2. Preparations: an ingredient flag, and recipes that belong to a dish or to a preparation
-- ---------------------------------------------------------------------------
alter table dk_ingredients add column is_preparation boolean not null default false;
comment on column dk_ingredients.is_preparation is 'ADR 0057: a sub-recipe made in batches (its recipe is in dk_recipes.ingredient_id).';

alter table dk_recipes alter column product_id drop not null;
alter table dk_recipes
  add column ingredient_id uuid,
  add column yield_quantity numeric check (yield_quantity > 0),
  add column yield_unit_id uuid references dk_units (id),
  add column yield_unit_quantity numeric check (yield_unit_quantity > 0),
  add constraint dk_recipes_owner check (num_nonnulls(product_id, ingredient_id) = 1),
  add constraint dk_recipes_preparation_yield check (ingredient_id is null or yield_quantity is not null),
  add constraint dk_recipes_ingredient_id_fkey foreign key (kitchen_id, ingredient_id) references dk_ingredients (kitchen_id, id) on delete cascade;
comment on column dk_recipes.yield_quantity is 'ADR 0057: what one batch of a preparation yields, in its base unit.';
create unique index dk_recipes_one_active_per_ingredient on dk_recipes (ingredient_id) where is_active;
create unique index dk_recipes_ingredient_version_key on dk_recipes (ingredient_id, version) where ingredient_id is not null;
create trigger dk_trg_recipes_inherit_kitchen_ingredient before insert on dk_recipes
  for each row execute function dk_inherit_kitchen_id('dk_ingredients', 'ingredient_id');

-- The flag and the base unit cannot change once the ingredient has history.
create or replace function dk_ingredients_guard_base_unit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_used boolean;
begin
  if new.base_unit_id is distinct from old.base_unit_id or new.is_preparation is distinct from old.is_preparation then
    v_used := exists (select 1 from dk_inventory_movements where ingredient_id = old.id)
      or exists (select 1 from dk_recipe_items where ingredient_id = old.id)
      or exists (select 1 from dk_recipes where ingredient_id = old.id)
      or exists (select 1 from dk_purchase_items where ingredient_id = old.id);
    if v_used and new.base_unit_id is distinct from old.base_unit_id then
      raise exception 'No se puede cambiar la unidad base de «%»: ya tiene movimientos, compras o recetas. Puedes comprar y usar otras unidades compatibles (se convierten solas).', old.name
        using hint = 'base_unit_locked';
    end if;
    if v_used then
      raise exception '«%» ya tiene movimientos, compras o recetas: no puede pasar a ser (o dejar de ser) una preparación.', old.name
        using hint = 'preparation_locked';
    end if;
  end if;
  return new;
end;
$$;

drop trigger dk_trg_ingredients_guard_base_unit on dk_ingredients;
create trigger dk_trg_ingredients_guard_base_unit before update of base_unit_id, is_preparation on dk_ingredients
  for each row execute function dk_ingredients_guard_base_unit();

-- A preparation is made, not bought (manual purchases and invoice import alike).
create or replace function dk_purchase_items_guard_preparation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_name text;
begin
  select name into v_name from dk_ingredients where id = new.ingredient_id and is_preparation;
  if found then
    raise exception '«%» es una preparación: no se compra, se prepara por lotes (Abastecimiento → Preparaciones).', v_name
      using hint = 'preparation_not_purchasable';
  end if;
  return new;
end;
$$;
create trigger dk_trg_purchase_items_guard_preparation before insert or update of ingredient_id on dk_purchase_items
  for each row execute function dk_purchase_items_guard_preparation();
revoke all on function dk_purchase_items_guard_preparation() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Batches
-- ---------------------------------------------------------------------------
alter table dk_inventory_movements drop constraint dk_movements_sign;
alter table dk_inventory_movements add constraint dk_movements_sign check (
  (movement_type in ('COMPRA', 'DEVOLUCION') and quantity_base_unit > 0)
  or (movement_type in ('MERMA', 'CONSUMO') and quantity_base_unit < 0)
  or (movement_type = 'AJUSTE')
  or (movement_type = 'PRODUCCION' and quantity_base_unit <> 0)
);

-- The header of a batch, as dk_purchases is for COMPRA: its movements point here (reference_type 'production').
create table dk_production_batches (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default dk_current_kitchen_id() references dk_kitchens (id) on delete cascade,
  ingredient_id uuid not null,
  recipe_id uuid not null,
  batches numeric not null check (batches > 0),
  expected_yield numeric not null check (expected_yield > 0),
  actual_yield numeric not null check (actual_yield > 0),
  -- What the person typed («1,2 kg»), when it was not the base unit.
  yield_unit_id uuid references dk_units (id),
  yield_unit_quantity numeric,
  total_cost numeric not null default 0 check (total_cost >= 0),
  unit_cost numeric not null default 0 check (unit_cost >= 0),
  status text not null default 'REGISTRADO' check (status in ('REGISTRADO', 'ANULADO')),
  observation text check (observation is null or char_length(observation) <= 500),
  void_reason text check (void_reason is null or char_length(void_reason) <= 500),
  created_by uuid default dk_current_profile_id() references dk_users (id) on delete set null,
  created_at timestamptz not null default now(),
  voided_by uuid references dk_users (id) on delete set null,
  voided_at timestamptz,
  constraint dk_production_batches_ingredient_id_fkey foreign key (kitchen_id, ingredient_id) references dk_ingredients (kitchen_id, id),
  constraint dk_production_batches_recipe_id_fkey foreign key (kitchen_id, recipe_id) references dk_recipes (kitchen_id, id)
);
create index dk_production_batches_ingredient_idx on dk_production_batches (ingredient_id, created_at desc);
create index dk_production_batches_kitchen_idx on dk_production_batches (kitchen_id, created_at desc);

alter table dk_production_batches enable row level security;
create policy dk_production_batches_select on dk_production_batches for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id())
         and ((select dk_can('inventory.view')) or (select dk_can('inventory.produce')) or (select dk_can('recipes.view'))));
-- Writes only through dk_register_production / dk_void_production.
revoke all on dk_production_batches from anon, authenticated;
grant select on dk_production_batches to authenticated;

create trigger dk_trg_audit_production_batches after insert or update or delete on dk_production_batches
  for each row execute function dk_audit_row();

-- ---------------------------------------------------------------------------
-- 4. Cost: a preparation without stock follows its recipe
-- ---------------------------------------------------------------------------
-- Cost of one base unit of the preparation according to its active recipe (null without a recipe).
create or replace function dk_preparation_theoretical_cost(p_ingredient_id uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select dk_calculate_recipe_cost(r.id) / r.yield_quantity
  from dk_recipes r
  where r.ingredient_id = p_ingredient_id and r.is_active;
$$;
revoke all on function dk_preparation_theoretical_cost(uuid) from public, anon;
grant execute on function dk_preparation_theoretical_cost(uuid) to authenticated, service_role;

-- With stock, avg_cost is the real cost of its batches. Without stock (never made, or used up) it follows
-- the recipe, so a dish has a cost from day one and a price change reaches it. The update fires this
-- same trigger for preparations above it, and dk_recalc_products_for_ingredient for the dishes.
create or replace function dk_preparations_follow_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.avg_cost is distinct from old.avg_cost then
    update dk_ingredients p
    set avg_cost = dk_preparation_theoretical_cost(p.id)
    where p.is_preparation
      and p.id in (select r.ingredient_id from dk_recipes r join dk_recipe_items ri on ri.recipe_id = r.id
                   where r.is_active and r.ingredient_id is not null and ri.ingredient_id = new.id)
      and coalesce((select st.stock_on_hand from dk_ingredient_stock st where st.ingredient_id = p.id), 0) <= 0
      and dk_preparation_theoretical_cost(p.id) is distinct from p.avg_cost;
  end if;
  return new;
end;
$$;
create trigger dk_trg_preparations_follow_cost after update of avg_cost on dk_ingredients
  for each row execute function dk_preparations_follow_cost();
revoke all on function dk_preparations_follow_cost() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Recipes: one way to write the lines, for dishes and preparations
-- ---------------------------------------------------------------------------
-- «1.234,5 g» style text for messages.
create or replace function dk_format_quantity(p_quantity numeric, p_unit text)
returns text
language sql
immutable
as $$
  select trim_scale(round(p_quantity, 3))::text || coalesce(' ' || p_unit, '');
$$;
revoke all on function dk_format_quantity(numeric, text) from public, anon;
grant execute on function dk_format_quantity(numeric, text) to authenticated, service_role;

-- ADR 0056: each line in the unit the person chose; stored converted to the base unit.
create or replace function dk_recipe_insert_items(p_recipe_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_ingredient uuid;
  v_unit uuid;
  v_qty numeric;
  v_factor numeric;
  v_base uuid;
begin
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_ingredient := (v_item ->> 'ingredient_id')::uuid;
    v_qty := (v_item ->> 'quantity')::numeric;
    v_unit := nullif(v_item ->> 'unit_id', '')::uuid;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Cada ingrediente necesita una cantidad mayor que cero';
    end if;
    select base_unit_id into v_base from dk_ingredients where id = v_ingredient;
    if v_unit is null or v_unit = v_base then
      insert into dk_recipe_items (recipe_id, ingredient_id, quantity) values (p_recipe_id, v_ingredient, v_qty);
    else
      v_factor := dk_unit_factor(v_ingredient, v_unit);
      if v_factor is null then
        raise exception 'No hay conversión de % a la unidad base de «%»', (select code from dk_units where id = v_unit),
          (select name from dk_ingredients where id = v_ingredient) using hint = 'no_conversion';
      end if;
      insert into dk_recipe_items (recipe_id, ingredient_id, quantity, unit_id, unit_quantity)
      values (p_recipe_id, v_ingredient, v_qty * v_factor, v_unit, v_qty);
    end if;
  end loop;
end;
$$;
revoke all on function dk_recipe_insert_items(uuid, jsonb) from public, anon, authenticated;

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

  perform dk_recipe_insert_items(v_recipe_id, p_items);

  v_cost := dk_calculate_recipe_cost(v_recipe_id);

  update dk_products
  set active_recipe_id = v_recipe_id, estimated_cost = v_cost
  where id = p_product_id;

  return v_recipe_id;
end;
$$;

-- How many recipe levels hang below an ingredient (0 = raw; a preparation of raw ingredients = 1).
create or replace function dk_preparation_height(p_ingredient_id uuid)
returns integer
language sql
stable
set search_path = public
as $$
  with recursive tree (ingredient_id, depth) as (
    select p_ingredient_id, 0
    union all
    select ri.ingredient_id, t.depth + 1
    from tree t
    join dk_recipes r on r.ingredient_id = t.ingredient_id and r.is_active
    join dk_recipe_items ri on ri.recipe_id = r.id
    where t.depth < 12
  )
  select max(depth) from tree;
$$;

-- How many preparation levels sit above it (preparations that carry it, directly or not).
create or replace function dk_preparation_ancestor_depth(p_ingredient_id uuid)
returns integer
language sql
stable
set search_path = public
as $$
  with recursive up (ingredient_id, depth) as (
    select p_ingredient_id, 0
    union all
    select r.ingredient_id, u.depth + 1
    from up u
    join dk_recipe_items ri on ri.ingredient_id = u.ingredient_id
    join dk_recipes r on r.id = ri.recipe_id and r.is_active and r.ingredient_id is not null
    where u.depth < 12
  )
  select max(depth) from up;
$$;

-- Does p_ingredient_id carry p_target somewhere below (through active recipes)?
create or replace function dk_preparation_contains(p_ingredient_id uuid, p_target uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  with recursive tree (ingredient_id, depth) as (
    select p_ingredient_id, 0
    union all
    select ri.ingredient_id, t.depth + 1
    from tree t
    join dk_recipes r on r.ingredient_id = t.ingredient_id and r.is_active
    join dk_recipe_items ri on ri.recipe_id = r.id
    where t.depth < 12
  )
  select exists (select 1 from tree where ingredient_id = p_target);
$$;
revoke all on function dk_preparation_height(uuid), dk_preparation_ancestor_depth(uuid), dk_preparation_contains(uuid, uuid) from public, anon;
grant execute on function dk_preparation_height(uuid), dk_preparation_ancestor_depth(uuid), dk_preparation_contains(uuid, uuid) to authenticated, service_role;

-- A new preparation: an ingredient flagged as such. Its recipe comes next (dk_create_preparation_version).
create or replace function dk_create_preparation(p_name text, p_base_unit_id uuid, p_code text default null, p_category_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_code text := upper(nullif(btrim(p_code), ''));
  v_n integer;
  v_id uuid;
begin
  if v_kitchen is null then
    raise exception 'No hay una cuenta activa';
  end if;
  if not (dk_can('recipes.edit') and dk_can('inventory.create')) then
    raise exception 'No autorizado para crear preparaciones';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'La preparación necesita un nombre';
  end if;
  if not exists (select 1 from dk_units where id = p_base_unit_id and code not in ('caja', 'bolsa', 'paquete', 'porcion')) then
    raise exception 'Elige la unidad base de la preparación: g, ml o unidad';
  end if;
  if v_code is null then
    select count(*) + 1 into v_n from dk_ingredients where kitchen_id = v_kitchen and is_preparation;
    loop
      v_code := 'PREP-' || lpad(v_n::text, 3, '0');
      exit when not exists (select 1 from dk_ingredients where kitchen_id = v_kitchen and code = v_code);
      v_n := v_n + 1;
    end loop;
  elsif exists (select 1 from dk_ingredients where kitchen_id = v_kitchen and code = v_code) then
    raise exception 'Ya hay un insumo con el código %', v_code;
  end if;

  insert into dk_ingredients (kitchen_id, code, name, base_unit_id, category_id, is_preparation)
  values (v_kitchen, v_code, btrim(p_name), p_base_unit_id, p_category_id, true)
  returning id into v_id;
  return v_id;
end;
$$;

-- A new version of a preparation's recipe: its lines (any compatible unit), its yield and, optionally, its portion.
--   p_portion: size of one portion (in p_portion_unit, or the base unit); 0 removes it; null leaves it as it is.
create or replace function dk_create_preparation_version(
  p_ingredient_id uuid,
  p_items jsonb,
  p_yield numeric,
  p_yield_unit_id uuid default null,
  p_portion numeric default null,
  p_portion_unit_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prep dk_ingredients;
  v_portion_unit uuid := (select id from dk_units where code = 'porcion');
  v_factor numeric;
  v_yield numeric;
  v_item jsonb;
  v_component uuid;
  v_height integer := 0;
  v_recipe_id uuid;
  v_version integer;
begin
  perform dk_assert_in_active_kitchen('dk_ingredients', p_ingredient_id);
  if not dk_can('recipes.edit') then
    raise exception 'No autorizado para modificar recetas';
  end if;
  select * into v_prep from dk_ingredients where id = p_ingredient_id;
  if not v_prep.is_preparation then
    raise exception '«%» no es una preparación', v_prep.name;
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La preparación debe tener al menos un ingrediente';
  end if;

  -- Components: same account, no cycles, at most 5 levels.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_component := (v_item ->> 'ingredient_id')::uuid;
    if not exists (select 1 from dk_ingredients where id = v_component and kitchen_id = v_prep.kitchen_id) then
      raise exception 'Un ingrediente de la receta no es de esta cuenta';
    end if;
    if v_component = p_ingredient_id or dk_preparation_contains(v_component, p_ingredient_id) then
      raise exception '«%» no puede llevar «%»: esa preparación ya lleva «%»', v_prep.name,
        (select name from dk_ingredients where id = v_component), v_prep.name using hint = 'preparation_cycle';
    end if;
    v_height := greatest(v_height, coalesce(dk_preparation_height(v_component), 0) + 1);
  end loop;
  if v_height + coalesce(dk_preparation_ancestor_depth(p_ingredient_id), 0) > 5 then
    raise exception 'Demasiados niveles: una preparación puede llevar otras hasta 5 niveles' using hint = 'preparation_depth';
  end if;

  -- The portion first, so the yield may be written in portions.
  if p_portion is not null then
    if p_portion = 0 then
      delete from dk_ingredient_purchase_units where ingredient_id = p_ingredient_id and unit_id = v_portion_unit;
    else
      v_factor := case when p_portion_unit_id is null then 1 else dk_unit_factor(p_ingredient_id, p_portion_unit_id) end;
      if v_factor is null or p_portion_unit_id = v_portion_unit then
        raise exception 'Escribe la porción en la unidad base de «%» o en una compatible', v_prep.name;
      end if;
      if p_portion < 0 then
        raise exception 'La porción debe ser mayor que cero';
      end if;
      insert into dk_ingredient_purchase_units (ingredient_id, unit_id, factor_to_base)
      values (p_ingredient_id, v_portion_unit, p_portion * v_factor)
      on conflict (ingredient_id, unit_id) do update set factor_to_base = excluded.factor_to_base;
    end if;
  end if;

  if p_yield is null or p_yield <= 0 then
    raise exception 'Escribe cuánto rinde un lote de «%»', v_prep.name;
  end if;
  v_factor := case when p_yield_unit_id is null or p_yield_unit_id = v_prep.base_unit_id then 1 else dk_unit_factor(p_ingredient_id, p_yield_unit_id) end;
  if v_factor is null then
    raise exception 'No hay conversión de % a la unidad base de «%»', (select code from dk_units where id = p_yield_unit_id), v_prep.name
      using hint = 'no_conversion';
  end if;
  v_yield := p_yield * v_factor;

  update dk_recipes set is_active = false where ingredient_id = p_ingredient_id and is_active;
  select coalesce(max(version), 0) + 1 into v_version from dk_recipes where ingredient_id = p_ingredient_id;
  insert into dk_recipes (ingredient_id, kitchen_id, version, is_active, created_by, yield_quantity, yield_unit_id, yield_unit_quantity)
  values (p_ingredient_id, v_prep.kitchen_id, v_version, true, dk_current_profile_id(), v_yield,
          case when v_factor <> 1 or (p_yield_unit_id is not null and p_yield_unit_id <> v_prep.base_unit_id) then p_yield_unit_id end,
          case when p_yield_unit_id is not null and p_yield_unit_id <> v_prep.base_unit_id then p_yield end)
  returning id into v_recipe_id;

  perform dk_recipe_insert_items(v_recipe_id, p_items);

  -- Without stock, its cost follows the new recipe (D6).
  if coalesce((select stock_on_hand from dk_ingredient_stock where ingredient_id = p_ingredient_id), 0) <= 0 then
    update dk_ingredients set avg_cost = coalesce(dk_preparation_theoretical_cost(p_ingredient_id), 0)
    where id = p_ingredient_id and avg_cost is distinct from coalesce(dk_preparation_theoretical_cost(p_ingredient_id), 0);
  end if;
  return v_recipe_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Preparing a batch, and voiding it
-- ---------------------------------------------------------------------------
create or replace function dk_register_production(
  p_ingredient_id uuid,
  p_batches numeric default 1,
  p_actual_yield numeric default null,
  p_yield_unit_id uuid default null,
  p_observation text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prep dk_ingredients;
  v_recipe dk_recipes;
  v_factor numeric;
  v_expected numeric;
  v_actual numeric;
  v_line record;
  v_available numeric;
  v_total numeric := 0;
  v_unit_cost numeric;
  v_batch uuid;
  v_stock_before numeric;
  v_base_code text;
begin
  perform dk_assert_in_active_kitchen('dk_ingredients', p_ingredient_id);
  if not dk_can('inventory.produce') then
    raise exception 'No autorizado para preparar lotes';
  end if;
  select * into v_prep from dk_ingredients where id = p_ingredient_id;
  if not v_prep.is_preparation then
    raise exception '«%» no es una preparación', v_prep.name;
  end if;
  if not v_prep.active then
    raise exception '«%» está desactivada', v_prep.name;
  end if;
  select * into v_recipe from dk_recipes where ingredient_id = p_ingredient_id and is_active;
  if not found then
    raise exception '«%» todavía no tiene receta', v_prep.name using hint = 'no_recipe';
  end if;
  if p_batches is null or p_batches <= 0 then
    raise exception 'El número de lotes debe ser mayor que cero';
  end if;
  select code into v_base_code from dk_units where id = v_prep.base_unit_id;

  v_expected := v_recipe.yield_quantity * p_batches;
  if p_actual_yield is null then
    v_actual := v_expected;
  else
    v_factor := case when p_yield_unit_id is null or p_yield_unit_id = v_prep.base_unit_id then 1 else dk_unit_factor(p_ingredient_id, p_yield_unit_id) end;
    if v_factor is null then
      raise exception 'No hay conversión de % a la unidad base de «%»', (select code from dk_units where id = p_yield_unit_id), v_prep.name
        using hint = 'no_conversion';
    end if;
    v_actual := p_actual_yield * v_factor;
  end if;
  if v_actual <= 0 then
    raise exception 'El rendimiento real debe ser mayor que cero';
  end if;

  -- What goes out: every component, with what is available now (reservations of confirmed orders count).
  for v_line in
    select ri.ingredient_id, i.name, u.code as unit_code, i.avg_cost, sum(ri.quantity) * p_batches as needed
    from dk_recipe_items ri
    join dk_ingredients i on i.id = ri.ingredient_id
    join dk_units u on u.id = i.base_unit_id
    where ri.recipe_id = v_recipe.id
    group by ri.ingredient_id, i.name, u.code, i.avg_cost
    order by ri.ingredient_id
  loop
    select stock_available into v_available from dk_ingredient_stock where ingredient_id = v_line.ingredient_id for update;
    if coalesce(v_available, 0) < v_line.needed then
      raise exception 'Falta «%» para preparar «%»: hay %, se necesitan %', v_line.name, v_prep.name,
        dk_format_quantity(coalesce(v_available, 0), v_line.unit_code), dk_format_quantity(v_line.needed, v_line.unit_code)
        using hint = 'insufficient_stock';
    end if;
    v_total := v_total + v_line.needed * v_line.avg_cost;
  end loop;
  v_unit_cost := v_total / v_actual;

  insert into dk_production_batches (kitchen_id, ingredient_id, recipe_id, batches, expected_yield, actual_yield,
                                     yield_unit_id, yield_unit_quantity, total_cost, unit_cost, observation)
  values (v_prep.kitchen_id, p_ingredient_id, v_recipe.id, p_batches, v_expected, v_actual,
          case when p_actual_yield is not null and p_yield_unit_id is not null and p_yield_unit_id <> v_prep.base_unit_id then p_yield_unit_id end,
          case when p_actual_yield is not null and p_yield_unit_id is not null and p_yield_unit_id <> v_prep.base_unit_id then p_actual_yield end,
          v_total, v_unit_cost, nullif(btrim(p_observation), ''))
  returning id into v_batch;

  insert into dk_inventory_movements (ingredient_id, kitchen_id, movement_type, quantity_base_unit, unit_cost, reference_type, reference_id, observation, created_by)
  select ri.ingredient_id, v_prep.kitchen_id, 'PRODUCCION', -sum(ri.quantity) * p_batches, i.avg_cost, 'production', v_batch,
         'Lote de «' || v_prep.name || '»', dk_current_profile_id()
  from dk_recipe_items ri join dk_ingredients i on i.id = ri.ingredient_id
  where ri.recipe_id = v_recipe.id
  group by ri.ingredient_id, i.avg_cost;

  select coalesce(stock_on_hand, 0) into v_stock_before from dk_ingredient_stock where ingredient_id = p_ingredient_id for update;
  v_stock_before := greatest(coalesce(v_stock_before, 0), 0);

  insert into dk_inventory_movements (ingredient_id, kitchen_id, movement_type, quantity_base_unit, unit_cost, reference_type, reference_id, observation, created_by)
  values (p_ingredient_id, v_prep.kitchen_id, 'PRODUCCION', v_actual, v_unit_cost, 'production', v_batch,
          'Lote preparado: rinde ' || dk_format_quantity(v_actual, v_base_code) || ' (esperado ' || dk_format_quantity(v_expected, v_base_code) || ')',
          dk_current_profile_id());

  update dk_ingredients
  set avg_cost = case when v_stock_before <= 0 then v_unit_cost
                      else (v_stock_before * avg_cost + v_actual * v_unit_cost) / (v_stock_before + v_actual) end
  where id = p_ingredient_id;

  return jsonb_build_object('batchId', v_batch, 'expectedYield', v_expected, 'actualYield', v_actual,
                            'totalCost', round(v_total, 2), 'unitCost', v_unit_cost, 'unitCode', v_base_code);
end;
$$;

create or replace function dk_void_production(p_batch_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch dk_production_batches;
  v_prep dk_ingredients;
  v_available numeric;
  v_on_hand numeric;
  v_line record;
  v_stock numeric;
  v_base_code text;
begin
  perform dk_assert_in_active_kitchen('dk_production_batches', p_batch_id);
  if not dk_can('inventory.produce') then
    raise exception 'No autorizado para anular lotes';
  end if;
  select * into v_batch from dk_production_batches where id = p_batch_id for update;
  if v_batch.status <> 'REGISTRADO' then
    raise exception 'Este lote ya está anulado';
  end if;
  select * into v_prep from dk_ingredients where id = v_batch.ingredient_id;
  select code into v_base_code from dk_units where id = v_prep.base_unit_id;

  select stock_available, stock_on_hand into v_available, v_on_hand from dk_ingredient_stock where ingredient_id = v_prep.id for update;
  if coalesce(v_available, 0) < v_batch.actual_yield then
    raise exception 'No se puede anular: de «%» quedan % disponibles y el lote fue de %. Si ya se usó, registra una merma o un ajuste.',
      v_prep.name, dk_format_quantity(coalesce(v_available, 0), v_base_code), dk_format_quantity(v_batch.actual_yield, v_base_code)
      using hint = 'batch_already_used';
  end if;

  -- The preparation goes back out, at the cost it came in with.
  insert into dk_inventory_movements (ingredient_id, kitchen_id, movement_type, quantity_base_unit, unit_cost, reference_type, reference_id, observation, created_by)
  values (v_prep.id, v_batch.kitchen_id, 'PRODUCCION', -v_batch.actual_yield, v_batch.unit_cost, 'production_void', v_batch.id,
          'Lote anulado' || coalesce(': ' || nullif(btrim(p_reason), ''), ''), dk_current_profile_id());
  update dk_ingredients
  set avg_cost = case
      when v_on_hand - v_batch.actual_yield > 0
           and (v_on_hand * avg_cost - v_batch.actual_yield * v_batch.unit_cost) / (v_on_hand - v_batch.actual_yield) >= 0
        then (v_on_hand * avg_cost - v_batch.actual_yield * v_batch.unit_cost) / (v_on_hand - v_batch.actual_yield)
      when v_on_hand - v_batch.actual_yield <= 0 then coalesce(dk_preparation_theoretical_cost(id), avg_cost)
      else avg_cost end
  where id = v_prep.id;

  -- Its components come back, each at the cost it went out with.
  for v_line in
    select m.ingredient_id, -m.quantity_base_unit as qty, m.unit_cost
    from dk_inventory_movements m
    where m.reference_type = 'production' and m.reference_id = v_batch.id and m.ingredient_id <> v_prep.id
    order by m.ingredient_id
  loop
    select greatest(coalesce(stock_on_hand, 0), 0) into v_stock from dk_ingredient_stock where ingredient_id = v_line.ingredient_id for update;
    v_stock := coalesce(v_stock, 0);
    insert into dk_inventory_movements (ingredient_id, kitchen_id, movement_type, quantity_base_unit, unit_cost, reference_type, reference_id, observation, created_by)
    values (v_line.ingredient_id, v_batch.kitchen_id, 'PRODUCCION', v_line.qty, v_line.unit_cost, 'production_void', v_batch.id,
            'Vuelve del lote anulado de «' || v_prep.name || '»', dk_current_profile_id());
    update dk_ingredients
    set avg_cost = case when v_stock <= 0 then coalesce(v_line.unit_cost, avg_cost)
                        else (v_stock * avg_cost + v_line.qty * coalesce(v_line.unit_cost, avg_cost)) / (v_stock + v_line.qty) end
    where id = v_line.ingredient_id;
  end loop;

  update dk_production_batches
  set status = 'ANULADO', void_reason = nullif(btrim(p_reason), ''), voided_by = dk_current_profile_id(), voided_at = now()
  where id = v_batch.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Reading: list, detail, dependencies
-- ---------------------------------------------------------------------------
create or replace function dk_preparations_can_read()
returns boolean
language sql
stable
set search_path = public
as $$
  select dk_can('inventory.view') or dk_can('inventory.produce') or dk_can('recipes.view');
$$;

-- Where an ingredient is used: dishes (directly or through preparations) and preparations that carry it.
create or replace function dk_ingredient_usage(p_ingredient_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform dk_assert_in_active_kitchen('dk_ingredients', p_ingredient_id);
  if not dk_preparations_can_read() then
    raise exception 'No autorizado';
  end if;
  return (
    with recursive up (ingredient_id, via, depth) as (
      select p_ingredient_id, null::uuid, 0
      union all
      select r.ingredient_id, coalesce(u.via, r.ingredient_id), u.depth + 1
      from up u
      join dk_recipe_items ri on ri.ingredient_id = u.ingredient_id
      join dk_recipes r on r.id = ri.recipe_id and r.is_active and r.ingredient_id is not null
      where u.depth < 12
    )
    select jsonb_build_object(
      'preparations', coalesce((
        select jsonb_agg(jsonb_build_object('ingredientId', i.id, 'name', i.name, 'quantity', ri.quantity, 'direct', true) order by i.name)
        from dk_recipes r
        join dk_recipe_items ri on ri.recipe_id = r.id
        join dk_ingredients i on i.id = r.ingredient_id
        where r.is_active and ri.ingredient_id = p_ingredient_id), '[]'::jsonb),
      'dishes', coalesce((
        select jsonb_agg(d order by d ->> 'name')
        from (
          select distinct on (p.id) jsonb_build_object('productId', p.id, 'name', p.name, 'active', p.active,
                   'quantity', case when u.depth = 0 then ri.quantity end,
                   'via', case when u.depth > 0 then (select name from dk_ingredients where id = u.ingredient_id) end) as d
          from up u
          join dk_recipe_items ri on ri.ingredient_id = u.ingredient_id
          join dk_products p on p.active_recipe_id = ri.recipe_id
          order by p.id, u.depth
        ) x), '[]'::jsonb)
    )
  );
end;
$$;

-- The components of a preparation, all the way down (per batch of each level).
create or replace function dk_preparation_tree(p_ingredient_id uuid, p_depth integer default 0)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
begin
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'ingredientId', i.id, 'name', i.name, 'quantity', ri.quantity, 'unitCode', u.code, 'isPreparation', i.is_preparation,
      'children', case when i.is_preparation and p_depth < 6 then dk_preparation_tree(i.id, p_depth + 1) else '[]'::jsonb end)
      order by i.name), '[]'::jsonb)
    from dk_recipes r
    join dk_recipe_items ri on ri.recipe_id = r.id
    join dk_ingredients i on i.id = ri.ingredient_id
    join dk_units u on u.id = i.base_unit_id
    where r.ingredient_id = p_ingredient_id and r.is_active
  );
end;
$$;

create or replace function dk_preparation_json(p_ingredient_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', i.id, 'code', i.code, 'name', i.name, 'active', i.active,
    'baseUnitId', i.base_unit_id, 'baseUnitCode', b.code,
    'stockOnHand', coalesce(st.stock_on_hand, 0), 'stockAvailable', coalesce(st.stock_available, 0),
    'minStock', i.min_stock, 'belowMin', i.min_stock > 0 and coalesce(st.stock_available, 0) <= i.min_stock,
    'avgCost', i.avg_cost,
    'theoreticalUnitCost', dk_preparation_theoretical_cost(i.id),
    'portion', (select ipu.factor_to_base from dk_ingredient_purchase_units ipu join dk_units pu on pu.id = ipu.unit_id
                where ipu.ingredient_id = i.id and pu.code = 'porcion'),
    'recipe', (select jsonb_build_object('id', r.id, 'version', r.version, 'yieldQuantity', r.yield_quantity,
                                         'yieldUnitCode', yu.code, 'yieldUnitQuantity', r.yield_unit_quantity, 'createdAt', r.created_at)
               from dk_recipes r left join dk_units yu on yu.id = r.yield_unit_id
               where r.ingredient_id = i.id and r.is_active),
    'usedIn', (select count(distinct ri.recipe_id) from dk_recipe_items ri join dk_recipes r on r.id = ri.recipe_id and r.is_active
               left join dk_products p on p.active_recipe_id = r.id
               where ri.ingredient_id = i.id and (r.ingredient_id is not null or p.id is not null)),
    'lastBatchAt', (select max(created_at) from dk_production_batches pb where pb.ingredient_id = i.id and pb.status = 'REGISTRADO')
  )
  from dk_ingredients i
  join dk_units b on b.id = i.base_unit_id
  left join dk_ingredient_stock st on st.ingredient_id = i.id
  where i.id = p_ingredient_id;
$$;
revoke all on function dk_preparation_json(uuid) from public, anon, authenticated;

create or replace function dk_preparation_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if dk_current_kitchen_id() is null or not dk_preparations_can_read() then
    raise exception 'No autorizado';
  end if;
  return (
    select coalesce(jsonb_agg(dk_preparation_json(i.id) order by i.active desc, i.name), '[]'::jsonb)
    from dk_ingredients i
    where i.kitchen_id = dk_current_kitchen_id() and i.is_preparation
  );
end;
$$;

create or replace function dk_preparation_detail(p_ingredient_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_recipe uuid;
begin
  perform dk_assert_in_active_kitchen('dk_ingredients', p_ingredient_id);
  if not dk_preparations_can_read() then
    raise exception 'No autorizado';
  end if;
  if not exists (select 1 from dk_ingredients where id = p_ingredient_id and is_preparation) then
    raise exception 'No es una preparación';
  end if;
  select id into v_recipe from dk_recipes where ingredient_id = p_ingredient_id and is_active;
  return dk_preparation_json(p_ingredient_id) || jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ingredientId', i.id, 'code', i.code, 'name', i.name, 'isPreparation', i.is_preparation,
        'quantity', ri.quantity, 'unitCode', u.code, 'enteredUnitId', ri.unit_id, 'enteredUnitCode', eu.code, 'enteredQuantity', ri.unit_quantity,
        'avgCost', i.avg_cost, 'lineCost', ri.quantity * i.avg_cost, 'stockAvailable', coalesce(st.stock_available, 0))
        order by ri.created_at, i.name)
      from dk_recipe_items ri
      join dk_ingredients i on i.id = ri.ingredient_id
      join dk_units u on u.id = i.base_unit_id
      left join dk_units eu on eu.id = ri.unit_id
      left join dk_ingredient_stock st on st.ingredient_id = i.id
      where ri.recipe_id = v_recipe), '[]'::jsonb),
    'tree', dk_preparation_tree(p_ingredient_id),
    'usage', dk_ingredient_usage(p_ingredient_id),
    'batches', coalesce((
      select jsonb_agg(b order by b ->> 'createdAt' desc)
      from (
        select jsonb_build_object(
          'id', pb.id, 'createdAt', pb.created_at, 'createdBy', cu.full_name, 'batches', pb.batches,
          'recipeVersion', r.version, 'expectedYield', pb.expected_yield, 'actualYield', pb.actual_yield,
          'yieldUnitCode', yu.code, 'yieldUnitQuantity', pb.yield_unit_quantity,
          'variancePct', round((pb.actual_yield - pb.expected_yield) / pb.expected_yield * 100, 1),
          'totalCost', pb.total_cost, 'unitCost', pb.unit_cost, 'status', pb.status, 'observation', pb.observation,
          'voidReason', pb.void_reason, 'voidedAt', pb.voided_at,
          'components', (select coalesce(jsonb_agg(jsonb_build_object('name', ci.name, 'quantity', -m.quantity_base_unit,
                                                                     'unitCode', cu2.code, 'unitCost', m.unit_cost) order by ci.name), '[]'::jsonb)
                         from dk_inventory_movements m
                         join dk_ingredients ci on ci.id = m.ingredient_id
                         join dk_units cu2 on cu2.id = ci.base_unit_id
                         where m.reference_type = 'production' and m.reference_id = pb.id and m.ingredient_id <> pb.ingredient_id)) as b
        from dk_production_batches pb
        join dk_recipes r on r.id = pb.recipe_id
        left join dk_users cu on cu.id = pb.created_by
        left join dk_units yu on yu.id = pb.yield_unit_id
        where pb.ingredient_id = p_ingredient_id
        order by pb.created_at desc
        limit 30
      ) x), '[]'::jsonb)
  );
end;
$$;

revoke all on function dk_create_preparation(text, uuid, text, uuid), dk_create_preparation_version(uuid, jsonb, numeric, uuid, numeric, uuid),
  dk_register_production(uuid, numeric, numeric, uuid, text), dk_void_production(uuid, text),
  dk_preparations_can_read(), dk_ingredient_usage(uuid), dk_preparation_tree(uuid, integer),
  dk_preparation_list(), dk_preparation_detail(uuid) from public, anon;
grant execute on function dk_create_preparation(text, uuid, text, uuid), dk_create_preparation_version(uuid, jsonb, numeric, uuid, numeric, uuid),
  dk_register_production(uuid, numeric, numeric, uuid, text), dk_void_production(uuid, text),
  dk_preparations_can_read(), dk_ingredient_usage(uuid), dk_preparation_tree(uuid, integer),
  dk_preparation_list(), dk_preparation_detail(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Orders: a missing preparation says so by name
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

  for v_req in
    select ri.ingredient_id, i.name, i.is_preparation, u.code as unit_code, sum(ri.quantity * oi.quantity) as required
    from dk_order_items oi
    join dk_recipe_items ri on ri.recipe_id = oi.recipe_id
    join dk_ingredients i on i.id = ri.ingredient_id
    join dk_units u on u.id = i.base_unit_id
    where oi.order_id = p_order_id
    group by ri.ingredient_id, i.name, i.is_preparation, u.code
    order by ri.ingredient_id
  loop
    select stock_available into v_available from dk_ingredient_stock where ingredient_id = v_req.ingredient_id for update;
    if coalesce(v_available, 0) < v_req.required then
      -- ADR 0057: the ingredient by name (it used to be its id); a preparation asks for a batch.
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
revoke all on function dk_confirm_order_internal(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Rhythm of consumption: what goes into batches counts; preparations are not bought
-- ---------------------------------------------------------------------------
create or replace view dk_supply_suggestions with (security_invoker = true) as
  with outflow as (
    -- ADR 0057: what goes into a batch is consumption of the component (a voided batch gives it back).
    select m.ingredient_id,
      sum(case when m.movement_type = 'CONSUMO'::dk_movement_type then - m.quantity_base_unit
               when m.movement_type = 'PRODUCCION'::dk_movement_type and pb.id is not null and m.ingredient_id <> pb.ingredient_id then - m.quantity_base_unit
               else 0::numeric end) as consumed_30d,
      sum(case when m.movement_type = 'MERMA'::dk_movement_type then - m.quantity_base_unit else 0::numeric end) as wasted_30d
    from dk_inventory_movements m
    left join dk_production_batches pb on pb.id = m.reference_id and m.reference_type in ('production', 'production_void')
    where m.created_at >= (now() - '30 days'::interval)
      and m.kitchen_id = dk_current_kitchen_id()
    group by m.ingredient_id
  )
  select i.id as ingredient_id,
    i.code,
    i.name,
    u.code as base_unit_code,
    i.primary_supplier_id,
    s.name as supplier_name,
    coalesce(st.stock_available, 0::numeric) as stock_available,
    i.min_stock,
    i.max_stock,
    i.avg_cost,
    coalesce(o.consumed_30d, 0::numeric) as consumed_30d,
    coalesce(o.wasted_30d, 0::numeric) as wasted_30d,
    round(coalesce(o.consumed_30d, 0::numeric) / 30.0, 4) as daily_burn,
    case
      when coalesce(o.consumed_30d, 0::numeric) > 0::numeric then round(coalesce(st.stock_available, 0::numeric) / (o.consumed_30d / 30.0), 1)
      else null::numeric
    end as coverage_days,
    coalesce(st.stock_available, 0::numeric) <= i.min_stock as below_min,
    greatest(0::numeric, coalesce(i.max_stock, i.min_stock * 2::numeric) - coalesce(st.stock_available, 0::numeric)) as suggested_quantity,
    -- ADR 0057: for a preparation, suggested_quantity is what to prepare, not to buy.
    i.is_preparation
  from dk_ingredients i
    join dk_units u on u.id = i.base_unit_id
    left join dk_ingredient_stock st on st.ingredient_id = i.id
    left join dk_suppliers s on s.id = i.primary_supplier_id
    left join outflow o on o.ingredient_id = i.id
  where i.active
    and i.kitchen_id = dk_current_kitchen_id()
    and dk_can('inventory.view');

create or replace function dk_inventory_signals(
  p_coverage_days numeric default 7,
  p_warning_days integer default 2,
  p_slow_days integer default 21,
  p_overstock_days integer default 60
)
returns table (
  ingredient_id uuid,
  code text,
  name text,
  base_unit_code text,
  primary_supplier_id uuid,
  supplier_name text,
  stock_on_hand numeric,
  stock_available numeric,
  min_stock numeric,
  max_stock numeric,
  avg_cost numeric,
  stock_value numeric,
  consumed_30d numeric,
  consumed_7d numeric,
  wasted_30d numeric,
  daily_burn numeric,
  daily_burn_7d numeric,
  coverage_days numeric,
  below_min boolean,
  suggested_quantity numeric,
  last_consumed_at timestamptz,
  days_since_consumption integer,
  perishable boolean,
  shelf_life_days integer,
  oldest_stock_at timestamptz,
  oldest_stock_qty numeric,
  est_days_to_expiry numeric,
  projected_waste_qty numeric,
  needs_reorder boolean,
  perishable_risk boolean,
  slow_mover boolean,
  overstock boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with consumption as (
    -- ADR 0057: what goes into a batch is consumption of the component (a voided batch gives it back).
    select m.ingredient_id, m.created_at, -m.quantity_base_unit as qty
    from dk_inventory_movements m
    left join dk_production_batches pb on pb.id = m.reference_id and m.reference_type in ('production', 'production_void')
    where m.movement_type = 'CONSUMO'
       or (m.movement_type = 'PRODUCCION' and pb.id is not null and m.ingredient_id <> pb.ingredient_id)
  ),
  recent as (
    select c.ingredient_id,
      coalesce(sum(c.qty) filter (where c.created_at >= now() - interval '7 days'), 0) as consumed_7d,
      max(c.created_at) as last_consumed_at
    from consumption c
    group by c.ingredient_id
  ),
  entries as (
    select m.ingredient_id, m.created_at, m.quantity_base_unit as qty,
      sum(m.quantity_base_unit) over (partition by m.ingredient_id order by m.created_at desc, m.id) as cum
    from dk_inventory_movements m
    where (m.movement_type in ('COMPRA', 'AJUSTE') and m.quantity_base_unit > 0)
       or (m.movement_type = 'PRODUCCION' and m.reference_type = 'production' and m.quantity_base_unit > 0)
  ),
  oldest as (
    select distinct on (e.ingredient_id)
      e.ingredient_id,
      e.created_at as oldest_stock_at,
      least(e.qty, st.stock_on_hand - (e.cum - e.qty)) as oldest_stock_qty
    from entries e
    join dk_ingredient_stock st on st.ingredient_id = e.ingredient_id
    where st.stock_on_hand > 0 and e.cum - e.qty < st.stock_on_hand
    order by e.ingredient_id, e.created_at asc
  ),
  facts as (
    select
      s.*,
      coalesce(st.stock_on_hand, 0) as on_hand,
      coalesce(r.consumed_7d, 0) as c7,
      r.last_consumed_at as last_c,
      i.perishable as is_perishable,
      i.shelf_life_days as life,
      o.oldest_stock_at as oldest_at,
      o.oldest_stock_qty as oldest_qty,
      case
        when i.perishable and i.shelf_life_days is not null and o.oldest_stock_at is not null
          then round(i.shelf_life_days - extract(epoch from now() - o.oldest_stock_at) / 86400.0, 1)
      end as days_left
    from dk_supply_suggestions s
    join dk_ingredients i on i.id = s.ingredient_id
    left join dk_ingredient_stock st on st.ingredient_id = s.ingredient_id
    left join recent r on r.ingredient_id = s.ingredient_id
    left join oldest o on o.ingredient_id = s.ingredient_id
  )
  select
    f.ingredient_id, f.code, f.name, f.base_unit_code, f.primary_supplier_id, f.supplier_name,
    f.on_hand, f.stock_available, f.min_stock, f.max_stock, f.avg_cost,
    round(f.on_hand * coalesce(f.avg_cost, 0), 2),
    f.consumed_30d, f.c7, f.wasted_30d, f.daily_burn, round(f.c7 / 7.0, 4), f.coverage_days,
    f.below_min, f.suggested_quantity,
    f.last_c,
    case when f.last_c is not null then floor(extract(epoch from now() - f.last_c) / 86400.0)::integer end,
    f.is_perishable, f.life, f.oldest_at, f.oldest_qty, f.days_left,
    case
      when f.days_left is not null
        then round(greatest(0, f.oldest_qty - f.daily_burn * greatest(f.days_left, 0)), 3)
    end,
    f.below_min or (f.coverage_days is not null and f.coverage_days < p_coverage_days),
    f.days_left is not null and (
      f.days_left <= p_warning_days or f.oldest_qty - f.daily_burn * greatest(f.days_left, 0) > 0
    ),
    f.on_hand > 0
      and coalesce(f.oldest_at < now() - make_interval(days => p_slow_days), false)
      and (f.last_c is null or f.last_c < now() - make_interval(days => p_slow_days)),
    coalesce(f.coverage_days > p_overstock_days, false)
  from facts f;
$$;

create or replace function dk_copilot_ingredients(p_search text default null, p_only_low boolean default false, p_limit integer default 20)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_products boolean := dk_can('products.view');
begin
  perform dk_require('inventory.view');
  return (
    select jsonb_build_object('ingredients', coalesce(jsonb_agg(x), '[]'))
    from (
      select jsonb_build_object(
        'id', s.ingredient_id, 'name', s.name, 'unit', s.base_unit_code,
        'stockAvailable', round(s.stock_available, 2), 'minStock', s.min_stock, 'belowMin', s.below_min,
        'coverageDays', round(s.coverage_days, 1), 'dailyBurn', round(s.daily_burn, 2),
        'consumed30d', round(s.consumed_30d, 2), 'wasted30d', round(s.wasted_30d, 2),
        -- ADR 0057: a preparation is prepared in batches, never bought.
        'isPreparation', s.is_preparation,
        'suggestedPurchase', case when not s.is_preparation then round(s.suggested_quantity, 2) end,
        'suggestedToPrepare', case when s.is_preparation then round(s.suggested_quantity, 2) end,
        'supplier', s.supplier_name, 'avgCost', s.avg_cost,
        'usedIn', case when v_products then (
          select coalesce(jsonb_agg(distinct coalesce(p.name, pi.name)), '[]')
          from dk_recipe_items ri
          join dk_recipes r on r.id = ri.recipe_id and r.is_active
          left join dk_products p on p.active_recipe_id = ri.recipe_id and p.active
          left join dk_ingredients pi on pi.id = r.ingredient_id
          where ri.ingredient_id = s.ingredient_id and (p.id is not null or pi.id is not null)) end) x
      from dk_supply_suggestions s
      where (p_search is null or s.name ilike '%' || p_search || '%')
        and (not coalesce(p_only_low, false) or s.below_min or s.coverage_days < 3)
      order by s.below_min desc, s.coverage_days nulls last, s.name
      limit v_limit) t);
end;
$$;
