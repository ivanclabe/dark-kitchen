-- Corrección: dk_audit_row() leía new.id, así que fallaba en toda tabla
-- auditada sin columna id ("record "new" has no field "id"") y abortaba el
-- guardado. Afectaba a las tablas con clave natural:
--   dk_ai_features (feature_key), dk_kitchen_hours (day_of_week),
--   dk_kitchen_hour_exceptions (exception_date)
-- — o sea, guardar la Configuración de IA y el horario de Cocina.
--
-- Ahora la auditoría identifica el registro por su clave primaria real:
--   record_id  — el uuid, cuando la tabla tiene columna id (igual que antes).
--   record_key — la clave primaria como texto, siempre (id, o la clave
--                natural; si es compuesta, sus valores separados por '|').
-- Las filas ya auditadas no cambian.

alter table dk_audit_log alter column record_id drop not null;
alter table dk_audit_log add column record_key text;
update dk_audit_log set record_key = record_id::text where record_key is null;
alter table dk_audit_log add constraint dk_audit_log_record_identified check (record_key is not null);

comment on column dk_audit_log.record_id is 'uuid del registro cuando la tabla auditada tiene columna id; null en tablas con clave natural.';
comment on column dk_audit_log.record_key is 'Clave primaria del registro como texto (id o clave natural; compuesta separada por |).';

create or replace function dk_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_key text;
begin
  select string_agg(v_row ->> a.attname, '|' order by array_position(i.indkey::int2[], a.attnum))
  into v_key
  from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
  where i.indrelid = tg_relid and i.indisprimary;

  insert into dk_audit_log (table_name, record_id, record_key, action, old_data, new_data, changed_by)
  values (
    tg_table_name,
    case when v_row ? 'id' then (v_row ->> 'id')::uuid end,
    coalesce(v_key, v_row ->> 'id'),
    tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE','INSERT') then to_jsonb(new) else null end,
    dk_current_profile_id()
  );
  return coalesce(new, old);
end;
$$;
