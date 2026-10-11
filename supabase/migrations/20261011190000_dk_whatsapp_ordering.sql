-- ADR 0055 (fase B) — Pedidos por WhatsApp e integración con n8n.
--
-- Inbound messages land in conversations (dk_wa_conversations / dk_wa_messages).
-- Per account, a mode decides who answers:
--   off → a person (inbox); ai → Quanela's assistant, which interprets but never
--   invents (the menu, prices and totals come from here); n8n → the account's n8n.
-- Orders are created by the same core as the web menu (dk_place_order_internal)
-- with channel WHATSAPP. n8n gets signed events through the same outbox, and can
-- answer and order through RPCs, without ever holding the Meta token.

-- ---------------------------------------------------------------------------
-- 1. The AI function, with its own daily budget (a busy WhatsApp must not starve the analyses)
-- ---------------------------------------------------------------------------
insert into dk_ai_models (key, provider, label, sort_order) values ('claude-haiku-5-5', 'anthropic', 'Claude Haiku 5.5', 15)
on conflict (key) do nothing;

insert into dk_features (key, category, label, description, uses_model, model_key, use_permission, manage_permission,
                         default_available, default_enabled, active, min_interval_seconds, settings_schema, default_settings, depends_on, sort_order)
values ('whatsapp_ordering', 'ai', 'Pedidos por WhatsApp con IA',
        'Atiende los mensajes de WhatsApp de tus clientes: entiende qué quieren pedir, lo busca en el menú de hoy, confirma el total real y crea el pedido. Nunca inventa platos ni precios; si duda, pasa la conversación a una persona.',
        true, 'claude-haiku-5-5', 'integrations.manage', 'ai.manage', true, true, true, null, '{}'::jsonb, '{}'::jsonb, '{}', 31)
on conflict (key) do nothing;

insert into dk_plan_features (plan_key, feature_key)
select p.key, 'whatsapp_ordering' from (values ('business'), ('enterprise')) p(key)
where exists (select 1 from dk_plans where key = p.key)
on conflict do nothing;

-- The general AI budget no longer counts WhatsApp turns (they have their own, below).
create or replace function dk_ai_run_allowed(p_feature_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_me uuid := dk_current_profile_id();
  v_copilot boolean := p_feature_key = 'copilot';
  v_org uuid;
  v_limits jsonb;
  v_feature dk_features;
  v_interval integer;
  v_daily integer;
  v_last timestamptz;
  v_used integer;
  v_oldest timestamptz;
begin
  if v_kitchen is null or not dk_can_use_feature(p_feature_key) then
    return jsonb_build_object('allowed', false, 'reason', 'feature', 'retryAfterSeconds', null, 'remainingToday', 0);
  end if;
  select * into v_feature from dk_features where key = p_feature_key;
  select organization_id into v_org from dk_kitchens where id = v_kitchen;
  select p.limits into v_limits from dk_subscriptions s join dk_plans p on p.key = s.plan_key where s.organization_id = v_org;
  v_interval := coalesce(v_feature.min_interval_seconds, (v_limits ->> 'ai_min_interval_seconds')::integer, 120);
  v_daily := coalesce((v_limits ->> 'ai_runs_per_day')::integer, 50);
  -- ADR 0033 (D5): Copilot has half of the plan's AI runs for itself; the analyses keep theirs.
  if v_copilot then v_daily := greatest(1, ceil(v_daily * 0.5)::integer); end if;

  -- The interval: per person for Copilot (a question each), per account for the analyses.
  -- A failed question does not make the person wait to try again (it still counts for the day).
  select max(created_at) into v_last from dk_ai_insights
  where kitchen_id = v_kitchen and feature_key = p_feature_key
    and status in ('ok', 'running', case when v_copilot then 'ok' else 'error' end)
    and (not v_copilot or created_by is not distinct from v_me);
  if v_last is not null and v_last > now() - make_interval(secs => v_interval) then
    return jsonb_build_object('allowed', false, 'reason', 'interval',
      'retryAfterSeconds', ceil(extract(epoch from (v_last + make_interval(secs => v_interval)) - now()))::integer,
      'remainingToday', null);
  end if;

  select count(*), min(created_at) into v_used, v_oldest from dk_ai_insights
  where kitchen_id = v_kitchen and status in ('ok', 'error', 'running') and created_at > now() - interval '24 hours'
    and (case when v_copilot then feature_key = 'copilot' else feature_key not in ('copilot', 'whatsapp_ordering') end);
  if v_used >= v_daily then
    return jsonb_build_object('allowed', false, 'reason', 'daily',
      'retryAfterSeconds', ceil(extract(epoch from (v_oldest + interval '24 hours') - now()))::integer,
      'remainingToday', 0);
  end if;

  return jsonb_build_object('allowed', true, 'reason', null, 'retryAfterSeconds', null, 'remainingToday', v_daily - v_used,
    'model', (select m.key from dk_ai_models m where m.key = v_feature.model_key and m.active));
end;
$$;

-- A WhatsApp turn has no person behind it: the service reserves it for the account.
-- Budget: the plan's «wa_ai_turns_per_day» (400 by default) and 20 turns per conversation every 10 minutes.
create or replace function dk_ai_run_reserve_system(p_kitchen uuid, p_conversation uuid, p_input jsonb default '{}')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limits jsonb;
  v_daily integer;
  v_used integer;
  v_model text;
  v_id uuid;
begin
  if not dk_feature_enabled(p_kitchen, 'whatsapp_ordering') then
    return jsonb_build_object('allowed', false, 'reason', 'feature');
  end if;
  select m.key into v_model from dk_features f join dk_ai_models m on m.key = f.model_key and m.active where f.key = 'whatsapp_ordering' and f.active;
  if v_model is null then return jsonb_build_object('allowed', false, 'reason', 'feature'); end if;
  perform pg_advisory_xact_lock(hashtextextended('dk_ai_run:' || p_kitchen::text || ':whatsapp_ordering', 0));
  select p.limits into v_limits from dk_kitchens k join dk_subscriptions s on s.organization_id = k.organization_id join dk_plans p on p.key = s.plan_key where k.id = p_kitchen;
  v_daily := coalesce((v_limits ->> 'wa_ai_turns_per_day')::integer, 400);
  select count(*) into v_used from dk_ai_insights
  where kitchen_id = p_kitchen and feature_key = 'whatsapp_ordering' and created_at > now() - interval '24 hours' and status in ('ok', 'error', 'running', 'empty');
  if v_used >= v_daily then return jsonb_build_object('allowed', false, 'reason', 'daily'); end if;
  if (select count(*) from dk_ai_insights
      where kitchen_id = p_kitchen and feature_key = 'whatsapp_ordering' and created_at > now() - interval '10 minutes'
        and input ->> 'conversationId' = p_conversation::text) >= 20 then
    return jsonb_build_object('allowed', false, 'reason', 'conversation');
  end if;
  insert into dk_ai_insights (kitchen_id, feature_key, status, input, model, created_by)
  values (p_kitchen, 'whatsapp_ordering', 'running', coalesce(p_input, '{}') || jsonb_build_object('conversationId', p_conversation), v_model, null)
  returning id into v_id;
  return jsonb_build_object('allowed', true, 'model', v_model, 'runId', v_id, 'remainingToday', v_daily - v_used - 1);
end;
$$;

create or replace function dk_ai_run_finish_system(p_run_id uuid, p_status text, p_output jsonb default null, p_input_tokens integer default null,
                                                   p_output_tokens integer default null, p_latency_ms integer default null, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('ok', 'empty', 'error', 'cancelled') then raise exception 'Estado de corrida no válido'; end if;
  update dk_ai_insights
  set status = p_status, output = p_output, input_tokens = p_input_tokens, output_tokens = p_output_tokens,
      latency_ms = p_latency_ms, error = left(p_error, 500)
  where id = p_run_id and status = 'running' and feature_key = 'whatsapp_ordering';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Conversations and messages
-- ---------------------------------------------------------------------------
alter table dk_wa_accounts
  add column ordering_mode text not null default 'off' check (ordering_mode in ('off', 'ai', 'n8n')),
  add column ordering_greeting text check (ordering_greeting is null or char_length(ordering_greeting) <= 300);
grant select (ordering_mode, ordering_greeting) on dk_wa_accounts to authenticated;

create table dk_wa_conversations (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references dk_kitchens (id) on delete cascade,
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  customer_id uuid references dk_customers (id) on delete set null,
  customer_name text,
  -- bot: the assistant (or n8n) answers; human: a person took it; closed.
  status text not null default 'bot' check (status in ('bot', 'human', 'closed')),
  needs_attention boolean not null default false,
  attention_reason text,
  state jsonb not null default '{}'::jsonb,
  unread integer not null default 0,
  last_inbound_at timestamptz,
  last_message_at timestamptz,
  last_order_id uuid references dk_orders (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kitchen_id, phone)
);
create index dk_wa_conversations_recent_idx on dk_wa_conversations (kitchen_id, last_message_at desc);

create table dk_wa_messages (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references dk_kitchens (id) on delete cascade,
  conversation_id uuid not null references dk_wa_conversations (id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  author text not null check (author in ('customer', 'assistant', 'staff', 'system')),
  body text,
  kind text not null default 'text',
  wamid text unique,
  outbox_id uuid references dk_wa_outbox (id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid default dk_current_profile_id() references dk_users (id) on delete set null
);
create index dk_wa_messages_conversation_idx on dk_wa_messages (conversation_id, created_at);

alter table dk_wa_conversations enable row level security;
alter table dk_wa_messages enable row level security;
create policy dk_wa_conversations_select on dk_wa_conversations for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and ((select dk_can('integrations.view')) or (select dk_can('whatsapp.reply'))));
create policy dk_wa_messages_select on dk_wa_messages for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and ((select dk_can('integrations.view')) or (select dk_can('whatsapp.reply'))));
revoke all on dk_wa_conversations, dk_wa_messages from anon, authenticated;
grant select on dk_wa_conversations, dk_wa_messages to authenticated;

-- ---------------------------------------------------------------------------
-- 3. n8n: one endpoint per account; events signed with HMAC-SHA256 (secret in Vault)
-- ---------------------------------------------------------------------------
create table dk_integration_endpoints (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null unique references dk_kitchens (id) on delete cascade,
  kind text not null default 'n8n' check (kind in ('n8n')),
  url text not null check (url ~ '^https?://[^\s]+$' and char_length(url) <= 500),
  secret_id uuid,
  events text[] not null default array['order.status_changed', 'whatsapp.message.received'],
  enabled boolean not null default true,
  last_status integer,
  last_error text,
  last_delivery_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default dk_current_profile_id() references dk_users (id) on delete set null
);
alter table dk_integration_endpoints enable row level security;
create policy dk_integration_endpoints_select on dk_integration_endpoints for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('integrations.view')));
revoke all on dk_integration_endpoints from anon, authenticated;
grant select (id, kitchen_id, kind, url, events, enabled, last_status, last_error, last_delivery_at, created_at, updated_at) on dk_integration_endpoints to authenticated;
create trigger dk_trg_audit_integration_endpoints after insert or update or delete on dk_integration_endpoints
  for each row execute function dk_audit_row();

alter table dk_wa_outbox drop constraint dk_wa_outbox_kind_check;
alter table dk_wa_outbox add constraint dk_wa_outbox_kind_check check (kind in ('template', 'text', 'webhook'));

-- An event for the account's n8n (when it listens to it). Never fails the caller.
create or replace function dk_integration_emit(p_kitchen uuid, p_event text, p_data jsonb, p_order uuid default null, p_suffix text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  e dk_integration_endpoints;
  v_id uuid;
  v_delivery uuid := gen_random_uuid();
begin
  select * into e from dk_integration_endpoints where kitchen_id = p_kitchen and enabled and (p_event = any (events) or p_event = 'integration.test');
  if not found then return null; end if;
  insert into dk_wa_outbox (kitchen_id, kind, order_id, event, recipient, payload)
  values (p_kitchen, 'webhook', p_order, 'webhook:' || p_event || coalesce(':' || p_suffix, ''), e.id::text,
          jsonb_build_object('endpointId', e.id, 'body', jsonb_build_object(
            'id', v_delivery, 'event', p_event, 'accountId', p_kitchen, 'occurredAt', now(), 'data', coalesce(p_data, '{}'::jsonb))))
  on conflict (order_id, event) where order_id is not null do nothing
  returning id into v_id;
  if v_id is not null then perform dk_wa_kick(); end if;
  return v_id;
exception when others then
  raise warning 'dk_integration_emit: %', sqlerrm;
  return null;
end;
$$;

-- The status history hook now also tells n8n (independent of the WhatsApp notices).
create or replace function dk_wa_on_status_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
begin
  begin
    perform dk_wa_enqueue_order_event(new.order_id, new.from_status, new.to_status, new.note);
  exception when others then
    raise warning 'dk_wa_on_status_history: %', sqlerrm;
  end;
  if exists (select 1 from dk_integration_endpoints where kitchen_id = new.kitchen_id and enabled and 'order.status_changed' = any (events)) then
    select ord.id, ord.order_number, ord.channel, ord.fulfillment, ord.total, ord.public_token, k.slug, c.full_name, coalesce(c.whatsapp_id, c.phone) as phone
    into o
    from dk_orders ord join dk_kitchens k on k.id = ord.kitchen_id join dk_customers c on c.id = ord.customer_id where ord.id = new.order_id;
    perform dk_integration_emit(new.kitchen_id, 'order.status_changed', jsonb_build_object(
      'orderId', o.id, 'orderNumber', o.order_number, 'status', new.to_status, 'previousStatus', new.from_status, 'note', new.note,
      'channel', o.channel, 'fulfillment', o.fulfillment, 'total', o.total,
      'customer', jsonb_build_object('name', o.full_name, 'phone', o.phone),
      'trackingPath', case when o.public_token is not null then '/menu/' || o.slug || '/pedido/' || o.public_token end),
      new.order_id, new.to_status::text);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The dispatcher also delivers n8n events; claim and mark know the endpoint
-- ---------------------------------------------------------------------------
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
    'accessToken', case when t.kind <> 'webhook' then (select decrypted_secret from vault.decrypted_secrets where id = a.access_token_id) end,
    'url', e.url,
    'secret', case when t.kind = 'webhook' then (select decrypted_secret from vault.decrypted_secrets where id = e.secret_id) end)), '[]'::jsonb)
  into v_rows
  from taken t
  left join dk_wa_accounts a on a.kitchen_id = t.kitchen_id
  left join dk_integration_endpoints e on t.kind = 'webhook' and e.id = (t.payload ->> 'endpointId')::uuid;
  return v_rows;
end;
$$;

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
    update dk_wa_outbox set wamid = p_wamid, sent_at = now(), locked_at = null, last_error = null, error_code = null,
      -- An n8n event has no read receipt: delivered is the end.
      delivered_at = case when kind = 'webhook' then now() else delivered_at end,
      status = case when kind = 'webhook' then 'delivered' else 'sent' end
    where id = p_id;
  elsif p_retryable and ob.attempts < 5 then
    update dk_wa_outbox set status = 'queued', locked_at = null, last_error = left(p_error, 500), error_code = p_error_code,
      next_attempt_at = now() + (array[interval '1 minute', interval '5 minutes', interval '15 minutes', interval '1 hour'])[least(ob.attempts, 4)]
    where id = p_id;
  else
    update dk_wa_outbox set status = 'failed', locked_at = null, last_error = left(p_error, 500), error_code = p_error_code where id = p_id;
  end if;
  if ob.kind = 'webhook' then
    update dk_integration_endpoints
    set last_status = case when p_error_code ~ '^[0-9]{3}$' then p_error_code::integer when p_ok then 200 else last_status end,
        last_error = case when p_ok then null else left(p_error, 300) end, last_delivery_at = now()
    where id = (ob.payload ->> 'endpointId')::uuid;
  end if;
end;
$$;

-- Disconnecting WhatsApp stops WhatsApp messages only (n8n events keep going).
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
  update dk_wa_outbox set status = 'skipped', last_error = 'WhatsApp desconectado'
  where kitchen_id = v_kitchen and status in ('queued', 'sending') and kind <> 'webhook';
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Inbound: a customer writes (service role, from the webhook)
-- ---------------------------------------------------------------------------
create or replace function dk_wa_reply_internal(p_conversation uuid, p_text text, p_author text default 'assistant', p_check_window boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c dk_wa_conversations;
  v_outbox uuid;
  v_message uuid;
begin
  select * into c from dk_wa_conversations where id = p_conversation;
  if not found then raise exception 'La conversación no existe'; end if;
  if nullif(btrim(p_text), '') is null then raise exception 'El mensaje está vacío'; end if;
  -- WhatsApp: free text only within 24 h of the customer's last message.
  if p_check_window and (c.last_inbound_at is null or c.last_inbound_at < now() - interval '24 hours') then
    raise exception 'Pasaron más de 24 horas desde el último mensaje del cliente: solo se puede enviar una plantilla' using hint = 'window';
  end if;
  insert into dk_wa_outbox (kitchen_id, kind, event, recipient, payload)
  values (c.kitchen_id, 'text', 'reply', c.phone, jsonb_build_object('text', left(p_text, 4096), 'conversationId', c.id))
  returning id into v_outbox;
  insert into dk_wa_messages (kitchen_id, conversation_id, direction, author, body, outbox_id)
  values (c.kitchen_id, c.id, 'out', p_author, left(p_text, 4096), v_outbox)
  returning id into v_message;
  update dk_wa_conversations set last_message_at = now(), updated_at = now() where id = c.id;
  perform dk_wa_kick();
  return v_message;
end;
$$;

create or replace function dk_wa_receive(p_phone_number_id text, p_wamid text, p_from text, p_name text, p_at timestamptz, p_type text, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  acc dk_wa_accounts;
  c dk_wa_conversations;
  v_phone text := dk_normalize_phone(p_from);
  v_customer uuid;
  v_message uuid;
  v_word text := upper(btrim(regexp_replace(coalesce(p_text, ''), '[[:punct:]]', '', 'g')));
  v_handled text;
begin
  select * into acc from dk_wa_accounts where phone_number_id = p_phone_number_id;
  if not found then return jsonb_build_object('ignored', true); end if;
  if exists (select 1 from dk_wa_messages where wamid = p_wamid) then return jsonb_build_object('duplicate', true); end if;
  if v_phone is null or v_phone !~ '^\+[1-9][0-9]{7,14}$' then return jsonb_build_object('ignored', true); end if;

  select id into v_customer from dk_customers where kitchen_id = acc.kitchen_id and (whatsapp_id = v_phone or phone = v_phone) limit 1;
  insert into dk_wa_conversations (kitchen_id, phone, customer_id, customer_name, last_inbound_at, last_message_at, unread)
  values (acc.kitchen_id, v_phone, v_customer, nullif(left(btrim(p_name), 80), ''), coalesce(p_at, now()), now(), 1)
  on conflict (kitchen_id, phone) do update
  set customer_id = coalesce(dk_wa_conversations.customer_id, excluded.customer_id),
      customer_name = coalesce(excluded.customer_name, dk_wa_conversations.customer_name),
      last_inbound_at = greatest(coalesce(dk_wa_conversations.last_inbound_at, excluded.last_inbound_at), excluded.last_inbound_at),
      last_message_at = now(), unread = dk_wa_conversations.unread + 1, updated_at = now(),
      -- A closed conversation opens again with the assistant (or n8n), a fresh cart.
      status = case when dk_wa_conversations.status = 'closed' then 'bot' else dk_wa_conversations.status end,
      state = case when dk_wa_conversations.status = 'closed' or dk_wa_conversations.last_message_at < now() - interval '4 hours'
                   then '{}'::jsonb else dk_wa_conversations.state end
  returning * into c;

  insert into dk_wa_messages (kitchen_id, conversation_id, direction, author, body, kind, wamid, created_by)
  values (acc.kitchen_id, c.id, 'in', 'customer', left(coalesce(p_text, case when p_type <> 'text' then '[' || p_type || ']' end), 4096), coalesce(p_type, 'text'), p_wamid, null)
  returning id into v_message;

  -- «BAJA» / «ALTA»: the customer decides, at once, whatever the mode.
  if v_word in ('BAJA', 'STOP', 'DETENER', 'NO MAS', 'NO MÁS') then
    update dk_customers set whatsapp_opt_in = false, whatsapp_opt_out_at = now() where kitchen_id = acc.kitchen_id and (whatsapp_id = v_phone or phone = v_phone);
    perform dk_wa_reply_internal(c.id, 'Listo, no te enviaremos más avisos por WhatsApp. Si quieres volver a recibirlos, escribe ALTA.', 'system');
    v_handled := 'opt_out';
  elsif v_word = 'ALTA' then
    update dk_customers set whatsapp_opt_in = true, whatsapp_opt_in_at = now(), whatsapp_opt_in_source = 'whatsapp', whatsapp_opt_out_at = null
    where kitchen_id = acc.kitchen_id and (whatsapp_id = v_phone or phone = v_phone);
    perform dk_wa_reply_internal(c.id, 'Listo, volverás a recibir los avisos de tus pedidos por WhatsApp.', 'system');
    v_handled := 'opt_in';
  end if;

  -- Without the assistant (or with a person in charge), the team sees it in the inbox.
  if v_handled is null and (acc.ordering_mode = 'off' or c.status = 'human' or (acc.ordering_mode = 'ai' and not dk_feature_enabled(acc.kitchen_id, 'whatsapp_ordering'))) then
    update dk_wa_conversations set needs_attention = true, attention_reason = coalesce(attention_reason, 'Mensaje nuevo') where id = c.id;
  end if;

  perform dk_integration_emit(acc.kitchen_id, 'whatsapp.message.received', jsonb_build_object(
    'conversationId', c.id, 'messageId', v_message, 'wamid', p_wamid, 'from', v_phone, 'name', c.customer_name,
    'type', p_type, 'text', p_text, 'at', coalesce(p_at, now()), 'mode', acc.ordering_mode, 'conversationStatus', c.status, 'handled', v_handled));

  return jsonb_build_object('kitchenId', acc.kitchen_id, 'conversationId', c.id, 'messageId', v_message, 'mode', acc.ordering_mode,
    'conversationStatus', c.status, 'handled', v_handled, 'aiEnabled', dk_feature_enabled(acc.kitchen_id, 'whatsapp_ordering'));
end;
$$;

-- What the assistant may know: the business, its ordering rules, today's menu (with prices, which the
-- code uses — the model only sees names), the conversation so far and the customer's last address.
create or replace function dk_wa_ai_context(p_conversation uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c dk_wa_conversations;
  sf dk_storefronts;
  k dk_kitchens;
begin
  select * into c from dk_wa_conversations where id = p_conversation;
  if not found then return null; end if;
  select * into k from dk_kitchens where id = c.kitchen_id;
  select * into sf from dk_storefronts where kitchen_id = c.kitchen_id;
  return jsonb_build_object(
    'business', jsonb_build_object('name', k.name, 'slug', k.slug, 'greeting', (select ordering_greeting from dk_wa_accounts where kitchen_id = k.id)),
    'ordering', jsonb_build_object(
      'configured', sf.kitchen_id is not null,
      'delivery', coalesce(sf.web_delivery, true), 'pickup', coalesce(sf.web_pickup, true),
      'deliveryFee', coalesce(sf.web_delivery_fee, 0), 'minOrder', coalesce(sf.web_min_order, 0),
      'paymentMethods', to_jsonb(coalesce(sf.web_payment_methods, array['Efectivo'])), 'transferInstructions', sf.web_transfer_instructions,
      'openState', dk_storefront_open_state(k.id, now())),
    'menu', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.product_id, 'name', i.name, 'description', i.description, 'category', coalesce(i.category, 'Otros'),
                                          'price', i.price, 'availability', i.availability, 'remaining', i.remaining,
                                          'availableFrom', to_char(i.start_time, 'HH24:MI')) order by i.category_order, i.display_order, i.name)
      from dk_public_menu_items(k.id) i), '[]'::jsonb),
    'conversation', jsonb_build_object('id', c.id, 'phone', c.phone, 'customerName', c.customer_name, 'state', c.state, 'status', c.status),
    'customer', (select jsonb_build_object('name', cu.full_name, 'address', cu.address) from dk_customers cu where cu.id = c.customer_id),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('direction', m.direction, 'author', m.author, 'body', m.body) order by m.created_at)
      from (select * from dk_wa_messages where conversation_id = c.id order by created_at desc limit 12) m), '[]'::jsonb));
end;
$$;

create or replace function dk_wa_save_state(p_conversation uuid, p_state jsonb, p_status text default null, p_attention text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status is not null and p_status not in ('bot', 'human', 'closed') then raise exception 'Estado no válido'; end if;
  update dk_wa_conversations
  set state = coalesce(p_state, state), status = coalesce(p_status, status),
      needs_attention = case when p_attention is not null then true else needs_attention end,
      attention_reason = coalesce(p_attention, attention_reason), updated_at = now()
  where id = p_conversation;
end;
$$;

-- An order from a WhatsApp conversation: the same core as the web menu, channel WHATSAPP, idempotent by the message.
create or replace function dk_wa_place_order(p_conversation uuid, p_order jsonb, p_idempotency text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c dk_wa_conversations;
  v_result jsonb;
begin
  select * into c from dk_wa_conversations where id = p_conversation for update;
  if not found then raise exception 'La conversación no existe'; end if;
  if nullif(btrim(p_idempotency), '') is null then raise exception 'Falta la referencia del mensaje' using hint = 'invalid'; end if;
  v_result := dk_place_order_internal(c.kitchen_id,
    coalesce(p_order, '{}'::jsonb) || jsonb_build_object(
      'idempotencyKey', p_idempotency,
      'customer', jsonb_build_object('name', coalesce(nullif(btrim(p_order #>> '{customer,name}'), ''), c.customer_name, 'Cliente WhatsApp'), 'phone', c.phone)),
    'WHATSAPP');
  update dk_wa_conversations
  set last_order_id = coalesce((v_result ->> 'orderId')::uuid, (select id from dk_orders where kitchen_id = c.kitchen_id and channel = 'WHATSAPP' and external_reference = p_idempotency)),
      customer_id = coalesce(customer_id, (select customer_id from dk_orders where kitchen_id = c.kitchen_id and channel = 'WHATSAPP' and external_reference = p_idempotency)),
      updated_at = now()
  where id = c.id;
  return v_result;
end;
$$;

revoke all on function dk_ai_run_reserve_system(uuid, uuid, jsonb), dk_ai_run_finish_system(uuid, text, jsonb, integer, integer, integer, text),
  dk_integration_emit(uuid, text, jsonb, uuid, text), dk_wa_reply_internal(uuid, text, text, boolean),
  dk_wa_receive(text, text, text, text, timestamptz, text, text), dk_wa_ai_context(uuid), dk_wa_save_state(uuid, jsonb, text, text),
  dk_wa_place_order(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function dk_ai_run_reserve_system(uuid, uuid, jsonb), dk_ai_run_finish_system(uuid, text, jsonb, integer, integer, integer, text),
  dk_wa_reply_internal(uuid, text, text, boolean), dk_wa_receive(text, text, text, text, timestamptz, text, text), dk_wa_ai_context(uuid),
  dk_wa_save_state(uuid, jsonb, text, text), dk_wa_place_order(uuid, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. The team (inbox) and n8n (its service user) — authenticated
-- ---------------------------------------------------------------------------
-- Answer a customer (within 24 h). A person answering takes the conversation (the assistant stops).
create or replace function dk_wa_send_text(p_conversation_id uuid, p_text text, p_take_over boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_wa_guard('whatsapp.reply');
  v_id uuid;
begin
  if not exists (select 1 from dk_wa_conversations where id = p_conversation_id and kitchen_id = v_kitchen) then raise exception 'La conversación no existe'; end if;
  if char_length(coalesce(p_text, '')) > 4096 then raise exception 'El mensaje es demasiado largo'; end if;
  v_id := dk_wa_reply_internal(p_conversation_id, p_text, 'staff');
  update dk_wa_messages set created_by = dk_current_profile_id() where id = v_id;
  update dk_wa_conversations
  set needs_attention = false, attention_reason = null, unread = 0,
      status = case when p_take_over then 'human' else status end, updated_at = now()
  where id = p_conversation_id;
  return v_id;
end;
$$;

-- Take the conversation (human), give it back to the assistant (bot), close it; mark it read.
create or replace function dk_wa_set_conversation(p_conversation_id uuid, p_status text default null, p_read boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_wa_guard('whatsapp.reply');
begin
  if p_status is not null and p_status not in ('bot', 'human', 'closed') then raise exception 'Estado no válido'; end if;
  update dk_wa_conversations
  set status = coalesce(p_status, status),
      needs_attention = case when p_read or p_status in ('bot', 'closed') then false else needs_attention end,
      attention_reason = case when p_read or p_status in ('bot', 'closed') then null else attention_reason end,
      unread = case when p_read then 0 else unread end,
      state = case when p_status = 'closed' then '{}'::jsonb else state end,
      updated_at = now()
  where id = p_conversation_id and kitchen_id = v_kitchen;
  if not found then raise exception 'La conversación no existe'; end if;
end;
$$;

-- n8n (or the team) orders for a conversation, with the same rules as the web menu. Needs orders.create.
create or replace function dk_wa_place_order_for(p_conversation_id uuid, p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_wa_guard('orders.create');
begin
  if not exists (select 1 from dk_wa_conversations where id = p_conversation_id and kitchen_id = v_kitchen) then raise exception 'La conversación no existe'; end if;
  return dk_wa_place_order(p_conversation_id, p_order, p_order ->> 'idempotencyKey');
end;
$$;

-- An approved template of the account to a customer who accepted (e.g. from n8n).
create or replace function dk_wa_send_template(p_to text, p_template text, p_language text default 'es', p_params text[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_wa_guard('whatsapp.reply');
  v_to text := dk_normalize_phone(p_to);
  acc dk_wa_accounts;
  v_id uuid;
begin
  select * into acc from dk_wa_accounts where kitchen_id = v_kitchen and status = 'connected';
  if not found then raise exception 'WhatsApp no está conectado'; end if;
  if v_to is null or v_to !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Revisa el número' using hint = 'invalid'; end if;
  if not exists (select 1 from dk_wa_templates where kitchen_id = v_kitchen and template_name = p_template and meta_status = 'approved') then
    raise exception 'La plantilla no está aprobada en esta cuenta' using hint = 'template';
  end if;
  if not exists (select 1 from dk_customers where kitchen_id = v_kitchen and (whatsapp_id = v_to or phone = v_to) and whatsapp_opt_in and whatsapp_opt_out_at is null) then
    raise exception 'El cliente no aceptó recibir mensajes por WhatsApp' using hint = 'consent';
  end if;
  if acc.mode = 'test' and not (v_to = any (acc.test_recipients)) then raise exception 'En modo prueba solo se envía a los números autorizados' using hint = 'not_authorized'; end if;
  insert into dk_wa_outbox (kitchen_id, kind, event, recipient, payload)
  values (v_kitchen, 'template', 'custom', v_to, jsonb_build_object('template', p_template, 'language', coalesce(p_language, 'es'), 'raw', to_jsonb(coalesce(p_params, '{}'))))
  returning id into v_id;
  perform dk_wa_kick();
  return v_id;
end;
$$;

-- The n8n endpoint: save (the secret is created once and shown once), rotate the secret, remove, test.
create or replace function dk_integration_save_endpoint(p_url text, p_events text[] default null, p_enabled boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_kitchen uuid := dk_wa_guard('integrations.manage');
  e dk_integration_endpoints;
  v_secret text;
begin
  p_url := btrim(coalesce(p_url, ''));
  if p_url !~ '^https?://[^\s]+$' or char_length(p_url) > 500 then raise exception 'Revisa la URL del webhook de n8n' using hint = 'invalid'; end if;
  if p_events is not null and exists (select 1 from unnest(p_events) x where x not in ('order.status_changed', 'whatsapp.message.received')) then
    raise exception 'Evento desconocido';
  end if;
  select * into e from dk_integration_endpoints where kitchen_id = v_kitchen for update;
  if not found then
    v_secret := 'qns_' || encode(extensions.gen_random_bytes(24), 'hex');
    insert into dk_integration_endpoints (kitchen_id, url, secret_id, events, enabled)
    values (v_kitchen, p_url, vault.create_secret(v_secret, 'dk_n8n_secret_' || v_kitchen::text, 'n8n webhook signing secret (ADR 0055)'),
            coalesce(p_events, array['order.status_changed', 'whatsapp.message.received']), coalesce(p_enabled, true));
  else
    update dk_integration_endpoints set url = p_url, events = coalesce(p_events, events), enabled = coalesce(p_enabled, enabled),
      updated_at = now(), updated_by = dk_current_profile_id()
    where id = e.id;
  end if;
  return jsonb_build_object('secret', v_secret);
end;
$$;

create or replace function dk_integration_rotate_secret()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_kitchen uuid := dk_wa_guard('integrations.manage');
  e dk_integration_endpoints;
  v_secret text := 'qns_' || encode(extensions.gen_random_bytes(24), 'hex');
begin
  select * into e from dk_integration_endpoints where kitchen_id = v_kitchen for update;
  if not found then raise exception 'Primero guarda la URL de n8n'; end if;
  perform vault.update_secret(e.secret_id, v_secret);
  update dk_integration_endpoints set updated_at = now(), updated_by = dk_current_profile_id() where id = e.id;
  return jsonb_build_object('secret', v_secret);
end;
$$;

create or replace function dk_integration_delete_endpoint()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_wa_guard('integrations.manage');
  e dk_integration_endpoints;
begin
  delete from dk_integration_endpoints where kitchen_id = v_kitchen returning * into e;
  if not found then return; end if;
  delete from vault.secrets where id = e.secret_id;
  update dk_wa_outbox set status = 'skipped', last_error = 'Integración eliminada' where kitchen_id = v_kitchen and kind = 'webhook' and status in ('queued', 'sending');
end;
$$;

create or replace function dk_integration_test()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_wa_guard('integrations.manage');
  v_id uuid;
begin
  v_id := dk_integration_emit(v_kitchen, 'integration.test', jsonb_build_object('message', 'Prueba desde Quanela', 'account', (select name from dk_kitchens where id = v_kitchen)));
  if v_id is null then raise exception 'Primero guarda la URL de n8n (y actívala)'; end if;
  return v_id;
end;
$$;

-- Ordering mode and greeting, with the rest of the WhatsApp settings.
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
  if p ? 'orderingMode' and p ->> 'orderingMode' not in ('off', 'ai', 'n8n') then raise exception 'Modo de pedidos no válido'; end if;
  if p ? 'testRecipients' then
    if jsonb_array_length(p -> 'testRecipients') > 10 then raise exception 'Máximo 10 números de prueba'; end if;
    select coalesce(array_agg(distinct n), '{}') into v_numbers
    from (select dk_normalize_phone(x) as n from jsonb_array_elements_text(p -> 'testRecipients') x) s
    where n ~ '^\+[1-9][0-9]{7,14}$';
  end if;
  update dk_wa_accounts
  set mode = coalesce(p ->> 'mode', mode),
      test_recipients = coalesce(v_numbers, test_recipients),
      notifications_enabled = coalesce((p ->> 'notificationsEnabled')::boolean, notifications_enabled),
      ordering_mode = coalesce(p ->> 'orderingMode', ordering_mode),
      ordering_greeting = case when p ? 'orderingGreeting' then nullif(left(btrim(p ->> 'orderingGreeting'), 300), '') else ordering_greeting end,
      updated_at = now(), updated_by = dk_current_profile_id()
  where kitchen_id = v_kitchen;
  if not found then raise exception 'Primero conecta tu número'; end if;
end;
$$;

create or replace function dk_wa_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
begin
  if v_kitchen is null then raise exception 'No hay una cuenta activa'; end if;
  if not (dk_can('integrations.view') or dk_can('whatsapp.reply')) then raise exception 'No autorizado para WhatsApp e Integraciones'; end if;
  return jsonb_build_object(
    'account', (select jsonb_build_object(
        'phoneNumberId', a.phone_number_id, 'wabaId', a.waba_id, 'displayPhone', a.display_phone, 'verifiedName', a.verified_name,
        'qualityRating', a.quality_rating, 'mode', a.mode, 'testRecipients', to_jsonb(a.test_recipients), 'status', a.status,
        'notificationsEnabled', a.notifications_enabled, 'hasAccessToken', a.access_token_id is not null,
        'hasAppSecret', a.app_secret_id is not null, 'hasVerifyToken', a.verify_token_hash is not null,
        'lastCheckAt', a.last_check_at, 'lastError', a.last_error, 'connectedAt', a.connected_at,
        'orderingMode', a.ordering_mode, 'orderingGreeting', a.ordering_greeting)
      from dk_wa_accounts a where a.kitchen_id = v_kitchen),
    'templates', case when dk_can('integrations.view') then coalesce((
      select jsonb_agg(jsonb_build_object(
          'event', c.event, 'enabled', coalesce(t.enabled, c.enabled_default), 'templateName', coalesce(t.template_name, c.template_name),
          'language', coalesce(t.language, 'es'), 'body', coalesce(t.body, c.body), 'params', to_jsonb(coalesce(t.params, c.params)),
          'suggested', coalesce(t.template_name, c.template_name) = c.template_name,
          'metaStatus', coalesce(t.meta_status, 'not_created'), 'metaReason', t.meta_reason) order by c.sort_order)
      from dk_wa_template_catalog() c left join dk_wa_templates t on t.kitchen_id = v_kitchen and t.event = c.event), '[]'::jsonb) else '[]'::jsonb end,
    'endpoint', (select jsonb_build_object('url', e.url, 'events', to_jsonb(e.events), 'enabled', e.enabled, 'lastStatus', e.last_status,
                                           'lastError', e.last_error, 'lastDeliveryAt', e.last_delivery_at)
                 from dk_integration_endpoints e where e.kitchen_id = v_kitchen and dk_can('integrations.view')),
    'featureEnabled', dk_feature_enabled(v_kitchen, 'whatsapp_notifications'),
    'orderingFeatureEnabled', dk_feature_enabled(v_kitchen, 'whatsapp_ordering'),
    'orderingConfigured', exists (select 1 from dk_storefronts where kitchen_id = v_kitchen),
    'canManage', dk_can('integrations.manage'),
    'canReply', dk_can('whatsapp.reply'),
    'counts', (select jsonb_build_object(
        'today', count(*) filter (where created_at > now() - interval '1 day' and kind <> 'webhook'),
        'failed', count(*) filter (where status = 'failed' and created_at > now() - interval '7 days'),
        'delivered', count(*) filter (where status in ('delivered', 'read') and created_at > now() - interval '7 days' and kind <> 'webhook'),
        'attention', (select count(*) from dk_wa_conversations where kitchen_id = v_kitchen and needs_attention))
      from dk_wa_outbox where kitchen_id = v_kitchen));
end;
$$;

revoke all on function dk_wa_send_text(uuid, text, boolean), dk_wa_set_conversation(uuid, text, boolean), dk_wa_place_order_for(uuid, jsonb),
  dk_wa_send_template(text, text, text, text[]), dk_integration_save_endpoint(text, text[], boolean), dk_integration_rotate_secret(),
  dk_integration_delete_endpoint(), dk_integration_test() from public, anon;
grant execute on function dk_wa_send_text(uuid, text, boolean), dk_wa_set_conversation(uuid, text, boolean), dk_wa_place_order_for(uuid, jsonb),
  dk_wa_send_template(text, text, text, text[]), dk_integration_save_endpoint(text, text[], boolean), dk_integration_rotate_secret(),
  dk_integration_delete_endpoint(), dk_integration_test() to authenticated;

-- WhatsApp orders: the same idempotency guarantee as the web menu.
create unique index if not exists dk_orders_whatsapp_idempotency_key on dk_orders (kitchen_id, external_reference)
  where channel = 'WHATSAPP' and external_reference is not null;

-- Messages are kept 90 days, like the notices.
select cron.schedule('dk-wa-purge-messages', '50 8 * * *', $$delete from public.dk_wa_messages where created_at < now() - interval '90 days'$$);
