-- ADR 0051: obligaciones, pagos y rentabilidad real — un caso completo.
-- Nada cuenta dos veces: una compra crea una obligación (nunca dos), pagar no es
-- gasto ni mueve inventario, y la utilidad es la misma a crédito o de contado.
-- Transacción revertida.
--
--   python3 supabase/tests/run.py finance

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, v jsonb) on commit drop;
grant all on _t, _ctx to authenticated;
grant usage on sequence _t_n_seq to authenticated;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', (case when p_kitchen is null then '{}'::jsonb else jsonb_build_object('x-dk-kitchen-id', p_kitchen) end)::text, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.v(p_key text) returns jsonb language sql as $$ select v from _ctx where key = p_key $$;
create or replace function pg_temp.unit(p_code text) returns uuid language sql as $$ select id from dk_units where code = p_code $$;
create or replace function pg_temp.role_id(p_key text) returns uuid language sql as $$ select id from dk_roles where is_system and key = p_key $$;
create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return sqlerrm; end;
$$;
create or replace function pg_temp.blocked(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return 'blocked'; end;
$$;
create or replace function pg_temp.balance(p_obligation uuid) returns text language sql as $$
  select (o.amount - coalesce((select sum(amount) from dk_obligation_payments where obligation_id = o.id), 0))::numeric(14, 0)::text
  from dk_obligations o where o.id = p_obligation
$$;

-- People: owner (all), manager, cashier, a cook with shifts.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000051a01', 'duena.finanzas@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000051a02', 'gerente.finanzas@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000051a03', 'caja.finanzas@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000051a04', 'cocina.finanzas@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-000000051a01', '00000000-0000-0000-0000-000000051a01', 'Dueña', true),
  ('10000000-0000-0000-0000-000000051a02', '00000000-0000-0000-0000-000000051a02', 'Gerente', true),
  ('10000000-0000-0000-0000-000000051a03', '00000000-0000-0000-0000-000000051a03', 'Caja', true),
  ('10000000-0000-0000-0000-000000051a04', '00000000-0000-0000-0000-000000051a04', 'Cocinera', true);
insert into dk_organizations (slug, name, owner_user_id, sector, category)
  values ('grupo-finanzas', 'Grupo Finanzas', '10000000-0000-0000-0000-000000051a01', 'fast_food', 'burgers');
insert into _ctx (key, id) values ('org', (select id from dk_organizations where slug = 'grupo-finanzas')),
  ('owner', '00000000-0000-0000-0000-000000051a01'), ('manager', '00000000-0000-0000-0000-000000051a02'), ('cashier', '00000000-0000-0000-0000-000000051a03');

select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('A', dk_create_kitchen('Centro', 'centro-finanzas', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();
update dk_subscriptions set plan_key = 'business' where organization_id = pg_temp.k('org');
select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('B', dk_create_kitchen('Norte', 'norte-finanzas', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();

insert into dk_kitchen_members (kitchen_id, user_id, default_role_id) values
  (pg_temp.k('A'), '10000000-0000-0000-0000-000000051a02', pg_temp.role_id('MANAGER')),
  (pg_temp.k('A'), '10000000-0000-0000-0000-000000051a03', pg_temp.role_id('CASHIER')),
  (pg_temp.k('A'), '10000000-0000-0000-0000-000000051a04', pg_temp.role_id('KITCHEN'));
insert into dk_member_roles (kitchen_id, user_id, role_id) values
  (pg_temp.k('A'), '10000000-0000-0000-0000-000000051a02', pg_temp.role_id('MANAGER')),
  (pg_temp.k('A'), '10000000-0000-0000-0000-000000051a03', pg_temp.role_id('CASHIER')),
  (pg_temp.k('A'), '10000000-0000-0000-0000-000000051a04', pg_temp.role_id('KITCHEN'))
on conflict do nothing;

-- Dates: the last 7 local days, today included.
insert into _ctx (key, v) values ('today', to_jsonb(dk_local_date(now(), 'America/Bogota')));
create or replace function pg_temp.today() returns date language sql as $$ select (v #>> '{}')::date from _ctx where key = 'today' $$;

-- Catalog of A: a supplier with 30 days, meat (g), a burger (150 g), a customer.
insert into dk_suppliers (id, kitchen_id, name, payment_terms_days) values
  ('60000000-0000-0000-0000-000000051a01', pg_temp.k('A'), 'Carnes del Valle', 30);
insert into dk_ingredients (id, kitchen_id, code, name, base_unit_id) values
  ('61000000-0000-0000-0000-000000051a01', pg_temp.k('A'), 'CARNE', 'Carne', pg_temp.unit('g'));
insert into dk_products (id, kitchen_id, code, name, price) values
  ('52000000-0000-0000-0000-000000051a01', pg_temp.k('A'), 'HAMB', 'Hamburguesa', 20000);
insert into dk_customers (id, kitchen_id, full_name) values ('30000000-0000-0000-0000-000000051a01', pg_temp.k('A'), 'Cliente');

-- ---------------------------------------------------------------------------
-- 1. Categorías de base y permisos
-- ---------------------------------------------------------------------------
insert into _t (area, test, expected, got) values
  ('Base', 'Una cuenta nueva trae las 11 categorías de gasto', '11', (select count(*)::text from dk_expense_categories where kitchen_id = pg_temp.k('A'))),
  ('Base', 'GERENTE: ver, gestionar y pagar (sin nómina)', 'finance.manage,finance.pay,finance.view',
    (select string_agg(permission_key, ',' order by permission_key) from dk_role_permissions where role_id = pg_temp.role_id('MANAGER') and permission_key like 'finance.%')),
  ('Base', 'ADMIN recibe los 4', '4', (select count(*)::text from dk_role_permissions where role_id = pg_temp.role_id('ADMIN') and permission_key like 'finance.%'));

-- ---------------------------------------------------------------------------
-- 2. Compras: a crédito y de contado
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_p1 uuid; v_p2 uuid;
begin
  -- P1: 2.000 g a 10 por g + IVA 3.800, a crédito.
  insert into dk_purchases (supplier_id, invoice_number, invoice_date, tax) values ('60000000-0000-0000-0000-000000051a01', 'F-1', pg_temp.today(), 3800) returning id into v_p1;
  insert into dk_purchase_items (purchase_id, ingredient_id, quantity, purchase_unit_id, unit_cost) values (v_p1, '61000000-0000-0000-0000-000000051a01', 2000, pg_temp.unit('g'), 10);
  perform dk_confirm_purchase(v_p1, '{"mode": "credit"}');
  insert into _ctx (key, id) values ('p1', v_p1);
  -- P2: 1.000 g a 10 por g, de contado en efectivo.
  insert into dk_purchases (supplier_id, invoice_number, invoice_date) values ('60000000-0000-0000-0000-000000051a01', 'F-2', pg_temp.today()) returning id into v_p2;
  insert into dk_purchase_items (purchase_id, ingredient_id, quantity, purchase_unit_id, unit_cost) values (v_p2, '61000000-0000-0000-0000-000000051a01', 1000, pg_temp.unit('g'), 10);
  perform dk_confirm_purchase(v_p2, '{"mode": "cash", "method": "Efectivo"}');
  insert into _ctx (key, id) values ('p2', v_p2);
  insert into _t (area, test, expected, got) values ('Compras', 'Confirmar dos veces: rechazado', 'Solo se pueden confirmar compras en estado BORRADOR (actual: CONFIRMADA)',
    pg_temp.err(format($q$select dk_confirm_purchase('%s', '{"mode": "cash", "method": "Efectivo"}')$q$, v_p1)));
end $$;
reset role;
select pg_temp.as_owner();
insert into _ctx (key, id) values ('o1', (select id from dk_obligations where purchase_id = pg_temp.k('p1'))),
  ('o2', (select id from dk_obligations where purchase_id = pg_temp.k('p2')));

insert into _t (area, test, expected, got) values
  ('Compras', 'Cada compra crea una sola obligación', '1 · 1',
    (select count(*) from dk_obligations where purchase_id = pg_temp.k('p1'))::text || ' · ' || (select count(*) from dk_obligations where purchase_id = pg_temp.k('p2'))::text),
  ('Compras', 'A crédito: el total con IVA, vence a los 30 días del proveedor', '23800 · 30',
    (select amount::numeric(14, 0)::text || ' · ' || (due_date - accrual_date)::text from dk_obligations where id = pg_temp.k('o1'))),
  ('Compras', 'De contado: ya pagada en efectivo', '0 · Efectivo',
    pg_temp.balance(pg_temp.k('o2')) || ' · ' || (select method from dk_obligation_payments where obligation_id = pg_temp.k('o2'))),
  ('Inventario', 'Entraron 3.000 g en 2 movimientos de compra (pagar no mueve inventario)', '2 · 3000',
    (select count(*) || ' · ' || sum(quantity_base_unit)::numeric(14, 0) from dk_inventory_movements where ingredient_id = '61000000-0000-0000-0000-000000051a01')),
  ('Inventario', 'Costo promedio de la carne: 10 por g', '10', (select trim_scale(avg_cost::numeric(12, 2))::text from dk_ingredients where id = '61000000-0000-0000-0000-000000051a01'));

-- ---------------------------------------------------------------------------
-- 3. Ventas: un pedido confirmado y preparado, otro sin confirmar
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_create_recipe_version('52000000-0000-0000-0000-000000051a01', '[{"ingredient_id": "61000000-0000-0000-0000-000000051a01", "quantity": 150}]');
end $$;
reset role;
select pg_temp.as_owner();
insert into dk_orders (id, customer_id, kitchen_id, discount, delivery_fee) values
  ('40000000-0000-0000-0000-000000051a01', '30000000-0000-0000-0000-000000051a01', pg_temp.k('A'), 4000, 5000),
  ('40000000-0000-0000-0000-000000051a02', '30000000-0000-0000-0000-000000051a01', pg_temp.k('A'), 0, 0);
insert into dk_order_items (id, order_id, product_id, quantity, unit_price, kitchen_id) values
  ('41000000-0000-0000-0000-000000051a01', '40000000-0000-0000-0000-000000051a01', '52000000-0000-0000-0000-000000051a01', 2, 20000, pg_temp.k('A')),
  ('41000000-0000-0000-0000-000000051a02', '40000000-0000-0000-0000-000000051a02', '52000000-0000-0000-0000-000000051a01', 1, 20000, pg_temp.k('A'));
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  -- Pedido 1: 2 hamburguesas (40.000) − 4.000 de descuento + 5.000 de domicilio; preparado (300 g a 10 = 3.000) y cobrado.
  perform dk_confirm_order('40000000-0000-0000-0000-000000051a01');
  perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000051a01');
  perform dk_advance_kitchen_item('41000000-0000-0000-0000-000000051a01');
  perform dk_register_payment('40000000-0000-0000-0000-000000051a01', 41000, 'Transferencia', null);
  -- Mermas y ajustes: 50 g de merma (500) y un ajuste de −100 g (1.000).
  perform dk_register_waste('61000000-0000-0000-0000-000000051a01', 50, 'VENCIMIENTO', null);
  perform dk_register_adjustment('61000000-0000-0000-0000-000000051a01', -100, 'Conteo');
  -- (El pedido 2 queda NUEVO: no es venta.)
end $$;
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values
  ('Ajustes', 'El ajuste guarda el costo promedio', '10', (select trim_scale(unit_cost::numeric(12, 2))::text from dk_inventory_movements where movement_type = 'AJUSTE' and ingredient_id = '61000000-0000-0000-0000-000000051a01'));

-- ---------------------------------------------------------------------------
-- 4. Gastos y nómina en la semana
-- ---------------------------------------------------------------------------
-- La cocinera: por hora a 10.000; trabajó 8 h con 30 min de descanso (7,5 h). El gerente: mensual.
insert into dk_shifts (kitchen_id, user_id, role_id, starts_at, ends_at, break_minutes, clock_in_at, clock_out_at)
select pg_temp.k('A'), '10000000-0000-0000-0000-000000051a04', pg_temp.role_id('KITCHEN'), s, s + interval '8 hours', 30, s, s + interval '8 hours'
from (select dk_local_start(pg_temp.today() - 1, 'America/Bogota') + interval '8 hours' as s) x;

select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v jsonb; v_rent uuid;
begin
  insert into dk_member_pay (user_id, pay_type, rate, effective_from) values
    ('10000000-0000-0000-0000-000000051a04', 'hourly', 10000, '2026-01-01'),
    ('10000000-0000-0000-0000-000000051a02', 'monthly', 3100000, '2026-01-01');
  -- Arriendo de los 7 días del periodo (700.000) y gas pagado ya (50.000).
  v_rent := dk_finance_create_expense(jsonb_build_object('categoryId', (select id from dk_expense_categories where kitchen_id = pg_temp.k('A') and name = 'Arriendo'),
    'payeeName', 'Arrendador', 'description', 'Arriendo de la semana', 'amount', 700000,
    'accrualDate', pg_temp.today() - 6, 'periodStart', pg_temp.today() - 6, 'periodEnd', pg_temp.today(), 'dueDate', pg_temp.today() + 5));
  insert into _ctx (key, id) values ('rent', v_rent);
  perform dk_finance_create_expense(jsonb_build_object('categoryId', (select id from dk_expense_categories where kitchen_id = pg_temp.k('A') and name = 'Gas'),
    'description', 'Pipeta de gas', 'amount', 50000, 'accrualDate', pg_temp.today(), 'payNow', jsonb_build_object('method', 'Efectivo')));

  v := dk_finance_payroll_proposal(pg_temp.today() - 6, pg_temp.today());
  insert into _ctx (key, v) values ('proposal', v);
  -- Liquidar solo a la cocinera (75.000).
  perform dk_finance_liquidate_payroll(pg_temp.today() - 6, pg_temp.today(), pg_temp.today() + 2,
    jsonb_build_array(jsonb_build_object('userId', '10000000-0000-0000-0000-000000051a04', 'amount', 75000)));
  insert into _t (area, test, expected, got) values ('Nómina', 'El equipo con su pago vigente', 'Cocinera hourly 10000 · Gerente monthly 3100000',
    (select string_agg(full_name || ' ' || pay_type || ' ' || rate::numeric(14, 0), ' · ' order by full_name) from dk_finance_team() where pay_type is not null));
  insert into _t (area, test, expected, got) values ('Nómina', 'Liquidar dos veces el mismo periodo: rechazado', 'Ya hay una nómina liquidada para alguien en ese mismo periodo',
    pg_temp.err(format($q$select dk_finance_liquidate_payroll('%s', '%s', null, '[{"userId": "10000000-0000-0000-0000-000000051a04", "amount": 1}]')$q$, pg_temp.today() - 6, pg_temp.today())));
end $$;
reset role;
select pg_temp.as_owner();

insert into _t (area, test, expected, got) values
  ('Nómina', 'Por hora: 7,5 h trabajadas × 10.000', '7.5 · 75000',
    (select trim_scale((x ->> 'hours')::numeric)::text || ' · ' || (x ->> 'amount') from jsonb_array_elements(pg_temp.v('proposal')) x where x ->> 'name' = 'Cocinera')),
  ('Nómina', 'Mensual: 3.100.000 × 7 días / días del mes', 'sí',
    (select case when abs((x ->> 'amount')::numeric - round(3100000 * 7.0 / extract(day from (date_trunc('month', pg_temp.today()) + interval '1 month - 1 day'))::numeric)) <= 3100000 * 7.0 / 28 - 3100000 * 7.0 / 31 + 1 then 'sí' else x ->> 'amount' end
     from jsonb_array_elements(pg_temp.v('proposal')) x where x ->> 'name' = 'Gerente')),
  ('Gastos', 'Repartir por días: 3.100.000 de octubre, una semana = 700.000', '700000',
    dk_finance_prorate(3100000, '2026-10-01', '2026-10-01', '2026-10-31', '2026-10-01', '2026-10-07')::numeric(14, 0)::text),
  ('Gastos', 'Gasto pagado al registrarlo: saldo 0', '0',
    (select pg_temp.balance(id) from dk_obligations where kitchen_id = pg_temp.k('A') and description = 'Pipeta de gas'));

-- ---------------------------------------------------------------------------
-- 5. Rentabilidad: cuadra al peso
-- ---------------------------------------------------------------------------
--   Ventas netas 36.000 (40.000 − 4.000; el pedido NUEVO no cuenta) + domicilio 5.000
--   − ingredientes 3.000 (300 g a 10)            = bruta 33.000
--   − merma 500 − ajuste 1.000 − IVA de compras 3.800 − nómina 75.000 − gastos 750.000
--   = operativa 33.000 + 5.000 − 830.300 = −792.300
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v jsonb; v_ins jsonb;
begin
  v := dk_finance_pnl(pg_temp.today() - 6, pg_temp.today());
  insert into _ctx (key, v) values ('pnl', v);
  v_ins := dk_insights(pg_temp.today() - 6, pg_temp.today(), null, null, null, null);
  insert into _ctx (key, v) values ('insights', v_ins);
end $$;
reset role;
select pg_temp.as_owner();

insert into _t (area, test, expected, got) values
  ('Rentabilidad', 'Ventas netas (sin el pedido sin confirmar) y domicilio', '36000 · 5000 · 1',
    (pg_temp.v('pnl') ->> 'netSales')::numeric::text || ' · ' || (pg_temp.v('pnl') ->> 'deliveryIncome')::numeric::text || ' · ' || (pg_temp.v('pnl') ->> 'orders')),
  ('Rentabilidad', 'Costo de ingredientes = consumo real', '3000', pg_temp.v('pnl') ->> 'cogs'),
  ('Rentabilidad', 'Mermas y ajustes valorados', '500 · 1000', (pg_temp.v('pnl') ->> 'waste') || ' · ' || (pg_temp.v('pnl') ->> 'adjustments')),
  ('Rentabilidad', 'IVA de compras no descontable', '3800', pg_temp.v('pnl') ->> 'purchaseVat'),
  ('Rentabilidad', 'Nómina y gastos', '75000 · 750000', (pg_temp.v('pnl') ->> 'payroll') || ' · ' || (pg_temp.v('pnl') ->> 'expenses')),
  ('Rentabilidad', 'Utilidad bruta y operativa, al peso', '33000 · -792300', (pg_temp.v('pnl') ->> 'grossProfit') || ' · ' || (pg_temp.v('pnl') ->> 'operatingProfit')),
  ('Rentabilidad', 'Las compras NO son gasto (ni 33.800 de compras en ningún renglón)', 'sí',
    case when (pg_temp.v('pnl') ->> 'expenses')::numeric = 750000 and (pg_temp.v('pnl') ->> 'cogs')::numeric = 3000 then 'sí' else 'no' end),
  ('Rentabilidad', 'Gerente sin pago configurado no; nadie sin pago: 0', '0', pg_temp.v('pnl') #>> '{coverage,membersWithoutPay}'),
  ('Consistencia', 'Insights da las mismas ventas netas y el mismo costo', '36000 · 3000',
    ((pg_temp.v('insights') #>> '{current,netRevenue}')::numeric)::text || ' · ' || trim_scale((pg_temp.v('insights') #>> '{current,cogs}')::numeric)::text);

-- Pagar el resto de la compra a crédito NO cambia la utilidad.
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_pay uuid;
begin
  v_pay := dk_finance_pay(pg_temp.k('o1'), 10000, pg_temp.today(), 'Transferencia', 'TRX-1', null);
  insert into _ctx (key, id) values ('pay1', v_pay);
  insert into _t (area, test, expected, got) values
    ('Pagos', 'Abono parcial: saldo 13.800', '13800', pg_temp.balance(pg_temp.k('o1'))),
    ('Pagos', 'Pagar más que el saldo: rechazado', 'El pago (20000) es mayor que el saldo (13800)',
      pg_temp.err(format($q$select dk_finance_pay('%s', 20000, current_date, 'Efectivo')$q$, pg_temp.k('o1')))),
    ('Pagos', 'Anular sin motivo: rechazado', 'Escribe el motivo de la anulación', pg_temp.err(format($q$select dk_finance_void_payment('%s', ' ')$q$, v_pay)));
  perform dk_finance_void_payment(v_pay, 'Se registró en la factura equivocada');
  insert into _t (area, test, expected, got) values
    ('Pagos', 'Anulado: el saldo vuelve a 23.800', '23800', pg_temp.balance(pg_temp.k('o1'))),
    ('Pagos', 'Anular dos veces: rechazado', 'Este pago ya está anulado', pg_temp.err(format($q$select dk_finance_void_payment('%s', 'x')$q$, v_pay))),
    ('Pagos', 'La deuda de una compra no se anula a mano', 'La deuda de una compra no se anula: viene de la compra confirmada',
      pg_temp.err(format($q$select dk_finance_void_obligation('%s', 'x')$q$, pg_temp.k('o1'))));
  perform dk_finance_pay(pg_temp.k('o1'), 23800, pg_temp.today(), 'Transferencia');
  insert into _ctx (key, v) values ('pnl_after', dk_finance_pnl(pg_temp.today() - 6, pg_temp.today()));
  insert into _ctx (key, v) values ('cash', dk_finance_cashflow(pg_temp.today() - 6, pg_temp.today()));
  insert into _ctx (key, v) values ('payables', dk_finance_payables_summary());
end $$;
reset role;
select pg_temp.as_owner();

insert into _t (area, test, expected, got) values
  ('Rentabilidad', 'Igual a crédito o pagada: la utilidad no cambia', (pg_temp.v('pnl') ->> 'operatingProfit'), pg_temp.v('pnl_after') ->> 'operatingProfit'),
  ('Inventario', 'Pagar no creó movimientos', '4', (select count(*)::text from dk_inventory_movements where ingredient_id = '61000000-0000-0000-0000-000000051a01' and movement_type in ('COMPRA', 'MERMA', 'AJUSTE'))),
  -- Entra 41.000 (cobro); salen 10.000 (contado F-2) + 50.000 (gas) + 10.000 − 10.000 (abono anulado) + 23.800 (F-1) = 83.800.
  ('Flujo de caja', 'Entra lo cobrado, sale lo pagado (con la anulación)', '41000 · 83800 · -42800',
    ((pg_temp.v('cash') ->> 'in')::numeric)::text || ' · ' || ((pg_temp.v('cash') ->> 'out')::numeric)::text || ' · ' || ((pg_temp.v('cash') ->> 'net')::numeric)::text),
  ('Flujo de caja', 'Salidas por tipo: proveedores, gastos, nómina', '33800 · 50000 · 0',
    ((pg_temp.v('cash') #>> '{outByKind,purchase}')::numeric)::text || ' · ' || ((pg_temp.v('cash') #>> '{outByKind,expense}')::numeric)::text || ' · ' || ((pg_temp.v('cash') #>> '{outByKind,payroll}')::numeric)::text),
  ('Por pagar', 'Se debe el arriendo y la nómina (2 obligaciones)', '775000 · 2', ((pg_temp.v('payables') ->> 'total')::numeric)::text || ' · ' || ((pg_temp.v('payables') ->> 'count'))::text);

-- ---------------------------------------------------------------------------
-- 6. Gastos fijos, compras anteriores, anular
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_rec uuid; v_n integer;
begin
  v_rec := dk_finance_save_recurring(jsonb_build_object('categoryId', (select id from dk_expense_categories where kitchen_id = pg_temp.k('A') and name = 'Internet y telefonía'),
    'description', 'Internet', 'amount', 120000, 'dayOfMonth', 5, 'startsOn', (date_trunc('month', pg_temp.today()) - interval '2 months')::date));
  insert into _t (area, test, expected, got) values ('Gastos fijos', 'Crea los 3 meses (dos atrás y el actual)', '3',
    (select count(*)::text from dk_obligations where recurring_id = v_rec));
  v_n := dk_finance_generate_recurring();
  insert into _t (area, test, expected, got) values ('Gastos fijos', 'Generar otra vez no duplica', '0 · 3', v_n::text || ' · ' || (select count(*) from dk_obligations where recurring_id = v_rec));
  insert into _t (area, test, expected, got) values ('Gastos fijos', 'Vence el día 5 de su mes', '5',
    (select extract(day from max(due_date))::text from dk_obligations where recurring_id = v_rec));
  insert into _t (area, test, expected, got) values ('Anular', 'Un gasto con pagos no se anula', 'Tiene pagos registrados: anúlalos primero',
    pg_temp.err(format($q$select dk_finance_void_obligation('%s', 'x')$q$, (select id from dk_obligations where description = 'Pipeta de gas'))));
  v_n := (dk_finance_pnl(pg_temp.today() - 6, pg_temp.today()) ->> 'expenses')::integer;
  perform dk_finance_void_obligation(pg_temp.k('rent'), 'Se registró dos veces');
  insert into _t (area, test, expected, got) values ('Anular', 'Anulado: el arriendo (700.000) sale de la rentabilidad', '700000',
    (v_n - (dk_finance_pnl(pg_temp.today() - 6, pg_temp.today()) ->> 'expenses')::integer)::text);
end $$;
reset role;
select pg_temp.as_owner();

-- A purchase confirmed before Finanzas existed (its obligation did not exist).
delete from dk_obligation_payments where obligation_id = pg_temp.k('o2');
delete from dk_obligations where id = pg_temp.k('o2');
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Compras anteriores', 'Se ofrecen las compras sin obligación', '1', dk_finance_payables_summary() ->> 'previousPurchases'),
    ('Compras anteriores', 'Agregarla crea una; agregarla otra vez, ninguna', '1 · 0',
      dk_finance_add_previous_purchases(array[pg_temp.k('p2')])::text || ' · ' || dk_finance_add_previous_purchases(array[pg_temp.k('p2')])::text);
end $$;
reset role;
select pg_temp.as_owner();

-- ---------------------------------------------------------------------------
-- 6b. IVA descontable y Copilot (migración dk_finance_copilot)
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('manager'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v jsonb;
begin
  perform dk_finance_set_vat_deductible(true);
  insert into _t (area, test, expected, got) values ('IVA', 'Si se descuenta el IVA, no es costo', '0', dk_finance_pnl(pg_temp.today() - 6, pg_temp.today()) ->> 'purchaseVat');
  perform dk_finance_set_vat_deductible(false);
  v := dk_copilot_finance(pg_temp.today() - 6, pg_temp.today());
  insert into _t (area, test, expected, got) values
    ('Copilot', 'Copilot ve lo que se debe y la rentabilidad (GERENTE)', 'sí · sí',
      case when (v #>> '{payables,total}')::numeric > 0 then 'sí' else 'no' end || ' · ' || case when v ? 'profitability' and v -> 'profitability' <> 'null' then 'sí' else 'no' end),
    ('Copilot', 'Sin nómina, Copilot no lista la nómina de nadie', '0',
      (select count(*)::text from jsonb_array_elements(v #> '{payables,items}') i where i ->> 'kind' = 'payroll'));
end $$;
reset role;
select pg_temp.act_as(pg_temp.k('cashier'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('IVA', 'CAJA no cambia el ajuste del IVA', 'blocked', pg_temp.blocked('select dk_finance_set_vat_deductible(true)')),
    ('Copilot', 'CAJA: Copilot no tiene finanzas', 'blocked', pg_temp.blocked('select dk_copilot_finance(current_date - 6, current_date)'));
end $$;
reset role;
select pg_temp.as_owner();

-- ---------------------------------------------------------------------------
-- 7. Permisos y aislamiento
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('manager'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Permisos', 'GERENTE ve la rentabilidad', 'ALLOWED', pg_temp.err(format($q$select dk_finance_pnl('%s', '%s')$q$, pg_temp.today() - 6, pg_temp.today()))),
    ('Permisos', 'GERENTE no ve la nómina de nadie', '0 · 0', (select count(*)::text from dk_obligations where kind = 'payroll') || ' · ' || (select count(*)::text from dk_member_pay)),
    ('Permisos', 'GERENTE no ve el pago del equipo', 'blocked', pg_temp.blocked('select * from dk_finance_team()')),
    ('Permisos', 'GERENTE no liquida nómina', 'blocked', pg_temp.blocked(format($q$select dk_finance_payroll_proposal('%s', '%s')$q$, pg_temp.today() - 6, pg_temp.today()))),
    ('Permisos', 'Por la API no se crea una obligación', 'blocked',
      pg_temp.blocked(format($q$insert into dk_obligations (kind, category_id, description, amount, accrual_date, due_date) values ('expense', '%s', 'x x', 1, current_date, current_date)$q$,
        (select id from dk_expense_categories limit 1)))),
    ('Permisos', 'Por la API no se crea un pago', 'blocked',
      pg_temp.blocked(format($q$insert into dk_obligation_payments (obligation_id, amount, paid_on, method) values ('%s', 1, current_date, 'Efectivo')$q$, pg_temp.k('o1'))));
end $$;
reset role;

select pg_temp.act_as(pg_temp.k('cashier'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Permisos', 'CAJA no ve finanzas', '0 · blocked', (select count(*)::text from dk_obligations) || ' · ' ||
      pg_temp.blocked(format($q$select dk_finance_pnl('%s', '%s')$q$, pg_temp.today() - 6, pg_temp.today()))),
    ('Permisos', 'CAJA no paga', 'blocked', pg_temp.blocked(format($q$select dk_finance_pay('%s', 1, current_date, 'Efectivo')$q$, pg_temp.k('o1'))));
end $$;
reset role;

select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('B'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Aislamiento', 'Desde B no se ven las obligaciones de A', '0', (select count(*)::text from dk_obligations)),
    ('Aislamiento', 'Desde B no se paga una obligación de A', 'blocked', pg_temp.blocked(format($q$select dk_finance_pay('%s', 1, current_date, 'Efectivo')$q$, pg_temp.k('o1')))),
    ('Aislamiento', 'La rentabilidad de B está vacía', '0 · 0', (dk_finance_pnl(pg_temp.today() - 6, pg_temp.today()) ->> 'netSales') || ' · ' || (dk_finance_pnl(pg_temp.today() - 6, pg_temp.today()) ->> 'expenses'));
end $$;
reset role;
select pg_temp.as_owner();

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
