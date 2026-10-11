-- ADR 0055 (fase A) — WhatsApp e Integraciones: each account connects its own
-- official number (Meta Cloud API) and its customers get the status of their
-- orders. Nothing in orders or kitchen changes: a trigger on the status history
-- (which every status RPC already writes) puts a message in an outbox; after the
-- commit, pg_net wakes the dispatcher (Edge Function), which sends it. Secrets
-- (Meta token, app secret) live in Supabase Vault and only the service role can
-- read them.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Permissions and the feature
-- ---------------------------------------------------------------------------
insert into dk_permissions (key, module, action, scope, label, description, sort_order) values
  ('integrations.view', 'integrations', 'view', 'account', 'Ver WhatsApp e Integraciones',
   'Ver la conexión de WhatsApp, los mensajes y el registro de avisos', 166),
  ('integrations.manage', 'integrations', 'manage', 'account', 'Configurar WhatsApp e Integraciones',
   'Conectar el número de WhatsApp, elegir los avisos y sus plantillas y conectar n8n', 167),
  ('whatsapp.reply', 'whatsapp', 'reply', 'account', 'Responder por WhatsApp',
   'Responder a los clientes desde la bandeja de WhatsApp', 168)
on conflict (key) do nothing;

insert into dk_role_permissions (role_id, permission_key)
select r.id, p.key from dk_roles r cross join (values ('integrations.view'), ('integrations.manage'), ('whatsapp.reply')) p(key)
where r.is_system and r.key in ('ADMIN', 'MANAGER')
on conflict do nothing;
insert into dk_role_permissions (role_id, permission_key)
select r.id, 'whatsapp.reply' from dk_roles r where r.is_system and r.key = 'CASHIER'
on conflict do nothing;

insert into dk_features (key, category, label, description, uses_model, model_key, use_permission, manage_permission,
                         default_available, default_enabled, active, min_interval_seconds, settings_schema, default_settings, depends_on, sort_order)
values ('whatsapp_notifications', 'general', 'Avisos de pedidos por WhatsApp',
        'Envía al cliente, desde el número oficial de WhatsApp de la cuenta, el estado de su pedido: confirmado, listo, en camino o cancelado.',
        false, null, 'integrations.manage', 'settings.manage', true, true, true, null, '{}'::jsonb, '{}'::jsonb, '{}', 30)
on conflict (key) do nothing;

insert into dk_plan_features (plan_key, feature_key)
select p.key, 'whatsapp_notifications' from (values ('business'), ('enterprise')) p(key)
where exists (select 1 from dk_plans where key = p.key)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Platform settings that are not secret (the Functions URL for pg_net)
-- ---------------------------------------------------------------------------
create table if not exists dk_platform_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table dk_platform_settings enable row level security;
revoke all on dk_platform_settings from anon, authenticated;
insert into dk_platform_settings (key, value) values ('functions_url', 'https://cqfzcwpqisaohcjaevxf.supabase.co/functions/v1')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Consent of the customer (WhatsApp policy: business-initiated messages need opt-in)
-- ---------------------------------------------------------------------------
alter table dk_customers
  add column if not exists whatsapp_opt_in boolean not null default false,
  add column if not exists whatsapp_opt_in_at timestamptz,
  add column if not exists whatsapp_opt_in_source text check (whatsapp_opt_in_source in ('web', 'whatsapp', 'staff')),
  add column if not exists whatsapp_opt_out_at timestamptz;

create or replace function dk_customer_set_whatsapp_opt_in(p_customer_id uuid, p_opt_in boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if dk_current_kitchen_id() is null then raise exception 'No hay una cuenta activa'; end if;
  if not dk_can('customers.edit') then raise exception 'No autorizado para editar clientes'; end if;
  update dk_customers
  set whatsapp_opt_in = p_opt_in,
      whatsapp_opt_in_at = case when p_opt_in then now() else whatsapp_opt_in_at end,
      whatsapp_opt_in_source = case when p_opt_in then 'staff' else whatsapp_opt_in_source end,
      whatsapp_opt_out_at = case when p_opt_in then null else now() end
  where id = p_customer_id and kitchen_id = dk_current_kitchen_id();
  if not found then raise exception 'El cliente no existe'; end if;
end;
$$;
revoke all on function dk_customer_set_whatsapp_opt_in(uuid, boolean) from public, anon;
grant execute on function dk_customer_set_whatsapp_opt_in(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The connection of each account (secrets in Vault)
-- ---------------------------------------------------------------------------
create table dk_wa_accounts (
  kitchen_id uuid primary key references dk_kitchens (id) on delete cascade,
  phone_number_id text not null unique check (phone_number_id ~ '^[0-9]{5,30}$'),
  waba_id text not null check (waba_id ~ '^[0-9]{5,30}$'),
  display_phone text,
  verified_name text,
  quality_rating text,
  -- test: only to the authorized numbers; live: to every customer who accepted; simulator: to the platform's Meta simulator.
  mode text not null default 'test' check (mode in ('test', 'live', 'simulator')),
  test_recipients text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'connected', 'error')),
  notifications_enabled boolean not null default true,
  access_token_id uuid,
  app_secret_id uuid,
  verify_token_hash text,
  last_check_at timestamptz,
  last_error text,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid default dk_current_profile_id() references dk_users (id) on delete set null
);
alter table dk_wa_accounts enable row level security;
create policy dk_wa_accounts_select on dk_wa_accounts for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('integrations.view')));
revoke all on dk_wa_accounts from anon, authenticated;
grant select (kitchen_id, phone_number_id, waba_id, display_phone, verified_name, quality_rating, mode, test_recipients, status,
              notifications_enabled, last_check_at, last_error, connected_at, updated_at) on dk_wa_accounts to authenticated;
create trigger dk_trg_audit_wa_accounts after insert or update or delete on dk_wa_accounts
  for each row execute function dk_audit_row();

-- The templates of each order event (the suggested ones, or the account's own approved ones).
create table dk_wa_templates (
  kitchen_id uuid not null references dk_kitchens (id) on delete cascade,
  event text not null check (event in ('order_confirmed', 'order_preparing', 'order_ready_pickup', 'order_ready_delivery',
                                       'order_dispatched', 'order_delivered', 'order_cancelled')),
  enabled boolean not null default false,
  template_name text not null check (template_name ~ '^[a-z0-9_]{1,250}$'),
  language text not null default 'es' check (language ~ '^[a-z]{2}(_[A-Z]{2})?$'),
  body text,
  params text[] not null default '{}',
  meta_status text not null default 'not_created'
    check (meta_status in ('not_created', 'pending', 'approved', 'rejected', 'paused', 'disabled', 'unknown')),
  meta_template_id text,
  meta_reason text,
  updated_at timestamptz not null default now(),
  primary key (kitchen_id, event)
);
alter table dk_wa_templates enable row level security;
create policy dk_wa_templates_select on dk_wa_templates for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('integrations.view')));
revoke all on dk_wa_templates from anon, authenticated;
grant select on dk_wa_templates to authenticated;

-- What Quanela suggests (utility category; variables never at the start nor at the end, as Meta requires).
create or replace function dk_wa_template_catalog()
returns table (event text, template_name text, body text, params text[], enabled_default boolean, sort_order integer)
language sql
immutable
set search_path = public
as $$
  values
    ('order_confirmed', 'quanela_pedido_confirmado',
     'Hola {{1}}, {{2}} confirmó tu pedido #{{3}}. Puedes seguirlo en {{4}} en cualquier momento.',
     array['customer_name', 'business_name', 'order_number', 'tracking_url'], true, 1),
    ('order_preparing', 'quanela_pedido_preparando',
     'Hola {{1}}, tu pedido #{{2}} de {{3}} ya se está preparando. Puedes seguirlo en {{4}} en cualquier momento.',
     array['customer_name', 'order_number', 'business_name', 'tracking_url'], false, 2),
    ('order_ready_pickup', 'quanela_pedido_listo_recoger',
     'Hola {{1}}, tu pedido #{{2}} está listo para recoger en {{3}}. ¡Te esperamos!',
     array['customer_name', 'order_number', 'business_name'], true, 3),
    ('order_ready_delivery', 'quanela_pedido_listo',
     'Hola {{1}}, tu pedido #{{2}} de {{3}} está listo y pronto sale a domicilio. Puedes seguirlo en {{4}} en cualquier momento.',
     array['customer_name', 'order_number', 'business_name', 'tracking_url'], false, 4),
    ('order_dispatched', 'quanela_pedido_en_camino',
     'Hola {{1}}, tu pedido #{{2}} de {{3}} va en camino. Puedes seguirlo en {{4}} hasta que llegue.',
     array['customer_name', 'order_number', 'business_name', 'tracking_url'], true, 5),
    ('order_delivered', 'quanela_pedido_entregado',
     'Hola {{1}}, tu pedido #{{2}} de {{3}} fue entregado. ¡Gracias por tu compra!',
     array['customer_name', 'order_number', 'business_name'], false, 6),
    ('order_cancelled', 'quanela_pedido_cancelado',
     'Hola {{1}}, tu pedido #{{2}} de {{3}} fue cancelado. Motivo: {{4}}. Si tienes dudas, responde a este mensaje.',
     array['customer_name', 'order_number', 'business_name', 'reason'], true, 7)
$$;

-- ---------------------------------------------------------------------------
-- 5. The outbox: one row per message; the dispatcher sends it, the webhook updates it
-- ---------------------------------------------------------------------------
create table dk_wa_outbox (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references dk_kitchens (id) on delete cascade,
  kind text not null check (kind in ('template', 'text')),
  order_id uuid references dk_orders (id) on delete set null,
  event text not null,
  recipient text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'skipped')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  wamid text,
  error_code text,
  last_error text,
  created_at timestamptz not null default clock_timestamp(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_by uuid default dk_current_profile_id() references dk_users (id) on delete set null
);
-- One notice per order and event (a status that goes back and forth is not sent twice).
create unique index dk_wa_outbox_order_event_key on dk_wa_outbox (order_id, event) where order_id is not null;
create index dk_wa_outbox_due_idx on dk_wa_outbox (next_attempt_at) where status = 'queued';
create index dk_wa_outbox_kitchen_idx on dk_wa_outbox (kitchen_id, created_at desc);
create unique index dk_wa_outbox_wamid_key on dk_wa_outbox (wamid) where wamid is not null;
alter table dk_wa_outbox enable row level security;
create policy dk_wa_outbox_select on dk_wa_outbox for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('integrations.view')));
revoke all on dk_wa_outbox from anon, authenticated;
grant select on dk_wa_outbox to authenticated;

-- Wake the dispatcher after the commit (pg_net sends when the transaction ends). Never fails the caller.
create or replace function dk_wa_kick()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text := (select value from dk_platform_settings where key = 'functions_url');
begin
  if v_url is null then return; end if;
  perform net.http_post(url := v_url || '/dk-whatsapp-dispatch', body := '{}'::jsonb,
                        headers := jsonb_build_object('Content-Type', 'application/json'), timeout_milliseconds := 5000);
exception when others then
  raise warning 'dk_wa_kick: %', sqlerrm;
end;
$$;
revoke all on function dk_wa_kick() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. From a status change to a message
-- ---------------------------------------------------------------------------
create or replace function dk_wa_event_for(p_status dk_order_status, p_fulfillment text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_status
    when 'CONFIRMADO' then 'order_confirmed'
    when 'EN_PREPARACION' then 'order_preparing'
    when 'LISTO' then case when p_fulfillment = 'pickup' then 'order_ready_pickup' else 'order_ready_delivery' end
    when 'DESPACHADO' then 'order_dispatched'
    when 'ENTREGADO' then 'order_delivered'
    when 'CANCELADO' then 'order_cancelled'
  end;
$$;

create or replace function dk_wa_enqueue_order_event(p_order_id uuid, p_from dk_order_status, p_to dk_order_status, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rank constant text[] := array['NUEVO', 'CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'DESPACHADO', 'ENTREGADO'];
  o record;
  acc dk_wa_accounts;
  t dk_wa_templates;
  v_event text;
  v_recipient text;
  v_status text := 'queued';
  v_reason text;
  v_token uuid;
  v_id uuid;
begin
  -- Going back (a kitchen correction) never notifies; cancelling always may.
  if p_to <> 'CANCELADO' and p_from is not null and array_position(v_rank, p_to::text) <= array_position(v_rank, p_from::text) then
    return null;
  end if;

  select ord.id, ord.kitchen_id, ord.order_number, ord.channel, ord.fulfillment, ord.public_token,
         c.full_name, c.phone, c.whatsapp_id, c.whatsapp_opt_in, c.whatsapp_opt_out_at, k.name as business, k.slug
  into o
  from dk_orders ord
  join dk_customers c on c.id = ord.customer_id
  join dk_kitchens k on k.id = ord.kitchen_id
  where ord.id = p_order_id;
  if not found then return null; end if;

  select * into acc from dk_wa_accounts where kitchen_id = o.kitchen_id;
  if not found or acc.status <> 'connected' or not acc.notifications_enabled then return null; end if;
  if not dk_feature_enabled(o.kitchen_id, 'whatsapp_notifications') then return null; end if;

  v_event := dk_wa_event_for(p_to, o.fulfillment);
  if v_event is null then return null; end if;
  select * into t from dk_wa_templates where kitchen_id = o.kitchen_id and event = v_event;
  if not found or not t.enabled then return null; end if;

  v_recipient := dk_normalize_phone(coalesce(o.whatsapp_id, o.phone));
  if v_recipient is null or v_recipient !~ '^\+[1-9][0-9]{7,14}$' then return null; end if;

  -- Consent: accepted (web, staff) or the customer wrote to us (WhatsApp order); never after «BAJA».
  if o.whatsapp_opt_out_at is not null or not (o.whatsapp_opt_in or o.channel = 'WHATSAPP') then
    v_status := 'skipped';
    v_reason := case when o.whatsapp_opt_out_at is not null then 'El cliente pidió no recibir mensajes' else 'El cliente no aceptó avisos por WhatsApp' end;
  elsif acc.mode = 'test' and not (v_recipient = any (acc.test_recipients)) then
    v_status := 'skipped';
    v_reason := 'Modo prueba: este número no está autorizado';
  elsif t.meta_status in ('rejected', 'paused', 'disabled') then
    v_status := 'skipped';
    v_reason := 'La plantilla no está aprobada en Meta';
  end if;

  -- The customer follows the order with its code (ADR 0052): every notified order gets one.
  v_token := o.public_token;
  if v_token is null and v_status = 'queued' then
    v_token := gen_random_uuid();
    update dk_orders set public_token = v_token where id = o.id and public_token is null;
    select public_token into v_token from dk_orders where id = o.id;
  end if;

  insert into dk_wa_outbox (kitchen_id, kind, order_id, event, recipient, payload, status, last_error, created_by)
  values (o.kitchen_id, 'template', o.id, v_event, v_recipient,
          jsonb_build_object(
            'template', t.template_name, 'language', t.language, 'params', to_jsonb(t.params),
            'vars', jsonb_build_object(
              'customer_name', coalesce(nullif(split_part(btrim(o.full_name), ' ', 1), ''), 'cliente'),
              'business_name', o.business,
              'order_number', o.order_number::text,
              'tracking_path', case when v_token is not null then '/menu/' || o.slug || '/pedido/' || v_token end,
              'reason', coalesce(nullif(left(btrim(p_note), 120), ''), 'sin detalle'))),
          v_status, v_reason, dk_current_profile_id())
  on conflict (order_id, event) where order_id is not null do nothing
  returning id into v_id;

  if v_id is not null and v_status = 'queued' then perform dk_wa_kick(); end if;
  return v_id;
end;
$$;
revoke all on function dk_wa_enqueue_order_event(uuid, dk_order_status, dk_order_status, text) from public, anon, authenticated;

-- Every status RPC writes the history: one hook, no RPC changes. A notice never breaks the order flow.
create or replace function dk_wa_on_status_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform dk_wa_enqueue_order_event(new.order_id, new.from_status, new.to_status, new.note);
  exception when others then
    raise warning 'dk_wa_on_status_history: %', sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function dk_wa_on_status_history() from public, anon, authenticated;
create trigger dk_trg_wa_status_notice after insert on dk_order_status_history
  for each row execute function dk_wa_on_status_history();

-- ---------------------------------------------------------------------------
-- 7. For the dispatcher and the webhook (service role only)
-- ---------------------------------------------------------------------------
-- Take what is due (and what got stuck sending), with the credentials to send it.
create or replace function dk_wa_claim(p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  update dk_wa_outbox set status = 'queued', locked_at = null
  where status = 'sending' and locked_at < now() - interval '2 minutes';

  with due as (
    select id from dk_wa_outbox
    where status = 'queued' and next_attempt_at <= now()
    order by next_attempt_at
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  ), taken as (
    update dk_wa_outbox ob set status = 'sending', locked_at = now(), attempts = ob.attempts + 1
    from due where ob.id = due.id
    returning ob.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'kind', t.kind, 'event', t.event, 'recipient', t.recipient, 'payload', t.payload, 'attempts', t.attempts,
    'mode', a.mode, 'phoneNumberId', a.phone_number_id,
    'accessToken', (select decrypted_secret from vault.decrypted_secrets where id = a.access_token_id))), '[]'::jsonb)
  into v_rows
  from taken t
  left join dk_wa_accounts a on a.kitchen_id = t.kitchen_id;
  return v_rows;
end;
$$;

-- The result of one send: sent, retry later (1, 5, 15, 60 min) or failed.
create or replace function dk_wa_mark(p_id uuid, p_ok boolean, p_wamid text default null, p_error text default null,
                                      p_error_code text default null, p_retryable boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ob dk_wa_outbox;
begin
  select * into ob from dk_wa_outbox where id = p_id for update;
  if not found then return; end if;
  if p_ok then
    update dk_wa_outbox set status = 'sent', wamid = p_wamid, sent_at = now(), locked_at = null, last_error = null, error_code = null where id = p_id;
  elsif p_retryable and ob.attempts < 5 then
    update dk_wa_outbox set status = 'queued', locked_at = null, last_error = left(p_error, 500), error_code = p_error_code,
      next_attempt_at = now() + (array[interval '1 minute', interval '5 minutes', interval '15 minutes', interval '1 hour'])[least(ob.attempts, 4)]
    where id = p_id;
  else
    update dk_wa_outbox set status = 'failed', locked_at = null, last_error = left(p_error, 500), error_code = p_error_code where id = p_id;
  end if;
end;
$$;

-- Delivery receipts from Meta (sent → delivered → read, or failed). Never goes backwards.
create or replace function dk_wa_apply_status(p_phone_number_id text, p_wamid text, p_status text, p_at timestamptz,
                                              p_error_code text default null, p_error text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := (select kitchen_id from dk_wa_accounts where phone_number_id = p_phone_number_id);
  v_rank integer := array_position(array['sent', 'delivered', 'read'], p_status);
begin
  if v_kitchen is null then return false; end if;
  if p_status = 'failed' then
    update dk_wa_outbox set status = 'failed', error_code = p_error_code, last_error = left(p_error, 500)
    where wamid = p_wamid and kitchen_id = v_kitchen and status in ('sent', 'sending', 'queued');
    return found;
  end if;
  if v_rank is null then return false; end if;
  update dk_wa_outbox
  set status = case when array_position(array['sent', 'delivered', 'read'], status) >= v_rank then status else p_status end,
      delivered_at = case when p_status in ('delivered', 'read') then coalesce(delivered_at, p_at) else delivered_at end,
      read_at = case when p_status = 'read' then coalesce(read_at, p_at) else read_at end
  where wamid = p_wamid and kitchen_id = v_kitchen and status in ('sent', 'delivered', 'read');
  return found;
end;
$$;

-- The webhook: which account a number belongs to, and its app secret to check Meta's signature.
create or replace function dk_wa_webhook_account(p_phone_number_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('kitchenId', a.kitchen_id, 'mode', a.mode,
                            'appSecret', (select decrypted_secret from vault.decrypted_secrets where id = a.app_secret_id))
  from dk_wa_accounts a where a.phone_number_id = p_phone_number_id;
$$;

-- Meta's subscription check: is this one of our verify tokens?
create or replace function dk_wa_webhook_verify(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (select 1 from dk_wa_accounts where verify_token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex'));
$$;

-- For dk-whatsapp-admin: the credentials of the caller's account (checked first with the user's session).
create or replace function dk_wa_credentials(p_kitchen uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('kitchenId', a.kitchen_id, 'phoneNumberId', a.phone_number_id, 'wabaId', a.waba_id, 'mode', a.mode,
                            'accessToken', (select decrypted_secret from vault.decrypted_secrets where id = a.access_token_id))
  from dk_wa_accounts a where a.kitchen_id = p_kitchen;
$$;

-- What dk-whatsapp-admin learns from Meta (the number, its quality; the templates and their review).
create or replace function dk_wa_record_check(p_kitchen uuid, p_ok boolean, p_info jsonb, p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update dk_wa_accounts
  set status = case when p_ok then 'connected' else 'error' end,
      display_phone = coalesce(p_info ->> 'displayPhone', display_phone),
      verified_name = coalesce(p_info ->> 'verifiedName', verified_name),
      quality_rating = coalesce(p_info ->> 'qualityRating', quality_rating),
      last_check_at = now(), last_error = case when p_ok then null else left(p_error, 500) end,
      connected_at = case when p_ok then coalesce(connected_at, now()) else connected_at end,
      updated_at = now()
  where kitchen_id = p_kitchen;
end;
$$;

create or replace function dk_wa_record_templates(p_kitchen uuid, p_templates jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  x jsonb;
  v_status text;
begin
  for x in select * from jsonb_array_elements(coalesce(p_templates, '[]'::jsonb)) loop
    v_status := lower(coalesce(x ->> 'status', 'unknown'));
    if v_status not in ('pending', 'approved', 'rejected', 'paused', 'disabled') then v_status := 'unknown'; end if;
    update dk_wa_templates
    set meta_status = v_status, meta_template_id = coalesce(x ->> 'id', meta_template_id),
        meta_reason = nullif(x ->> 'reason', ''), updated_at = now()
    where kitchen_id = p_kitchen and template_name = x ->> 'name' and language = coalesce(x ->> 'language', language);
  end loop;
end;
$$;

revoke all on function dk_wa_claim(integer), dk_wa_mark(uuid, boolean, text, text, text, boolean),
  dk_wa_apply_status(text, text, text, timestamptz, text, text), dk_wa_webhook_account(text), dk_wa_webhook_verify(text),
  dk_wa_credentials(uuid), dk_wa_record_check(uuid, boolean, jsonb, text), dk_wa_record_templates(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function dk_wa_claim(integer), dk_wa_mark(uuid, boolean, text, text, text, boolean),
  dk_wa_apply_status(text, text, text, timestamptz, text, text), dk_wa_webhook_account(text), dk_wa_webhook_verify(text),
  dk_wa_credentials(uuid), dk_wa_record_check(uuid, boolean, jsonb, text), dk_wa_record_templates(uuid, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- 8. What the account manages (integrations.manage). Secrets go in, never come out.
-- ---------------------------------------------------------------------------
create or replace function dk_wa_guard(p_permission text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
begin
  if v_kitchen is null then raise exception 'No hay una cuenta activa'; end if;
  if not dk_can(p_permission) then raise exception 'No autorizado para WhatsApp e Integraciones'; end if;
  return v_kitchen;
end;
$$;
revoke all on function dk_wa_guard(text) from public, anon, authenticated;

create or replace function dk_wa_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_wa_guard('integrations.view');
begin
  return jsonb_build_object(
    'account', (select jsonb_build_object(
        'phoneNumberId', a.phone_number_id, 'wabaId', a.waba_id, 'displayPhone', a.display_phone, 'verifiedName', a.verified_name,
        'qualityRating', a.quality_rating, 'mode', a.mode, 'testRecipients', to_jsonb(a.test_recipients), 'status', a.status,
        'notificationsEnabled', a.notifications_enabled, 'hasAccessToken', a.access_token_id is not null,
        'hasAppSecret', a.app_secret_id is not null, 'hasVerifyToken', a.verify_token_hash is not null,
        'lastCheckAt', a.last_check_at, 'lastError', a.last_error, 'connectedAt', a.connected_at)
      from dk_wa_accounts a where a.kitchen_id = v_kitchen),
    'templates', coalesce((
      select jsonb_agg(jsonb_build_object(
          'event', c.event, 'enabled', coalesce(t.enabled, c.enabled_default), 'templateName', coalesce(t.template_name, c.template_name),
          'language', coalesce(t.language, 'es'), 'body', coalesce(t.body, c.body), 'params', to_jsonb(coalesce(t.params, c.params)),
          'suggested', coalesce(t.template_name, c.template_name) = c.template_name,
          'metaStatus', coalesce(t.meta_status, 'not_created'), 'metaReason', t.meta_reason) order by c.sort_order)
      from dk_wa_template_catalog() c left join dk_wa_templates t on t.kitchen_id = v_kitchen and t.event = c.event), '[]'::jsonb),
    'featureEnabled', dk_feature_enabled(v_kitchen, 'whatsapp_notifications'),
    'canManage', dk_can('integrations.manage'),
    'counts', (select jsonb_build_object(
        'today', count(*) filter (where created_at > now() - interval '1 day'),
        'failed', count(*) filter (where status = 'failed' and created_at > now() - interval '7 days'),
        'delivered', count(*) filter (where status in ('delivered', 'read') and created_at > now() - interval '7 days'))
      from dk_wa_outbox where kitchen_id = v_kitchen));
end;
$$;

-- Connect (or update) the number. Empty secrets keep the saved ones. Returns a new verify token only when one is created.
create or replace function dk_wa_connect(p_phone_number_id text, p_waba_id text, p_access_token text default null, p_app_secret text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_kitchen uuid := dk_wa_guard('integrations.manage');
  acc dk_wa_accounts;
  v_token_id uuid;
  v_secret_id uuid;
  v_verify text;
begin
  p_phone_number_id := btrim(coalesce(p_phone_number_id, ''));
  p_waba_id := btrim(coalesce(p_waba_id, ''));
  if p_phone_number_id !~ '^[0-9]{5,30}$' then raise exception 'Revisa el Phone Number ID (solo números)' using hint = 'invalid'; end if;
  if p_waba_id !~ '^[0-9]{5,30}$' then raise exception 'Revisa el WhatsApp Business Account ID (solo números)' using hint = 'invalid'; end if;
  if exists (select 1 from dk_wa_accounts where phone_number_id = p_phone_number_id and kitchen_id <> v_kitchen) then
    raise exception 'Ese número ya está conectado a otra cuenta' using hint = 'taken';
  end if;
  select * into acc from dk_wa_accounts where kitchen_id = v_kitchen for update;

  if nullif(btrim(p_access_token), '') is not null then
    if char_length(btrim(p_access_token)) < 20 then raise exception 'El token de acceso no parece válido' using hint = 'invalid'; end if;
    if acc.access_token_id is not null then
      perform vault.update_secret(acc.access_token_id, btrim(p_access_token));
      v_token_id := acc.access_token_id;
    else
      v_token_id := vault.create_secret(btrim(p_access_token), 'dk_wa_token_' || v_kitchen::text, 'WhatsApp access token (ADR 0055)');
    end if;
  else
    v_token_id := acc.access_token_id;
  end if;
  if nullif(btrim(p_app_secret), '') is not null then
    if acc.app_secret_id is not null then
      perform vault.update_secret(acc.app_secret_id, btrim(p_app_secret));
      v_secret_id := acc.app_secret_id;
    else
      v_secret_id := vault.create_secret(btrim(p_app_secret), 'dk_wa_app_secret_' || v_kitchen::text, 'Meta app secret (ADR 0055)');
    end if;
  else
    v_secret_id := acc.app_secret_id;
  end if;
  if v_token_id is null then raise exception 'Falta el token de acceso' using hint = 'invalid'; end if;
  if v_secret_id is null then raise exception 'Falta el App Secret' using hint = 'invalid'; end if;

  if acc.verify_token_hash is null then
    v_verify := 'qn_' || encode(extensions.gen_random_bytes(18), 'hex');
  end if;

  insert into dk_wa_accounts (kitchen_id, phone_number_id, waba_id, access_token_id, app_secret_id, verify_token_hash, status)
  values (v_kitchen, p_phone_number_id, p_waba_id, v_token_id, v_secret_id, encode(extensions.digest(v_verify, 'sha256'), 'hex'), 'pending')
  on conflict (kitchen_id) do update
  set phone_number_id = excluded.phone_number_id, waba_id = excluded.waba_id, access_token_id = excluded.access_token_id,
      app_secret_id = excluded.app_secret_id,
      status = case when dk_wa_accounts.phone_number_id = excluded.phone_number_id and nullif(btrim(p_access_token), '') is null
                    then dk_wa_accounts.status else 'pending' end,
      updated_at = now(), updated_by = dk_current_profile_id();

  -- The suggested templates, once (the account can change them later).
  insert into dk_wa_templates (kitchen_id, event, enabled, template_name, language, body, params)
  select v_kitchen, c.event, c.enabled_default, c.template_name, 'es', c.body, c.params from dk_wa_template_catalog() c
  on conflict (kitchen_id, event) do nothing;

  return jsonb_build_object('verifyToken', v_verify);
end;
$$;

create or replace function dk_wa_regenerate_verify_token()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_kitchen uuid := dk_wa_guard('integrations.manage');
  v_verify text := 'qn_' || encode(extensions.gen_random_bytes(18), 'hex');
begin
  update dk_wa_accounts set verify_token_hash = encode(extensions.digest(v_verify, 'sha256'), 'hex'), updated_at = now(), updated_by = dk_current_profile_id()
  where kitchen_id = v_kitchen;
  if not found then raise exception 'Primero conecta tu número'; end if;
  return jsonb_build_object('verifyToken', v_verify);
end;
$$;

create or replace function dk_wa_disconnect()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_wa_guard('integrations.manage');
  acc dk_wa_accounts;
begin
  delete from dk_wa_accounts where kitchen_id = v_kitchen returning * into acc;
  if not found then return; end if;
  delete from vault.secrets where id in (acc.access_token_id, acc.app_secret_id);
  -- What was waiting is not sent anymore.
  update dk_wa_outbox set status = 'skipped', last_error = 'WhatsApp desconectado' where kitchen_id = v_kitchen and status in ('queued', 'sending');
end;
$$;

-- Mode, authorized test numbers and the main switch.
create or replace function dk_wa_save_settings(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_wa_guard('integrations.manage');
  v_numbers text[];
begin
  if p ? 'mode' and p ->> 'mode' not in ('test', 'live', 'simulator') then raise exception 'Modo no válido'; end if;
  if p ? 'testRecipients' then
    select coalesce(array_agg(distinct n), '{}') into v_numbers
    from (select dk_normalize_phone(x) as n from jsonb_array_elements_text(p -> 'testRecipients') x) s
    where n ~ '^\+[1-9][0-9]{7,14}$';
    if jsonb_array_length(p -> 'testRecipients') > 10 then raise exception 'Máximo 10 números de prueba'; end if;
  end if;
  update dk_wa_accounts
  set mode = coalesce(p ->> 'mode', mode),
      test_recipients = coalesce(v_numbers, test_recipients),
      notifications_enabled = coalesce((p ->> 'notificationsEnabled')::boolean, notifications_enabled),
      updated_at = now(), updated_by = dk_current_profile_id()
  where kitchen_id = v_kitchen;
  if not found then raise exception 'Primero conecta tu número'; end if;
end;
$$;

-- One event: on/off, and the template (the suggested one or an approved one of the account).
create or replace function dk_wa_save_template(p_event text, p_enabled boolean, p_template_name text default null, p_language text default null,
                                               p_params text[] default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_wa_guard('integrations.manage');
  c record;
begin
  select * into c from dk_wa_template_catalog() x where x.event = p_event;
  if not found then raise exception 'Aviso desconocido'; end if;
  if p_params is not null and exists (select 1 from unnest(p_params) x where x not in ('customer_name', 'business_name', 'order_number', 'tracking_url', 'reason')) then
    raise exception 'Variable desconocida en la plantilla';
  end if;
  insert into dk_wa_templates (kitchen_id, event, enabled, template_name, language, body, params)
  values (v_kitchen, p_event, p_enabled, coalesce(nullif(btrim(p_template_name), ''), c.template_name), coalesce(nullif(btrim(p_language), ''), 'es'),
          case when coalesce(nullif(btrim(p_template_name), ''), c.template_name) = c.template_name then c.body end, coalesce(p_params, c.params))
  on conflict (kitchen_id, event) do update
  set enabled = excluded.enabled,
      template_name = coalesce(nullif(btrim(p_template_name), ''), dk_wa_templates.template_name),
      language = coalesce(nullif(btrim(p_language), ''), dk_wa_templates.language),
      params = coalesce(p_params, dk_wa_templates.params),
      body = case when coalesce(nullif(btrim(p_template_name), ''), dk_wa_templates.template_name) = c.template_name then c.body
                  when p_template_name is not null then null else dk_wa_templates.body end,
      meta_status = case when coalesce(nullif(btrim(p_template_name), ''), dk_wa_templates.template_name) <> dk_wa_templates.template_name
                         then 'unknown' else dk_wa_templates.meta_status end,
      updated_at = now();
end;
$$;

-- «Enviar prueba»: one notice of an event to a number (in test mode, an authorized one), with sample data.
create or replace function dk_wa_send_test(p_event text, p_to text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_wa_guard('integrations.manage');
  acc dk_wa_accounts;
  t dk_wa_templates;
  v_to text := dk_normalize_phone(p_to);
  v_id uuid;
begin
  select * into acc from dk_wa_accounts where kitchen_id = v_kitchen;
  if not found then raise exception 'Primero conecta tu número'; end if;
  if v_to is null or v_to !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Revisa el número (con indicativo, ej. +57…)' using hint = 'invalid'; end if;
  if acc.mode = 'test' and not (v_to = any (acc.test_recipients)) then
    raise exception 'En modo prueba solo se envía a los números autorizados' using hint = 'not_authorized';
  end if;
  select * into t from dk_wa_templates where kitchen_id = v_kitchen and event = p_event;
  if not found then raise exception 'Aviso desconocido'; end if;
  insert into dk_wa_outbox (kitchen_id, kind, event, recipient, payload)
  values (v_kitchen, 'template', p_event, v_to, jsonb_build_object(
    'template', t.template_name, 'language', t.language, 'params', to_jsonb(t.params), 'test', true,
    'vars', jsonb_build_object('customer_name', 'Laura', 'business_name', (select name from dk_kitchens where id = v_kitchen),
                               'order_number', '123', 'tracking_path', '/menu/' || (select slug from dk_kitchens where id = v_kitchen),
                               'reason', 'prueba')))
  returning id into v_id;
  perform dk_wa_kick();
  return v_id;
end;
$$;

-- Try again a notice that failed.
create or replace function dk_wa_retry(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_wa_guard('integrations.manage');
begin
  update dk_wa_outbox set status = 'queued', attempts = 0, next_attempt_at = now(), last_error = null, error_code = null, locked_at = null
  where id = p_id and kitchen_id = v_kitchen and status = 'failed';
  if not found then raise exception 'Ese aviso no se puede reintentar'; end if;
  perform dk_wa_kick();
end;
$$;

-- For dk-whatsapp-admin: the user's session proves the permission; the function then reads the credentials as service.
create or replace function dk_wa_admin_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_wa_guard('integrations.manage');
begin
  return jsonb_build_object('kitchenId', v_kitchen,
    'templates', coalesce((select jsonb_agg(jsonb_build_object('event', event, 'name', template_name, 'language', language, 'body', body, 'params', to_jsonb(params)))
                           from dk_wa_templates where kitchen_id = v_kitchen), '[]'::jsonb));
end;
$$;

revoke all on function dk_wa_settings(), dk_wa_connect(text, text, text, text), dk_wa_regenerate_verify_token(), dk_wa_disconnect(),
  dk_wa_save_settings(jsonb), dk_wa_save_template(text, boolean, text, text, text[]), dk_wa_send_test(text, text), dk_wa_retry(uuid),
  dk_wa_admin_context() from public, anon;
grant execute on function dk_wa_settings(), dk_wa_connect(text, text, text, text), dk_wa_regenerate_verify_token(), dk_wa_disconnect(),
  dk_wa_save_settings(jsonb), dk_wa_save_template(text, boolean, text, text, text[]), dk_wa_send_test(text, text), dk_wa_retry(uuid),
  dk_wa_admin_context() to authenticated;

-- ---------------------------------------------------------------------------
-- 9. The ordering core, shared by the web menu (today) and WhatsApp (fase B).
--    Same rules as ADR 0052; the only additions: the channel, and the customer's
--    consent for order notices («whatsappOptIn»).
-- ---------------------------------------------------------------------------
create or replace function dk_place_order_internal(p_kitchen uuid, p_order jsonb, p_channel dk_order_channel)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sf dk_storefronts;
  v_open jsonb;
  v_key text := nullif(btrim(coalesce(p_order ->> 'idempotencyKey', '')), '');
  v_name text := btrim(coalesce(p_order #>> '{customer,name}', ''));
  v_phone text;
  v_fulfillment text := p_order ->> 'fulfillment';
  v_address text := nullif(btrim(coalesce(p_order ->> 'address', '')), '');
  v_reference text := nullif(btrim(coalesce(p_order ->> 'reference', '')), '');
  v_payment text := p_order ->> 'paymentMethod';
  v_notes text := nullif(btrim(coalesce(p_order ->> 'notes', '')), '');
  v_opt_in boolean := coalesce((p_order ->> 'whatsappOptIn')::boolean, false);
  v_ip text;
  v_existing record;
  v_line jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_item record;
  v_qty integer;
  v_subtotal numeric := 0;
  v_fee numeric := 0;
  v_customer uuid;
  v_order uuid;
  v_number integer;
  v_token uuid := gen_random_uuid();
  v_confirmed boolean := false;
  v_req record;
  v_available numeric;
begin
  select * into sf from dk_storefronts where kitchen_id = p_kitchen;
  if not found then raise exception 'Este negocio no recibe pedidos por aquí' using hint = 'not_accepting'; end if;

  -- The same submission again: the same order.
  if v_key is not null then
    select o.order_number, o.public_token, o.status into v_existing
    from dk_orders o where o.kitchen_id = p_kitchen and o.channel = p_channel and o.external_reference = v_key;
    if found then
      return jsonb_build_object('orderNumber', v_existing.order_number, 'token', v_existing.public_token,
                                'status', v_existing.status, 'confirmed', v_existing.status <> 'NUEVO', 'repeated', true);
    end if;
  end if;

  v_open := dk_storefront_open_state(p_kitchen, now());
  if v_open ->> 'state' = 'closed' then
    raise exception 'El negocio está cerrado en este momento' using hint = 'closed', detail = coalesce(v_open ->> 'opens_at', '');
  end if;

  -- What the person typed.
  if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'Escribe tu nombre' using hint = 'invalid'; end if;
  v_phone := dk_normalize_phone(p_order #>> '{customer,phone}');
  if v_phone is null or v_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Revisa tu número de celular' using hint = 'invalid'; end if;
  if v_fulfillment = 'delivery' and not sf.web_delivery or v_fulfillment = 'pickup' and not sf.web_pickup
     or v_fulfillment is null or v_fulfillment not in ('delivery', 'pickup') then
    raise exception 'Elige cómo recibes tu pedido' using hint = 'invalid';
  end if;
  if v_fulfillment = 'delivery' and (v_address is null or char_length(v_address) < 5) then
    raise exception 'Escribe la dirección de entrega' using hint = 'invalid';
  end if;
  if v_payment is null or not (v_payment = any (sf.web_payment_methods)) then
    raise exception 'Elige cómo vas a pagar' using hint = 'invalid';
  end if;
  if char_length(coalesce(v_notes, '')) > 300 or char_length(coalesce(v_address, '')) > 200 or char_length(coalesce(v_reference, '')) > 200 then
    raise exception 'Algún texto es demasiado largo' using hint = 'invalid';
  end if;
  if jsonb_typeof(p_order -> 'items') <> 'array' or jsonb_array_length(p_order -> 'items') = 0 or jsonb_array_length(p_order -> 'items') > 30 then
    raise exception 'El pedido está vacío' using hint = 'invalid';
  end if;

  -- Limits: by phone, by network address and by account (last hour).
  begin
    v_ip := nullif(btrim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for',
                                             current_setting('request.headers', true)::json ->> 'cf-connecting-ip', ''), ',', 1)), '');
  exception when others then v_ip := null;
  end;
  delete from dk_public_order_attempts where created_at < now() - interval '1 day';
  if (select count(*) from dk_public_order_attempts where kitchen_id = p_kitchen and phone = v_phone and created_at > now() - interval '1 hour') >= 5
     or (v_ip is not null and (select count(*) from dk_public_order_attempts where ip = v_ip and created_at > now() - interval '1 hour') >= 20)
     or (select count(*) from dk_public_order_attempts where kitchen_id = p_kitchen and created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Demasiados pedidos seguidos. Espera un momento o escríbele al negocio por WhatsApp.' using hint = 'rate_limited';
  end if;

  -- One order at a time per account: limits and stock are checked against what is really left.
  perform pg_advisory_xact_lock(hashtextextended('dk_public_order:' || p_kitchen::text, 0));

  -- Lines: the same dish twice counts once; prices come from today's menu, never from the client.
  for v_line in
    select jsonb_build_object('productId', x ->> 'productId', 'quantity', sum((x ->> 'quantity')::integer),
                              'note', string_agg(nullif(btrim(x ->> 'note'), ''), ' · '))
    from jsonb_array_elements(p_order -> 'items') x
    group by x ->> 'productId'
  loop
    v_qty := (v_line ->> 'quantity')::integer;
    if v_qty is null or v_qty <= 0 or v_qty > 50 then raise exception 'Revisa las cantidades' using hint = 'invalid'; end if;
    select * into v_item from dk_public_menu_items(p_kitchen) i where i.product_id = (v_line ->> 'productId')::uuid;
    if not found then
      raise exception 'Un plato ya no está en el menú de hoy' using hint = 'unavailable', detail = v_line ->> 'productId';
    end if;
    if v_item.availability <> 'available' then
      raise exception '«%» no está disponible en este momento', v_item.name using hint = 'unavailable', detail = v_item.product_id::text;
    end if;
    if v_item.remaining is not null and v_qty > v_item.remaining then
      raise exception 'De «%» solo quedan %', v_item.name, v_item.remaining using hint = 'limit', detail = v_item.product_id::text;
    end if;
    v_subtotal := v_subtotal + v_item.price * v_qty;
    v_lines := v_lines || jsonb_build_object('productId', v_item.product_id, 'name', v_item.name, 'quantity', v_qty, 'price', v_item.price,
                                             'note', left(v_line ->> 'note', 200), 'usesInventory', v_item.uses_inventory, 'recipeId', v_item.active_recipe_id);
  end loop;

  -- Stock, for the dishes that use inventory (the reservation itself happens when confirming).
  for v_req in
    select ri.ingredient_id, sum(ri.quantity * (l ->> 'quantity')::integer) as required, string_agg(distinct l ->> 'name', ', ') as dishes
    from jsonb_array_elements(v_lines) l
    join dk_recipe_items ri on ri.recipe_id = (l ->> 'recipeId')::uuid
    where (l ->> 'usesInventory')::boolean
    group by ri.ingredient_id
  loop
    select stock_available into v_available from dk_ingredient_stock where ingredient_id = v_req.ingredient_id;
    if coalesce(v_available, 0) < v_req.required then
      raise exception 'Se agotó: %', v_req.dishes using hint = 'stock';
    end if;
  end loop;

  if v_subtotal < sf.web_min_order then
    raise exception 'El pedido mínimo es de %', sf.web_min_order using hint = 'min_order', detail = sf.web_min_order::text;
  end if;
  v_fee := case when v_fulfillment = 'delivery' then sf.web_delivery_fee else 0 end;

  insert into dk_public_order_attempts (kitchen_id, phone, ip) values (p_kitchen, v_phone, v_ip);

  -- The customer: by phone in this account, or new; the delivery address goes to their history.
  select id into v_customer from dk_customers where kitchen_id = p_kitchen and (phone = v_phone or whatsapp_id = v_phone) limit 1;
  if v_customer is null then
    insert into dk_customers (kitchen_id, full_name, phone) values (p_kitchen, v_name, v_phone) returning id into v_customer;
  end if;
  if v_fulfillment = 'delivery' then
    update dk_customers set address = v_address where id = v_customer and address is distinct from v_address;
  end if;
  -- Consent for order notices, given when ordering (ADR 0055). Writing to the business on WhatsApp counts as well.
  if v_opt_in or p_channel = 'WHATSAPP' then
    update dk_customers
    set whatsapp_opt_in = true, whatsapp_opt_in_at = now(), whatsapp_opt_out_at = null,
        whatsapp_opt_in_source = case when p_channel = 'WHATSAPP' then 'whatsapp' else 'web' end,
        whatsapp_id = case when p_channel = 'WHATSAPP' then coalesce(whatsapp_id, v_phone) else whatsapp_id end
    where id = v_customer and (not whatsapp_opt_in or whatsapp_opt_out_at is not null or p_channel = 'WHATSAPP');
  end if;

  insert into dk_orders (kitchen_id, customer_id, channel, external_reference, notes, delivery_fee, payment_method,
                         fulfillment, delivery_address, delivery_reference, public_token)
  values (p_kitchen, v_customer, p_channel, v_key,
          nullif(concat_ws(' · ', case when v_fulfillment = 'pickup' then 'Recoge en el local' end, v_notes), ''),
          v_fee, v_payment, v_fulfillment, case when v_fulfillment = 'delivery' then v_address end,
          case when v_fulfillment = 'delivery' then v_reference end, v_token)
  returning id, order_number into v_order, v_number;

  insert into dk_order_items (order_id, product_id, quantity, unit_price, observation)
  select v_order, (l ->> 'productId')::uuid, (l ->> 'quantity')::integer, (l ->> 'price')::numeric, nullif(l ->> 'note', '')
  from jsonb_array_elements(v_lines) l;

  -- To the kitchen: the same confirmation as always. If it cannot (stock changed), it waits in «Por confirmar», flagged.
  if sf.web_auto_confirm then
    begin
      perform dk_confirm_order_internal(v_order);
      v_confirmed := true;
    exception when others then
      update dk_orders set requires_review = true where id = v_order;
    end;
  end if;

  return jsonb_build_object('orderId', v_order, 'orderNumber', v_number, 'token', v_token, 'status', case when v_confirmed then 'CONFIRMADO' else 'NUEVO' end,
                            'confirmed', v_confirmed, 'subtotal', v_subtotal, 'deliveryFee', v_fee, 'total', v_subtotal + v_fee, 'repeated', false);
exception when unique_violation then
  -- Two identical submissions at the same instant: return the one that won.
  select o.order_number, o.public_token, o.status into v_existing
  from dk_orders o where o.kitchen_id = p_kitchen and o.channel = p_channel and o.external_reference = v_key;
  if found then
    return jsonb_build_object('orderNumber', v_existing.order_number, 'token', v_existing.public_token,
                              'status', v_existing.status, 'confirmed', v_existing.status <> 'NUEVO', 'repeated', true);
  end if;
  raise;
end;
$$;
revoke all on function dk_place_order_internal(uuid, jsonb, dk_order_channel) from public, anon, authenticated;

-- The web menu: the same contract as ADR 0052, now through the shared core.
create or replace function dk_public_place_order(p_slug text, p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  v_result jsonb;
begin
  -- A robot fills the hidden field: same answer as any refusal, nothing created.
  if nullif(btrim(coalesce(p_order ->> 'website', '')), '') is not null then
    raise exception 'No pudimos recibir el pedido' using hint = 'invalid';
  end if;
  select * into a from dk_public_menu_account(p_slug);
  if not found then raise exception 'Este menú no está publicado' using hint = 'not_accepting'; end if;
  if not (a.sf).web_orders_enabled then raise exception 'Este negocio no recibe pedidos por aquí. Escríbele por WhatsApp.' using hint = 'not_accepting'; end if;
  v_result := dk_place_order_internal(a.kitchen_id, p_order, 'WEB');
  -- The browser never sees internal ids.
  return v_result - 'orderId';
end;
$$;

-- Tracking: every order that has a code (web orders, and orders notified by WhatsApp).
create or replace function dk_public_order_status(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'found', true,
    'orderNumber', o.order_number, 'status', o.status, 'fulfillment', o.fulfillment,
    'createdAt', o.created_at, 'updatedAt', o.updated_at,
    'deliveryAddress', o.delivery_address, 'paymentMethod', o.payment_method,
    'subtotal', o.subtotal, 'deliveryFee', o.delivery_fee, 'total', o.total,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'quantity', i.quantity, 'unitPrice', i.unit_price,
                                                           'lineTotal', i.line_total, 'note', i.observation) order by i.created_at), '[]')
              from dk_order_items i join dk_products p on p.id = i.product_id where i.order_id = o.id),
    'business', jsonb_build_object('name', k.name, 'slug', k.slug, 'iconKey', k.icon_key, 'whatsapp', s.whatsapp_phone,
                                   'transferInstructions', s.web_transfer_instructions, 'theme', s.web_theme))
  from dk_orders o
  join dk_kitchens k on k.id = o.kitchen_id
  left join dk_storefronts s on s.kitchen_id = k.id
  where o.public_token = p_token
$$;

-- ---------------------------------------------------------------------------
-- 10. Scheduled: wake the dispatcher for retries; clean old messages (90 days)
-- ---------------------------------------------------------------------------
create or replace function dk_wa_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from dk_wa_outbox where (status = 'queued' and next_attempt_at <= now())
                                             or (status = 'sending' and locked_at < now() - interval '2 minutes')) then
    perform dk_wa_kick();
  end if;
end;
$$;
revoke all on function dk_wa_tick() from public, anon, authenticated;

select cron.schedule('dk-wa-dispatch', '* * * * *', 'select public.dk_wa_tick()');
select cron.schedule('dk-wa-purge', '45 8 * * *', $$delete from public.dk_wa_outbox where created_at < now() - interval '90 days'$$);
