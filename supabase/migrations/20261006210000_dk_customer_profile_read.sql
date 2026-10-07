-- ADR 0040: one read for the sections of the customer sheet — addresses, preferences,
-- complaints and recommendations — with the names resolved here (a dish, an
-- ingredient, the order number, who registered or resolved it). Caja may read a
-- customer's disliked ingredient without the inventory permission; only names travel.

create or replace function dk_customer_profile(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_current text;
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  if not dk_can('customers.view') then
    raise exception 'No autorizado para ver los clientes de esta cuenta' using errcode = '42501';
  end if;
  select address into v_current from dk_customers where id = p_id and kitchen_id = v_kitchen;
  if not found then return null; end if;

  return jsonb_build_object(
    'addresses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'address', a.address, 'reference', a.reference, 'recipientName', a.recipient_name, 'deliveryNotes', a.delivery_notes,
        'isFrequent', a.is_frequent, 'lastUsedAt', a.last_used_at, 'archivedAt', a.archived_at, 'createdAt', a.created_at,
        'isCurrent', dk_address_key(a.address) = dk_address_key(v_current))
        order by (dk_address_key(a.address) = dk_address_key(v_current)) desc, a.archived_at is not null, a.is_frequent desc, a.last_used_at desc)
      from dk_customer_addresses a where a.customer_id = p_id and a.kitchen_id = v_kitchen), '[]'),
    'preferences', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'kind', f.kind, 'productId', f.product_id, 'ingredientId', f.ingredient_id, 'label', f.label, 'note', f.note, 'createdAt', f.created_at,
        'name', coalesce(p.name, i.name, f.label), 'active', coalesce(p.active, i.active, true))
        order by f.kind, lower(coalesce(p.name, i.name, f.label)))
      from dk_customer_preferences f
      left join dk_products p on p.id = f.product_id
      left join dk_ingredients i on i.id = f.ingredient_id
      where f.customer_id = p_id and f.kitchen_id = v_kitchen), '[]'),
    'complaints', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'orderId', c.order_id, 'orderNumber', o.order_number, 'category', c.category, 'description', c.description,
        'status', c.status, 'resolution', c.resolution, 'resolvedAt', c.resolved_at, 'resolvedBy', ru.full_name,
        'internalNotes', c.internal_notes, 'createdAt', c.created_at, 'createdBy', cu.full_name, 'updatedAt', c.updated_at)
        order by (c.status = 'resolved'), c.created_at desc)
      from dk_customer_complaints c
      left join dk_orders o on o.id = c.order_id
      left join dk_users cu on cu.id = c.created_by
      left join dk_users ru on ru.id = c.resolved_by
      where c.customer_id = p_id and c.kitchen_id = v_kitchen), '[]'),
    'recommendations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'productId', r.product_id, 'productName', p.name, 'title', r.title, 'reason', r.reason, 'source', r.source,
        'score', r.score, 'status', r.status, 'createdAt', r.created_at, 'createdBy', u.full_name)
        order by (r.status = 'dismissed'), r.score desc nulls last, r.created_at desc)
      from dk_customer_recommendations r
      left join dk_products p on p.id = r.product_id
      left join dk_users u on u.id = r.created_by
      where r.customer_id = p_id and r.kitchen_id = v_kitchen), '[]')
  );
end;
$$;

revoke all on function dk_customer_profile(uuid) from public, anon;
grant execute on function dk_customer_profile(uuid) to authenticated;

notify pgrst, 'reload schema';
