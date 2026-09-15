-- Código corto de 4 dígitos para hablar/escribir un pedido en vez de su UUID
-- (necesario para comandos de voz tipo "pedido 2040 listo"). Cicla entre
-- 1000 y 9999 -- perfectamente normal que se repita cada ~9000 pedidos,
-- como los numeros de ticket de cualquier restaurante; la unicidad real que
-- importa es solo entre pedidos todavia activos, por eso el indice unico de
-- abajo es parcial en vez de global.
create sequence dk_order_number_seq as smallint minvalue 1000 maxvalue 9999 cycle start 1000;

alter table dk_orders add column order_number smallint;

-- Backfill de pedidos existentes, en orden de creacion.
with numbered as (
  select id, row_number() over (order by created_at) as rn
  from dk_orders
)
update dk_orders o
set order_number = 999 + (((n.rn - 1) % 9000) + 1)
from numbered n
where o.id = n.id;

-- Alinea la secuencia para que el siguiente pedido nuevo no choque con el backfill.
select setval('dk_order_number_seq', coalesce((select max(order_number) from dk_orders), 999));

alter table dk_orders alter column order_number set not null;

create or replace function dk_assign_order_number()
returns trigger
language plpgsql
as $$
begin
  if new.order_number is null then
    new.order_number := nextval('dk_order_number_seq');
  end if;
  return new;
end;
$$;

create trigger dk_trg_assign_order_number
  before insert on dk_orders
  for each row execute function dk_assign_order_number();

-- Unicidad solo entre pedidos activos (no ENTREGADO/CANCELADO): la cocina y
-- la voz solo necesitan que el numero sea inequivoco *ahora*, no para
-- siempre -- igual que los tickets fisicos de un restaurante.
create unique index dk_orders_order_number_active_uniq on dk_orders (order_number)
  where status not in ('ENTREGADO', 'CANCELADO');
