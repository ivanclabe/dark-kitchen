-- ADR 0019: Global Admin portal backend (authorization with MFA, provisioning, invitations, reading). Rolled-back transaction.
--
--   python3 supabase/tests/run.py global_admin

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, txt text) on commit drop;
grant all on _t, _ctx to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid, p_aal text default 'aal1', p_email text default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated', 'aal', p_aal,
    'email', coalesce(p_email, (select email from auth.users where id = p_auth)))::text, true);
  select set_config('request.headers', '{}', true);
$$;

insert into _ctx (key, id) values ('ivan', (select id from auth.users where email = 'ivanclabe@gmail.com'));
insert into _ctx (key, txt) values ('plan', (select key from dk_plans where status = 'public' and self_serve order by sort_order limit 1));
insert into _ctx (key, txt) values ('existingOrg', (select name from dk_organizations order by created_at limit 1));

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000a901', 'normal.ga@prueba.test', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-00000000a902', 'login.sin.perfil@prueba.test', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-00000000a903', 'registro.publico@prueba.test', 'authenticated', 'authenticated', now());
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-00000000a901', '00000000-0000-0000-0000-00000000a901', 'Usuario normal', true);

-- 1. Who gets in
set local role anon;
do $$ begin
  begin perform dk_ga_overview(null, null);
    insert into _t (area, test, expected, got) values ('Access', 'Anonymous reads the dashboard', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Access', 'Anonymous reads the dashboard', 'blocked', 'blocked', sqlerrm); end;
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a901', 'aal2');
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Access', 'A normal user is not Global Admin', 'false', dk_ga_me() ->> 'isGlobalAdmin');
  begin perform dk_ga_overview(null, null);
    insert into _t (area, test, expected, got) values ('Access', 'A normal user (even with MFA) reads the dashboard', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Access', 'A normal user (even with MFA) reads the dashboard', 'blocked', 'blocked', sqlerrm); end;
  begin perform dk_ga_create_organization('Intruso SAS', 'fast_food', 'burgers', 'Intruso', 'intruso@prueba.test', (select txt from _ctx where key = 'plan'));
    insert into _t (area, test, expected, got) values ('Access', 'A normal user creates an organization from the portal', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Access', 'A normal user creates an organization from the portal', 'blocked', 'blocked', sqlerrm); end;
  begin perform dk_ga_users();
    insert into _t (area, test, expected, got) values ('Access', 'A normal user lists all users', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Access', 'A normal user lists all users', 'blocked', 'blocked', sqlerrm); end;
end $$;
reset role;

select pg_temp.act_as((select id from _ctx where key = 'ivan'), 'aal1');
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Access', 'Global Admin without MFA: role seen, aal1', 'true · aal1',
    (dk_ga_me() ->> 'isGlobalAdmin') || ' · ' || (dk_ga_me() ->> 'aal'));
  begin perform dk_ga_overview(null, null);
    insert into _t (area, test, expected, got) values ('Access', 'Global Admin without MFA reads the dashboard', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Access', 'Global Admin without MFA reads the dashboard', 'blocked', 'blocked', sqlerrm); end;
  begin perform dk_platform_set_feature('voice_commands', true);
    insert into _t (area, test, expected, got) values ('Access', 'Platform function without MFA', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Access', 'Platform function without MFA', 'blocked', 'blocked', sqlerrm); end;
end $$;
reset role;

-- 2. Global Admin with MFA: reading
select pg_temp.act_as((select id from _ctx where key = 'ivan'), 'aal2');
set local role authenticated;
do $$
declare
  v_overview jsonb := dk_ga_overview(now() - interval '30 days', now());
begin
  insert into _t (area, test, expected, got) values ('Reading', 'Dashboard with real totals', 'true',
    ((v_overview -> 'organizations' ->> 'total')::int = (select count(*) from dk_organizations))::text);
  insert into _t (area, test, expected, got) values ('Reading', 'Daily series covers the range', 'true', (jsonb_array_length(v_overview -> 'daily') between 30 and 32)::text);
  insert into _t (area, test, expected, got) values ('Reading', 'Organizations list', 'true',
    (jsonb_array_length(dk_ga_organizations()) = (select count(*) from dk_organizations))::text);
  insert into _t (area, test, expected, got) values ('Reading', 'AI monitoring lists AI and voice features', 'true',
    (jsonb_array_length(dk_ga_ai_monitoring(null, null) -> 'features') = (select count(*) from dk_features where category in ('ai', 'voice')))::text);
  insert into _t (area, test, expected, got) values ('Reading', 'Voice usage is marked as not tracked', 'false',
    (select f ->> 'tracked' from jsonb_array_elements(dk_ga_ai_monitoring(null, null) -> 'features') f where f ->> 'key' = 'voice_commands'));
  insert into _t (area, test, expected, got) values ('Reading', 'Activity is readable', 'true', (jsonb_typeof(dk_ga_activity(p_limit => 5) -> 'items') = 'array')::text);
  perform dk_platform_set_feature('voice_commands', true);
  insert into _t (area, test, expected, got) values ('Access', 'Platform function with MFA', 'ok', 'ok');
end $$;
reset role;

-- 3. Before creating: checks
select pg_temp.act_as((select id from _ctx where key = 'ivan'), 'aal2');
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Checks', 'Invalid e-mail', 'false', dk_ga_check_new_organization('Nueva', 'no-es-correo') ->> 'emailValid');
  insert into _t (area, test, expected, got) values ('Checks', 'An e-mail that already owns an organization', 'true',
    (dk_ga_check_new_organization('Nueva', 'IvanClabe@gmail.com') -> 'user' ->> 'ownsOrganization' is not null)::text);
  insert into _t (area, test, expected, got) values ('Checks', 'Same organization name (case/accents ignored)', 'true',
    (jsonb_array_length(dk_ga_check_new_organization(upper((select txt from _ctx where key = 'existingOrg')), 'x@prueba.test') -> 'similarOrganizations') >= 1)::text);

  begin perform dk_ga_create_organization('Otra Más', 'fast_food', 'burgers', 'Iván', 'ivanclabe@gmail.com', (select txt from _ctx where key = 'plan'));
    insert into _t (area, test, expected, got) values ('Checks', 'Admin who already owns an organization', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Checks', 'Admin who already owns an organization', 'blocked', 'blocked', sqlerrm); end;
  begin perform dk_ga_create_organization((select txt from _ctx where key = 'existingOrg'), 'fast_food', 'burgers', 'Ana Duplicada', 'ana.dup@prueba.test', (select txt from _ctx where key = 'plan'));
    insert into _t (area, test, expected, got) values ('Checks', 'Similar organization without confirming', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Checks', 'Similar organization without confirming', 'blocked', 'blocked', sqlerrm); end;
  begin perform dk_ga_create_organization('Sin Correo SAS', 'fast_food', 'burgers', 'Ana', 'ana@', (select txt from _ctx where key = 'plan'));
    insert into _t (area, test, expected, got) values ('Checks', 'Invalid admin e-mail', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Checks', 'Invalid admin e-mail', 'blocked', 'blocked', sqlerrm); end;
end $$;
reset role;

-- 4. Create: new person (pending profile) and a person with a login but no profile
select pg_temp.act_as((select id from _ctx where key = 'ivan'), 'aal2');
set local role authenticated;
do $$
declare
  v jsonb;
  v2 jsonb;
begin
  v := dk_ga_create_organization('Arepas del Portal', 'fast_food', 'burgers', 'Laura Portal', 'Laura.Portal@Prueba.test', (select txt from _ctx where key = 'plan'), 'CO', 'Medellín');
  insert into _ctx (key, id, txt) values ('newOrg', (v ->> 'organizationId')::uuid, v ->> 'token');
  insert into _ctx (key, id) values ('newAdmin', (v ->> 'adminProfileId')::uuid);
  insert into _t (area, test, expected, got) values ('Create', 'Summary: e-mail, status, token', 'laura.portal@prueba.test · pending_activation · true',
    (v ->> 'adminEmail') || ' · ' || (v ->> 'status') || ' · ' || (length(v ->> 'token') = 48)::text);

  v2 := dk_ga_create_organization('Empanadas Login', 'fast_food', 'burgers', 'Con Login', 'login.sin.perfil@prueba.test', (select txt from _ctx where key = 'plan'));
  insert into _ctx (key, id) values ('loginAdmin', (v2 ->> 'adminProfileId')::uuid);
  insert into _t (area, test, expected, got) values ('Create', 'Existing login is reused for the admin', 'true', v2 ->> 'adminHasLogin');
end $$;
reset role;

insert into _t (area, test, expected, got) values ('Create', 'Organization: created by the Global Admin, owner = new admin', 'true',
  (select o.created_by = (select id from dk_users where auth_user_id = (select id from _ctx where key = 'ivan'))
          and o.owner_user_id = (select id from _ctx where key = 'newAdmin')
   from dk_organizations o where o.id = (select id from _ctx where key = 'newOrg'))::text);
insert into _t (area, test, expected, got) values ('Create', 'Admin profile is pending (no login yet)', 'true',
  (select auth_user_id is null and email = 'laura.portal@prueba.test' from dk_users where id = (select id from _ctx where key = 'newAdmin'))::text);
insert into _t (area, test, expected, got) values ('Create', 'Organization Admin membership', 'true',
  (select is_super_admin from dk_organization_members where organization_id = (select id from _ctx where key = 'newOrg') and user_id = (select id from _ctx where key = 'newAdmin'))::text);
insert into _t (area, test, expected, got) values ('Create', 'First account, with the admin as ADMIN', '1 · ADMIN',
  (select count(*)::text from dk_kitchens where organization_id = (select id from _ctx where key = 'newOrg')) || ' · ' ||
  (select r.key from dk_kitchen_members m join dk_kitchens k on k.id = m.kitchen_id join dk_roles r on r.id = m.default_role_id
   where k.organization_id = (select id from _ctx where key = 'newOrg') and m.user_id = (select id from _ctx where key = 'newAdmin')));
insert into _t (area, test, expected, got) values ('Create', 'Subscription with the chosen plan', 'true',
  (select plan_key = (select txt from _ctx where key = 'plan') from dk_subscriptions where organization_id = (select id from _ctx where key = 'newOrg'))::text);
insert into _t (area, test, expected, got) values ('Create', 'Activation token stored as hash only', '1 · false',
  (select count(*)::text from dk_user_activations where organization_id = (select id from _ctx where key = 'newOrg')) || ' · ' ||
  (select (token_hash = (select txt from _ctx where key = 'newOrg'))::text from dk_user_activations where organization_id = (select id from _ctx where key = 'newOrg')));
insert into _t (area, test, expected, got) values ('Audit', 'Creation recorded by the portal', 'global_admin.organization_created · global_admin',
  (select event_type || ' · ' || source from dk_audit_log where organization_id = (select id from _ctx where key = 'newOrg') and event_type = 'global_admin.organization_created'));
insert into _t (area, test, expected, got) values ('Create', 'Profile created for an existing login', 'true',
  (select auth_user_id = '00000000-0000-0000-0000-00000000a902' from dk_users where id = (select id from _ctx where key = 'loginAdmin'))::text);

-- 5. The invited person activates with the same e-mail
insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000a904', 'laura.portal@prueba.test', 'authenticated', 'authenticated', now());
select pg_temp.act_as('00000000-0000-0000-0000-00000000a904', 'aal1');
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Activation', 'Activation returns the first account', 'true',
    (dk_accept_activation((select txt from _ctx where key = 'newOrg')) is not null)::text);
end $$;
reset role;
insert into _t (area, test, expected, got) values ('Activation', 'Profile now bound to the new login', 'true',
  (select auth_user_id = '00000000-0000-0000-0000-00000000a904' from dk_users where id = (select id from _ctx where key = 'newAdmin'))::text);

select pg_temp.act_as((select id from _ctx where key = 'ivan'), 'aal2');
set local role authenticated;
do $$ begin
  begin perform dk_ga_resend_invitation((select id from _ctx where key = 'newOrg'));
    insert into _t (area, test, expected, got) values ('Activation', 'Resend after activation', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Activation', 'Resend after activation', 'blocked', 'blocked', sqlerrm); end;

  -- 6. Critical actions need explicit confirmation
  begin perform dk_ga_set_organization_active((select id from _ctx where key = 'newOrg'), false, 'otro nombre');
    insert into _t (area, test, expected, got) values ('Actions', 'Deactivate without typing the exact name', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Actions', 'Deactivate without typing the exact name', 'blocked', 'blocked', sqlerrm); end;
  perform dk_ga_set_organization_active((select id from _ctx where key = 'newOrg'), false, 'Arepas del Portal');
  insert into _t (area, test, expected, got) values ('Actions', 'Deactivated and recorded', 'false · 1',
    (select active::text from dk_organizations where id = (select id from _ctx where key = 'newOrg')) || ' · ' ||
    (select count(*)::text from dk_audit_log where organization_id = (select id from _ctx where key = 'newOrg') and event_type = 'global_admin.organization_deactivated'));
  begin perform dk_ga_set_global_admin('ivanclabe@gmail.com', false);
    insert into _t (area, test, expected, got) values ('Actions', 'Global Admin removes their own access', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Actions', 'Global Admin removes their own access', 'blocked', 'blocked', sqlerrm); end;
  perform dk_ga_log_invitation((select id from _ctx where key = 'newOrg'), 'laura.portal@prueba.test', true);
  insert into _t (area, test, expected, got) values ('Audit', 'Invitation recorded', 'user.invited',
    (select event_type from dk_audit_log where organization_id = (select id from _ctx where key = 'newOrg') and event_type = 'user.invited'));
  insert into _t (area, test, expected, got) values ('Reading', 'Users list shows the new admin', 'active',
    (select u ->> 'status' from jsonb_array_elements(dk_ga_users()) u where u ->> 'email' = 'laura.portal@prueba.test'));
end $$;
reset role;

-- 7. The public signup keeps working (same shared provisioning)
select pg_temp.act_as('00000000-0000-0000-0000-00000000a903', 'aal1');
set local role authenticated;
do $$
declare
  v_slug text;
begin
  v_slug := dk_create_organization('Registro Público SAS', 'fast_food', 'burgers', p_plan => (select txt from _ctx where key = 'plan'), p_full_name => 'Registro Público');
  insert into _t (area, test, expected, got) values ('Signup', 'Public signup creates organization and account', 'true', (v_slug is not null)::text);
  insert into _t (area, test, expected, got) values ('Signup', 'Signup is idempotent', 'true',
    (dk_create_organization('Registro Público SAS', 'fast_food', 'burgers', p_plan => (select txt from _ctx where key = 'plan')) = v_slug)::text);
end $$;
reset role;
insert into _t (area, test, expected, got) values ('Signup', 'Owner is ADMIN of the first account', 'ADMIN',
  (select r.key from dk_kitchen_members m join dk_roles r on r.id = m.default_role_id join dk_users u on u.id = m.user_id
   where u.auth_user_id = '00000000-0000-0000-0000-00000000a903'));

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
