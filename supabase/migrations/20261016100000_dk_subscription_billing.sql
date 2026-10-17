-- ADR 0066: subscriptions paid with Wompi; access only with a confirmed payment.
--
--   * New status `incomplete` (signed up, not paid yet) and the billing mode of each
--     subscription: online (Wompi), manual (transfer, recorded by a Global Admin) or
--     exempt (the organizations that existed before this change: never blocked).
--   * dk_billing_payments: each payment attempt with its unique Wompi reference.
--     dk_billing_events: every Wompi event as received (idempotency and audit).
--   * The block: dk_effective_role returns null (no access to any account) when the
--     organization's subscription is not current AND the platform switch
--     `billing_enforced` is on. Organization permissions keep only what is needed to
--     pay and to fix the business data (dk_has_org_permission).
--   * Payments are applied ONLY from Wompi's data (signed event or the transaction read
--     from Wompi by the server) and only when reference, amount and currency match.
--   * Renewals: a daily pg_cron job moves the states (dk_billing_tick) and wakes
--     dk-billing-renew, which charges the saved card of what is due.
-- Nothing is deleted; turning `billing_enforced` off brings back today's behaviour.

-- ---------------------------------------------------------------------------
-- 1. Subscriptions
-- ---------------------------------------------------------------------------
alter table dk_subscriptions drop constraint if exists dk_subscriptions_status_check;
alter table dk_subscriptions add constraint dk_subscriptions_status_check
  check (status in ('incomplete', 'trialing', 'active', 'past_due', 'canceled', 'expired'));

alter table dk_subscriptions
  add column if not exists billing_mode text not null default 'manual' check (billing_mode in ('online', 'manual', 'exempt')),
  add column if not exists payment_source_id text,
  add column if not exists payment_method_label text,
  add column if not exists customer_email text,
  add column if not exists grace_ends_at timestamptz,
  add column if not exists pending_plan_key text references dk_plans (key),
  add column if not exists pending_billing_period text check (pending_billing_period in ('monthly', 'annual'));

comment on column dk_subscriptions.billing_mode is 'ADR 0066: online = Wompi; manual = transferencia registrada por un admin global; exempt = nunca se bloquea (organizaciones anteriores al cobro).';
comment on column dk_subscriptions.payment_source_id is 'Fuente de pago de Wompi (tarjeta guardada) para renovar sin el cliente. Nunca datos de la tarjeta.';

-- The organizations that already existed: unchanged. Active ones are exempt; the free
-- trials keep their date and then have to pay (ADR 0066, 1).
update dk_subscriptions set billing_mode = case when status = 'active' then 'exempt' when status = 'trialing' then 'online' else 'manual' end;

-- ---------------------------------------------------------------------------
-- 2. Plans: annual prices (two months free) and no free trial on self-serve plans
-- ---------------------------------------------------------------------------
update dk_plans set price_yearly = price_monthly * 10 where price_yearly is null;
update dk_plans set trial_days = 0, cta_label = 'Suscribirme' where self_serve;

-- ---------------------------------------------------------------------------
-- 3. Invoices and payments
-- ---------------------------------------------------------------------------
alter table dk_invoices
  add column if not exists kind text check (kind in ('activation', 'renewal', 'upgrade', 'transfer')),
  add column if not exists plan_key text references dk_plans (key),
  add column if not exists billing_period text check (billing_period in ('monthly', 'annual')),
  add column if not exists method text,
  add column if not exists attempts integer not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists refunded_amount numeric(12, 2) not null default 0 check (refunded_amount >= 0),
  add column if not exists support_path text,
  add column if not exists notes text;

create index if not exists dk_invoices_due_idx on dk_invoices (next_attempt_at) where status = 'open';

create table if not exists dk_billing_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references dk_invoices (id) on delete restrict,
  organization_id uuid not null references dk_organizations (id) on delete restrict,
  reference text not null unique,
  provider text not null default 'wompi',
  provider_transaction_id text unique,
  method text,
  automatic boolean not null default false,
  amount_in_cents bigint not null check (amount_in_cents > 0),
  currency text not null default 'COP' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'voided', 'error')),
  status_message text,
  created_by uuid references dk_users (id) on delete set null,
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

comment on table dk_billing_payments is 'ADR 0066: cada intento de pago de una factura, con su referencia única en Wompi. Solo lo escriben las funciones de cobro.';

create index if not exists dk_billing_payments_invoice_idx on dk_billing_payments (invoice_id, created_at desc);
create index if not exists dk_billing_payments_org_idx on dk_billing_payments (organization_id, created_at desc);

alter table dk_billing_payments enable row level security;
drop policy if exists dk_billing_payments_select on dk_billing_payments;
create policy dk_billing_payments_select on dk_billing_payments for select to authenticated
  using ((select dk_has_org_permission(organization_id, 'billing.view')));
revoke insert, update, delete, truncate on dk_billing_payments from anon, authenticated;
revoke all on dk_billing_payments from anon;

create trigger dk_trg_audit_billing_payments after insert or update or delete on dk_billing_payments
  for each row execute function dk_audit_row();

create table if not exists dk_billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'wompi',
  checksum text not null unique,
  event_type text,
  environment text,
  transaction_id text,
  reference text,
  transaction_status text,
  signature_valid boolean not null,
  result text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

comment on table dk_billing_events is 'ADR 0066: cada evento de Wompi tal como llegó, con el resultado de su firma. Idempotencia (checksum único) y auditoría. Solo el servicio escribe.';

create index if not exists dk_billing_events_reference_idx on dk_billing_events (reference);
alter table dk_billing_events enable row level security;
revoke all on dk_billing_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Platform switches (not secret; the keys live in the function secrets)
-- ---------------------------------------------------------------------------
insert into dk_platform_settings (key, value) values
  ('billing_enforced', 'false'),
  ('billing_payments_active', 'false'),
  ('billing_grace_days', '3'),
  ('billing_renewal_notice_days', '5')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Permission to pay (organization scope: the Super Admin)
-- ---------------------------------------------------------------------------
insert into dk_permissions (key, module, action, scope, label, description, sort_order) values
  ('billing.manage', 'billing', 'manage', 'organization', 'Pagar y administrar la suscripción',
   'Pagar, guardar el método de pago, cambiar de plan y cancelar la suscripción', 561)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Private bucket for the transfer receipts (Enterprise, ADR 0066 §6)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('billing-supports', 'billing-supports', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists dk_billing_supports_admin_read on storage.objects;
create policy dk_billing_supports_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'billing-supports' and (select dk_is_global_admin()));
drop policy if exists dk_billing_supports_admin_write on storage.objects;
create policy dk_billing_supports_admin_write on storage.objects for insert to authenticated
  with check (bucket_id = 'billing-supports' and (select dk_is_global_admin()));

-- ---------------------------------------------------------------------------
-- 7. Helpers
-- ---------------------------------------------------------------------------
create or replace function dk_billing_setting(p_key text, p_default text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value from dk_platform_settings where key = p_key), p_default);
$$;

create or replace function dk_billing_enforced()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select dk_billing_setting('billing_enforced', 'false') = 'true';
$$;

create or replace function dk_billing_interval(p_period text)
returns interval
language sql
immutable
as $$
  select case when p_period = 'annual' then interval '1 year' else interval '1 month' end;
$$;

create or replace function dk_billing_price(p_plan dk_plans, p_period text)
returns numeric
language sql
immutable
as $$
  select case when p_period = 'annual' then coalesce(p_plan.price_yearly, p_plan.price_monthly * 12) else p_plan.price_monthly end;
$$;

-- Is the subscription current? (ADR 0066, 1). Exempt: always.
create or replace function dk_subscription_is_current(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when s.billing_mode = 'exempt' then true
      else case s.status
        when 'active' then true
        when 'trialing' then s.trial_ends_at > now()
        when 'past_due' then coalesce(s.grace_ends_at, s.current_period_end) > now()
        when 'canceled' then s.current_period_end > now()
        else false end
      end
    from dk_subscriptions s where s.organization_id = p_organization_id
  ), false);
$$;

-- Can this organization use the app? Always while the platform has not turned the block on.
create or replace function dk_org_access_ok(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not dk_billing_enforced() or dk_subscription_is_current(p_organization_id);
$$;

revoke all on function dk_billing_setting(text, text), dk_billing_enforced(), dk_billing_interval(text), dk_billing_price(dk_plans, text),
  dk_org_access_ok(uuid) from public, anon;
grant execute on function dk_org_access_ok(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Organization permissions: when blocked, only paying and the business data
-- ---------------------------------------------------------------------------
create or replace function dk_has_org_permission(p_organization_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_organization_id is null then false
    when not exists (select 1 from dk_permissions p where p.key = p_permission and p.scope = 'organization') then false
    when dk_is_superadmin() then exists (select 1 from dk_organizations where id = p_organization_id)
    -- ADR 0066: without a current subscription only paying and fixing the business data remain.
    when p_permission not in ('organization.view', 'organization.manage', 'billing.view', 'billing.manage')
         and not dk_org_access_ok(p_organization_id) then false
    when p_permission = 'organization.view' then exists (
      select 1 from dk_organization_members om
      join dk_users u on u.id = om.user_id and u.active
      join dk_organizations o on o.id = om.organization_id and o.active
      where om.organization_id = p_organization_id and om.status = 'active' and u.auth_user_id = auth.uid())
    else dk_is_org_super_admin(p_organization_id)
  end;
$$;

-- ---------------------------------------------------------------------------
-- 9. What the app needs to show the gate (every member, not only who pays)
-- ---------------------------------------------------------------------------
create or replace function dk_my_billing_access()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'organizationId', o.id,
    'enforced', dk_billing_enforced(),
    'paymentsActive', dk_billing_setting('billing_payments_active', 'false') = 'true',
    'current', dk_subscription_is_current(o.id),
    'blocked', not dk_org_access_ok(o.id),
    'status', s.status,
    'mode', s.billing_mode,
    'planKey', s.plan_key,
    'billingPeriod', s.billing_period,
    'currentPeriodEnd', s.current_period_end,
    'graceEndsAt', s.grace_ends_at,
    'cancelAtPeriodEnd', s.cancel_at_period_end,
    'canPay', dk_has_org_permission(o.id, 'billing.manage'),
    -- The renewal waiting to be paid (and whether it is by hand: no saved card to charge), for the banner.
    'openRenewalDue', (select i.due_at from dk_invoices i where i.organization_id = o.id and i.status = 'open' and i.kind = 'renewal'
                       order by i.issued_at desc limit 1),
    'renewalNeedsPayment', exists (select 1 from dk_invoices i where i.organization_id = o.id and i.status = 'open' and i.kind = 'renewal'
                                   and i.next_attempt_at is null)
  )), '[]'::jsonb)
  from dk_organizations o
  join dk_subscriptions s on s.organization_id = o.id
  where dk_is_superadmin() is false
    and exists (select 1 from dk_organization_members om join dk_users u on u.id = om.user_id
                where om.organization_id = o.id and om.status = 'active' and u.auth_user_id = auth.uid());
$$;
revoke all on function dk_my_billing_access() from public, anon;
grant execute on function dk_my_billing_access() to authenticated;

-- ---------------------------------------------------------------------------
-- 10. dk_my_subscription: + payment data (billing.view)
-- ---------------------------------------------------------------------------
create or replace function dk_my_subscription(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sub dk_subscriptions;
  v_plan dk_plans;
  v_pending dk_plans;
begin
  if not dk_has_org_permission(p_organization_id, 'billing.view') then
    raise exception 'No autorizado para ver la facturación de esta organización';
  end if;
  select * into v_sub from dk_subscriptions where organization_id = p_organization_id;
  if not found then return null; end if;
  select * into v_plan from dk_plans where key = v_sub.plan_key;
  select * into v_pending from dk_plans where key = v_sub.pending_plan_key;
  return jsonb_build_object(
    'plan', jsonb_build_object('key', v_plan.key, 'name', v_plan.name, 'description', v_plan.description,
                               'priceMonthly', v_plan.price_monthly, 'priceYearly', v_plan.price_yearly, 'currency', v_plan.currency,
                               'highlights', to_jsonb(v_plan.highlights), 'selfServe', v_plan.self_serve, 'contactUrl',
                               (select contact_url from dk_plans where cta = 'contact_sales' and status = 'public' order by sort_order limit 1)),
    'status', v_sub.status,
    'mode', v_sub.billing_mode,
    'isCurrent', dk_subscription_is_current(p_organization_id),
    'billingPeriod', v_sub.billing_period,
    'startedAt', v_sub.started_at,
    'trialEndsAt', v_sub.trial_ends_at,
    'currentPeriodStart', v_sub.current_period_start,
    'currentPeriodEnd', v_sub.current_period_end,
    'graceEndsAt', v_sub.grace_ends_at,
    'cancelAtPeriodEnd', v_sub.cancel_at_period_end,
    'canceledAt', v_sub.canceled_at,
    'paymentsEnabled', dk_billing_setting('billing_payments_active', 'false') = 'true',
    'enforced', dk_billing_enforced(),
    'canPay', dk_has_org_permission(p_organization_id, 'billing.manage'),
    'paymentMethod', case when v_sub.payment_source_id is not null then v_sub.payment_method_label end,
    'pendingChange', case when v_sub.pending_plan_key is not null or v_sub.pending_billing_period is not null then jsonb_build_object(
      'planKey', coalesce(v_sub.pending_plan_key, v_sub.plan_key), 'planName', coalesce(v_pending.name, v_plan.name),
      'billingPeriod', coalesce(v_sub.pending_billing_period, v_sub.billing_period)) end,
    'openInvoice', (select jsonb_build_object('id', i.id, 'number', i.number, 'kind', i.kind, 'amount', i.amount, 'currency', i.currency, 'dueAt', i.due_at)
                    from dk_invoices i where i.organization_id = p_organization_id and i.status = 'open' order by i.issued_at desc limit 1),
    'limits', jsonb_build_object('accounts', v_plan.limits -> 'accounts', 'users', v_plan.limits -> 'users',
                                 'aiRunsPerDay', coalesce(v_plan.limits -> 'ai_runs_per_day', '50'::jsonb)),
    'usage', jsonb_build_object(
      'accounts', (select count(*) from dk_kitchens where organization_id = p_organization_id),
      'users', (select count(*) from dk_organization_members where organization_id = p_organization_id and status in ('active', 'pending')),
      'aiRunsMax24h', coalesce((select max(c) from (
          select count(*) c from dk_ai_insights i join dk_kitchens k on k.id = i.kitchen_id
          where k.organization_id = p_organization_id and i.status in ('ok', 'error') and i.created_at > now() - interval '24 hours'
          group by i.kitchen_id) x), 0)),
    'features', (select coalesce(jsonb_agg(pf.feature_key order by f.sort_order), '[]')
                 from dk_plan_features pf join dk_features f on f.key = pf.feature_key where pf.plan_key = v_plan.key));
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Invoices
-- ---------------------------------------------------------------------------
create or replace function dk_billing_new_invoice(
  p_organization_id uuid, p_kind text, p_plan_key text, p_period text, p_amount numeric,
  p_period_start timestamptz default null, p_period_end timestamptz default null, p_due_at timestamptz default null)
returns dk_invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_n integer;
  v_inv dk_invoices;
begin
  -- One number at a time per organization: QNL-<tenant code>-0001.
  perform pg_advisory_xact_lock(hashtext('dk_invoice:' || p_organization_id::text));
  select upper(coalesce(tenant_code, left(replace(id::text, '-', ''), 6))) into v_code from dk_organizations where id = p_organization_id;
  select count(*) + 1 into v_n from dk_invoices where organization_id = p_organization_id;
  insert into dk_invoices (organization_id, subscription_id, number, period_start, period_end, amount, currency, status, due_at,
                           kind, plan_key, billing_period, provider)
  values (p_organization_id, (select id from dk_subscriptions where organization_id = p_organization_id),
          format('QNL-%s-%s', v_code, lpad(v_n::text, 4, '0')), p_period_start, p_period_end, round(p_amount, 0),
          coalesce((select currency from dk_plans where key = p_plan_key), 'COP'), 'open', p_due_at, p_kind, p_plan_key, p_period,
          case when p_kind = 'transfer' then 'transfer' else 'wompi' end)
  returning * into v_inv;
  return v_inv;
end;
$$;

-- A new payment attempt of an invoice: its own Wompi reference (Wompi does not reuse one).
create or replace function dk_billing_new_attempt(p_invoice dk_invoices, p_automatic boolean)
returns dk_billing_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay dk_billing_payments;
  v_n integer;
begin
  select count(*) + 1 into v_n from dk_billing_payments where invoice_id = p_invoice.id;
  insert into dk_billing_payments (invoice_id, organization_id, reference, automatic, amount_in_cents, currency, created_by)
  values (p_invoice.id, p_invoice.organization_id, format('%s-%s', p_invoice.number, v_n), p_automatic,
          (round(p_invoice.amount) * 100)::bigint, p_invoice.currency, dk_current_profile_id())
  returning * into v_pay;
  return v_pay;
end;
$$;

revoke all on function dk_billing_new_invoice(uuid, text, text, text, numeric, timestamptz, timestamptz, timestamptz),
  dk_billing_new_attempt(dk_invoices, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12. Checkout (as the person paying): what to pay and its reference
-- ---------------------------------------------------------------------------
--   incomplete / expired / ended  → activation: the whole period of the chosen plan, from the payment.
--   past_due, or a renewal open    → that renewal (plan and period already decided).
--   active + a more expensive plan → upgrade: the prorated difference until the period end.
create or replace function dk_billing_checkout_start(p_organization_id uuid, p_plan_key text default null, p_billing_period text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub dk_subscriptions;
  v_plan dk_plans;
  v_current dk_plans;
  v_period text;
  v_inv dk_invoices;
  v_pay dk_billing_payments;
  v_amount numeric;
  v_fraction numeric;
  v_email text := (select lower(email) from auth.users where id = auth.uid());
begin
  if not dk_has_org_permission(p_organization_id, 'billing.manage') then
    raise exception 'No autorizado para pagar la suscripción de esta organización' using errcode = '42501';
  end if;
  if dk_billing_setting('billing_payments_active', 'false') <> 'true' then
    raise exception 'PAYMENTS_INACTIVE: los pagos en línea todavía no están activos';
  end if;
  select * into v_sub from dk_subscriptions where organization_id = p_organization_id for update;
  if not found then raise exception 'Esta organización no tiene suscripción'; end if;
  select * into v_current from dk_plans where key = v_sub.plan_key;
  v_period := coalesce(p_billing_period, v_sub.billing_period);
  if v_period not in ('monthly', 'annual') then raise exception 'Periodicidad no válida'; end if;
  select * into v_plan from dk_plans where key = coalesce(p_plan_key, v_sub.plan_key) and status <> 'retired';
  if not found or (not v_plan.self_serve and v_plan.key <> v_sub.plan_key) then
    raise exception 'PLAN_NOT_AVAILABLE: ese plan se contrata con ventas';
  end if;

  -- A renewal waiting (past due, or paid by hand before its date): that one.
  select * into v_inv from dk_invoices
  where organization_id = p_organization_id and status = 'open' and kind = 'renewal'
  order by issued_at desc limit 1;

  if v_inv.id is null then
    if v_sub.status = 'canceled' and dk_subscription_is_current(p_organization_id) then
      raise exception 'ALREADY_CURRENT: tu suscripción sigue vigente hasta el %; reactívala sin pagar', to_char(v_sub.current_period_end, 'DD/MM/YYYY');
    elsif v_sub.status = 'active' and v_sub.billing_mode <> 'exempt' then
      -- Upgrade: same period, more expensive plan, the difference until the period end.
      if v_plan.key = v_sub.plan_key then raise exception 'ALREADY_CURRENT: tu suscripción ya está al día'; end if;
      if v_period <> v_sub.billing_period then raise exception 'Para cambiar la periodicidad, prográmala para la renovación'; end if;
      if dk_billing_price(v_plan, v_period) <= dk_billing_price(v_current, v_period) then
        raise exception 'DOWNGRADE_AT_RENEWAL: un plan más económico se aplica al renovar';
      end if;
      v_fraction := greatest(0, extract(epoch from (v_sub.current_period_end - now())))
                    / nullif(extract(epoch from (v_sub.current_period_end - v_sub.current_period_start)), 0);
      v_amount := round((dk_billing_price(v_plan, v_period) - dk_billing_price(v_current, v_period)) * coalesce(v_fraction, 0));
      if v_amount < 1000 then
        -- A few days before renewing: the change is free, it is not worth a charge.
        update dk_subscriptions set plan_key = v_plan.key, pending_plan_key = null where id = v_sub.id;
        return jsonb_build_object('applied', true);
      end if;
      select * into v_inv from dk_invoices
      where organization_id = p_organization_id and status = 'open' and kind = 'upgrade' and plan_key = v_plan.key and amount = v_amount
      order by issued_at desc limit 1;
      if v_inv.id is null then
        update dk_invoices set status = 'void' where organization_id = p_organization_id and status = 'open' and kind in ('upgrade', 'activation');
        v_inv := dk_billing_new_invoice(p_organization_id, 'upgrade', v_plan.key, v_period, v_amount, now(), v_sub.current_period_end, now());
      end if;
    else
      -- Activation (incomplete, expired, an ended trial or cancellation, or an exempt organization that chooses to pay).
      v_amount := dk_billing_price(v_plan, v_period);
      select * into v_inv from dk_invoices
      where organization_id = p_organization_id and status = 'open' and kind = 'activation' and plan_key = v_plan.key and billing_period = v_period
      order by issued_at desc limit 1;
      if v_inv.id is null then
        update dk_invoices set status = 'void' where organization_id = p_organization_id and status = 'open' and kind in ('upgrade', 'activation');
        v_inv := dk_billing_new_invoice(p_organization_id, 'activation', v_plan.key, v_period, v_amount, null, null, now());
      end if;
    end if;
  end if;

  v_pay := dk_billing_new_attempt(v_inv, false);
  return jsonb_build_object(
    'applied', false,
    'invoiceId', v_inv.id,
    'invoiceNumber', v_inv.number,
    'kind', v_inv.kind,
    'reference', v_pay.reference,
    'amountInCents', v_pay.amount_in_cents,
    'currency', v_pay.currency,
    'planKey', v_inv.plan_key,
    'planName', (select name from dk_plans where key = v_inv.plan_key),
    'billingPeriod', v_inv.billing_period,
    'customerEmail', coalesce(v_sub.customer_email, v_email),
    'hasSavedCard', v_sub.payment_source_id is not null);
end;
$$;
revoke all on function dk_billing_checkout_start(uuid, text, text) from public, anon;
grant execute on function dk_billing_checkout_start(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 13. Applying what Wompi says (service only: webhook, return page, renewals)
-- ---------------------------------------------------------------------------
create or replace function dk_billing_mark_past_due(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update dk_subscriptions
  set status = 'past_due',
      grace_ends_at = coalesce(grace_ends_at, greatest(now(), coalesce(current_period_end, now()))
                                              + make_interval(days => dk_billing_setting('billing_grace_days', '3')::integer))
  where organization_id = p_organization_id and status in ('active', 'past_due') and billing_mode <> 'exempt';
end;
$$;

create or replace function dk_billing_apply_transaction(
  p_reference text, p_transaction_id text, p_status text, p_amount_in_cents bigint, p_currency text,
  p_method text default null, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay dk_billing_payments;
  v_inv dk_invoices;
  v_sub dk_subscriptions;
  v_status text;
  v_start timestamptz;
  v_end timestamptz;
begin
  select * into v_pay from dk_billing_payments where reference = p_reference for update;
  if not found then return jsonb_build_object('result', 'unknown_reference'); end if;
  if v_pay.status = 'approved' then return jsonb_build_object('result', 'already_approved', 'organizationId', v_pay.organization_id); end if;
  if v_pay.status <> 'pending' and v_pay.provider_transaction_id is not distinct from p_transaction_id then
    return jsonb_build_object('result', 'already_processed', 'organizationId', v_pay.organization_id);
  end if;

  v_status := case upper(coalesce(p_status, '')) when 'APPROVED' then 'approved' when 'DECLINED' then 'declined'
                when 'VOIDED' then 'voided' when 'ERROR' then 'error' else 'pending' end;
  -- Never trust an amount that is not the invoice's: it stays recorded and is not applied.
  if v_status = 'approved' and (p_amount_in_cents is distinct from v_pay.amount_in_cents or upper(p_currency) is distinct from v_pay.currency) then
    update dk_billing_payments set status = 'error', provider_transaction_id = coalesce(p_transaction_id, provider_transaction_id),
           status_message = format('Monto o moneda no coinciden: %s %s', p_amount_in_cents, p_currency), finalized_at = now()
    where id = v_pay.id;
    return jsonb_build_object('result', 'amount_mismatch', 'organizationId', v_pay.organization_id);
  end if;

  update dk_billing_payments
  set status = v_status, provider_transaction_id = coalesce(p_transaction_id, provider_transaction_id),
      method = coalesce(p_method, method), status_message = p_message,
      finalized_at = case when v_status <> 'pending' then now() end
  where id = v_pay.id;
  if v_status = 'pending' then return jsonb_build_object('result', 'pending', 'organizationId', v_pay.organization_id); end if;

  select * into v_inv from dk_invoices where id = v_pay.invoice_id for update;
  select * into v_sub from dk_subscriptions where organization_id = v_inv.organization_id for update;

  if v_status <> 'approved' then
    if v_inv.kind = 'renewal' and v_inv.status = 'open' and v_inv.due_at <= now() then
      perform dk_billing_mark_past_due(v_inv.organization_id);
    end if;
    return jsonb_build_object('result', v_status, 'organizationId', v_inv.organization_id);
  end if;

  if v_inv.status <> 'open' then
    -- Paid twice (or after voiding): recorded for a refund, nothing else changes.
    return jsonb_build_object('result', 'invoice_not_open', 'organizationId', v_inv.organization_id);
  end if;

  if v_inv.kind = 'upgrade' then
    update dk_invoices set status = 'paid', paid_at = now(), method = coalesce(p_method, method), next_attempt_at = null where id = v_inv.id;
    update dk_subscriptions set plan_key = v_inv.plan_key, pending_plan_key = null, provider = 'wompi' where id = v_sub.id;
  else
    v_start := coalesce(v_inv.period_start, now());
    if v_inv.kind = 'activation' then v_start := now(); end if;
    v_end := coalesce(v_inv.period_end, v_start + dk_billing_interval(v_inv.billing_period));
    if v_inv.kind = 'activation' then v_end := v_start + dk_billing_interval(v_inv.billing_period); end if;
    update dk_invoices set status = 'paid', paid_at = now(), method = coalesce(p_method, method), next_attempt_at = null,
           period_start = v_start, period_end = v_end
    where id = v_inv.id;
    update dk_subscriptions
    set status = 'active',
        billing_mode = case when billing_mode = 'exempt' then 'online' else billing_mode end,
        plan_key = v_inv.plan_key,
        billing_period = v_inv.billing_period,
        current_period_start = v_start,
        current_period_end = v_end,
        grace_ends_at = null,
        canceled_at = null,
        cancel_at_period_end = case when v_inv.kind = 'activation' then false else cancel_at_period_end end,
        pending_plan_key = null,
        pending_billing_period = null,
        provider = 'wompi'
    where id = v_sub.id;
    -- An abandoned checkout of the same period no longer has anything to pay.
    update dk_invoices set status = 'void', next_attempt_at = null
    where organization_id = v_inv.organization_id and status = 'open' and kind in ('activation', 'upgrade') and id <> v_inv.id;
  end if;
  return jsonb_build_object('result', 'approved', 'organizationId', v_inv.organization_id);
end;
$$;

-- Every event as it arrived; true while it still has to be processed (a retry after a
-- failure is processed again, a repeated one already processed is not).
create or replace function dk_billing_record_event(
  p_checksum text, p_event_type text, p_environment text, p_transaction_id text, p_reference text,
  p_transaction_status text, p_signature_valid boolean, p_payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into dk_billing_events (checksum, event_type, environment, transaction_id, reference, transaction_status, signature_valid, payload)
  values (p_checksum, p_event_type, p_environment, p_transaction_id, p_reference, p_transaction_status, p_signature_valid, p_payload)
  on conflict (checksum) do nothing;
  return (select processed_at is null from dk_billing_events where checksum = p_checksum);
end;
$$;

create or replace function dk_billing_finish_event(p_checksum text, p_result text)
returns void
language sql
security definer
set search_path = public
as $$
  update dk_billing_events set result = p_result, processed_at = now() where checksum = p_checksum;
$$;

-- The card saved for renewals (the token is Wompi's; no card data here).
create or replace function dk_billing_save_source(p_organization_id uuid, p_source_id text, p_label text, p_email text)
returns void
language sql
security definer
set search_path = public
as $$
  update dk_subscriptions
  set payment_source_id = p_source_id, payment_method_label = left(p_label, 60), customer_email = lower(p_email),
      billing_mode = case when billing_mode = 'manual' then 'online' else billing_mode end
  where organization_id = p_organization_id;
$$;

-- A card whose first charge was declined is not kept for the renewals.
create or replace function dk_billing_forget_source(p_organization_id uuid, p_source_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update dk_subscriptions set payment_source_id = null, payment_method_label = null
  where organization_id = p_organization_id and payment_source_id = p_source_id;
$$;

-- An attempt to charge the saved card now (the person paying chose it): the reference to send.
create or replace function dk_billing_source_for_reference(p_reference text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('sourceId', s.payment_source_id, 'email', s.customer_email, 'amountInCents', p.amount_in_cents,
                            'currency', p.currency, 'organizationId', p.organization_id)
  from dk_billing_payments p join dk_subscriptions s on s.organization_id = p.organization_id
  where p.reference = p_reference and p.status = 'pending';
$$;

revoke all on function dk_billing_mark_past_due(uuid),
  dk_billing_apply_transaction(text, text, text, bigint, text, text, text),
  dk_billing_record_event(text, text, text, text, text, text, boolean, jsonb),
  dk_billing_finish_event(text, text),
  dk_billing_save_source(uuid, text, text, text),
  dk_billing_forget_source(uuid, text),
  dk_billing_source_for_reference(text) from public, anon, authenticated;
grant execute on function dk_billing_apply_transaction(text, text, text, bigint, text, text, text),
  dk_billing_record_event(text, text, text, text, text, text, boolean, jsonb),
  dk_billing_finish_event(text, text),
  dk_billing_save_source(uuid, text, text, text),
  dk_billing_forget_source(uuid, text),
  dk_billing_source_for_reference(text) to service_role;

-- ---------------------------------------------------------------------------
-- 14. The person paying: who they are (the edge function asks as the caller)
-- ---------------------------------------------------------------------------
create or replace function dk_billing_manager_email(p_organization_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not dk_has_org_permission(p_organization_id, 'billing.manage') then
    raise exception 'No autorizado para pagar la suscripción de esta organización' using errcode = '42501';
  end if;
  return coalesce((select customer_email from dk_subscriptions where organization_id = p_organization_id),
                  (select lower(email) from auth.users where id = auth.uid()));
end;
$$;

-- Cancel at the period end, resume, forget the card, and schedule a change for the renewal.
create or replace function dk_billing_cancel(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not dk_has_org_permission(p_organization_id, 'billing.manage') then raise exception 'No autorizado' using errcode = '42501'; end if;
  update dk_subscriptions set cancel_at_period_end = true
  where organization_id = p_organization_id and status in ('active', 'past_due');
  if not found then raise exception 'No hay una suscripción activa para cancelar'; end if;
  update dk_invoices set status = 'void', next_attempt_at = null where organization_id = p_organization_id and status = 'open' and kind = 'renewal';
end;
$$;

create or replace function dk_billing_resume(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not dk_has_org_permission(p_organization_id, 'billing.manage') then raise exception 'No autorizado' using errcode = '42501'; end if;
  update dk_subscriptions
  set cancel_at_period_end = false, canceled_at = null, status = case when status = 'canceled' then 'active' else status end
  where organization_id = p_organization_id and (status in ('active', 'past_due') or (status = 'canceled' and current_period_end > now()));
  if not found then raise exception 'La suscripción ya terminó: elige un plan y paga para volver'; end if;
end;
$$;

create or replace function dk_billing_remove_source(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not dk_has_org_permission(p_organization_id, 'billing.manage') then raise exception 'No autorizado' using errcode = '42501'; end if;
  update dk_subscriptions set payment_source_id = null, payment_method_label = null where organization_id = p_organization_id;
end;
$$;

-- A cheaper plan or another period: at the renewal, and only if the business fits in it.
create or replace function dk_billing_schedule_change(p_organization_id uuid, p_plan_key text, p_billing_period text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub dk_subscriptions;
  v_plan dk_plans;
  v_current dk_plans;
  v_accounts integer;
  v_users integer;
begin
  if not dk_has_org_permission(p_organization_id, 'billing.manage') then raise exception 'No autorizado' using errcode = '42501'; end if;
  if p_billing_period not in ('monthly', 'annual') then raise exception 'Periodicidad no válida'; end if;
  select * into v_sub from dk_subscriptions where organization_id = p_organization_id for update;
  select * into v_current from dk_plans where key = v_sub.plan_key;
  select * into v_plan from dk_plans where key = p_plan_key and status = 'public' and self_serve;
  if not found then raise exception 'PLAN_NOT_AVAILABLE: ese plan se contrata con ventas'; end if;

  if v_plan.key = v_sub.plan_key and p_billing_period = v_sub.billing_period then
    update dk_subscriptions set pending_plan_key = null, pending_billing_period = null where id = v_sub.id;
    return;
  end if;
  if p_billing_period = v_sub.billing_period and dk_billing_price(v_plan, p_billing_period) > dk_billing_price(v_current, p_billing_period) then
    raise exception 'UPGRADE_NEEDS_PAYMENT: un plan superior se paga ahora';
  end if;
  select count(*) into v_accounts from dk_kitchens where organization_id = p_organization_id;
  select count(*) into v_users from dk_organization_members where organization_id = p_organization_id and status in ('active', 'pending');
  if (v_plan.limits ->> 'accounts') is not null and v_accounts > (v_plan.limits ->> 'accounts')::integer then
    raise exception 'LIMITS_EXCEEDED: % tiene % cuenta(s) y tú usas %; desactiva las que sobran antes del cambio',
      v_plan.name, v_plan.limits ->> 'accounts', v_accounts;
  end if;
  if (v_plan.limits ->> 'users') is not null and v_users > (v_plan.limits ->> 'users')::integer then
    raise exception 'LIMITS_EXCEEDED: % permite % usuario(s) y tienes %; desactiva a quien sobra antes del cambio',
      v_plan.name, v_plan.limits ->> 'users', v_users;
  end if;
  update dk_subscriptions
  set pending_plan_key = nullif(v_plan.key, v_sub.plan_key), pending_billing_period = nullif(p_billing_period, v_sub.billing_period)
  where id = v_sub.id;
  -- A renewal already issued with the old plan is redone by the next tick.
  update dk_invoices set status = 'void', next_attempt_at = null
  where organization_id = p_organization_id and status = 'open' and kind = 'renewal' and attempts = 0;
end;
$$;

revoke all on function dk_billing_manager_email(uuid), dk_billing_cancel(uuid), dk_billing_resume(uuid), dk_billing_remove_source(uuid),
  dk_billing_schedule_change(uuid, text, text) from public, anon;
grant execute on function dk_billing_manager_email(uuid), dk_billing_cancel(uuid), dk_billing_resume(uuid), dk_billing_remove_source(uuid),
  dk_billing_schedule_change(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 15. Daily: states, renewal invoices and what to charge
-- ---------------------------------------------------------------------------
create or replace function dk_billing_tick()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notice integer := dk_billing_setting('billing_renewal_notice_days', '5')::integer;
  v_trials integer;
  v_canceled integer;
  v_invoices integer := 0;
  v_past_due integer;
  v_expired integer;
  r record;
  v_plan dk_plans;
  v_period text;
begin
  -- Ended trials (only the ones from before ADR 0066).
  update dk_subscriptions set status = 'expired'
  where status = 'trialing' and trial_ends_at <= now() and billing_mode <> 'exempt';
  get diagnostics v_trials = row_count;

  -- Cancellations that reached the period end.
  update dk_subscriptions set status = 'canceled', canceled_at = now()
  where status in ('active', 'past_due') and cancel_at_period_end and current_period_end <= now() and billing_mode <> 'exempt';
  get diagnostics v_canceled = row_count;

  -- The renewal invoice, some days before (with the plan or period scheduled for then).
  for r in
    select s.* from dk_subscriptions s
    where s.status = 'active' and s.billing_mode <> 'exempt' and not s.cancel_at_period_end
      and s.current_period_end is not null and s.current_period_end <= now() + make_interval(days => v_notice)
      and not exists (select 1 from dk_invoices i where i.organization_id = s.organization_id and i.kind = 'renewal'
                      and i.status in ('open', 'paid') and i.period_start = s.current_period_end)
  loop
    v_period := coalesce(r.pending_billing_period, r.billing_period);
    select * into v_plan from dk_plans where key = coalesce(r.pending_plan_key, r.plan_key);
    perform dk_billing_new_invoice(r.organization_id, 'renewal', v_plan.key, v_period, dk_billing_price(v_plan, v_period),
                                   r.current_period_end, r.current_period_end + dk_billing_interval(v_period), r.current_period_end);
    -- A saved card is charged on the due date; without one, the person pays from the notice.
    update dk_invoices set next_attempt_at = case when r.payment_source_id is not null and r.billing_mode = 'online' then r.current_period_end end
    where organization_id = r.organization_id and kind = 'renewal' and status = 'open' and period_start = r.current_period_end;
    v_invoices := v_invoices + 1;
  end loop;

  -- The period ended without the renewal paid: grace.
  update dk_subscriptions s
  set status = 'past_due',
      grace_ends_at = coalesce(s.grace_ends_at, s.current_period_end + make_interval(days => dk_billing_setting('billing_grace_days', '3')::integer))
  where s.status = 'active' and s.billing_mode <> 'exempt' and not s.cancel_at_period_end
    and s.current_period_end is not null and s.current_period_end <= now();
  get diagnostics v_past_due = row_count;

  -- Grace over.
  update dk_subscriptions set status = 'expired'
  where status = 'past_due' and billing_mode <> 'exempt' and coalesce(grace_ends_at, current_period_end) <= now();
  get diagnostics v_expired = row_count;

  return jsonb_build_object('trialsEnded', v_trials, 'canceled', v_canceled, 'renewalInvoices', v_invoices,
                            'pastDue', v_past_due, 'expired', v_expired);
end;
$$;

-- The renewals to charge now with the saved card: each gets its attempt (and the next date)
-- here, so calling twice never charges twice.
create or replace function dk_billing_charges_due()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_out jsonb := '[]';
  r record;
  v_pay dk_billing_payments;
  v_inv dk_invoices;
begin
  for r in
    select i.id from dk_invoices i join dk_subscriptions s on s.organization_id = i.organization_id
    where i.status = 'open' and i.kind = 'renewal' and i.next_attempt_at <= now()
      and s.payment_source_id is not null and s.billing_mode = 'online' and not s.cancel_at_period_end
      and s.status in ('active', 'past_due')
      and not exists (select 1 from dk_billing_payments p where p.invoice_id = i.id and p.status = 'pending' and p.created_at > now() - interval '1 hour')
    order by i.next_attempt_at
    limit 50
    for update of i skip locked
  loop
    select * into v_inv from dk_invoices where id = r.id;
    update dk_invoices
    set attempts = attempts + 1,
        -- On the due date, then 1 and 3 days later (ADR 0066 §5); after that, by hand.
        next_attempt_at = case attempts when 0 then due_at + interval '1 day' when 1 then due_at + interval '3 days' end
    where id = v_inv.id;
    v_pay := dk_billing_new_attempt(v_inv, true);
    v_out := v_out || jsonb_build_object('reference', v_pay.reference, 'amountInCents', v_pay.amount_in_cents, 'currency', v_pay.currency,
      'sourceId', (select payment_source_id from dk_subscriptions where organization_id = v_inv.organization_id),
      'email', (select customer_email from dk_subscriptions where organization_id = v_inv.organization_id));
  end loop;
  return v_out;
end;
$$;

-- Wakes the renewal function after the commit (pg_net); never fails the caller.
create or replace function dk_billing_kick()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text := (select value from dk_platform_settings where key = 'functions_url');
begin
  if v_url is null then return; end if;
  perform net.http_post(url := v_url || '/dk-billing-renew', body := '{}'::jsonb,
                        headers := jsonb_build_object('Content-Type', 'application/json'), timeout_milliseconds := 5000);
exception when others then
  raise warning 'dk_billing_kick: %', sqlerrm;
end;
$$;

create or replace function dk_billing_daily()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform dk_billing_tick();
  perform dk_billing_kick();
end;
$$;

revoke all on function dk_billing_tick(), dk_billing_charges_due(), dk_billing_kick(), dk_billing_daily() from public, anon, authenticated;
grant execute on function dk_billing_tick(), dk_billing_charges_due() to service_role;

-- 08:10 in Bogotá. The function does nothing when nothing is due.
select cron.unschedule('dk-billing-daily') where exists (select 1 from cron.job where jobname = 'dk-billing-daily');
select cron.schedule('dk-billing-daily', '10 13 * * *', 'select public.dk_billing_daily()');

-- ---------------------------------------------------------------------------
-- 16. Global Admin (role + MFA)
-- ---------------------------------------------------------------------------
create or replace function dk_ga_billing_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform dk_require_global_admin();
  return jsonb_build_object(
    'settings', (select coalesce(jsonb_object_agg(key, value), '{}') from dk_platform_settings where key like 'billing_%'),
    'counts', jsonb_build_object(
      'incomplete', (select count(*) from dk_subscriptions where status = 'incomplete'),
      'active', (select count(*) from dk_subscriptions where status = 'active' and billing_mode <> 'exempt'),
      'exempt', (select count(*) from dk_subscriptions where billing_mode = 'exempt'),
      'trialing', (select count(*) from dk_subscriptions where status = 'trialing'),
      'pastDue', (select count(*) from dk_subscriptions where status = 'past_due'),
      'expired', (select count(*) from dk_subscriptions where status = 'expired'),
      'failedRenewals7d', (select count(*) from dk_billing_payments where automatic and status in ('declined', 'error') and created_at > now() - interval '7 days'),
      'invalidEvents7d', (select count(*) from dk_billing_events where not signature_valid and received_at > now() - interval '7 days'),
      'mismatches7d', (select count(*) from dk_billing_events where result = 'amount_mismatch' and received_at > now() - interval '7 days')),
    'attention', (select coalesce(jsonb_agg(x order by x ->> 'since'), '[]') from (
      select jsonb_build_object('organizationId', o.id, 'name', o.name, 'status', s.status, 'since', coalesce(s.grace_ends_at, s.current_period_end)) x
      from dk_subscriptions s join dk_organizations o on o.id = s.organization_id
      where s.status in ('past_due', 'expired') and s.billing_mode <> 'exempt'
      order by coalesce(s.grace_ends_at, s.current_period_end) limit 20) a),
    'recentEvents', (select coalesce(jsonb_agg(e order by e ->> 'receivedAt' desc), '[]') from (
      select jsonb_build_object('reference', reference, 'status', transaction_status, 'valid', signature_valid, 'result', result,
                                'environment', environment, 'receivedAt', received_at) e
      from dk_billing_events order by received_at desc limit 20) ev));
end;
$$;

create or replace function dk_ga_set_billing_setting(p_key text, p_value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform dk_require_global_admin();
  if p_key in ('billing_enforced', 'billing_payments_active') then
    if p_value not in ('true', 'false') then raise exception 'Valor no válido'; end if;
  elsif p_key in ('billing_grace_days', 'billing_renewal_notice_days') then
    if p_value !~ '^\d{1,2}$' or p_value::integer not between 0 and 30 then raise exception 'Escribe un número de días entre 0 y 30'; end if;
  else
    raise exception 'Ajuste desconocido: %', p_key;
  end if;
  insert into dk_platform_settings (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;

create or replace function dk_ga_billing_org(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sub dk_subscriptions;
begin
  perform dk_require_global_admin();
  select * into v_sub from dk_subscriptions where organization_id = p_organization_id;
  return jsonb_build_object(
    'subscription', jsonb_build_object('status', v_sub.status, 'mode', v_sub.billing_mode, 'planKey', v_sub.plan_key,
      'billingPeriod', v_sub.billing_period, 'currentPeriodEnd', v_sub.current_period_end, 'graceEndsAt', v_sub.grace_ends_at,
      'cancelAtPeriodEnd', v_sub.cancel_at_period_end, 'paymentMethod', v_sub.payment_method_label, 'customerEmail', v_sub.customer_email,
      'isCurrent', dk_subscription_is_current(p_organization_id)),
    'invoices', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'number', i.number, 'kind', i.kind, 'planKey', i.plan_key, 'billingPeriod', i.billing_period, 'amount', i.amount,
        'currency', i.currency, 'status', i.status, 'method', i.method, 'issuedAt', i.issued_at, 'dueAt', i.due_at, 'paidAt', i.paid_at,
        'attempts', i.attempts, 'nextAttemptAt', i.next_attempt_at, 'refundedAmount', i.refunded_amount, 'supportPath', i.support_path,
        'notes', i.notes,
        'payments', (select coalesce(jsonb_agg(jsonb_build_object('reference', p.reference, 'status', p.status, 'method', p.method,
                       'automatic', p.automatic, 'transactionId', p.provider_transaction_id, 'message', p.status_message, 'createdAt', p.created_at)
                       order by p.created_at desc), '[]') from dk_billing_payments p where p.invoice_id = i.id))
        order by i.issued_at desc), '[]') from dk_invoices i where i.organization_id = p_organization_id));
end;
$$;

create or replace function dk_ga_set_billing_mode(p_organization_id uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform dk_require_global_admin();
  if p_mode not in ('online', 'manual', 'exempt') then raise exception 'Modo no válido'; end if;
  update dk_subscriptions set billing_mode = p_mode where organization_id = p_organization_id;
end;
$$;

-- A transfer (Enterprise): the invoice paid with its receipt and the period active.
create or replace function dk_ga_record_transfer(
  p_organization_id uuid, p_amount numeric, p_paid_on date, p_plan_key text, p_billing_period text,
  p_support_path text default null, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub dk_subscriptions;
  v_inv dk_invoices;
  v_start timestamptz;
  v_end timestamptz;
begin
  perform dk_require_global_admin();
  if p_amount is null or p_amount <= 0 then raise exception 'Escribe el valor recibido'; end if;
  if p_billing_period not in ('monthly', 'annual') then raise exception 'Periodicidad no válida'; end if;
  if not exists (select 1 from dk_plans where key = p_plan_key and status <> 'retired') then raise exception 'Plan no disponible'; end if;
  select * into v_sub from dk_subscriptions where organization_id = p_organization_id for update;
  if not found then raise exception 'Organización no encontrada'; end if;

  -- The new period follows the current one when it has not ended; otherwise it starts on the payment date.
  v_start := case when v_sub.current_period_end is not null and v_sub.current_period_end > p_paid_on::timestamptz
                       and v_sub.status in ('active', 'past_due') then v_sub.current_period_end else p_paid_on::timestamptz end;
  v_end := v_start + dk_billing_interval(p_billing_period);

  select * into v_inv from dk_invoices where organization_id = p_organization_id and status = 'open' and kind = 'renewal'
  order by issued_at desc limit 1;
  if v_inv.id is null then
    v_inv := dk_billing_new_invoice(p_organization_id, 'transfer', p_plan_key, p_billing_period, p_amount, v_start, v_end, p_paid_on::timestamptz);
  end if;
  update dk_invoices
  set status = 'paid', paid_at = p_paid_on::timestamptz, amount = round(p_amount, 0), method = 'TRANSFER', provider = 'transfer',
      plan_key = p_plan_key, billing_period = p_billing_period, period_start = v_start, period_end = v_end,
      support_path = p_support_path, notes = nullif(btrim(coalesce(p_note, '')), ''), next_attempt_at = null
  where id = v_inv.id;
  update dk_subscriptions
  set status = 'active', plan_key = p_plan_key, billing_period = p_billing_period, current_period_start = v_start, current_period_end = v_end,
      grace_ends_at = null, canceled_at = null, cancel_at_period_end = false, pending_plan_key = null, pending_billing_period = null,
      billing_mode = case when billing_mode = 'exempt' then 'exempt' else 'manual' end
  where id = v_sub.id;
  return v_inv.id;
end;
$$;

-- A refund made in Wompi's dashboard (or by transfer), recorded here. Total: the period ends.
create or replace function dk_ga_record_refund(p_invoice_id uuid, p_amount numeric, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv dk_invoices;
begin
  perform dk_require_global_admin();
  select * into v_inv from dk_invoices where id = p_invoice_id for update;
  if not found or v_inv.status <> 'paid' then raise exception 'Solo se reembolsa una factura pagada'; end if;
  if p_amount is null or p_amount <= 0 or v_inv.refunded_amount + p_amount > v_inv.amount then
    raise exception 'El reembolso no puede superar lo pagado (%)', v_inv.amount - v_inv.refunded_amount;
  end if;
  update dk_invoices
  set refunded_amount = refunded_amount + p_amount,
      status = case when refunded_amount + p_amount >= amount then 'void' else status end,
      notes = concat_ws(E'\n', notes, format('Reembolso %s: %s', round(p_amount), nullif(btrim(coalesce(p_note, '')), '')))
  where id = v_inv.id;
  if v_inv.refunded_amount + p_amount >= v_inv.amount and v_inv.kind in ('activation', 'renewal', 'transfer') then
    update dk_subscriptions
    set status = 'canceled', canceled_at = now(), current_period_end = least(current_period_end, now()), cancel_at_period_end = false
    where organization_id = v_inv.organization_id and current_period_end = v_inv.period_end;
  end if;
end;
$$;

-- Charge again now (after the person updated the card, or after a Wompi incident).
create or replace function dk_ga_retry_charge(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform dk_require_global_admin();
  update dk_invoices set next_attempt_at = now() where id = p_invoice_id and status = 'open' and kind = 'renewal';
  if not found then raise exception 'Solo se reintenta una renovación pendiente'; end if;
  perform dk_billing_kick();
end;
$$;

revoke all on function dk_ga_billing_overview(), dk_ga_set_billing_setting(text, text), dk_ga_billing_org(uuid), dk_ga_set_billing_mode(uuid, text),
  dk_ga_record_transfer(uuid, numeric, date, text, text, text, text), dk_ga_record_refund(uuid, numeric, text), dk_ga_retry_charge(uuid) from public, anon;
grant execute on function dk_ga_billing_overview(), dk_ga_set_billing_setting(text, text), dk_ga_billing_org(uuid), dk_ga_set_billing_mode(uuid, text),
  dk_ga_record_transfer(uuid, numeric, date, text, text, text, text), dk_ga_record_refund(uuid, numeric, text), dk_ga_retry_charge(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 17. The block itself: no account role without a current subscription
-- ---------------------------------------------------------------------------
create or replace function dk_effective_role(p_kitchen_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_platform boolean;
  v_org uuid;
  v_kitchen_active boolean;
  v_org_active boolean;
  v_super boolean;
  v_member boolean;
  v_default uuid;
  v_header text;
begin
  if p_kitchen_id is null or auth.uid() is null then return null; end if;
  select id into v_user from dk_users where auth_user_id = auth.uid() and active;
  if v_user is null then return null; end if;
  v_platform := dk_is_superadmin();

  select k.organization_id, k.active, o.active into v_org, v_kitchen_active, v_org_active
  from dk_kitchens k join dk_organizations o on o.id = k.organization_id
  where k.id = p_kitchen_id;
  if v_org is null then return null; end if;
  if not v_platform and not (v_kitchen_active and v_org_active) then return null; end if;
  -- ADR 0066: no current subscription (and the platform enforces it) = no account access.
  if not v_platform and not dk_org_access_ok(v_org) then return null; end if;

  select om.is_super_admin into v_super
  from dk_organization_members om
  where om.organization_id = v_org and om.user_id = v_user and om.status = 'active';
  v_member := found;
  if not v_platform and not v_member then return null; end if;
  v_super := v_platform or coalesce(v_super, false);

  select m.default_role_id into v_default
  from dk_kitchen_members m
  where m.kitchen_id = p_kitchen_id and m.user_id = v_user and m.active;

  -- Rol activo pedido: solo vale para la Cuenta del encabezado y si está asignado.
  if dk_request_header('x-dk-kitchen-id') = p_kitchen_id::text then
    v_header := lower(dk_request_header('x-dk-role-id'));
    if v_header = 'super-admin' and v_super then
      return 'ALL';
    end if;
    if v_header ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and v_default is not null
       and exists (select 1 from dk_member_roles mr where mr.kitchen_id = p_kitchen_id and mr.user_id = v_user and mr.role_id = v_header::uuid) then
      return v_header;
    end if;
  end if;

  if v_super then return 'ALL'; end if;
  return v_default::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- 18. Signup: the organization is born `incomplete` with the period chosen
-- ---------------------------------------------------------------------------
drop function if exists dk_create_organization(text, text, text, text, text, text, text, text, text, text, text, text, text);
create or replace function dk_create_organization(
  p_name text,
  p_sector text,
  p_category text,
  p_address text default null,
  p_city text default null,
  p_country text default 'CO',
  p_phone text default null,
  p_tax_id text default null,
  p_legal_name text default null,
  p_full_name text default null,
  p_plan text default null,
  p_account_name text default null,
  p_account_icon text default null,
  p_billing_period text default 'monthly'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth auth.users;
  v_profile uuid;
  v_slug text;
  v_full_name text;
  v_plan dk_plans;
  v_org uuid;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para crear tu negocio'; end if;
  select * into v_auth from auth.users where id = auth.uid();
  if not dk_owner_signup_verified(v_auth) then
    raise exception 'Confirma tu correo antes de crear tu negocio';
  end if;

  select id into v_profile from dk_users where auth_user_id = auth.uid();

  -- Idempotent: someone who already owns an organization goes back to its first account.
  if v_profile is not null then
    select k.slug into v_slug
    from dk_organizations o join dk_kitchens k on k.organization_id = o.id
    where o.owner_user_id = v_profile
    order by k.created_at limit 1;
    if v_slug is not null then return v_slug; end if;
    if exists (select 1 from dk_organizations where owner_user_id = v_profile) then
      raise exception 'Ya eres dueño de una organización';
    end if;
  elsif v_auth.email is not null
        and exists (select 1 from dk_users where email = lower(v_auth.email) and auth_user_id is null) then
    -- A second profile would leave the invitation impossible to activate.
    raise exception 'PENDING_INVITATION: tienes una invitación pendiente; actívala con el enlace que te enviaron';
  end if;

  -- The plan comes from the signup (editable metadata): validated here.
  select * into v_plan from dk_plans where key = p_plan and status = 'public' and self_serve;
  if not found then
    raise exception 'PLAN_NOT_AVAILABLE: el plan elegido no está disponible; elige otro plan';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 80 then raise exception 'El nombre del negocio debe tener entre 2 y 80 caracteres'; end if;

  v_full_name := btrim(coalesce(
    nullif(btrim(p_full_name), ''),
    nullif(btrim(v_auth.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(v_auth.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(v_auth.raw_user_meta_data ->> 'preferred_username'), ''),
    nullif(split_part(v_auth.email, '@', 1), ''),
    'Dueño'));
  if char_length(v_full_name) < 2 then v_full_name := 'Dueño'; end if;
  if v_profile is null then
    insert into dk_users (auth_user_id, full_name, active) values (auth.uid(), left(v_full_name, 80), true) returning id into v_profile;
  end if;

  select p.new_organization_id, p.new_kitchen_slug into v_org, v_slug
  from dk_provision_organization(v_profile, v_profile, p_name, p_sector, p_category, v_plan, p_address, p_city, p_country,
                                 p_phone, p_tax_id, p_legal_name, p_account_name, p_account_icon) p;
  -- ADR 0066: signed up, not paid. The plan and period chosen wait for the checkout.
  update dk_subscriptions
  set status = 'incomplete', billing_mode = 'online',
      billing_period = case when p_billing_period = 'annual' and v_plan.price_yearly is not null then 'annual' else 'monthly' end,
      trial_ends_at = null, current_period_end = null, customer_email = lower(v_auth.email)
  where organization_id = v_org;
  return v_slug;
end;
$$;
revoke all on function dk_create_organization(text, text, text, text, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function dk_create_organization(text, text, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 19. The bell: what has to be paid (replaces the free trial notice)
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
    -- ADR 0066: the subscription that has to be paid, in the bell of whoever pays.
    if v_sub.billing_mode <> 'exempt' then
      if v_sub.status in ('incomplete', 'expired') or (v_sub.status = 'trialing' and v_sub.trial_ends_at < now() + interval '3 days') then
        v_items := v_items || jsonb_build_object('key', format('subscription:%s:%s', v_sub.status, coalesce(v_sub.trial_ends_at, v_sub.current_period_end)::date),
          'group', 'account', 'type', 'subscription', 'severity', 'error',
          'title', case v_sub.status when 'incomplete' then 'Activa tu suscripción' when 'expired' then 'Tu suscripción venció'
                     else format('La prueba gratis termina el %s', to_char(v_sub.trial_ends_at, 'DD/MM/YYYY')) end,
          'detail', 'Paga tu plan para seguir usando Quanela.', 'to', '/settings/billing', 'action', 'Pagar', 'at', now(), 'ongoing', true);
      elsif v_sub.status = 'past_due' then
        v_items := v_items || jsonb_build_object('key', format('subscription:past_due:%s', v_sub.grace_ends_at::date), 'group', 'account', 'type', 'subscription',
          'severity', 'error', 'title', 'No pudimos cobrar tu suscripción',
          'detail', format('Paga antes del %s para no perder el acceso.', to_char(coalesce(v_sub.grace_ends_at, v_sub.current_period_end), 'DD/MM/YYYY')),
          'to', '/settings/billing', 'action', 'Pagar', 'at', now(), 'ongoing', true);
      elsif v_sub.status = 'active' and v_sub.cancel_at_period_end then
        v_items := v_items || jsonb_build_object('key', format('subscription:canceling:%s', v_sub.current_period_end::date), 'group', 'account', 'type', 'subscription',
          'severity', 'warning', 'title', format('Tu suscripción termina el %s', to_char(v_sub.current_period_end, 'DD/MM/YYYY')),
          'detail', 'La cancelaste. Reactívala para seguir sin interrupciones.', 'to', '/settings/billing', 'action', 'Reactivar', 'at', now(), 'ongoing', true);
      elsif v_sub.status = 'active' and exists (select 1 from dk_invoices i where i.organization_id = v_sub.organization_id and i.status = 'open'
                                                 and i.kind = 'renewal' and i.next_attempt_at is null) then
        v_items := v_items || jsonb_build_object('key', format('subscription:renewal:%s', v_sub.current_period_end::date), 'group', 'account', 'type', 'subscription',
          'severity', 'warning', 'title', format('Tu suscripción se renueva el %s', to_char(v_sub.current_period_end, 'DD/MM/YYYY')),
          'detail', 'Págala antes de esa fecha para no perder el acceso.', 'to', '/settings/billing', 'action', 'Pagar', 'at', now(), 'ongoing', true);
      end if;
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
