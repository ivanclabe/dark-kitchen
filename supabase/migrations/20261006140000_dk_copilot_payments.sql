-- ADR 0033, phase 2: Copilot answers about what was collected.
--
-- dk_copilot_payments reads the payments ledger (dk_order_payments, the one
-- source of truth since ADR 0031): collected in the period (voids subtract),
-- by method and by day, and what is still to collect from open orders.
-- SECURITY INVOKER with receivables.view: the caller's RLS applies.
create or replace function dk_copilot_payments(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  tz text := dk_account_tz();
begin
  perform dk_require('receivables.view');
  perform dk_copilot_range(p_from, p_to);
  return jsonb_build_object(
    'from', p_from, 'to', p_to,
    'collected', (select coalesce(sum(amount), 0) from dk_order_payments where (created_at at time zone tz)::date between p_from and p_to),
    'payments', (select count(*) from dk_order_payments where amount > 0 and (created_at at time zone tz)::date between p_from and p_to),
    'voided', (select jsonb_build_object('count', count(*), 'total', coalesce(-sum(amount), 0)) from dk_order_payments
               where amount < 0 and (created_at at time zone tz)::date between p_from and p_to),
    'byMethod', (select coalesce(jsonb_agg(x order by total desc), '[]') from (
      select jsonb_build_object('method', coalesce(nullif(method, ''), 'sin método'), 'total', sum(amount)) x, sum(amount) total
      from dk_order_payments where (created_at at time zone tz)::date between p_from and p_to
      group by coalesce(nullif(method, ''), 'sin método')) t),
    'byDay', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'total', s) order by d), '[]') from (
      select (created_at at time zone tz)::date d, sum(amount) s from dk_order_payments
      where (created_at at time zone tz)::date between p_from and p_to group by 1) t),
    'toCollect', (select jsonb_build_object('orders', count(*), 'total', coalesce(sum(o.total - coalesce(p.paid, 0)), 0))
                  from dk_orders o left join (select order_id, sum(amount) paid from dk_order_payments group by order_id) p on p.order_id = o.id
                  where o.status <> 'CANCELADO' and o.total - coalesce(p.paid, 0) > 0),
    'note', 'collected = pagos menos anulaciones del periodo; toCollect = saldo de todos los pedidos no cancelados, hoy.');
end;
$$;

revoke execute on function dk_copilot_payments(date, date) from public, anon;
grant execute on function dk_copilot_payments(date, date) to authenticated;
