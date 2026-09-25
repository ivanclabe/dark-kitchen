-- Multi-Cocina — Fase 2: datos (ADR 0007, secciones 4 y 7).
--
-- Toda tabla de negocio pasa a pertenecer a una Cocina (kitchen_id). Los
-- datos existentes quedan en la Cocina inicial 'dark-kitchen-1'. La RLS
-- todavía NO aísla por Cocina (eso es la Fase 3): esta fase solo pone los
-- datos y las garantías de integridad en su lugar, sin cambiar lo que ve la app.
--
-- 1. kitchen_id NOT NULL en 33 tablas. Se agrega con un DEFAULT constante
--    (la Cocina inicial): Postgres lo guarda como metadato, sin reescribir
--    filas ni disparar triggers (no se toca updated_at ni la auditoría).
--    Luego el default pasa a dk_current_kitchen_id().
-- 2. Tablas hijas (ítems de pedido, movimientos, recetas…) heredan la Cocina
--    de su padre con un trigger: nunca dependen de quién inserta.
-- 3. FKs compuestas (kitchen_id, x_id) → padre (kitchen_id, id): la base
--    impide que una fila de una Cocina apunte a datos de otra.
-- 4. Unicidades globales → por Cocina (teléfono de cliente, códigos,
--    nombres de categoría, domiciliario por usuario, número de pedido).
-- 5. Configuración por Cocina: SLA, horario, excepciones y funciones de IA
--    pasan a clave (kitchen_id, …).
-- 6. Numeración de pedidos por Cocina (1000–9999, como hoy).
-- 7. dk_create_kitchen() siembra la configuración de cada Cocina nueva
--    (y ya no agrega al superusuario como miembro).
-- 8. La auditoría registra la Cocina de cada cambio.

-- ---------------------------------------------------------------------------
-- Cocina "actual" (modo compatibilidad hasta la Fase 3)
-- ---------------------------------------------------------------------------
-- Mientras la app no indique la Cocina activa, la de un usuario con UNA sola
-- membresía activa es inequívoca. Con cero o varias devuelve NULL y el
-- insert falla (kitchen_id es NOT NULL): nunca se adivina. La Fase 3 le
-- antepone la Cocina activa de la petición.
create or replace function dk_current_kitchen_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case when count(*) = 1 then (array_agg(m.kitchen_id))[1] end
  from dk_kitchen_members m
  join dk_users u on u.id = m.user_id and u.active
  join dk_kitchens k on k.id = m.kitchen_id and k.active
  where u.auth_user_id = auth.uid() and m.active;
$$;

-- Hereda la Cocina del padre: TG_ARGV[0] = tabla padre, TG_ARGV[1] = columna FK.
-- SECURITY DEFINER solo para leer el kitchen_id del padre; la FK compuesta y
-- (Fase 3) la RLS deciden si la fila es válida.
create or replace function dk_inherit_kitchen_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_id uuid := (to_jsonb(new) ->> tg_argv[1])::uuid;
  v_kitchen_id uuid;
begin
  if v_parent_id is not null then
    execute format('select kitchen_id from public.%I where id = $1', tg_argv[0]) into v_kitchen_id using v_parent_id;
    if v_kitchen_id is not null then
      new.kitchen_id := v_kitchen_id;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. kitchen_id en todas las tablas de negocio
-- ---------------------------------------------------------------------------

do $$
declare
  v_kitchen uuid := (select id from dk_kitchens where slug = 'dark-kitchen-1');
  v_table text;
begin
  if v_kitchen is null then
    raise exception 'Fase 2: falta la Cocina inicial dark-kitchen-1';
  end if;

  foreach v_table in array array[
    -- Catálogo e inventario
    'dk_ingredient_categories', 'dk_suppliers', 'dk_ingredients', 'dk_ingredient_purchase_units',
    'dk_supplier_ingredients', 'dk_ingredient_stock', 'dk_inventory_movements', 'dk_inventory_reservations',
    'dk_purchases', 'dk_purchase_items', 'dk_attachments',
    'dk_product_categories', 'dk_products', 'dk_recipes', 'dk_recipe_items', 'dk_menu_plan_items',
    -- Menús deprecados (conservan datos)
    'dk_menus', 'dk_menu_items', 'dk_daily_availability', 'dk_weekly_menu_items',
    -- Operación
    'dk_customers', 'dk_orders', 'dk_order_items', 'dk_order_status_history', 'dk_kitchen_tickets',
    'dk_delivery_riders', 'dk_deliveries', 'dk_order_payments',
    -- Configuración
    'dk_kitchen_sla_settings', 'dk_kitchen_hours', 'dk_kitchen_hour_exceptions', 'dk_ai_features', 'dk_ai_insights'
  ] loop
    execute format(
      'alter table public.%I add column kitchen_id uuid not null default %L references public.dk_kitchens (id)',
      v_table, v_kitchen
    );
    execute format('alter table public.%I alter column kitchen_id set default public.dk_current_kitchen_id()', v_table);
    execute format('create index %I on public.%I (kitchen_id)', v_table || '_kitchen_idx', v_table);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Herencia de la Cocina en tablas hijas
-- ---------------------------------------------------------------------------

do $$
declare
  v_rule text[];
begin
  foreach v_rule slice 1 in array array[
    ['dk_ingredient_purchase_units', 'dk_ingredients', 'ingredient_id'],
    ['dk_supplier_ingredients', 'dk_suppliers', 'supplier_id'],
    ['dk_ingredient_stock', 'dk_ingredients', 'ingredient_id'],
    ['dk_inventory_movements', 'dk_ingredients', 'ingredient_id'],
    ['dk_inventory_reservations', 'dk_ingredients', 'ingredient_id'],
    ['dk_purchase_items', 'dk_purchases', 'purchase_id'],
    ['dk_recipes', 'dk_products', 'product_id'],
    ['dk_recipe_items', 'dk_recipes', 'recipe_id'],
    ['dk_menu_plan_items', 'dk_products', 'product_id'],
    ['dk_menu_items', 'dk_menus', 'menu_id'],
    ['dk_daily_availability', 'dk_menu_items', 'menu_item_id'],
    ['dk_weekly_menu_items', 'dk_products', 'product_id'],
    ['dk_order_items', 'dk_orders', 'order_id'],
    ['dk_order_status_history', 'dk_orders', 'order_id'],
    ['dk_kitchen_tickets', 'dk_orders', 'order_id'],
    ['dk_deliveries', 'dk_orders', 'order_id'],
    ['dk_order_payments', 'dk_orders', 'order_id']
  ] loop
    execute format(
      'create trigger %I before insert on public.%I for each row execute function public.dk_inherit_kitchen_id(%L, %L)',
      'dk_trg_' || substr(v_rule[1], 4) || '_inherit_kitchen', v_rule[1], v_rule[2], v_rule[3]
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. FKs compuestas: una fila solo puede apuntar a datos de SU Cocina
-- ---------------------------------------------------------------------------

do $$
declare
  v_parent text;
  v_fk text[];
begin
  foreach v_parent in array array[
    'dk_ingredient_categories', 'dk_suppliers', 'dk_ingredients', 'dk_purchases', 'dk_product_categories',
    'dk_products', 'dk_recipes', 'dk_menus', 'dk_menu_items', 'dk_customers', 'dk_orders', 'dk_order_items',
    'dk_delivery_riders'
  ] loop
    execute format('alter table public.%I add constraint %I unique (kitchen_id, id)', v_parent, v_parent || '_kitchen_id_id_key');
  end loop;

  -- [tabla, columna, padre, on delete] — mismo comportamiento de borrado que la FK original.
  foreach v_fk slice 1 in array array[
    ['dk_ingredients', 'category_id', 'dk_ingredient_categories', 'no action'],
    ['dk_ingredients', 'primary_supplier_id', 'dk_suppliers', 'no action'],
    ['dk_ingredient_purchase_units', 'ingredient_id', 'dk_ingredients', 'cascade'],
    ['dk_supplier_ingredients', 'supplier_id', 'dk_suppliers', 'cascade'],
    ['dk_supplier_ingredients', 'ingredient_id', 'dk_ingredients', 'cascade'],
    ['dk_ingredient_stock', 'ingredient_id', 'dk_ingredients', 'cascade'],
    ['dk_inventory_movements', 'ingredient_id', 'dk_ingredients', 'no action'],
    ['dk_inventory_reservations', 'ingredient_id', 'dk_ingredients', 'no action'],
    ['dk_inventory_reservations', 'order_item_id', 'dk_order_items', 'cascade'],
    ['dk_purchases', 'supplier_id', 'dk_suppliers', 'no action'],
    ['dk_purchase_items', 'purchase_id', 'dk_purchases', 'cascade'],
    ['dk_purchase_items', 'ingredient_id', 'dk_ingredients', 'no action'],
    ['dk_products', 'category_id', 'dk_product_categories', 'no action'],
    ['dk_products', 'active_recipe_id', 'dk_recipes', 'no action'],
    ['dk_recipes', 'product_id', 'dk_products', 'cascade'],
    ['dk_recipe_items', 'recipe_id', 'dk_recipes', 'cascade'],
    ['dk_recipe_items', 'ingredient_id', 'dk_ingredients', 'no action'],
    ['dk_menu_plan_items', 'product_id', 'dk_products', 'cascade'],
    ['dk_menu_items', 'menu_id', 'dk_menus', 'cascade'],
    ['dk_menu_items', 'product_id', 'dk_products', 'cascade'],
    ['dk_daily_availability', 'menu_item_id', 'dk_menu_items', 'cascade'],
    ['dk_weekly_menu_items', 'product_id', 'dk_products', 'cascade'],
    ['dk_orders', 'customer_id', 'dk_customers', 'no action'],
    ['dk_order_items', 'order_id', 'dk_orders', 'cascade'],
    ['dk_order_items', 'product_id', 'dk_products', 'no action'],
    ['dk_order_items', 'recipe_id', 'dk_recipes', 'no action'],
    ['dk_order_status_history', 'order_id', 'dk_orders', 'cascade'],
    ['dk_kitchen_tickets', 'order_id', 'dk_orders', 'cascade'],
    ['dk_deliveries', 'order_id', 'dk_orders', 'no action'],
    ['dk_deliveries', 'rider_id', 'dk_delivery_riders', 'no action'],
    ['dk_order_payments', 'order_id', 'dk_orders', 'no action']
  ] loop
    execute format(
      'alter table public.%I add constraint %I foreign key (kitchen_id, %I) references public.%I (kitchen_id, id) on delete %s',
      v_fk[1], v_fk[1] || '_' || v_fk[2] || '_same_kitchen_fkey', v_fk[2], v_fk[3], v_fk[4]
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Unicidades por Cocina
-- ---------------------------------------------------------------------------

alter table dk_customers drop constraint dk_customers_phone_key;
alter table dk_customers add constraint dk_customers_kitchen_phone_key unique (kitchen_id, phone);
alter table dk_customers drop constraint dk_customers_whatsapp_id_key;
alter table dk_customers add constraint dk_customers_kitchen_whatsapp_id_key unique (kitchen_id, whatsapp_id);
alter table dk_ingredients drop constraint dk_ingredients_code_key;
alter table dk_ingredients add constraint dk_ingredients_kitchen_code_key unique (kitchen_id, code);
alter table dk_products drop constraint dk_products_code_key;
alter table dk_products add constraint dk_products_kitchen_code_key unique (kitchen_id, code);
alter table dk_product_categories drop constraint dk_product_categories_name_key;
alter table dk_product_categories add constraint dk_product_categories_kitchen_name_key unique (kitchen_id, name);
alter table dk_ingredient_categories drop constraint dk_ingredient_categories_name_key;
alter table dk_ingredient_categories add constraint dk_ingredient_categories_kitchen_name_key unique (kitchen_id, name);
alter table dk_menus drop constraint dk_menus_name_key;
alter table dk_menus add constraint dk_menus_kitchen_name_key unique (kitchen_id, name);
-- Una persona puede ser domiciliario en varias Cocinas.
alter table dk_delivery_riders drop constraint dk_delivery_riders_user_id_key;
alter table dk_delivery_riders add constraint dk_delivery_riders_kitchen_user_id_key unique (kitchen_id, user_id);

-- ---------------------------------------------------------------------------
-- 5. Configuración por Cocina
-- ---------------------------------------------------------------------------

-- SLA: de fila única (id = 1) a una fila por Cocina. `id` se conserva (la app
-- lo usa hasta la Fase 4) pero deja de ser la clave.
alter table dk_kitchen_sla_settings drop constraint dk_kitchen_sla_settings_id_check;
alter table dk_kitchen_sla_settings drop constraint dk_kitchen_sla_settings_pkey;
alter table dk_kitchen_sla_settings alter column id drop not null;
alter table dk_kitchen_sla_settings add primary key (kitchen_id);
comment on column dk_kitchen_sla_settings.id is 'Deprecado: fila única antes de multi-cocina. La clave es kitchen_id.';

alter table dk_kitchen_hours drop constraint dk_kitchen_hours_pkey;
alter table dk_kitchen_hours add primary key (kitchen_id, day_of_week);

alter table dk_kitchen_hour_exceptions drop constraint dk_kitchen_hour_exceptions_pkey;
alter table dk_kitchen_hour_exceptions add primary key (kitchen_id, exception_date);

alter table dk_ai_insights drop constraint dk_ai_insights_feature_key_fkey;
alter table dk_ai_features drop constraint dk_ai_features_pkey;
alter table dk_ai_features add primary key (kitchen_id, feature_key);
alter table dk_ai_insights add constraint dk_ai_insights_feature_fkey
  foreign key (kitchen_id, feature_key) references dk_ai_features (kitchen_id, feature_key);
drop index if exists dk_ai_insights_feature_created_idx;
create index dk_ai_insights_feature_created_idx on dk_ai_insights (kitchen_id, feature_key, created_at desc);

-- ---------------------------------------------------------------------------
-- 6. Numeración de pedidos por Cocina
-- ---------------------------------------------------------------------------
-- Igual que hoy: 4 dígitos (la voz los nombra así), 1000–9999 en ciclo, y
-- únicos solo entre pedidos activos. Ahora cada Cocina tiene su contador.

create table dk_kitchen_counters (
  kitchen_id uuid not null references dk_kitchens (id) on delete cascade,
  name text not null,
  last_value integer not null,
  primary key (kitchen_id, name)
);

comment on table dk_kitchen_counters is 'Contadores por Cocina (p. ej. número de pedido). Solo los usan funciones del servidor.';
alter table dk_kitchen_counters enable row level security; -- sin políticas: nadie lo lee/escribe directo

insert into dk_kitchen_counters (kitchen_id, name, last_value)
select k.id, 'order_number', coalesce((select max(order_number) from dk_orders where kitchen_id = k.id), 999)
from dk_kitchens k;

create or replace function dk_next_order_number(p_kitchen_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  insert into dk_kitchen_counters (kitchen_id, name, last_value)
  values (p_kitchen_id, 'order_number', 1000)
  on conflict (kitchen_id, name) do update
    set last_value = case when dk_kitchen_counters.last_value >= 9999 then 1000 else dk_kitchen_counters.last_value + 1 end
  returning last_value into v_next;
  return v_next;
end;
$$;

revoke all on function dk_next_order_number(uuid) from public, anon, authenticated;

create or replace function dk_assign_order_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.order_number := dk_next_order_number(new.kitchen_id);
  return new;
end;
$$;

-- El DEFAULT queda en 0 solo para que la columna siga siendo opcional al
-- insertar; el trigger siempre asigna el número real de la Cocina.
alter table dk_orders alter column order_number set default 0;
create trigger dk_trg_orders_assign_number before insert on dk_orders
  for each row execute function dk_assign_order_number();

drop index dk_orders_order_number_active_uniq;
create unique index dk_orders_order_number_active_uniq on dk_orders (kitchen_id, order_number)
  where status not in ('ENTREGADO', 'CANCELADO');

drop sequence dk_order_number_seq;

-- ---------------------------------------------------------------------------
-- 7. Cocinas nuevas nacen con su configuración
-- ---------------------------------------------------------------------------

create or replace function dk_create_kitchen(p_name text, p_slug text, p_timezone text default 'America/Bogota', p_currency text default 'COP')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen_id uuid;
begin
  if not dk_is_superadmin() then
    raise exception 'Solo el superusuario puede crear Cocinas';
  end if;

  insert into dk_kitchens (slug, name, timezone, currency)
  values (lower(btrim(p_slug)), btrim(p_name), p_timezone, p_currency)
  returning id into v_kitchen_id;

  -- Sin membresía automática: el superusuario ya accede a toda Cocina
  -- (decisión 4) y luego asigna al Administrador de la Cocina. (La versión
  -- de la Fase 1 lo agregaba como miembro; eso lo dejaba con varias Cocinas
  -- y sin Cocina por defecto mientras la app no elige una.)

  -- Configuración inicial: mismos valores por defecto que tuvo la primera Cocina.
  insert into dk_kitchen_sla_settings (kitchen_id) values (v_kitchen_id);
  insert into dk_ai_features (kitchen_id, feature_key, settings) values
    (v_kitchen_id, 'supply_reorder',       '{"coverage_days": 7, "frequency_min": 360}'),
    (v_kitchen_id, 'supply_perishables',   '{"warning_days": 2, "frequency_min": 360}'),
    (v_kitchen_id, 'supply_slow_movers',   '{"slow_days": 21, "overstock_days": 60, "frequency_min": 1440}'),
    (v_kitchen_id, 'kitchen_stall_alerts', '{"dish_stall_min": 12, "repeat_min": 5, "voice": true}'),
    (v_kitchen_id, 'kitchen_insights',     '{"frequency_min": 10, "voice": false}');
  insert into dk_kitchen_counters (kitchen_id, name, last_value) values (v_kitchen_id, 'order_number', 999);
  -- Horario: vacío = "sin configurar" (no se inventan horas).

  return v_kitchen_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Auditoría con Cocina
-- ---------------------------------------------------------------------------

alter table dk_audit_log add column kitchen_id uuid references dk_kitchens (id);
update dk_audit_log set kitchen_id = (select id from dk_kitchens where slug = 'dark-kitchen-1')
where table_name not in ('dk_users', 'dk_units', 'dk_roles', 'dk_role_permissions', 'dk_permissions');
create index dk_audit_log_kitchen_idx on dk_audit_log (kitchen_id, created_at desc);
comment on column dk_audit_log.kitchen_id is 'Cocina del registro auditado (null en tablas globales: usuarios, unidades, roles).';

create or replace function dk_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_key text;
begin
  select string_agg(v_row ->> a.attname, '|' order by array_position(i.indkey::int2[], a.attnum))
  into v_key
  from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
  where i.indrelid = tg_relid and i.indisprimary;

  insert into dk_audit_log (table_name, record_id, record_key, kitchen_id, action, old_data, new_data, changed_by)
  values (
    tg_table_name,
    case when v_row ? 'id' then (v_row ->> 'id')::uuid end,
    coalesce(v_key, v_row ->> 'id'),
    case
      when tg_table_name = 'dk_kitchens' then (v_row ->> 'id')::uuid
      when v_row ? 'kitchen_id' then (v_row ->> 'kitchen_id')::uuid
    end,
    tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE','INSERT') then to_jsonb(new) else null end,
    dk_current_profile_id()
  );
  return coalesce(new, old);
end;
$$;
