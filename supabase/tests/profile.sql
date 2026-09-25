-- Pruebas del perfil propio (ADR 0008, Fase A). Transacción revertida.
--
--   python3 supabase/tests/run.py profile

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
grant all on _t to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000f1', 'perfil.uno@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f2', 'perfil.dos@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', 'Perfil Uno', true),
  ('10000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f2', 'Perfil Dos', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000f1', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform dk_update_my_profile('  Uno Renombrado ', 'barista');
  insert into _t (area, test, expected, got) values ('Perfil', 'Cambia su nombre y avatar', 'Uno Renombrado · barista',
    (select full_name || ' · ' || avatar_key from dk_users where id = '10000000-0000-0000-0000-0000000000f1'));

  perform dk_update_my_profile('Uno Renombrado', null);
  insert into _t (area, test, expected, got) values ('Perfil', 'Vuelve al avatar por defecto', 'NULL',
    coalesce((select avatar_key from dk_users where id = '10000000-0000-0000-0000-0000000000f1'), 'NULL'));

  begin perform dk_update_my_profile('Uno', 'https://malo.test/foto.png');
    insert into _t (area, test, expected, got) values ('Perfil', 'Avatar fuera del catálogo (URL)', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Perfil', 'Avatar fuera del catálogo (URL)', 'bloqueado', 'bloqueado', sqlerrm); end;

  begin perform dk_update_my_profile('Uno', 'pizza');
    insert into _t (area, test, expected, got) values ('Perfil', 'Icono de Cuenta como avatar de persona', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Perfil', 'Icono de Cuenta como avatar de persona', 'bloqueado', 'bloqueado', sqlerrm); end;

  begin perform dk_update_my_profile('x', 'robot');
    insert into _t (area, test, expected, got) values ('Perfil', 'Nombre de 1 letra', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Perfil', 'Nombre de 1 letra', 'bloqueado', 'bloqueado', sqlerrm); end;

  update dk_users set full_name = 'Hackeado', avatar_key = 'cap' where id = '10000000-0000-0000-0000-0000000000f2';

  begin update dk_users set platform_role = 'SUPERADMIN' where auth_user_id = auth.uid();
    insert into _t (area, test, expected, got) values ('Aislamiento', 'Darse privilegios de plataforma', 'sin cambios',
      coalesce((select platform_role from dk_users where id = '10000000-0000-0000-0000-0000000000f1'), 'sin cambios'));
  exception when others then insert into _t (area, test, expected, got, detail) values ('Aislamiento', 'Darse privilegios de plataforma', 'sin cambios', 'sin cambios', sqlerrm); end;
end $$;
reset role;

-- Verificación como dueño de la base: el intento directo no cambió a la otra persona.
insert into _t (area, test, expected, got) values ('Aislamiento', 'Editar el perfil de otra persona directo', 'Perfil Dos · sin avatar',
  (select full_name || ' · ' || coalesce(avatar_key, 'sin avatar') from dk_users where id = '10000000-0000-0000-0000-0000000000f2'));

-- Sin sesión
select set_config('request.jwt.claims', '{}', true);
set local role anon;
do $$ begin
  begin perform dk_update_my_profile('Anónimo', 'robot');
    insert into _t (area, test, expected, got) values ('Aislamiento', 'Sin sesión', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Aislamiento', 'Sin sesión', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
