-- ADR 0020, D4: riders work from Pedidos → Despacho.
--   1. The system role DELIVERY no longer needs kitchen.view (it entered
--      through the kitchen board only because Despacho did not exist).
--      Custom roles are not touched.
--   2. A rider sees the customer (name, address, phone) of the orders
--      assigned to them — before, Despacho showed no address for them.
delete from dk_role_permissions rp
using dk_roles r
where rp.role_id = r.id and r.is_system and r.key = 'DELIVERY' and rp.permission_key = 'kitchen.view';

create policy dk_customers_select_rider on dk_customers for select to authenticated
  using (
    kitchen_id = (select dk_current_kitchen_id())
    and (select dk_can('dispatch.view'))
    and exists (
      select 1
      from dk_orders o
      join dk_deliveries d on d.order_id = o.id
      join dk_delivery_riders r on r.id = d.rider_id
      where o.customer_id = dk_customers.id and r.user_id = (select dk_current_profile_id())
    )
  );
