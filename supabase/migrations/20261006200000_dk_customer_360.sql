-- ADR 0040: the customer 360° sheet. Additive only: nothing of orders, kitchen,
-- inventory or menu changes, and no existing data is removed.
--   * dk_customers.email (optional, clean, valid; searchable).
--   * dk_customer_addresses: every address of the customer, never overwritten.
--     dk_customers.address stays THE last delivery address (orders, dispatch,
--     Copilot and n8n read it); triggers keep both in step.
--   * dk_customer_preferences: favourite dishes and liked/disliked ingredients by id
--     (dk_products, dk_ingredients); free text only for what is not in the catalog.
--   * dk_customer_complaints: a history; its original text cannot change and nothing is deleted.
--   * dk_customer_recommendations: manual today; source 'auto' reserved for a future recommender.
--   * dk_customer_order_stats(id): behaviour from the real orders (read only).
--   * dk_customer_detail / dk_customers_list: the e-mail (and searching by it).
-- Security: like dk_customers — read with customers.view, write with customers.edit,
-- always in the active account and for a customer of that account.

-- 1. E-mail -------------------------------------------------------------------
alter table dk_customers add column if not exists email text;
alter table dk_customers drop constraint if exists dk_customers_email_valid;
alter table dk_customers add constraint dk_customers_email_valid check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

create or replace function dk_normalize_email_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  return new;
end;
$$;
drop trigger if exists dk_customers_email_normalize on dk_customers;
create trigger dk_customers_email_normalize before insert or update of email on dk_customers
  for each row execute function dk_normalize_email_trigger();

-- 2. Addresses ----------------------------------------------------------------
/** The same address written with other spaces or capitals is the same address. */
create or replace function dk_address_key(p text)
returns text
language sql
immutable
set search_path = public
as $$ select lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')) $$;

create table if not exists dk_customer_addresses (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default dk_current_kitchen_id() references dk_kitchens (id) on delete cascade,
  customer_id uuid not null references dk_customers (id) on delete cascade,
  address text not null check (length(btrim(address)) between 3 and 300),
  reference text check (reference is null or length(reference) <= 200),
  recipient_name text check (recipient_name is null or length(recipient_name) <= 120),
  delivery_notes text check (delivery_notes is null or length(delivery_notes) <= 500),
  is_frequent boolean not null default false,
  last_used_at timestamptz not null default now(),
  archived_at timestamptz,
  created_by uuid references dk_users (id) default dk_current_profile_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists dk_customer_addresses_key on dk_customer_addresses (customer_id, dk_address_key(address));
create index if not exists dk_customer_addresses_recent on dk_customer_addresses (customer_id, last_used_at desc);

-- When dk_customers.address changes (the app, n8n, an order), it joins the history (or is marked used now).
create or replace function dk_customer_address_from_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Never break whoever writes the customer (the app, n8n…): what cannot be a history entry is skipped.
  if length(btrim(coalesce(new.address, ''))) not between 3 and 300 then return new; end if;
  if tg_op = 'UPDATE' and dk_address_key(new.address) = dk_address_key(old.address) then return new; end if;
  insert into dk_customer_addresses (kitchen_id, customer_id, address, last_used_at, created_by)
  values (new.kitchen_id, new.id, btrim(new.address), now(), dk_current_profile_id())
  on conflict (customer_id, dk_address_key(address)) do update set last_used_at = now(), archived_at = null;
  return new;
end;
$$;
drop trigger if exists dk_customers_address_history on dk_customers;
create trigger dk_customers_address_history after insert or update of address on dk_customers
  for each row execute function dk_customer_address_from_customer();

-- The addresses customers already have (once).
insert into dk_customer_addresses (kitchen_id, customer_id, address, last_used_at, created_at, created_by)
select c.kitchen_id, c.id, btrim(c.address), c.updated_at, c.updated_at, null
from dk_customers c
where length(btrim(coalesce(c.address, ''))) between 3 and 300
on conflict (customer_id, dk_address_key(address)) do nothing;

/**
 * Save an address of a customer. A different text is a NEW address (the old one
 * stays in the history); the same text updates its details. «Usar como última»
 * makes it dk_customers.address.
 */
create or replace function dk_customer_address_save(
  p_customer_id uuid,
  p_id uuid default null,
  p_address text default null,
  p_reference text default null,
  p_recipient_name text default null,
  p_delivery_notes text default null,
  p_is_frequent boolean default false,
  p_make_current boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_row dk_customer_addresses;
  v_id uuid;
  v_address text := btrim(coalesce(p_address, ''));
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  if not dk_can('customers.edit') then raise exception 'No autorizado para editar clientes' using errcode = '42501'; end if;
  if not exists (select 1 from dk_customers where id = p_customer_id and kitchen_id = v_kitchen) then
    raise exception 'Cliente no encontrado en esta cuenta';
  end if;
  if length(v_address) < 3 then raise exception 'Escribe la dirección'; end if;

  if p_id is not null then
    select * into v_row from dk_customer_addresses where id = p_id and customer_id = p_customer_id and kitchen_id = v_kitchen;
    if not found then raise exception 'Dirección no encontrada'; end if;
  end if;

  if p_id is not null and dk_address_key(v_row.address) = dk_address_key(v_address) then
    update dk_customer_addresses
    set reference = nullif(btrim(coalesce(p_reference, '')), ''), recipient_name = nullif(btrim(coalesce(p_recipient_name, '')), ''),
        delivery_notes = nullif(btrim(coalesce(p_delivery_notes, '')), ''), is_frequent = coalesce(p_is_frequent, false), archived_at = null
    where id = p_id
    returning id into v_id;
  else
    insert into dk_customer_addresses (kitchen_id, customer_id, address, reference, recipient_name, delivery_notes, is_frequent, last_used_at)
    values (v_kitchen, p_customer_id, v_address, nullif(btrim(coalesce(p_reference, '')), ''), nullif(btrim(coalesce(p_recipient_name, '')), ''),
            nullif(btrim(coalesce(p_delivery_notes, '')), ''), coalesce(p_is_frequent, false),
            case when p_make_current then now() else now() - interval '1 second' end)
    on conflict (customer_id, dk_address_key(address)) do update
      set reference = excluded.reference, recipient_name = excluded.recipient_name, delivery_notes = excluded.delivery_notes,
          is_frequent = excluded.is_frequent, archived_at = null
    returning id into v_id;
  end if;

  if p_make_current then
    update dk_customer_addresses set last_used_at = now() where id = v_id;
    update dk_customers set address = (select address from dk_customer_addresses where id = v_id) where id = p_customer_id;
  end if;
  return v_id;
end;
$$;

/** Archive (or bring back) an address. The last delivery address cannot be archived. */
create or replace function dk_customer_address_archive(p_id uuid, p_archived boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_row dk_customer_addresses;
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  if not dk_can('customers.edit') then raise exception 'No autorizado para editar clientes' using errcode = '42501'; end if;
  select * into v_row from dk_customer_addresses where id = p_id and kitchen_id = v_kitchen;
  if not found then raise exception 'Dirección no encontrada'; end if;
  if p_archived and exists (select 1 from dk_customers c where c.id = v_row.customer_id and dk_address_key(c.address) = dk_address_key(v_row.address)) then
    raise exception 'Es la última dirección de envío: usa otra como última antes de archivarla.';
  end if;
  update dk_customer_addresses set archived_at = case when p_archived then now() end where id = p_id;
end;
$$;

-- 3. Preferences --------------------------------------------------------------
create table if not exists dk_customer_preferences (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default dk_current_kitchen_id() references dk_kitchens (id) on delete cascade,
  customer_id uuid not null references dk_customers (id) on delete cascade,
  kind text not null check (kind in ('favorite_dish', 'liked_ingredient', 'disliked_ingredient', 'dietary')),
  product_id uuid references dk_products (id) on delete cascade,
  ingredient_id uuid references dk_ingredients (id) on delete cascade,
  label text check (label is null or length(btrim(label)) between 1 and 80),
  note text check (note is null or length(note) <= 300),
  created_by uuid references dk_users (id) default dk_current_profile_id(),
  created_at timestamptz not null default now(),
  constraint dk_customer_preferences_target check (
    (kind = 'favorite_dish' and product_id is not null and ingredient_id is null)
    or (kind in ('liked_ingredient', 'disliked_ingredient') and product_id is null and (ingredient_id is not null or label is not null))
    or (kind = 'dietary' and product_id is null and ingredient_id is null and label is not null)
  )
);
create unique index if not exists dk_customer_preferences_dish on dk_customer_preferences (customer_id, kind, product_id) where product_id is not null;
create unique index if not exists dk_customer_preferences_ingredient on dk_customer_preferences (customer_id, kind, ingredient_id) where ingredient_id is not null;
create unique index if not exists dk_customer_preferences_label on dk_customer_preferences (customer_id, kind, lower(btrim(label))) where label is not null and product_id is null and ingredient_id is null;
create index if not exists dk_customer_preferences_customer on dk_customer_preferences (customer_id);

-- 4. Complaints ---------------------------------------------------------------
create table if not exists dk_customer_complaints (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default dk_current_kitchen_id() references dk_kitchens (id) on delete cascade,
  customer_id uuid not null references dk_customers (id) on delete cascade,
  order_id uuid references dk_orders (id) on delete set null,
  category text not null check (category in ('quality', 'delay', 'wrong_order', 'missing_item', 'delivery', 'service', 'billing', 'other')),
  description text not null check (length(btrim(description)) between 3 and 2000),
  status text not null default 'pending' check (status in ('pending', 'in_review', 'resolved')),
  resolution text check (resolution is null or length(resolution) <= 2000),
  resolved_at timestamptz,
  resolved_by uuid references dk_users (id),
  internal_notes text check (internal_notes is null or length(internal_notes) <= 2000),
  created_by uuid references dk_users (id) default dk_current_profile_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dk_customer_complaints_customer on dk_customer_complaints (customer_id, created_at desc);
create index if not exists dk_customer_complaints_open on dk_customer_complaints (kitchen_id) where status <> 'resolved';

-- A complaint is a record: what was reported (customer, text, date, author) never changes;
-- resolving stamps the date and who did it; the order must be the customer's.
create or replace function dk_customer_complaint_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.customer_id <> old.customer_id or new.description <> old.description or new.created_at <> old.created_at
       or new.created_by is distinct from old.created_by or new.kitchen_id <> old.kitchen_id then
      raise exception 'Lo que se reportó en una queja no se cambia: registra una nueva o agrega notas internas.';
    end if;
  end if;
  if new.order_id is not null and not exists (select 1 from dk_orders o where o.id = new.order_id and o.customer_id = new.customer_id) then
    raise exception 'Ese pedido no es de este cliente';
  end if;
  if new.status = 'resolved' and (tg_op = 'INSERT' or old.status <> 'resolved') then
    new.resolved_at := coalesce(new.resolved_at, now());
    new.resolved_by := coalesce(new.resolved_by, dk_current_profile_id());
  elsif new.status <> 'resolved' then
    new.resolved_at := null;
    new.resolved_by := null;
  end if;
  return new;
end;
$$;
drop trigger if exists dk_customer_complaints_guard on dk_customer_complaints;
create trigger dk_customer_complaints_guard before insert or update on dk_customer_complaints
  for each row execute function dk_customer_complaint_guard();

-- 5. Recommendations ----------------------------------------------------------
create table if not exists dk_customer_recommendations (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default dk_current_kitchen_id() references dk_kitchens (id) on delete cascade,
  customer_id uuid not null references dk_customers (id) on delete cascade,
  product_id uuid references dk_products (id) on delete cascade,
  title text not null check (length(btrim(title)) between 2 and 120),
  reason text check (reason is null or length(reason) <= 500),
  -- 'manual' today; 'auto' is reserved for a recommender (from orders, favourites, preferences, frequency).
  source text not null default 'manual' check (source in ('manual', 'auto')),
  score numeric,
  status text not null default 'active' check (status in ('active', 'dismissed')),
  dismissed_at timestamptz,
  created_by uuid references dk_users (id) default dk_current_profile_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dk_customer_recommendations_customer on dk_customer_recommendations (customer_id, status, created_at desc);

-- 6. Timestamps, audit, RLS ---------------------------------------------------
drop trigger if exists dk_trg_customer_addresses_updated_at on dk_customer_addresses;
create trigger dk_trg_customer_addresses_updated_at before update on dk_customer_addresses for each row execute function dk_set_updated_at();
drop trigger if exists dk_trg_customer_complaints_updated_at on dk_customer_complaints;
create trigger dk_trg_customer_complaints_updated_at before update on dk_customer_complaints for each row execute function dk_set_updated_at();
drop trigger if exists dk_trg_customer_recommendations_updated_at on dk_customer_recommendations;
create trigger dk_trg_customer_recommendations_updated_at before update on dk_customer_recommendations for each row execute function dk_set_updated_at();

drop trigger if exists dk_trg_audit_customer_complaints on dk_customer_complaints;
create trigger dk_trg_audit_customer_complaints after insert or update or delete on dk_customer_complaints for each row execute function dk_audit_row();
drop trigger if exists dk_trg_audit_customer_addresses on dk_customer_addresses;
create trigger dk_trg_audit_customer_addresses after insert or update or delete on dk_customer_addresses for each row execute function dk_audit_row();

/**
 * A dish or an ingredient of the active account, checked without its own read
 * permission: Caja may note that a customer dislikes an ingredient without
 * seeing the inventory.
 */
create or replace function dk_catalog_item_in_account(p_product_id uuid, p_ingredient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (p_product_id is null or exists (select 1 from dk_products where id = p_product_id and kitchen_id = dk_current_kitchen_id()))
     and (p_ingredient_id is null or exists (select 1 from dk_ingredients where id = p_ingredient_id and kitchen_id = dk_current_kitchen_id()))
$$;

/**
 * What can be chosen as a preference: the dishes and ingredients of the account,
 * by id and name only (no costs, no stock), for whoever can edit customers.
 */
create or replace function dk_customer_preference_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  if not dk_can('customers.view') then raise exception 'No autorizado para ver los clientes' using errcode = '42501'; end if;
  return jsonb_build_object(
    'dishes', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by lower(name)) from dk_products where kitchen_id = v_kitchen and active), '[]'),
    'ingredients', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by lower(name)) from dk_ingredients where kitchen_id = v_kitchen and active), '[]')
  );
end;
$$;

/** The customer belongs to the active account (for the write policies). */
create or replace function dk_customer_in_account(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select exists (select 1 from dk_customers where id = p_customer_id and kitchen_id = dk_current_kitchen_id()) $$;

alter table dk_customer_addresses enable row level security;
alter table dk_customer_preferences enable row level security;
alter table dk_customer_complaints enable row level security;
alter table dk_customer_recommendations enable row level security;

drop policy if exists dk_customer_addresses_select on dk_customer_addresses;
create policy dk_customer_addresses_select on dk_customer_addresses for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('customers.view')));
-- Writing addresses goes through dk_customer_address_save / _archive (they keep dk_customers.address in step).

drop policy if exists dk_customer_preferences_select on dk_customer_preferences;
create policy dk_customer_preferences_select on dk_customer_preferences for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('customers.view')));
drop policy if exists dk_customer_preferences_insert on dk_customer_preferences;
create policy dk_customer_preferences_insert on dk_customer_preferences for insert to authenticated
  with check (
    kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('customers.edit')) and dk_customer_in_account(customer_id)
    and dk_catalog_item_in_account(product_id, ingredient_id)
  );
drop policy if exists dk_customer_preferences_delete on dk_customer_preferences;
create policy dk_customer_preferences_delete on dk_customer_preferences for delete to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('customers.edit')));

drop policy if exists dk_customer_complaints_select on dk_customer_complaints;
create policy dk_customer_complaints_select on dk_customer_complaints for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('customers.view')));
drop policy if exists dk_customer_complaints_insert on dk_customer_complaints;
create policy dk_customer_complaints_insert on dk_customer_complaints for insert to authenticated
  with check (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('customers.edit')) and dk_customer_in_account(customer_id));
drop policy if exists dk_customer_complaints_update on dk_customer_complaints;
create policy dk_customer_complaints_update on dk_customer_complaints for update to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('customers.edit')))
  with check (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('customers.edit')));
-- No delete policy: complaints are a history.

drop policy if exists dk_customer_recommendations_select on dk_customer_recommendations;
create policy dk_customer_recommendations_select on dk_customer_recommendations for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('customers.view')));
drop policy if exists dk_customer_recommendations_insert on dk_customer_recommendations;
create policy dk_customer_recommendations_insert on dk_customer_recommendations for insert to authenticated
  with check (
    kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('customers.edit')) and dk_customer_in_account(customer_id) and source = 'manual'
    and dk_catalog_item_in_account(product_id, null)
  );
drop policy if exists dk_customer_recommendations_update on dk_customer_recommendations;
create policy dk_customer_recommendations_update on dk_customer_recommendations for update to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('customers.edit')))
  with check (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('customers.edit')));

revoke all on dk_customer_addresses, dk_customer_preferences, dk_customer_complaints, dk_customer_recommendations from anon;
revoke insert, update, delete on dk_customer_addresses from authenticated;
grant select on dk_customer_addresses to authenticated;
grant select, insert, delete on dk_customer_preferences to authenticated;
grant select, insert, update on dk_customer_complaints to authenticated;
grant select, insert, update on dk_customer_recommendations to authenticated;

-- 7. Behaviour from the real orders -------------------------------------------
create or replace function dk_customer_order_stats(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_result jsonb;
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  if not (dk_can('customers.view') and dk_can('orders.view')) then
    raise exception 'No autorizado para ver los pedidos de este cliente' using errcode = '42501';
  end if;
  if not exists (select 1 from dk_customers where id = p_id and kitchen_id = v_kitchen) then return null; end if;

  with ord as (
    select o.id, o.order_number, o.status, o.total, o.created_at
    from dk_orders o
    where o.kitchen_id = v_kitchen and o.customer_id = p_id and o.status <> 'CANCELADO'
  ),
  agg as (
    select count(*) n, min(created_at) first_at, max(created_at) last_at,
           count(*) filter (where created_at >= now() - interval '90 days') last90
    from ord
  ),
  last_order as (
    select * from ord order by created_at desc limit 1
  ),
  dishes as (
    select i.product_id, p.name, sum(i.quantity) units, count(distinct i.order_id) orders
    from dk_order_items i join ord on ord.id = i.order_id join dk_products p on p.id = i.product_id
    group by i.product_id, p.name
    order by sum(i.quantity) desc, count(distinct i.order_id) desc, p.name
    limit 5
  )
  select jsonb_build_object(
    'orders', agg.n,
    'firstOrderAt', agg.first_at,
    'lastOrderAt', agg.last_at,
    'ordersLast90Days', agg.last90,
    -- Average days between orders: only meaningful with two or more.
    'avgDaysBetween', case when agg.n >= 2 then round(extract(epoch from (agg.last_at - agg.first_at)) / 86400.0 / (agg.n - 1), 1) end,
    'lastOrder', (select jsonb_build_object('id', l.id, 'orderNumber', l.order_number, 'status', l.status, 'total', l.total, 'createdAt', l.created_at) from last_order l),
    'topDishes', coalesce((select jsonb_agg(jsonb_build_object('productId', d.product_id, 'name', d.name, 'units', d.units, 'orders', d.orders)) from dishes d), '[]')
  ) into v_result
  from agg;
  return v_result;
end;
$$;

revoke all on function dk_customer_order_stats(uuid), dk_customer_preference_options(), dk_catalog_item_in_account(uuid, uuid) from public, anon;
grant execute on function dk_customer_order_stats(uuid), dk_customer_preference_options(), dk_catalog_item_in_account(uuid, uuid) to authenticated;
revoke all on function dk_customer_address_save(uuid, uuid, text, text, text, text, boolean, boolean), dk_customer_address_archive(uuid, boolean), dk_customer_in_account(uuid) from public, anon;
grant execute on function dk_customer_address_save(uuid, uuid, text, text, text, text, boolean, boolean), dk_customer_address_archive(uuid, boolean), dk_customer_in_account(uuid) to authenticated;

-- 8. The detail and the list know the e-mail ----------------------------------
create or replace function dk_customer_detail(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_tz text;
  v_orders boolean;
  v_debt boolean;
  v_result jsonb;
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  if not dk_can('customers.view') then
    raise exception 'No autorizado para ver los clientes de esta cuenta' using errcode = '42501';
  end if;
  v_orders := dk_can('orders.view') or dk_can('receivables.view');
  v_debt := dk_can('receivables.view');
  select timezone into v_tz from dk_kitchens where id = v_kitchen;

  select jsonb_build_object('id', s.id, 'fullName', s.full_name, 'phone', s.phone, 'address', s.address, 'notes', s.notes,
                            'email', (select c.email from dk_customers c where c.id = s.id),
                            'createdAt', s.created_at, 'hasWhatsapp', s.whatsapp_id is not null)
         || case when v_orders then jsonb_build_object('orders', s.orders, 'totalPurchased', s.total_purchased, 'lastOrderAt', s.last_order_at,
                                                      'active', coalesce(s.last_order_at >= now() - interval '90 days', false)) else '{}'::jsonb end
         || case when v_debt then jsonb_build_object('balance', s.balance, 'overdue', s.overdue) else '{}'::jsonb end
  into v_result
  from dk_customers_with_stats(v_kitchen, dk_local_date(now(), v_tz)) s
  where s.id = p_id;
  return v_result;
end;
$$;

create or replace function dk_customers_list(p_search text DEFAULT NULL::text, p_status text DEFAULT 'all'::text, p_sort text DEFAULT NULL::text, p_dir text DEFAULT NULL::text, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0, p_created_from date DEFAULT NULL::date, p_created_to date DEFAULT NULL::date, p_min_orders integer DEFAULT NULL::integer, p_min_balance numeric DEFAULT NULL::numeric, p_max_balance numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_tz text;
  v_today date;
  v_orders boolean;
  v_debt boolean;
  v_sort text;
  v_asc boolean;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_text text := nullif(btrim(coalesce(p_search, '')), '');
  v_like text;
  v_digits text;
  v_active_since timestamptz := now() - interval '90 days';
  v_result jsonb;
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  if not dk_can('customers.view') then
    raise exception 'No autorizado para ver los clientes de esta cuenta' using errcode = '42501';
  end if;
  v_orders := dk_can('orders.view') or dk_can('receivables.view');
  v_debt := dk_can('receivables.view');
  select timezone into v_tz from dk_kitchens where id = v_kitchen;
  v_today := dk_local_date(now(), v_tz);

  if p_status not in ('all', 'active', 'inactive', 'debt', 'no_debt', 'overdue') then raise exception 'Filtro desconocido: %', p_status; end if;
  if p_status in ('active', 'inactive') and not v_orders then raise exception 'No autorizado para filtrar por actividad' using errcode = '42501'; end if;
  if (p_status in ('debt', 'no_debt', 'overdue') or p_min_balance is not null or p_max_balance is not null) and not v_debt then
    raise exception 'No autorizado para filtrar por saldo' using errcode = '42501';
  end if;
  if p_min_orders is not null and not v_orders then raise exception 'No autorizado para filtrar por pedidos' using errcode = '42501'; end if;

  -- Sort: only by what the person can see. Default: who owes most, else the most recent buyers, else by name.
  v_sort := coalesce(p_sort, case when v_debt then 'balance' when v_orders then 'last_order' else 'name' end);
  if v_sort not in ('name', 'orders', 'total', 'balance', 'last_order', 'created')
     or (v_sort = 'balance' and not v_debt)
     or (v_sort in ('orders', 'total', 'last_order') and not v_orders) then
    v_sort := 'name';
  end if;
  v_asc := coalesce(p_dir, case when v_sort = 'name' then 'asc' else 'desc' end) = 'asc';

  if v_text is not null then
    v_like := '%' || replace(replace(replace(lower(v_text), '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_digits := regexp_replace(v_text, '\D', '', 'g');
  end if;

  with base as (
    select s.*
    from dk_customers_with_stats(v_kitchen, v_today) s
    where (v_text is null
           or lower(s.full_name) like v_like
           or lower(coalesce(s.address, '')) like v_like
           or (length(v_digits) >= 3 and regexp_replace(coalesce(s.phone, ''), '\D', '', 'g') like '%' || v_digits || '%')
           -- ADR 0040: also by e-mail.
           or exists (select 1 from dk_customers ce where ce.id = s.id and ce.email like v_like))
      and (p_created_from is null or s.created_at >= dk_local_start(p_created_from, v_tz))
      and (p_created_to is null or s.created_at < dk_local_start(p_created_to + 1, v_tz))
      and (p_min_orders is null or s.orders >= p_min_orders)
      and (p_min_balance is null or s.balance >= p_min_balance)
      and (p_max_balance is null or s.balance <= p_max_balance)
      and case p_status
            when 'active' then s.last_order_at >= v_active_since
            when 'inactive' then s.last_order_at is null or s.last_order_at < v_active_since
            when 'debt' then s.balance > 0
            when 'no_debt' then s.balance <= 0
            when 'overdue' then s.overdue > 0
            else true
          end
  ),
  ranked as (
    -- One explicit order (also used to keep the page in that order).
    select base.*, row_number() over (order by
      case when v_sort = 'name' and v_asc then lower(full_name) end asc,
      case when v_sort = 'name' and not v_asc then lower(full_name) end desc,
      case when v_sort = 'orders' and v_asc then orders end asc,
      case when v_sort = 'orders' and not v_asc then orders end desc,
      case when v_sort = 'total' and v_asc then total_purchased end asc,
      case when v_sort = 'total' and not v_asc then total_purchased end desc,
      case when v_sort = 'balance' and v_asc then balance end asc,
      case when v_sort = 'balance' and not v_asc then balance end desc,
      case when v_sort = 'last_order' and v_asc then last_order_at end asc nulls last,
      case when v_sort = 'last_order' and not v_asc then last_order_at end desc nulls last,
      case when v_sort = 'created' and v_asc then created_at end asc,
      case when v_sort = 'created' and not v_asc then created_at end desc,
      lower(full_name), id) as ord
    from base
  ),
  page as (
    select * from ranked where ord > v_offset and ord <= v_offset + v_limit
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'sort', v_sort,
    'dir', case when v_asc then 'asc' else 'desc' end,
    'orders', v_orders,
    'debt', v_debt,
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', p.id, 'fullName', p.full_name, 'phone', p.phone, 'address', p.address,
                           'email', (select ce.email from dk_customers ce where ce.id = p.id),
                           'createdAt', p.created_at, 'hasWhatsapp', p.whatsapp_id is not null)
        || case when v_orders then jsonb_build_object('orders', p.orders, 'totalPurchased', p.total_purchased,
                                                     'lastOrderAt', p.last_order_at, 'active', coalesce(p.last_order_at >= v_active_since, false))
           else '{}'::jsonb end
        || case when v_debt then jsonb_build_object('balance', p.balance, 'overdue', p.overdue) else '{}'::jsonb end
        order by p.ord)
      from page p), '[]'))
  into v_result;
  return v_result;
end;
$function$;

notify pgrst, 'reload schema';
