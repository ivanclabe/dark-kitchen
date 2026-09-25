-- dk_receivables expone saldos de pedidos (datos financieros) — se corrige
-- para que la vista corra con los privilegios/RLS del usuario que consulta
-- (security_invoker) en vez de los del propietario de la vista, que es como
-- Postgres crea una vista por defecto. Detectado por el linter de seguridad
-- de Supabase justo despues de crearla.
alter view dk_receivables set (security_invoker = true);
