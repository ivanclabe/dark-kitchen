-- ADR 0031: the payment inside the order — register, void (a negative entry
-- linked to the payment, with its reason), audit and the payment filter of
-- Operación → Lista. Permissions and isolation between accounts. Rolled-back transaction.
--
--   python3 supabase/tests/run.py order_payments

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid) on commit drop;
grant all on _t, _ctx to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', (case when p_kitchen is null then '{}'::jsonb else jsonb_build_object('x-dk-kitchen-id', p_kitchen) end)::text, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.blocked(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return 'blocked'; end;
$$;
create or replace function pg_temp.error_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return sqlerrm; end;
$$;
create or replace function pg_temp.affected(p_sql text) returns text language plpgsql as $$
declare n integer;
begin execute p_sql; get diagnostics n = row_count; return n::text; exception when others then return 'blocked'; end;
$$;
create or replace function pg_temp.paid(p_order uuid) returns text language sql as $$
  select trim_scale(coalesce(sum(amount), 0))::text from dk_order_payments where order_id = p_order
$$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000031a01', 'duena.pagos@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000031a02', 'caja.pagos@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000031a03', 'cocina.pagos@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000031a04', 'otra.pagos@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-000000031a01', '00000000-0000-0000-0000-000000031a01', 'Dueña', true),
  ('10000000-0000-0000-0000-000000031a02', '00000000-0000-0000-0000-000000031a02', 'Caja', true),
  ('10000000-0000-0000-0000-000000031a03', '00000000-0000-0000-0000-000000031a03', 'Cocina', true),
  ('10000000-0000-0000-0000-000000031a04', '00000000-0000-0000-0000-000000031a04', 'Otra dueña', true);
insert into dk_organizations (slug, name, owner_user_id, sector, category) values
  ('grupo-pagos', 'Grupo Pagos', '10000000-0000-0000-0000-000000031a01', 'fast_food', 'burgers'),
  ('otro-grupo-pagos', 'Otro Grupo', '10000000-0000-0000-0000-000000031a04', 'fast_food', 'burgers');
insert into _ctx (key, id) values ('org', (select id from dk_organizations where slug = 'grupo-pagos')), ('org2', (select id from dk_organizations where slug = 'otro-grupo-pagos'));
select pg_temp.act_as('00000000-0000-0000-0000-000000031a01');
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('A', dk_create_kitchen('Centro', 'centro-pagos', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000031a04');
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('B', dk_create_kitchen('Norte', 'norte-pagos', 'America/Bogota', null, pg_temp.k('org2'))); end $$;
reset role;
select pg_temp.as_owner();

-- Caja (CASHIER: sees and collects) and Cocina (KITCHEN: sees orders, not payments) in A.
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id) values
  (pg_temp.k('A'), '10000000-0000-0000-0000-000000031a02', (select id from dk_roles where is_system and key = 'CASHIER')),
  (pg_temp.k('A'), '10000000-0000-0000-0000-000000031a03', (select id from dk_roles where is_system and key = 'KITCHEN'));
insert into dk_member_roles (kitchen_id, user_id, role_id) values
  (pg_temp.k('A'), '10000000-0000-0000-0000-000000031a02', (select id from dk_roles where is_system and key = 'CASHIER')),
  (pg_temp.k('A'), '10000000-0000-0000-0000-000000031a03', (select id from dk_roles where is_system and key = 'KITCHEN'))
on conflict do nothing;

insert into dk_customers (id, full_name, kitchen_id) values
  ('30000000-0000-0000-0000-000000031a01', 'Juan Pérez', pg_temp.k('A')),
  ('30000000-0000-0000-0000-000000031a02', 'Otra cuenta', pg_temp.k('B'));
--   O1 delivered 10000 · O2 preparing 20000 · O3 cancelled 5000 · OB in the other account 7000
insert into dk_orders (id, customer_id, kitchen_id, status, subtotal) values
  ('40000000-0000-0000-0000-000000031a01', '30000000-0000-0000-0000-000000031a01', pg_temp.k('A'), 'ENTREGADO', 10000),
  ('40000000-0000-0000-0000-000000031a02', '30000000-0000-0000-0000-000000031a01', pg_temp.k('A'), 'EN_PREPARACION', 20000),
  ('40000000-0000-0000-0000-000000031a03', '30000000-0000-0000-0000-000000031a01', pg_temp.k('A'), 'CANCELADO', 5000),
  ('40000000-0000-0000-0000-000000031a09', '30000000-0000-0000-0000-000000031a02', pg_temp.k('B'), 'ENTREGADO', 7000);
insert into dk_order_payments (id, order_id, amount, method, kitchen_id) values
  ('50000000-0000-0000-0000-000000031a09', '40000000-0000-0000-0000-000000031a09', 7000, 'Efectivo', pg_temp.k('B'));

-- 1. Caja registers the full payment of O1 and of O2, then voids O1's by mistake.
select pg_temp.act_as('00000000-0000-0000-0000-000000031a02', pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _ctx (key, id) values ('p1', dk_register_payment('40000000-0000-0000-0000-000000031a01', 10000, 'Efectivo', null));
  insert into _ctx (key, id) values ('p2', dk_register_payment('40000000-0000-0000-0000-000000031a02', 20000, 'Transferencia', null));
end $$;
insert into _t (area, test, expected, got) values
  ('Void', 'A reason is required', 'Escribe el motivo de la anulación', pg_temp.error_of(format('select dk_void_payment(%L, %L)', pg_temp.k('p1'), '  '))),
  ('Isolation', 'Cannot void a payment of another account', 'blocked', pg_temp.blocked('select dk_void_payment(''50000000-0000-0000-0000-000000031a09'', ''error'')')),
  ('Ledger', 'No direct insert (only through the functions)', 'blocked', pg_temp.blocked(format('insert into dk_order_payments (order_id, amount) values (%L, 1)', '40000000-0000-0000-0000-000000031a02'))),
  ('Ledger', 'No update', '0', pg_temp.affected(format('update dk_order_payments set amount = 1 where id = %L', pg_temp.k('p1')))),
  ('Ledger', 'No delete', '0', pg_temp.affected(format('delete from dk_order_payments where id = %L', pg_temp.k('p1'))));
do $$ begin insert into _ctx (key, id) values ('v1', dk_void_payment(pg_temp.k('p1'), 'Cobrado dos veces')); end $$;
insert into _t (area, test, expected, got) values
  ('Void', 'The balance of O1 is back (paid = 0)', '0', pg_temp.paid('40000000-0000-0000-0000-000000031a01')),
  ('Void', 'It is a negative entry linked to the payment, with the reason', '-10000 · Cobrado dos veces · true',
    (select trim_scale(amount)::text || ' · ' || note || ' · ' || (voids_payment_id = pg_temp.k('p1'))::text from dk_order_payments where id = pg_temp.k('v1'))),
  ('Void', 'A payment is voided only once', 'Este pago ya fue anulado', pg_temp.error_of(format('select dk_void_payment(%L, %L)', pg_temp.k('p1'), 'otra vez'))),
  ('Void', 'A void cannot be voided', 'Una anulación no se puede anular', pg_temp.error_of(format('select dk_void_payment(%L, %L)', pg_temp.k('v1'), 'deshacer'))),
  ('Register', 'After the void, O1 can be paid again', 'ALLOWED', pg_temp.blocked('select dk_register_payment(''40000000-0000-0000-0000-000000031a01'', 4000, ''Efectivo'', null)'));

-- 2. The payment filter of Operación → Lista (Caja sees the receivables).
insert into _t (area, test, expected, got) values
  ('Search', 'Paid: O2 (fully paid), not O1 (partial) nor O3 (cancelled)', 'O2',
    (select string_agg(case id when '40000000-0000-0000-0000-000000031a01' then 'O1' when '40000000-0000-0000-0000-000000031a02' then 'O2' when '40000000-0000-0000-0000-000000031a03' then 'O3' end, ',' order by id)
     from dk_order_search(p_payment => 'paid') as s(id))),
  ('Search', 'Pending: O1 (partial), not the cancelled one', 'O1',
    (select string_agg(case id when '40000000-0000-0000-0000-000000031a01' then 'O1' when '40000000-0000-0000-0000-000000031a02' then 'O2' when '40000000-0000-0000-0000-000000031a03' then 'O3' end, ',' order by id)
     from dk_order_search(p_payment => 'pending') as s(id))),
  ('Search', 'Without the filter, the search is as before', '3', (select count(*)::text from dk_order_search())),
  ('Search', 'The other account never appears', 'false', ('40000000-0000-0000-0000-000000031a09' in (select dk_order_search(p_payment => 'paid')))::text);
reset role;

-- 3. Cocina: sees the orders, not the payments → cannot void, and the payment filter is ignored.
select pg_temp.act_as('00000000-0000-0000-0000-000000031a03', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Permissions', 'Cocina cannot void a payment', 'blocked', pg_temp.blocked(format('select dk_void_payment(%L, %L)', pg_temp.k('p2'), 'no'))),
  ('Permissions', 'Cocina cannot register a payment', 'blocked', pg_temp.blocked('select dk_register_payment(''40000000-0000-0000-0000-000000031a02'', 1, null, null)')),
  ('Permissions', 'Cocina does not see the payments', '0', (select count(*)::text from dk_order_payments)),
  ('Permissions', 'For Cocina the payment filter is ignored (no false "pending")', '3', (select count(*)::text from dk_order_search(p_payment => 'pending')));
reset role;
select pg_temp.as_owner();

-- 4. Rules of the ledger and the audit.
insert into _t (area, test, expected, got) values
  ('Ledger', 'A negative entry must void a payment', 'blocked',
    pg_temp.blocked(format('insert into dk_order_payments (order_id, amount, kitchen_id) values (%L, -5, %L)', '40000000-0000-0000-0000-000000031a02', pg_temp.k('A')))),
  ('Ledger', 'A void must be negative', 'blocked',
    pg_temp.blocked(format('insert into dk_order_payments (order_id, amount, kitchen_id, voids_payment_id) values (%L, 5, %L, %L)', '40000000-0000-0000-0000-000000031a02', pg_temp.k('A'), pg_temp.k('p2')))),
  ('Audit', 'Each payment is in the activity log', '3',
    (select count(*)::text from dk_audit_log where table_name = 'dk_order_payments' and event_type = 'payment.registered' and kitchen_id = pg_temp.k('A'))),
  ('Audit', 'The void too, with the order and the reason', 'Anuló un pago de $10.000 del pedido #',
    (select left(summary, 37) from dk_audit_log where table_name = 'dk_order_payments' and event_type = 'payment.voided' and record_key = pg_temp.k('v1')::text)),
  ('Audit', 'Readable summary of a payment', 'true',
    (select bool_and(summary ~ '^Registró un pago de \$[0-9.]+ al pedido #[0-9]+') ::text from dk_audit_log where table_name = 'dk_order_payments' and event_type = 'payment.registered' and kitchen_id = pg_temp.k('A'))),
  ('Audit', 'In the operations category', 'operations',
    (select string_agg(distinct category, ',') from dk_audit_log where table_name = 'dk_order_payments' and kitchen_id = pg_temp.k('A')));

select area, test, expected, got, case when expected is not distinct from got then 'PASS' else 'FAIL' end as result, detail from _t order by n;
rollback;
