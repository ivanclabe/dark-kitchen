-- Pruebas de suscripciones con pago (ADR 0066). Transacción revertida.
--
--   python3 supabase/tests/run.py subscriptions

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, txt text) on commit drop;
grant all on _t, _ctx to authenticated;
grant usage on sequence _t_n_seq to authenticated;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid default null, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated', 'aal', p_aal)::text, true);
  select set_config('request.headers', (case when p_kitchen is null then '{}'::jsonb else jsonb_build_object('x-dk-kitchen-id', p_kitchen) end)::text, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.ctx(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.setting(p_key text, p_value text) returns void language sql as $$
  insert into dk_platform_settings (key, value) values (p_key, p_value) on conflict (key) do update set value = excluded.value;
$$;

-- People: Sofía signs up (owner), Mateo is her cashier, Ana owns an organization from before, Gloria is the platform.
insert into auth.users (id, email, aud, role, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000066a001', 'sofia.suscripcion@negocio.test', 'authenticated', 'authenticated', now(), '{"full_name": "Sofía Ríos"}'),
  ('00000000-0000-0000-0000-00000066a002', 'mateo.caja@negocio.test', 'authenticated', 'authenticated', now(), '{}'),
  ('00000000-0000-0000-0000-00000066a003', 'ana.antes@negocio.test', 'authenticated', 'authenticated', now(), '{}'),
  ('00000000-0000-0000-0000-00000066a004', 'gloria.plataforma@quanela.test', 'authenticated', 'authenticated', now(), '{}');
insert into dk_users (id, auth_user_id, full_name, active, platform_role) values
  ('10000000-0000-0000-0000-00000066a002', '00000000-0000-0000-0000-00000066a002', 'Mateo', true, null),
  ('10000000-0000-0000-0000-00000066a003', '00000000-0000-0000-0000-00000066a003', 'Ana', true, null),
  ('10000000-0000-0000-0000-00000066a004', '00000000-0000-0000-0000-00000066a004', 'Gloria', true, 'SUPERADMIN');

-- An organization from before ADR 0066: exempt, never blocked.
insert into dk_organizations (slug, name, owner_user_id, sector, category) values
  ('antes-0066', 'Antes', '10000000-0000-0000-0000-00000066a003', 'fast_food', 'burgers');
insert into _ctx (key, id) values ('orgOld', (select id from dk_organizations where slug = 'antes-0066'));
update dk_subscriptions set billing_mode = 'exempt', status = 'active' where organization_id = pg_temp.ctx('orgOld');
select pg_temp.act_as('00000000-0000-0000-0000-00000066a003');
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('kOld', dk_create_kitchen('Antes Centro', 'antes-centro-0066', null, null, pg_temp.ctx('orgOld'))); end $$;
reset role;

select pg_temp.as_owner();
select pg_temp.setting('billing_enforced', 'false');
select pg_temp.setting('billing_payments_active', 'false');

-- 1. Signup: born incomplete, online, with the period chosen
select pg_temp.act_as('00000000-0000-0000-0000-00000066a001');
set local role authenticated;
do $$ begin
  insert into _ctx (key, txt) values ('slug', dk_create_organization('Sabor de Sofía', 'fast_food', 'burgers', p_plan => 'standard', p_billing_period => 'annual'));
end $$;
reset role;
select pg_temp.as_owner();
insert into _ctx (key, id) values ('org', (select k.organization_id from dk_kitchens k where k.slug = (select txt from _ctx where key = 'slug')));
insert into _ctx (key, id) values ('k', (select k.id from dk_kitchens k where k.slug = (select txt from _ctx where key = 'slug')));
insert into dk_organization_members (organization_id, user_id, status) values (pg_temp.ctx('org'), '10000000-0000-0000-0000-00000066a002', 'active');
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id) values (pg_temp.ctx('k'), '10000000-0000-0000-0000-00000066a002', (select id from dk_roles where is_system and key = 'CASHIER'));
insert into _t (area, test, expected, got) values ('Registro', 'Nace sin pagar, en línea y con el período elegido', 'incomplete · online · annual · standard',
  (select status || ' · ' || billing_mode || ' · ' || billing_period || ' · ' || plan_key from dk_subscriptions where organization_id = pg_temp.ctx('org')));
insert into _t (area, test, expected, got) values ('Planes', 'Precio anual = 10 meses y sin prueba gratis', '499000 · 0',
  (select price_yearly::integer || ' · ' || trial_days from dk_plans where key = 'standard'));

-- 2. Switch off: the app works as before
select pg_temp.act_as('00000000-0000-0000-0000-00000066a002', pg_temp.ctx('k'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Interruptor', 'Sin bloqueo encendido, la caja entra', 'sí',
    case when dk_effective_role(pg_temp.ctx('k')) is not null then 'sí' else 'no' end);
end $$;
reset role;

-- 3. Switch on: blocked, except paying and the business data
select pg_temp.as_owner();
select pg_temp.setting('billing_enforced', 'true');
select pg_temp.act_as('00000000-0000-0000-0000-00000066a002', pg_temp.ctx('k'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Bloqueo', 'La caja no entra a la cuenta sin pago', 'sin acceso',
    case when dk_effective_role(pg_temp.ctx('k')) is null and dk_current_kitchen_id() is null then 'sin acceso' else 'CON ACCESO' end);
  insert into _t (area, test, expected, got) values ('Bloqueo', 'La caja ve que está bloqueada pero no puede pagar', 'bloqueada · no paga',
    (select case when (a ->> 'blocked')::boolean then 'bloqueada' else 'libre' end || ' · ' || case when (a ->> 'canPay')::boolean then 'paga' else 'no paga' end
     from jsonb_array_elements(dk_my_billing_access()) a where (a ->> 'organizationId')::uuid = pg_temp.ctx('org')));
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000066a001', pg_temp.ctx('k'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Bloqueo', 'La dueña tampoco opera, pero ve facturación y su negocio', 'sin cuenta · billing sí · usuarios no · negocio sí',
    case when dk_effective_role(pg_temp.ctx('k')) is null then 'sin cuenta' else 'CON CUENTA' end
    || ' · billing ' || case when dk_has_org_permission(pg_temp.ctx('org'), 'billing.manage') then 'sí' else 'no' end
    || ' · usuarios ' || case when dk_has_org_permission(pg_temp.ctx('org'), 'users.manage') then 'sí' else 'no' end
    || ' · negocio ' || case when dk_has_org_permission(pg_temp.ctx('org'), 'organization.manage') then 'sí' else 'no' end);
  begin perform dk_billing_checkout_start(pg_temp.ctx('org'));
    insert into _t (area, test, expected, got) values ('Checkout', 'Sin pagos activos no hay checkout', 'PAYMENTS_INACTIVE', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Checkout', 'Sin pagos activos no hay checkout', 'PAYMENTS_INACTIVE',
    case when sqlerrm like 'PAYMENTS_INACTIVE%' then 'PAYMENTS_INACTIVE' else sqlerrm end, sqlerrm); end;
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000066a003', pg_temp.ctx('kOld'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Bloqueo', 'Una organización de antes (exenta) sigue entrando', 'sí',
    case when dk_effective_role(pg_temp.ctx('kOld')) is not null then 'sí' else 'no' end);
end $$;
reset role;

-- 4. Checkout and Wompi's answer
select pg_temp.as_owner();
select pg_temp.setting('billing_payments_active', 'true');
select pg_temp.act_as('00000000-0000-0000-0000-00000066a002', pg_temp.ctx('k'));
set local role authenticated;
do $$ begin
  begin perform dk_billing_checkout_start(pg_temp.ctx('org'));
    insert into _t (area, test, expected, got) values ('Checkout', 'La caja no puede pagar', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Checkout', 'La caja no puede pagar', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000066a001');
set local role authenticated;
do $$ declare v jsonb; begin
  v := dk_billing_checkout_start(pg_temp.ctx('org'));
  insert into _ctx (key, txt) values ('ref1', v ->> 'reference');
  insert into _t (area, test, expected, got) values ('Checkout', 'Activación anual: monto de la base, referencia única y correo', 'activation · 49900000 · COP · sí · sofia.suscripcion@negocio.test',
    (v ->> 'kind') || ' · ' || (v ->> 'amountInCents') || ' · ' || (v ->> 'currency') || ' · '
    || case when (v ->> 'reference') ~ '^QNL-[A-Z0-9]+-0001-1$' then 'sí' else v ->> 'reference' end || ' · ' || (v ->> 'customerEmail'));
  v := dk_billing_checkout_start(pg_temp.ctx('org'));
  insert into _ctx (key, txt) values ('ref2', v ->> 'reference');
  insert into _t (area, test, expected, got) values ('Checkout', 'Otro intento: misma factura, otra referencia', 'sí',
    case when (v ->> 'reference') like '%-0001-2' then 'sí' else v ->> 'reference' end);
end $$;
reset role;

select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Wompi', 'Un monto distinto se registra y no se aplica', 'amount_mismatch · incomplete',
  (select dk_billing_apply_transaction((select txt from _ctx where key = 'ref1'), 'tx-falsa', 'APPROVED', 100, 'COP') ->> 'result')
  || ' · ' || (select status from dk_subscriptions where organization_id = pg_temp.ctx('org')));
insert into _t (area, test, expected, got) values ('Wompi', 'Rechazada: sigue sin pagar', 'declined · incomplete',
  (select dk_billing_apply_transaction((select txt from _ctx where key = 'ref2'), 'tx-2', 'DECLINED', 49900000, 'COP', 'CARD') ->> 'result')
  || ' · ' || (select status from dk_subscriptions where organization_id = pg_temp.ctx('org')));
select pg_temp.act_as('00000000-0000-0000-0000-00000066a001');
set local role authenticated;
do $$ begin insert into _ctx (key, txt) values ('ref3', dk_billing_checkout_start(pg_temp.ctx('org')) ->> 'reference'); end $$;
reset role;
select pg_temp.as_owner();
insert into _ctx (key, txt) values ('res3', dk_billing_apply_transaction((select txt from _ctx where key = 'ref3'), 'tx-3', 'APPROVED', 49900000, 'COP', 'PSE') ->> 'result');
-- (a separate statement: one statement does not see what the function it calls just wrote)
insert into _t (area, test, expected, got) values ('Wompi', 'Aprobada: activa por un año', 'approved · active · online · 1 año',
  (select txt from _ctx where key = 'res3')
  || ' · ' || (select status || ' · ' || billing_mode || ' · ' || case when current_period_end between now() + interval '364 days' and now() + interval '366 days' then '1 año' else current_period_end::text end
               from dk_subscriptions where organization_id = pg_temp.ctx('org')));
insert into _t (area, test, expected, got) values ('Wompi', 'El mismo evento otra vez no cambia nada', 'already_approved',
  dk_billing_apply_transaction((select txt from _ctx where key = 'ref3'), 'tx-3', 'APPROVED', 49900000, 'COP') ->> 'result');
insert into _t (area, test, expected, got) values ('Wompi', 'Factura pagada con su método', 'paid · PSE',
  (select status || ' · ' || method from dk_invoices where organization_id = pg_temp.ctx('org') and kind = 'activation'));

select pg_temp.act_as('00000000-0000-0000-0000-00000066a002', pg_temp.ctx('k'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Bloqueo', 'Pagado: la caja vuelve a entrar', 'sí',
    case when dk_effective_role(pg_temp.ctx('k')) is not null then 'sí' else 'no' end);
end $$;
reset role;

-- 5. Upgrade (prorated), downgrade scheduled for the renewal
select pg_temp.act_as('00000000-0000-0000-0000-00000066a001');
set local role authenticated;
do $$ declare v jsonb; begin
  v := dk_billing_checkout_start(pg_temp.ctx('org'), 'business', 'annual');
  insert into _ctx (key, txt) values ('refUp', v ->> 'reference');
  insert into _t (area, test, expected, got) values ('Cambio de plan', 'Subir a Business: la diferencia del año que queda', 'upgrade · ~500.000',
    (v ->> 'kind') || ' · ' || case when ((v ->> 'amountInCents')::bigint / 100) between 498000 and 500000 then '~500.000' else v ->> 'amountInCents' end);
end $$;
reset role;
select pg_temp.as_owner();
select dk_billing_apply_transaction((select txt from _ctx where key = 'refUp'),
  'tx-up', 'APPROVED', (select amount_in_cents from dk_billing_payments where reference = (select txt from _ctx where key = 'refUp')), 'COP');
insert into _t (area, test, expected, got) values ('Cambio de plan', 'Upgrade pagado: Business, mismo vencimiento', 'business · annual',
  (select plan_key || ' · ' || billing_period from dk_subscriptions where organization_id = pg_temp.ctx('org')));

select pg_temp.act_as('00000000-0000-0000-0000-00000066a001');
set local role authenticated;
do $$ begin
  perform dk_billing_schedule_change(pg_temp.ctx('org'), 'standard', 'monthly');
  insert into _t (area, test, expected, got) values ('Cambio de plan', 'Bajar a Standard mensual: al renovar', 'standard · monthly',
    (select (s -> 'pendingChange' ->> 'planKey') || ' · ' || (s -> 'pendingChange' ->> 'billingPeriod') from (select dk_my_subscription(pg_temp.ctx('org')) s) x));
end $$;
reset role;

-- 6. Renewal: invoice with the scheduled plan; the saved card is charged once per attempt
select pg_temp.as_owner();
update dk_subscriptions set current_period_end = now() + interval '2 days' where organization_id = pg_temp.ctx('org');
select dk_billing_tick();
insert into _t (area, test, expected, got) values ('Renovación', 'Factura de renovación con el plan programado, sin tarjeta: pago a mano', 'standard · monthly · 49900 · sin cobro automático',
  (select plan_key || ' · ' || billing_period || ' · ' || amount::integer || ' · ' || case when next_attempt_at is null then 'sin cobro automático' else 'automático' end
   from dk_invoices where organization_id = pg_temp.ctx('org') and kind = 'renewal' and status = 'open'));
select dk_billing_save_source(pg_temp.ctx('org'), '9911', 'Visa •••• 4242', 'sofia.suscripcion@negocio.test');
update dk_invoices set next_attempt_at = now() - interval '1 minute' where organization_id = pg_temp.ctx('org') and kind = 'renewal' and status = 'open';
insert into _t (area, test, expected, got) values ('Renovación', 'Cobro con la tarjeta guardada: una vez, aunque se llame dos veces', '1 · 0',
  jsonb_array_length(dk_billing_charges_due()) || ' · ' || jsonb_array_length(dk_billing_charges_due()));

-- The period ends without the payment: grace, then expired (blocked).
update dk_subscriptions set current_period_end = now() - interval '1 hour' where organization_id = pg_temp.ctx('org');
select dk_billing_tick();
insert into _t (area, test, expected, got) values ('Renovación', 'Vencido sin pago: gracia de 3 días, sigue con acceso', 'past_due · vigente',
  (select status from dk_subscriptions where organization_id = pg_temp.ctx('org')) || ' · ' || case when dk_subscription_is_current(pg_temp.ctx('org')) then 'vigente' else 'NO' end);
update dk_subscriptions set grace_ends_at = now() - interval '1 minute' where organization_id = pg_temp.ctx('org');
select dk_billing_tick();
insert into _t (area, test, expected, got) values ('Renovación', 'Sin pago al terminar la gracia: vencida y bloqueada', 'expired · bloqueada',
  (select status from dk_subscriptions where organization_id = pg_temp.ctx('org')) || ' · ' || case when dk_org_access_ok(pg_temp.ctx('org')) then 'LIBRE' else 'bloqueada' end);
-- Paying the renewal late reactivates it from the old period end.
insert into _ctx (key, txt) values ('resLate',
  (select dk_billing_apply_transaction(p.reference, 'tx-late', 'APPROVED', p.amount_in_cents, 'COP', 'CARD') ->> 'result'
   from dk_billing_payments p join dk_invoices i on i.id = p.invoice_id
   where i.organization_id = pg_temp.ctx('org') and i.kind = 'renewal' and p.status = 'pending' limit 1));
insert into _t (area, test, expected, got) values ('Renovación', 'Pagar tarde la renovación la reactiva desde el fin anterior', 'approved · active · standard · monthly',
  (select txt from _ctx where key = 'resLate')
  || ' · ' || (select status || ' · ' || plan_key || ' · ' || billing_period from dk_subscriptions where organization_id = pg_temp.ctx('org')));

-- 7. Cancel at the period end and resume
select pg_temp.act_as('00000000-0000-0000-0000-00000066a001');
set local role authenticated;
do $$ begin
  perform dk_billing_cancel(pg_temp.ctx('org'));
  insert into _t (area, test, expected, got) values ('Cancelación', 'Cancela al final del período y sigue vigente', 'sí · vigente',
    (select case when (s ->> 'cancelAtPeriodEnd')::boolean then 'sí' else 'no' end || ' · ' || case when (s ->> 'isCurrent')::boolean then 'vigente' else 'NO' end
     from (select dk_my_subscription(pg_temp.ctx('org')) s) x));
  perform dk_billing_resume(pg_temp.ctx('org'));
  insert into _t (area, test, expected, got) values ('Cancelación', 'Reactivar antes del fin', 'no',
    (select case when (s ->> 'cancelAtPeriodEnd')::boolean then 'sí' else 'no' end from (select dk_my_subscription(pg_temp.ctx('org')) s) x));
end $$;
reset role;

-- 8. Global Admin: transfer (Enterprise) and refund; only with MFA
select pg_temp.act_as('00000000-0000-0000-0000-00000066a004', null, 'aal1');
set local role authenticated;
do $$ begin
  begin perform dk_ga_record_transfer(pg_temp.ctx('orgOld'), 2499000, current_date, 'enterprise', 'annual');
    insert into _t (area, test, expected, got) values ('Admin', 'Sin segundo factor no registra pagos', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Admin', 'Sin segundo factor no registra pagos', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000066a004', null, 'aal2');
set local role authenticated;
do $$ declare v_inv uuid; begin
  perform dk_ga_set_billing_mode(pg_temp.ctx('orgOld'), 'manual');
  v_inv := dk_ga_record_transfer(pg_temp.ctx('orgOld'), 2499000, current_date, 'enterprise', 'annual', 'orgOld/soporte.pdf', 'Transferencia Bancolombia');
  insert into _t (area, test, expected, got) values ('Admin', 'Transferencia: factura pagada y año activo', 'paid · TRANSFER · active · manual',
    (select i.status || ' · ' || i.method from dk_invoices i where i.id = v_inv) || ' · '
    || (select status || ' · ' || billing_mode from dk_subscriptions where organization_id = pg_temp.ctx('orgOld')));
  perform dk_ga_record_refund(v_inv, 2499000, 'Devolución total');
  insert into _t (area, test, expected, got) values ('Admin', 'Reembolso total: factura anulada y suscripción cancelada', 'void · canceled',
    (select status from dk_invoices where id = v_inv) || ' · ' || (select status from dk_subscriptions where organization_id = pg_temp.ctx('orgOld')));
  insert into _t (area, test, expected, got) values ('Admin', 'El resumen de la plataforma', 'sí',
    case when dk_ga_billing_overview() ? 'counts' then 'sí' else 'no' end);
end $$;
reset role;

-- 9. Events: the same checksum only once
select pg_temp.as_owner();
insert into _ctx (key, txt) values ('ev1', dk_billing_record_event('chk-0066', 'transaction.updated', 'test', 'tx-9', 'QNL-X-0001-1', 'APPROVED', true, '{}')::text);
insert into _ctx (key, txt) values ('ev2', dk_billing_record_event('chk-0066', 'transaction.updated', 'test', 'tx-9', 'QNL-X-0001-1', 'APPROVED', true, '{}')::text);
select dk_billing_finish_event('chk-0066', 'approved');
insert into _ctx (key, txt) values ('ev3', dk_billing_record_event('chk-0066', 'transaction.updated', 'test', 'tx-9', 'QNL-X-0001-1', 'APPROVED', true, '{}')::text);
insert into _t (area, test, expected, got) values ('Eventos', 'Nuevo, reintento sin terminar, repetido ya procesado', 'true · true · false',
  (select string_agg(txt, ' · ' order by key) from _ctx where key in ('ev1', 'ev2', 'ev3')));

select area, test, expected, got, coalesce(detail, ''), case when expected = got then 'PASS' else 'FAIL' end as result from _t order by n;

rollback;
