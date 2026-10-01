-- ADR 0019: dk_ga_password_link_target — "Enlace para crear contraseña" from the Global Admin portal. Rolled-back transaction.
--
--   python3 supabase/tests/run.py password_link

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, txt text) on commit drop;
grant all on _t, _ctx to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid, p_aal text default 'aal2') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated', 'aal', p_aal,
    'email', (select email from auth.users where id = p_auth))::text, true);
  select set_config('request.headers', '{}', true);
$$;

insert into _ctx (key, id) values ('ivan', (select id from auth.users where email = 'ivanclabe@gmail.com'));
insert into _ctx (key, id) values ('ivanProfile', (select id from dk_users where auth_user_id = (select id from _ctx where key = 'ivan')));
insert into _ctx (key, txt) values ('plan', (select key from dk_plans where status = 'public' and self_serve order by sort_order limit 1));

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000a9e1', 'con.login.pl@prueba.test', 'authenticated', 'authenticated', now());
insert into dk_users (id, auth_user_id, full_name, email, active) values
  ('10000000-0000-0000-0000-00000000a9e1', '00000000-0000-0000-0000-00000000a9e1', 'Con Login', 'con.login.pl@prueba.test', true),
  ('10000000-0000-0000-0000-00000000a9e2', null, 'Sin Acceso', 'sin.acceso.pl@prueba.test', true),
  ('10000000-0000-0000-0000-00000000a9e3', null, 'Desactivado', 'desactivado.pl@prueba.test', false);

-- A pending Organization Admin, created from the portal
select pg_temp.act_as((select id from _ctx where key = 'ivan'));
set local role authenticated;
do $$
declare v jsonb;
begin
  v := dk_ga_create_organization('Hamburguesas Enlace', 'fast_food', 'burgers', 'Julia Enlace', 'julia.enlace@prueba.test', (select txt from _ctx where key = 'plan'));
  insert into _ctx (key, id, txt) values ('org', (v ->> 'organizationId')::uuid, v ->> 'token');
  insert into _ctx (key, id) values ('pending', (v ->> 'adminProfileId')::uuid);
end $$;
reset role;

-- 1. Who can ask for it
select pg_temp.act_as((select id from _ctx where key = 'ivan'), 'aal1');
set local role authenticated;
do $$ begin
  begin perform dk_ga_password_link_target((select id from _ctx where key = 'pending'));
    insert into _t (area, test, expected, got) values ('Access', 'Global Admin without MFA', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Access', 'Global Admin without MFA', 'blocked', 'blocked', sqlerrm); end;
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a9e1');
set local role authenticated;
do $$ begin
  begin perform dk_ga_password_link_target('10000000-0000-0000-0000-00000000a9e1');
    insert into _t (area, test, expected, got) values ('Access', 'Normal user', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Access', 'Normal user', 'blocked', 'blocked', sqlerrm); end;
end $$;
reset role;

-- 2. Which link
select pg_temp.act_as((select id from _ctx where key = 'ivan'));
set local role authenticated;
do $$
declare v jsonb;
begin
  v := dk_ga_password_link_target((select id from _ctx where key = 'pending'));
  insert into _ctx (key, txt) values ('newToken', v ->> 'token');
  insert into _t (area, test, expected, got) values ('Mode', 'Pending admin → activation with a fresh token', 'activation · julia.enlace@prueba.test · true',
    (v ->> 'mode') || ' · ' || (v ->> 'email') || ' · ' || (length(v ->> 'token') = 48)::text);

  v := dk_ga_password_link_target('10000000-0000-0000-0000-00000000a9e1');
  insert into _t (area, test, expected, got) values ('Mode', 'User with a login → reset, no token', 'reset · true',
    (v ->> 'mode') || ' · ' || (v -> 'token' = 'null'::jsonb)::text);

  begin perform dk_ga_password_link_target('10000000-0000-0000-0000-00000000a9e2');
    insert into _t (area, test, expected, got) values ('Mode', 'No login and no activation', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Mode', 'No login and no activation', 'blocked', 'blocked', sqlerrm); end;

  begin perform dk_ga_password_link_target('10000000-0000-0000-0000-00000000a9e3');
    insert into _t (area, test, expected, got) values ('Mode', 'Deactivated user', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Mode', 'Deactivated user', 'blocked', 'blocked', sqlerrm); end;

  begin perform dk_ga_password_link_target((select id from _ctx where key = 'ivanProfile'));
    insert into _t (area, test, expected, got) values ('Mode', 'Another Global Admin', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Mode', 'Another Global Admin', 'blocked', 'blocked', sqlerrm); end;
end $$;
reset role;

insert into _t (area, test, expected, got) values ('Mode', 'Old activation link revoked, new one valid', 'revoked · valid',
  (select status from dk_activation_preview((select txt from _ctx where key = 'org'))) || ' · ' ||
  (select status from dk_activation_preview((select txt from _ctx where key = 'newToken'))));
insert into _t (area, test, expected, got) values ('Audit', 'Recorded by the portal', '2',
  (select count(*)::text from dk_audit_log where event_type = 'global_admin.password_link_created' and source = 'global_admin'
     and record_key in ((select id from _ctx where key = 'pending')::text, '10000000-0000-0000-0000-00000000a9e1')));

-- 3. After activating, the admin gets a reset link
insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000a9e4', 'julia.enlace@prueba.test', 'authenticated', 'authenticated', now());
select pg_temp.act_as('00000000-0000-0000-0000-00000000a9e4', 'aal1');
set local role authenticated;
do $$ begin perform dk_accept_activation((select txt from _ctx where key = 'newToken')); end $$;
reset role;
select pg_temp.act_as((select id from _ctx where key = 'ivan'));
set local role authenticated;
insert into _t (area, test, expected, got) values ('Mode', 'Activated admin → reset', 'reset',
  dk_ga_password_link_target((select id from _ctx where key = 'pending')) ->> 'mode');
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
