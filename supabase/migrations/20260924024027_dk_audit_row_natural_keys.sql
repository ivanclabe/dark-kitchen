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
