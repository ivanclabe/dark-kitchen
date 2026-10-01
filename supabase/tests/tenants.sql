-- ADR 0021: one subdomain per organization — slug as tenant, reserved words, immutability, aliases,
-- public resolution, one identity with memberships in two organizations, AI records. Rolled-back transaction.
--
--   python3 supabase/tests/run.py tenants

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, txt text) on commit drop;
grant all on _t, _ctx to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated', 'aal', p_aal)::text, true);
  select set_config('request.headers', case when p_kitchen is null then '{}' else json_build_object('x-dk-kitchen-id', p_kitchen)::text end, true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.blocked(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return 'blocked'; end;
$$;

insert into _ctx (key, id) values ('ivan', (select id from auth.users where email = 'ivanclabe@gmail.com'));
insert into _ctx (key, id, txt) select 'orgA', id, slug from dk_organizations where slug = 'dark-kitchen';
insert into _ctx (key, id, txt) select 'orgB', id, slug from dk_organizations where slug = 'julian-hamburguesas';
insert into _ctx (key, id) values ('A', (select id from dk_kitchens where organization_id = pg_temp.k('orgA') order by created_at limit 1));
insert into _ctx (key, id) values ('B', (select id from dk_kitchens where organization_id = pg_temp.k('orgB') order by created_at limit 1));

-- One identity, two organizations: ADMIN in A, KITCHEN in B. Plus someone without B.
insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000021a01', 'multi.tenant@prueba.test', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000021a02', 'solo.a@prueba.test', 'authenticated', 'authenticated', now());
insert into dk_users (id, auth_user_id, full_name, email, active) values
  ('10000000-0000-0000-0000-000000021a01', '00000000-0000-0000-0000-000000021a01', 'Multi Tenant', 'multi.tenant@prueba.test', true),
  ('10000000-0000-0000-0000-000000021a02', '00000000-0000-0000-0000-000000021a02', 'Solo A', 'solo.a@prueba.test', true);
insert into dk_organization_members (organization_id, user_id, is_super_admin, status) values
  (pg_temp.k('orgA'), '10000000-0000-0000-0000-000000021a01', false, 'active'),
  (pg_temp.k('orgB'), '10000000-0000-0000-0000-000000021a01', false, 'active'),
  (pg_temp.k('orgA'), '10000000-0000-0000-0000-000000021a02', false, 'active')
on conflict do nothing;
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id) values
  (pg_temp.k('A'), '10000000-0000-0000-0000-000000021a01', (select id from dk_roles where is_system and key = 'ADMIN')),
  (pg_temp.k('B'), '10000000-0000-0000-0000-000000021a01', (select id from dk_roles where is_system and key = 'KITCHEN')),
  (pg_temp.k('A'), '10000000-0000-0000-0000-000000021a02', (select id from dk_roles where is_system and key = 'CASHIER'));
insert into dk_customers (id, kitchen_id, full_name) values
  ('30000000-0000-0000-0000-000000021a0a', pg_temp.k('A'), 'Cliente Solo De A'),
  ('30000000-0000-0000-0000-000000021a0b', pg_temp.k('B'), 'Cliente Solo De B');

-- 1. Reserved words
insert into _t (area, test, expected, got) values
  ('Reserved', 'admin, www, api are reserved', 'true', (dk_is_reserved_slug('admin') and dk_is_reserved_slug('www') and dk_is_reserved_slug('API'))::text),
  ('Reserved', 'A normal slug is not', 'false', dk_is_reserved_slug('pizzas-del-barrio')::text),
  ('Reserved', 'A new organization named "Admin" gets admin-2', 'admin-2', dk_unique_slug('admin', 'organizations')),
  ('Reserved', 'Existing organizations keep their slug (valid)', '0', (select count(*)::text from dk_organizations where dk_is_reserved_slug(slug)));
insert into _t (area, test, expected, got) values ('Reserved', 'Saving a reserved slug', 'blocked',
  pg_temp.blocked($q$update dk_organizations set slug = 'www' where id = (select id from _ctx where key = 'orgA')$q$));

-- 2. Tenant codes (ADR 0022)
insert into _ctx (key, txt) values ('codeA', (select tenant_code from dk_organizations where id = pg_temp.k('orgA')));
insert into _ctx (key, txt) values ('codeB', (select tenant_code from dk_organizations where id = pg_temp.k('orgB')));
insert into _t (area, test, expected, got) values
  ('Code', 'Existing organizations have a code', '0', (select count(*)::text from dk_organizations where tenant_code is null)),
  ('Code', 'Format: 6 chars, no confusables, letter and digit', 'true',
    (select bool_and(tenant_code ~ '^[2-9A-HJKMNP-Z]{6}$' and tenant_code ~ '[A-Z]' and tenant_code ~ '[0-9]') from dk_organizations)::text),
  ('Code', 'All codes are different', 'true', ((select count(distinct tenant_code) from dk_organizations) = (select count(*) from dk_organizations))::text),
  ('Code', '200 generated codes are valid and different', '200',
    (select count(distinct c)::text from (select dk_new_tenant_code() c from generate_series(1, 200)) x where c ~ '^[2-9A-HJKMNP-Z]{6}$' and c ~ '[A-Z]' and c ~ '[0-9]')),
  ('Code', 'The code does not come from the name', 'false',
    (select bool_or(position(lower(tenant_code) in lower(name)) > 0) from dk_organizations)::text);
-- A client cannot choose it: the database always generates it.
insert into dk_organizations (slug, name, owner_user_id, tenant_code)
  values ('org-codigo-forzado', 'Org Código Forzado', '10000000-0000-0000-0000-000000021a02', (select txt from _ctx where key = 'codeA'));
insert into _t (area, test, expected, got) values ('Code', 'A code sent on insert is ignored (no duplicates)', 'true',
  ((select tenant_code from dk_organizations where slug = 'org-codigo-forzado') <> (select txt from _ctx where key = 'codeA'))::text);
insert into _t (area, test, expected, got) values ('Code', 'UNIQUE is the last guard', 'blocked',
  pg_temp.blocked($q$alter table dk_organizations disable trigger dk_trg_organizations_tenant_code; insert into dk_organizations (slug, name, owner_user_id, tenant_code) values ('dup-code', 'Dup', (select id from dk_users where email = 'multi.tenant@prueba.test'), (select txt from _ctx where key = 'codeA'))$q$));
alter table dk_organizations enable trigger dk_trg_organizations_tenant_code;

-- 3. Public resolution by code (anonymous)
set local role anon;
insert into _t (area, test, expected, got) values
  ('Public', 'Code resolves: name and active', 'true · Dark Kitchen · true',
    (select (v ->> 'exists') || ' · ' || (v ->> 'name') || ' · ' || (v ->> 'active') from (select dk_tenant_public((select txt from _ctx where key = 'codeA')) v) x)),
  ('Public', 'Lowercase code (as in the subdomain) resolves too', 'true', dk_tenant_public(lower((select txt from _ctx where key = 'codeA'))) ->> 'exists'),
  ('Public', 'The name-based subdomain does not resolve (no fallback)', 'false', dk_tenant_public('dark-kitchen') ->> 'exists'),
  ('Public', 'Unknown code', 'false', dk_tenant_public('ZZ99ZZ') ->> 'exists'),
  ('Public', 'Invalid text', 'false', dk_tenant_public('<script>') ->> 'exists'),
  ('Public', 'No internal ids', 'false', (dk_tenant_public((select txt from _ctx where key = 'codeA')) ? 'id')::text);
reset role;

-- 4. Nobody changes the code (nor the internal slug)
select pg_temp.act_as(pg_temp.k('ivan'), pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Immutable', 'Code (even a platform admin)', 'blocked', pg_temp.blocked($q$update dk_organizations set tenant_code = 'AB23CD' where id = (select id from _ctx where key = 'orgA')$q$)),
  ('Immutable', 'Slug (even a platform admin)', 'blocked', pg_temp.blocked($q$update dk_organizations set slug = 'otro-nombre' where id = (select id from _ctx where key = 'orgA')$q$)),
  ('Immutable', 'Renaming keeps the code', 'true',
    (select pg_temp.blocked($q$update dk_organizations set name = 'Dark Kitchen Renombrada' where id = (select id from _ctx where key = 'orgA')$q$) = 'ALLOWED'
       and (select tenant_code from dk_organizations where id = pg_temp.k('orgA')) = (select txt from _ctx where key = 'codeA'))::text);
reset role;
update dk_organizations set name = 'Dark Kitchen' where id = pg_temp.k('orgA');

-- 4b. Both creation paths generate a code: the Global Admin portal and the public sign-up
select pg_temp.act_as(pg_temp.k('ivan'), null, 'aal2');
set local role authenticated;
do $$
declare v jsonb;
begin
  v := dk_ga_create_organization('Portal Código', 'restaurant', 'grill', 'Ana Código', 'ana.codigo@prueba.test',
                                  (select key from dk_plans where status = 'public' and self_serve order by sort_order limit 1));
  insert into _t (area, test, expected, got) values ('Create', 'Portal: the summary carries the code', 'true',
    ((v ->> 'tenantCode') ~ '^[2-9A-HJKMNP-Z]{6}$' and (v ->> 'tenantCode') = (select tenant_code from dk_organizations where id = (v ->> 'organizationId')::uuid))::text);
  insert into _t (area, test, expected, got) values ('Create', 'Portal: the list carries the code', 'true',
    exists (select 1 from jsonb_array_elements(dk_ga_organizations()) e where e ->> 'tenantCode' = v ->> 'tenantCode')::text);
end $$;
reset role;
insert into auth.users (id, email, aud, role, email_confirmed_at) values ('00000000-0000-0000-0000-000000021a03', 'registro.codigo@prueba.test', 'authenticated', 'authenticated', now());
select pg_temp.act_as('00000000-0000-0000-0000-000000021a03', null);
set local role authenticated;
do $$
declare v_slug text;
begin
  v_slug := dk_create_organization('Registro Código', 'restaurant', 'grill', p_full_name => 'Registro Código', p_plan => (select key from dk_plans where status = 'public' and self_serve order by sort_order limit 1));
  insert into _t (area, test, expected, got) values ('Create', 'Sign-up: the organization gets a code', 'true',
    ((select o.tenant_code from dk_organizations o join dk_kitchens k on k.organization_id = o.id where k.slug = v_slug) ~ '^[2-9A-HJKMNP-Z]{6}$')::text);
  insert into _t (area, test, expected, got) values ('Create', 'Sign-up: my context carries the code', 'true',
    exists (select 1 from jsonb_array_elements(dk_my_context() -> 'organizations') o where o ->> 'name' = 'Registro Código' and (o ->> 'tenantCode') is not null)::text);
end $$;
reset role;

-- 4c. Knowing the code does not grant access (ADR 0022, 10)
select pg_temp.act_as('00000000-0000-0000-0000-000000021a02', pg_temp.k('B'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Code', 'Knowing the code of B gives nothing without membership', '0',
    (select count(*)::text from dk_customers where id = '30000000-0000-0000-0000-000000021a0b'));
reset role;

-- 5. One identity, two memberships: the role depends on the organization (account)
select pg_temp.act_as('00000000-0000-0000-0000-000000021a01', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Membership', 'In A: administrator (settings.manage)', 'true', dk_can('settings.manage')::text),
  ('Membership', 'In A: sees the customer of A', '1', (select count(*)::text from dk_customers where id = '30000000-0000-0000-0000-000000021a0a')),
  ('Membership', 'In A: does not see the customer of B', '0', (select count(*)::text from dk_customers where id = '30000000-0000-0000-0000-000000021a0b'));
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000021a01', pg_temp.k('B'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Membership', 'In B: kitchen (no settings.manage)', 'false', dk_can('settings.manage')::text),
  ('Membership', 'In B: kitchen.prepare', 'true', dk_can('kitchen.prepare')::text),
  ('Membership', 'In B: does not see the customer of A', '0', (select count(*)::text from dk_customers where id = '30000000-0000-0000-0000-000000021a0a'));
reset role;

-- 6. Without membership in B: nothing, even forcing the header
select pg_temp.act_as('00000000-0000-0000-0000-000000021a02', pg_temp.k('B'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Isolation', 'Header of B without membership: no account', 'null', coalesce(dk_current_kitchen_id()::text, 'null')),
  ('Isolation', 'Header of B without membership: no orders of B', '0', (select count(*)::text from dk_orders where kitchen_id = pg_temp.k('B'))),
  ('Isolation', 'Cannot write in B', 'blocked', pg_temp.blocked($q$insert into dk_customers (kitchen_id, full_name) values ((select id from _ctx where key = 'B'), 'Intruso')$q$));
update dk_organizations set name = 'Hackeado' where id = pg_temp.k('orgB');
reset role;
insert into _t (area, test, expected, got) values ('Isolation', 'Cannot rename the organization B', 'Julian Hamburguesas', (select name from dk_organizations where id = pg_temp.k('orgB')));

-- 7. AI records carry their organization
insert into dk_ai_insights (kitchen_id, feature_key, status, input) values (pg_temp.k('B'), 'copilot', 'ok', '{}');
insert into _t (area, test, expected, got) values ('AI', 'Organization filled from the account', 'true',
  ((select organization_id from dk_ai_insights where kitchen_id = pg_temp.k('B') order by created_at desc limit 1) = pg_temp.k('orgB'))::text),
  ('AI', 'Every existing record has its organization', '0', (select count(*)::text from dk_ai_insights where organization_id is null));

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
