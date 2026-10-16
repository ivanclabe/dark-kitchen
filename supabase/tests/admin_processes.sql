-- ADR 0063, fase 3: procesos administrativos con reglas. Transacción revertida.
--   · cartera: plazo por cliente → vencimiento al confirmar, «saldo vencido» y antigüedad;
--   · gastos fijos: generación para todas las cuentas (pg_cron), monto variable por confirmar, pago en lote;
--   · turnos sin salida: corrección del gerente con bitácora, aviso en nómina;
--   · la campana: avisos administrativos con su permiso y sin el ruido de «mínimo 0».
--
--   python3 supabase/tests/run.py admin_processes

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, v jsonb) on commit drop;
grant all on _t, _ctx to authenticated;
grant usage on sequence _t_n_seq to authenticated;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', case when p_kitchen is null then '{}' else jsonb_build_object('x-dk-kitchen-id', p_kitchen)::text end, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.role_id(p_key text) returns uuid language sql as $$ select id from dk_roles where is_system and key = p_key $$;
create or replace function pg_temp.today() returns date language sql as $$ select dk_local_date(now(), 'America/Bogota') $$;
create or replace function pg_temp.n(p numeric) returns text language sql as $$ select trim_scale(round(p, 4))::text $$;
create or replace function pg_temp.check(p_area text, p_test text, p_expected text, p_got text, p_detail text default null) returns void language sql as $$
  insert into _t (area, test, expected, got, detail) values (p_area, p_test, p_expected, coalesce(p_got, '∅'), p_detail)
$$;
-- The types of the notices this person gets now.
create or replace function pg_temp.notices() returns text language sql as $$
  select coalesce(string_agg(n ->> 'type', ',' order by n ->> 'type'), '') from jsonb_array_elements(dk_my_notifications() -> 'items') n
  where n ->> 'group' in ('operation', 'admin')
$$;
grant execute on function pg_temp.k(text), pg_temp.today(), pg_temp.n(numeric), pg_temp.check(text, text, text, text, text), pg_temp.notices(), pg_temp.role_id(text) to authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000c0f01', 'duena.admin@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c0f02', 'cocina.admin@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c0f03', 'caja.admin@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-0000000c0f01', '00000000-0000-0000-0000-0000000c0f01', 'Dueña admin', true),
  ('10000000-0000-0000-0000-0000000c0f02', '00000000-0000-0000-0000-0000000c0f02', 'Cocinera admin', true),
  ('10000000-0000-0000-0000-0000000c0f03', '00000000-0000-0000-0000-0000000c0f03', 'Caja admin', true);
insert into dk_organizations (slug, name, owner_user_id, sector, category) values ('grupo-admin', 'Grupo Admin', '10000000-0000-0000-0000-0000000c0f01', 'fast_food', 'burgers');
insert into _ctx (key, id) values ('org', (select id from dk_organizations where slug = 'grupo-admin')),
  ('owner', '00000000-0000-0000-0000-0000000c0f01'), ('cook', '10000000-0000-0000-0000-0000000c0f02'), ('cashier', '00000000-0000-0000-0000-0000000c0f03');
select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('A', dk_create_kitchen('Admin A', 'admin-a-prueba', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id) values
  (pg_temp.k('A'), '10000000-0000-0000-0000-0000000c0f02', pg_temp.role_id('KITCHEN')),
  (pg_temp.k('A'), '10000000-0000-0000-0000-0000000c0f03', pg_temp.role_id('CASHIER'));

-- ---------------------------------------------------------------------------
-- 1. Cartera
-- ---------------------------------------------------------------------------
insert into dk_customers (id, kitchen_id, full_name, phone, payment_terms_days) values
  ('30000000-0000-0000-0000-0000000c0f01', pg_temp.k('A'), 'Empresa con plazo', '+573000000901', 30),
  ('30000000-0000-0000-0000-0000000c0f02', pg_temp.k('A'), 'Cliente de contado', '+573000000902', null);
-- With a term: an old confirmed order (45 days ago) and a new one still NUEVO; without a term, one confirmed.
insert into dk_orders (id, kitchen_id, customer_id, status, subtotal, created_at) values
  ('40000000-0000-0000-0000-0000000c0f01', pg_temp.k('A'), '30000000-0000-0000-0000-0000000c0f01', 'ENTREGADO', 50000, now() - interval '45 days'),
  ('40000000-0000-0000-0000-0000000c0f02', pg_temp.k('A'), '30000000-0000-0000-0000-0000000c0f01', 'NUEVO', 20000, now() - interval '2 days'),
  ('40000000-0000-0000-0000-0000000c0f03', pg_temp.k('A'), '30000000-0000-0000-0000-0000000c0f02', 'ENTREGADO', 15000, now() - interval '45 days');
select pg_temp.check('Cartera', 'Pedido confirmado con plazo: vence a los 30 días; NUEVO y de contado, sin vencimiento', '15 · ∅ · ∅',
  concat_ws(' · ',
    (select (pg_temp.today() - due_date)::text from dk_orders where id = '40000000-0000-0000-0000-0000000c0f01'),
    coalesce((select due_date::text from dk_orders where id = '40000000-0000-0000-0000-0000000c0f02'), '∅'),
    coalesce((select due_date::text from dk_orders where id = '40000000-0000-0000-0000-0000000c0f03'), '∅')));
update dk_orders set status = 'CONFIRMADO' where id = '40000000-0000-0000-0000-0000000c0f02';
select pg_temp.check('Cartera', 'Al confirmarlo se fija el vencimiento', '28',
  (select (due_date - pg_temp.today())::text from dk_orders where id = '40000000-0000-0000-0000-0000000c0f02'));
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
select pg_temp.check('Cartera', '«Saldo vencido» ahora se calcula', '50000',
  (select pg_temp.n((dk_customer_detail('30000000-0000-0000-0000-0000000c0f01') ->> 'overdue')::numeric)));
select pg_temp.check('Cartera', 'Antigüedad: al día (con y sin plazo) y 1-30', '35000 · 50000 · 0 · 0 · 1',
  (select concat_ws(' · ', pg_temp.n((a ->> 'current')::numeric), pg_temp.n((a ->> 'd1_30')::numeric), pg_temp.n((a ->> 'd31_60')::numeric),
     pg_temp.n((a ->> 'd61')::numeric), a ->> 'overdueCustomers') from (select dk_receivables_aging() a) x));
select pg_temp.check('Cartera', 'La ficha trae el plazo', '30', (select dk_customer_detail('30000000-0000-0000-0000-0000000c0f01') ->> 'paymentTermsDays'));
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000c0f02', pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_receivables_aging();
  perform pg_temp.check('Cartera', 'La antigüedad pide ver la cartera', 'bloqueado', case when dk_can('receivables.view') then 'tiene permiso' else 'PERMITIDO' end);
exception when others then perform pg_temp.check('Cartera', 'La antigüedad pide ver la cartera', 'bloqueado', 'bloqueado');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. Gastos fijos y pagos
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_power uuid; v_rent uuid; v_ob uuid; v_hint text; r jsonb;
begin
  v_power := dk_finance_save_recurring(jsonb_build_object('categoryId', (select id from dk_expense_categories where kitchen_id = pg_temp.k('A') order by name limit 1),
    'payeeName', 'Empresa de energía', 'description', 'Luz del local', 'amount', 300000, 'dayOfMonth', 28, 'active', true, 'variableAmount', true,
    'startsOn', date_trunc('month', pg_temp.today())::date));
  v_rent := dk_finance_save_recurring(jsonb_build_object('categoryId', (select id from dk_expense_categories where kitchen_id = pg_temp.k('A') order by name limit 1),
    'payeeName', 'Empresa de energía', 'description', 'Alquiler del medidor', 'amount', 20000, 'dayOfMonth', 28, 'active', true,
    'startsOn', date_trunc('month', pg_temp.today())::date));
  select id into v_ob from dk_obligations where recurring_id = v_power;
  insert into _ctx (key, id) values ('power', v_ob), ('meter', (select id from dk_obligations where recurring_id = v_rent));
  perform pg_temp.check('Recurrentes', 'Monto variable: nace con la referencia y por confirmar', '300000 · true',
    (select concat_ws(' · ', pg_temp.n(amount), amount_pending::text) from dk_obligations where id = v_ob));
  begin
    perform dk_finance_pay(v_ob, 300000, pg_temp.today(), 'Transferencia');
    v_hint := 'pagó';
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  perform pg_temp.check('Recurrentes', 'No se paga sin confirmar el monto', 'amount_pending', v_hint);
  begin
    perform dk_finance_pay_batch(array[v_ob, pg_temp.k('meter')], pg_temp.today(), 'Transferencia');
    v_hint := 'pagó';
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  perform pg_temp.check('Recurrentes', 'Tampoco en lote', 'amount_pending', v_hint);
  perform dk_finance_confirm_amount(v_ob, 342500);
  perform pg_temp.check('Recurrentes', 'Confirmado: el valor real, listo para pagar', '342500 · false · amount_pending',
    (select concat_ws(' · ', pg_temp.n(amount), amount_pending::text, coalesce((select 'amount_pending' from dk_obligation_balances where id = v_ob and amount_pending), 'amount_pending')) from dk_obligations where id = v_ob));
  r := dk_finance_pay_batch(array[v_ob, pg_temp.k('meter')], pg_temp.today(), 'Transferencia', 'TRF-1');
  perform pg_temp.check('Pagos', 'Pago en lote: un pago por obligación, saldadas', '2 · 362500 · paid,paid',
    concat_ws(' · ', r ->> 'paid', pg_temp.n((r ->> 'amount')::numeric),
      (select string_agg(status, ',') from dk_obligation_balances where id in (v_ob, pg_temp.k('meter')))));
  -- Another payee in the same batch is refused.
  v_ob := dk_finance_create_expense(jsonb_build_object('categoryId', (select id from dk_expense_categories where kitchen_id = pg_temp.k('A') order by name limit 1),
    'payeeName', 'Otro', 'description', 'Gasto de otro', 'amount', 1000, 'accrualDate', pg_temp.today()));
  insert into _ctx (key, id) values ('other', v_ob);
  v_rent := dk_finance_create_expense(jsonb_build_object('categoryId', (select id from dk_expense_categories where kitchen_id = pg_temp.k('A') order by name limit 1),
    'payeeName', 'Tercero', 'description', 'Gasto de un tercero', 'amount', 1000, 'accrualDate', pg_temp.today()));
  begin
    perform dk_finance_pay_batch(array[v_ob, v_rent], pg_temp.today(), 'Efectivo');
    v_hint := 'pagó';
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  perform pg_temp.check('Pagos', 'El lote es para un solo beneficiario', 'mixed_payees', v_hint);
end $$;
reset role;
-- pg_cron: next month's generation does not need anybody to open Finanzas.
select pg_temp.as_owner();
delete from dk_obligations where id = pg_temp.k('other');
select pg_temp.check('Recurrentes', 'La tarea diaria existe', '20 10 * * *', (select schedule from cron.job where jobname = 'dk-finance-recurring'));
update dk_recurring_obligations set starts_on = (date_trunc('month', pg_temp.today()) - interval '1 month')::date where kitchen_id = pg_temp.k('A');
insert into _ctx (key, v) values ('gen', to_jsonb(dk_finance_generate_recurring_all()));
select pg_temp.check('Recurrentes', 'Genera el mes que falta en todas las cuentas, una sola vez', '2 · 2 · 0',
  concat_ws(' · ', (select v::text from _ctx where key = 'gen'),
    (select count(*) from dk_obligations o where o.kitchen_id = pg_temp.k('A') and o.recurring_id is not null and o.recurring_period < date_trunc('month', pg_temp.today())::date)::text,
    dk_finance_generate_recurring_for(pg_temp.k('A'))::text));

-- ---------------------------------------------------------------------------
-- 3. Turnos sin salida
-- ---------------------------------------------------------------------------
insert into dk_shifts (id, kitchen_id, user_id, role_id, starts_at, ends_at, clock_in_at)
values ('20000000-0000-0000-0000-0000000c0f01', pg_temp.k('A'), pg_temp.k('cook'), pg_temp.role_id('KITCHEN'),
        now() - interval '12 hours', now() - interval '4 hours', now() - interval '12 hours');
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
select pg_temp.check('Turnos', 'Nómina avisa el turno sin salida', '1',
  (select l ->> 'openShifts' from jsonb_array_elements(dk_finance_payroll_proposal(pg_temp.today() - 1, pg_temp.today())) l where l ->> 'userId' = pg_temp.k('cook')::text));
do $$ begin
  perform dk_shift_correct_clock('20000000-0000-0000-0000-0000000c0f01', now() - interval '12 hours', now() - interval '4 hours', '');
  perform pg_temp.check('Turnos', 'Corregir pide motivo', 'bloqueado', 'PERMITIDO');
exception when others then perform pg_temp.check('Turnos', 'Corregir pide motivo', 'bloqueado', 'bloqueado');
end $$;
select dk_shift_correct_clock('20000000-0000-0000-0000-0000000c0f01', now() - interval '12 hours', now() - interval '4 hours', 'Olvidó marcar la salida');
select pg_temp.check('Turnos', 'El gerente corrige la salida y cuenta en nómina', '8 · 0',
  (select concat_ws(' · ', pg_temp.n((l ->> 'hours')::numeric), l ->> 'openShifts')
   from jsonb_array_elements(dk_finance_payroll_proposal(pg_temp.today() - 1, pg_temp.today())) l where l ->> 'userId' = pg_temp.k('cook')::text));
reset role;
select pg_temp.check('Turnos', 'Queda en la bitácora con el motivo y la hora anterior', 'Olvidó marcar la salida · true',
  (select concat_ws(' · ', context ->> 'reason', ((context -> 'before' ->> 'clockOut') is null)::text) from dk_audit_log
   where event_type = 'staff.clock_corrected' and record_key = '20000000-0000-0000-0000-0000000c0f01'));
select pg_temp.act_as('00000000-0000-0000-0000-0000000c0f02', pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_shift_correct_clock('20000000-0000-0000-0000-0000000c0f01', now() - interval '12 hours', now() - interval '2 hours', 'Me quedé más');
  perform pg_temp.check('Turnos', 'Quien no gestiona personal no corrige', 'bloqueado', 'PERMITIDO');
exception when others then perform pg_temp.check('Turnos', 'Quien no gestiona personal no corrige', 'bloqueado', 'bloqueado');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. La campana
-- ---------------------------------------------------------------------------
select pg_temp.as_owner();
-- Noise: an ingredient with minimum 0 and stock 0 is not «under the minimum».
insert into dk_ingredients (kitchen_id, code, name, base_unit_id, min_stock) values (pg_temp.k('A'), 'SAL', 'Sal', (select id from dk_units where code = 'g'), 0);
insert into dk_suppliers (id, kitchen_id, name) values ('60000000-0000-0000-0000-0000000c0f01', pg_temp.k('A'), 'Plaza');
insert into dk_purchases (kitchen_id, supplier_id, invoice_number, invoice_date, created_at) values (pg_temp.k('A'), '60000000-0000-0000-0000-0000000c0f01', null, pg_temp.today() - 5, now() - interval '5 days');
insert into dk_obligations (kitchen_id, kind, category_id, payee_name, description, amount, accrual_date, due_date)
values (pg_temp.k('A'), 'expense', (select id from dk_expense_categories where kitchen_id = pg_temp.k('A') order by name limit 1), 'Arrendador', 'Arriendo vencido', 900000, pg_temp.today() - 10, pg_temp.today() - 3),
       (pg_temp.k('A'), 'expense', (select id from dk_expense_categories where kitchen_id = pg_temp.k('A') order by name limit 1), 'Internet', 'Internet', 90000, pg_temp.today(), pg_temp.today() + 4);
insert into dk_products (kitchen_id, code, name, price, uses_inventory, estimated_cost) values (pg_temp.k('A'), 'BAJO', 'Plato bajo costo', 5000, true, 5200);
insert into dk_shifts (kitchen_id, user_id, role_id, starts_at, ends_at, clock_in_at)
values (pg_temp.k('A'), pg_temp.k('cook'), pg_temp.role_id('KITCHEN'), now() - interval '30 hours', now() - interval '22 hours', now() - interval '30 hours');
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
select pg_temp.check('Campana', 'La dueña ve lo administrativo (sin «bajo el mínimo» por mínimo 0)',
  'amount_pending,below_cost,late_orders,old_drafts,open_shifts,overdue_customers,payables_due,payables_overdue', pg_temp.notices());
reset role;
select pg_temp.act_as(pg_temp.k('cashier'), pg_temp.k('A'));
set local role authenticated;
select pg_temp.check('Campana', 'La caja no ve deudas, compras, márgenes ni turnos', 'false',
  (pg_temp.notices() ~ '(payables|old_drafts|below_cost|open_shifts|price_up)')::text);
reset role;

select pg_temp.as_owner();
select pg_temp.check('Permisos', 'Sin sesión no se paga en lote ni se corrige un turno', 'false · false',
  concat_ws(' · ', has_function_privilege('anon', 'dk_finance_pay_batch(uuid[], date, text, text)', 'execute')::text,
    has_function_privilege('anon', 'dk_shift_correct_clock(uuid, timestamptz, timestamptz, text)', 'execute')::text));
select pg_temp.check('Permisos', 'La generación de todas las cuentas es solo del sistema', 'false',
  has_function_privilege('authenticated', 'dk_finance_generate_recurring_all()', 'execute')::text);

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
