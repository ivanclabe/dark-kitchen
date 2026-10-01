-- ADR 0020: what Copilot needs to know before answering — the account, "today"
-- in its time zone, its currency and which data areas this person may query
-- (the tools offered to the model). Runs as the person; reads nothing else.
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
      where dk_can(p)));
end;
$$;

revoke execute on function dk_copilot_context() from public, anon;
grant execute on function dk_copilot_context() to authenticated;
