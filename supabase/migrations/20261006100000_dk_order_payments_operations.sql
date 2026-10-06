-- ADR 0031: the payment inside the order (Centro de operaciones).
--
-- dk_order_payments stays the ONE source of truth of what was paid (an
-- insert-only ledger: paid = sum(amount), balance = total - paid). Nothing
-- here stores a payment status: it is derived.
--
-- 1. Void a payment (D5). A payment registered by mistake is cancelled by a
--    NEGATIVE entry linked to it (voids_payment_id), with the reason in its
--    note — exactly what the table's design foresaw. Nothing is updated or
--    deleted; a payment can be voided once; a void cannot be voided.
-- 2. Audit (D6). The standard dk_audit_row trigger on the ledger, and its
--    events classified (payment.registered / payment.voided) so they read
--    well in Configuración → Actividad.
-- 3. Operación → Lista filters by payment (all / paid / pending). Only for
--    whoever sees the receivables; for anyone else the filter is ignored
--    (their RLS hides the payments, so "pending" would be a lie).

-- ---------------------------------------------------------------------------
-- 1. Void
-- ---------------------------------------------------------------------------
alter table dk_order_payments add column voids_payment_id uuid references dk_order_payments (id);

comment on column dk_order_payments.voids_payment_id is
  'ADR 0031: this (negative) entry voids that payment. A payment is voided at most once; a void is never voided.';

create unique index dk_order_payments_voids_uidx on dk_order_payments (voids_payment_id) where voids_payment_id is not null;

-- A payment is positive; only a void is negative (and always points to what it voids).
alter table dk_order_payments
  add constraint dk_order_payments_void_sign_check check ((voids_payment_id is null) = (amount > 0));

create or replace function dk_void_payment(p_payment_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment dk_order_payments%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_id uuid;
begin
  perform dk_assert_in_active_kitchen('dk_order_payments', p_payment_id);
  if not dk_can('receivables.collect') then
    raise exception 'No autorizado para anular pagos';
  end if;
  if v_reason is null then
    raise exception 'Escribe el motivo de la anulación';
  end if;

  select * into v_payment from dk_order_payments where id = p_payment_id;
  if not found then
    raise exception 'El pago no existe';
  end if;
  if v_payment.voids_payment_id is not null then
    raise exception 'Una anulación no se puede anular';
  end if;

  -- The same lock as dk_register_payment: payments of one order, one at a time.
  perform 1 from dk_orders where id = v_payment.order_id for update;
  if exists (select 1 from dk_order_payments where voids_payment_id = p_payment_id) then
    raise exception 'Este pago ya fue anulado';
  end if;

  insert into dk_order_payments (order_id, amount, method, note, created_by, voids_payment_id)
  values (v_payment.order_id, -v_payment.amount, v_payment.method, v_reason, dk_current_profile_id(), p_payment_id)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function dk_void_payment(uuid, text) from public, anon;
grant execute on function dk_void_payment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Audit
-- ---------------------------------------------------------------------------
create trigger dk_trg_audit_order_payments
  after insert or update or delete on dk_order_payments
  for each row execute function dk_audit_row();

-- Runs after dk_trg_audit_log_classify and _classify_ai (triggers fire in name
-- order) and only names the payment events; anything else is left untouched. Never raises.
create or replace function dk_audit_classify_payments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := coalesce(new.context -> 'ref', '{}') || coalesce(new.old_data, '{}') || coalesce(new.new_data, '{}');
  v_amount numeric;
  v_order integer;
  v_money text;
begin
  if new.table_name = 'dk_order_payments' and new.action = 'INSERT' then
    v_amount := abs((v_row ->> 'amount')::numeric);
    select order_number into v_order from dk_orders where id = (v_row ->> 'order_id')::uuid;
    v_money := '$' || replace(to_char(v_amount, 'FM999,999,999,990'), ',', '.');
    new.category := 'operations';
    if v_row ->> 'voids_payment_id' is not null then
      new.event_type := 'payment.voided';
      new.summary := format('Anuló un pago de %s del pedido #%s: %s', v_money, coalesce(v_order::text, '—'), coalesce(v_row ->> 'note', 'sin motivo'));
    else
      new.event_type := 'payment.registered';
      new.summary := format('Registró un pago de %s al pedido #%s%s', v_money, coalesce(v_order::text, '—'),
        case when nullif(v_row ->> 'method', '') is not null then format(' (%s)', v_row ->> 'method') else '' end);
    end if;
    new.context := new.context || jsonb_build_object('order_id', v_row ->> 'order_id', 'order_number', v_order, 'amount', (v_row ->> 'amount')::numeric);
  end if;
  return new;
exception when others then
  return new;
end;
$$;

revoke execute on function dk_audit_classify_payments() from public, anon, authenticated;

create trigger dk_trg_audit_log_classify_payments before insert on dk_audit_log
  for each row execute function dk_audit_classify_payments();

-- ---------------------------------------------------------------------------
-- 3. Operación → Lista: filter by payment
-- ---------------------------------------------------------------------------
drop function dk_order_search(text, timestamptz, timestamptz, dk_order_status[], dk_order_channel, uuid, integer, integer);

-- ADR 0020 + ADR 0031. Same search as before, plus p_payment ('paid' or
-- 'pending'; cancelled orders are neither). SECURITY INVOKER: the caller's RLS
-- applies. Returns ids only; the app reads the orders with its common query.
create or replace function dk_order_search(
  p_search text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_statuses dk_order_status[] default null,
  p_channel dk_order_channel default null,
  p_customer_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_payment text default null
)
returns setof uuid
language sql
stable
security invoker
set search_path = public
as $$
  with term as (select nullif(btrim(coalesce(p_search, '')), '') as t),
       pay as (select case when p_payment in ('paid', 'pending') and dk_can('receivables.view') then p_payment end as filter)
  select o.id
  from dk_orders o, term, pay
  where o.kitchen_id = dk_current_kitchen_id()
    and (p_from is null or o.created_at >= p_from)
    and (p_to is null or o.created_at < p_to)
    and (p_statuses is null or o.status = any (p_statuses))
    and (p_channel is null or o.channel = p_channel)
    and (p_customer_id is null or o.customer_id = p_customer_id)
    and (
      term.t is null
      or (term.t ~ '^#?[0-9]{1,9}$' and o.order_number = ltrim(term.t, '#')::integer)
      or exists (select 1 from dk_customers c where c.id = o.customer_id
                 and (c.full_name ilike '%' || term.t || '%' or c.phone ilike '%' || term.t || '%'))
      or exists (select 1 from dk_order_items i join dk_products p on p.id = i.product_id
                 where i.order_id = o.id and p.name ilike '%' || term.t || '%')
    )
    and (
      pay.filter is null
      or (o.status <> 'CANCELADO'
          and ((select coalesce(sum(op.amount), 0) from dk_order_payments op where op.order_id = o.id) >= o.total) = (pay.filter = 'paid'))
    )
  order by o.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 201)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function dk_order_search(text, timestamptz, timestamptz, dk_order_status[], dk_order_channel, uuid, integer, integer, text) from public, anon;
grant execute on function dk_order_search(text, timestamptz, timestamptz, dk_order_status[], dk_order_channel, uuid, integer, integer, text) to authenticated;
