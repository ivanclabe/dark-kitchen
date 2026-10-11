-- ADR 0051 — Finanzas: el ajuste del IVA de compras (D9) y Copilot (D14).

-- «¿Descuentas el IVA de tus compras?» (finance.manage).
create or replace function dk_finance_set_vat_deductible(p_deductible boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if dk_current_kitchen_id() is null then raise exception 'No hay una cuenta activa'; end if;
  if not dk_can('finance.manage') then raise exception 'No autorizado para cambiar la configuración de finanzas'; end if;
  update dk_kitchens set purchase_vat_deductible = coalesce(p_deductible, false) where id = dk_current_kitchen_id();
end;
$$;

-- What Copilot can say about the money (finance.view): what is owed and when,
-- the cash flow and, with reports.profitability, the real profitability.
create or replace function dk_copilot_finance(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_today date := dk_local_date(now(), dk_account_tz());
  v_cost boolean := dk_can('reports.profitability');
  v_payables jsonb;
begin
  perform dk_require('finance.view');
  with b as (
    select o.kind, o.due_date, coalesce(s.name, u.full_name, o.payee_name) as payee, o.description,
           o.amount - coalesce((select sum(amount) from dk_obligation_payments where obligation_id = o.id), 0) as balance
    from dk_obligations o
    left join dk_suppliers s on s.id = o.supplier_id
    left join dk_users u on u.id = o.member_user_id
    where o.kitchen_id = v_kitchen and o.voided_at is null
      and (o.kind <> 'payroll' or dk_can('finance.payroll'))
  )
  select jsonb_build_object(
    'total', coalesce(sum(balance) filter (where balance > 0), 0),
    'overdue', coalesce(sum(balance) filter (where balance > 0 and due_date < v_today), 0),
    'next7Days', coalesce(sum(balance) filter (where balance > 0 and due_date between v_today and v_today + 7), 0),
    'items', coalesce((select jsonb_agg(jsonb_build_object('payee', payee, 'description', description, 'kind', kind, 'dueDate', due_date, 'balance', balance) order by due_date)
                       from (select * from b where balance > 0 order by due_date limit 15) x), '[]'))
  into v_payables
  from b;

  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'payables', v_payables,
    'cashflow', dk_finance_cashflow(p_from, p_to) - 'days',
    'profitability', case when v_cost then dk_finance_pnl(p_from, p_to) end,
    'costVisible', v_cost);
end;
$$;

revoke all on function dk_finance_set_vat_deductible(boolean), dk_copilot_finance(date, date) from public, anon;
grant execute on function dk_finance_set_vat_deductible(boolean), dk_copilot_finance(date, date) to authenticated;
