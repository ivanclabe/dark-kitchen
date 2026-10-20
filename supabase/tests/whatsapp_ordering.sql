-- ADR 0055 (fase B): orders by WhatsApp and n8n — the assistant's own AI budget,
-- inbound messages and conversations, BAJA/ALTA, the order from a conversation
-- (the web core, channel WHATSAPP, idempotent), the inbox and the 24 h window,
-- n8n's signed events and RPCs, isolation and service-only functions.
-- Rolled-back transaction.
--
--   python3 supabase/tests/run.py whatsapp_ordering

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
  select dk_public_place_order('wb-a-prueba', jsonb_build_object(
    'idempotencyKey', coalesce(p_key, gen_random_uuid()::text), 'customer', jsonb_build_object('name', 'Laura Gómez', 'phone', p_phone),
    'fulfillment', p_fulfillment, 'address', 'Calle 10 # 20-30', 'paymentMethod', 'Efectivo', 'whatsappOptIn', p_opt_in, 'privacyAccepted', true,
    'items', jsonb_build_array(jsonb_build_object('productId', '52000000-0000-0000-0000-000000056a01', 'quantity', 2))))
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
  ('00000000-0000-0000-0000-000000056a01', 'duena.wb@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000056a02', 'cocina.wb@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000056a03', 'caja.wb@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-000000056a01', '00000000-0000-0000-0000-000000056a01', 'Dueña', true),
  ('10000000-0000-0000-0000-000000056a02', '00000000-0000-0000-0000-000000056a02', 'Cocina', true),
  ('10000000-0000-0000-0000-000000056a03', '00000000-0000-0000-0000-000000056a03', 'Caja', true);
insert into dk_organizations (slug, name, owner_user_id, sector, category) values ('grupo-wb', 'Grupo WB', '10000000-0000-0000-0000-000000056a01', 'fast_food', 'burgers');
insert into _ctx (key, id) values ('org', (select id from dk_organizations where slug = 'grupo-wb')),
  ('owner', '00000000-0000-0000-0000-000000056a01'), ('cook', '00000000-0000-0000-0000-000000056a02'), ('cashier', '00000000-0000-0000-0000-000000056a03');
select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('A', dk_create_kitchen('Sopas Wb', 'wb-a-prueba', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();
update dk_subscriptions set plan_key = 'business' where organization_id = pg_temp.k('org');
select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('B', dk_create_kitchen('Otra WB', 'wb-b-prueba', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
  select pg_temp.k('A'), '10000000-0000-0000-0000-000000056a02', id from dk_roles where is_system and key = 'KITCHEN';
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
  select pg_temp.k('A'), '10000000-0000-0000-0000-000000056a03', id from dk_roles where is_system and key = 'CASHIER';
insert into dk_products (id, kitchen_id, code, name, price, uses_inventory) values ('52000000-0000-0000-0000-000000056a01', pg_temp.k('A'), 'SOPA', 'Sopa', 6000, false);
insert into dk_menu_plan_items (kitchen_id, plan_date, product_id, display_order, is_active)
  values (pg_temp.k('A'), (now() at time zone 'America/Bogota')::date, '52000000-0000-0000-0000-000000056a01', 1, true);
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
  v := dk_wa_connect('1098765432201', '2098765432201', 'EAAG-prueba-token-de-acceso-0123456789', 'secreto-de-la-app-meta');
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
      coalesce(dk_wa_connect('1098765432201', '2098765432201', null, null) ->> 'verifyToken', 'null'));
end $$;
reset role;
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('B'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Conexión', 'Un número solo puede estar en una cuenta', 'Ese número ya está conectado a otra cuenta',
      pg_temp.err($q$select dk_wa_connect('1098765432201', '2098765432201', 'EAAG-otro-token-0123456789', 'otro')$q$)),
    ('Aislamiento', 'B no ve la conexión de A', 'null', coalesce(dk_wa_settings() ->> 'account', 'null'));
end $$;
reset role;
set local role service_role;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Servicio', 'El servicio lee el token para enviar', 'EAAG-prueba-token-de-acceso-0123456789', dk_wa_credentials(pg_temp.k('A')) ->> 'accessToken'),
    ('Servicio', 'El webhook verifica la suscripción solo con el token correcto', 'true · false',
      dk_wa_webhook_verify(pg_temp.v('verify') ->> 'verifyToken')::text || ' · ' || dk_wa_webhook_verify('qn_otro')::text),
    ('Servicio', 'El webhook conoce el App Secret del número', 'secreto-de-la-app-meta', dk_wa_webhook_account('1098765432201') ->> 'appSecret');
end $$;
reset role;


set local role service_role;
select dk_wa_record_check(pg_temp.k('A'), true, '{"verifiedName": "Sopas Wb"}', null);
reset role;

-- ---------------------------------------------------------------------------
-- 1. The AI function and its own budget
-- ---------------------------------------------------------------------------
insert into _t (area, test, expected, got) values
  ('Catálogo', 'Pedidos por WhatsApp con IA: Haiku 5.5, en Business y Enterprise', 'claude-haiku-5-5 · business,enterprise',
    (select model_key from dk_features where key = 'whatsapp_ordering') || ' · ' ||
    (select string_agg(plan_key, ',' order by plan_key) from dk_plan_features where feature_key = 'whatsapp_ordering'));
insert into dk_ai_insights (kitchen_id, feature_key, status, input, created_at)
select pg_temp.k('A'), 'whatsapp_ordering', 'ok', jsonb_build_object('conversationId', '70000000-0000-0000-0000-000000056a01'), now() - interval '1 minute'
from generate_series(1, 60);
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Cupo', '60 turnos de WhatsApp no gastan el cupo de los análisis', 'true', (dk_ai_run_allowed('menu_designer') ->> 'allowed'));
end $$;
reset role;
set local role service_role;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Cupo', 'Una conversación muy activa se frena (20 turnos en 10 min)', 'conversation',
      dk_ai_run_reserve_system(pg_temp.k('A'), '70000000-0000-0000-0000-000000056a01') ->> 'reason'),
    ('Cupo', 'Otra conversación sigue', 'true · claude-haiku-5-5',
      (select (v ->> 'allowed') || ' · ' || (v ->> 'model') from (select dk_ai_run_reserve_system(pg_temp.k('A'), gen_random_uuid()) v) x));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. Inbound messages → conversations
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
set local role anon;
do $$ begin insert into _ctx (key, v) values ('w1', pg_temp.web_order('+573001110003', true)); end $$;
reset role;
set local role service_role;
do $$
declare v jsonb;
begin
  v := dk_wa_receive('1098765432201', 'wamid.IN1', '573001110003', 'Laura', now(), 'text', 'Hola, quiero 2 sopas');
  insert into _ctx (key, id) values ('conv', (v ->> 'conversationId')::uuid);
  insert into _t (area, test, expected, got) values
    ('Entrantes', 'Un mensaje crea la conversación (cliente reconocido por su número)', 'off · bot · true',
      (v ->> 'mode') || ' · ' || (v ->> 'conversationStatus') || ' · ' || ((select customer_id from dk_wa_conversations where id = pg_temp.k('conv')) is not null)::text),
    ('Entrantes', 'El mismo mensaje dos veces no se duplica', 'true', dk_wa_receive('1098765432201', 'wamid.IN1', '573001110003', 'Laura', now(), 'text', 'Hola') ->> 'duplicate'),
    ('Entrantes', 'Un número que no es de una cuenta se ignora', 'true', dk_wa_receive('999999', 'wamid.X', '573001110003', null, now(), 'text', 'Hola') ->> 'ignored'),
    ('Entrantes', 'Sin asistente, la conversación espera a una persona', 'true · Mensaje nuevo',
      (select needs_attention::text || ' · ' || attention_reason from dk_wa_conversations where id = pg_temp.k('conv')));
  v := dk_wa_receive('1098765432201', 'wamid.IN2', '+57 300 111 0003', 'Laura', now(), 'text', 'baja.');
  insert into _t (area, test, expected, got) values
    ('Consentimiento', '«BAJA» da de baja al instante y se le confirma', 'opt_out · true · text:queued',
      (v ->> 'handled') || ' · ' || ((select whatsapp_opt_out_at from dk_customers where phone = '+573001110003') is not null)::text || ' · ' ||
      (select kind || ':' || status from dk_wa_outbox where event = 'reply' and recipient = '+573001110003' order by created_at desc limit 1));
  v := dk_wa_receive('1098765432201', 'wamid.IN3', '573001110003', 'Laura', now(), 'text', 'ALTA');
  insert into _t (area, test, expected, got) values
    ('Consentimiento', '«ALTA» la vuelve a suscribir', 'opt_in · true · whatsapp',
      (v ->> 'handled') || ' · ' || (select (whatsapp_opt_in and whatsapp_opt_out_at is null)::text || ' · ' || whatsapp_opt_in_source from dk_customers where phone = '+573001110003'));
  v := dk_wa_ai_context(pg_temp.k('conv'));
  insert into _t (area, test, expected, got) values
    ('Contexto', 'El asistente recibe el menú real de hoy (con su precio, que usa el código)', 'Sopa · 6000 · available',
      (v #>> '{menu,0,name}') || ' · ' || (v #>> '{menu,0,price}') || ' · ' || (v #>> '{menu,0,availability}')),
    ('Contexto', 'Y la conversación hasta ahora (3 del cliente, 2 respuestas)', '5', jsonb_array_length(v -> 'history')::text),
    ('Contexto', 'Y las reglas de pedido del negocio', 'true · true · Efectivo',
      (v #>> '{ordering,delivery}') || ' · ' || (v #>> '{ordering,pickup}') || ' · ' || (v #>> '{ordering,paymentMethods,0}'));
end $$;
reset role;

select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
select dk_wa_save_settings('{"testRecipients": ["+573001110003"]}');
reset role;

-- ---------------------------------------------------------------------------
-- 3. The order from the conversation: the web core, channel WHATSAPP, idempotent
-- ---------------------------------------------------------------------------
set local role service_role;
do $$
declare v jsonb;
begin
  v := dk_wa_place_order(pg_temp.k('conv'), '{"fulfillment": "pickup", "paymentMethod": "Efectivo", "items": [{"productId": "52000000-0000-0000-0000-000000056a01", "quantity": 2, "note": "sin cilantro"}]}', 'wamid.IN1');
  insert into _ctx (key, v) values ('wo', v);
  insert into _t (area, test, expected, got) values
    ('Pedido', 'Pedido por WhatsApp: total del servidor, confirmado a cocina', '12000 · true · false', (v ->> 'total') || ' · ' || (v ->> 'confirmed') || ' · ' || (v ->> 'repeated')),
    ('Pedido', 'Canal WhatsApp, del cliente del número, con su nota', 'WHATSAPP · +573001110003 · sin cilantro',
      (select o.channel::text || ' · ' || c.phone || ' · ' || i.observation from dk_orders o join dk_customers c on c.id = o.customer_id join dk_order_items i on i.order_id = o.id
       where o.id = (v ->> 'orderId')::uuid)),
    ('Pedido', 'El mismo «sí» dos veces: el mismo pedido', 'true · 1',
      (dk_wa_place_order(pg_temp.k('conv'), '{"fulfillment": "pickup", "paymentMethod": "Efectivo", "items": [{"productId": "52000000-0000-0000-0000-000000056a01", "quantity": 2}]}', 'wamid.IN1') ->> 'repeated') || ' · ' ||
      (select count(*)::text from dk_orders where channel = 'WHATSAPP' and external_reference = 'wamid.IN1')),
    ('Pedido', 'El pedido repetido responde con su total real', '12000',
      (dk_wa_place_order(pg_temp.k('conv'), '{"fulfillment": "pickup", "paymentMethod": "Efectivo", "items": []}', 'wamid.IN1') ->> 'total')),
    ('Pedido', 'La conversación recuerda su pedido', 'true', ((select last_order_id from dk_wa_conversations where id = pg_temp.k('conv')) = (v ->> 'orderId')::uuid)::text),
    ('Pedido', 'Un plato que no está hoy: rechazado por la base', 'Un plato ya no está en el menú de hoy',
      pg_temp.err(format($q$select dk_wa_place_order(%L, '{"fulfillment": "pickup", "paymentMethod": "Efectivo", "items": [{"productId": "52000000-0000-0000-0000-000000056a09", "quantity": 1}]}', 'wamid.IN9')$q$, pg_temp.k('conv')))),
    ('Avisos', 'Y el aviso «confirmado» de WhatsApp salió solo', 'order_confirmed:queued',
      (select event || ':' || status from dk_wa_outbox where order_id = (v ->> 'orderId')::uuid and kind = 'template'));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. The inbox (people) and the 24 h window
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('cashier'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_wa_send_text(pg_temp.k('conv'), 'Hola Laura, ya está tu pedido');
  insert into _t (area, test, expected, got) values
    ('Bandeja', 'Caja responde: el mensaje sale y la conversación queda con una persona', 'staff · human · false · 0',
      (select author from dk_wa_messages where conversation_id = pg_temp.k('conv') order by created_at desc limit 1) || ' · ' ||
      (select status || ' · ' || needs_attention::text || ' · ' || unread from dk_wa_conversations where id = pg_temp.k('conv'))),
    ('Bandeja', 'Caja ve la conversación (sin ver la configuración)', '1 · blocked',
      (select count(*)::text from dk_wa_conversations) || ' · ' || pg_temp.blocked($q$select dk_wa_save_settings('{"orderingMode": "ai"}')$q$));
  perform dk_wa_set_conversation(pg_temp.k('conv'), 'bot');
  insert into _t (area, test, expected, got) values ('Bandeja', 'Devolver al asistente', 'bot', (select status from dk_wa_conversations where id = pg_temp.k('conv')));
end $$;
reset role;
update dk_wa_conversations set last_inbound_at = now() - interval '25 hours' where id = pg_temp.k('conv');
select pg_temp.act_as(pg_temp.k('cashier'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Ventana', 'Después de 24 h sin mensajes del cliente no se puede escribir texto libre', 'Pasaron más de 24 horas desde el último mensaje del cliente: solo se puede enviar una plantilla',
      pg_temp.err(format($q$select dk_wa_send_text(%L, 'Hola')$q$, pg_temp.k('conv'))));
end $$;
reset role;
select pg_temp.act_as(pg_temp.k('cook'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Permisos', 'Cocina no ve ni responde conversaciones', '0 · blocked',
      (select count(*)::text from dk_wa_conversations) || ' · ' || pg_temp.blocked(format($q$select dk_wa_send_text(%L, 'x')$q$, pg_temp.k('conv'))));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. n8n: endpoint, signed events, its own RPCs
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v jsonb;
begin
  v := dk_integration_save_endpoint('https://n8n.ejemplo.co/webhook/quanela');
  insert into _ctx (key, v) values ('n8n', v);
  insert into _t (area, test, expected, got) values
    ('n8n', 'Guardar la URL crea el secreto de firma (se muestra una vez)', 'true · null',
      ((v ->> 'secret') ~ '^qns_[0-9a-f]{48}$')::text || ' · ' || coalesce(dk_integration_save_endpoint('https://n8n.ejemplo.co/webhook/quanela2') ->> 'secret', 'null'));
  insert into _t (area, test, expected, got) values
    ('n8n', 'La configuración muestra el endpoint sin el secreto', 'https://n8n.ejemplo.co/webhook/quanela2 · false',
      (dk_wa_settings() #>> '{endpoint,url}') || ' · ' || (dk_wa_settings()::text like '%' || (v ->> 'secret') || '%')::text),
    ('n8n', 'El navegador no lee el id del secreto', 'blocked', pg_temp.blocked('select secret_id from dk_integration_endpoints')),
    ('n8n', 'URL inválida', 'Revisa la URL del webhook de n8n', pg_temp.err($q$select dk_integration_save_endpoint('ftp://x')$q$));
  perform dk_wa_save_settings('{"orderingMode": "n8n"}');
  insert into _t (area, test, expected, got) values ('n8n', 'Modo de pedidos: n8n', 'n8n', dk_wa_settings() #>> '{account,orderingMode}');
end $$;
reset role;

-- A status change and a message reach n8n as signed events (through the outbox).
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin perform dk_cancel_order((pg_temp.v('wo') ->> 'orderId')::uuid, 'Sin gas'); end $$;
reset role;
set local role service_role;
do $$
declare v jsonb;
begin
  v := dk_wa_receive('1098765432201', 'wamid.IN4', '573001110003', 'Laura', now(), 'text', 'Quiero otra sopa');
  insert into _t (area, test, expected, got) values
    ('n8n', 'En modo n8n el mensaje no espera a una persona: va a n8n', 'n8n · false',
      (v ->> 'mode') || ' · ' || (select needs_attention::text from dk_wa_conversations where id = pg_temp.k('conv'))),
    ('n8n', 'Eventos en cola para n8n: el cambio de estado y el mensaje', 'webhook:order.status_changed:CANCELADO,webhook:whatsapp.message.received',
      (select string_agg(event, ',' order by created_at) from dk_wa_outbox where kind = 'webhook' and kitchen_id = pg_temp.k('A'))),
    ('n8n', 'El evento lleva lo necesario (pedido, estado, cliente)', 'order.status_changed · CANCELADO · Sin gas · +573001110003',
      (select (payload #>> '{body,event}') || ' · ' || (payload #>> '{body,data,status}') || ' · ' || (payload #>> '{body,data,note}') || ' · ' || (payload #>> '{body,data,customer,phone}')
       from dk_wa_outbox where event = 'webhook:order.status_changed:CANCELADO'));
  v := dk_wa_claim(50);
  insert into _t (area, test, expected, got) values
    ('n8n', 'El despachador recibe la URL y el secreto para firmar', 'https://n8n.ejemplo.co/webhook/quanela2 · true',
      (select x ->> 'url' from jsonb_array_elements(v) x where x ->> 'kind' = 'webhook' limit 1) || ' · ' ||
      ((select x ->> 'secret' from jsonb_array_elements(v) x where x ->> 'kind' = 'webhook' limit 1) = pg_temp.v('n8n') ->> 'secret')::text);
  perform dk_wa_mark((select id from dk_wa_outbox where event = 'webhook:whatsapp.message.received' limit 1), true, null, null, '200');
  perform dk_wa_mark((select id from dk_wa_outbox where event = 'webhook:order.status_changed:CANCELADO'), false, null, 'HTTP 404', '404', false);
  insert into _t (area, test, expected, got) values
    ('n8n', 'Entregado a n8n; un 404 queda fallido y se ve en el endpoint', 'delivered · failed · 404',
      (select status from dk_wa_outbox where event = 'webhook:whatsapp.message.received' limit 1) || ' · ' ||
      (select status from dk_wa_outbox where event = 'webhook:order.status_changed:CANCELADO') || ' · ' ||
      (select last_status::text from dk_integration_endpoints where kitchen_id = pg_temp.k('A')));
end $$;
reset role;

-- n8n (its Caja user) orders and answers with the same rules.
select pg_temp.act_as(pg_temp.k('cashier'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v jsonb;
begin
  v := dk_wa_place_order_for(pg_temp.k('conv'), '{"idempotencyKey": "wamid.IN4", "fulfillment": "delivery", "address": "Calle 10 # 20-30", "paymentMethod": "Efectivo", "items": [{"productId": "52000000-0000-0000-0000-000000056a01", "quantity": 1}]}');
  insert into _t (area, test, expected, got) values
    ('n8n', 'n8n crea el pedido con las reglas del menú (precio y domicilio del servidor)', '6000 · WHATSAPP',
      (v ->> 'total') || ' · ' || (select channel::text from dk_orders where kitchen_id = pg_temp.k('A') and external_reference = 'wamid.IN4')),
    ('n8n', 'Sin referencia no hay pedido (idempotencia obligatoria)', 'Falta la referencia del mensaje',
      pg_temp.err(format($q$select dk_wa_place_order_for(%L, '{"fulfillment": "pickup", "paymentMethod": "Efectivo", "items": []}')$q$, pg_temp.k('conv')))),
    ('n8n', 'Plantilla solo si está aprobada en la cuenta', 'La plantilla no está aprobada en esta cuenta',
      pg_temp.err($q$select dk_wa_send_template('+573001110003', 'quanela_pedido_confirmado', 'es', '{}')$q$));
end $$;
reset role;

-- Rotate and delete the n8n secret; disconnecting WhatsApp leaves n8n events alone.
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_old text := pg_temp.v('n8n') ->> 'secret';
begin
  insert into _t (area, test, expected, got) values
    ('n8n', 'Rotar el secreto da uno nuevo', 'true', ((dk_integration_rotate_secret() ->> 'secret') <> v_old)::text),
    ('n8n', 'Evento de prueba', 'true', (dk_integration_test() is not null)::text);
  perform dk_wa_disconnect();
  insert into _t (area, test, expected, got) values
    ('Desconectar', 'Desconectar WhatsApp no detiene los eventos de n8n', 'queued',
      (select status from dk_wa_outbox where event = 'webhook:integration.test'));
  perform dk_integration_delete_endpoint();
end $$;
reset role;
insert into _t (area, test, expected, got) values
  ('n8n', 'Eliminar la integración borra su secreto', '0', (select count(*)::text from vault.secrets where name = 'dk_n8n_secret_' || pg_temp.k('A')::text));

-- ---------------------------------------------------------------------------
-- 6. Isolation and the service-only functions
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('B'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Aislamiento', 'B no ve ni escribe en conversaciones de A', '0 · blocked · blocked',
      (select count(*)::text from dk_wa_conversations) || ' · ' || pg_temp.blocked(format($q$select dk_wa_send_text(%L, 'x')$q$, pg_temp.k('conv'))) || ' · ' ||
      pg_temp.blocked(format($q$select dk_wa_place_order_for(%L, '{"idempotencyKey": "x"}')$q$, pg_temp.k('conv'))));
end $$;
reset role;
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Permisos', 'Las funciones del webhook y del asistente son solo del servicio', 'blocked · blocked · blocked · blocked',
      pg_temp.blocked($q$select dk_wa_receive('1', 'w', '+573001110003', null, now(), 'text', 'hola')$q$) || ' · ' ||
      pg_temp.blocked(format($q$select dk_wa_place_order(%L, '{}', 'x')$q$, pg_temp.k('conv'))) || ' · ' ||
      pg_temp.blocked(format($q$select dk_wa_ai_context(%L)$q$, pg_temp.k('conv'))) || ' · ' ||
      pg_temp.blocked(format($q$select dk_ai_run_reserve_system(%L, gen_random_uuid())$q$, pg_temp.k('A'))));
end $$;
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
