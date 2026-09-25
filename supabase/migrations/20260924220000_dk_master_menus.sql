-- Multi-Cocina — Menús maestros compartidos (ADR 0007, sección 15; decisiones 2026-09-24).
--
-- El superusuario crea menús (platos + receta) a nivel plataforma y decide
-- con qué Cocinas compartirlos. Cada Cocina recibe una COPIA sincronizada en
-- sus propias tablas (dk_products, dk_recipes…): su inventario, costos y
-- pedidos siguen aislados por Cocina y la RLS no cambia.
--
--   * Contenido: nombre, código, categoría, descripción, precio y receta.
--     Los insumos de la receta se vinculan por CÓDIGO con el inventario de
--     cada Cocina; si faltan, se crean (con stock 0).
--   * La Cocina puede ajustar el PRECIO (queda "precio propio"; puede volver
--     al del maestro) y la DISPONIBILIDAD (su planificador de menús). Lo demás
--     lo fija la base.
--   * Los cambios del maestro se aplican solos a todas las Cocinas asignadas.
--   * Al dejar de compartir (o borrar un plato del maestro), las copias se
--     desactivan y quedan como platos locales: el historial de pedidos no se pierde.

-- ---------------------------------------------------------------------------
-- Tablas de plataforma
-- ---------------------------------------------------------------------------

create table dk_master_menus (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 2 and 80),
  description text,
  active boolean not null default true,
  created_by uuid references dk_users (id) default dk_current_profile_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table dk_master_products (
  id uuid primary key default gen_random_uuid(),
  master_menu_id uuid not null references dk_master_menus (id) on delete cascade,
  code text not null check (code ~ '^[A-Za-z0-9_-]{1,30}$'),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text,
  category_name text,
  price numeric not null check (price >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (master_menu_id, code)
);

create table dk_master_recipe_items (
  id uuid primary key default gen_random_uuid(),
  master_product_id uuid not null references dk_master_products (id) on delete cascade,
  ingredient_code text not null check (ingredient_code ~ '^[A-Za-z0-9_-]{1,30}$'),
  ingredient_name text not null,
  unit_code text not null references dk_units (code),
  quantity numeric not null check (quantity > 0),
  unique (master_product_id, ingredient_code)
);

create table dk_master_menu_kitchens (
  master_menu_id uuid not null references dk_master_menus (id) on delete cascade,
  kitchen_id uuid not null references dk_kitchens (id) on delete cascade,
  assigned_by uuid references dk_users (id) default dk_current_profile_id(),
  assigned_at timestamptz not null default now(),
  primary key (master_menu_id, kitchen_id)
);

comment on table dk_master_menus is 'Menús maestros de la plataforma (superusuario). Se comparten con Cocinas como copias sincronizadas en dk_products/dk_recipes.';

create trigger dk_trg_master_menus_updated_at before update on dk_master_menus for each row execute function dk_set_updated_at();
create trigger dk_trg_master_products_updated_at before update on dk_master_products for each row execute function dk_set_updated_at();
create trigger dk_trg_audit_master_menus after insert or update or delete on dk_master_menus for each row execute function dk_audit_row();
create trigger dk_trg_audit_master_products after insert or update or delete on dk_master_products for each row execute function dk_audit_row();
create trigger dk_trg_audit_master_menu_kitchens after insert or update or delete on dk_master_menu_kitchens for each row execute function dk_audit_row();

alter table dk_master_menus enable row level security;
alter table dk_master_products enable row level security;
alter table dk_master_recipe_items enable row level security;
alter table dk_master_menu_kitchens enable row level security;

create policy dk_master_menus_superadmin on dk_master_menus for all to authenticated
  using ((select dk_is_superadmin())) with check ((select dk_is_superadmin()));
create policy dk_master_products_superadmin on dk_master_products for all to authenticated
  using ((select dk_is_superadmin())) with check ((select dk_is_superadmin()));
create policy dk_master_recipe_items_superadmin on dk_master_recipe_items for all to authenticated
  using ((select dk_is_superadmin())) with check ((select dk_is_superadmin()));
-- Las asignaciones las ve también el equipo de la Cocina (para mostrar de qué menú viene un plato).
create policy dk_master_menu_kitchens_select on dk_master_menu_kitchens for select to authenticated
  using ((select dk_is_superadmin()) or dk_is_kitchen_member(kitchen_id));

-- ---------------------------------------------------------------------------
-- Copias en la Cocina
-- ---------------------------------------------------------------------------

alter table dk_products add column master_product_id uuid references dk_master_products (id) on delete set null;
alter table dk_products add column price_is_local boolean not null default false;
create unique index dk_products_kitchen_master_uniq on dk_products (kitchen_id, master_product_id) where master_product_id is not null;
comment on column dk_products.master_product_id is 'Plato copiado de un menú maestro (sincronizado). La Cocina solo ajusta precio y disponibilidad.';
comment on column dk_products.price_is_local is 'true = la Cocina fijó su propio precio; la sincronización no lo pisa.';

-- La sincronización marca la transacción para que las protecciones la dejen pasar.
create or replace function dk_is_syncing_master()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('dk.syncing_master', true), '') = 'on';
$$;

-- Un plato compartido: la Cocina solo cambia el precio (queda como propio) o vuelve al del maestro.
-- SECURITY DEFINER: al volver al precio del maestro lee dk_master_products,
-- que solo ve el superusuario.
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

create trigger dk_trg_products_guard_master before update on dk_products
  for each row execute function dk_guard_master_product();

create or replace function dk_guard_master_recipe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not dk_is_syncing_master() and exists (select 1 from dk_products where id = new.product_id and master_product_id is not null) then
    raise exception 'La receta de este plato la define su menú maestro';
  end if;
  return new;
end;
$$;

create trigger dk_trg_recipes_guard_master before insert on dk_recipes
  for each row execute function dk_guard_master_recipe();

-- ---------------------------------------------------------------------------
-- Sincronización maestro → Cocina
-- ---------------------------------------------------------------------------

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
      insert into dk_products (kitchen_id, code, name, description, category_id, price, active, master_product_id)
      values (
        p_kitchen_id,
        -- Si la Cocina ya usa ese código en un plato propio, la copia queda sin código (no se pisa lo local).
        case when exists (select 1 from dk_products where kitchen_id = p_kitchen_id and code = mp.code) then null else mp.code end,
        mp.name, mp.description, v_category, mp.price, mp.active and v_menu_active, mp.id
      )
      returning * into v_product;
    else
      update dk_products
      set name = mp.name,
          description = mp.description,
          category_id = v_category,
          price = case when price_is_local then price else mp.price end,
          active = mp.active and v_menu_active
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

-- Deja de compartir: las copias quedan como platos locales desactivados.
create or replace function dk_detach_master_copies(p_master_product_ids uuid[], p_kitchen_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('dk.syncing_master', 'on', true);
  update dk_products set active = false, master_product_id = null, price_is_local = false
  where master_product_id = any (p_master_product_ids) and (p_kitchen_id is null or kitchen_id = p_kitchen_id);
  perform set_config('dk.syncing_master', 'off', true);
end;
$$;

-- Cambios del maestro → se aplican solos (salvo durante un guardado en bloque, que sincroniza al final).
create or replace function dk_master_autosync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_menu uuid;
  v_kitchen uuid;
begin
  if coalesce(current_setting('dk.master_batch', true), '') = 'on' then
    return null;
  end if;
  if tg_table_name = 'dk_master_menus' then
    v_menu := coalesce(new.id, old.id);
  elsif tg_table_name = 'dk_master_products' then
    v_menu := coalesce(new.master_menu_id, old.master_menu_id);
  else
    select master_menu_id into v_menu from dk_master_products where id = coalesce(new.master_product_id, old.master_product_id);
  end if;
  if v_menu is null then return null; end if;
  for v_kitchen in select kitchen_id from dk_master_menu_kitchens where master_menu_id = v_menu loop
    perform dk_sync_master_menu_kitchen(v_menu, v_kitchen);
  end loop;
  return null;
end;
$$;

create trigger dk_trg_master_menus_autosync after update of active on dk_master_menus
  for each row execute function dk_master_autosync();
create trigger dk_trg_master_products_autosync after insert or update on dk_master_products
  for each row execute function dk_master_autosync();
create trigger dk_trg_master_recipe_items_autosync after insert or update or delete on dk_master_recipe_items
  for each row execute function dk_master_autosync();

create or replace function dk_master_product_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform dk_detach_master_copies(array[old.id]);
  return old;
end;
$$;

create trigger dk_trg_master_products_detach before delete on dk_master_products
  for each row execute function dk_master_product_before_delete();

-- ---------------------------------------------------------------------------
-- RPC del superusuario
-- ---------------------------------------------------------------------------

-- Guardar un plato del maestro con su receta completa, sincronizando una sola vez al final.
create or replace function dk_save_master_product(
  p_menu_id uuid, p_product_id uuid, p_code text, p_name text, p_description text,
  p_category text, p_price numeric, p_active boolean, p_recipe jsonb
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
  if not dk_is_superadmin() then raise exception 'Solo el superusuario edita menús maestros'; end if;
  perform set_config('dk.master_batch', 'on', true);

  if v_id is null then
    insert into dk_master_products (master_menu_id, code, name, description, category_name, price, active, sort_order)
    values (p_menu_id, upper(btrim(p_code)), btrim(p_name), nullif(btrim(p_description), ''), nullif(btrim(p_category), ''), p_price, coalesce(p_active, true),
      (select coalesce(max(sort_order), 0) + 1 from dk_master_products where master_menu_id = p_menu_id))
    returning id into v_id;
  else
    update dk_master_products
    set code = upper(btrim(p_code)), name = btrim(p_name), description = nullif(btrim(p_description), ''),
        category_name = nullif(btrim(p_category), ''), price = p_price, active = coalesce(p_active, true)
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

create or replace function dk_assign_master_menu(p_menu_id uuid, p_kitchen_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid;
  v_count integer := 0;
begin
  if not dk_is_superadmin() then raise exception 'Solo el superusuario comparte menús maestros'; end if;
  foreach v_kitchen in array p_kitchen_ids loop
    insert into dk_master_menu_kitchens (master_menu_id, kitchen_id) values (p_menu_id, v_kitchen) on conflict do nothing;
    perform dk_sync_master_menu_kitchen(p_menu_id, v_kitchen);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function dk_unassign_master_menu(p_menu_id uuid, p_kitchen_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid;
  v_count integer := 0;
begin
  if not dk_is_superadmin() then raise exception 'Solo el superusuario comparte menús maestros'; end if;
  foreach v_kitchen in array p_kitchen_ids loop
    perform dk_detach_master_copies(array(select id from dk_master_products where master_menu_id = p_menu_id), v_kitchen);
    delete from dk_master_menu_kitchens where master_menu_id = p_menu_id and kitchen_id = v_kitchen;
    if found then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end;
$$;

-- Borrar un menú: primero se desprenden las copias de todas las Cocinas.
create or replace function dk_delete_master_menu(p_menu_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not dk_is_superadmin() then raise exception 'Solo el superusuario borra menús maestros'; end if;
  delete from dk_master_menus where id = p_menu_id;
end;
$$;

revoke execute on function
  dk_sync_master_menu_kitchen(uuid, uuid), dk_detach_master_copies(uuid[], uuid), dk_master_autosync(),
  dk_master_product_before_delete(), dk_guard_master_product(), dk_guard_master_recipe()
from public, anon, authenticated;

revoke execute on function
  dk_save_master_product(uuid, uuid, text, text, text, text, numeric, boolean, jsonb),
  dk_assign_master_menu(uuid, uuid[]), dk_unassign_master_menu(uuid, uuid[]), dk_delete_master_menu(uuid)
from public, anon;
grant execute on function
  dk_save_master_product(uuid, uuid, text, text, text, text, numeric, boolean, jsonb),
  dk_assign_master_menu(uuid, uuid[]), dk_unassign_master_menu(uuid, uuid[]), dk_delete_master_menu(uuid)
to authenticated;
