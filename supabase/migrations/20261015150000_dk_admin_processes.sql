-- ADR 0063, fase 3 (D5): procesos administrativos con reglas, sin IA.
--
-- 1. Cartera: plazo de pago por cliente; al confirmar un pedido de ese cliente se fija su vencimiento
--    (arregla «saldo vencido», que nunca se calculaba porque nadie escribía due_date). Antigüedad de la cartera.
-- 2. Gastos fijos: se generan con pg_cron cada día (sin depender de abrir Finanzas). «Monto variable»: la
--    obligación nace con el monto de referencia y «por confirmar»; no se paga hasta confirmar el valor real.
--    Pago en lote de varias obligaciones de un mismo beneficiario.
-- 3. Turnos sin salida: un gerente corrige la marcación (queda en la bitácora); la nómina los cuenta.
-- 4. La campana suma lo administrativo (cada aviso con su permiso) y deja de avisar «bajo el mínimo» con mínimo 0.

-- ---------------------------------------------------------------------------
-- 1. Cartera
-- ---------------------------------------------------------------------------
alter table dk_customers add column payment_terms_days integer check (payment_terms_days between 0 and 365);
comment on column dk_customers.payment_terms_days is 'ADR 0063: días de plazo para pagar sus pedidos. NULL o 0 = sin plazo (no vencen).';

-- Deterministic (ADR 0063 D6): only the date, and only when the order has none.
create or replace function dk_order_set_due_date()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_terms integer;
begin
  if new.due_date is null and new.customer_id is not null and new.status not in ('NUEVO', 'CANCELADO')
     and (tg_op = 'INSERT' or old.status = 'NUEVO' or old.customer_id is distinct from new.customer_id) then
    select payment_terms_days into v_terms from dk_customers where id = new.customer_id;
    if coalesce(v_terms, 0) > 0 then
      new.due_date := dk_local_date(coalesce(new.created_at, now()), dk_kitchen_tz(new.kitchen_id)) + v_terms;
    end if;
  end if;
  return new;
end;
$$;
create trigger dk_trg_orders_due_date before insert or update of status, customer_id on dk_orders
  for each row execute function dk_order_set_due_date();

-- The customer card also returns the term (the detail builds on this helper).
create or replace function dk_customer_type_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('email', c.email, 'type', c.customer_type, 'legalName', c.legal_name, 'taxId', c.tax_id,
                            'contactName', c.contact_name, 'preferred', c.preferred, 'preferredNote', c.preferred_note,
                            'paymentTermsDays', c.payment_terms_days)
  from dk_customers c where c.id = p_id
$$;
revoke all on function dk_customer_type_json(uuid) from public, anon, authenticated;

-- How old the debt is: not due yet (or without a term), 1-30, 31-60 and more than 60 days past due.
create or replace function dk_receivables_aging()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_today date;
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  if not dk_can('receivables.view') then raise exception 'No autorizado para ver la cartera'; end if;
  v_today := dk_local_date(now(), dk_kitchen_tz(v_kitchen));
  return (
    with b as (
      select o.customer_id, o.due_date, o.total - coalesce((select sum(p.amount) from dk_order_payments p where p.order_id = o.id), 0) as balance
      from dk_orders o
      where o.kitchen_id = v_kitchen and o.status <> 'CANCELADO' and o.customer_id is not null
    )
    select jsonb_build_object(
      'current', coalesce(sum(balance) filter (where due_date is null or due_date >= v_today), 0),
      'd1_30', coalesce(sum(balance) filter (where v_today - due_date between 1 and 30), 0),
      'd31_60', coalesce(sum(balance) filter (where v_today - due_date between 31 and 60), 0),
      'd61', coalesce(sum(balance) filter (where v_today - due_date > 60), 0),
      'total', coalesce(sum(balance), 0),
      'overdueCustomers', count(distinct customer_id) filter (where due_date < v_today))
    from b where balance > 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Gastos fijos y pagos
-- ---------------------------------------------------------------------------
alter table dk_recurring_obligations add column variable_amount boolean not null default false;
comment on column dk_recurring_obligations.variable_amount is 'ADR 0063: el monto cambia cada mes (luz, gas): la obligación nace con el de referencia y por confirmar.';
alter table dk_obligations add column amount_pending boolean not null default false;
comment on column dk_obligations.amount_pending is 'ADR 0063: el monto es de referencia y falta confirmar el real. No se paga mientras sea true.';

-- The months of one account, once each (until the current month, at most 12 back). Internal: no permission check.
create or replace function dk_finance_generate_recurring_for(p_kitchen uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := dk_local_date(now(), dk_kitchen_tz(p_kitchen));
  v_count integer := 0;
  v_rows integer;
  r record;
  v_month date;
begin
  for r in select * from dk_recurring_obligations where kitchen_id = p_kitchen and active loop
    v_month := greatest(date_trunc('month', r.starts_on)::date, (date_trunc('month', v_today) - interval '11 months')::date);
    while v_month <= date_trunc('month', v_today)::date loop
      insert into dk_obligations (kitchen_id, kind, category_id, supplier_id, payee_name, description, amount, accrual_date,
                                  period_start, period_end, due_date, recurring_id, recurring_period, amount_pending, created_by)
      values (p_kitchen, 'expense', r.category_id, r.supplier_id, r.payee_name, r.description, r.amount, v_month,
              v_month, (v_month + interval '1 month - 1 day')::date, v_month + (r.day_of_month - 1), r.id, v_month, r.variable_amount, r.created_by)
      on conflict (recurring_id, recurring_period) where recurring_id is not null do nothing;
      get diagnostics v_rows = row_count;
      v_count := v_count + v_rows;
      v_month := (v_month + interval '1 month')::date;
    end loop;
  end loop;
  return v_count;
end;
$$;
revoke all on function dk_finance_generate_recurring_for(uuid) from public, anon, authenticated;

create or replace function dk_finance_generate_recurring()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
begin
  if v_kitchen is null or not dk_can('finance.view') then return 0; end if;
  return dk_finance_generate_recurring_for(v_kitchen);
end;
$$;

-- pg_cron: every account, every day (the person no longer has to open Finanzas).
create or replace function dk_finance_generate_recurring_all()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
  v_kitchen uuid;
begin
  for v_kitchen in select distinct kitchen_id from dk_recurring_obligations where active loop
    v_total := v_total + dk_finance_generate_recurring_for(v_kitchen);
  end loop;
  return v_total;
end;
$$;
revoke all on function dk_finance_generate_recurring_all() from public, anon, authenticated;
select cron.schedule('dk-finance-recurring', '20 10 * * *', 'select public.dk_finance_generate_recurring_all()');

create or replace function dk_finance_save_recurring(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_id uuid := nullif(p ->> 'id', '')::uuid;
begin
  if v_kitchen is null then raise exception 'No hay una cuenta activa'; end if;
  if not dk_can('finance.manage') then raise exception 'No autorizado para registrar gastos'; end if;
  if v_id is null then
    insert into dk_recurring_obligations (kitchen_id, category_id, supplier_id, payee_name, description, amount, day_of_month, starts_on, active, variable_amount)
    values (v_kitchen, (p ->> 'categoryId')::uuid, nullif(p ->> 'supplierId', '')::uuid, nullif(btrim(p ->> 'payeeName'), ''),
            btrim(p ->> 'description'), (p ->> 'amount')::numeric, (p ->> 'dayOfMonth')::integer,
            coalesce(nullif(p ->> 'startsOn', '')::date, date_trunc('month', dk_local_date(now(), dk_account_tz()))::date),
            coalesce((p ->> 'active')::boolean, true), coalesce((p ->> 'variableAmount')::boolean, false))
    returning id into v_id;
  else
    update dk_recurring_obligations
    set category_id = (p ->> 'categoryId')::uuid, supplier_id = nullif(p ->> 'supplierId', '')::uuid, payee_name = nullif(btrim(p ->> 'payeeName'), ''),
        description = btrim(p ->> 'description'), amount = (p ->> 'amount')::numeric, day_of_month = (p ->> 'dayOfMonth')::integer,
        active = coalesce((p ->> 'active')::boolean, true),
        variable_amount = coalesce((p ->> 'variableAmount')::boolean, variable_amount)
    where id = v_id and kitchen_id = v_kitchen;
    if not found then raise exception 'Gasto fijo no encontrado'; end if;
  end if;
  perform dk_finance_generate_recurring();
  return v_id;
end;
$$;

-- The real amount of a «monto variable» month, before paying it.
create or replace function dk_finance_confirm_amount(p_obligation uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row dk_obligations;
begin
  perform dk_assert_in_active_kitchen('dk_obligations', p_obligation);
  if not dk_can('finance.manage') then raise exception 'No autorizado para registrar gastos'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'El valor debe ser mayor que 0'; end if;
  select * into v_row from dk_obligations where id = p_obligation for update;
  if v_row.voided_at is not null then raise exception 'La obligación está anulada'; end if;
  if not v_row.amount_pending then raise exception 'El monto ya está confirmado'; end if;
  update dk_obligations set amount = p_amount, amount_pending = false where id = p_obligation;
end;
$$;

create or replace function dk_finance_pay(p_obligation uuid, p_amount numeric, p_paid_on date, p_method text, p_reference text default null, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row dk_obligations;
  v_balance numeric;
  v_id uuid;
begin
  perform dk_assert_in_active_kitchen('dk_obligations', p_obligation);
  -- Pagar al confirmar una compra de contado lo hace quien confirma (es un hecho de la compra).
  if not (dk_can('finance.pay') or coalesce(current_setting('dk.purchase_paid_now', true), '') = 'on') then
    raise exception 'No autorizado para registrar pagos';
  end if;
  select * into v_row from dk_obligations where id = p_obligation for update;
  if v_row.kind = 'payroll' and not dk_can('finance.payroll') then raise exception 'No autorizado para pagar nómina'; end if;
  if v_row.voided_at is not null then raise exception 'La obligación está anulada'; end if;
  -- ADR 0063: a variable amount is confirmed before paying.
  if v_row.amount_pending then raise exception 'Confirma el monto real antes de pagar' using hint = 'amount_pending'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'El valor del pago debe ser mayor que 0'; end if;
  if p_paid_on is null then raise exception 'Falta la fecha del pago'; end if;
  if p_method is null or p_method not in ('Efectivo', 'Transferencia', 'Tarjeta', 'Otro') then raise exception 'Elige cómo se pagó'; end if;
  v_balance := dk_obligation_balance(p_obligation);
  if p_amount > v_balance then
    raise exception 'El pago (%) es mayor que el saldo (%)', p_amount, v_balance;
  end if;
  insert into dk_obligation_payments (kitchen_id, obligation_id, amount, paid_on, method, reference, note)
  values (v_row.kitchen_id, p_obligation, p_amount, p_paid_on, p_method, nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Pay the whole balance of several obligations of ONE payee (supplier, person or name), in one go.
create or replace function dk_finance_pay_batch(p_obligations uuid[], p_paid_on date, p_method text, p_reference text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_id uuid;
  v_balance numeric;
  v_count integer := 0;
  v_total numeric := 0;
begin
  if v_kitchen is null then raise exception 'No hay una cuenta activa'; end if;
  if not dk_can('finance.pay') then raise exception 'No autorizado para registrar pagos'; end if;
  if coalesce(array_length(p_obligations, 1), 0) = 0 then raise exception 'Elige qué pagar'; end if;
  if coalesce(array_length(p_obligations, 1), 0) > 100 then raise exception 'Demasiadas obligaciones a la vez'; end if;
  if (select count(*) from dk_obligations where id = any (p_obligations) and kitchen_id = v_kitchen) <> (select count(distinct x) from unnest(p_obligations) x) then
    raise exception 'Alguna obligación no es de esta cuenta';
  end if;
  if (select count(distinct coalesce(supplier_id::text, member_user_id::text, lower(btrim(payee_name)), '—')) from dk_obligations where id = any (p_obligations)) > 1 then
    raise exception 'El pago en lote es para un mismo beneficiario' using hint = 'mixed_payees';
  end if;
  for v_id in select id from dk_obligations where id = any (p_obligations) order by due_date, created_at loop
    v_balance := dk_obligation_balance(v_id);
    if v_balance > 0 then
      perform dk_finance_pay(v_id, v_balance, p_paid_on, p_method, p_reference, 'Pago en lote');
      v_count := v_count + 1;
      v_total := v_total + v_balance;
    end if;
  end loop;
  return jsonb_build_object('paid', v_count, 'amount', v_total);
end;
$$;

-- The balances view gains the «por confirmar» flag (appended at the end).
create or replace view dk_obligation_balances with (security_invoker = true) as
select o.id, o.kitchen_id, o.kind, o.category_id, c.name as category_name, o.purchase_id, p.invoice_number,
       o.supplier_id, s.name as supplier_name, o.member_user_id, u.full_name as member_name, o.payee_name,
       coalesce(s.name, u.full_name, o.payee_name) as payee, o.description, o.amount, o.accrual_date, o.period_start, o.period_end,
       o.due_date, o.recurring_id, o.notes, o.voided_at, o.void_reason, o.created_at,
       coalesce(pay.paid, 0) as paid,
       case when o.voided_at is not null then 0 else o.amount - coalesce(pay.paid, 0) end as balance,
       case
         when o.voided_at is not null then 'voided'
         when o.amount - coalesce(pay.paid, 0) <= 0 then 'paid'
         when o.due_date < dk_local_date(now(), dk_account_tz()) then 'overdue'
         when coalesce(pay.paid, 0) > 0 then 'partial'
         else 'pending'
       end as status,
       o.amount_pending
from dk_obligations o
left join dk_expense_categories c on c.id = o.category_id
left join dk_purchases p on p.id = o.purchase_id
left join dk_suppliers s on s.id = o.supplier_id
left join dk_users u on u.id = o.member_user_id
left join lateral (select sum(amount) as paid from dk_obligation_payments where obligation_id = o.id) pay on true;
grant select on dk_obligation_balances to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Turnos sin salida
-- ---------------------------------------------------------------------------
-- A shift whose person never clocked out, 2 h after its planned end.
create or replace function dk_shift_is_open_past_end(p_clock_in timestamptz, p_clock_out timestamptz, p_ends_at timestamptz)
returns boolean
language sql
immutable
as $$ select p_clock_in is not null and p_clock_out is null and p_ends_at < now() - interval '2 hours' $$;

-- A manager fixes the clock-in/out of a shift; the reason and the old values go to the activity log.
create or replace function dk_shift_correct_clock(p_shift uuid, p_clock_in timestamptz, p_clock_out timestamptz, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_row dk_shifts;
  v_k dk_kitchens;
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  if not dk_can('staff.manage') then raise exception 'No autorizado para corregir marcaciones'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Escribe el motivo de la corrección'; end if;
  if p_clock_in is null then raise exception 'Falta la hora de entrada'; end if;
  if p_clock_out is not null and p_clock_out < p_clock_in then raise exception 'La salida no puede ser antes de la entrada'; end if;
  if p_clock_out is not null and p_clock_out > now() then raise exception 'La salida no puede ser en el futuro'; end if;
  if p_clock_out is not null and p_clock_out - p_clock_in > interval '16 hours' then raise exception 'Un turno no puede durar más de 16 horas'; end if;
  select * into v_row from dk_shifts where id = p_shift and kitchen_id = v_kitchen for update;
  if v_row.id is null then raise exception 'Turno no encontrado'; end if;
  if v_row.status <> 'scheduled' then raise exception 'El turno está cancelado'; end if;

  update dk_shifts
     set clock_in_at = p_clock_in,
         clock_out_at = p_clock_out,
         -- An unplanned shift is the clocked time itself.
         starts_at = case when unplanned then p_clock_in else starts_at end,
         ends_at = case when unplanned then greatest(coalesce(p_clock_out, p_clock_in + interval '8 hours'), p_clock_in + interval '15 minutes') else ends_at end
   where id = p_shift;

  select * into v_k from dk_kitchens where id = v_kitchen;
  perform dk_log_event('staff.clock_corrected',
    format('Marcación corregida: %s', (select full_name from dk_users where id = v_row.user_id)),
    v_k.organization_id, v_kitchen, 'success', 'db',
    jsonb_build_object('shiftId', p_shift, 'reason', btrim(p_reason),
      'before', jsonb_build_object('clockIn', v_row.clock_in_at, 'clockOut', v_row.clock_out_at),
      'after', jsonb_build_object('clockIn', p_clock_in, 'clockOut', p_clock_out)),
    null, p_shift::text);
exception when exclusion_violation then
  raise exception 'Con esas horas el turno se cruza con otro de la misma persona';
end;
$$;

-- Payroll: the same proposal, plus how many shifts of each person never clocked out in the period.
create or replace function dk_finance_payroll_proposal(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_tz text := dk_account_tz();
begin
  if v_kitchen is null then raise exception 'No hay una cuenta activa'; end if;
  if not dk_can('finance.payroll') then raise exception 'No autorizado para la nómina'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then raise exception 'Elige un periodo de hasta dos meses'; end if;
  return (
    select coalesce(jsonb_agg(x order by x ->> 'name'), '[]')
    from (
      select jsonb_build_object(
        'userId', u.id, 'name', u.full_name,
        'payType', pay.pay_type, 'rate', pay.rate,
        'hours', dk_finance_worked_hours(v_kitchen, u.id, p_from, p_to, v_tz),
        'amount', case
          when pay.pay_type = 'hourly' then round(pay.rate * dk_finance_worked_hours(v_kitchen, u.id, p_from, p_to, v_tz))
          when pay.pay_type = 'monthly' then round((
            select sum(pay.rate * (least(p_to, (m + interval '1 month - 1 day')::date) - greatest(p_from, m::date) + 1)
                       / extract(day from (m + interval '1 month - 1 day'))::numeric)
            from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') m))
        end,
        'openShifts', (select count(*) from dk_shifts s
                       where s.kitchen_id = v_kitchen and s.user_id = u.id and s.status = 'scheduled'
                         and s.clock_in_at is not null and s.clock_out_at is null
                         and s.clock_in_at >= dk_local_start(p_from, v_tz) and s.clock_in_at < dk_local_start(p_to + 1, v_tz)),
        'liquidated', exists (select 1 from dk_obligations o where o.kitchen_id = v_kitchen and o.kind = 'payroll'
                              and o.member_user_id = u.id and o.voided_at is null and o.period_start <= p_to and o.period_end >= p_from)) as x
      from dk_kitchen_members m
      join dk_users u on u.id = m.user_id
      left join lateral (select pay_type, rate from dk_member_pay mp
                         where mp.kitchen_id = v_kitchen and mp.user_id = u.id and mp.effective_from <= p_to
                         order by mp.effective_from desc limit 1) pay on true
      where m.kitchen_id = v_kitchen and m.active
        and (pay.pay_type is not null or dk_finance_worked_hours(v_kitchen, u.id, p_from, p_to, v_tz) > 0
             or exists (select 1 from dk_shifts s where s.kitchen_id = v_kitchen and s.user_id = u.id and s.status = 'scheduled'
                          and s.clock_in_at is not null and s.clock_out_at is null
                          and s.clock_in_at >= dk_local_start(p_from, v_tz) and s.clock_in_at < dk_local_start(p_to + 1, v_tz)))
    ) t);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. La campana
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
  v_m integer;
  v_amount numeric;
  v_sub dk_subscriptions;
  v_limits jsonb;
  v_daily integer;
  v_runs integer;
  v_cost jsonb;
  v_budget jsonb;
  r record;
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  if v_me is null then raise exception 'No autorizado' using errcode = '42501'; end if;
  select * into v_k from dk_kitchens where id = v_kitchen;
  v_day := dk_local_date(now(), v_k.timezone);
  v_cost := dk_cost_settings(v_kitchen);

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
    -- ADR 0063: an ingredient without a minimum is never «under the minimum».
    select count(*) into v_n from dk_ingredient_stock s join dk_ingredients i on i.id = s.ingredient_id
    where s.kitchen_id = v_kitchen and i.active and i.min_stock > 0 and s.stock_available <= i.min_stock;
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

  -- Administration (ADR 0063 D5) --------------------------------------------
  if dk_can('finance.view') then
    select count(*), coalesce(sum(balance), 0) into v_n, v_amount
    from (select o.due_date, o.amount - coalesce((select sum(amount) from dk_obligation_payments where obligation_id = o.id), 0) as balance
          from dk_obligations o where o.kitchen_id = v_kitchen and o.voided_at is null) b
    where balance > 0 and due_date < v_day;
    if v_n > 0 then
      v_items := v_items || jsonb_build_object('key', format('payables_overdue:%s:%s', v_day, v_n), 'group', 'admin', 'type', 'payables_overdue',
        'severity', 'warning', 'title', format('%s %s vencida%s por pagar', v_n, case when v_n = 1 then 'cuenta' else 'cuentas' end, case when v_n = 1 then '' else 's' end),
        'detail', format('Suman %s.', to_char(round(v_amount), 'FM999G999G999G999')), 'to', '/finance/payables', 'action', 'Ver por pagar', 'at', now(), 'ongoing', true);
    end if;
    select count(*), coalesce(sum(balance), 0) into v_n, v_amount
    from (select o.due_date, o.amount - coalesce((select sum(amount) from dk_obligation_payments where obligation_id = o.id), 0) as balance
          from dk_obligations o where o.kitchen_id = v_kitchen and o.voided_at is null) b
    where balance > 0 and due_date between v_day and v_day + 7;
    if v_n > 0 then
      v_items := v_items || jsonb_build_object('key', format('payables_due:%s:%s', v_day, v_n), 'group', 'admin', 'type', 'payables_due',
        'severity', 'info', 'title', format('%s %s por pagar esta semana', v_n, case when v_n = 1 then 'cuenta' else 'cuentas' end),
        'detail', format('Vencen en los próximos 7 días y suman %s.', to_char(round(v_amount), 'FM999G999G999G999')), 'to', '/finance/payables', 'action', 'Ver por pagar', 'at', now(), 'ongoing', true);
    end if;
    select count(*) into v_n from dk_obligations where kitchen_id = v_kitchen and voided_at is null and amount_pending and due_date <= v_day + 7;
    if v_n > 0 then
      v_items := v_items || jsonb_build_object('key', format('amount_pending:%s:%s', v_day, v_n), 'group', 'admin', 'type', 'amount_pending',
        'severity', 'info', 'title', format('%s %s con monto por confirmar', v_n, case when v_n = 1 then 'gasto fijo' else 'gastos fijos' end),
        'detail', 'Escribe el valor real de la factura antes de pagarlo.', 'to', '/finance/payables', 'action', 'Confirmar montos', 'at', now(), 'ongoing', true);
    end if;
  end if;
  if dk_can('purchasing.view') then
    select count(*) into v_n from dk_purchases where kitchen_id = v_kitchen and status = 'BORRADOR' and created_at < now() - interval '3 days';
    if v_n > 0 then
      v_items := v_items || jsonb_build_object('key', format('old_drafts:%s:%s', v_day, v_n), 'group', 'admin', 'type', 'old_drafts',
        'severity', 'info', 'title', format('%s %s en borrador hace más de 3 días', v_n, case when v_n = 1 then 'compra' else 'compras' end),
        'detail', 'No han entrado al inventario: confírmalas o bórralas.', 'to', '/supply/compras', 'action', 'Ver compras', 'at', now(), 'ongoing', true);
    end if;
    select count(*) into v_n from dk_invoice_imports where kitchen_id = v_kitchen and status = 'LISTA' and updated_at < now() - interval '1 hour';
    if v_n > 0 then
      v_items := v_items || jsonb_build_object('key', format('invoices_unsaved:%s:%s', v_day, v_n), 'group', 'admin', 'type', 'invoices_unsaved',
        'severity', 'info', 'title', format('%s %s leída%s sin guardar', v_n, case when v_n = 1 then 'factura' else 'facturas' end, case when v_n = 1 then '' else 's' end),
        'detail', 'Ya se pagó la lectura: revísalas y guárdalas como compra.', 'to', '/supply/compras', 'action', 'Ver compras', 'at', now(), 'ongoing', true);
    end if;
  end if;
  if (v_cost ->> 'enabled')::boolean and dk_can('inventory.view') then
    select count(distinct ingredient_id), max(id) into v_n, v_m from dk_ingredient_cost_changes
    where kitchen_id = v_kitchen and created_at > now() - interval '7 days' and change_pct >= (v_cost ->> 'price_change_pct')::numeric;
    if v_n > 0 then
      v_items := v_items || jsonb_build_object('key', format('price_up:%s', v_m), 'group', 'admin', 'type', 'price_up',
        'severity', 'warning', 'title', format('%s %s subió de costo', v_n, case when v_n = 1 then 'insumo' else 'insumos' end),
        'detail', format('Más de %s %% en los últimos 7 días: revisa precios y proveedores.', v_cost ->> 'price_change_pct'),
        'to', '/supply/stock', 'action', 'Ver stock', 'at', now(), 'ongoing', false);
    end if;
  end if;
  if (v_cost ->> 'enabled')::boolean and (dk_can('recipes.view') or dk_can('reports.profitability')) then
    select count(*) filter (where p.price <= p.estimated_cost),
           count(*) filter (where p.price > p.estimated_cost and p.estimated_cost / p.price * 100 > (v_cost ->> 'target_food_cost_pct')::numeric)
    into v_n, v_m
    from dk_products p where p.kitchen_id = v_kitchen and p.active and p.uses_inventory and p.estimated_cost > 0 and p.price > 0;
    if v_n > 0 then
      v_items := v_items || jsonb_build_object('key', format('below_cost:%s:%s', v_day, v_n), 'group', 'admin', 'type', 'below_cost',
        'severity', 'error', 'title', format('%s %s se vende%s bajo su costo', v_n, case when v_n = 1 then 'plato' else 'platos' end, case when v_n = 1 then '' else 'n' end),
        'detail', 'El precio no cubre el costo de la receta.', 'to', '/menu-planner', 'action', 'Ver catálogo', 'at', now(), 'ongoing', true);
    end if;
    if v_m > 0 then
      v_items := v_items || jsonb_build_object('key', format('above_target:%s:%s', v_day, v_m), 'group', 'admin', 'type', 'above_target',
        'severity', 'info', 'title', format('%s %s sobre el costo objetivo', v_m, case when v_m = 1 then 'plato' else 'platos' end),
        'detail', format('Su costo pasa del %s %% del precio: hay un precio sugerido en cada plato.', v_cost ->> 'target_food_cost_pct'),
        'to', '/menu-planner', 'action', 'Ver catálogo', 'at', now(), 'ongoing', true);
    end if;
  end if;
  if dk_can('staff.view') then
    select count(*) into v_n from dk_shifts
    where kitchen_id = v_kitchen and status = 'scheduled' and dk_shift_is_open_past_end(clock_in_at, clock_out_at, ends_at);
    if v_n > 0 then
      v_items := v_items || jsonb_build_object('key', format('open_shifts:%s:%s', v_day, v_n), 'group', 'admin', 'type', 'open_shifts',
        'severity', 'warning', 'title', format('%s %s sin marcar salida', v_n, case when v_n = 1 then 'turno' else 'turnos' end),
        'detail', 'Pasaron más de 2 horas del fin del turno. Corrige la marcación para que las horas y la nómina cuadren.',
        'to', '/staff?view=hours', 'action', 'Ver horas', 'at', now(), 'ongoing', true);
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

  -- AI: failed analyses, the quota and the monthly budget: for whoever manages or watches the AI.
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
    -- ADR 0063: the same rule as the quota (a paid run, also a cancelled one or one with tokens).
    select count(*) into v_runs from dk_ai_insights
    where kitchen_id = v_kitchen and feature_key <> 'copilot' and dk_ai_run_billed(status, input_tokens) and created_at > now() - interval '24 hours';
    if v_runs >= 0.8 * v_daily then
      v_items := v_items || jsonb_build_object('key', format('ai_quota:%s:%s', v_day, case when v_runs >= v_daily then 'full' else 'near' end), 'group', 'ai', 'type', 'ai_quota',
        'severity', case when v_runs >= v_daily then 'error' else 'warning' end,
        'title', format('Análisis de IA: %s de %s en 24 h', least(v_runs, v_daily), v_daily),
        'detail', case when v_runs >= v_daily then 'Se llegó al tope del plan: las pantallas usan las reglas fijas hasta que se libere.' else 'Cerca del tope del plan.' end,
        'to', '/settings/ai?tab=usage', 'action', 'Ver uso de IA', 'at', now(), 'ongoing', true);
    end if;

    v_budget := dk_ai_budget_status(v_kitchen);
    if (v_budget ->> 'alert')::boolean then
      v_items := v_items || jsonb_build_object('key', format('ai_budget:%s:%s', to_char(v_day, 'YYYY-MM'), case when (v_budget ->> 'exceeded')::boolean then 'full' else 'near' end),
        'group', 'ai', 'type', 'ai_budget',
        'severity', case when (v_budget ->> 'exceeded')::boolean then 'error' else 'warning' end,
        'title', format('Presupuesto de IA del mes: %s %%', v_budget ->> 'pct'),
        'detail', case when (v_budget ->> 'exceeded')::boolean
          then 'Se llegó al presupuesto: los análisis automáticos se pausan hasta el próximo mes. Copilot y las facturas siguen.'
          else 'Cerca del presupuesto mensual de la cuenta.' end,
        'to', '/settings/ai', 'action', 'Ver costo de IA', 'at', now(), 'ongoing', true);
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

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
revoke all on function dk_receivables_aging(), dk_finance_confirm_amount(uuid, numeric), dk_finance_pay_batch(uuid[], date, text, text),
  dk_shift_correct_clock(uuid, timestamptz, timestamptz, text), dk_order_set_due_date() from public, anon;
grant execute on function dk_receivables_aging(), dk_finance_confirm_amount(uuid, numeric), dk_finance_pay_batch(uuid[], date, text, text),
  dk_shift_correct_clock(uuid, timestamptz, timestamptz, text) to authenticated;
revoke all on function dk_finance_pay(uuid, numeric, date, text, text, text), dk_finance_save_recurring(jsonb), dk_finance_generate_recurring(),
  dk_finance_payroll_proposal(date, date), dk_my_notifications() from public, anon;
grant execute on function dk_finance_pay(uuid, numeric, date, text, text, text), dk_finance_save_recurring(jsonb), dk_finance_generate_recurring(),
  dk_finance_payroll_proposal(date, date), dk_my_notifications() to authenticated;

notify pgrst, 'reload schema';
