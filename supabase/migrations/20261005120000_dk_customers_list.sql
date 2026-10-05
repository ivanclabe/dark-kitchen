-- ADR 0028: Clientes as a scalable management center. Search, filters, sort and
-- pagination happen in the database (never "download everything and filter in
-- the browser"), for the ACTIVE account and with the same permissions as before:
--   customers.view                       → the list (name, phone, address, registration date)
--   orders.view or receivables.view      → orders, total purchased, last order, active/inactive
--   receivables.view                     → balance and overdue (same rule as dk_receivables)
-- Orders and payments of the account are aggregated ONCE per call (group by
-- customer), never per customer (no N+1). Nothing is dropped; RLS is unchanged.
--
-- Definitions (no invented data):
--   total purchased  Σ dk_orders.total of non-cancelled orders
--   balance          Σ (total − payments) of non-cancelled orders (as dk_receivables); debt = balance > 0
--   overdue          the part of the balance whose due_date is before today (account time zone)
--   active           an order in the last 90 days (there is no status column)

create index if not exists dk_orders_kitchen_customer_created_idx on dk_orders (kitchen_id, customer_id, created_at desc);
create index if not exists dk_customers_kitchen_name_idx on dk_customers (kitchen_id, lower(full_name));

-- Every customer of the account with its figures (internal helper; callers check permissions).
create or replace function dk_customers_with_stats(p_kitchen uuid, p_today date)
returns table (
  id uuid, full_name text, phone text, address text, notes text, whatsapp_id text, created_at timestamptz,
  orders bigint, total_purchased numeric, last_order_at timestamptz, balance numeric, overdue numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with ord as (
    select o.customer_id, count(*) as orders, sum(o.total) as total, max(o.created_at) as last_at
    from dk_orders o
    where o.kitchen_id = p_kitchen and o.status <> 'CANCELADO' and o.customer_id is not null
    group by o.customer_id
  ),
  paid as (
    select p.order_id, sum(p.amount) as paid
    from dk_order_payments p
    where p.kitchen_id = p_kitchen
    group by p.order_id
  ),
  bal as (
    select o.customer_id,
           sum(o.total - coalesce(paid.paid, 0)) as balance,
           coalesce(sum(o.total - coalesce(paid.paid, 0)) filter (where o.due_date < p_today), 0) as overdue
    from dk_orders o left join paid on paid.order_id = o.id
    where o.kitchen_id = p_kitchen and o.status <> 'CANCELADO' and o.customer_id is not null
      and o.total - coalesce(paid.paid, 0) <> 0
    group by o.customer_id
  )
  select c.id, c.full_name, c.phone, c.address, c.notes, c.whatsapp_id, c.created_at,
         coalesce(ord.orders, 0), coalesce(ord.total, 0), ord.last_at, coalesce(bal.balance, 0), coalesce(bal.overdue, 0)
  from dk_customers c
  left join ord on ord.customer_id = c.id
  left join bal on bal.customer_id = c.id
  where c.kitchen_id = p_kitchen;
$$;
revoke all on function dk_customers_with_stats(uuid, date) from public, anon, authenticated;

create or replace function dk_customers_list(
  p_search text default null,
  p_status text default 'all',
  p_sort text default null,
  p_dir text default null,
  p_limit integer default 25,
  p_offset integer default 0,
  p_created_from date default null,
  p_created_to date default null,
  p_min_orders integer default null,
  p_min_balance numeric default null,
  p_max_balance numeric default null
)
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
           or (length(v_digits) >= 3 and regexp_replace(coalesce(s.phone, ''), '\D', '', 'g') like '%' || v_digits || '%'))
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
$$;

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

  select jsonb_build_object('total', count(*))
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
         || case when v_orders then jsonb_build_object('orders', s.orders, 'totalPurchased', s.total_purchased, 'lastOrderAt', s.last_order_at,
                                                      'active', coalesce(s.last_order_at >= now() - interval '90 days', false)) else '{}'::jsonb end
         || case when v_debt then jsonb_build_object('balance', s.balance, 'overdue', s.overdue) else '{}'::jsonb end
  into v_result
  from dk_customers_with_stats(v_kitchen, dk_local_date(now(), v_tz)) s
  where s.id = p_id;
  return v_result;
end;
$$;

revoke all on function dk_customers_list(text, text, text, text, integer, integer, date, date, integer, numeric, numeric) from public, anon;
revoke all on function dk_customers_summary() from public, anon;
revoke all on function dk_customer_detail(uuid) from public, anon;
grant execute on function dk_customers_list(text, text, text, text, integer, integer, date, date, integer, numeric, numeric) to authenticated;
grant execute on function dk_customers_summary() to authenticated;
grant execute on function dk_customer_detail(uuid) to authenticated;
