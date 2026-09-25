-- Multi-Cocina — Fase 3: aislamiento (ADR 0007, sección 6).
--
-- A partir de aquí la base separa las Cocinas de verdad:
--   * Cocina activa de cada petición = encabezado `x-dk-kitchen-id`, validado
--     contra la membresía (o superusuario). Encabezado ajeno o inválido →
--     NULL → cero filas (falla cerrado). Sin encabezado, se mantiene el modo
--     compatibilidad: la única Cocina del usuario (así la app actual y n8n,
--     con una sola Cocina, siguen funcionando).
--   * Toda la RLS de negocio pasa de "rol global" a "fila de la Cocina activa
--     + permiso del rol en esa Cocina". Cada política se tradujo al permiso
--     equivalente de la matriz de la Fase 1: nadie gana ni pierde acceso.
--   * Las 17 funciones SECURITY DEFINER (que saltan la RLS) verifican el
--     permiso en la Cocina activa y que la fila sobre la que actúan sea de
--     esa Cocina.
--   * Vistas filtran por Cocina activa; "hoy" usa la zona horaria de la
--     Cocina (antes era UTC: desde las 7 p. m. hora Colombia el menú de hoy
--     era el de mañana).
--   * Storage: rutas `kitchens/{kitchen_id}/…`.
--   * dk_users.role (rol global heredado) queda sincronizado con la
--     membresía mientras el módulo Usuarios lo siga editando (hasta la Fase 5).

-- ---------------------------------------------------------------------------
-- Cocina activa y permisos
-- ---------------------------------------------------------------------------

create or replace function dk_current_kitchen_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_header text;
  v_kitchen_id uuid;
begin
  begin
    v_header := nullif(current_setting('request.headers', true), '')::json ->> 'x-dk-kitchen-id';
  exception when others then
    v_header := null;
  end;

  if v_header is not null then
    if v_header !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return null;
    end if;
    v_kitchen_id := v_header::uuid;
    if dk_is_superadmin() then
      return (select id from dk_kitchens where id = v_kitchen_id);
    end if;
    return (
      select m.kitchen_id
      from dk_kitchen_members m
      join dk_users u on u.id = m.user_id and u.active
      join dk_kitchens k on k.id = m.kitchen_id and k.active
      where m.kitchen_id = v_kitchen_id and m.active and u.auth_user_id = auth.uid()
    );
  end if;

  -- Compatibilidad (sin encabezado): la Cocina es inequívoca solo si el usuario tiene una.
  return (
    select case when count(*) = 1 then (array_agg(m.kitchen_id))[1] end
    from dk_kitchen_members m
    join dk_users u on u.id = m.user_id and u.active
    join dk_kitchens k on k.id = m.kitchen_id and k.active
    where u.auth_user_id = auth.uid() and m.active
  );
end;
$$;

comment on function dk_current_kitchen_id is 'Cocina activa de la petición: encabezado x-dk-kitchen-id validado contra la membresía; sin encabezado, la única Cocina del usuario. NULL = ninguna (la RLS devuelve cero filas).';

create or replace function dk_can(p_module text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select dk_has_kitchen_permission(dk_current_kitchen_id(), p_module, p_action);
$$;

-- ¿Es personal de alguna Cocina? (para catálogos globales como unidades).
create or replace function dk_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select dk_is_superadmin() or exists (
    select 1 from dk_kitchen_members m
    join dk_users u on u.id = m.user_id and u.active
    where m.active and u.auth_user_id = auth.uid()
  );
$$;

-- "Hoy" en la zona horaria de la Cocina activa.
create or replace function dk_kitchen_today()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone coalesce(
    (select timezone from dk_kitchens where id = dk_current_kitchen_id()),
    'America/Bogota'
  ))::date;
$$;

-- Para las funciones SECURITY DEFINER: la fila debe ser de la Cocina activa.
create or replace function dk_assert_in_active_kitchen(p_table text, p_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_active uuid := dk_current_kitchen_id();
  v_kitchen uuid;
begin
  if v_active is null then
    raise exception 'No hay una Cocina activa para esta operación';
  end if;
  if p_id is null then
    return;
  end if;
  execute format('select kitchen_id from public.%I where id = $1', p_table) into v_kitchen using p_id;
  if v_kitchen is distinct from v_active then
    raise exception 'Registro no encontrado en esta Cocina';
  end if;
end;
$$;

revoke all on function dk_assert_in_active_kitchen(text, uuid) from public, anon, authenticated;

-- ¿Puedo ver el perfil de esta persona? (mía, superusuario, o miembro de una Cocina donde administro usuarios)
create or replace function dk_can_see_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select dk_is_superadmin() or exists (
    select 1 from dk_kitchen_members m
    where m.user_id = p_user_id and dk_has_kitchen_permission(m.kitchen_id, 'members', 'view')
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS de negocio: se reemplazan TODAS las políticas de las tablas por Cocina
-- ---------------------------------------------------------------------------

do $$
declare
  v_policy record;
begin
  for v_policy in
    select c.relname as tbl, p.polname as pol
    from pg_policy p join pg_class c on c.oid = p.polrelid
    where c.relname in (
      'dk_ai_features', 'dk_ai_insights', 'dk_attachments', 'dk_audit_log', 'dk_customers', 'dk_daily_availability',
      'dk_deliveries', 'dk_delivery_riders', 'dk_ingredient_categories', 'dk_ingredient_purchase_units',
      'dk_ingredient_stock', 'dk_ingredients', 'dk_inventory_movements', 'dk_inventory_reservations',
      'dk_kitchen_hour_exceptions', 'dk_kitchen_hours', 'dk_kitchen_sla_settings', 'dk_kitchen_tickets',
      'dk_menu_items', 'dk_menu_plan_items', 'dk_menus', 'dk_order_items', 'dk_order_payments',
      'dk_order_status_history', 'dk_orders', 'dk_product_categories', 'dk_products', 'dk_purchase_items',
      'dk_purchases', 'dk_recipe_items', 'dk_recipes', 'dk_supplier_ingredients', 'dk_suppliers',
      'dk_units', 'dk_users', 'dk_permissions', 'dk_roles', 'dk_weekly_menu_items'
    )
  loop
    execute format('drop policy %I on public.%I', v_policy.pol, v_policy.tbl);
  end loop;
end;
$$;

-- Políticas estándar: [tabla, comando, módulo, acción]. La fila debe ser de
-- la Cocina activa y el rol tener ese permiso en ella. Módulo '*' = cualquier
-- miembro de la Cocina (catálogos que ya veía todo el personal).
do $$
declare
  v_spec text[];
  v_cond text;
begin
  foreach v_spec slice 1 in array array[
    -- Catálogo de platos y menú
    ['dk_product_categories', 'select', '*', ''],
    ['dk_product_categories', 'all', 'products', 'edit'],
    ['dk_products', 'select', '*', ''],
    ['dk_products', 'insert', 'products', 'create'],
    ['dk_products', 'update', 'products', 'edit'],
    ['dk_recipes', 'select', 'recipes', 'view'],
    ['dk_recipe_items', 'select', 'recipes', 'view'],
    ['dk_menu_plan_items', 'select', '*', ''],
    ['dk_menu_plan_items', 'all', 'menu_planner', 'manage'],
    ['dk_menus', 'select', '*', ''],
    ['dk_menus', 'all', 'menu_planner', 'manage'],
    ['dk_menu_items', 'select', '*', ''],
    ['dk_menu_items', 'all', 'menu_planner', 'manage'],
    ['dk_weekly_menu_items', 'select', '*', ''],
    ['dk_weekly_menu_items', 'all', 'menu_planner', 'manage'],
    ['dk_daily_availability', 'select', '*', ''],
    ['dk_daily_availability', 'all', 'menu_planner', 'edit'],
    -- Inventario, proveedores, compras
    ['dk_ingredient_categories', 'select', '*', ''],
    ['dk_ingredient_categories', 'all', 'inventory', 'edit'],
    ['dk_ingredients', 'select', 'inventory', 'view'],
    ['dk_ingredients', 'insert', 'inventory', 'edit'],
    ['dk_ingredients', 'update', 'inventory', 'edit'],
    ['dk_ingredients', 'delete', 'inventory', 'edit'],
    ['dk_ingredient_purchase_units', 'select', 'inventory', 'view'],
    ['dk_ingredient_purchase_units', 'all', 'inventory', 'edit'],
    ['dk_ingredient_stock', 'select', 'inventory', 'view'],
    ['dk_inventory_movements', 'select', 'inventory', 'view'],
    ['dk_suppliers', 'select', 'suppliers', 'view'],
    ['dk_suppliers', 'all', 'suppliers', 'edit'],
    ['dk_supplier_ingredients', 'select', 'suppliers', 'view'],
    ['dk_supplier_ingredients', 'all', 'suppliers', 'edit'],
    ['dk_purchases', 'select', 'purchases', 'view'],
    ['dk_purchases', 'all', 'purchases', 'create'],
    ['dk_purchase_items', 'select', 'purchases', 'view'],
    ['dk_purchase_items', 'all', 'purchases', 'create'],
    ['dk_attachments', 'select', 'purchases', 'view'],
    ['dk_attachments', 'all', 'purchases', 'create'],
    -- Operación
    ['dk_customers', 'select', 'customers', 'view'],
    ['dk_customers', 'insert', 'customers', 'create'],
    ['dk_customers', 'update', 'customers', 'edit'],
    ['dk_customers', 'delete', 'customers', 'edit'],
    ['dk_orders', 'insert', 'orders', 'create'],
    ['dk_order_items', 'select', 'orders', 'view'],
    ['dk_order_items', 'all', 'orders', 'edit'],
    ['dk_order_status_history', 'select', 'orders', 'view'],
    ['dk_kitchen_tickets', 'select', 'orders', 'view'],
    ['dk_order_payments', 'select', 'receivables', 'view'],
    ['dk_delivery_riders', 'select', '*', ''],
    ['dk_delivery_riders', 'all', 'dispatch', 'manage'],
    -- Configuración de la Cocina
    ['dk_kitchen_sla_settings', 'select', 'settings', 'view'],
    ['dk_kitchen_sla_settings', 'update', 'settings', 'manage'],
    ['dk_kitchen_hours', 'select', 'settings', 'view'],
    ['dk_kitchen_hours', 'all', 'settings', 'manage'],
    ['dk_kitchen_hour_exceptions', 'select', 'settings', 'view'],
    ['dk_kitchen_hour_exceptions', 'all', 'settings', 'manage'],
    ['dk_ai_features', 'select', '*', ''],
    ['dk_ai_features', 'update', 'ai', 'manage']
  ] loop
    v_cond := 'kitchen_id = (select public.dk_current_kitchen_id())'
      || case when v_spec[3] = '*' then '' else format(' and (select public.dk_can(%L, %L))', v_spec[3], v_spec[4]) end;

    execute format(
      'create policy %I on public.%I for %s to authenticated %s %s',
      v_spec[1] || '_' || v_spec[2] || case when v_spec[3] = '*' then '' else '_' || v_spec[3] || '_' || v_spec[4] end,
      v_spec[1],
      v_spec[2],
      case when v_spec[2] = 'insert' then '' else 'using (' || v_cond || ')' end,
      case when v_spec[2] in ('select', 'delete') then '' else 'with check (' || v_cond || ')' end
    );
  end loop;
end;
$$;

-- Políticas especiales (conservan las reglas finas de hoy) ------------------

-- Pedidos: quien ve pedidos, o el domiciliario los que tiene asignados.
create policy dk_orders_select on dk_orders for select to authenticated
  using (
    kitchen_id = (select dk_current_kitchen_id())
    and (
      (select dk_can('orders', 'view'))
      or (
        (select dk_can('dispatch', 'view'))
        and exists (
          select 1 from dk_deliveries d join dk_delivery_riders r on r.id = d.rider_id
          where d.order_id = dk_orders.id and r.user_id = dk_current_profile_id()
        )
      )
    )
  );

-- Editar pedidos: solo mientras están por confirmar (NUEVO).
create policy dk_orders_update on dk_orders for update to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('orders', 'edit')) and status = 'NUEVO')
  with check (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('orders', 'edit')));

-- Despachos: quien despacha ve todos; el domiciliario, los suyos.
create policy dk_deliveries_select on dk_deliveries for select to authenticated
  using (
    kitchen_id = (select dk_current_kitchen_id())
    and (
      (select dk_can('dispatch', 'create'))
      or (
        (select dk_can('dispatch', 'view'))
        and exists (select 1 from dk_delivery_riders r where r.id = dk_deliveries.rider_id and r.user_id = dk_current_profile_id())
      )
    )
  );

-- Reservas de inventario: las ve inventario y quien ve pedidos (cocina, caja).
create policy dk_inventory_reservations_select on dk_inventory_reservations for select to authenticated
  using (
    kitchen_id = (select dk_current_kitchen_id())
    and ((select dk_can('inventory', 'view')) or (select dk_can('orders', 'view')))
  );

-- Cocina puede ajustar el menú de HOY (hoy en la zona horaria de la Cocina).
create policy dk_menu_plan_items_update_today on dk_menu_plan_items for update to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('menu_planner', 'edit')) and plan_date = (select dk_kitchen_today()))
  with check (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('menu_planner', 'edit')) and plan_date = (select dk_kitchen_today()));

-- Análisis de IA: por área (Abastecimiento / Cocina) dentro de la Cocina activa.
create or replace function dk_ai_feature_allowed(p_feature_key text)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when p_feature_key like 'supply_%' then dk_can('inventory', 'view')
    when p_feature_key like 'kitchen_%' then dk_can('operation', 'view')
    else false
  end;
$$;

create policy dk_ai_insights_select on dk_ai_insights for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and dk_ai_feature_allowed(feature_key));
create policy dk_ai_insights_insert on dk_ai_insights for insert to authenticated
  with check (kitchen_id = (select dk_current_kitchen_id()) and dk_ai_feature_allowed(feature_key));

-- Auditoría: la de la Cocina activa para quien la administra; la global, solo el superusuario.
create policy dk_audit_log_select on dk_audit_log for select to authenticated
  using (
    (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('settings', 'manage')))
    or (select dk_is_superadmin())
  );

-- Globales ---------------------------------------------------------------------

create policy dk_units_select on dk_units for select to authenticated using ((select dk_is_staff()));
create policy dk_units_write on dk_units for all to authenticated
  using ((select dk_is_superadmin())) with check ((select dk_is_superadmin()));

create policy dk_permissions_select on dk_permissions for select to authenticated using ((select dk_is_staff()));

create policy dk_roles_select on dk_roles for select to authenticated
  using ((kitchen_id is null and (select dk_is_staff())) or dk_is_kitchen_member(kitchen_id));
create policy dk_roles_write on dk_roles for all to authenticated
  using ((select dk_is_superadmin()) and not is_system)
  with check ((select dk_is_superadmin()) and not is_system);

-- Perfiles: el propio; los de mis Cocinas si administro usuarios; todos para el superusuario.
create policy dk_users_select on dk_users for select to authenticated
  using (auth_user_id = (select auth.uid()) or dk_can_see_user(id));

create policy dk_users_update on dk_users for update to authenticated
  using ((select dk_is_superadmin()) or ((select dk_can('members', 'manage')) and dk_can_see_user(id)))
  with check ((select dk_is_superadmin()) or ((select dk_can('members', 'manage')) and dk_can_see_user(id)));

create policy dk_users_insert on dk_users for insert to authenticated
  with check (
    (select dk_is_superadmin())
    or (select dk_can('members', 'manage'))
    or (
      auth_user_id = (select auth.uid())
      and not exists (select 1 from dk_users u where u.auth_user_id = (select auth.uid()))
      and (
        (not dk_has_any_profile() and role = 'ADMIN')
        or (dk_has_any_profile() and role = 'CASHIER' and active = false)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Rol heredado (dk_users.role) ↔ membresía, hasta que Usuarios gestione membresías (Fase 5)
-- ---------------------------------------------------------------------------
-- El módulo Usuarios todavía cambia dk_users.role / active. Ese cambio se
-- refleja en la membresía de la Cocina activa de quien lo hace (y activar a
-- alguien pendiente lo agrega a esa Cocina con su rol).
create or replace function dk_sync_legacy_profile_to_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
begin
  if v_kitchen is null or not (dk_is_superadmin() or dk_has_kitchen_permission(v_kitchen, 'members', 'manage')) then
    return new;
  end if;
  if new.active and not exists (select 1 from dk_kitchen_members where kitchen_id = v_kitchen and user_id = new.id) then
    insert into dk_kitchen_members (kitchen_id, user_id, role_id, active)
    select v_kitchen, new.id, r.id, true from dk_roles r where r.is_system and r.key = new.role::text;
  else
    update dk_kitchen_members m
    set role_id = (select r.id from dk_roles r where r.is_system and r.key = new.role::text),
        active = new.active
    where m.kitchen_id = v_kitchen and m.user_id = new.id;
  end if;
  return new;
end;
$$;

create trigger dk_trg_users_sync_membership after update of role, active on dk_users
  for each row when (old.role is distinct from new.role or old.active is distinct from new.active)
  execute function dk_sync_legacy_profile_to_membership();

-- ---------------------------------------------------------------------------
-- Funciones SECURITY DEFINER: permiso en la Cocina activa + fila de esa Cocina
-- ---------------------------------------------------------------------------
-- Se reescribe el control de rol de cada función por el permiso equivalente y
-- se agrega, al inicio, la verificación de que la fila pertenece a la Cocina
-- activa. Cada reemplazo se verifica: si una función no tiene el texto
-- esperado, la migración falla en vez de dejarla a medias.
do $$
declare
  v_spec text[];
  v_def text;
  v_new text;
  v_assert text;
begin
  -- [función, patrón del control actual (regex), permiso nuevo, tabla a verificar, parámetro]
  foreach v_spec slice 1 in array array[
    ['dk_advance_kitchen_item', 'dk_current_role\(\) is null or dk_current_role\(\) not in \([^)]*\)', 'not dk_can(''operation'', ''edit'')', 'dk_order_items', 'p_order_item_id'],
    ['dk_revert_kitchen_item', 'dk_current_role\(\) is null or dk_current_role\(\) not in \([^)]*\)', 'not dk_can(''operation'', ''edit'')', 'dk_order_items', 'p_order_item_id'],
    ['dk_set_ticket_priority', 'dk_current_role\(\) is null or dk_current_role\(\) not in \([^)]*\)', 'not dk_can(''operation'', ''edit'')', 'dk_orders', 'p_order_id'],
    ['dk_cancel_order', 'dk_current_role\(\) is null or dk_current_role\(\) not in \([^)]*\)', 'not dk_can(''orders'', ''delete'')', 'dk_orders', 'p_order_id'],
    ['dk_confirm_order', 'dk_current_role\(\) is null or dk_current_role\(\) not in \([^)]*\)', 'not dk_can(''orders'', ''create'')', 'dk_orders', 'p_order_id'],
    ['dk_dispatch_order', 'dk_current_role\(\) is null or dk_current_role\(\) not in \([^)]*\)', 'not dk_can(''dispatch'', ''create'')', 'dk_orders', 'p_order_id'],
    ['dk_mark_delivered', 'dk_current_role\(\) is null or dk_current_role\(\) not in \([^)]*\)', 'not dk_can(''dispatch'', ''create'')', 'dk_orders', 'p_order_id'],
    ['dk_register_payment', 'dk_current_role\(\) is null or dk_current_role\(\) not in \([^)]*\)', 'not dk_can(''receivables'', ''create'')', 'dk_orders', 'p_order_id'],
    ['dk_register_waste', 'dk_current_role\(\) is null or dk_current_role\(\) not in \([^)]*\)', 'not dk_can(''inventory'', ''create'')', 'dk_ingredients', 'p_ingredient_id'],
    ['dk_register_adjustment', 'dk_current_role\(\) is null or dk_current_role\(\) not in \([^)]*\)', 'not dk_can(''inventory'', ''create'')', 'dk_ingredients', 'p_ingredient_id'],
    ['dk_create_recipe_version', 'dk_current_role\(\) is null or dk_current_role\(\) not in \([^)]*\)', 'not dk_can(''recipes'', ''create'')', 'dk_products', 'p_product_id'],
    ['dk_confirm_purchase', 'v_role is null or v_role not in \([^)]*\)', 'not dk_can(''purchases'', ''manage'')', 'dk_purchases', 'p_purchase_id'],
    ['dk_find_or_create_customer_by_phone', 'dk_current_role\(\) is null or dk_current_role\(\) not in \([^)]*\)', 'not dk_can(''customers'', ''create'')', '', ''],
    ['dk_create_conversational_order', 'dk_current_role\(\) is null or dk_current_role\(\) not in \([^)]*\)', 'not dk_can(''orders'', ''create'')', '', ''],
    ['dk_copy_menu_plan_range', 'dk_current_role\(\) is null or dk_current_role\(\) not in \([^)]*\)', 'not dk_can(''menu_planner'', ''manage'')', '', ''],
    ['dk_copy_weekly_menu_day', 'dk_current_role\(\) is null or dk_current_role\(\) not in \([^)]*\)', 'not dk_can(''menu_planner'', ''manage'')', '', '']
  ] loop
    select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_spec[1];
    if v_def is null then
      raise exception 'Fase 3: no existe %', v_spec[1];
    end if;

    v_new := regexp_replace(v_def, v_spec[2], v_spec[3]);
    if v_new = v_def then
      raise exception 'Fase 3: % no tiene el control de rol esperado', v_spec[1];
    end if;

    -- Domiciliario: puede entregar sus propios pedidos.
    if v_spec[1] = 'dk_mark_delivered' then
      v_def := v_new;
      v_new := replace(v_new, '(dk_current_role() = ''DELIVERY'' and', '(dk_can(''dispatch'', ''edit'') and');
      if v_new = v_def then
        raise exception 'Fase 3: dk_mark_delivered no tiene la excepción de domiciliario esperada';
      end if;
    end if;

    -- Verificación de Cocina justo después del primer BEGIN del cuerpo.
    v_assert := case
      when v_spec[4] <> '' then format('perform dk_assert_in_active_kitchen(%L, %s);', v_spec[4], v_spec[5])
      else 'perform dk_assert_in_active_kitchen(''dk_kitchens'', null);'
    end;
    v_def := v_new;
    v_new := regexp_replace(v_new, E'\\nbegin\\n', E'\nbegin\n  ' || v_assert || E'\n');
    if v_new = v_def then
      raise exception 'Fase 3: % no tiene un BEGIN reconocible', v_spec[1];
    end if;

    -- Búsquedas que recorrían todas las Cocinas.
    if v_spec[1] = 'dk_find_or_create_customer_by_phone' then
      v_def := v_new;
      v_new := replace(v_new,
        'from dk_customers where phone = p_phone or whatsapp_id = p_phone limit 1',
        'from dk_customers where kitchen_id = dk_current_kitchen_id() and (phone = p_phone or whatsapp_id = p_phone) limit 1');
      if v_new = v_def then raise exception 'Fase 3: búsqueda de cliente no encontrada'; end if;
    elsif v_spec[1] = 'dk_copy_menu_plan_range' then
      v_def := v_new;
      v_new := replace(v_new,
        'where plan_date >= p_from_date and plan_date < p_from_date + p_days',
        'where kitchen_id = dk_current_kitchen_id() and plan_date >= p_from_date and plan_date < p_from_date + p_days');
      v_new := replace(v_new,
        'where plan_date >= p_to_date and plan_date < p_to_date + p_days',
        'where kitchen_id = dk_current_kitchen_id() and plan_date >= p_to_date and plan_date < p_to_date + p_days');
      if (length(v_new) - length(v_def)) <> 2 * length('kitchen_id = dk_current_kitchen_id() and ') then
        raise exception 'Fase 3: filtros de copia de menú no encontrados';
      end if;
    elsif v_spec[1] = 'dk_copy_weekly_menu_day' then
      v_def := v_new;
      v_new := replace(v_new, 'delete from dk_weekly_menu_items where day_of_week = p_to_day',
        'delete from dk_weekly_menu_items where kitchen_id = dk_current_kitchen_id() and day_of_week = p_to_day');
      v_new := replace(v_new, 'where day_of_week = p_from_day',
        'where kitchen_id = dk_current_kitchen_id() and day_of_week = p_from_day');
      if (length(v_new) - length(v_def)) <> 2 * length('kitchen_id = dk_current_kitchen_id() and ') then
        raise exception 'Fase 3: filtros de copia semanal no encontrados';
      end if;
    end if;

    execute v_new;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Funciones invoker con supuestos de una sola Cocina
-- ---------------------------------------------------------------------------

do $$
declare
  v_def text;
  v_new text;
begin
  -- Señales de cocina: SLA de la Cocina activa (antes: fila id = 1).
  select pg_get_functiondef('public.dk_kitchen_signals(integer)'::regprocedure) into v_def;
  v_new := replace(v_def, 'from dk_kitchen_sla_settings where id = 1', 'from dk_kitchen_sla_settings where kitchen_id = dk_current_kitchen_id()');
  if v_new = v_def then raise exception 'Fase 3: dk_kitchen_signals sin SLA id = 1'; end if;
  execute v_new;

  -- "Hoy" de la Cocina en vez de la fecha UTC del servidor.
  select pg_get_functiondef('public.dk_dashboard_summary()'::regprocedure) into v_def;
  v_new := regexp_replace(v_def, '\mcurrent_date\M', 'dk_kitchen_today()', 'gi');
  if v_new = v_def then raise exception 'Fase 3: dk_dashboard_summary sin current_date'; end if;
  execute v_new;

  select pg_get_functiondef('public.dk_today_day_of_week()'::regprocedure) into v_def;
  v_new := regexp_replace(v_def, '\mcurrent_date\M', 'dk_kitchen_today()', 'gi');
  if v_new = v_def then raise exception 'Fase 3: dk_today_day_of_week sin current_date'; end if;
  execute v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Vistas: filtradas por Cocina activa (también dentro de funciones SECURITY DEFINER)
-- ---------------------------------------------------------------------------

create or replace view dk_today_menu with (security_invoker = true) as
  select p.id as product_id,
    p.name as product,
    coalesce(m.special_price, p.price) as price,
    p.description,
    pc.name as category,
    m.display_order,
    true as available
  from dk_menu_plan_items m
    join dk_products p on p.id = m.product_id
    left join dk_product_categories pc on pc.id = p.category_id
  where m.kitchen_id = dk_current_kitchen_id()
    and m.plan_date = dk_kitchen_today()
    and m.is_active and p.active
  order by m.display_order, p.name;

create or replace view dk_receivables with (security_invoker = true) as
  select o.id as order_id,
    o.order_number,
    o.customer_id,
    c.full_name as customer_name,
    c.phone as customer_phone,
    o.status,
    o.total,
    coalesce(p.paid, 0::numeric) as paid_amount,
    o.total - coalesce(p.paid, 0::numeric) as balance,
    o.due_date,
    o.created_at
  from dk_orders o
    join dk_customers c on c.id = o.customer_id
    left join (
      select dk_order_payments.order_id, sum(dk_order_payments.amount) as paid
      from dk_order_payments
      group by dk_order_payments.order_id
    ) p on p.order_id = o.id
  where o.kitchen_id = dk_current_kitchen_id()
    and o.status <> 'CANCELADO'::dk_order_status
    and (o.total - coalesce(p.paid, 0::numeric)) <> 0::numeric
    and dk_can('receivables', 'view');

create or replace view dk_supply_suggestions with (security_invoker = true) as
  with outflow as (
    select dk_inventory_movements.ingredient_id,
      sum(case when dk_inventory_movements.movement_type = 'CONSUMO'::dk_movement_type then - dk_inventory_movements.quantity_base_unit else 0::numeric end) as consumed_30d,
      sum(case when dk_inventory_movements.movement_type = 'MERMA'::dk_movement_type then - dk_inventory_movements.quantity_base_unit else 0::numeric end) as wasted_30d
    from dk_inventory_movements
    where dk_inventory_movements.created_at >= (now() - '30 days'::interval)
      and dk_inventory_movements.kitchen_id = dk_current_kitchen_id()
    group by dk_inventory_movements.ingredient_id
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
    greatest(0::numeric, coalesce(i.max_stock, i.min_stock * 2::numeric) - coalesce(st.stock_available, 0::numeric)) as suggested_quantity
  from dk_ingredients i
    join dk_units u on u.id = i.base_unit_id
    left join dk_ingredient_stock st on st.ingredient_id = i.id
    left join dk_suppliers s on s.id = i.primary_supplier_id
    left join outflow o on o.ingredient_id = i.id
  where i.active
    and i.kitchen_id = dk_current_kitchen_id()
    and dk_can('inventory', 'view');

-- ---------------------------------------------------------------------------
-- Storage: archivos bajo kitchens/{kitchen_id}/…
-- ---------------------------------------------------------------------------

drop policy dk_attachments_storage_select on storage.objects;
drop policy dk_attachments_storage_insert on storage.objects;
drop policy dk_attachments_storage_delete on storage.objects;

create policy dk_attachments_storage_select on storage.objects for select to authenticated
  using (
    bucket_id = 'dk-attachments'
    and (storage.foldername(name))[1] = 'kitchens'
    and (storage.foldername(name))[2] = (select dk_current_kitchen_id())::text
    and ((select dk_can('purchases', 'view')) or (select dk_can('products', 'view')))
  );
create policy dk_attachments_storage_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dk-attachments'
    and (storage.foldername(name))[1] = 'kitchens'
    and (storage.foldername(name))[2] = (select dk_current_kitchen_id())::text
    and ((select dk_can('purchases', 'create')) or (select dk_can('products', 'edit')))
  );
create policy dk_attachments_storage_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'dk-attachments'
    and (storage.foldername(name))[1] = 'kitchens'
    and (storage.foldername(name))[2] = (select dk_current_kitchen_id())::text
    and ((select dk_can('purchases', 'create')) or (select dk_can('products', 'edit')))
  );
