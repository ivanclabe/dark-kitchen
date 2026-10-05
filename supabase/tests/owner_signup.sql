-- ADR 0025: the owner signs up with Google, Instagram or phone (besides email). Rolled-back transaction.
--
--   python3 supabase/tests/run.py owner_signup

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
grant all on _t to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.try_create(p_name text, p_full_name text default null) returns text language plpgsql as $$
begin
  return dk_create_organization(p_name, 'fast_food', 'burgers', null, null, 'CO', null, null, null, p_full_name, 'business');
exception when others then return 'blocked: ' || sqlerrm;
end;
$$;

-- People: phone (confirmed / not), Google, Instagram (no email), and an email whose invitation is pending.
insert into auth.users (id, email, phone, aud, role, email_confirmed_at, phone_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000025a01', null, '573001112233', 'authenticated', 'authenticated', null, now(), '{}'),
  ('00000000-0000-0000-0000-000000025a02', null, '573004445566', 'authenticated', 'authenticated', null, null, '{}'),
  ('00000000-0000-0000-0000-000000025a03', 'dueno.google@prueba.test', null, 'authenticated', 'authenticated', now(), null, '{"full_name": "Gabriela Google"}'),
  ('00000000-0000-0000-0000-000000025a04', null, null, 'authenticated', 'authenticated', null, null, '{"name": "Insta Burger"}'),
  ('00000000-0000-0000-0000-000000025a05', 'invitada@prueba.test', null, 'authenticated', 'authenticated', now(), null, '{"full_name": "Invitada"}'),
  ('00000000-0000-0000-0000-000000025a06', null, null, 'authenticated', 'authenticated', null, null, '{}');
insert into auth.identities (provider_id, user_id, identity_data, provider) values
  ('g-123', '00000000-0000-0000-0000-000000025a03', '{"sub": "g-123", "email": "dueno.google@prueba.test"}', 'google'),
  ('ig-456', '00000000-0000-0000-0000-000000025a04', '{"sub": "ig-456"}', 'custom:instagram'),
  ('x-789', '00000000-0000-0000-0000-000000025a06', '{"sub": "x-789"}', 'github');
-- A pending invitation (profile without login) with the same email as 025a05.
insert into dk_users (full_name, email, active) values ('Invitada', 'invitada@prueba.test', true);

-- Checks run as the database owner (RLS would hide other people's rows) and in their own statements.
create or replace function pg_temp.profile_of(p_auth uuid) returns uuid language sql as $$ select id from dk_users where auth_user_id = p_auth $$;
create or replace function pg_temp.first_slug(p_auth uuid) returns text language sql as $$
  select k.slug from dk_kitchens k join dk_organizations o on o.id = k.organization_id
  where o.owner_user_id = pg_temp.profile_of(p_auth) order by k.created_at limit 1
$$;
create temp table _r (who text primary key, result text) on commit drop;
grant all on _r to authenticated;

-- Each person tries to create a business (as themselves).
select pg_temp.act_as('00000000-0000-0000-0000-000000025a01');
set local role authenticated;
insert into _r values ('phone', pg_temp.try_create('Arepas del Teléfono', 'Pedro Pérez'));
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000025a01');
set local role authenticated;
insert into _r values ('phone-again', pg_temp.try_create('Otro nombre'));
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000025a02');
set local role authenticated;
insert into _r values ('phone-unconfirmed', pg_temp.try_create('Fantasma'));
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000025a03');
set local role authenticated;
insert into _r values ('google', pg_temp.try_create('Pizzas Google'));
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000025a04');
set local role authenticated;
insert into _r values ('instagram', pg_temp.try_create('Insta Burger'));
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000025a06');
set local role authenticated;
insert into _r values ('other-provider', pg_temp.try_create('GitHub Burger'));
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000025a05');
set local role authenticated;
insert into _r values ('invited', pg_temp.try_create('Negocio Invitada'));
reset role;
select set_config('request.jwt.claims', '{}', true);

insert into _t (area, test, expected, got) values
  ('Phone', 'Confirmed phone creates the business', 'ok', (select case when result like 'blocked%' then result else 'ok' end from _r where who = 'phone')),
  ('Phone', 'Profile with the typed name and no email', 'Pedro Pérez · ',
    (select full_name || ' · ' || coalesce(email, '') from dk_users where auth_user_id = '00000000-0000-0000-0000-000000025a01')),
  ('Phone', 'Owner, SUPER_ADMIN, ADMIN of the first account and a tenant code', 'true · true · true',
    (select m.is_super_admin::text || ' · '
            || exists (select 1 from dk_member_roles mr join dk_roles r on r.id = mr.role_id join dk_kitchens k on k.id = mr.kitchen_id
                       where k.organization_id = o.id and mr.user_id = o.owner_user_id and r.key = 'ADMIN')::text || ' · '
            || (o.tenant_code ~ '^[2-9A-HJKMNP-Z]{6}$')::text
     from dk_organizations o join dk_organization_members m on m.organization_id = o.id and m.user_id = o.owner_user_id
     where o.owner_user_id = pg_temp.profile_of('00000000-0000-0000-0000-000000025a01'))),
  ('Phone', 'Second call: same account, one profile, one business', 'same · 1 · 1',
    (case when (select result from _r where who = 'phone-again') = pg_temp.first_slug('00000000-0000-0000-0000-000000025a01') then 'same' else 'different' end)
    || ' · ' || (select count(*) from dk_users where auth_user_id = '00000000-0000-0000-0000-000000025a01')
    || ' · ' || (select count(*) from dk_organizations where owner_user_id = pg_temp.profile_of('00000000-0000-0000-0000-000000025a01'))),
  ('Phone', 'Unconfirmed phone is blocked', 'blocked', (select split_part(result, ':', 1) from _r where who = 'phone-unconfirmed')),
  ('Google', 'Creates the business', 'ok', (select case when result like 'blocked%' then result else 'ok' end from _r where who = 'google')),
  ('Google', 'Profile: provider name and its verified email', 'Gabriela Google · dueno.google@prueba.test',
    (select full_name || ' · ' || email from dk_users where auth_user_id = '00000000-0000-0000-0000-000000025a03')),
  ('Instagram', 'Creates the business without email', 'ok', (select case when result like 'blocked%' then result else 'ok' end from _r where who = 'instagram')),
  ('Instagram', 'Profile with the provider name', 'Insta Burger', (select full_name from dk_users where auth_user_id = '00000000-0000-0000-0000-000000025a04')),
  ('Providers', 'An identity from a provider that is not allowed is blocked', 'blocked', (select split_part(result, ':', 1) from _r where who = 'other-provider')),
  ('Invitations', 'Signing up with the email of a pending invitation is blocked', 'blocked: PENDING_INVITATION',
    (select split_part(result, ':', 1) || ': ' || split_part(split_part(result, ': ', 2), ':', 1) from _r where who = 'invited')),
  ('Invitations', 'No second profile with that email', '1', (select count(*)::text from dk_users where email = 'invitada@prueba.test')),
  ('Invitations', 'The pending profile is intact (no login yet)', 'true', (select (auth_user_id is null)::text from dk_users where email = 'invitada@prueba.test'));

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
