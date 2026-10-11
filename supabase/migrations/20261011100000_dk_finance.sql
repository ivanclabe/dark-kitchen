-- ADR 0051 — Obligaciones, pagos y rentabilidad real.
--
-- Nada cuenta dos veces:
--   * COMPRA (ya existe): entra inventario. No es gasto: el insumo cuesta cuando
--     se consume en un plato vendido (o se pierde: merma, ajuste).
--   * OBLIGACIÓN (nueva): lo que el negocio debe. Una compra confirmada crea UNA
--     (única por compra); los gastos y la nómina son obligaciones que además
--     cuentan en la rentabilidad, en su fecha o periodo.
--   * PAGO (nuevo): plata que sale para saldar una obligación. Libro de solo
--     inserción, con anulaciones. Nunca es gasto ni mueve inventario.
--
--   1. Permisos                       7. Pagos (registrar, anular)
--   2. Columnas nuevas                8. Compras: confirmar con forma de pago
--   3. Categorías de gasto            9. Gastos fijos, nómina, compras anteriores
--   4. Obligaciones y pagos          10. Ventas = pedidos confirmados (Insights)
--   5. Estado de cada obligación     11. Ajustes con costo
--   6. Gastos (crear, anular)        12. Rentabilidad, flujo de caja, por pagar

-- ---------------------------------------------------------------------------
-- 1. Permisos (D12). ADMIN los recibe solo (trigger del catálogo).
-- ---------------------------------------------------------------------------
insert into dk_permissions (key, module, action, scope, label, description, sort_order) values
  ('finance.view', 'finance', 'view', 'account', 'Ver finanzas', 'Ver lo que se debe, los pagos, el flujo de caja y la rentabilidad de la cuenta', 190),
  ('finance.manage', 'finance', 'manage', 'account', 'Registrar gastos', 'Registrar gastos y gastos fijos, plazos de pago y anular obligaciones', 191),
  ('finance.pay', 'finance', 'pay', 'account', 'Registrar pagos', 'Registrar y anular pagos de lo que se debe', 192),
  ('finance.payroll', 'finance', 'payroll', 'account', 'Nómina', 'Ver y cambiar cuánto se le paga a cada persona y liquidar la nómina', 193)
on conflict (key) do nothing;

insert into dk_role_permissions (role_id, permission_key)
select r.id, p.key
from dk_roles r cross join (values ('finance.view'), ('finance.manage'), ('finance.pay')) p(key)
where r.is_system and r.key = 'MANAGER'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Columnas nuevas
-- ---------------------------------------------------------------------------
alter table dk_suppliers add column payment_terms_days integer not null default 0
  check (payment_terms_days between 0 and 365);
comment on column dk_suppliers.payment_terms_days is 'ADR 0051: días de plazo para pagarle (0 = de contado).';

alter table dk_kitchens add column purchase_vat_deductible boolean not null default false;
comment on column dk_kitchens.purchase_vat_deductible is
  'ADR 0051 (D9): si la cuenta descuenta el IVA de sus compras. false: el IVA de las compras es un costo en la rentabilidad.';

-- ---------------------------------------------------------------------------
-- 3. Categorías de gasto (por cuenta, con unas de base)
-- ---------------------------------------------------------------------------
create table dk_expense_categories (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default dk_current_kitchen_id() references dk_kitchens (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  unique (kitchen_id, name),
  unique (kitchen_id, id)
);

create or replace function dk_seed_expense_categories(p_kitchen uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into dk_expense_categories (kitchen_id, name, sort_order)
  select p_kitchen, c.name, c.sort_order
  from (values
    ('Arriendo', 10), ('Servicios públicos', 20), ('Gas', 30), ('Internet y telefonía', 40),
    ('Empaques y desechables', 50), ('Domicilios y transporte', 60), ('Comisiones de plataformas', 70),
    ('Publicidad', 80), ('Mantenimiento y aseo', 90), ('Impuestos y trámites', 100), ('Otros gastos', 110)
  ) c(name, sort_order)
  on conflict (kitchen_id, name) do nothing;
$$;
revoke all on function dk_seed_expense_categories(uuid) from public, anon, authenticated;

select dk_seed_expense_categories(id) from dk_kitchens;

create or replace function dk_kitchen_seed_finance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform dk_seed_expense_categories(new.id);
  return new;
end;
$$;
create trigger dk_trg_kitchens_seed_finance after insert on dk_kitchens
  for each row execute function dk_kitchen_seed_finance();

alter table dk_expense_categories enable row level security;
create policy dk_expense_categories_select on dk_expense_categories for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('finance.view')));
create policy dk_expense_categories_insert on dk_expense_categories for insert to authenticated
  with check (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('finance.manage')));
create policy dk_expense_categories_update on dk_expense_categories for update to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('finance.manage')))
  with check (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('finance.manage')));
grant select, insert, update on dk_expense_categories to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Obligaciones y pagos
-- ---------------------------------------------------------------------------
create table dk_recurring_obligations (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default dk_current_kitchen_id() references dk_kitchens (id) on delete cascade,
  category_id uuid not null,
  supplier_id uuid,
  payee_name text check (payee_name is null or char_length(payee_name) <= 120),
  description text not null check (char_length(btrim(description)) between 2 and 160),
  amount numeric not null check (amount > 0),
  day_of_month integer not null check (day_of_month between 1 and 28),
  starts_on date not null,
  active boolean not null default true,
  created_by uuid references dk_users (id) default dk_current_profile_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kitchen_id, id),
  foreign key (kitchen_id, category_id) references dk_expense_categories (kitchen_id, id),
  foreign key (kitchen_id, supplier_id) references dk_suppliers (kitchen_id, id)
);
comment on table dk_recurring_obligations is 'ADR 0051 (D7): gastos que se repiten cada mes (crean una obligación por mes, una sola vez).';

create table dk_obligations (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default dk_current_kitchen_id() references dk_kitchens (id) on delete cascade,
  kind text not null check (kind in ('purchase', 'expense', 'payroll')),
  category_id uuid,
  purchase_id uuid,
  supplier_id uuid,
  member_user_id uuid references dk_users (id),
  payee_name text check (payee_name is null or char_length(payee_name) <= 120),
  description text not null check (char_length(btrim(description)) between 2 and 160),
  amount numeric not null check (amount > 0),
  -- La fecha (o el periodo) del gasto: con ella cuenta en la rentabilidad.
  accrual_date date not null,
  period_start date,
  period_end date,
  due_date date not null,
  recurring_id uuid,
  recurring_period date,
  notes text check (notes is null or char_length(notes) <= 500),
  voided_at timestamptz,
  void_reason text,
  voided_by uuid references dk_users (id),
  created_by uuid references dk_users (id) default dk_current_profile_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kitchen_id, id),
  foreign key (kitchen_id, category_id) references dk_expense_categories (kitchen_id, id),
  foreign key (kitchen_id, purchase_id) references dk_purchases (kitchen_id, id),
  foreign key (kitchen_id, supplier_id) references dk_suppliers (kitchen_id, id),
  foreign key (kitchen_id, recurring_id) references dk_recurring_obligations (kitchen_id, id),
  check ((period_start is null) = (period_end is null) and (period_end is null or period_end >= period_start)),
  check (kind <> 'purchase' or purchase_id is not null),
  check (kind <> 'expense' or category_id is not null),
  check (kind <> 'payroll' or (member_user_id is not null and period_start is not null)),
  check ((voided_at is null) = (void_reason is null))
);
comment on table dk_obligations is
  'ADR 0051: lo que el negocio debe. purchase (una por compra confirmada, no es gasto), expense y payroll (cuentan en la rentabilidad por su fecha o periodo).';

-- Una compra, una obligación. Un mes de un gasto fijo, una obligación. Una persona y un periodo, una nómina.
create unique index dk_obligations_purchase_key on dk_obligations (purchase_id) where purchase_id is not null;
create unique index dk_obligations_recurring_key on dk_obligations (recurring_id, recurring_period) where recurring_id is not null;
create unique index dk_obligations_payroll_key on dk_obligations (kitchen_id, member_user_id, period_start, period_end)
  where kind = 'payroll' and voided_at is null;
create index dk_obligations_kitchen_due_idx on dk_obligations (kitchen_id, due_date) where voided_at is null;
create index dk_obligations_kitchen_accrual_idx on dk_obligations (kitchen_id, accrual_date);

create table dk_obligation_payments (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default dk_current_kitchen_id() references dk_kitchens (id) on delete cascade,
  obligation_id uuid not null,
  amount numeric not null check (amount <> 0),
  paid_on date not null,
  method text not null check (method in ('Efectivo', 'Transferencia', 'Tarjeta', 'Otro')),
  reference text check (reference is null or char_length(reference) <= 80),
  note text check (note is null or char_length(note) <= 300),
  voids_payment_id uuid unique references dk_obligation_payments (id),
  created_by uuid references dk_users (id) default dk_current_profile_id(),
  created_at timestamptz not null default now(),
  foreign key (kitchen_id, obligation_id) references dk_obligations (kitchen_id, id),
  -- Un pago es positivo; su anulación, negativa y apunta al pago.
  check ((voids_payment_id is null) = (amount > 0))
);
comment on table dk_obligation_payments is 'ADR 0051: pagos de obligaciones. Solo inserción; un error se corrige anulando (fila negativa).';
create index dk_obligation_payments_obligation_idx on dk_obligation_payments (obligation_id);
create index dk_obligation_payments_kitchen_paid_idx on dk_obligation_payments (kitchen_id, paid_on);

create table dk_member_pay (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default dk_current_kitchen_id() references dk_kitchens (id) on delete cascade,
  user_id uuid not null references dk_users (id),
  pay_type text not null check (pay_type in ('hourly', 'monthly')),
  rate numeric not null check (rate > 0),
  effective_from date not null,
  created_by uuid references dk_users (id) default dk_current_profile_id(),
  created_at timestamptz not null default now(),
  unique (kitchen_id, user_id, effective_from)
);
comment on table dk_member_pay is 'ADR 0051 (D6): cómo se le paga a cada persona en la cuenta (por hora o mensual), desde una fecha. Dato reservado: finance.payroll.';

create trigger dk_trg_obligations_updated_at before update on dk_obligations for each row execute function dk_set_updated_at();
create trigger dk_trg_recurring_obligations_updated_at before update on dk_recurring_obligations for each row execute function dk_set_updated_at();

alter table dk_obligations enable row level security;
alter table dk_obligation_payments enable row level security;
alter table dk_recurring_obligations enable row level security;
alter table dk_member_pay enable row level security;

-- La nómina (de cada persona) solo con finance.payroll.
create policy dk_obligations_select on dk_obligations for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('finance.view'))
         and (kind <> 'payroll' or (select dk_can('finance.payroll'))));
create policy dk_obligation_payments_select on dk_obligation_payments for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('finance.view'))
         and exists (select 1 from dk_obligations o where o.id = obligation_id));
create policy dk_recurring_obligations_select on dk_recurring_obligations for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('finance.view')));
create policy dk_member_pay_select on dk_member_pay for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('finance.payroll')));
create policy dk_member_pay_insert on dk_member_pay for insert to authenticated
  with check (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('finance.payroll'))
              and exists (select 1 from dk_kitchen_members m where m.kitchen_id = dk_member_pay.kitchen_id and m.user_id = dk_member_pay.user_id));
create policy dk_member_pay_delete on dk_member_pay for delete to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('finance.payroll')));
-- Sin escritura directa en obligaciones ni pagos: solo las funciones de abajo.
grant select on dk_obligations, dk_obligation_payments, dk_recurring_obligations to authenticated;
grant select, insert, delete on dk_member_pay to authenticated;

create trigger dk_trg_audit_obligations after insert or update or delete on dk_obligations for each row execute function dk_audit_row();
create trigger dk_trg_audit_obligation_payments after insert or update or delete on dk_obligation_payments for each row execute function dk_audit_row();
create trigger dk_trg_audit_recurring_obligations after insert or update or delete on dk_recurring_obligations for each row execute function dk_audit_row();
create trigger dk_trg_audit_member_pay after insert or update or delete on dk_member_pay for each row execute function dk_audit_row();

-- ---------------------------------------------------------------------------
-- 5. Estado de cada obligación (lo pagado, el saldo y si venció)
-- ---------------------------------------------------------------------------
create view dk_obligation_balances with (security_invoker = true) as
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
       end as status
from dk_obligations o
left join dk_expense_categories c on c.id = o.category_id
left join dk_purchases p on p.id = o.purchase_id
left join dk_suppliers s on s.id = o.supplier_id
left join dk_users u on u.id = o.member_user_id
left join lateral (select sum(amount) as paid from dk_obligation_payments where obligation_id = o.id) pay on true;
grant select on dk_obligation_balances to authenticated;

-- Saldo de una obligación (para las funciones).
create or replace function dk_obligation_balance(p_obligation uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select o.amount - coalesce((select sum(amount) from dk_obligation_payments where obligation_id = o.id), 0)
  from dk_obligations o where o.id = p_obligation
$$;
revoke all on function dk_obligation_balance(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Gastos
-- ---------------------------------------------------------------------------
-- p: { categoryId, supplierId?, payeeName?, description, amount, accrualDate, periodStart?, periodEnd?, dueDate, notes?,
--      payNow?: { method, paidOn?, reference? } }
create or replace function dk_finance_create_expense(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_id uuid;
  v_amount numeric := nullif(p ->> 'amount', '')::numeric;
  v_accrual date := nullif(p ->> 'accrualDate', '')::date;
begin
  if v_kitchen is null then raise exception 'No hay una cuenta activa'; end if;
  if not dk_can('finance.manage') then raise exception 'No autorizado para registrar gastos'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'El valor debe ser mayor que 0'; end if;
  if v_accrual is null then raise exception 'Falta la fecha del gasto'; end if;
  if not exists (select 1 from dk_expense_categories where id = (p ->> 'categoryId')::uuid and kitchen_id = v_kitchen) then
    raise exception 'Categoría no encontrada';
  end if;

  insert into dk_obligations (kitchen_id, kind, category_id, supplier_id, payee_name, description, amount, accrual_date,
                              period_start, period_end, due_date, notes)
  values (v_kitchen, 'expense', (p ->> 'categoryId')::uuid, nullif(p ->> 'supplierId', '')::uuid, nullif(btrim(p ->> 'payeeName'), ''),
          btrim(p ->> 'description'), v_amount, v_accrual,
          nullif(p ->> 'periodStart', '')::date, nullif(p ->> 'periodEnd', '')::date,
          coalesce(nullif(p ->> 'dueDate', '')::date, v_accrual), nullif(btrim(p ->> 'notes'), ''))
  returning id into v_id;

  if p ? 'payNow' and jsonb_typeof(p -> 'payNow') = 'object' then
    perform dk_finance_pay(v_id, v_amount, coalesce(nullif(p #>> '{payNow,paidOn}', '')::date, v_accrual),
                           p #>> '{payNow,method}', p #>> '{payNow,reference}', null);
  end if;
  return v_id;
exception when foreign_key_violation then
  raise exception 'El proveedor no es de esta cuenta';
end;
$$;

create or replace function dk_finance_void_obligation(p_obligation uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row dk_obligations;
begin
  perform dk_assert_in_active_kitchen('dk_obligations', p_obligation);
  if not dk_can('finance.manage') then raise exception 'No autorizado para anular obligaciones'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'Escribe el motivo de la anulación'; end if;
  select * into v_row from dk_obligations where id = p_obligation for update;
  if v_row.kind = 'purchase' then raise exception 'La deuda de una compra no se anula: viene de la compra confirmada'; end if;
  if v_row.kind = 'payroll' and not dk_can('finance.payroll') then raise exception 'No autorizado para la nómina'; end if;
  if v_row.voided_at is not null then raise exception 'Ya está anulada'; end if;
  if coalesce((select sum(amount) from dk_obligation_payments where obligation_id = p_obligation), 0) > 0 then
    raise exception 'Tiene pagos registrados: anúlalos primero';
  end if;
  update dk_obligations set voided_at = now(), void_reason = btrim(p_reason), voided_by = dk_current_profile_id() where id = p_obligation;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Pagos
-- ---------------------------------------------------------------------------
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

create or replace function dk_finance_void_payment(p_payment uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay dk_obligation_payments;
  v_kind text;
  v_id uuid;
begin
  perform dk_assert_in_active_kitchen('dk_obligation_payments', p_payment);
  if not dk_can('finance.pay') then raise exception 'No autorizado para anular pagos'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'Escribe el motivo de la anulación'; end if;
  select * into v_pay from dk_obligation_payments where id = p_payment for update;
  if v_pay.amount < 0 then raise exception 'Una anulación no se anula'; end if;
  if exists (select 1 from dk_obligation_payments where voids_payment_id = p_payment) then raise exception 'Este pago ya está anulado'; end if;
  select kind into v_kind from dk_obligations where id = v_pay.obligation_id;
  if v_kind = 'payroll' and not dk_can('finance.payroll') then raise exception 'No autorizado para la nómina'; end if;
  insert into dk_obligation_payments (kitchen_id, obligation_id, amount, paid_on, method, note, voids_payment_id)
  values (v_pay.kitchen_id, v_pay.obligation_id, -v_pay.amount, dk_local_date(now(), dk_account_tz()), v_pay.method,
          'Anulado: ' || btrim(p_reason), p_payment)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Compras: una obligación por compra confirmada, y la forma de pago (D1, D3)
-- ---------------------------------------------------------------------------
create or replace function dk_purchase_create_obligation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_terms integer;
begin
  if new.status = 'CONFIRMADA' and old.status is distinct from 'CONFIRMADA' and new.total > 0 then
    select payment_terms_days into v_terms from dk_suppliers where id = new.supplier_id;
    insert into dk_obligations (kitchen_id, kind, purchase_id, supplier_id, description, amount, accrual_date, due_date, created_by)
    values (new.kitchen_id, 'purchase', new.id, new.supplier_id, left('Factura ' || new.invoice_number, 160), new.total,
            new.invoice_date, new.invoice_date + coalesce(v_terms, 0), dk_current_profile_id())
    on conflict (purchase_id) where purchase_id is not null do nothing;
  end if;
  return new;
end;
$$;
create trigger dk_trg_purchases_obligation after update of status on dk_purchases
  for each row execute function dk_purchase_create_obligation();

-- dk_confirm_purchase gains an optional way of payment; calls with one argument still work.
--   p_payment: { mode: 'cash', method, paidOn?, reference? } | { mode: 'credit', dueDate? }
drop function dk_confirm_purchase(uuid);
create function dk_confirm_purchase(p_purchase_id uuid, p_payment jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status dk_purchase_status;
  v_item record;
  v_conversion numeric;
  v_qty_base numeric;
  v_cost_per_base numeric;
  v_current_stock numeric;
  v_current_avg_cost numeric;
  v_new_avg_cost numeric;
  v_subtotal numeric := 0;
  v_obligation uuid;
  v_total numeric;
  v_invoice_date date;
begin
  perform dk_assert_in_active_kitchen('dk_purchases', p_purchase_id);
  if not dk_can('purchasing.confirm') then
    raise exception 'No autorizado para confirmar compras';
  end if;

  select status into v_status from dk_purchases where id = p_purchase_id for update;
  if v_status is null then
    raise exception 'Compra % no existe', p_purchase_id;
  end if;
  if v_status <> 'BORRADOR' then
    raise exception 'Solo se pueden confirmar compras en estado BORRADOR (actual: %)', v_status;
  end if;
  if not exists (select 1 from dk_purchase_items where purchase_id = p_purchase_id) then
    raise exception 'La compra no tiene líneas: agrega al menos un insumo antes de confirmarla';
  end if;
  if p_payment is not null and coalesce(p_payment ->> 'mode', '') not in ('cash', 'credit') then
    raise exception 'Forma de pago no válida';
  end if;

  for v_item in
    select pi.*, i.base_unit_id
    from dk_purchase_items pi
    join dk_ingredients i on i.id = pi.ingredient_id
    where pi.purchase_id = p_purchase_id
    order by pi.ingredient_id, pi.id
  loop
    if v_item.purchase_unit_id = v_item.base_unit_id then
      v_conversion := 1;
    else
      select factor_to_base into v_conversion
      from dk_ingredient_purchase_units
      where ingredient_id = v_item.ingredient_id and unit_id = v_item.purchase_unit_id;

      if v_conversion is null then
        select pu.factor_to_base / bu.factor_to_base into v_conversion
        from dk_units pu, dk_units bu
        where pu.id = v_item.purchase_unit_id
          and bu.id = v_item.base_unit_id
          and pu.unit_type = bu.unit_type;
      end if;

      if v_conversion is null then
        raise exception 'No hay conversion definida entre la unidad de compra y la unidad base del insumo % (linea %)', v_item.ingredient_id, v_item.id;
      end if;
    end if;

    v_qty_base := v_item.quantity * v_conversion;
    v_cost_per_base := v_item.unit_cost / v_conversion;

    select avg_cost into v_current_avg_cost from dk_ingredients where id = v_item.ingredient_id for update;

    insert into dk_inventory_movements (
      ingredient_id, movement_type, quantity_base_unit, unit_cost,
      reference_type, reference_id, created_by
    ) values (
      v_item.ingredient_id, 'COMPRA', v_qty_base, v_cost_per_base,
      'purchase_item', v_item.id, dk_current_profile_id()
    );

    select coalesce(stock_on_hand, 0) into v_current_stock
    from dk_ingredient_stock where ingredient_id = v_item.ingredient_id;
    v_current_stock := coalesce(v_current_stock, 0) - v_qty_base;

    if v_current_stock <= 0 then
      v_new_avg_cost := v_cost_per_base;
    else
      v_new_avg_cost := (v_current_stock * coalesce(v_current_avg_cost, 0) + v_qty_base * v_cost_per_base)
                         / (v_current_stock + v_qty_base);
    end if;

    update dk_ingredients set avg_cost = v_new_avg_cost where id = v_item.ingredient_id;

    v_subtotal := v_subtotal + v_item.line_total;
  end loop;

  -- The status change creates the supplier obligation (trigger), once.
  update dk_purchases
  set status = 'CONFIRMADA', subtotal = v_subtotal, total = v_subtotal + tax
  where id = p_purchase_id
  returning total, invoice_date into v_total, v_invoice_date;

  -- ADR 0051 (D3): how it was paid.
  if p_payment is not null then
    select id into v_obligation from dk_obligations where purchase_id = p_purchase_id;
    if v_obligation is not null and p_payment ->> 'mode' = 'cash' then
      perform set_config('dk.purchase_paid_now', 'on', true);
      perform dk_finance_pay(v_obligation, v_total, coalesce(nullif(p_payment ->> 'paidOn', '')::date, v_invoice_date),
                             coalesce(nullif(p_payment ->> 'method', ''), 'Efectivo'), p_payment ->> 'reference', 'Pagada de contado al confirmar la compra');
      perform set_config('dk.purchase_paid_now', 'off', true);
    elsif v_obligation is not null and nullif(p_payment ->> 'dueDate', '') is not null then
      update dk_obligations set due_date = (p_payment ->> 'dueDate')::date where id = v_obligation;
    end if;
  end if;
end;
$$;
revoke all on function dk_confirm_purchase(uuid, jsonb) from public, anon;
grant execute on function dk_confirm_purchase(uuid, jsonb) to authenticated;

-- «Guardar y confirmar» of an imported invoice passes the way of payment (payload.payment).
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('dk_create_purchase_from_import(uuid, jsonb, boolean)'::regprocedure);
  if position('perform dk_confirm_purchase(v_purchase);' in v_def) = 0 then
    raise exception 'dk_create_purchase_from_import: no encontré la confirmación a reemplazar';
  end if;
  execute replace(v_def, 'perform dk_confirm_purchase(v_purchase);', 'perform dk_confirm_purchase(v_purchase, p_payload -> ''payment'');');
end $$;

-- ---------------------------------------------------------------------------
-- 9. Gastos fijos, nómina y compras anteriores
-- ---------------------------------------------------------------------------
-- p: { id?, categoryId, supplierId?, payeeName?, description, amount, dayOfMonth, startsOn, active }
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
    insert into dk_recurring_obligations (kitchen_id, category_id, supplier_id, payee_name, description, amount, day_of_month, starts_on, active)
    values (v_kitchen, (p ->> 'categoryId')::uuid, nullif(p ->> 'supplierId', '')::uuid, nullif(btrim(p ->> 'payeeName'), ''),
            btrim(p ->> 'description'), (p ->> 'amount')::numeric, (p ->> 'dayOfMonth')::integer,
            coalesce(nullif(p ->> 'startsOn', '')::date, date_trunc('month', dk_local_date(now(), dk_account_tz()))::date),
            coalesce((p ->> 'active')::boolean, true))
    returning id into v_id;
  else
    update dk_recurring_obligations
    set category_id = (p ->> 'categoryId')::uuid, supplier_id = nullif(p ->> 'supplierId', '')::uuid, payee_name = nullif(btrim(p ->> 'payeeName'), ''),
        description = btrim(p ->> 'description'), amount = (p ->> 'amount')::numeric, day_of_month = (p ->> 'dayOfMonth')::integer,
        active = coalesce((p ->> 'active')::boolean, true)
    where id = v_id and kitchen_id = v_kitchen;
    if not found then raise exception 'Gasto fijo no encontrado'; end if;
  end if;
  perform dk_finance_generate_recurring();
  return v_id;
end;
$$;

-- Crea, una sola vez, la obligación de cada mes de cada gasto fijo activo (hasta el mes actual, máximo 12 atrás).
create or replace function dk_finance_generate_recurring()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_today date := dk_local_date(now(), dk_account_tz());
  v_count integer := 0;
  v_rows integer;
  r record;
  v_month date;
begin
  if v_kitchen is null or not dk_can('finance.view') then return 0; end if;
  for r in select * from dk_recurring_obligations where kitchen_id = v_kitchen and active loop
    v_month := greatest(date_trunc('month', r.starts_on)::date, (date_trunc('month', v_today) - interval '11 months')::date);
    while v_month <= date_trunc('month', v_today)::date loop
      insert into dk_obligations (kitchen_id, kind, category_id, supplier_id, payee_name, description, amount, accrual_date,
                                  period_start, period_end, due_date, recurring_id, recurring_period, created_by)
      values (v_kitchen, 'expense', r.category_id, r.supplier_id, r.payee_name, r.description, r.amount, v_month,
              v_month, (v_month + interval '1 month - 1 day')::date, v_month + (r.day_of_month - 1), r.id, v_month, r.created_by)
      on conflict (recurring_id, recurring_period) where recurring_id is not null do nothing;
      get diagnostics v_rows = row_count;
      v_count := v_count + v_rows;
      v_month := (v_month + interval '1 month')::date;
    end loop;
  end loop;
  return v_count;
end;
$$;

-- Compras confirmadas antes de Finanzas que todavía se deben (D4).
create or replace function dk_finance_add_previous_purchases(p_purchase_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_count integer;
begin
  if v_kitchen is null then raise exception 'No hay una cuenta activa'; end if;
  if not dk_can('finance.manage') then raise exception 'No autorizado'; end if;
  insert into dk_obligations (kitchen_id, kind, purchase_id, supplier_id, description, amount, accrual_date, due_date)
  select p.kitchen_id, 'purchase', p.id, p.supplier_id, left('Factura ' || p.invoice_number, 160), p.total, p.invoice_date,
         p.invoice_date + coalesce(s.payment_terms_days, 0)
  from dk_purchases p join dk_suppliers s on s.id = p.supplier_id
  where p.kitchen_id = v_kitchen and p.status = 'CONFIRMADA' and p.total > 0 and p.id = any(p_purchase_ids)
    and not exists (select 1 from dk_obligations o where o.purchase_id = p.id)
  on conflict (purchase_id) where purchase_id is not null do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Horas trabajadas de una persona en la cuenta, en un rango de días locales (entrada a salida, menos el descanso).
create or replace function dk_finance_worked_hours(p_kitchen uuid, p_user uuid, p_from date, p_to date, p_tz text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(round(sum(greatest(extract(epoch from (s.clock_out_at - s.clock_in_at)) / 3600.0 - s.break_minutes / 60.0, 0))::numeric, 2), 0)
  from dk_shifts s
  where s.kitchen_id = p_kitchen and s.user_id = p_user and s.status = 'scheduled'
    and s.clock_in_at is not null and s.clock_out_at is not null
    and s.clock_in_at >= dk_local_start(p_from, p_tz) and s.clock_in_at < dk_local_start(p_to + 1, p_tz)
$$;
revoke all on function dk_finance_worked_hours(uuid, uuid, date, date, text) from public, anon, authenticated;

-- Lo que propone la nómina de un periodo: por hora = horas trabajadas × tarifa; mensual = salario × días del periodo / días de cada mes.
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
        'liquidated', exists (select 1 from dk_obligations o where o.kitchen_id = v_kitchen and o.kind = 'payroll'
                              and o.member_user_id = u.id and o.voided_at is null and o.period_start <= p_to and o.period_end >= p_from)) as x
      from dk_kitchen_members m
      join dk_users u on u.id = m.user_id
      left join lateral (select pay_type, rate from dk_member_pay mp
                         where mp.kitchen_id = v_kitchen and mp.user_id = u.id and mp.effective_from <= p_to
                         order by mp.effective_from desc limit 1) pay on true
      where m.kitchen_id = v_kitchen and m.active
        and (pay.pay_type is not null or dk_finance_worked_hours(v_kitchen, u.id, p_from, p_to, v_tz) > 0)
    ) t);
end;
$$;

-- p_lines: [{ userId, amount, note? }]. Una obligación de nómina por persona y periodo.
create or replace function dk_finance_liquidate_payroll(p_from date, p_to date, p_due date, p_lines jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  l jsonb;
  v_count integer := 0;
  v_name text;
begin
  if v_kitchen is null then raise exception 'No hay una cuenta activa'; end if;
  if not dk_can('finance.payroll') then raise exception 'No autorizado para la nómina'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Periodo no válido'; end if;
  for l in select value from jsonb_array_elements(coalesce(p_lines, '[]')) loop
    if coalesce(nullif(l ->> 'amount', '')::numeric, 0) <= 0 then continue; end if;
    select u.full_name into v_name from dk_users u join dk_kitchen_members m on m.user_id = u.id and m.kitchen_id = v_kitchen
    where u.id = (l ->> 'userId')::uuid;
    if v_name is null then raise exception 'Una de las personas no es de esta cuenta'; end if;
    insert into dk_obligations (kitchen_id, kind, member_user_id, description, amount, accrual_date, period_start, period_end, due_date, notes)
    values (v_kitchen, 'payroll', (l ->> 'userId')::uuid, left('Nómina ' || to_char(p_from, 'DD/MM') || '–' || to_char(p_to, 'DD/MM/YYYY') || ' · ' || v_name, 160),
            (l ->> 'amount')::numeric, p_to, p_from, p_to, coalesce(p_due, p_to), nullif(btrim(l ->> 'note'), ''));
    v_count := v_count + 1;
  end loop;
  return v_count;
exception when unique_violation then
  raise exception 'Ya hay una nómina liquidada para alguien en ese mismo periodo';
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Ventas = pedidos confirmados (D10), también en Insights
-- ---------------------------------------------------------------------------
create or replace function dk_is_sale_status(p dk_order_status)
returns boolean
language sql
immutable
set search_path = public
as $$ select p not in ('NUEVO', 'CANCELADO') $$;
grant execute on function dk_is_sale_status(dk_order_status) to authenticated;

do $$
declare
  v_fn text;
  v_def text;
  v_new text;
begin
  foreach v_fn in array array[
    'dk_insights_items(uuid, date, date, text, uuid, uuid)',
    'dk_insights_kpis(uuid, date, date, text, uuid, uuid, boolean)',
    'dk_insights(date, date, date, date, uuid, uuid)',
    'dk_insights_product_orders(uuid, date, date)'
  ] loop
    v_def := pg_get_functiondef(v_fn::regprocedure);
    v_new := regexp_replace(v_def, '(\m[a-z]+\.)?status <> ''CANCELADO''', 'dk_is_sale_status(\1status)', 'g');
    if v_new <> v_def then execute v_new; end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 11. Ajustes con costo (D5)
-- ---------------------------------------------------------------------------
create or replace function dk_register_adjustment(p_ingredient_id uuid, p_quantity numeric, p_observation text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movement_id uuid;
begin
  perform dk_assert_in_active_kitchen('dk_ingredients', p_ingredient_id);
  if not dk_can('inventory.adjust') then
    raise exception 'No autorizado para registrar ajustes';
  end if;
  if p_quantity = 0 then
    raise exception 'La cantidad de ajuste no puede ser cero';
  end if;

  -- ADR 0051 (D5): valued at the average cost, like waste.
  insert into dk_inventory_movements (
    ingredient_id, movement_type, quantity_base_unit, unit_cost, observation, created_by
  ) values (
    p_ingredient_id, 'AJUSTE', p_quantity, (select avg_cost from dk_ingredients where id = p_ingredient_id), p_observation, dk_current_profile_id()
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Rentabilidad, flujo de caja y por pagar
-- ---------------------------------------------------------------------------
-- La parte de una obligación con periodo que cae en [p_from, p_to] (repartida por días).
create or replace function dk_finance_prorate(p_amount numeric, p_accrual date, p_start date, p_end date, p_from date, p_to date)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when p_start is null then case when p_accrual between p_from and p_to then p_amount else 0 end
    when p_end < p_from or p_start > p_to then 0
    else p_amount * (least(p_end, p_to) - greatest(p_start, p_from) + 1)::numeric / (p_end - p_start + 1)
  end
$$;

-- Estado de resultados del periodo (D8). Las compras y los pagos no están: el costo de los insumos entra por consumo.
create or replace function dk_finance_pnl(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_tz text := dk_account_tz();
  v_vat_deductible boolean;
  v_sales record;
  v_items record;
  v_waste numeric;
  v_adjust numeric;
  v_unvalued integer;
  v_vat numeric;
  v_payroll numeric;
  v_expenses numeric;
  v_categories jsonb;
  v_missing_pay integer;
  v_gross numeric;
  v_operating numeric;
begin
  if v_kitchen is null then raise exception 'No hay una cuenta activa'; end if;
  if not (dk_can('finance.view') and dk_can('reports.profitability')) then
    raise exception 'No autorizado para ver la rentabilidad';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then raise exception 'Periodo no válido'; end if;
  select purchase_vat_deductible into v_vat_deductible from dk_kitchens where id = v_kitchen;

  select coalesce(sum(subtotal - discount), 0) as net, coalesce(sum(delivery_fee), 0) as delivery, coalesce(sum(discount), 0) as discounts,
         coalesce(sum(subtotal), 0) as gross_sales, count(*) as orders
  into v_sales
  from dk_orders
  where kitchen_id = v_kitchen and dk_is_sale_status(status)
    and created_at >= dk_local_start(p_from, v_tz) and created_at < dk_local_start(p_to + 1, v_tz);

  select coalesce(sum(cost), 0) as cogs,
         coalesce(sum(cost) filter (where cost_source = 'estimated'), 0) as estimated,
         coalesce(sum(line_total) filter (where cost_source = 'none'), 0) as uncosted_sales,
         coalesce(sum(line_total), 0) as line_sales
  into v_items
  from dk_insights_items(v_kitchen, p_from, p_to, v_tz, null, null);

  select coalesce(sum(-m.quantity_base_unit * m.unit_cost) filter (where m.movement_type = 'MERMA'), 0),
         coalesce(sum(-m.quantity_base_unit * m.unit_cost) filter (where m.movement_type = 'AJUSTE' and m.unit_cost is not null), 0),
         count(*) filter (where m.movement_type = 'AJUSTE' and m.unit_cost is null)
  into v_waste, v_adjust, v_unvalued
  from dk_inventory_movements m
  where m.kitchen_id = v_kitchen and m.movement_type in ('MERMA', 'AJUSTE')
    and m.created_at >= dk_local_start(p_from, v_tz) and m.created_at < dk_local_start(p_to + 1, v_tz);

  v_vat := case when v_vat_deductible then 0 else coalesce((
    select sum(tax) from dk_purchases where kitchen_id = v_kitchen and status = 'CONFIRMADA' and invoice_date between p_from and p_to), 0) end;

  select coalesce(sum(dk_finance_prorate(amount, accrual_date, period_start, period_end, p_from, p_to)), 0) into v_payroll
  from dk_obligations where kitchen_id = v_kitchen and kind = 'payroll' and voided_at is null;

  select coalesce(jsonb_agg(jsonb_build_object('categoryId', id, 'category', name, 'amount', round(amount)) order by amount desc), '[]'),
         coalesce(sum(amount), 0)
  into v_categories, v_expenses
  from (
    select c.id, c.name, sum(dk_finance_prorate(o.amount, o.accrual_date, o.period_start, o.period_end, p_from, p_to)) as amount
    from dk_obligations o join dk_expense_categories c on c.id = o.category_id
    where o.kitchen_id = v_kitchen and o.kind = 'expense' and o.voided_at is null
    group by c.id, c.name
    having sum(dk_finance_prorate(o.amount, o.accrual_date, o.period_start, o.period_end, p_from, p_to)) > 0
  ) e;

  -- Personas que trabajaron en el periodo sin pago configurado.
  select count(distinct s.user_id) into v_missing_pay
  from dk_shifts s
  where s.kitchen_id = v_kitchen and s.clock_in_at >= dk_local_start(p_from, v_tz) and s.clock_in_at < dk_local_start(p_to + 1, v_tz)
    and not exists (select 1 from dk_member_pay mp where mp.kitchen_id = v_kitchen and mp.user_id = s.user_id and mp.effective_from <= p_to);

  v_gross := v_sales.net - v_items.cogs;
  v_operating := v_gross + v_sales.delivery - v_waste - v_adjust - v_vat - v_payroll - v_expenses;

  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'orders', v_sales.orders,
    'grossSales', v_sales.gross_sales, 'discounts', v_sales.discounts,
    'netSales', v_sales.net, 'deliveryIncome', v_sales.delivery,
    'cogs', round(v_items.cogs), 'estimatedCogs', round(v_items.estimated),
    'grossProfit', round(v_gross),
    'grossMargin', case when v_sales.net > 0 then round(v_gross / v_sales.net, 4) end,
    'waste', round(v_waste), 'adjustments', round(v_adjust),
    'purchaseVat', round(v_vat), 'purchaseVatDeductible', v_vat_deductible,
    'payroll', round(v_payroll), 'expenses', round(v_expenses), 'expensesByCategory', v_categories,
    'operatingProfit', round(v_operating),
    'operatingMargin', case when v_sales.net + v_sales.delivery > 0 then round(v_operating / (v_sales.net + v_sales.delivery), 4) end,
    'coverage', jsonb_build_object(
      'costCoverage', case when v_items.line_sales > 0 then round(1 - v_items.uncosted_sales / v_items.line_sales, 4) end,
      'uncostedSales', round(v_items.uncosted_sales),
      'unvaluedAdjustments', v_unvalued,
      'membersWithoutPay', v_missing_pay,
      'noExpenses', v_expenses = 0,
      'noPayroll', v_payroll = 0));
end;
$$;

-- Flujo de caja del periodo (D11): entra lo cobrado, sale lo pagado.
create or replace function dk_finance_cashflow(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_tz text := dk_account_tz();
  v_payroll boolean := dk_can('finance.payroll');
begin
  if v_kitchen is null then raise exception 'No hay una cuenta activa'; end if;
  if not dk_can('finance.view') then raise exception 'No autorizado para ver finanzas'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then raise exception 'Periodo no válido'; end if;
  return (
    with ins as (
      select dk_local_date(created_at, v_tz) as day, method, amount
      from dk_order_payments
      where kitchen_id = v_kitchen and created_at >= dk_local_start(p_from, v_tz) and created_at < dk_local_start(p_to + 1, v_tz)
    ),
    outs as (
      select pp.paid_on as day, pp.method, pp.amount, o.kind
      from dk_obligation_payments pp join dk_obligations o on o.id = pp.obligation_id
      where pp.kitchen_id = v_kitchen and pp.paid_on between p_from and p_to
    ),
    days as (
      select d::date as day from generate_series(p_from, p_to, interval '1 day') d
    )
    select jsonb_build_object(
      'in', coalesce((select sum(amount) from ins), 0),
      'out', coalesce((select sum(amount) from outs), 0),
      'net', coalesce((select sum(amount) from ins), 0) - coalesce((select sum(amount) from outs), 0),
      'outByKind', jsonb_build_object(
        'purchase', coalesce((select sum(amount) from outs where kind = 'purchase'), 0),
        'expense', coalesce((select sum(amount) from outs where kind = 'expense'), 0),
        'payroll', coalesce((select sum(amount) from outs where kind = 'payroll'), 0)),
      'inByMethod', coalesce((select jsonb_object_agg(coalesce(method, 'Sin método'), total) from (select method, sum(amount) as total from ins group by method) x), '{}'),
      'outByMethod', coalesce((select jsonb_object_agg(method, total) from (select method, sum(amount) as total from outs group by method) x), '{}'),
      'days', (select jsonb_agg(jsonb_build_object('day', d.day,
                  'in', coalesce((select sum(amount) from ins where ins.day = d.day), 0),
                  'out', coalesce((select sum(amount) from outs where outs.day = d.day), 0)) order by d.day) from days d),
      'payrollVisible', v_payroll));
end;
$$;

-- Lo que se debe hoy (D1): total, vencido, próximos 7 días, por tipo. (Genera antes los gastos fijos del mes.)
create or replace function dk_finance_payables_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_today date := dk_local_date(now(), dk_account_tz());
begin
  if v_kitchen is null then raise exception 'No hay una cuenta activa'; end if;
  if not dk_can('finance.view') then raise exception 'No autorizado para ver finanzas'; end if;
  perform dk_finance_generate_recurring();
  return (
    with b as (
      select o.kind, o.due_date, o.amount - coalesce((select sum(amount) from dk_obligation_payments where obligation_id = o.id), 0) as balance
      from dk_obligations o where o.kitchen_id = v_kitchen and o.voided_at is null
    )
    select jsonb_build_object(
      'total', coalesce(sum(balance) filter (where balance > 0), 0),
      'overdue', coalesce(sum(balance) filter (where balance > 0 and due_date < v_today), 0),
      'next7Days', coalesce(sum(balance) filter (where balance > 0 and due_date between v_today and v_today + 7), 0),
      'count', count(*) filter (where balance > 0),
      'byKind', jsonb_build_object(
        'purchase', coalesce(sum(balance) filter (where balance > 0 and kind = 'purchase'), 0),
        'expense', coalesce(sum(balance) filter (where balance > 0 and kind = 'expense'), 0),
        'payroll', coalesce(sum(balance) filter (where balance > 0 and kind = 'payroll'), 0)),
      'previousPurchases', (select count(*) from dk_purchases p where p.kitchen_id = v_kitchen and p.status = 'CONFIRMADA' and p.total > 0
                            and not exists (select 1 from dk_obligations o where o.purchase_id = p.id)))
    from b);
end;
$$;

revoke all on function dk_finance_create_expense(jsonb), dk_finance_void_obligation(uuid, text), dk_finance_pay(uuid, numeric, date, text, text, text),
  dk_finance_void_payment(uuid, text), dk_finance_save_recurring(jsonb), dk_finance_generate_recurring(), dk_finance_add_previous_purchases(uuid[]),
  dk_finance_payroll_proposal(date, date), dk_finance_liquidate_payroll(date, date, date, jsonb), dk_finance_pnl(date, date),
  dk_finance_cashflow(date, date), dk_finance_payables_summary(), dk_finance_prorate(numeric, date, date, date, date, date) from public, anon;
grant execute on function dk_finance_create_expense(jsonb), dk_finance_void_obligation(uuid, text), dk_finance_pay(uuid, numeric, date, text, text, text),
  dk_finance_void_payment(uuid, text), dk_finance_save_recurring(jsonb), dk_finance_generate_recurring(), dk_finance_add_previous_purchases(uuid[]),
  dk_finance_payroll_proposal(date, date), dk_finance_liquidate_payroll(date, date, date, jsonb), dk_finance_pnl(date, date),
  dk_finance_cashflow(date, date), dk_finance_payables_summary(), dk_finance_prorate(numeric, date, date, date, date, date) to authenticated;
