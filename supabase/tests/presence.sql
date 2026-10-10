-- ADR 0050: who may join (and announce themselves in) an account's presence
-- channel. Rolled-back transaction.
--
--   python3 supabase/tests/run.py presence

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid) on commit drop;
grant all on _t, _ctx to authenticated;
grant usage on sequence _t_n_seq to authenticated;

create or replace function pg_temp.act_as(p_auth uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.topic(p_key text) returns text language sql as $$ select 'account:' || pg_temp.k(p_key) || ':presence' $$;

-- An owner with two accounts (A, B), a cook in A, a cashier in B, an inactive member of A.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000050a01', 'duena.presencia@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000050a02', 'cocina.presencia@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000050a03', 'caja.presencia@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000050a04', 'inactiva.presencia@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-000000050a01', '00000000-0000-0000-0000-000000050a01', 'Dueña', true),
  ('10000000-0000-0000-0000-000000050a02', '00000000-0000-0000-0000-000000050a02', 'Cocina', true),
  ('10000000-0000-0000-0000-000000050a03', '00000000-0000-0000-0000-000000050a03', 'Caja', true),
  ('10000000-0000-0000-0000-000000050a04', '00000000-0000-0000-0000-000000050a04', 'Inactiva', true);
insert into dk_organizations (slug, name, owner_user_id, sector, category)
  values ('grupo-presencia', 'Grupo Presencia', '10000000-0000-0000-0000-000000050a01', 'fast_food', 'burgers');
insert into _ctx values ('org', (select id from dk_organizations where slug = 'grupo-presencia'));

select pg_temp.act_as('00000000-0000-0000-0000-000000050a01');
set local role authenticated;
do $$ begin insert into _ctx values ('A', dk_create_kitchen('Centro', 'centro-presencia', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();
update dk_subscriptions set plan_key = 'business' where organization_id = pg_temp.k('org');
select pg_temp.act_as('00000000-0000-0000-0000-000000050a01');
set local role authenticated;
do $$ begin insert into _ctx values ('B', dk_create_kitchen('Norte', 'norte-presencia', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();

insert into dk_kitchen_members (kitchen_id, user_id, default_role_id, active)
select k, u, (select id from dk_roles where is_system and key = r), act
from (values
  (pg_temp.k('A'), '10000000-0000-0000-0000-000000050a02'::uuid, 'KITCHEN', true),
  (pg_temp.k('B'), '10000000-0000-0000-0000-000000050a03'::uuid, 'CASHIER', true),
  (pg_temp.k('A'), '10000000-0000-0000-0000-000000050a04'::uuid, 'CASHIER', false)
) v(k, u, r, act);

-- Can this person join (and track in) this account's channel? Both policies of
-- realtime.messages use dk_presence_allowed(realtime.topic()); Realtime sets the
-- topic. (The test cannot insert in realtime.messages: its daily partitions
-- belong to Realtime.)
create or replace function pg_temp.can_join(p_auth uuid, p_key text) returns text language plpgsql as $$
declare v boolean;
begin
  perform pg_temp.act_as(p_auth);
  perform set_config('realtime.topic', pg_temp.topic(p_key), true);
  execute 'set local role authenticated';
  v := public.dk_presence_allowed(realtime.topic());
  execute 'reset role';
  return case when v then 'entra' else 'no entra' end;
end;
$$;

insert into _t (area, test, expected, got) values
  ('Políticas', 'Leer y anunciarse: solo presencia y con la regla', '2',
    (select count(*)::text from pg_policies where schemaname = 'realtime' and tablename = 'messages' and roles = '{authenticated}'
       and coalesce(qual, with_check) like '%extension = ''presence''%' and coalesce(qual, with_check) like '%dk_presence_allowed(realtime.topic())%')),
  ('Políticas', 'Ninguna regla para anónimos', '0',
    (select count(*)::text from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname like 'dk_presence%' and 'anon' = any(roles)));

insert into _t (area, test, expected, got) values
  ('Miembros', 'Cocina de A entra al canal de A', 'entra', pg_temp.can_join('00000000-0000-0000-0000-000000050a02', 'A')),
  ('Miembros', 'Caja de B entra al canal de B', 'entra', pg_temp.can_join('00000000-0000-0000-0000-000000050a03', 'B')),
  ('Superadmin de la organización', 'La dueña entra a A y a B', 'entra · entra',
    pg_temp.can_join('00000000-0000-0000-0000-000000050a01', 'A') || ' · ' || pg_temp.can_join('00000000-0000-0000-0000-000000050a01', 'B')),
  ('Aislamiento', 'Cocina de A no entra al canal de B', 'no entra', pg_temp.can_join('00000000-0000-0000-0000-000000050a02', 'B')),
  ('Aislamiento', 'Caja de B no entra al canal de A', 'no entra', pg_temp.can_join('00000000-0000-0000-0000-000000050a03', 'A')),
  ('Aislamiento', 'Un miembro inactivo no entra', 'no entra', pg_temp.can_join('00000000-0000-0000-0000-000000050a04', 'A'));

-- Another topic shape, no session, or another extension: never.
select pg_temp.act_as('00000000-0000-0000-0000-000000050a02');
insert into _t (area, test, expected, got) values
  ('Canal', 'Otro nombre de canal', 'false', dk_presence_allowed('account:' || pg_temp.k('A') || ':chat')::text),
  ('Canal', 'Texto que no es un canal', 'false', dk_presence_allowed('account:x:presence')::text);
select set_config('request.jwt.claims', '{}', true);
insert into _t (area, test, expected, got) values
  ('Canal', 'Sin sesión', 'false', dk_presence_allowed(pg_temp.topic('A'))::text);
select pg_temp.as_owner();

-- A deactivated account closes its channel.
-- (the account guard trigger is skipped only inside this rolled-back test)
set local session_replication_role = replica;
update dk_kitchens set active = false where id = pg_temp.k('A');
set local session_replication_role = origin;
insert into _t (area, test, expected, got) values
  ('Cuenta', 'Cuenta desactivada: nadie entra', 'no entra', pg_temp.can_join('00000000-0000-0000-0000-000000050a02', 'A'));
set local session_replication_role = replica;
update dk_kitchens set active = true where id = pg_temp.k('A');
set local session_replication_role = origin;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
