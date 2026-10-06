-- ADR 0033, phase 0: Copilot safe — each person reads only their own questions,
-- the quota is reserved atomically and is Copilot's own, the run is closed by
-- its author, and the tools neither leak phones nor fake a 0 «paid».
-- Rolled-back transaction.
--
--   python3 supabase/tests/run.py copilot_safety

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid) on commit drop;
create temp table _r (key text primary key, v jsonb) on commit drop;
grant all on _t, _ctx, _r to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', json_build_object('x-dk-kitchen-id', p_kitchen)::text, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.r(p_key text) returns jsonb language sql as $$ select v from _r where key = p_key $$;
create or replace function pg_temp.blocked(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return 'blocked'; end;
$$;

insert into _ctx values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000033a01', 'admin.safety@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000033a02', 'caja.safety@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000033a03', 'cocina.safety@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-000000033a01', '00000000-0000-0000-0000-000000033a01', 'Admin Safety', true),
  ('10000000-0000-0000-0000-000000033a02', '00000000-0000-0000-0000-000000033a02', 'Caja Safety', true),
  ('10000000-0000-0000-0000-000000033a03', '00000000-0000-0000-0000-000000033a03', 'Cocina Safety', true);
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
select pg_temp.k('A'), m.user_id, (select id from dk_roles where is_system and key = m.role_key)
from (values ('10000000-0000-0000-0000-000000033a01'::uuid, 'ADMIN'), ('10000000-0000-0000-0000-000000033a02'::uuid, 'CASHIER'),
             ('10000000-0000-0000-0000-000000033a03'::uuid, 'KITCHEN')) m(user_id, role_key);

-- A clean slate for the quota of this account (inside the rolled-back transaction).
delete from dk_ai_insights where kitchen_id = pg_temp.k('A');
-- Copilot and one automatic analysis switched on in the account.
insert into dk_kitchen_features (kitchen_id, feature_key, enabled) values (pg_temp.k('A'), 'copilot', true), (pg_temp.k('A'), 'kitchen_insights', true)
on conflict (kitchen_id, feature_key) do update set enabled = true;

-- Data for the tools: a customer with a phone, an order ready, one unconfirmed.
insert into dk_customers (id, kitchen_id, full_name, phone) values ('30000000-0000-0000-0000-000000033a01', pg_temp.k('A'), 'Cliente Seguro', '3009990033');
insert into dk_orders (id, kitchen_id, customer_id, status, subtotal) values
  ('40000000-0000-0000-0000-000000033a01', pg_temp.k('A'), '30000000-0000-0000-0000-000000033a01', 'LISTO', 12000),
  ('40000000-0000-0000-0000-000000033a02', pg_temp.k('A'), '30000000-0000-0000-0000-000000033a01', 'NUEVO', 8000);
insert into _ctx values ('order', '40000000-0000-0000-0000-000000033a01');

-- 1. Admin asks: the run is reserved; asking again at once waits for the interval.
select pg_temp.act_as('00000000-0000-0000-0000-000000033a01', pg_temp.k('A'));
set local role authenticated;
insert into _r values ('admin-1', dk_ai_run_reserve('copilot', '{"question": "¿cuánto vendimos?"}'));
insert into _r values ('admin-2', dk_ai_run_reserve('copilot', '{"question": "¿y ayer?"}'));
reset role;
insert into _ctx values ('run-admin', (pg_temp.r('admin-1') ->> 'runId')::uuid);
insert into _t (area, test, expected, got) values
  ('Quota', 'The first question is reserved (running)', 'true · running',
    (pg_temp.r('admin-1') ->> 'allowed') || ' · ' || (select status from dk_ai_insights where id = pg_temp.k('run-admin'))),
  ('Quota', 'A second question at once waits (a running one counts)', 'interval', pg_temp.r('admin-2') ->> 'reason'),
  ('Quota', 'The run is written as its author', 'true',
    ((select created_by from dk_ai_insights where id = pg_temp.k('run-admin')) = '10000000-0000-0000-0000-000000033a01')::text);

-- 1b. A failed question does not make the admin wait to retry (ADR 0033).
select pg_temp.as_owner();
insert into _ctx values ('run-failed', null);
update dk_ai_insights set created_at = created_at - interval '1 hour' where id = pg_temp.k('run-admin');
insert into dk_ai_insights (kitchen_id, feature_key, status, input, created_by, error)
values (pg_temp.k('A'), 'copilot', 'error', '{}', '10000000-0000-0000-0000-000000033a01', 'boom');
select pg_temp.act_as('00000000-0000-0000-0000-000000033a01', pg_temp.k('A'));
set local role authenticated;
insert into _r values ('admin-after-error', dk_ai_run_allowed('copilot'));
reset role;
insert into _t (area, test, expected, got) values
  ('Quota', 'Right after a failed question the admin can retry', 'true', pg_temp.r('admin-after-error') ->> 'allowed');
select pg_temp.as_owner();
update dk_ai_insights set created_at = created_at + interval '1 hour' where id = pg_temp.k('run-admin');

-- 2. Caja asks too (the interval is per person) and cannot read the admin's question.
select pg_temp.act_as('00000000-0000-0000-0000-000000033a02', pg_temp.k('A'));
set local role authenticated;
insert into _r values ('caja-1', dk_ai_run_reserve('copilot', '{"question": "¿quién me debe?"}'));
insert into _t (area, test, expected, got) values
  ('Quota', 'Another person is not blocked by the admin''s interval', 'true', pg_temp.r('caja-1') ->> 'allowed'),
  ('Privacy', 'Caja reads only its own Copilot questions', '1', (select count(*)::text from dk_ai_insights where feature_key = 'copilot')),
  ('Privacy', 'Caja cannot write a run as someone else', 'blocked',
    pg_temp.blocked(format('insert into dk_ai_insights (kitchen_id, feature_key, status, input, created_by) values (%L, %L, %L, %L, %L)',
      pg_temp.k('A'), 'copilot', 'ok', '{}', '10000000-0000-0000-0000-000000033a01'))),
  ('Privacy', 'Caja tries to close the admin''s run', 'ALLOWED', pg_temp.blocked(format('select dk_ai_run_finish(%L, %L)', pg_temp.k('run-admin'), 'ok')));
reset role;
-- The attempt runs without error but changes nothing: checked as the owner.
insert into _t (area, test, expected, got) values
  ('Privacy', 'The admin''s run is still open after Caja''s attempt', 'running', (select status from dk_ai_insights where id = pg_temp.k('run-admin')));

-- 3. Cocina: the admin's and Caja's questions are not visible to it either.
select pg_temp.act_as('00000000-0000-0000-0000-000000033a03', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Privacy', 'Cocina sees none of the others'' Copilot questions', '0', (select count(*)::text from dk_ai_insights where feature_key = 'copilot'));
reset role;

-- 4. The admin closes their run with its metrics, once; and rates it.
select pg_temp.act_as('00000000-0000-0000-0000-000000033a01', pg_temp.k('A'));
set local role authenticated;
select dk_ai_run_finish(pg_temp.k('run-admin'), 'ok', '{"answer": "Vendimos $20.000"}', null, 120, 40, 900, null, 'sales', 'answered', '{"rounds": [700]}');
select dk_ai_run_finish(pg_temp.k('run-admin'), 'error', null, null, null, null, null, 'late');
select dk_ai_run_feedback(pg_temp.k('run-admin'), 1::smallint);
insert into _t (area, test, expected, got) values
  ('Run', 'Closed once with intent, scope and timings (a second close is ignored)', 'ok · sales · answered · 900 · 1',
    (select status || ' · ' || intent || ' · ' || scope || ' · ' || latency_ms || ' · ' || feedback from dk_ai_insights where id = pg_temp.k('run-admin'))),
  ('Run', 'A wrong status is refused', 'blocked', pg_temp.blocked(format('select dk_ai_run_finish(%L, %L)', pg_temp.k('run-admin'), 'hack'))),
  ('Run', 'A wrong scope is refused', 'blocked',
    pg_temp.blocked(format('insert into dk_ai_insights (kitchen_id, feature_key, status, input, scope) values (%L, %L, %L, %L, %L)', pg_temp.k('A'), 'copilot', 'ok', '{}', 'whatever')));
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000033a02', pg_temp.k('A'));
set local role authenticated;
select dk_ai_run_feedback(pg_temp.k('run-admin'), -1::smallint);
reset role;
insert into _t (area, test, expected, got) values
  ('Run', 'Nobody else can rate it', '1', (select feedback::text from dk_ai_insights where id = pg_temp.k('run-admin')));

-- 5. Copilot's own daily limit: half of the plan; the analyses keep theirs.
select pg_temp.as_owner();
insert into _ctx values ('half', null);
do $$
declare v_daily integer; v_half integer;
begin
  select coalesce((p.limits ->> 'ai_runs_per_day')::integer, 50) into v_daily
  from dk_kitchens k join dk_subscriptions s on s.organization_id = k.organization_id join dk_plans p on p.key = s.plan_key where k.id = pg_temp.k('A');
  v_daily := coalesce(v_daily, 50);
  v_half := greatest(1, ceil(v_daily * 0.5)::integer);
  insert into _r values ('limits', jsonb_build_object('daily', v_daily, 'half', v_half));
  -- Copilot runs of another person, an hour ago, up to the half.
  insert into dk_ai_insights (kitchen_id, feature_key, status, input, created_by, created_at)
  select pg_temp.k('A'), 'copilot', 'ok', '{}', '10000000-0000-0000-0000-000000033a03', now() - interval '1 hour' from generate_series(1, v_half);
end $$;
-- Asked as Cocina (its runs are an hour old: no interval in the way).
select pg_temp.act_as('00000000-0000-0000-0000-000000033a03', pg_temp.k('A'));
set local role authenticated;
insert into _r values ('copilot-full', dk_ai_run_allowed('copilot')), ('insights-after', dk_ai_run_allowed('kitchen_insights'));
reset role;
insert into _t (area, test, expected, got) values
  ('Quota', 'Copilot stops at half of the plan''s AI runs', 'daily', pg_temp.r('copilot-full') ->> 'reason'),
  ('Quota', 'The automatic analyses still have their whole budget', (pg_temp.r('limits') ->> 'daily'),
    coalesce(pg_temp.r('insights-after') ->> 'remainingToday', pg_temp.r('insights-after') ->> 'reason'));

-- 6. Tools: no phone unless asked; «paid» only with the receivables; the kitchen now; unconfirmed sales apart; shifts over days.
select pg_temp.act_as('00000000-0000-0000-0000-000000033a01', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Tools', 'Customers: no phone by default', 'null · false',
    coalesce(dk_copilot_customers('Cliente Seguro') -> 'customers' -> 0 ->> 'phone', 'null') || ' · ' || (dk_copilot_customers('Cliente Seguro') ->> 'contactIncluded')),
  ('Tools', 'Customers: the phone when asked for contact', '+573009990033',
    dk_copilot_customers('Cliente Seguro', p_include_contact => true) -> 'customers' -> 0 ->> 'phone'),
  ('Tools', 'Order: the admin sees «paid»', 'true · 0',
    (select (v ->> 'paymentVisible') || ' · ' || (v ->> 'paid') from (select dk_copilot_order((select order_number from dk_orders where id = pg_temp.k('order'))) v) x)),
  ('Tools', 'Kitchen: a ready order is not «in the kitchen»', 'false · true',
    (select (exists (select 1 from jsonb_array_elements(v -> 'inKitchenNow') e where e ->> 'id' = pg_temp.k('order')::text))::text
            || ' · ' || ((v ->> 'readyNow')::integer >= 1)::text
     from (select dk_copilot_kitchen(current_date, current_date) v) x)),
  ('Tools', 'Sales: the unconfirmed part apart (counted as in Insights)', 'true',
    ((dk_copilot_sales(current_date, current_date) ->> 'unconfirmedTotal')::numeric >= 8000)::text),
  ('Tools', 'Shifts: a range of days', 'true', (dk_copilot_staff(current_date, current_date + 7) ? 'shifts')::text),
  ('Tools', 'Shifts: more than 31 days is refused', 'blocked', pg_temp.blocked('select dk_copilot_staff(current_date, current_date + 40)')),
  ('Tools', 'Shifts: a reversed range is refused', 'blocked', pg_temp.blocked('select dk_copilot_staff(current_date, current_date - 1)'));
reset role;

-- 6b. The context says which actions each person may take (app help, phase 2).
select pg_temp.act_as('00000000-0000-0000-0000-000000033a03', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Context', 'Cocina may prepare, not collect payments', 'true · false',
    ((dk_copilot_context() -> 'actions') ? 'kitchen.prepare')::text || ' · ' || ((dk_copilot_context() -> 'actions') ? 'receivables.collect')::text);
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000033a02', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Context', 'Caja may collect payments', 'true', ((dk_copilot_context() -> 'actions') ? 'receivables.collect')::text);
reset role;

-- 7. Cobros (phase 2): collected minus voids, by method; what is still to collect.
select pg_temp.as_owner();
insert into dk_order_payments (id, order_id, amount, method, kitchen_id) values
  ('50000000-0000-0000-0000-000000033a01', pg_temp.k('order'), 10000, 'Efectivo', pg_temp.k('A')),
  ('50000000-0000-0000-0000-000000033a02', pg_temp.k('order'), 2000, 'Transferencia', pg_temp.k('A'));
insert into dk_order_payments (order_id, amount, method, kitchen_id, voids_payment_id, note) values
  (pg_temp.k('order'), -2000, 'Transferencia', pg_temp.k('A'), '50000000-0000-0000-0000-000000033a02', 'error');
select pg_temp.act_as('00000000-0000-0000-0000-000000033a02', pg_temp.k('A'));
set local role authenticated;
insert into _r values ('payments', dk_copilot_payments(current_date, current_date));
reset role;
insert into _t (area, test, expected, got) values
  ('Payments', 'Collected today: payments minus voids', 'true',
    ((pg_temp.r('payments') ->> 'collected')::numeric >= 10000 and (pg_temp.r('payments') -> 'voided' ->> 'total')::numeric >= 2000)::text),
  ('Payments', 'By method (cash includes this order''s 10.000)', 'true',
    (exists (select 1 from jsonb_array_elements(pg_temp.r('payments') -> 'byMethod') m where m ->> 'method' = 'Efectivo' and (m ->> 'total')::numeric >= 10000))::text),
  ('Payments', 'To collect: this order still owes 2.000', 'true', ((pg_temp.r('payments') -> 'toCollect' ->> 'total')::numeric >= 2000)::text);

select pg_temp.act_as('00000000-0000-0000-0000-000000033a03', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Payments', 'Cocina cannot ask about payments', 'blocked', pg_temp.blocked('select dk_copilot_payments(current_date, current_date)')),
  ('Tools', 'Order: Cocina does not see the payment (null, never a false 0)', 'false · null',
    (select (v ->> 'paymentVisible') || ' · ' || coalesce(v ->> 'paid', 'null') from (select dk_copilot_order((select order_number from dk_orders where id = pg_temp.k('order'))) v) x));
reset role;

-- 8. Quality in «Uso y estado» (phase 4): aggregated, for whoever sees the account's AI usage.
select pg_temp.as_owner();
update dk_ai_insights set latency_ms = 1000, scope = 'answered', input = input || '{"channel": "voice"}' where id = pg_temp.k('run-admin');
select pg_temp.act_as((select u.auth_user_id from dk_organizations o join dk_users u on u.id = o.owner_user_id join dk_kitchens k on k.organization_id = o.id where k.id = pg_temp.k('A')), pg_temp.k('A'));
set local role authenticated;
insert into _r values ('usage', dk_account_ai_usage(30));
reset role;
insert into _t (area, test, expected, got) values
  ('Quality', 'Copilot: questions, by voice, 👍, answered, latency', 'true · 1 · 1 · 1 · 1000',
    ((pg_temp.r('usage') -> 'copilot' ->> 'questions')::integer >= 1)::text || ' · ' || (pg_temp.r('usage') -> 'copilot' ->> 'byVoice') || ' · '
    || (pg_temp.r('usage') -> 'copilot' ->> 'thumbsUp') || ' · ' || (pg_temp.r('usage') -> 'copilot' -> 'byScope' ->> 'answered') || ' · ' || (pg_temp.r('usage') -> 'copilot' ->> 'p50Ms')),
  ('Quality', 'Copilot''s own daily limit is reported', 'true',
    ((pg_temp.r('usage') -> 'copilot' ->> 'dailyLimit')::integer = greatest(1, ceil((pg_temp.r('limits') ->> 'daily')::integer * 0.5)::integer))::text);

select pg_temp.act_as('00000000-0000-0000-0000-000000033a02', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Quality', 'Caja cannot read the account''s AI usage', 'blocked', pg_temp.blocked('select dk_account_ai_usage(30)'));
reset role;

select area, test, expected, got, case when expected is not distinct from got then 'PASS' else 'FAIL' end as result, detail from _t order by n;
rollback;
