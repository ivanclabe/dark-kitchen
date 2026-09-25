-- Una sola relación por par de tablas para la API (PostgREST).
--
-- La Fase 2 de la ADR 0007 agregó, junto a cada FK original (x_id → tabla.id),
-- una FK compuesta "misma Cuenta" ((kitchen_id, x_id) → tabla(kitchen_id, id)).
-- Con dos FKs entre las mismas tablas, PostgREST no sabe cuál usar al anidar
-- ("Could not embed because more than one relationship was found"), y las
-- consultas con relaciones anidadas fallaban (p. ej. insumos con su
-- categoría, movimientos con su insumo).
--
-- La FK compuesta ya garantiza todo lo que garantizaba la simple (el registro
-- existe; con MATCH SIMPLE un x_id nulo se sigue permitiendo) y además que sea
-- de la misma Cuenta. Por eso se elimina la simple y la compuesta toma su
-- nombre: las consultas que nombran la relación (p. ej.
-- dk_recipes!dk_products_active_recipe_fkey) siguen funcionando.
-- Se verifica que ambas tengan la misma acción ON DELETE / ON UPDATE.

do $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select c.oid as composite_oid, c.conname as composite_name, c.conrelid::regclass as tbl,
           s.conname as single_name, s.confdeltype as s_del, c.confdeltype as c_del,
           s.confupdtype as s_upd, c.confupdtype as c_upd
    from pg_constraint c
    join pg_constraint s
      on s.contype = 'f' and s.conrelid = c.conrelid and s.confrelid = c.confrelid
     and array_length(s.conkey, 1) = 1 and s.conkey[1] = c.conkey[2]
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace and c.conname like '%\_same\_kitchen\_fkey'
  loop
    if r.s_del <> r.c_del or r.s_upd <> r.c_upd then
      raise exception 'Acciones distintas entre % y %', r.single_name, r.composite_name;
    end if;
    execute format('alter table %s drop constraint %I', r.tbl, r.single_name);
    execute format('alter table %s rename constraint %I to %I', r.tbl, r.composite_name, r.single_name);
    v_count := v_count + 1;
  end loop;
  if v_count <> 31 then
    raise exception 'Se esperaban 31 pares de FKs (simple + misma Cuenta) y se encontraron %', v_count;
  end if;
end $$;

-- Ningún par de tablas del esquema de Cuenta queda con dos relaciones (salvo
-- las legítimas hacia dk_users por columnas distintas: created_by, user_id…).
do $$
declare v_left text;
begin
  select string_agg(conrelid::regclass || '→' || confrelid::regclass, ', ') into v_left
  from (
    select conrelid, confrelid from pg_constraint
    where contype = 'f' and connamespace = 'public'::regnamespace and confrelid <> 'public.dk_users'::regclass
    group by conrelid, confrelid having count(*) > 1
  ) x;
  if v_left is not null then raise exception 'Siguen pares con varias FKs: %', v_left; end if;
end $$;

notify pgrst, 'reload schema';
