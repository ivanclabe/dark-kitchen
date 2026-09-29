-- ADR 0011, H3: RLS sin políticas superpuestas.
--
-- Cuando una tabla tiene una política FOR ALL (escritura) y además otra para
-- el mismo comando (casi siempre SELECT), Postgres evalúa las dos en cada
-- lectura (aviso multiple_permissive_policies de Supabase). Esta migración, de
-- forma MECÁNICA y sin reescribir expresiones a mano:
--   1. divide cada FOR ALL superpuesta en INSERT, UPDATE y DELETE con sus
--      mismas expresiones;
--   2. si ya existe una política para ese comando, la fusiona con OR (la
--      unión de antes): quien podía, sigue pudiendo; nadie más;
--   3. deja las expresiones originales en un comentario de cada política;
--   4. se detiene si encuentra algo que no calza (roles distintos, políticas
--      restrictivas, más de una por comando) y verifica al final que no
--      queda ninguna superposición.

do $$
declare
  v_all record;
  v_cmd text;
  v_other record;
  v_count integer;
  v_roles text;
  v_all_using text;
  v_all_check text;
  v_using text;
  v_check text;
  v_name text;
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and permissive <> 'PERMISSIVE') then
    raise exception 'Hay políticas restrictivas: la fusión con OR no sería equivalente';
  end if;

  for v_all in
    select p.* from pg_policies p
    where p.schemaname = 'public' and p.cmd = 'ALL'
      and exists (select 1 from pg_policies o
                  where o.schemaname = 'public' and o.tablename = p.tablename and o.cmd <> 'ALL' and o.roles && p.roles)
    order by p.tablename
  loop
    if (select count(*) from pg_policies where schemaname = 'public' and tablename = v_all.tablename and cmd = 'ALL') > 1 then
      raise exception 'Más de una política FOR ALL en %', v_all.tablename;
    end if;
    v_roles := (select string_agg(quote_ident(r), ', ') from unnest(v_all.roles) r);
    v_all_using := v_all.qual;
    -- FOR ALL sin WITH CHECK usa USING también para verificar filas nuevas.
    v_all_check := coalesce(v_all.with_check, v_all.qual);

    foreach v_cmd in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      select count(*) into v_count from pg_policies
      where schemaname = 'public' and tablename = v_all.tablename and cmd = v_cmd and roles && v_all.roles;
      if v_count > 1 then
        raise exception 'Más de una política % en % para los mismos roles', v_cmd, v_all.tablename;
      end if;

      if v_count = 1 then
        select * into v_other from pg_policies
        where schemaname = 'public' and tablename = v_all.tablename and cmd = v_cmd and roles && v_all.roles;
        if v_other.roles::text[] <> v_all.roles::text[] then
          raise exception 'Roles distintos en % (% vs %)', v_all.tablename, v_other.policyname, v_all.policyname;
        end if;
        -- Fusión: la unión de lo que permitían las dos.
        if v_cmd = 'SELECT' or v_cmd = 'DELETE' then
          v_using := format('(%s) OR (%s)', v_other.qual, v_all_using);
          execute format('alter policy %I on public.%I using (%s)', v_other.policyname, v_all.tablename, v_using);
        elsif v_cmd = 'INSERT' then
          v_check := format('(%s) OR (%s)', v_other.with_check, v_all_check);
          execute format('alter policy %I on public.%I with check (%s)', v_other.policyname, v_all.tablename, v_check);
        else -- UPDATE
          v_using := format('(%s) OR (%s)', v_other.qual, v_all_using);
          v_check := format('(%s) OR (%s)', coalesce(v_other.with_check, v_other.qual), v_all_check);
          execute format('alter policy %I on public.%I using (%s) with check (%s)', v_other.policyname, v_all.tablename, v_using, v_check);
        end if;
        execute format('comment on policy %I on public.%I is %L', v_other.policyname, v_all.tablename,
          format('ADR 0011: fusionada (OR) con %s (FOR ALL). Antes USING: %s | WITH CHECK: %s', v_all.policyname, v_other.qual, v_other.with_check));
      else
        -- Sin política para este comando: una nueva con las expresiones de la FOR ALL.
        v_name := left(v_all.policyname, 55) || '_' || lower(v_cmd);
        if v_cmd = 'INSERT' then
          execute format('create policy %I on public.%I for insert to %s with check (%s)', v_name, v_all.tablename, v_roles, v_all_check);
        elsif v_cmd = 'UPDATE' then
          execute format('create policy %I on public.%I for update to %s using (%s) with check (%s)', v_name, v_all.tablename, v_roles, v_all_using, v_all_check);
        elsif v_cmd = 'DELETE' then
          execute format('create policy %I on public.%I for delete to %s using (%s)', v_name, v_all.tablename, v_roles, v_all_using);
        else
          execute format('create policy %I on public.%I for select to %s using (%s)', v_name, v_all.tablename, v_roles, v_all_using);
        end if;
        execute format('comment on policy %I on public.%I is %L', v_name, v_all.tablename,
          format('ADR 0011: parte de %s (FOR ALL), con sus mismas expresiones.', v_all.policyname));
      end if;
    end loop;

    execute format('drop policy %I on public.%I', v_all.policyname, v_all.tablename);
  end loop;

  -- Verificación: ninguna tabla con dos políticas permisivas para el mismo comando y rol.
  if exists (
    select 1
    from (
      select p.tablename, c.cmd, r.role
      from pg_policies p
      cross join lateral unnest(case when p.cmd = 'ALL' then array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] else array[p.cmd] end) c(cmd)
      cross join lateral unnest(p.roles) r(role)
      where p.schemaname = 'public' and p.permissive = 'PERMISSIVE'
    ) x
    group by tablename, cmd, role
    having count(*) > 1
  ) then
    raise exception 'Quedan políticas superpuestas';
  end if;
end $$;
