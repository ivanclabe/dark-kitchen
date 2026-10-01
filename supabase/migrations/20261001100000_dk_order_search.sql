-- ADR 0020: Pedidos → Lista. Searches orders of the active account by number,
-- customer (name or phone) or dish, with date, status, channel and customer
-- filters, newest first. SECURITY INVOKER: the caller's RLS applies (a rider
-- only finds their own deliveries; customer matches need customers.view).
-- Returns ids only; the app reads the orders with its one common query.
create or replace function dk_order_search(
  p_search text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_statuses dk_order_status[] default null,
  p_channel dk_order_channel default null,
  p_customer_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns setof uuid
language sql
stable
security invoker
set search_path = public
as $$
  with term as (select nullif(btrim(coalesce(p_search, '')), '') as t)
  select o.id
  from dk_orders o, term
  where o.kitchen_id = dk_current_kitchen_id()
    and (p_from is null or o.created_at >= p_from)
    and (p_to is null or o.created_at < p_to)
    and (p_statuses is null or o.status = any (p_statuses))
    and (p_channel is null or o.channel = p_channel)
    and (p_customer_id is null or o.customer_id = p_customer_id)
    and (
      term.t is null
      or (term.t ~ '^#?[0-9]{1,9}$' and o.order_number = ltrim(term.t, '#')::integer)
      or exists (select 1 from dk_customers c where c.id = o.customer_id
                 and (c.full_name ilike '%' || term.t || '%' or c.phone ilike '%' || term.t || '%'))
      or exists (select 1 from dk_order_items i join dk_products p on p.id = i.product_id
                 where i.order_id = o.id and p.name ilike '%' || term.t || '%')
    )
  order by o.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 201)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function dk_order_search(text, timestamptz, timestamptz, dk_order_status[], dk_order_channel, uuid, integer, integer) from public, anon;
grant execute on function dk_order_search(text, timestamptz, timestamptz, dk_order_status[], dk_order_channel, uuid, integer, integer) to authenticated;
