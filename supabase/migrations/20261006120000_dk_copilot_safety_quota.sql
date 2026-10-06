-- ADR 0033, phase 0: Copilot safe before it gets a voice.
--
-- 1. R1 — a Copilot question and its answer are read only by whoever asked
--    (the answer may hold data other roles cannot see). The automatic AI
--    analyses keep their account-wide visibility. A run is always written
--    as its author.
-- 2. R2 — the quota is reserved atomically: dk_ai_run_reserve checks and
--    writes a 'running' row in the same transaction (under a lock), so two
--    tabs cannot both pass the interval or the daily limit;
--    dk_ai_run_finish closes it (ok / error / cancelled) with its metrics.
-- 3. R3 — Copilot has its own daily limit (half of the plan's AI runs) and
--    no longer spends the automatic analyses' budget, nor they its own.
--    Its interval is per person, not per account.
-- 4. The run keeps what makes Copilot measurable (ADR 0033, phase 4):
--    intent, scope, timings and the person's 👍/👎.
-- 5. R4 / R5 — tools: no customer phones unless asked for contact; «paid»
--    only for whoever sees the receivables; «in the kitchen» without the
--    ready ones; sales say how much is still unconfirmed (counted as in
--    Insights); shifts over a range of days.

-- ---------------------------------------------------------------------------
-- 4. The run: statuses and metrics
-- ---------------------------------------------------------------------------
alter table dk_ai_insights drop constraint if exists dk_ai_insights_status_check;
alter table dk_ai_insights add constraint dk_ai_insights_status_check check (status in ('ok', 'empty', 'error', 'running', 'cancelled'));
alter table dk_ai_insights
  add column intent text,
  add column scope text check (scope in ('answered', 'partial', 'no_data', 'not_allowed', 'unsupported', 'out_of_scope', 'action', 'clarify')),
  add column feedback smallint check (feedback in (-1, 1)),
  add column timings jsonb;

comment on column dk_ai_insights.intent is 'ADR 0033: what the question was about (sales, orders, app_help…), as Copilot closed it.';
comment on column dk_ai_insights.scope is 'ADR 0033: whether it could be answered (answered, no_data, not_allowed, unsupported, out_of_scope, action, clarify, partial).';
comment on column dk_ai_insights.feedback is 'ADR 0033: the person''s 👍 (1) or 👎 (-1).';
comment on column dk_ai_insights.timings is 'ADR 0033: milliseconds per model round and per tool, and the client''s own timings.';

create index if not exists dk_ai_insights_author_idx on dk_ai_insights (kitchen_id, feature_key, created_by, created_at desc);

-- ---------------------------------------------------------------------------
-- 1. Who reads a run
-- ---------------------------------------------------------------------------
drop policy if exists dk_ai_insights_select on dk_ai_insights;
create policy dk_ai_insights_select on dk_ai_insights for select to authenticated using (
  kitchen_id = (select dk_current_kitchen_id())
  and dk_can_use_feature(feature_key)
  and (feature_key <> 'copilot' or created_by = (select dk_current_profile_id()))
);

drop policy if exists dk_ai_insights_insert on dk_ai_insights;
create policy dk_ai_insights_insert on dk_ai_insights for insert to authenticated with check (
  kitchen_id = (select dk_current_kitchen_id())
  and dk_can_use_feature(feature_key)
  and created_by is not distinct from (select dk_current_profile_id())
);

-- ---------------------------------------------------------------------------
-- 2 + 3. Quota
-- ---------------------------------------------------------------------------
create or replace function dk_ai_run_allowed(p_feature_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_me uuid := dk_current_profile_id();
  v_copilot boolean := p_feature_key = 'copilot';
  v_org uuid;
  v_limits jsonb;
  v_feature dk_features;
  v_interval integer;
  v_daily integer;
  v_last timestamptz;
  v_used integer;
  v_oldest timestamptz;
begin
  if v_kitchen is null or not dk_can_use_feature(p_feature_key) then
    return jsonb_build_object('allowed', false, 'reason', 'feature', 'retryAfterSeconds', null, 'remainingToday', 0);
  end if;
  select * into v_feature from dk_features where key = p_feature_key;
  select organization_id into v_org from dk_kitchens where id = v_kitchen;
  select p.limits into v_limits from dk_subscriptions s join dk_plans p on p.key = s.plan_key where s.organization_id = v_org;
  v_interval := coalesce(v_feature.min_interval_seconds, (v_limits ->> 'ai_min_interval_seconds')::integer, 120);
  v_daily := coalesce((v_limits ->> 'ai_runs_per_day')::integer, 50);
  -- ADR 0033 (D5): Copilot has half of the plan's AI runs for itself; the analyses keep theirs.
  if v_copilot then v_daily := greatest(1, ceil(v_daily * 0.5)::integer); end if;

  -- The interval: per person for Copilot (a question each), per account for the analyses.
  select max(created_at) into v_last from dk_ai_insights
  where kitchen_id = v_kitchen and feature_key = p_feature_key and status in ('ok', 'error', 'running')
    and (not v_copilot or created_by is not distinct from v_me);
  if v_last is not null and v_last > now() - make_interval(secs => v_interval) then
    return jsonb_build_object('allowed', false, 'reason', 'interval',
      'retryAfterSeconds', ceil(extract(epoch from (v_last + make_interval(secs => v_interval)) - now()))::integer,
      'remainingToday', null);
  end if;

  select count(*), min(created_at) into v_used, v_oldest from dk_ai_insights
  where kitchen_id = v_kitchen and status in ('ok', 'error', 'running') and created_at > now() - interval '24 hours'
    and (case when v_copilot then feature_key = 'copilot' else feature_key <> 'copilot' end);
  if v_used >= v_daily then
    return jsonb_build_object('allowed', false, 'reason', 'daily',
      'retryAfterSeconds', ceil(extract(epoch from (v_oldest + interval '24 hours') - now()))::integer,
      'remainingToday', 0);
  end if;

  return jsonb_build_object('allowed', true, 'reason', null, 'retryAfterSeconds', null, 'remainingToday', v_daily - v_used,
    'model', (select m.key from dk_ai_models m where m.key = v_feature.model_key and m.active));
end;
$$;

-- Checks and reserves in one step: two requests at once cannot both pass.
create or replace function dk_ai_run_reserve(p_feature_key text, p_input jsonb default '{}')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_quota jsonb;
  v_id uuid;
begin
  if v_kitchen is null then
    return jsonb_build_object('allowed', false, 'reason', 'feature', 'retryAfterSeconds', null, 'remainingToday', 0);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dk_ai_run:' || v_kitchen::text || ':' || p_feature_key, 0));
  v_quota := dk_ai_run_allowed(p_feature_key);
  if not coalesce((v_quota ->> 'allowed')::boolean, false) or v_quota ->> 'model' is null then
    return v_quota;
  end if;
  insert into dk_ai_insights (kitchen_id, feature_key, status, input, model, created_by)
  values (v_kitchen, p_feature_key, 'running', coalesce(p_input, '{}'), v_quota ->> 'model', dk_current_profile_id())
  returning id into v_id;
  return v_quota || jsonb_build_object('runId', v_id, 'remainingToday', greatest(0, (v_quota ->> 'remainingToday')::integer - 1));
end;
$$;

-- Closes a reserved run (only its author, only once).
create or replace function dk_ai_run_finish(
  p_run_id uuid, p_status text, p_output jsonb default null, p_input jsonb default null, p_input_tokens integer default null,
  p_output_tokens integer default null, p_latency_ms integer default null, p_error text default null,
  p_intent text default null, p_scope text default null, p_timings jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('ok', 'empty', 'error', 'cancelled') then
    raise exception 'Estado de corrida no válido';
  end if;
  update dk_ai_insights set
    status = p_status, output = p_output, input = coalesce(p_input, input),
    input_tokens = p_input_tokens, output_tokens = p_output_tokens, latency_ms = p_latency_ms,
    error = left(p_error, 500), intent = left(p_intent, 40), scope = p_scope, timings = p_timings
  where id = p_run_id and status = 'running'
    and kitchen_id = dk_current_kitchen_id() and created_by is not distinct from dk_current_profile_id();
end;
$$;

-- The person's 👍/👎 on their own answer.
create or replace function dk_ai_run_feedback(p_run_id uuid, p_value smallint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_value is not null and p_value not in (-1, 1) then
    raise exception 'Valor no válido';
  end if;
  update dk_ai_insights set feedback = p_value
  where id = p_run_id and feature_key = 'copilot'
    and kitchen_id = dk_current_kitchen_id() and created_by is not distinct from dk_current_profile_id();
end;
$$;

revoke execute on function dk_ai_run_reserve(text, jsonb), dk_ai_run_finish(uuid, text, jsonb, jsonb, integer, integer, integer, text, text, text, jsonb),
  dk_ai_run_feedback(uuid, smallint) from public, anon;
grant execute on function dk_ai_run_reserve(text, jsonb), dk_ai_run_finish(uuid, text, jsonb, jsonb, integer, integer, integer, text, text, text, jsonb),
  dk_ai_run_feedback(uuid, smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Tools
-- ---------------------------------------------------------------------------

-- Sales: same rule as Insights (everything not cancelled), plus how much of it is still unconfirmed.
create or replace function dk_copilot_sales(p_from date, p_to date, p_group_by text default 'day', p_compare boolean default false)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  tz text := dk_account_tz();
  v_summary jsonb;
  v_groups jsonb;
  v_prev jsonb;
  v_days integer := p_to - p_from + 1;
begin
  perform dk_require('reports.view');
  perform dk_copilot_range(p_from, p_to);

  select jsonb_build_object('from', p_from, 'to', p_to, 'orders', count(*), 'total', coalesce(sum(total), 0), 'avgTicket', coalesce(round(avg(total)), 0),
                            'unconfirmedOrders', count(*) filter (where status = 'NUEVO'),
                            'unconfirmedTotal', coalesce(sum(total) filter (where status = 'NUEVO'), 0))
    into v_summary
  from dk_orders where status <> 'CANCELADO' and (created_at at time zone tz)::date between p_from and p_to;

  if p_group_by = 'product' then
    select coalesce(jsonb_agg(x), '[]') into v_groups from (
      select jsonb_build_object('productId', p.id, 'product', p.name, 'quantity', sum(i.quantity), 'total', sum(i.line_total)) x
      from dk_order_items i join dk_orders o on o.id = i.order_id join dk_products p on p.id = i.product_id
      where o.status <> 'CANCELADO' and (o.created_at at time zone tz)::date between p_from and p_to
      group by p.id, p.name order by sum(i.line_total) desc limit 20) t;
  elsif p_group_by = 'customer' then
    select coalesce(jsonb_agg(x), '[]') into v_groups from (
      select jsonb_build_object('customerId', c.id, 'customer', c.full_name, 'orders', count(*), 'total', sum(o.total)) x
      from dk_orders o join dk_customers c on c.id = o.customer_id
      where o.status <> 'CANCELADO' and (o.created_at at time zone tz)::date between p_from and p_to
      group by c.id, c.full_name order by sum(o.total) desc limit 20) t;
  elsif p_group_by in ('channel', 'payment', 'weekday', 'hour') then
    select coalesce(jsonb_agg(x order by k), '[]') into v_groups from (
      select k, jsonb_build_object('key', k, 'orders', count(*), 'total', sum(total)) x from (
        select total, case p_group_by
          when 'channel' then channel::text
          when 'payment' then coalesce(payment_method, 'sin definir')
          when 'weekday' then extract(isodow from created_at at time zone tz)::text   -- 1 = lunes
          else lpad(extract(hour from created_at at time zone tz)::text, 2, '0') end k
        from dk_orders where status <> 'CANCELADO' and (created_at at time zone tz)::date between p_from and p_to) s
      group by k) t;
  else
    select coalesce(jsonb_agg(jsonb_build_object('day', d, 'orders', n, 'total', s) order by d), '[]') into v_groups from (
      select (created_at at time zone tz)::date d, count(*) n, sum(total) s
      from dk_orders where status <> 'CANCELADO' and (created_at at time zone tz)::date between p_from and p_to
      group by 1) t;
  end if;

  if p_compare then
    select jsonb_build_object('from', p_from - v_days, 'to', p_from - 1, 'orders', count(*), 'total', coalesce(sum(total), 0))
      into v_prev
    from dk_orders where status <> 'CANCELADO' and (created_at at time zone tz)::date between p_from - v_days and p_from - 1;
  end if;

  return v_summary || jsonb_build_object('groupBy', coalesce(p_group_by, 'day'), 'groups', v_groups, 'previous', v_prev, 'cancelledExcluded', true,
    'note', 'Como en Insights: cuenta todo pedido no cancelado; unconfirmed* es la parte que sigue por confirmar.');
end;
$$;

-- One order: «paid» only for whoever sees the receivables (otherwise null, never a false 0).
create or replace function dk_copilot_order(p_number integer)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  tz text := dk_account_tz();
  v_order dk_orders;
begin
  perform dk_require('orders.view');
  select * into v_order from dk_orders where order_number = p_number order by created_at desc limit 1;
  if not found then return jsonb_build_object('found', false); end if;
  return jsonb_build_object(
    'found', true, 'id', v_order.id, 'number', v_order.order_number, 'status', v_order.status, 'channel', v_order.channel,
    'createdAt', to_char(v_order.created_at at time zone tz, 'YYYY-MM-DD HH24:MI'),
    'customer', (select jsonb_build_object('id', c.id, 'name', c.full_name) from dk_customers c where c.id = v_order.customer_id),
    'total', v_order.total, 'paymentMethod', v_order.payment_method, 'notes', v_order.notes,
    'paid', case when dk_can('receivables.view') then (select coalesce(sum(amount), 0) from dk_order_payments where order_id = v_order.id) end,
    'paymentVisible', dk_can('receivables.view'),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('productId', p.id, 'product', p.name, 'quantity', i.quantity, 'total', i.line_total,
                                                           'kitchenStatus', i.kitchen_status, 'observation', i.observation)), '[]')
              from dk_order_items i join dk_products p on p.id = i.product_id where i.order_id = v_order.id),
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('at', to_char(h.changed_at at time zone tz, 'YYYY-MM-DD HH24:MI'), 'to', h.to_status,
                                                              'by', u.full_name, 'note', h.note) order by h.changed_at), '[]')
                 from dk_order_status_history h left join dk_users u on u.id = h.changed_by where h.order_id = v_order.id),
    'delivery', (select jsonb_build_object('rider', r.full_name, 'status', d.status,
                                           'dispatchedAt', to_char(d.dispatched_at at time zone tz, 'YYYY-MM-DD HH24:MI'),
                                           'deliveredAt', to_char(d.delivered_at at time zone tz, 'YYYY-MM-DD HH24:MI'))
                 from dk_deliveries d left join dk_delivery_riders r on r.id = d.rider_id where d.order_id = v_order.id));
end;
$$;

-- Kitchen: «in the kitchen now» is what is queued or being prepared; the ready ones apart.
create or replace function dk_copilot_kitchen(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  tz text := dk_account_tz();
  v_target integer;
  v jsonb;
begin
  perform dk_require('kitchen.view');
  perform dk_copilot_range(p_from, p_to);
  select confirmado_alert_min + en_preparacion_alert_min into v_target from dk_kitchen_sla_settings where kitchen_id = dk_current_kitchen_id();
  v_target := coalesce(v_target, 30);

  with prep as (
    select o.id, o.order_number,
      extract(epoch from (r.ts - c.ts)) / 60 minutes
    from dk_orders o
    join lateral (select min(changed_at) ts from dk_order_status_history where order_id = o.id and to_status = 'CONFIRMADO') c on true
    join lateral (select min(changed_at) ts from dk_order_status_history where order_id = o.id and to_status = 'LISTO') r on true
    where c.ts is not null and r.ts is not null and (c.ts at time zone tz)::date between p_from and p_to
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'targetMinutes', v_target,
    'ordersPrepared', count(*),
    'avgMinutes', round(avg(minutes)::numeric, 1),
    'medianMinutes', round((percentile_cont(0.5) within group (order by minutes::float8))::numeric, 1),
    'p90Minutes', round((percentile_cont(0.9) within group (order by minutes::float8))::numeric, 1),
    'overTarget', count(*) filter (where minutes > v_target),
    'slowest', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'number', order_number, 'minutes', round(minutes::numeric))), '[]')
                from (select * from prep order by minutes desc limit 5) s))
    into v
  from prep;

  return v || jsonb_build_object(
    'inKitchenNow', (
      select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'number', o.order_number, 'status', o.status,
                                                   'minutesSinceConfirmed', round(extract(epoch from now() - h.ts) / 60))), '[]')
      from dk_orders o
      join lateral (select min(changed_at) ts from dk_order_status_history where order_id = o.id and to_status = 'CONFIRMADO') h on true
      where o.status in ('CONFIRMADO', 'EN_PREPARACION')),
    'readyNow', (select count(*) from dk_orders where status = 'LISTO'));
end;
$$;

-- Customers: the phone only when the question is about contacting them (R4).
drop function if exists dk_copilot_customers(text, text, date, date, integer);
create or replace function dk_copilot_customers(p_search text default null, p_order_by text default 'spend', p_from date default null, p_to date default null,
                                                p_limit integer default 10, p_include_contact boolean default false)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  tz text := dk_account_tz();
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 30);
  v_balance boolean := dk_can('receivables.view');
  v_contact boolean := coalesce(p_include_contact, false);
begin
  perform dk_require('customers.view');
  return (
    select jsonb_build_object('customers', coalesce(jsonb_agg(x order by ord), '[]'), 'balanceVisible', v_balance, 'contactIncluded', v_contact)
    from (
      select row_number() over (order by
          case p_order_by when 'orders' then -orders when 'recent' then -extract(epoch from last_order) when 'balance' then -coalesce(balance, 0) else -spend end) ord,
        jsonb_build_object('id', id, 'name', full_name, 'phone', case when v_contact then phone end, 'orders', orders, 'spend', spend,
                           'lastOrder', to_char(last_order at time zone tz, 'YYYY-MM-DD'), 'balance', balance) x
      from (
        select c.id, c.full_name, c.phone,
          count(o.id) orders, coalesce(sum(o.total), 0) spend, max(o.created_at) last_order,
          case when v_balance then (select coalesce(sum(r.balance), 0) from dk_receivables r where r.customer_id = c.id) end balance
        from dk_customers c
        left join dk_orders o on o.customer_id = c.id and o.status <> 'CANCELADO'
          and (p_from is null or (o.created_at at time zone tz)::date >= p_from)
          and (p_to is null or (o.created_at at time zone tz)::date <= p_to)
        where p_search is null or c.full_name ilike '%' || p_search || '%' or c.phone ilike '%' || p_search || '%'
        group by c.id) c
      order by 1 limit v_limit) t);
end;
$$;

-- Shifts: a day or a range (up to 31 days) — «¿cuándo es mi próximo turno?».
drop function if exists dk_copilot_staff(date);
create or replace function dk_copilot_staff(p_day date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  tz text := dk_account_tz();
  v_from date := coalesce(p_day, (now() at time zone tz)::date);
  v_to date := coalesce(p_to, p_day, (now() at time zone tz)::date);
begin
  perform dk_require('copilot.use');
  if v_to < v_from then raise exception 'El rango de fechas está invertido'; end if;
  if v_to - v_from > 31 then raise exception 'El rango de turnos es de hasta 31 días'; end if;
  return jsonb_build_object(
    'from', v_from, 'to', v_to, 'wholeTeam', dk_can('staff.view'),
    'shifts', (select coalesce(jsonb_agg(jsonb_build_object(
        'day', to_char(s.starts_at at time zone tz, 'YYYY-MM-DD'), 'person', u.full_name, 'role', r.name,
        'mine', s.user_id = dk_current_profile_id(),
        'from', to_char(s.starts_at at time zone tz, 'HH24:MI'), 'to', to_char(s.ends_at at time zone tz, 'HH24:MI'),
        'clockIn', to_char(s.clock_in_at at time zone tz, 'HH24:MI'), 'clockOut', to_char(s.clock_out_at at time zone tz, 'HH24:MI'),
        'unplanned', s.unplanned) order by s.starts_at), '[]')
      from dk_shifts s join dk_users u on u.id = s.user_id join dk_roles r on r.id = s.role_id
      where s.status = 'scheduled' and (s.starts_at at time zone tz)::date between v_from and v_to),
    'onShiftNow', case when dk_can('staff.view') or dk_can('dispatch.view') or dk_can('dispatch.assign') then (
      select coalesce(jsonb_agg(jsonb_build_object('person', full_name, 'role', role_name, 'clockedIn', clocked_in)), '[]') from dk_shifts_now()) end);
end;
$$;

revoke execute on function dk_copilot_customers(text, text, date, date, integer, boolean), dk_copilot_staff(date, date) from public, anon;
grant execute on function dk_copilot_customers(text, text, date, date, integer, boolean), dk_copilot_staff(date, date) to authenticated;
