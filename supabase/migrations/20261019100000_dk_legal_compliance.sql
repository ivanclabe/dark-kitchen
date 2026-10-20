-- ADR 0071: Colombian compliance (Ley 1581 de 2012, Decreto 1074 de 2015, Ley 1480 de 2011, Ley 527 de 1999).
--
-- 1. Business days with Colombian holidays (Ley 51 de 1983 and Easter-based feasts), for legal deadlines.
-- 2. Immutable evidence: legal documents (versions + SHA-256 of the exact text), users' acceptances,
--    and the consents of each business's customers. Append-only: no UPDATE/DELETE/TRUNCATE for anyone,
--    and every row is chained to the previous one with a SHA-256, so any later edit is detectable.
-- 3. PQR with radicado (consultas, reclamos, reembolso o retracto) and their legal deadlines.
-- 4. Data-subject tools: export my data, anonymize a business's customer.
-- 5. Consent at collection: public-menu orders (checkbox), WhatsApp orders (notice + conduct),
--    WhatsApp notices opt-in history, and dietary preferences only with the customer's express authorization.

-- ---------------------------------------------------------------------------
-- 1. Business days (Colombia)
-- ---------------------------------------------------------------------------

-- Holidays of a year: fixed dates, the ones Ley 51 de 1983 moves to the next Monday, and the Easter-based ones.
create or replace function dk_co_holidays(p_year integer)
returns setof date
language plpgsql
immutable
as $$
declare
  a integer := p_year % 19;
  b integer := p_year / 100;
  c integer := p_year % 100;
  d integer;
  e integer;
  f integer;
  g integer;
  h integer;
  i integer;
  k integer;
  l integer;
  m integer;
  v_easter date;
begin
  -- Easter Sunday (anonymous Gregorian algorithm).
  d := b / 4; e := b % 4; f := (b + 8) / 25; g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30; i := c / 4; k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7; m := (a + 11 * h + 22 * l) / 451;
  v_easter := make_date(p_year, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);

  return query
    select x from (values (make_date(p_year, 1, 1)), (make_date(p_year, 5, 1)), (make_date(p_year, 7, 20)),
                          (make_date(p_year, 8, 7)), (make_date(p_year, 12, 8)), (make_date(p_year, 12, 25)),
                          (v_easter - 3), (v_easter - 2)) fixed(x)
    union
    -- Moved to the next Monday (a Monday stays).
    select x + ((8 - extract(isodow from x)::integer) % 7)
    from (values (make_date(p_year, 1, 6)), (make_date(p_year, 3, 19)), (make_date(p_year, 6, 29)),
                 (make_date(p_year, 8, 15)), (make_date(p_year, 10, 12)), (make_date(p_year, 11, 1)),
                 (make_date(p_year, 11, 11)), (v_easter + 39), (v_easter + 60), (v_easter + 68)) moved(x);
end;
$$;

comment on function dk_co_holidays(integer) is 'Festivos de Colombia de un año (fijos, Ley 51 de 1983 y los que dependen de la Pascua). ADR 0071.';

create or replace function dk_is_business_day(p_day date)
returns boolean
language sql
immutable
as $$
  select extract(isodow from p_day) < 6
     and not exists (select 1 from dk_co_holidays(extract(year from p_day)::integer) h where h = p_day);
$$;

-- The term starts the day after it is filed (Bogotá date) and counts business days only.
create or replace function dk_add_business_days(p_from timestamptz, p_days integer)
returns date
language plpgsql
stable
as $$
declare
  v_day date := (p_from at time zone 'America/Bogota')::date;
  v_count integer := 0;
begin
  while v_count < p_days loop
    v_day := v_day + 1;
    if dk_is_business_day(v_day) then v_count := v_count + 1; end if;
  end loop;
  return v_day;
end;
$$;

comment on function dk_add_business_days(timestamptz, integer) is 'Vence un plazo de N días hábiles (sin sábados, domingos ni festivos de Colombia), contados desde el día siguiente. ADR 0071.';

-- ---------------------------------------------------------------------------
-- 2. Evidence helpers: immutable rows chained by SHA-256
-- ---------------------------------------------------------------------------

create or replace function dk_guard_evidence()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Los registros de % son evidencia: no se modifican ni se borran', tg_table_name
    using errcode = '42501', hint = 'immutable_evidence';
end;
$$;

-- Each new row stores the hash of the previous one and its own (prev hash + the row as JSON),
-- so editing or removing a row breaks the chain from there on (dk_verify_evidence_chain).
create or replace function dk_evidence_chain()
returns trigger
language plpgsql
as $$
declare
  v_prev text;
begin
  perform pg_advisory_xact_lock(hashtext('dk_evidence_chain:' || tg_table_name));
  execute format('select row_sha256 from %I order by id desc limit 1', tg_table_name) into v_prev;
  new.prev_sha256 := v_prev;
  new.row_sha256 := encode(sha256(convert_to(coalesce(v_prev, '') || '|' || ((to_jsonb(new) - 'row_sha256' - 'prev_sha256')::text), 'UTF8')), 'hex');
  return new;
end;
$$;

-- First row whose chain does not match (null = intact). Platform superusers only.
create or replace function dk_verify_evidence_chain(p_table text)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  v_prev text;
begin
  perform dk_require_global_admin();
  if p_table not in ('dk_legal_acceptances', 'dk_customer_consents', 'dk_pqr_events') then
    raise exception 'Tabla sin cadena de evidencia' using hint = 'invalid';
  end if;
  for r in execute format('select id, row_sha256, prev_sha256, to_jsonb(t) - ''row_sha256'' - ''prev_sha256'' as body from %I t order by id', p_table) loop
    if r.prev_sha256 is distinct from v_prev
       or r.row_sha256 <> encode(sha256(convert_to(coalesce(v_prev, '') || '|' || r.body::text, 'UTF8')), 'hex') then
      return r.id;
    end if;
    v_prev := r.row_sha256;
  end loop;
  return null;
end;
$$;

revoke all on function dk_verify_evidence_chain(text) from public, anon;
grant execute on function dk_verify_evidence_chain(text) to authenticated;

-- Client IP (first hop of x-forwarded-for) and user agent of the current request: proportional evidence.
create or replace function dk_request_ip()
returns text
language sql
stable
as $$
  select nullif(btrim(split_part(coalesce(dk_request_header('x-forwarded-for'), ''), ',', 1)), '');
$$;

create or replace function dk_request_user_agent()
returns text
language sql
stable
as $$
  select left(nullif(btrim(coalesce(dk_request_header('user-agent'), '')), ''), 400);
$$;

-- ---------------------------------------------------------------------------
-- 3. Legal documents and users' acceptances
-- ---------------------------------------------------------------------------

create table dk_legal_documents (
  slug text not null,
  version text not null,
  title text not null,
  effective_date date not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  -- required: every user accepts it; billing: accepted when authorizing automatic renewal;
  -- customers: the business's customers (public menu, WhatsApp); informational: nobody accepts it.
  acceptance text not null check (acceptance in ('required', 'billing', 'customers', 'informational')),
  requires_reacceptance boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (slug, version)
);

comment on table dk_legal_documents is 'Versiones publicadas de los documentos legales (content/legal) con el SHA-256 del texto exacto. Solo las agrega una migración; nunca se modifican. ADR 0071.';

create trigger dk_legal_documents_immutable
  before update or delete on dk_legal_documents
  for each row execute function dk_guard_evidence();

alter table dk_legal_documents enable row level security;
create policy dk_legal_documents_read on dk_legal_documents for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on dk_legal_documents from anon, authenticated;

-- The version in force today: the latest whose effective date has arrived.
create or replace function dk_current_legal_document(p_slug text)
returns dk_legal_documents
language sql
stable
security definer
set search_path = public
as $$
  select * from dk_legal_documents
  where slug = p_slug and effective_date <= (now() at time zone 'America/Bogota')::date
  order by effective_date desc, created_at desc
  limit 1;
$$;

create table dk_legal_acceptances (
  id bigint generated always as identity primary key,
  -- No foreign keys to people or businesses: the evidence outlives the account (10 years).
  auth_user_id uuid not null,
  user_id uuid,
  subject_email text,
  organization_id uuid,
  kitchen_id uuid,
  document_slug text not null,
  document_version text not null,
  content_sha256 text not null,
  action text not null check (action in ('accepted', 'declined', 'withdrawn')),
  context text not null check (context in ('signup', 'activation', 'app_gate', 'reacceptance', 'billing_renewal')),
  method text not null check (method in ('checkbox', 'button')),
  -- When the person did it (for an e-mail sign-up: when the account was created, right after ticking),
  -- and when the server recorded it.
  consented_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  client_ip text,
  user_agent text,
  details jsonb not null default '{}',
  prev_sha256 text,
  row_sha256 text not null,
  foreign key (document_slug, document_version) references dk_legal_documents (slug, version)
);

comment on table dk_legal_acceptances is 'Evidencia de aceptación de los documentos legales (Ley 1581 art. 9 y 17 b; Ley 1480 art. 50; Ley 527 de 1999). Solo inserción, encadenada con SHA-256; se conserva 10 años. ADR 0071.';

create index dk_legal_acceptances_user on dk_legal_acceptances (auth_user_id, document_slug, document_version);
create index dk_legal_acceptances_org on dk_legal_acceptances (organization_id) where organization_id is not null;

create trigger dk_legal_acceptances_chain
  before insert on dk_legal_acceptances
  for each row execute function dk_evidence_chain();
create trigger dk_legal_acceptances_immutable
  before update or delete on dk_legal_acceptances
  for each row execute function dk_guard_evidence();
create trigger dk_legal_acceptances_no_truncate
  before truncate on dk_legal_acceptances
  for each statement execute function dk_guard_evidence();

alter table dk_legal_acceptances enable row level security;
create policy dk_legal_acceptances_read on dk_legal_acceptances for select to authenticated
  using (auth_user_id = (select auth.uid()) or (select dk_is_superadmin()));
revoke insert, update, delete, truncate on dk_legal_acceptances from anon, authenticated;

-- Records the acceptance of the given documents by the signed-in person. Each one must be the
-- version in force (a stale page gets 'stale_version' and shows the new text).
create or replace function dk_record_legal_acceptance(p_documents jsonb, p_context text, p_details jsonb default '{}', p_organization_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_user record;
  v_doc jsonb;
  v_current dk_legal_documents;
  v_consented timestamptz := now();
  v_count integer := 0;
begin
  if v_uid is null then raise exception 'Inicia sesión para continuar' using errcode = '42501'; end if;
  if p_context not in ('signup', 'activation', 'app_gate', 'reacceptance', 'billing_renewal') then
    raise exception 'Contexto de aceptación inválido' using hint = 'invalid';
  end if;
  if jsonb_typeof(p_documents) <> 'array' or jsonb_array_length(p_documents) = 0 then
    raise exception 'Indica los documentos aceptados' using hint = 'invalid';
  end if;
  if p_context = 'billing_renewal' and not dk_has_org_permission(p_organization_id, 'billing.manage') then
    raise exception 'No puedes autorizar cobros de este negocio' using errcode = '42501';
  end if;
  if p_organization_id is not null and p_context <> 'billing_renewal' and not dk_has_org_permission(p_organization_id, 'organization.view') then
    raise exception 'No perteneces a este negocio' using errcode = '42501';
  end if;

  select au.email, au.created_at, u.id as profile_id into v_user
  from auth.users au left join dk_users u on u.auth_user_id = au.id
  where au.id = v_uid;

  -- An e-mail sign-up ticks the boxes before the account exists; it is recorded once the address is confirmed.
  if p_context = 'signup' and v_user.created_at > now() - interval '7 days' then
    v_consented := least(v_user.created_at, now());
  end if;

  for v_doc in select x from jsonb_array_elements(p_documents) x loop
    v_current := dk_current_legal_document(v_doc ->> 'slug');
    if v_current.slug is null then raise exception 'Documento desconocido: %', v_doc ->> 'slug' using hint = 'invalid'; end if;
    if v_current.version <> (v_doc ->> 'version') then
      raise exception 'Hay una versión nueva de «%». Revísala antes de aceptarla.', v_current.title
        using hint = 'stale_version', detail = v_current.slug;
    end if;
    if v_current.acceptance not in ('required', 'billing') then
      raise exception '«%» no se acepta: es informativo', v_current.title using hint = 'invalid';
    end if;
    insert into dk_legal_acceptances (auth_user_id, user_id, subject_email, organization_id, document_slug, document_version,
                                      content_sha256, action, context, method, consented_at, client_ip, user_agent, details)
    values (v_uid, v_user.profile_id, v_user.email, p_organization_id, v_current.slug, v_current.version,
            v_current.content_sha256, 'accepted', p_context, 'checkbox', v_consented, dk_request_ip(), dk_request_user_agent(),
            coalesce(p_details, '{}') || case when v_consented < now() - interval '1 minute'
                                              then jsonb_build_object('consented_at_source', 'auth_user_created_at') else '{}' end);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function dk_record_legal_acceptance(jsonb, text, jsonb, uuid) from public, anon;
grant execute on function dk_record_legal_acceptance(jsonb, text, jsonb, uuid) to authenticated;

-- What the signed-in person must accept before using the app: documents they never accepted,
-- or a new version published with requires_reacceptance. Old acceptances are never touched.
create or replace function dk_my_pending_legal_documents()
returns table (slug text, version text, title text, effective_date date, reason text)
language sql
stable
security definer
set search_path = public
as $$
  select d.slug, d.version, d.title, d.effective_date,
         case when not exists (select 1 from dk_legal_acceptances a where a.auth_user_id = auth.uid()
                                 and a.document_slug = d.slug and a.action = 'accepted')
              then 'first' else 'new_version' end
  from (select distinct slug from dk_legal_documents where acceptance = 'required') s
  cross join lateral dk_current_legal_document(s.slug) d
  where auth.uid() is not null
    and d.slug is not null
    and not exists (select 1 from dk_legal_acceptances a where a.auth_user_id = auth.uid()
                      and a.document_slug = d.slug and a.document_version = d.version and a.action = 'accepted')
    and (d.requires_reacceptance
         or not exists (select 1 from dk_legal_acceptances a where a.auth_user_id = auth.uid()
                          and a.document_slug = d.slug and a.action = 'accepted'))
  order by d.slug;
$$;

revoke all on function dk_my_pending_legal_documents() from public, anon;
grant execute on function dk_my_pending_legal_documents() to authenticated;

-- The person's own acceptance history (Ley 1581 art. 8 b: proof of the authorization).
create or replace function dk_my_legal_acceptances()
returns table (document_slug text, document_version text, title text, action text, context text, consented_at timestamptz, recorded_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.document_slug, a.document_version, d.title, a.action, a.context, a.consented_at, a.recorded_at
  from dk_legal_acceptances a join dk_legal_documents d on d.slug = a.document_slug and d.version = a.document_version
  where a.auth_user_id = auth.uid()
  order by a.id desc;
$$;

revoke all on function dk_my_legal_acceptances() from public, anon;
grant execute on function dk_my_legal_acceptances() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Consents of each business's customers (Quanela is the Encargado; the business, the Responsable)
-- ---------------------------------------------------------------------------

create table dk_customer_consents (
  id bigint generated always as identity primary key,
  kitchen_id uuid not null,
  customer_id uuid,
  order_id uuid,
  channel text not null check (channel in ('public_menu', 'whatsapp', 'staff')),
  purpose text not null check (purpose in ('order_processing', 'whatsapp_notices', 'sensitive_preferences')),
  action text not null check (action in ('granted', 'withdrawn')),
  -- checkbox: ticked by the customer; conduct: kept ordering after the notice (D1074 2.2.2.25.2.4);
  -- staff_declared: a staff member declared the customer authorized it.
  method text not null check (method in ('checkbox', 'conduct', 'staff_declared')),
  document_slug text,
  document_version text,
  -- How the business identified itself at that moment (the policy text is built from it).
  kitchen_snapshot jsonb not null default '{}',
  recorded_at timestamptz not null default now(),
  recorded_by uuid,
  client_ip text,
  user_agent text,
  details jsonb not null default '{}',
  prev_sha256 text,
  row_sha256 text not null
);

comment on table dk_customer_consents is 'Autorizaciones de los clientes de cada negocio (pedido web, WhatsApp, avisos y preferencias sensibles). Solo inserción, encadenada con SHA-256. ADR 0071.';

create index dk_customer_consents_customer on dk_customer_consents (kitchen_id, customer_id);

create trigger dk_customer_consents_chain
  before insert on dk_customer_consents
  for each row execute function dk_evidence_chain();
create trigger dk_customer_consents_immutable
  before update or delete on dk_customer_consents
  for each row execute function dk_guard_evidence();
create trigger dk_customer_consents_no_truncate
  before truncate on dk_customer_consents
  for each statement execute function dk_guard_evidence();

alter table dk_customer_consents enable row level security;
create policy dk_customer_consents_read on dk_customer_consents for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('customers.view')));
revoke insert, update, delete, truncate on dk_customer_consents from anon, authenticated;

create or replace function dk_kitchen_privacy_snapshot(p_kitchen uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('name', k.name, 'legalName', coalesce(k.legal_name, o.legal_name), 'taxId', coalesce(k.tax_id, o.tax_id),
                            'phone', coalesce(k.phone, o.phone), 'address', coalesce(k.address, o.address), 'city', o.city)
  from dk_kitchens k left join dk_organizations o on o.id = k.organization_id
  where k.id = p_kitchen;
$$;

create or replace function dk_record_customer_consent(p_kitchen uuid, p_customer uuid, p_order uuid, p_channel text, p_purpose text,
                                                      p_action text, p_method text, p_details jsonb default '{}')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc dk_legal_documents := dk_current_legal_document('politica-cocina');
begin
  insert into dk_customer_consents (kitchen_id, customer_id, order_id, channel, purpose, action, method, document_slug, document_version,
                                    kitchen_snapshot, recorded_by, client_ip, user_agent, details)
  values (p_kitchen, p_customer, p_order, p_channel, p_purpose, p_action, p_method, v_doc.slug, v_doc.version,
          coalesce(dk_kitchen_privacy_snapshot(p_kitchen), '{}'), dk_current_profile_id(),
          case when p_channel = 'public_menu' then dk_request_ip() end,
          case when p_channel = 'public_menu' then dk_request_user_agent() end,
          coalesce(p_details, '{}'));
end;
$$;

revoke all on function dk_record_customer_consent(uuid, uuid, uuid, text, text, text, text, jsonb) from public, anon, authenticated;

-- What the public menu shows in the business's privacy policy (it identifies the Responsable, Ley 1581 art. 12 d).
create or replace function dk_public_kitchen_privacy(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a record;
begin
  select * into a from dk_public_menu_account(p_slug);
  if not found then return null; end if;
  return dk_kitchen_privacy_snapshot(a.kitchen_id);
end;
$$;

revoke all on function dk_public_kitchen_privacy(text) from public;
grant execute on function dk_public_kitchen_privacy(text) to anon, authenticated;

-- Public-menu order: the customer ticks the authorization (it is checked here, not only in the browser).
create or replace function dk_public_place_order(p_slug text, p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  v_result jsonb;
  v_customer uuid;
begin
  -- A robot fills the hidden field: same answer as any refusal, nothing created.
  if nullif(btrim(coalesce(p_order ->> 'website', '')), '') is not null then
    raise exception 'No pudimos recibir el pedido' using hint = 'invalid';
  end if;
  select * into a from dk_public_menu_account(p_slug);
  if not found then raise exception 'Este menú no está publicado' using hint = 'not_accepting'; end if;
  if not (a.sf).web_orders_enabled then raise exception 'Este negocio no recibe pedidos por aquí. Escríbele por WhatsApp.' using hint = 'not_accepting'; end if;
  -- ADR 0071: prior, express and informed authorization (Ley 1581 art. 9).
  if coalesce((p_order ->> 'privacyAccepted')::boolean, false) is not true then
    raise exception 'Para enviar tu pedido, acepta la política de tratamiento de datos del negocio' using hint = 'privacy_required';
  end if;
  v_result := dk_place_order_internal(a.kitchen_id, p_order, 'WEB');
  if not coalesce((v_result ->> 'repeated')::boolean, false) then
    select customer_id into v_customer from dk_orders where id = (v_result ->> 'orderId')::uuid;
    perform dk_record_customer_consent(a.kitchen_id, v_customer, (v_result ->> 'orderId')::uuid, 'public_menu', 'order_processing',
                                       'granted', 'checkbox', '{}');
  end if;
  -- The browser never sees internal ids.
  return v_result - 'orderId';
end;
$$;

-- WhatsApp: the assistant's first message carries the business's policy link; ordering after it is the
-- unequivocal conduct (D1074 2.2.2.25.2.4). Recorded with each order taken there.
create or replace function dk_orders_whatsapp_consent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform dk_record_customer_consent(new.kitchen_id, new.customer_id, new.id, 'whatsapp', 'order_processing', 'granted', 'conduct', '{}');
  return new;
end;
$$;

create trigger dk_orders_whatsapp_consent
  after insert on dk_orders
  for each row when (new.channel = 'WHATSAPP')
  execute function dk_orders_whatsapp_consent();

-- Order notices by WhatsApp: every change of the opt-in leaves its trace (the columns only keep the latest).
create or replace function dk_customers_whatsapp_consent_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and not new.whatsapp_opt_in then return new; end if;
  if tg_op = 'UPDATE' and new.whatsapp_opt_in is not distinct from old.whatsapp_opt_in then return new; end if;
  if new.whatsapp_opt_in then
    -- Granted where the source says (the public menu's box, writing on WhatsApp, or staff on request).
    perform dk_record_customer_consent(
      new.kitchen_id, new.id, null,
      case new.whatsapp_opt_in_source when 'web' then 'public_menu' when 'whatsapp' then 'whatsapp' else 'staff' end,
      'whatsapp_notices', 'granted',
      case new.whatsapp_opt_in_source when 'web' then 'checkbox' when 'whatsapp' then 'conduct' else 'staff_declared' end,
      '{}');
  else
    -- Withdrawn by a staff member in the app, or by the customer's own «BAJA» on WhatsApp (no session).
    perform dk_record_customer_consent(
      new.kitchen_id, new.id, null,
      case when dk_current_profile_id() is not null then 'staff' else 'whatsapp' end,
      'whatsapp_notices', 'withdrawn',
      case when dk_current_profile_id() is not null then 'staff_declared' else 'conduct' end,
      '{}');
  end if;
  return new;
end;
$$;

create trigger dk_customers_whatsapp_consent_history
  after insert or update of whatsapp_opt_in on dk_customers
  for each row execute function dk_customers_whatsapp_consent_history();

-- Dietary preferences may reveal health or religion (sensitive data, Ley 1581 arts. 5-6): a new one needs
-- the staff member to declare the customer's express authorization, and that declaration is recorded.
alter table dk_customer_preferences add column authorized_by_customer boolean not null default false;
comment on column dk_customer_preferences.authorized_by_customer is 'Preferencia alimentaria: el personal declaró que el cliente la autorizó expresamente (dato sensible). ADR 0071.';

create or replace function dk_customer_preferences_sensitive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind <> 'dietary' then return new; end if;
  if not new.authorized_by_customer then
    raise exception 'Para guardar una preferencia alimentaria, confirma que el cliente te autorizó expresamente'
      using hint = 'consent_required';
  end if;
  if tg_op = 'INSERT' then
    perform dk_record_customer_consent(new.kitchen_id, new.customer_id, null, 'staff', 'sensitive_preferences', 'granted', 'staff_declared',
                                       jsonb_build_object('label', new.label));
  end if;
  return new;
end;
$$;

create trigger dk_customer_preferences_sensitive
  before insert on dk_customer_preferences
  for each row execute function dk_customer_preferences_sensitive();

-- ---------------------------------------------------------------------------
-- 5. PQR with radicado
-- ---------------------------------------------------------------------------

create table dk_pqr_counters (
  year integer primary key,
  last_number integer not null default 0
);
alter table dk_pqr_counters enable row level security;
revoke all on dk_pqr_counters from anon, authenticated;

create table dk_pqr_requests (
  id uuid primary key default gen_random_uuid(),
  radicado text not null unique,
  auth_user_id uuid not null,
  user_id uuid,
  requester_email text,
  organization_id uuid,
  kind text not null check (kind in ('consulta', 'reclamo', 'rectificacion', 'supresion', 'revocatoria', 'reembolso', 'retracto', 'queja')),
  description text not null check (char_length(btrim(description)) between 10 and 4000),
  legal_basis text not null,
  due_date date not null,
  extended_due_date date,
  status text not null default 'radicada' check (status in ('radicada', 'en_tramite', 'incompleta', 'respondida', 'cerrada')),
  response text check (response is null or char_length(response) <= 8000),
  answered_at timestamptz,
  details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table dk_pqr_requests is 'Solicitudes (consultas y reclamos de datos personales, reembolso o retracto, quejas) con radicado y plazo legal. Lo presentado no cambia; su historia queda en dk_pqr_events. ADR 0071.';

create index dk_pqr_requests_user on dk_pqr_requests (auth_user_id, created_at desc);
create index dk_pqr_requests_open on dk_pqr_requests (status, due_date) where status not in ('respondida', 'cerrada');

-- What was filed never changes: only the handling (state, answer, extension) moves.
create or replace function dk_pqr_requests_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Las solicitudes radicadas no se borran' using errcode = '42501', hint = 'immutable_evidence';
  end if;
  if (new.radicado, new.auth_user_id, new.user_id, new.requester_email, new.organization_id, new.kind, new.description,
      new.legal_basis, new.due_date, new.created_at, new.details)
     is distinct from
     (old.radicado, old.auth_user_id, old.user_id, old.requester_email, old.organization_id, old.kind, old.description,
      old.legal_basis, old.due_date, old.created_at, old.details) then
    raise exception 'Lo radicado en una solicitud no se modifica' using errcode = '42501', hint = 'immutable_evidence';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger dk_pqr_requests_guard
  before update or delete on dk_pqr_requests
  for each row execute function dk_pqr_requests_guard();

alter table dk_pqr_requests enable row level security;
create policy dk_pqr_requests_read on dk_pqr_requests for select to authenticated
  using (auth_user_id = (select auth.uid()) or (select dk_is_superadmin()));
revoke insert, update, delete, truncate on dk_pqr_requests from anon, authenticated;

create table dk_pqr_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references dk_pqr_requests (id),
  event text not null check (event in ('filed', 'status', 'extended', 'answered', 'note')),
  status text,
  message text,
  actor_auth_user_id uuid,
  recorded_at timestamptz not null default now(),
  prev_sha256 text,
  row_sha256 text not null
);

comment on table dk_pqr_events is 'Historia de cada solicitud (radicada, en trámite, prórroga, respuesta). Solo inserción, encadenada con SHA-256. ADR 0071.';

create index dk_pqr_events_request on dk_pqr_events (request_id, id);

create trigger dk_pqr_events_chain
  before insert on dk_pqr_events
  for each row execute function dk_evidence_chain();
create trigger dk_pqr_events_immutable
  before update or delete on dk_pqr_events
  for each row execute function dk_guard_evidence();
create trigger dk_pqr_events_no_truncate
  before truncate on dk_pqr_events
  for each statement execute function dk_guard_evidence();

alter table dk_pqr_events enable row level security;
create policy dk_pqr_events_read on dk_pqr_events for select to authenticated
  using ((select dk_is_superadmin())
         or exists (select 1 from dk_pqr_requests r where r.id = request_id and r.auth_user_id = (select auth.uid())));
revoke insert, update, delete, truncate on dk_pqr_events from anon, authenticated;

-- Files a request. Data-protection terms: Ley 1581 art. 14 (consulta, 10 business days) and art. 15
-- (reclamo, 15); refunds, withdrawal and complaints: 15 business days.
create or replace function dk_create_pqr(p_kind text, p_description text, p_organization_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_user record;
  v_year integer := extract(year from now() at time zone 'America/Bogota')::integer;
  v_number integer;
  v_radicado text;
  v_days integer;
  v_basis text;
  v_details jsonb := '{}';
  v_first_payment timestamptz;
  v_id uuid;
  v_due date;
begin
  if v_uid is null then raise exception 'Inicia sesión para continuar' using errcode = '42501'; end if;
  if p_kind not in ('consulta', 'reclamo', 'rectificacion', 'supresion', 'revocatoria', 'reembolso', 'retracto', 'queja') then
    raise exception 'Tipo de solicitud inválido' using hint = 'invalid';
  end if;
  if char_length(btrim(coalesce(p_description, ''))) < 10 then
    raise exception 'Cuéntanos tu solicitud con un poco más de detalle' using hint = 'invalid';
  end if;
  if char_length(p_description) > 4000 then raise exception 'La solicitud es muy larga (máximo 4.000 caracteres)' using hint = 'invalid'; end if;
  if (select count(*) from dk_pqr_requests where auth_user_id = v_uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Ya radicaste varias solicitudes hoy. Te responderemos pronto.' using hint = 'rate_limited';
  end if;

  if p_kind in ('reembolso', 'retracto') then
    if not dk_has_org_permission(p_organization_id, 'billing.manage') then
      raise exception 'Solo quien administra la facturación del negocio puede pedir un reembolso' using errcode = '42501';
    end if;
    select min(p.created_at) into v_first_payment
    from dk_billing_payments p
    where p.organization_id = p_organization_id and p.status = 'APPROVED';
    v_details := jsonb_build_object('firstPaymentAt', v_first_payment,
                                    'withdrawalDeadline', case when v_first_payment is not null then dk_add_business_days(v_first_payment, 5) end);
  elsif p_organization_id is not null and not dk_has_org_permission(p_organization_id, 'organization.view') then
    raise exception 'No perteneces a este negocio' using errcode = '42501';
  end if;

  v_days := case p_kind when 'consulta' then 10 else 15 end;
  v_basis := case
    when p_kind = 'consulta' then 'Ley 1581 de 2012, art. 14'
    when p_kind in ('reclamo', 'rectificacion', 'supresion', 'revocatoria') then 'Ley 1581 de 2012, art. 15'
    when p_kind = 'retracto' then 'Ley 1480 de 2011, art. 47; Política de Cancelaciones y Reembolsos'
    when p_kind = 'reembolso' then 'Política de Cancelaciones y Reembolsos'
    else 'Ley 1480 de 2011, art. 50 lit. g' end;

  select au.email, u.id as profile_id into v_user
  from auth.users au left join dk_users u on u.auth_user_id = au.id where au.id = v_uid;

  insert into dk_pqr_counters (year, last_number) values (v_year, 1)
  on conflict (year) do update set last_number = dk_pqr_counters.last_number + 1
  returning last_number into v_number;
  v_radicado := format('PQR-%s-%s', v_year, lpad(v_number::text, 5, '0'));
  v_due := dk_add_business_days(now(), v_days);

  insert into dk_pqr_requests (radicado, auth_user_id, user_id, requester_email, organization_id, kind, description, legal_basis, due_date, details)
  values (v_radicado, v_uid, v_user.profile_id, v_user.email, p_organization_id, p_kind, btrim(p_description), v_basis, v_due, v_details)
  returning id into v_id;
  insert into dk_pqr_events (request_id, event, status, actor_auth_user_id) values (v_id, 'filed', 'radicada', v_uid);

  return jsonb_build_object('id', v_id, 'radicado', v_radicado, 'dueDate', v_due, 'legalBasis', v_basis);
end;
$$;

revoke all on function dk_create_pqr(text, text, uuid) from public, anon;
grant execute on function dk_create_pqr(text, text, uuid) to authenticated;

-- The platform answers: state, answer, or one extension (art. 14: +5; art. 15: +8 business days).
create or replace function dk_ga_update_pqr(p_id uuid, p_status text, p_message text default null, p_extend boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r dk_pqr_requests;
begin
  perform dk_require_global_admin();
  select * into r from dk_pqr_requests where id = p_id for update;
  if not found then raise exception 'La solicitud no existe' using hint = 'not_found'; end if;
  if p_status not in ('en_tramite', 'incompleta', 'respondida', 'cerrada') then raise exception 'Estado inválido' using hint = 'invalid'; end if;
  if p_status = 'respondida' and nullif(btrim(coalesce(p_message, '')), '') is null then
    raise exception 'Escribe la respuesta' using hint = 'invalid';
  end if;

  if p_extend then
    if r.extended_due_date is not null then raise exception 'El plazo ya se prorrogó una vez' using hint = 'invalid'; end if;
    if nullif(btrim(coalesce(p_message, '')), '') is null then raise exception 'Indica el motivo de la prórroga' using hint = 'invalid'; end if;
    update dk_pqr_requests
    set extended_due_date = dk_add_business_days(r.due_date::timestamp at time zone 'America/Bogota', case r.kind when 'consulta' then 5 else 8 end)
    where id = p_id;
    insert into dk_pqr_events (request_id, event, status, message, actor_auth_user_id) values (p_id, 'extended', r.status, p_message, auth.uid());
    return;
  end if;

  update dk_pqr_requests
  set status = p_status,
      response = case when p_status = 'respondida' then p_message else response end,
      answered_at = case when p_status = 'respondida' then now() else answered_at end
  where id = p_id;
  insert into dk_pqr_events (request_id, event, status, message, actor_auth_user_id)
  values (p_id, case when p_status = 'respondida' then 'answered' else 'status' end, p_status, p_message, auth.uid());
end;
$$;

revoke all on function dk_ga_update_pqr(uuid, text, text, boolean) from public, anon;
grant execute on function dk_ga_update_pqr(uuid, text, text, boolean) to authenticated;

-- Platform inbox: every request with the requester's business name.
create or replace function dk_ga_pqr_requests()
returns table (id uuid, radicado text, kind text, status text, description text, requester_email text, organization_name text,
               legal_basis text, due_date date, extended_due_date date, response text, created_at timestamptz, answered_at timestamptz, details jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform dk_require_global_admin();
  return query
    select r.id, r.radicado, r.kind, r.status, r.description, r.requester_email, o.name, r.legal_basis, r.due_date, r.extended_due_date,
           r.response, r.created_at, r.answered_at, r.details
    from dk_pqr_requests r left join dk_organizations o on o.id = r.organization_id
    order by (r.status in ('respondida', 'cerrada')), coalesce(r.extended_due_date, r.due_date), r.created_at;
end;
$$;

revoke all on function dk_ga_pqr_requests() from public, anon;
grant execute on function dk_ga_pqr_requests() to authenticated;

-- The requester's own requests, newest first.
create or replace function dk_my_pqr_requests()
returns table (id uuid, radicado text, kind text, status text, description text, legal_basis text, due_date date,
               extended_due_date date, response text, created_at timestamptz, answered_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.radicado, r.kind, r.status, r.description, r.legal_basis, r.due_date, r.extended_due_date, r.response, r.created_at, r.answered_at
  from dk_pqr_requests r where r.auth_user_id = auth.uid()
  order by r.created_at desc, r.radicado desc;
$$;

revoke all on function dk_my_pqr_requests() from public, anon;
grant execute on function dk_my_pqr_requests() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Data-subject tools
-- ---------------------------------------------------------------------------

-- Ley 1581 art. 8 a and art. 14: the person's own data, in one file.
create or replace function dk_export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Inicia sesión para continuar' using errcode = '42501'; end if;
  return jsonb_build_object(
    'generatedAt', now(),
    'account', (select jsonb_build_object('id', au.id, 'email', au.email, 'phone', au.phone, 'createdAt', au.created_at,
                                          'lastSignInAt', au.last_sign_in_at, 'providers', au.raw_app_meta_data -> 'providers')
                from auth.users au where au.id = v_uid),
    'profile', (select jsonb_build_object('fullName', u.full_name, 'avatarKey', u.avatar_key, 'active', u.active, 'createdAt', u.created_at)
                from dk_users u where u.auth_user_id = v_uid),
    'organizations', coalesce((select jsonb_agg(jsonb_build_object('name', o.name, 'status', om.status, 'since', om.created_at))
                               from dk_organization_members om
                               join dk_users u on u.id = om.user_id and u.auth_user_id = v_uid
                               join dk_organizations o on o.id = om.organization_id), '[]'),
    'legalAcceptances', coalesce((select jsonb_agg(jsonb_build_object('document', a.document_slug, 'version', a.document_version,
                                                                      'action', a.action, 'context', a.context, 'consentedAt', a.consented_at,
                                                                      'ip', a.client_ip, 'userAgent', a.user_agent) order by a.id)
                                  from dk_legal_acceptances a where a.auth_user_id = v_uid), '[]'),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('radicado', r.radicado, 'kind', r.kind, 'status', r.status,
                                                              'description', r.description, 'response', r.response, 'createdAt', r.created_at) order by r.created_at)
                          from dk_pqr_requests r where r.auth_user_id = v_uid), '[]')
  );
end;
$$;

revoke all on function dk_export_my_data() from public, anon;
grant execute on function dk_export_my_data() to authenticated;

-- A business answering a deletion request from one of its customers: the person disappears, the orders
-- stay (accounting, Código de Comercio art. 60) without anything that identifies them.
create or replace function dk_anonymize_customer(p_customer uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  c record;
begin
  if v_kitchen is null or not dk_can('customers.delete') then
    raise exception 'No tienes permiso para eliminar clientes' using errcode = '42501';
  end if;
  select * into c from dk_customers where id = p_customer and kitchen_id = v_kitchen for update;
  if not found then raise exception 'El cliente no existe' using hint = 'not_found'; end if;

  if c.whatsapp_opt_in then
    perform dk_record_customer_consent(v_kitchen, p_customer, null, 'staff', 'whatsapp_notices', 'withdrawn', 'staff_declared',
                                       jsonb_build_object('reason', 'anonymized'));
  end if;
  update dk_customers
  set full_name = 'Cliente anonimizado', phone = null, address = null, notes = null, whatsapp_id = null, email = null,
      legal_name = null, tax_id = null, contact_name = null, preferred = false, preferred_note = null,
      whatsapp_opt_in = false, whatsapp_opt_in_source = null, whatsapp_opt_in_at = null, whatsapp_opt_out_at = now()
  where id = p_customer;
  delete from dk_customer_addresses where customer_id = p_customer;
  delete from dk_customer_preferences where customer_id = p_customer;
  delete from dk_customer_recommendations where customer_id = p_customer;
  update dk_customer_complaints set internal_notes = null where customer_id = p_customer;
  update dk_orders set delivery_address = null, delivery_reference = null where customer_id = p_customer;
  delete from dk_wa_messages where conversation_id in (select id from dk_wa_conversations where customer_id = p_customer or phone = c.phone);
  delete from dk_wa_conversations where customer_id = p_customer or (c.phone is not null and phone = c.phone and kitchen_id = v_kitchen);

  perform dk_log_event('customers.anonymized', 'Cliente anonimizado a petición del titular',
                       (select organization_id from dk_kitchens where id = v_kitchen), v_kitchen, 'success', 'db', '{}', null, p_customer::text);
end;
$$;

revoke all on function dk_anonymize_customer(uuid) from public, anon;
grant execute on function dk_anonymize_customer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Published versions (content/legal; generated by `npm run legal -- --sql`)
-- ---------------------------------------------------------------------------
insert into dk_legal_documents (slug, version, title, effective_date, content_sha256, acceptance, requires_reacceptance) values
  ('terminos', '1.0', 'Términos y Condiciones', '2026-10-19', '8714cf64b03b74bd3824c2d1d519d87efe6a8221560c515f2987f8961ab315d6', 'required', false),
  ('privacidad', '1.0', 'Política de Tratamiento de Datos Personales y Privacidad', '2026-10-19', 'cbfe8435b4c8929ccf8b8bef0e83fdd93b131b58bd5b86c19f705a596a8107f3', 'required', false),
  ('suscripciones', '1.0', 'Suscripciones, renovación automática y cobros', '2026-10-19', '0fe2aec7f481641833a842e1ff5e8a9890cfd52971dbb2bbe38de78028b7923f', 'billing', false),
  ('reembolsos', '1.0', 'Política de Cancelaciones y Reembolsos', '2026-10-19', 'ef18aeb4ccc3220324ef2dd8ff89b574adcf1c415922fa602e30435f6ddf193c', 'informational', false),
  ('cookies', '1.0', 'Política de Cookies', '2026-10-19', 'd9c90b12f19648c94a5d476bf51f8b8019ef3e70e81c378aab5ea20c3e8d0ea1', 'informational', false),
  ('politica-cocina', '1.0', 'Política de tratamiento de datos de {{cocina.nombre}}', '2026-10-19', '9f46461578b0034ad3d1064003b86e1211a77b343027638a4ed3d83bb5001e3b', 'customers', false)
on conflict (slug, version) do nothing;
