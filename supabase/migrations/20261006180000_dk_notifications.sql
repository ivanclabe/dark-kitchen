-- ADR 0037: the notification center (the bell) and the account alerts without Copilot.
--
--   * dk_my_notifications(): every notice of the ACTIVE account for this person,
--     computed here with their permissions:
--       operation  late orders, orders to confirm, ingredients under the minimum,
--                  customers with an overdue balance;
--       ai         the high/medium items of the LAST analysis of each AI feature
--                  (24 h), the failed analyses and the analyses quota. Nothing is
--                  analysed here: it only reads what is stored (no AI cost);
--       account    the free trial and the plan limits (whoever sees billing).
--     Each notice has a stable key that carries its state ("late_orders:<day>:3"):
--     when the state changes it comes back as new.
--   * dk_notification_reads: what each person has seen (their own rows only).
--   * dk_account_alerts(): Copilot no longer counts as «análisis de IA» (it has its
--     own quota and metrics in «IA y voz», ADR 0033).

create table if not exists dk_notification_reads (
  profile_id uuid not null references dk_users (id) on delete cascade,
  kitchen_id uuid not null references dk_kitchens (id) on delete cascade,
  key text not null check (length(key) between 1 and 300),
  read_at timestamptz not null default now(),
  primary key (profile_id, kitchen_id, key)
);

alter table dk_notification_reads enable row level security;

drop policy if exists dk_notification_reads_own on dk_notification_reads;
create policy dk_notification_reads_own on dk_notification_reads
  for all to authenticated
  using (profile_id = (select dk_current_profile_id()))
  with check (profile_id = (select dk_current_profile_id()));

revoke all on dk_notification_reads from anon;

-- ---------------------------------------------------------------------------

create or replace function dk_my_notifications()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_me uuid := dk_current_profile_id();
  v_k dk_kitchens;
  v_day date;
  v_items jsonb := '[]';
  v_n integer;
  v_sub dk_subscriptions;
  v_limits jsonb;
  v_daily integer;
  v_runs integer;
  r record;
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  if v_me is null then raise exception 'No autorizado' using errcode = '42501'; end if;
  select * into v_k from dk_kitchens where id = v_kitchen;
  v_day := dk_local_date(now(), v_k.timezone);

  -- Operation ---------------------------------------------------------------
  if dk_can('kitchen.view') or dk_can('orders.view') then
    v_n := dk_late_orders_count(v_kitchen);
    if v_n > 0 then
      v_items := v_items || jsonb_build_object('key', format('late_orders:%s:%s', v_day, v_n), 'group', 'operation', 'type', 'late_orders',
        'severity', 'warning', 'title', format('%s %s atrasado%s', v_n, case when v_n = 1 then 'pedido' else 'pedidos' end, case when v_n = 1 then '' else 's' end),
        'detail', 'Superaron el tiempo objetivo de su estado.', 'to', '/operations?view=kitchen', 'action', 'Ver en Cocina', 'at', now(), 'ongoing', true);
    end if;
  end if;
  if dk_can('orders.view') then
    select count(*) into v_n from dk_orders where kitchen_id = v_kitchen and status = 'NUEVO';
    if v_n > 0 then
      v_items := v_items || jsonb_build_object('key', format('to_confirm:%s:%s', v_day, v_n), 'group', 'operation', 'type', 'to_confirm',
        'severity', 'info', 'title', format('%s %s por confirmar', v_n, case when v_n = 1 then 'pedido' else 'pedidos' end),
        'detail', 'Confírmalos para que pasen a la cocina.', 'to', '/operations?view=list&status=NUEVO&range=all', 'action', 'Ver pedidos', 'at', now(), 'ongoing', true);
    end if;
  end if;
  if dk_can('inventory.view') then
    select count(*) into v_n from dk_ingredient_stock s join dk_ingredients i on i.id = s.ingredient_id
    where s.kitchen_id = v_kitchen and i.active and s.stock_available <= i.min_stock;
    if v_n > 0 then
      v_items := v_items || jsonb_build_object('key', format('low_stock:%s:%s', v_day, v_n), 'group', 'operation', 'type', 'low_stock',
        'severity', 'warning', 'title', format('%s %s bajo el mínimo', v_n, case when v_n = 1 then 'insumo' else 'insumos' end),
        'detail', 'Revisa «Reponer» para armar la compra.', 'to', '/supply/stock?filter=low', 'action', 'Ver stock', 'at', now(), 'ongoing', true);
    end if;
  end if;
  if dk_can('customers.view') and dk_can('receivables.view') then
    select count(*) into v_n from dk_customers_with_stats(v_kitchen, v_day) where overdue > 0;
    if v_n > 0 then
      v_items := v_items || jsonb_build_object('key', format('overdue:%s:%s', v_day, v_n), 'group', 'operation', 'type', 'overdue_customers',
        'severity', 'info', 'title', format('%s %s con saldo vencido', v_n, case when v_n = 1 then 'cliente' else 'clientes' end),
        'detail', 'Tienen pedidos cuya fecha de pago ya pasó.', 'to', '/customers?status=overdue', 'action', 'Ver clientes', 'at', now(), 'ongoing', true);
    end if;
  end if;

  -- AI: the last analysis of each feature this person can use (no Copilot) -------------
  for r in
    select distinct on (i.feature_key) i.id, i.feature_key, i.output, i.created_at, f.label
    from dk_ai_insights i join dk_features f on f.key = i.feature_key
    where i.kitchen_id = v_kitchen and i.feature_key <> 'copilot' and i.status = 'ok'
      and i.created_at > now() - interval '24 hours' and dk_can_use_feature(i.feature_key)
    order by i.feature_key, i.created_at desc
  loop
    v_items := v_items || coalesce((
      select jsonb_agg(jsonb_build_object(
        -- The same advice in the next analysis keeps its key: it does not come back as new.
        'key', format('ai:%s:%s:%s', r.feature_key, coalesce(it ->> 'ref_id', md5(lower(it ->> 'title'))), it ->> 'priority'),
        'group', 'ai', 'type', r.feature_key,
        'severity', case when it ->> 'priority' = 'alta' then 'warning' else 'info' end,
        'title', it ->> 'title', 'detail', it ->> 'explanation', 'source', r.label,
        'to', case
          when r.feature_key like 'kitchen%' and it ->> 'ref_id' is not null then '/operations/' || (it ->> 'ref_id')
          when r.feature_key like 'kitchen%' then '/operations?view=kitchen'
          when it ->> 'ref_id' is not null then '/supply/stock/' || (it ->> 'ref_id')
          else '/supply/stock' end,
        'action', case when r.feature_key like 'kitchen%' then 'Ver en Cocina' else 'Ver insumo' end,
        'at', r.created_at, 'ongoing', false) order by ord)
      from (
        select it, ord from jsonb_array_elements(coalesce(r.output -> 'items', '[]')) with ordinality as x(it, ord)
        where it ->> 'priority' in ('alta', 'media') and coalesce(it ->> 'title', '') <> ''
        order by ord limit 5
      ) top
    ), '[]');
  end loop;

  -- AI: failed analyses (by feature) and the quota: for whoever manages or watches the AI.
  if dk_has_org_permission(v_k.organization_id, 'features.manage') or dk_has_org_permission(v_k.organization_id, 'observability.view') or dk_can('ai.manage') then
    for r in
      select i.feature_key, f.label, count(*) n, max(i.created_at) last_at, (array_agg(i.id order by i.created_at desc))[1] last_id
      from dk_ai_insights i join dk_features f on f.key = i.feature_key
      where i.kitchen_id = v_kitchen and i.feature_key <> 'copilot' and i.status = 'error' and i.created_at > now() - interval '24 hours'
      group by i.feature_key, f.label
    loop
      v_items := v_items || jsonb_build_object('key', format('ai_error:%s:%s', r.feature_key, r.last_id), 'group', 'ai', 'type', 'ai_error',
        'severity', 'error', 'title', format('%s: %s %s', r.label, r.n, case when r.n = 1 then 'análisis falló' else 'análisis fallaron' end),
        'detail', 'En las últimas 24 horas. La pantalla sigue funcionando con las reglas fijas.', 'source', r.label,
        'to', '/settings/ai?tab=usage', 'action', 'Ver uso de IA', 'at', r.last_at, 'ongoing', false);
    end loop;

    select * into v_sub from dk_subscriptions where organization_id = v_k.organization_id;
    select limits into v_limits from dk_plans where key = v_sub.plan_key;
    v_daily := coalesce((v_limits ->> 'ai_runs_per_day')::integer, 50);
    select count(*) into v_runs from dk_ai_insights
    where kitchen_id = v_kitchen and feature_key <> 'copilot' and status in ('ok', 'error', 'running') and created_at > now() - interval '24 hours';
    if v_runs >= 0.8 * v_daily then
      v_items := v_items || jsonb_build_object('key', format('ai_quota:%s:%s', v_day, case when v_runs >= v_daily then 'full' else 'near' end), 'group', 'ai', 'type', 'ai_quota',
        'severity', case when v_runs >= v_daily then 'error' else 'warning' end,
        'title', format('Análisis de IA: %s de %s en 24 h', least(v_runs, v_daily), v_daily),
        'detail', case when v_runs >= v_daily then 'Se llegó al tope del plan: las pantallas usan las reglas fijas hasta que se libere.' else 'Cerca del tope del plan.' end,
        'to', '/settings/ai?tab=usage', 'action', 'Ver uso de IA', 'at', now(), 'ongoing', true);
    end if;
  end if;

  -- Account: the plan covers every account of the business (whoever sees billing) ------------
  if dk_has_org_permission(v_k.organization_id, 'billing.view') then
    if v_sub.organization_id is null then
      select * into v_sub from dk_subscriptions where organization_id = v_k.organization_id;
      select limits into v_limits from dk_plans where key = v_sub.plan_key;
    end if;
    if v_sub.status = 'trialing' and v_sub.trial_ends_at < now() + interval '3 days' then
      v_items := v_items || jsonb_build_object('key', format('trial:%s:%s', v_sub.trial_ends_at::date, v_sub.trial_ends_at < now()), 'group', 'account', 'type', 'trial',
        'severity', case when v_sub.trial_ends_at < now() then 'error' else 'warning' end,
        'title', case when v_sub.trial_ends_at < now() then 'La prueba gratis terminó' else format('La prueba gratis termina el %s', to_char(v_sub.trial_ends_at, 'DD/MM/YYYY')) end,
        'detail', 'Elige un plan para seguir operando sin interrupciones.', 'to', '/settings/billing', 'action', 'Ver plan', 'at', now(), 'ongoing', true);
    end if;
    if (v_limits ->> 'accounts') is not null and (select count(*) from dk_kitchens where organization_id = v_k.organization_id) >= (v_limits ->> 'accounts')::integer then
      v_items := v_items || jsonb_build_object('key', format('plan_limit:accounts:%s', v_limits ->> 'accounts'), 'group', 'account', 'type', 'plan_limit',
        'severity', 'info', 'title', 'Llegaste al límite de cuentas de tu plan', 'detail', 'Para abrir otro local, cambia de plan.',
        'to', '/settings/billing', 'action', 'Ver plan', 'at', now(), 'ongoing', true);
    end if;
    if (v_limits ->> 'users') is not null
       and (select count(*) from dk_organization_members where organization_id = v_k.organization_id and status in ('active', 'pending')) >= (v_limits ->> 'users')::integer then
      v_items := v_items || jsonb_build_object('key', format('plan_limit:users:%s', v_limits ->> 'users'), 'group', 'account', 'type', 'plan_limit',
        'severity', 'info', 'title', 'Llegaste al límite de usuarios de tu plan', 'detail', 'Para sumar a alguien más, cambia de plan o desactiva a quien ya no trabaja.',
        'to', '/settings/billing', 'action', 'Ver plan', 'at', now(), 'ongoing', true);
    end if;
  end if;

  -- What this person has already seen.
  select coalesce(jsonb_agg(n || jsonb_build_object('read', rd.key is not null) order by (rd.key is not null), (n ->> 'at')::timestamptz desc), '[]')
  into v_items
  from jsonb_array_elements(v_items) n
  left join dk_notification_reads rd on rd.profile_id = v_me and rd.kitchen_id = v_kitchen and rd.key = n ->> 'key';

  return jsonb_build_object('generatedAt', now(), 'items', v_items,
    'unread', (select count(*) from jsonb_array_elements(v_items) n where not (n ->> 'read')::boolean));
end;
$$;

-- «Visto»: only the caller's own rows; old ones are cleaned up as it goes.
create or replace function dk_mark_notifications_read(p_keys text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_me uuid := dk_current_profile_id();
  v_n integer;
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  if v_me is null then raise exception 'No autorizado' using errcode = '42501'; end if;
  if coalesce(array_length(p_keys, 1), 0) > 200 then raise exception 'Demasiadas notificaciones a la vez'; end if;
  insert into dk_notification_reads (profile_id, kitchen_id, key)
  select v_me, v_kitchen, k from unnest(p_keys) k where k is not null and length(k) between 1 and 300
  on conflict do nothing;
  get diagnostics v_n = row_count;
  delete from dk_notification_reads where profile_id = v_me and read_at < now() - interval '30 days';
  return v_n;
end;
$$;

revoke all on function dk_my_notifications() from public, anon;
revoke all on function dk_mark_notifications_read(text[]) from public, anon;
grant execute on function dk_my_notifications() to authenticated;
grant execute on function dk_mark_notifications_read(text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- D4: the account alerts count the AI ANALYSES only (Copilot has its own quota and metrics).

create or replace function dk_account_alerts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_k dk_kitchens;
  v_sub dk_subscriptions;
  v_limits jsonb;
  v_daily integer;
  v_late integer;
  v_low integer;
  v_ai_runs integer;
  v_ai_errors integer;
  v_alerts jsonb := '[]';
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  if not dk_can('dashboard.view') then
    raise exception 'No autorizado para ver las alertas de esta cuenta' using errcode = '42501';
  end if;
  select * into v_k from dk_kitchens where id = v_kitchen;
  select * into v_sub from dk_subscriptions where organization_id = v_k.organization_id;
  select limits into v_limits from dk_plans where key = v_sub.plan_key;
  v_daily := coalesce((v_limits ->> 'ai_runs_per_day')::integer, 50);

  v_late := dk_late_orders_count(v_kitchen);
  select count(*) into v_low from dk_ingredient_stock s join dk_ingredients i on i.id = s.ingredient_id
  where s.kitchen_id = v_kitchen and i.active and s.stock_available <= i.min_stock;
  select count(*) filter (where status in ('ok', 'error')), count(*) filter (where status = 'error') into v_ai_runs, v_ai_errors
  from dk_ai_insights where kitchen_id = v_kitchen and feature_key <> 'copilot' and created_at > now() - interval '24 hours';

  if v_late > 0 then
    v_alerts := v_alerts || jsonb_build_object('severity', 'warning', 'type', 'late_orders',
      'message', format('%s %s atrasado%s ahora', v_late, case when v_late = 1 then 'pedido' else 'pedidos' end, case when v_late = 1 then '' else 's' end));
  end if;
  if v_low > 0 then
    v_alerts := v_alerts || jsonb_build_object('severity', 'info', 'type', 'low_stock',
      'message', format('%s %s bajo el mínimo', v_low, case when v_low = 1 then 'insumo' else 'insumos' end));
  end if;
  if v_ai_errors > 0 then
    v_alerts := v_alerts || jsonb_build_object('severity', 'error', 'type', 'ai_errors',
      'message', format('%s análisis de IA con error en 24 h', v_ai_errors));
  end if;
  if v_ai_runs >= 0.8 * v_daily then
    v_alerts := v_alerts || jsonb_build_object('severity', 'warning', 'type', 'ai_quota',
      'message', format('Esta cuenta usó %s de %s análisis de IA en 24 h', v_ai_runs, v_daily));
  end if;

  -- The plan covers all the accounts of the business: only whoever sees billing gets these.
  if dk_has_org_permission(v_k.organization_id, 'billing.view') then
    if v_sub.status = 'trialing' and v_sub.trial_ends_at < now() + interval '3 days' then
      v_alerts := v_alerts || jsonb_build_object('severity', case when v_sub.trial_ends_at < now() then 'error' else 'warning' end, 'type', 'trial',
        'message', case when v_sub.trial_ends_at < now() then 'La prueba gratis terminó' else format('La prueba gratis termina el %s', to_char(v_sub.trial_ends_at, 'DD/MM/YYYY')) end);
    end if;
    if (v_limits ->> 'accounts') is not null
       and (select count(*) from dk_kitchens where organization_id = v_k.organization_id) >= (v_limits ->> 'accounts')::integer then
      v_alerts := v_alerts || jsonb_build_object('severity', 'info', 'type', 'plan_limit', 'message', 'Llegaste al límite de cuentas de tu plan');
    end if;
    if (v_limits ->> 'users') is not null
       and (select count(*) from dk_organization_members where organization_id = v_k.organization_id and status in ('active', 'pending')) >= (v_limits ->> 'users')::integer then
      v_alerts := v_alerts || jsonb_build_object('severity', 'info', 'type', 'plan_limit', 'message', 'Llegaste al límite de usuarios de tu plan');
    end if;
  end if;

  return jsonb_build_object('generatedAt', now(), 'alerts', v_alerts);
end;
$$;

notify pgrst, 'reload schema';
