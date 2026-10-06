-- ADR 0033, phase 2: «¿dónde registro un pago?» — Copilot's app help only
-- explains what the person can do. The context now also says which actions
-- the person may take (it still reads nothing else, and still runs as them).
create or replace function dk_copilot_context()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_kitchen dk_kitchens;
  v_tz text;
begin
  perform dk_require('copilot.use');
  select * into v_kitchen from dk_kitchens where id = dk_current_kitchen_id();
  v_tz := coalesce(v_kitchen.timezone, 'America/Bogota');
  return jsonb_build_object(
    'account', v_kitchen.name,
    'timezone', v_tz,
    'currency', coalesce(v_kitchen.currency, 'COP'),
    'today', (now() at time zone v_tz)::date,
    'now', to_char(now() at time zone v_tz, 'YYYY-MM-DD HH24:MI'),
    'person', (select full_name from dk_users where id = dk_current_profile_id()),
    'permissions', (select coalesce(jsonb_agg(p), '[]'::jsonb) from unnest(array[
        'reports.view', 'reports.profitability', 'orders.view', 'kitchen.view', 'products.view', 'recipes.view',
        'inventory.view', 'purchasing.view', 'customers.view', 'receivables.view', 'dispatch.view', 'staff.view']) p
      where dk_can(p)),
    'actions', (select coalesce(jsonb_agg(p), '[]'::jsonb) from unnest(array[
        'orders.create', 'orders.edit', 'orders.confirm', 'orders.cancel', 'kitchen.prepare', 'kitchen.prioritize',
        'dispatch.assign', 'dispatch.deliver', 'dispatch.riders', 'receivables.collect', 'customers.create', 'customers.edit',
        'menus.edit', 'products.create', 'products.edit', 'recipes.edit', 'inventory.create', 'inventory.adjust',
        'purchasing.create', 'purchasing.confirm', 'suppliers.edit', 'staff.manage', 'team.manage', 'settings.manage', 'ai.manage',
        'voice.use']) p
      where dk_can(p)));
end;
$$;
