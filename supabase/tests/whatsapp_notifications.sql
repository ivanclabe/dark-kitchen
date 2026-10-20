-- ADR 0055 (fase A): WhatsApp notices of order status — connection with Vault,
-- consent, the trigger on the status history, never twice, test mode, the
-- dispatcher's queue and Meta's receipts, permissions and isolation; the order
-- flow unchanged. Rolled-back transaction.
--
--   python3 supabase/tests/run.py whatsapp_notifications

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, v jsonb) on commit drop;
grant all on _t, _ctx to authenticated, anon, service_role;
grant usage on sequence _t_n_seq to authenticated, anon, service_role;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', (case when p_kitchen is null then '{}'::jsonb else jsonb_build_object('x-dk-kitchen-id', p_kitchen) end)::text, true);
$$;
create or replace function pg_temp.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role": "anon"}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return sqlerrm; end;
$$;
create or replace function pg_temp.blocked(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return 'blocked'; end;
$$;
grant execute on function pg_temp.k(text), pg_temp.err(text), pg_temp.blocked(text) to anon;


create or replace function pg_temp.v(p_key text) returns jsonb language sql as $$ select v from _ctx where key = p_key $$;
-- An order of the web menu of A (anon), as ADR 0052.
create or replace function pg_temp.web_order(p_phone text, p_opt_in boolean, p_fulfillment text default 'delivery', p_key text default null) returns jsonb language sql as $$
  select dk_public_place_order('wa-a-prueba', jsonb_build_object(
    'idempotencyKey', coalesce(p_key, gen_random_uuid()::text), 'customer', jsonb_build_object('name', 'Laura Gómez', 'phone', p_phone),
    'fulfillment', p_fulfillment, 'address', 'Calle 10 # 20-30', 'paymentMethod', 'Efectivo', 'whatsappOptIn', p_opt_in, 'privacyAccepted', true,
    'items', jsonb_build_array(jsonb_build_object('productId', '52000000-0000-0000-0000-000000055a01', 'quantity', 2))))
$$;
create or replace function pg_temp.order_id(p_number text) returns uuid language sql as $$
  select id from dk_orders where kitchen_id = (select id from _ctx where key = 'A') and order_number = p_number::integer
$$;
create or replace function pg_temp.notices(p_order uuid) returns text language sql as $$
  select coalesce(string_agg(event || ':' || status, ',' order by created_at), '-') from dk_wa_outbox where order_id = p_order
$$;
grant execute on function pg_temp.web_order(text, boolean, text, text), pg_temp.v(text) to anon;
grant execute on function pg_temp.k(text), pg_temp.v(text), pg_temp.err(text), pg_temp.blocked(text), pg_temp.notices(uuid), pg_temp.order_id(text) to service_role, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000055a01', 'duena.wa@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000055a02', 'cocina.wa@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000055a03', 'caja.wa@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-000000055a01', '00000000-0000-0000-0000-000000055a01', 'Dueña', true),
  ('10000000-0000-0000-0000-000000055a02', '00000000-0000-0000-0000-000000055a02', 'Cocina', true),
  ('10000000-0000-0000-0000-000000055a03', '00000000-0000-0000-0000-000000055a03', 'Caja', true);
insert into dk_organizations (slug, name, owner_user_id, sector, category) values ('grupo-wa', 'Grupo WA', '10000000-0000-0000-0000-000000055a01', 'fast_food', 'burgers');
insert into _ctx (key, id) values ('org', (select id from dk_organizations where slug = 'grupo-wa')),
  ('owner', '00000000-0000-0000-0000-000000055a01'), ('cook', '00000000-0000-0000-0000-000000055a02'), ('cashier', '00000000-0000-0000-0000-000000055a03');
select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('A', dk_create_kitchen('Sopas Wa', 'wa-a-prueba', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();
update dk_subscriptions set plan_key = 'business' where organization_id = pg_temp.k('org');
select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('B', dk_create_kitchen('Otra WA', 'wa-b-prueba', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
  select pg_temp.k('A'), '10000000-0000-0000-0000-000000055a02', id from dk_roles where is_system and key = 'KITCHEN';
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
  select pg_temp.k('A'), '10000000-0000-0000-0000-000000055a03', id from dk_roles where is_system and key = 'CASHIER';
insert into dk_products (id, kitchen_id, code, name, price, uses_inventory) values ('52000000-0000-0000-0000-000000055a01', pg_temp.k('A'), 'SOPA', 'Sopa', 6000, false);
insert into dk_menu_plan_items (kitchen_id, plan_date, product_id, display_order, is_active)
  values (pg_temp.k('A'), (now() at time zone 'America/Bogota')::date, '52000000-0000-0000-0000-000000055a01', 1, true);
insert into _ctx (key, v) values ('queue0', to_jsonb((select count(*) from net.http_request_queue)));

-- ---------------------------------------------------------------------------
-- 1. Catalog
-- ---------------------------------------------------------------------------
insert into _t (area, test, expected, got) values
  ('Catálogo', 'Permisos nuevos', 'integrations.manage,integrations.view,whatsapp.reply',
    (select string_agg(key, ',' order by key) from dk_permissions where key in ('integrations.view', 'integrations.manage', 'whatsapp.reply'))),
  ('Catálogo', 'Caja responde pero no configura', 'whatsapp.reply',
    (select string_agg(rp.permission_key, ',') from dk_role_permissions rp join dk_roles r on r.id = rp.role_id
     where r.is_system and r.key = 'CASHIER' and rp.permission_key in ('integrations.view', 'integrations.manage', 'whatsapp.reply'))),
  ('Catálogo', 'Función de avisos en los planes Business y Enterprise', 'business,enterprise',
    (select string_agg(plan_key, ',' order by plan_key) from dk_plan_features where feature_key = 'whatsapp_notifications'));

-- ---------------------------------------------------------------------------
-- 2. Connection: secrets in Vault, never out
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v jsonb;
begin
  perform dk_public_menu_settings_save('{"published": true, "ordersEnabled": true, "delivery": true, "pickup": true, "deliveryFee": 0, "minOrder": 0, "paymentMethods": ["Efectivo"], "autoConfirm": true}');
  v := dk_wa_connect('1098765432101', '2098765432101', 'EAAG-prueba-token-de-acceso-0123456789', 'secreto-de-la-app-meta');
  insert into _ctx (key, v) values ('verify', v);
  insert into _t (area, test, expected, got) values
    ('Conexión', 'Conectar devuelve un token de verificación nuevo', 'true', ((v ->> 'verifyToken') ~ '^qn_[0-9a-f]{36}$')::text),
    ('Conexión', 'La configuración dice qué hay, sin mostrar secretos', 'true · true · pending · false',
      (dk_wa_settings() #>> '{account,hasAccessToken}') || ' · ' || (dk_wa_settings() #>> '{account,hasAppSecret}') || ' · ' ||
      (dk_wa_settings() #>> '{account,status}') || ' · ' || (dk_wa_settings()::text like '%EAAG-prueba%' or dk_wa_settings()::text like '%secreto-de-la-app%')::text),
    ('Conexión', 'Siete avisos sugeridos; activos: confirmado, listo para recoger, en camino, cancelado', 'order_confirmed,order_ready_pickup,order_dispatched,order_cancelled',
      (select string_agg(t ->> 'event', ',') from jsonb_array_elements(dk_wa_settings() -> 'templates') t where (t ->> 'enabled')::boolean)),
    ('Conexión', 'El navegador no lee los ids de los secretos', 'blocked', pg_temp.blocked('select access_token_id from dk_wa_accounts')),
    ('Conexión', 'Ni el Vault', 'blocked', pg_temp.blocked('select decrypted_secret from vault.decrypted_secrets')),
    ('Conexión', 'Ni las funciones del servicio', 'blocked · blocked',
      pg_temp.blocked(format('select dk_wa_credentials(%L)', pg_temp.k('A'))) || ' · ' || pg_temp.blocked('select dk_wa_claim(5)')),
    ('Conexión', 'Identificadores inválidos', 'Revisa el Phone Number ID (solo números)', pg_temp.err($q$select dk_wa_connect('abc', '123456', 'x', 'y')$q$)),
    ('Conexión', 'Reconectar sin token conserva el guardado (y no da otro token de verificación)', 'null',
      coalesce(dk_wa_connect('1098765432101', '2098765432101', null, null) ->> 'verifyToken', 'null'));
end $$;
reset role;
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('B'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Conexión', 'Un número solo puede estar en una cuenta', 'Ese número ya está conectado a otra cuenta',
      pg_temp.err($q$select dk_wa_connect('1098765432101', '2098765432101', 'EAAG-otro-token-0123456789', 'otro')$q$)),
    ('Aislamiento', 'B no ve la conexión de A', 'null', coalesce(dk_wa_settings() ->> 'account', 'null'));
end $$;
reset role;
set local role service_role;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Servicio', 'El servicio lee el token para enviar', 'EAAG-prueba-token-de-acceso-0123456789', dk_wa_credentials(pg_temp.k('A')) ->> 'accessToken'),
    ('Servicio', 'El webhook verifica la suscripción solo con el token correcto', 'true · false',
      dk_wa_webhook_verify(pg_temp.v('verify') ->> 'verifyToken')::text || ' · ' || dk_wa_webhook_verify('qn_otro')::text),
    ('Servicio', 'El webhook conoce el App Secret del número', 'secreto-de-la-app-meta', dk_wa_webhook_account('1098765432101') ->> 'appSecret');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Status changes → notices (only when connected, with consent, never twice)
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
set local role anon;
do $$ begin insert into _ctx (key, v) values ('o0', pg_temp.web_order('+573001110000', true)); end $$;
reset role;
insert into _t (area, test, expected, got) values
  ('Avisos', 'Sin conexión verificada no se encola nada', '-', pg_temp.notices(pg_temp.order_id(pg_temp.v('o0') ->> 'orderNumber')));

set local role service_role;
select dk_wa_record_check(pg_temp.k('A'), true, '{"displayPhone": "+57 300 555 0000", "verifiedName": "Sopas Wa"}', null);
reset role;
select pg_temp.as_anon();
set local role anon;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Menú público', 'Con WhatsApp conectado, la página ofrece aceptar avisos', 'true', dk_public_menu('wa-a-prueba') #>> '{ordering,whatsappNotices}');
end $$;
reset role;

select pg_temp.as_anon();
set local role anon;
do $$ begin
  insert into _ctx (key, v) values ('o1', pg_temp.web_order('+573001110001', false));
  insert into _ctx (key, v) values ('o2', pg_temp.web_order('+573001110002', true));
end $$;
reset role;
insert into _t (area, test, expected, got) values
  ('Consentimiento', 'Sin aceptar avisos: no se envía (queda registrado por qué)', 'order_confirmed:skipped · El cliente no aceptó avisos por WhatsApp',
    pg_temp.notices(pg_temp.order_id(pg_temp.v('o1') ->> 'orderNumber')) || ' · ' ||
    (select last_error from dk_wa_outbox where order_id = pg_temp.order_id(pg_temp.v('o1') ->> 'orderNumber'))),
  ('Consentimiento', 'Aceptó en el menú web: queda en su ficha', 'true · web',
    (select whatsapp_opt_in::text || ' · ' || whatsapp_opt_in_source from dk_customers where phone = '+573001110002')),
  ('Modo prueba', 'En modo prueba, un número no autorizado no recibe', 'order_confirmed:skipped · Modo prueba: este número no está autorizado',
    pg_temp.notices(pg_temp.order_id(pg_temp.v('o2') ->> 'orderNumber')) || ' · ' ||
    (select last_error from dk_wa_outbox where order_id = pg_temp.order_id(pg_temp.v('o2') ->> 'orderNumber')));

select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
select dk_wa_save_settings('{"testRecipients": ["+57 300 111 0003", "3001110004", "no-es-numero"]}');
do $$ begin
  insert into _t (area, test, expected, got) values ('Modo prueba', 'Números autorizados, normalizados', '+573001110003,+573001110004',
    (select string_agg(x, ',' order by x) from jsonb_array_elements_text(dk_wa_settings() #> '{account,testRecipients}') x));
end $$;
reset role;

select pg_temp.as_anon();
set local role anon;
do $$ begin
  insert into _ctx (key, v) values ('w3', pg_temp.web_order('+573001110003', true, 'delivery'));
  insert into _ctx (key, v) values ('w4', pg_temp.web_order('+573001110004', true, 'pickup'));
end $$;
reset role;
insert into _ctx (key, id) values ('o3', pg_temp.order_id(pg_temp.v('w3') ->> 'orderNumber')), ('o4', pg_temp.order_id(pg_temp.v('w4') ->> 'orderNumber'));
insert into _t (area, test, expected, got) values
  ('Avisos', 'Confirmado (autoconfirmación del menú web): en cola', 'order_confirmed:queued', pg_temp.notices(pg_temp.k('o3'))),
  ('Avisos', 'Con plantilla, variables y enlace de seguimiento', 'quanela_pedido_confirmado · Laura · Sopas Wa · true',
    (select (payload ->> 'template') || ' · ' || (payload #>> '{vars,customer_name}') || ' · ' || (payload #>> '{vars,business_name}') || ' · ' ||
            ((payload #>> '{vars,tracking_path}') = '/menu/wa-a-prueba/pedido/' || (select public_token from dk_orders where id = pg_temp.k('o3')))::text
     from dk_wa_outbox where order_id = pg_temp.k('o3'))),
  ('Avisos', 'pg_net despierta al despachador (después del commit)', 'true',
    ((select count(*) from net.http_request_queue where url like '%/dk-whatsapp-dispatch') > 0)::text);

-- Kitchen: preparing (off by default) → ready for pickup (on) → back and forth (never twice) → picked up (off).
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_item uuid := (select id from dk_order_items where order_id = pg_temp.k('o4'));
begin
  perform dk_advance_kitchen_item(v_item);
  perform dk_advance_kitchen_item(v_item);
  perform dk_revert_kitchen_item(v_item);
  perform dk_advance_kitchen_item(v_item);
  perform dk_mark_picked_up(pg_temp.k('o4'));
  perform dk_cancel_order(pg_temp.k('o3'), 'Nos quedamos sin gas');
end $$;
reset role;
insert into _t (area, test, expected, got) values
  ('Avisos', 'Recoger: confirmado y listo para recoger, una sola vez aunque cocina corrija', 'order_confirmed:queued,order_ready_pickup:queued',
    pg_temp.notices(pg_temp.k('o4'))),
  ('Avisos', 'Cancelado, con el motivo', 'order_confirmed:queued,order_cancelled:queued · Nos quedamos sin gas',
    pg_temp.notices(pg_temp.k('o3')) || ' · ' || (select payload #>> '{vars,reason}' from dk_wa_outbox where order_id = pg_temp.k('o3') and event = 'order_cancelled')),
  ('Pedidos', 'El flujo de pedidos no cambió', 'ENTREGADO · CANCELADO',
    (select status::text from dk_orders where id = pg_temp.k('o4')) || ' · ' || (select status::text from dk_orders where id = pg_temp.k('o3')));

-- A manual order of a customer who accepted on the web; then she opts out and a disabled notice is not sent.

insert into dk_orders (id, kitchen_id, customer_id, channel) values
  ('40000000-0000-0000-0000-000000055a01', pg_temp.k('A'), (select id from dk_customers where phone = '+573001110004'), 'MANUAL');
insert into dk_order_items (order_id, product_id, quantity, unit_price) values ('40000000-0000-0000-0000-000000055a01', '52000000-0000-0000-0000-000000055a01', 1, 6000);
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_confirm_order('40000000-0000-0000-0000-000000055a01');
  insert into _t (area, test, expected, got) values
    ('Seguimiento', 'Un pedido de mostrador avisado recibe código de seguimiento', 'order_confirmed:queued · true',
      pg_temp.notices('40000000-0000-0000-0000-000000055a01') || ' · ' ||
      ((select public_token from dk_orders where id = '40000000-0000-0000-0000-000000055a01') is not null)::text);
  perform dk_customer_set_whatsapp_opt_in((select id from dk_customers where phone = '+573001110004'), false);
  insert into _ctx (key, id) values ('manualToken', (select public_token from dk_orders where id = '40000000-0000-0000-0000-000000055a01'));
  perform dk_wa_save_template('order_cancelled', false);
  perform dk_cancel_order('40000000-0000-0000-0000-000000055a01', 'prueba');
  insert into _t (area, test, expected, got) values
    ('Consentimiento', 'Aviso apagado: nada; baja del cliente: registrada', 'order_confirmed:queued · true',
      pg_temp.notices('40000000-0000-0000-0000-000000055a01') || ' · ' ||
      ((select whatsapp_opt_out_at from dk_customers where phone = '+573001110004') is not null)::text);
end $$;
reset role;
select pg_temp.as_anon();
set local role anon;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Seguimiento', 'El cliente sigue el pedido de mostrador con su código', 'true',
      coalesce(dk_public_order_status(pg_temp.k('manualToken')) ->> 'found', 'false')),
    ('Pedidos', 'El menú web sigue sin mostrar ids internos', 'false', (pg_temp.web_order('+573001110009', false) ? 'orderId')::text);
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. The dispatcher and the delivery receipts (service role)
-- ---------------------------------------------------------------------------
set local role service_role;
do $$
declare
  v jsonb := dk_wa_claim(50);
  v_first uuid;
begin
  insert into _t (area, test, expected, got) values
    ('Despacho', 'Toma lo que está en cola, con la credencial', '5 · EAAG-prueba-token-de-acceso-0123456789 · test',
      jsonb_array_length(v)::text || ' · ' || (v #>> '{0,accessToken}') || ' · ' || (v #>> '{0,mode}')),
    ('Despacho', 'Lo tomado queda «enviando» (otro despachador no lo repite)', '0', jsonb_array_length(dk_wa_claim(50))::text);
  v_first := (select id from dk_wa_outbox where order_id = pg_temp.k('o3') and event = 'order_confirmed');
  perform dk_wa_mark(v_first, true, 'wamid.PRUEBA1');
  perform dk_wa_apply_status('1098765432101', 'wamid.PRUEBA1', 'delivered', now());
  perform dk_wa_apply_status('1098765432101', 'wamid.PRUEBA1', 'sent', now());
  insert into _t (area, test, expected, got) values
    ('Recibos', 'Enviado → entregado; un recibo atrasado no lo devuelve', 'delivered', (select status from dk_wa_outbox where id = v_first));
  perform dk_wa_apply_status('1098765432101', 'wamid.PRUEBA1', 'read', now());
  insert into _t (area, test, expected, got) values
    ('Recibos', 'Leído', 'read · true', (select status || ' · ' || (read_at is not null)::text from dk_wa_outbox where id = v_first)),
    ('Recibos', 'Un número que no es de una cuenta se ignora', 'false', dk_wa_apply_status('999', 'wamid.PRUEBA1', 'read', now())::text);

  v_first := (select id from dk_wa_outbox where order_id = pg_temp.k('o3') and event = 'order_cancelled');
  perform dk_wa_mark(v_first, false, null, 'Meta 500', '1', true);
  insert into _t (area, test, expected, got) values
    ('Reintentos', 'Error pasajero: vuelve a la cola, más tarde', 'queued · true',
      (select status || ' · ' || (next_attempt_at > now())::text from dk_wa_outbox where id = v_first));
  update dk_wa_outbox set attempts = 5 where id = v_first;
  perform dk_wa_mark(v_first, false, null, 'Meta 500', '1', true);
  v_first := (select id from dk_wa_outbox where order_id = pg_temp.k('o4') and event = 'order_ready_pickup');
  perform dk_wa_mark(v_first, false, null, '(#131026) Message undeliverable', '131026', false);
  insert into _t (area, test, expected, got) values
    ('Reintentos', 'Tras 5 intentos, o un error definitivo: fallido con el código de Meta', 'failed · failed · 131026',
      (select status from dk_wa_outbox where order_id = pg_temp.k('o3') and event = 'order_cancelled') || ' · ' ||
      (select status || ' · ' || error_code from dk_wa_outbox where id = v_first));
  insert into _ctx (key, id) values ('failed', v_first);
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. What the account does: retry, test send; permissions and isolation; disconnect
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_wa_retry(pg_temp.k('failed'));
  insert into _t (area, test, expected, got) values
    ('Registro', 'Reintentar un fallido lo vuelve a poner en cola', 'queued', (select status from dk_wa_outbox where id = pg_temp.k('failed'))),
    ('Registro', 'El registro se lee por la tabla (RLS)', '8', (select count(*)::text from dk_wa_outbox)),
    ('Prueba', 'Prueba a un número no autorizado: rechazada', 'En modo prueba solo se envía a los números autorizados',
      pg_temp.err($q$select dk_wa_send_test('order_confirmed', '+573009999999')$q$)),
    ('Prueba', 'Prueba a un no autorizado (repetida): rechazada', 'blocked', pg_temp.blocked($q$select dk_wa_send_test('order_confirmed', '+573009999998')$q$));
  insert into _ctx (key, id) values ('test', dk_wa_send_test('order_confirmed', '+573001110003'));
  insert into _t (area, test, expected, got) values
    ('Prueba', 'Prueba a un autorizado: en cola, marcada como prueba', 'queued · true',
      (select status || ' · ' || (payload ->> 'test') from dk_wa_outbox where id = pg_temp.k('test')));
end $$;
reset role;
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('B'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Aislamiento', 'B no ve los avisos de A', '0', (select count(*)::text from dk_wa_outbox));
end $$;
reset role;
select pg_temp.act_as(pg_temp.k('cook'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Permisos', 'Cocina: ni configuración ni registro', 'blocked · 0', pg_temp.blocked('select dk_wa_settings()') || ' · ' || (select count(*)::text from dk_wa_outbox));
end $$;
reset role;
select pg_temp.act_as(pg_temp.k('cashier'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Permisos', 'Caja: no conecta, no cambia avisos, no desconecta', 'blocked · blocked · blocked',
      pg_temp.blocked($q$select dk_wa_connect('1', '2', 'x', 'y')$q$) || ' · ' || pg_temp.blocked($q$select dk_wa_save_template('order_confirmed', false)$q$) || ' · ' ||
      pg_temp.blocked('select dk_wa_disconnect()'));
end $$;
reset role;
select pg_temp.as_anon();
set local role anon;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Permisos', 'Un anónimo no toca nada', 'blocked · blocked', pg_temp.blocked('select dk_wa_settings()') || ' · ' || pg_temp.blocked('select dk_wa_webhook_verify(''x'')'));
end $$;
reset role;

select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
select dk_wa_disconnect();
reset role;
insert into _t (area, test, expected, got) values
  ('Desconectar', 'Desconectar borra los secretos del Vault y deja de enviar lo pendiente', '0 · 0',
    (select count(*)::text from vault.secrets where name like 'dk_wa_%' || pg_temp.k('A')::text) || ' · ' ||
    (select count(*)::text from dk_wa_outbox where kitchen_id = pg_temp.k('A') and status in ('queued', 'sending')));

insert into _t (area, test, expected, got) values
  ('Plantillas', 'Ninguna sugerida empieza o termina con una variable (regla de Meta)', '0',
    (select count(*)::text from dk_wa_template_catalog() c where c.body ~ '^\{\{' or c.body ~ '\}\}$')),
  ('Plantillas', 'Las variables de cada plantilla coinciden con sus parámetros', '0',
    (select count(*)::text from dk_wa_template_catalog() c
     where (select count(*) from regexp_matches(c.body, '\{\{[0-9]+\}\}', 'g')) <> cardinality(c.params)));
select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
