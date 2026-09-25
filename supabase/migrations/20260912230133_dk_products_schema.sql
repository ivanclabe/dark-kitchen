-- Dark Kitchen — Fase 3: Productos (platos, recetas versionadas, costeo).

create table dk_product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table dk_products (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  description text,
  category_id uuid references dk_product_categories(id),
  price numeric not null default 0 check (price >= 0),
  image_path text,
  active_recipe_id uuid, -- FK agregada abajo, una vez existe dk_recipes
  estimated_cost numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger dk_trg_products_updated_at
  before update on dk_products
  for each row execute function dk_set_updated_at();

create trigger dk_trg_audit_products
  after insert or update or delete on dk_products
  for each row execute function dk_audit_row();

-- ---------------------------------------------------------------------------
-- Recetas versionadas (inmutables una vez creadas)
-- ---------------------------------------------------------------------------

create table dk_recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references dk_products(id) on delete cascade,
  version integer not null,
  is_active boolean not null default true,
  created_by uuid references dk_users(id),
  created_at timestamptz not null default now(),
  unique (product_id, version)
);

-- Solo una version activa por producto a la vez.
create unique index dk_recipes_one_active_per_product
  on dk_recipes (product_id) where is_active;

comment on table dk_recipes is 'Version inmutable de una receta. Nunca se edita: dk_create_recipe_version() crea una fila nueva y desactiva la anterior.';

create table dk_recipe_items (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references dk_recipes(id) on delete cascade,
  ingredient_id uuid not null references dk_ingredients(id),
  quantity numeric not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (recipe_id, ingredient_id)
);

comment on column dk_recipe_items.quantity is 'Cantidad en la unidad base del insumo (dk_ingredients.base_unit_id) — las recetas no eligen unidad, siempre consumen en la base.';

alter table dk_products
  add constraint dk_products_active_recipe_fkey
  foreign key (active_recipe_id) references dk_recipes(id);

-- ---------------------------------------------------------------------------
-- Costeo
-- ---------------------------------------------------------------------------

create or replace function dk_calculate_recipe_cost(p_recipe_id uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(ri.quantity * i.avg_cost), 0)
  from dk_recipe_items ri
  join dk_ingredients i on i.id = ri.ingredient_id
  where ri.recipe_id = p_recipe_id;
$$;

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
  if dk_current_role() not in ('ADMIN','MANAGER') then
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

  insert into dk_recipe_items (recipe_id, ingredient_id, quantity)
  select v_recipe_id, (item->>'ingredient_id')::uuid, (item->>'quantity')::numeric
  from jsonb_array_elements(p_items) as item;

  v_cost := dk_calculate_recipe_cost(v_recipe_id);

  update dk_products
  set active_recipe_id = v_recipe_id, estimated_cost = v_cost
  where id = p_product_id;

  return v_recipe_id;
end;
$$;

revoke execute on function dk_create_recipe_version(uuid, jsonb) from public, anon;
grant execute on function dk_create_recipe_version(uuid, jsonb) to authenticated;

-- Si cambia el costo promedio de un insumo, recalcula el costo estimado de
-- todos los productos cuya receta activa lo use.
create or replace function dk_recalc_products_for_ingredient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.avg_cost is distinct from old.avg_cost then
    update dk_products p
    set estimated_cost = dk_calculate_recipe_cost(p.active_recipe_id)
    where p.active_recipe_id in (
      select distinct ri.recipe_id from dk_recipe_items ri where ri.ingredient_id = new.id
    );
  end if;
  return new;
end;
$$;

create trigger dk_trg_recalc_product_cost
  after update of avg_cost on dk_ingredients
  for each row execute function dk_recalc_products_for_ingredient();

revoke execute on function dk_recalc_products_for_ingredient() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table dk_product_categories enable row level security;
alter table dk_products enable row level security;
alter table dk_recipes enable row level security;
alter table dk_recipe_items enable row level security;

create policy dk_product_categories_select on dk_product_categories for select to authenticated using (true);
create policy dk_product_categories_write on dk_product_categories for all to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER')) with check (dk_current_role() in ('ADMIN','MANAGER'));

-- Productos: cualquier autenticado puede leer (cocina/caja los necesitan);
-- solo ADMIN/MANAGER puede crear/editar/eliminar (ver ADR 0005).
create policy dk_products_select on dk_products for select to authenticated using (true);
create policy dk_products_write on dk_products for insert to authenticated
  with check (dk_current_role() in ('ADMIN','MANAGER'));
create policy dk_products_update on dk_products for update to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER'))
  with check (dk_current_role() in ('ADMIN','MANAGER'));

-- Recetas: lectura para ADMIN/MANAGER/INVENTORY/KITCHEN. Sin policy de
-- insert/update/delete: solo se crean via dk_create_recipe_version (RPC).
create policy dk_recipes_select on dk_recipes for select to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','INVENTORY','KITCHEN'));

create policy dk_recipe_items_select on dk_recipe_items for select to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','INVENTORY','KITCHEN'));
