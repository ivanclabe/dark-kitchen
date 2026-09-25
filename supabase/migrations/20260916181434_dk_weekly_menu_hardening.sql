-- Endurecimiento: search_path fijo en dk_today_day_of_week (consistente con
-- dk_current_role/dk_current_profile_id) y la vista dk_today_menu corre con
-- los permisos del usuario que consulta, no del dueño de la vista (aunque en
-- este caso el resultado es idéntico: las tablas subyacentes ya son de
-- lectura abierta para cualquier authenticated).

create or replace function dk_today_day_of_week()
returns dk_day_of_week
language sql
stable
set search_path = public
as $$
  select (array['LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO','DOMINGO']::dk_day_of_week[])[extract(isodow from current_date)::int];
$$;

alter view dk_today_menu set (security_invoker = true);
