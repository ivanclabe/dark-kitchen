-- ADR 0019: dk_my_login_needs_password — the activation page asks invited people to create a password. Rolled-back transaction.
--
--   python3 supabase/tests/run.py login_needs_password

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
grant all on _t to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, encrypted_password, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000a9f1', 'invitado.np@prueba.test', '', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-00000000a9f2', 'con.clave.np@prueba.test', extensions.crypt('clave-de-prueba', extensions.gen_salt('bf')), 'authenticated', 'authenticated', now());

select pg_temp.act_as('00000000-0000-0000-0000-00000000a9f1');
set local role authenticated;
insert into _t (area, test, expected, got) values ('Password', 'Invited login without password', 'true', dk_my_login_needs_password()::text);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a9f2');
set local role authenticated;
insert into _t (area, test, expected, got) values ('Password', 'Login with password', 'false', dk_my_login_needs_password()::text);
reset role;

set local role anon;
do $$ begin
  begin perform dk_my_login_needs_password();
    insert into _t (area, test, expected, got) values ('Access', 'Anonymous call', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Access', 'Anonymous call', 'blocked', 'blocked', sqlerrm); end;
end $$;
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
