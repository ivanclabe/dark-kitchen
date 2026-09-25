-- Fase 0 (ADR 0007). Ver supabase/migrations/20260924170000_dk_phase0_security.sql (comentado).
create or replace function dk_has_any_profile()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from dk_users);
$$;

revoke all on function dk_has_any_profile() from public, anon;
grant execute on function dk_has_any_profile() to authenticated;

drop policy dk_users_insert on dk_users;
create policy dk_users_insert on dk_users for insert to authenticated
  with check (
    dk_current_role() = 'ADMIN'
    or (
      auth_user_id = auth.uid()
      and not exists (select 1 from dk_users u where u.auth_user_id = auth.uid())
      and (
        (not dk_has_any_profile() and role = 'ADMIN')
        or (dk_has_any_profile() and role = 'CASHIER' and active = false)
      )
    )
  );

do $$
declare
  v_name text;
  v_def text;
  v_new text;
  v_functions text[] := array[
    'dk_advance_kitchen_item', 'dk_cancel_order', 'dk_confirm_order', 'dk_confirm_purchase',
    'dk_copy_menu_plan_range', 'dk_copy_weekly_menu_day', 'dk_create_conversational_order',
    'dk_create_recipe_version', 'dk_dispatch_order', 'dk_find_or_create_customer_by_phone',
    'dk_mark_delivered', 'dk_register_adjustment', 'dk_register_payment', 'dk_register_waste',
    'dk_revert_kitchen_item', 'dk_set_ticket_priority'
  ];
begin
  foreach v_name in array v_functions loop
    select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_name;

    if v_def is null then
      raise exception 'Fase 0: no existe la función %', v_name;
    end if;

    v_new := replace(v_def, 'if dk_current_role() not in (', 'if dk_current_role() is null or dk_current_role() not in (');
    v_new := replace(v_new, 'if v_role not in (', 'if v_role is null or v_role not in (');

    if v_new = v_def then
      raise exception 'Fase 0: % no tiene el patrón de control de rol esperado; revisar a mano', v_name;
    end if;

    execute v_new;
  end loop;
end;
$$;

alter policy dk_products_select on dk_products using (dk_current_role() is not null);
alter policy dk_product_categories_select on dk_product_categories using (dk_current_role() is not null);
alter policy dk_menu_plan_items_select on dk_menu_plan_items using (dk_current_role() is not null);
alter policy dk_delivery_riders_select on dk_delivery_riders using (dk_current_role() is not null);
alter policy dk_ingredient_categories_select on dk_ingredient_categories using (dk_current_role() is not null);
alter policy dk_units_select on dk_units using (dk_current_role() is not null);
alter policy dk_menus_select on dk_menus using (dk_current_role() is not null);
alter policy dk_menu_items_select on dk_menu_items using (dk_current_role() is not null);
alter policy dk_daily_availability_select on dk_daily_availability using (dk_current_role() is not null);
alter policy dk_weekly_menu_items_select on dk_weekly_menu_items using (dk_current_role() is not null);

alter view dk_today_menu set (security_invoker = true);
