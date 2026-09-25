-- Usa un DEFAULT de columna en vez de un trigger para asignar order_number
-- (mismo patron que "id uuid primary key default gen_random_uuid()" ya usado
-- en todo el esquema) -- ademas, con un DEFAULT los tipos generados por
-- Supabase marcan la columna como opcional al insertar, que es lo correcto
-- ya que el codigo de la app nunca la envia explicitamente.
alter table dk_orders alter column order_number set default nextval('dk_order_number_seq');

drop trigger if exists dk_trg_assign_order_number on dk_orders;
drop function if exists dk_assign_order_number();
