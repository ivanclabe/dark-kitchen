-- Dark Kitchen — Fase 7: Despachos (domiciliarios, asignacion, entrega).

create type dk_delivery_status as enum ('EN_RUTA','ENTREGADO','FALLIDO');

create table dk_delivery_riders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references dk_users(id),
  full_name text not null,
  phone text,
  vehicle_type text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column dk_delivery_riders.user_id is 'Opcional: si el domiciliario tiene cuenta en la app (rol DELIVERY), para que vea solo sus propias entregas asignadas.';

create trigger dk_trg_delivery_riders_updated_at
  before update on dk_delivery_riders
  for each row execute function dk_set_updated_at();

create table dk_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references dk_orders(id),
  rider_id uuid references dk_delivery_riders(id),
  status dk_delivery_status not null default 'EN_RUTA',
  notes text,
  dispatched_at timestamptz not null default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger dk_trg_deliveries_updated_at
  before update on dk_deliveries
  for each row execute function dk_set_updated_at();

-- ---------------------------------------------------------------------------
-- RPC: despachar pedido (LISTO -> DESPACHADO) y marcar entregado (-> ENTREGADO)
-- ---------------------------------------------------------------------------

create or replace function dk_dispatch_order(p_order_id uuid, p_rider_id uuid, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status dk_order_status;
begin
  if dk_current_role() not in ('ADMIN','MANAGER','CASHIER') then
    raise exception 'No autorizado para despachar pedidos';
  end if;

  select status into v_status from dk_orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido % no existe', p_order_id;
  end if;
  if v_status <> 'LISTO' then
    raise exception 'Solo se pueden despachar pedidos en estado LISTO (actual: %)', v_status;
  end if;

  insert into dk_deliveries (order_id, rider_id, notes)
  values (p_order_id, p_rider_id, p_notes)
  on conflict (order_id) do update
    set rider_id = excluded.rider_id, notes = excluded.notes, status = 'EN_RUTA', dispatched_at = now(), delivered_at = null;

  update dk_orders set status = 'DESPACHADO' where id = p_order_id;

  insert into dk_order_status_history (order_id, from_status, to_status, changed_by)
  values (p_order_id, 'LISTO', 'DESPACHADO', dk_current_profile_id());
end;
$$;

revoke execute on function dk_dispatch_order(uuid, uuid, text) from public, anon;
grant execute on function dk_dispatch_order(uuid, uuid, text) to authenticated;

create or replace function dk_mark_delivered(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status dk_order_status;
  v_rider_user_id uuid;
begin
  select o.status, r.user_id into v_status, v_rider_user_id
  from dk_orders o
  left join dk_deliveries d on d.order_id = o.id
  left join dk_delivery_riders r on r.id = d.rider_id
  where o.id = p_order_id
  for update of o;

  if not found then
    raise exception 'Pedido % no existe', p_order_id;
  end if;

  if dk_current_role() not in ('ADMIN','MANAGER','CASHIER')
     and not (dk_current_role() = 'DELIVERY' and v_rider_user_id = dk_current_profile_id())
  then
    raise exception 'No autorizado para marcar este pedido como entregado';
  end if;

  if v_status <> 'DESPACHADO' then
    raise exception 'Solo se pueden entregar pedidos en estado DESPACHADO (actual: %)', v_status;
  end if;

  update dk_deliveries set status = 'ENTREGADO', delivered_at = now() where order_id = p_order_id;
  update dk_orders set status = 'ENTREGADO' where id = p_order_id;

  insert into dk_order_status_history (order_id, from_status, to_status, changed_by)
  values (p_order_id, 'DESPACHADO', 'ENTREGADO', dk_current_profile_id());
end;
$$;

revoke execute on function dk_mark_delivered(uuid) from public, anon;
grant execute on function dk_mark_delivered(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table dk_delivery_riders enable row level security;
alter table dk_deliveries enable row level security;

create policy dk_delivery_riders_select on dk_delivery_riders for select to authenticated using (true);
create policy dk_delivery_riders_write on dk_delivery_riders for all to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER'))
  with check (dk_current_role() in ('ADMIN','MANAGER'));

create policy dk_deliveries_select on dk_deliveries for select to authenticated
  using (
    dk_current_role() in ('ADMIN','MANAGER','CASHIER')
    or (
      dk_current_role() = 'DELIVERY'
      and exists (
        select 1 from dk_delivery_riders r
        where r.id = dk_deliveries.rider_id and r.user_id = dk_current_profile_id()
      )
    )
  );
-- Sin insert/update/delete directo: solo via dk_dispatch_order / dk_mark_delivered.

-- Pedidos: ahora que existen despachos, DELIVERY tambien puede leer los
-- pedidos que tiene asignados (antes solo ADMIN/MANAGER/CASHIER/KITCHEN).
drop policy dk_orders_select on dk_orders;
create policy dk_orders_select on dk_orders for select to authenticated
  using (
    dk_current_role() in ('ADMIN','MANAGER','CASHIER','KITCHEN')
    or (
      dk_current_role() = 'DELIVERY'
      and exists (
        select 1 from dk_deliveries d
        join dk_delivery_riders r on r.id = d.rider_id
        where d.order_id = dk_orders.id and r.user_id = dk_current_profile_id()
      )
    )
  );
