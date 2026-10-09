-- ADR 0044: business customers (empresas) and preferred customers.
--
--   * dk_customers.customer_type: 'person' (default: every customer so far) or
--     'company'. A company keeps its trade name in full_name (what orders,
--     dispatch, receivables and Copilot already show) and adds legal_name
--     (razón social), tax_id (NIT) and contact_name. tax_id also serves a
--     person's ID document (optional).
--   * tax_id is unique per account, compared without dots, dashes or spaces
--     («900.123.456-7» = «9001234567»).
--   * preferred (+ an optional reason, preferred_note): informative only, no
--     price rule. Set by whoever may edit customers (customers.edit).
--   * The list searches also by tax id, legal name and contact, and filters by
--     type and preferred; the summary counts the preferred; detail and Copilot
--     return the new fields. dk_customers_with_stats is untouched (the new
--     fields are read from dk_customers, as the e-mail already was).
-- Nothing is dropped from the data; WhatsApp intake keeps creating persons.

alter table dk_customers
  add column customer_type text not null default 'person' check (customer_type in ('person', 'company')),
  add column legal_name text check (length(legal_name) <= 150),
  add column tax_id text check (length(tax_id) <= 30),
  add column contact_name text check (length(contact_name) <= 120),
  add column preferred boolean not null default false,
  add column preferred_note text check (length(preferred_note) <= 200);

comment on column dk_customers.customer_type is 'ADR 0044: person (default) or company. A company''s trade name is full_name.';
comment on column dk_customers.legal_name is 'ADR 0044: razón social (companies).';
comment on column dk_customers.tax_id is 'ADR 0044: NIT of a company or the optional ID document of a person; unique per account without separators.';
comment on column dk_customers.contact_name is 'ADR 0044: contact person of a company.';
comment on column dk_customers.preferred is 'ADR 0044: preferred customer (informative: no price rule).';
comment on column dk_customers.preferred_note is 'ADR 0044: why the customer is preferred (optional).';

-- «900.123.456-7» and «9001234567» are the same tax id.
create or replace function dk_tax_id_key(p text)
returns text
language sql
immutable
set search_path = public
as $$ select nullif(upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g')), '') $$;

create unique index dk_customers_kitchen_tax_id_key on dk_customers (kitchen_id, dk_tax_id_key(tax_id)) where dk_tax_id_key(tax_id) is not null;

-- Blank is nothing; the tax id is kept as written (trimmed, upper case).
-- Marking a customer as preferred needs customers.edit (an API call as the
-- person; the database's own processes, like the WhatsApp intake, never set it).
create or replace function dk_customers_type_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.legal_name := nullif(btrim(new.legal_name), '');
  new.tax_id := nullif(upper(btrim(new.tax_id)), '');
  new.contact_name := nullif(btrim(new.contact_name), '');
  new.preferred_note := nullif(btrim(new.preferred_note), '');
  if auth.uid() is not null
     and ((tg_op = 'INSERT' and (new.preferred or new.preferred_note is not null))
          or (tg_op = 'UPDATE' and (new.preferred is distinct from old.preferred or new.preferred_note is distinct from old.preferred_note)))
     and not dk_can('customers.edit') then
    raise exception 'Solo quien puede editar clientes marca un cliente preferencial' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger dk_customers_type_fields before insert or update on dk_customers
for each row execute function dk_customers_type_fields();

-- The fields of ADR 0044 for one customer row (read from the table, like the e-mail).
create or replace function dk_customer_type_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('email', c.email, 'type', c.customer_type, 'legalName', c.legal_name, 'taxId', c.tax_id,
                            'contactName', c.contact_name, 'preferred', c.preferred, 'preferredNote', c.preferred_note)
  from dk_customers c where c.id = p_id
$$;
revoke all on function dk_customer_type_json(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The list: also by tax id, legal name and contact; filters by type and preferred.
-- ---------------------------------------------------------------------------
drop function if exists dk_customers_list(text, text, text, text, integer, integer, date, date, integer, numeric, numeric);

create or replace function dk_customers_list(p_search text default null, p_status text default 'all', p_sort text default null, p_dir text default null,
                                             p_limit integer default 25, p_offset integer default 0, p_created_from date default null, p_created_to date default null,
                                             p_min_orders integer default null, p_min_balance numeric default null, p_max_balance numeric default null,
                                             p_type text default null, p_preferred boolean default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
  v_tax text;
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
  if p_type is not null and p_type not in ('person', 'company') then raise exception 'Tipo de cliente desconocido: %', p_type; end if;
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
    v_tax := dk_tax_id_key(v_text);
  end if;

  with base as (
    select s.*, c.customer_type, c.legal_name, c.tax_id, c.contact_name, c.preferred, c.preferred_note, c.email
    from dk_customers_with_stats(v_kitchen, v_today) s
    join dk_customers c on c.id = s.id
    where (v_text is null
           or lower(s.full_name) like v_like
           or lower(coalesce(s.address, '')) like v_like
           or (length(v_digits) >= 3 and regexp_replace(coalesce(s.phone, ''), '\D', '', 'g') like '%' || v_digits || '%')
           -- ADR 0040: also by e-mail.
           or c.email like v_like
           -- ADR 0044: also by legal name, contact and tax id (without separators).
           or lower(coalesce(c.legal_name, '')) like v_like
           or lower(coalesce(c.contact_name, '')) like v_like
           or (length(coalesce(v_tax, '')) >= 3 and dk_tax_id_key(c.tax_id) like '%' || v_tax || '%'))
      and (p_type is null or c.customer_type = p_type)
      and (p_preferred is null or c.preferred = p_preferred)
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
        jsonb_build_object('id', p.id, 'fullName', p.full_name, 'phone', p.phone, 'address', p.address, 'email', p.email,
                           'createdAt', p.created_at, 'hasWhatsapp', p.whatsapp_id is not null,
                           'type', p.customer_type, 'legalName', p.legal_name, 'taxId', p.tax_id, 'contactName', p.contact_name,
                           'preferred', p.preferred, 'preferredNote', p.preferred_note)
        || case when v_orders then jsonb_build_object('orders', p.orders, 'totalPurchased', p.total_purchased,
                                                     'lastOrderAt', p.last_order_at, 'active', coalesce(p.last_order_at >= v_active_since, false))
           else '{}'::jsonb end
        || case when v_debt then jsonb_build_object('balance', p.balance, 'overdue', p.overdue) else '{}'::jsonb end
        order by p.ord)
      from page p), '[]'))
  into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Summary: + how many are preferred.
-- ---------------------------------------------------------------------------
create or replace function dk_customers_summary()
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

  select jsonb_build_object('total', count(*),
                            'preferred', (select count(*) from dk_customers c where c.kitchen_id = v_kitchen and c.preferred),
                            'companies', (select count(*) from dk_customers c where c.kitchen_id = v_kitchen and c.customer_type = 'company'))
         || case when v_orders then jsonb_build_object('active', count(*) filter (where last_order_at >= now() - interval '90 days')) else '{}'::jsonb end
         || case when v_debt then jsonb_build_object(
              'withDebt', count(*) filter (where balance > 0),
              'pendingBalance', coalesce(sum(balance) filter (where balance > 0), 0),
              'overdueBalance', coalesce(sum(overdue) filter (where overdue > 0), 0),
              'withOverdue', count(*) filter (where overdue > 0)) else '{}'::jsonb end
  into v_result
  from dk_customers_with_stats(v_kitchen, dk_local_date(now(), v_tz));
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Detail: + type, legal name, tax id, contact and preferred.
-- ---------------------------------------------------------------------------
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
                            'createdAt', s.created_at, 'hasWhatsapp', s.whatsapp_id is not null)
         || dk_customer_type_json(s.id)
         || case when v_orders then jsonb_build_object('orders', s.orders, 'totalPurchased', s.total_purchased, 'lastOrderAt', s.last_order_at,
                                                      'active', coalesce(s.last_order_at >= now() - interval '90 days', false)) else '{}'::jsonb end
         || case when v_debt then jsonb_build_object('balance', s.balance, 'overdue', s.overdue) else '{}'::jsonb end
  into v_result
  from dk_customers_with_stats(v_kitchen, dk_local_date(now(), v_tz)) s
  where s.id = p_id;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Copilot: knows companies and preferred customers; can filter by them.
-- ---------------------------------------------------------------------------
drop function if exists dk_copilot_customers(text, text, date, date, integer, boolean);

create or replace function dk_copilot_customers(p_search text default null, p_order_by text default 'spend', p_from date default null, p_to date default null,
                                                p_limit integer default 10, p_include_contact boolean default false,
                                                p_preferred boolean default null, p_type text default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  tz text := dk_account_tz();
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 30);
  v_balance boolean := dk_can('receivables.view');
  v_contact boolean := coalesce(p_include_contact, false);
begin
  perform dk_require('customers.view');
  return (
    select jsonb_build_object('customers', coalesce(jsonb_agg(x order by ord), '[]'), 'balanceVisible', v_balance, 'contactIncluded', v_contact)
    from (
      select row_number() over (order by
          case p_order_by when 'orders' then -orders when 'recent' then -extract(epoch from last_order) when 'balance' then -coalesce(balance, 0) else -spend end) ord,
        jsonb_build_object('id', id, 'name', full_name, 'type', customer_type, 'preferred', preferred, 'preferredNote', preferred_note,
                           'legalName', legal_name, 'contactName', case when v_contact then contact_name end, 'taxId', case when v_contact then tax_id end,
                           'phone', case when v_contact then phone end, 'orders', orders, 'spend', spend,
                           'lastOrder', to_char(last_order at time zone tz, 'YYYY-MM-DD'), 'balance', balance) x
      from (
        select c.id, c.full_name, c.phone, c.customer_type, c.preferred, c.preferred_note, c.legal_name, c.contact_name, c.tax_id,
          count(o.id) orders, coalesce(sum(o.total), 0) spend, max(o.created_at) last_order,
          case when v_balance then (select coalesce(sum(r.balance), 0) from dk_receivables r where r.customer_id = c.id) end balance
        from dk_customers c
        left join dk_orders o on o.customer_id = c.id and o.status <> 'CANCELADO'
          and (p_from is null or (o.created_at at time zone tz)::date >= p_from)
          and (p_to is null or (o.created_at at time zone tz)::date <= p_to)
        where (p_search is null or c.full_name ilike '%' || p_search || '%' or c.phone ilike '%' || p_search || '%'
               or c.legal_name ilike '%' || p_search || '%'
               or (dk_tax_id_key(p_search) is not null and dk_tax_id_key(c.tax_id) = dk_tax_id_key(p_search)))
          and (p_preferred is null or c.preferred = p_preferred)
          and (p_type is null or c.customer_type = p_type)
        group by c.id) c
      order by 1 limit v_limit) t);
end;
$$;

revoke all on function dk_customers_list(text, text, text, text, integer, integer, date, date, integer, numeric, numeric, text, boolean) from public, anon;
grant execute on function dk_customers_list(text, text, text, text, integer, integer, date, date, integer, numeric, numeric, text, boolean) to authenticated;
revoke execute on function dk_copilot_customers(text, text, date, date, integer, boolean, boolean, text) from public, anon;
grant execute on function dk_copilot_customers(text, text, date, date, integer, boolean, boolean, text) to authenticated;

notify pgrst, 'reload schema';
