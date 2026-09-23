-- Dark Kitchen — Cartera: cuentas por cobrar (pagos y saldos de pedidos).
--
-- Reutiliza dk_orders/dk_customers tal cual existen hoy. Agrega:
--   1. dk_orders.due_date — vencimiento opcional del pago de un pedido.
--   2. dk_order_payments — ledger append-only de pagos contra un pedido,
--      mismo patron que dk_inventory_movements (ver ADR 0001): nunca se
--      actualiza ni se borra una fila, una correccion se hace con un pago
--      en negativo.
--   3. dk_register_payment — RPC transaccional (ver ADR 0004) que valida
--      rol, estado del pedido y que el pago no exceda el saldo pendiente.
--   4. dk_receivables — vista de solo lectura con el saldo pendiente por
--      pedido, para alimentar la pantalla de Cartera.
--
-- payment_method (columna existente de dk_orders, hasta ahora sin usar en
-- la UI) queda intacta; dk_order_payments.method es independiente porque un
-- mismo pedido puede recibir varios pagos con metodos distintos (abono en
-- efectivo + resto por transferencia).

alter table dk_orders add column due_date date;
comment on column dk_orders.due_date is 'Fecha de vencimiento del pago, opcional. NULL = sin plazo definido.';

create table dk_order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references dk_orders(id),
  amount numeric not null check (amount <> 0),
  method text,
  note text,
  created_by uuid references dk_users(id),
  created_at timestamptz not null default now()
);

comment on table dk_order_payments is 'Ledger append-only de pagos. Sin policies de UPDATE/DELETE: una correccion se registra con un pago en negativo, nunca editando una fila existente.';
comment on column dk_order_payments.amount is 'Positivo = pago recibido. Negativo = reversion/correccion de un pago anterior.';

create index dk_order_payments_order_created_idx on dk_order_payments (order_id, created_at);

alter table dk_order_payments enable row level security;

create policy dk_order_payments_select on dk_order_payments for select to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','CASHIER'));
-- Sin insert/update/delete directo: solo via dk_register_payment (SECURITY DEFINER).

-- ---------------------------------------------------------------------------
-- dk_register_payment: registra un abono/pago contra un pedido. No permite
-- superar el saldo pendiente ni pagar un pedido CANCELADO.
-- ---------------------------------------------------------------------------

create or replace function dk_register_payment(p_order_id uuid, p_amount numeric, p_method text default null, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order dk_orders%rowtype;
  v_paid numeric;
  v_balance numeric;
  v_payment_id uuid;
begin
  if dk_current_role() not in ('ADMIN','MANAGER','CASHIER') then
    raise exception 'No autorizado para registrar pagos';
  end if;

  if p_amount <= 0 then
    raise exception 'El monto del pago debe ser mayor a cero';
  end if;

  select * into v_order from dk_orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido % no existe', p_order_id;
  end if;
  if v_order.status = 'CANCELADO' then
    raise exception 'No se puede registrar un pago sobre un pedido cancelado';
  end if;

  select coalesce(sum(amount), 0) into v_paid from dk_order_payments where order_id = p_order_id;
  v_balance := v_order.total - v_paid;

  if p_amount > v_balance then
    raise exception 'El pago (%) supera el saldo pendiente (%)', p_amount, v_balance;
  end if;

  insert into dk_order_payments (order_id, amount, method, note, created_by)
  values (p_order_id, p_amount, p_method, p_note, dk_current_profile_id())
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;

revoke execute on function dk_register_payment(uuid, numeric, text, text) from public, anon;
grant execute on function dk_register_payment(uuid, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- dk_receivables: saldo pendiente por pedido (total - pagos), para la
-- pantalla de Cartera. Solo pedidos no cancelados con saldo distinto de
-- cero. El filtro de rol es defensa en profundidad ademas de la RLS de las
-- tablas base (mismo espiritu que dk_today_menu).
-- ---------------------------------------------------------------------------

create view dk_receivables as
  select
    o.id as order_id,
    o.order_number,
    o.customer_id,
    c.full_name as customer_name,
    c.phone as customer_phone,
    o.status,
    o.total,
    coalesce(p.paid, 0) as paid_amount,
    o.total - coalesce(p.paid, 0) as balance,
    o.due_date,
    o.created_at
  from dk_orders o
  join dk_customers c on c.id = o.customer_id
  left join (
    select order_id, sum(amount) as paid
    from dk_order_payments
    group by order_id
  ) p on p.order_id = o.id
  where o.status <> 'CANCELADO'
    and o.total - coalesce(p.paid, 0) <> 0
    and dk_current_role() in ('ADMIN','MANAGER','CASHIER');

grant select on dk_receivables to authenticated;
