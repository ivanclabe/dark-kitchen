-- ADR 0042: Quanela Consumer only reads what an account publishes, and consumers'
-- profiles are theirs alone. Self-contained (creates its own accounts). Rolled-back transaction.
--
--   python3 supabase/tests/run.py consumer_public
--   python3 supabase/tests/run.py consumer_public --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid) on commit drop;
grant all on _t, _ctx to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', coalesce(json_build_object('x-dk-kitchen-id', p_kitchen)::text, '{}'), true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.blocked(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return 'blocked'; end;
$$;
-- Every key of a jsonb value, at any depth.
create or replace function pg_temp.keys(p jsonb) returns setof text language sql as $$
  with recursive walk(v) as (
    select p
    union all
    select coalesce(e.value, a.value)
    from walk
    left join lateral jsonb_each(case when jsonb_typeof(walk.v) = 'object' then walk.v end) e on true
    left join lateral jsonb_array_elements(case when jsonb_typeof(walk.v) = 'array' then walk.v end) a on true
    where jsonb_typeof(walk.v) in ('object', 'array') and coalesce(e.value, a.value) is not null
  )
  select distinct k from walk, lateral jsonb_object_keys(case when jsonb_typeof(walk.v) = 'object' then walk.v end) k
$$;
-- 'none' when the query is refused or returns no rows (local and cloud grant anon differently).
create or replace function pg_temp.none(p_sql text) returns text language plpgsql as $$
declare v bigint;
begin execute 'select count(*) from (' || p_sql || ') q' into v; return case when v = 0 then 'none' else v::text end;
exception when others then return 'none'; end;
$$;
create or replace function pg_temp.names(p jsonb) returns text language sql as $$
  select coalesce(string_agg(i ->> 'name', ', ' order by i ->> 'name'), '') from jsonb_array_elements(p -> 'items') i
$$;

-- Users: an admin and a cashier of A, an admin of B, two consumers.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000042a1', 'admin.a@consumer.prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000042a2', 'caja.a@consumer.prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000042b1', 'admin.b@consumer.prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000042c3', 'admin.c@consumer.prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000042f1', null, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000042f2', null, 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name) values
  ('10000000-0000-0000-0000-0000000042a1', '00000000-0000-0000-0000-0000000042a1', 'Admin A'),
  ('10000000-0000-0000-0000-0000000042a2', '00000000-0000-0000-0000-0000000042a2', 'Caja A'),
  ('10000000-0000-0000-0000-0000000042b1', '00000000-0000-0000-0000-0000000042b1', 'Admin B'),
  ('10000000-0000-0000-0000-0000000042c3', '00000000-0000-0000-0000-0000000042c3', 'Admin C');

-- Three organizations, one account each: A publishes, B does not, C publishes but is inactive.
insert into dk_organizations (id, slug, name, owner_user_id, category) values
  ('20000000-0000-0000-0000-0000000042a0', 'consumer-test-a', 'Consumer Test A', '10000000-0000-0000-0000-0000000042a1', 'burgers'),
  ('20000000-0000-0000-0000-0000000042b0', 'consumer-test-b', 'Consumer Test B', '10000000-0000-0000-0000-0000000042b1', 'burgers'),
  ('20000000-0000-0000-0000-0000000042c0', 'consumer-test-c', 'Consumer Test C', '10000000-0000-0000-0000-0000000042c3', 'burgers');
insert into dk_kitchens (id, slug, name, organization_id, legal_name, tax_id, phone) values
  ('30000000-0000-0000-0000-0000000042a0', 'consumer-test-a', 'Consumer Test A', '20000000-0000-0000-0000-0000000042a0', 'Razón Social A SAS', '900111222', '+573001234567'),
  ('30000000-0000-0000-0000-0000000042b0', 'consumer-test-b', 'Consumer Test B', '20000000-0000-0000-0000-0000000042b0', null, null, null),
  ('30000000-0000-0000-0000-0000000042c0', 'consumer-test-c', 'Consumer Test C', '20000000-0000-0000-0000-0000000042c0', null, null, null);
insert into _ctx values ('A', '30000000-0000-0000-0000-0000000042a0'), ('B', '30000000-0000-0000-0000-0000000042b0'), ('C', '30000000-0000-0000-0000-0000000042c0');

-- The owners (Admin A, Admin B) are members already (Super Admin of their organization).
insert into dk_organization_members (organization_id, user_id, is_super_admin, status) values
  ('20000000-0000-0000-0000-0000000042a0', '10000000-0000-0000-0000-0000000042a2', false, 'active')
on conflict do nothing;
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
select pg_temp.k(m.kitchen), m.user_id, (select id from dk_roles where is_system and key = m.role_key)
from (values ('A', '10000000-0000-0000-0000-0000000042a1'::uuid, 'ADMIN'), ('A', '10000000-0000-0000-0000-0000000042a2'::uuid, 'CASHIER'),
             ('B', '10000000-0000-0000-0000-0000000042b1'::uuid, 'ADMIN')) m(kitchen, user_id, role_key)
on conflict do nothing;
insert into dk_member_roles (kitchen_id, user_id, role_id)
  select kitchen_id, user_id, default_role_id from dk_kitchen_members where user_id::text like '10000000-0000-0000-0000-000000004%'
on conflict do nothing;

-- Dishes. 7777 is a cost that must never leave.
insert into dk_products (id, kitchen_id, name, description, price, estimated_cost) values
  ('40000000-0000-0000-0000-0000000042a1', pg_temp.k('A'), 'Zeta Burger Publicada', 'Con queso', 25000, 7777),
  ('40000000-0000-0000-0000-0000000042a2', pg_temp.k('A'), 'Zeta Burger Oculta', 'No publicada', 26000, 7777),
  ('40000000-0000-0000-0000-0000000042a3', pg_temp.k('A'), 'Zeta Burger Inactiva', 'Publicada pero inactiva', 27000, 7777),
  ('40000000-0000-0000-0000-0000000042b1', pg_temp.k('B'), 'Zeta Burger De B', 'B no publica', 20000, 7777),
  ('40000000-0000-0000-0000-0000000042c1', pg_temp.k('C'), 'Zeta Burger De C', 'C está inactiva', 20000, 7777);
update dk_products set active = false where id = '40000000-0000-0000-0000-0000000042a3';
insert into dk_ingredient_categories (id, kitchen_id, name) values ('50000000-0000-0000-0000-0000000042a0', pg_temp.k('A'), 'General');
insert into dk_ingredients (id, kitchen_id, code, name, base_unit_id, category_id, avg_cost) values
  ('60000000-0000-0000-0000-0000000042a1', pg_temp.k('A'), 'ZQ-1', 'Queso secreto', (select id from dk_units where code = 'g'), '50000000-0000-0000-0000-0000000042a0', 7777);
insert into dk_recipes (id, kitchen_id, product_id, version, is_active) values
  ('70000000-0000-0000-0000-0000000042a1', pg_temp.k('A'), '40000000-0000-0000-0000-0000000042a1', 1, true);
insert into dk_recipe_items (kitchen_id, recipe_id, ingredient_id, quantity) values
  (pg_temp.k('A'), '70000000-0000-0000-0000-0000000042a1', '60000000-0000-0000-0000-0000000042a1', 123);
update dk_products set active_recipe_id = '70000000-0000-0000-0000-0000000042a1' where id = '40000000-0000-0000-0000-0000000042a1';

-- ADR 0047: name, public address and cuisine are the account's (not stored in the storefront).
insert into dk_storefronts (kitchen_id, published, share_metrics) values
  (pg_temp.k('A'), true, false),
  (pg_temp.k('B'), false, false),
  (pg_temp.k('C'), true, false);
insert into dk_storefront_products (kitchen_id, product_id, published, show_ingredients) values
  (pg_temp.k('A'), '40000000-0000-0000-0000-0000000042a1', true, false),
  (pg_temp.k('A'), '40000000-0000-0000-0000-0000000042a2', false, false),
  (pg_temp.k('A'), '40000000-0000-0000-0000-0000000042a3', true, false),
  (pg_temp.k('B'), '40000000-0000-0000-0000-0000000042b1', true, false),
  (pg_temp.k('C'), '40000000-0000-0000-0000-0000000042c1', true, false);
update dk_organizations set active = false where id = '20000000-0000-0000-0000-0000000042c0';

-- 1. Anonymous: only what is published -------------------------------------------
set local role anon;
insert into _t (area, test, expected, got) values
  ('Public', 'Only the published, active dish of a published, active account', 'Zeta Burger Publicada',
    pg_temp.names(dk_public_search_dishes('{"terms": ["zeta burger"]}'))),
  ('Public', 'Exact ids cannot reach unpublished dishes', 'Zeta Burger Publicada',
    pg_temp.names(dk_public_search_dishes('{"ids": ["40000000-0000-0000-0000-0000000042a1", "40000000-0000-0000-0000-0000000042a2", "40000000-0000-0000-0000-0000000042b1", "40000000-0000-0000-0000-0000000042c1"]}'))),
  ('Public', 'An unpublished storefront looks exactly like an unknown one', 'true',
    ((dk_public_search_dishes('{"storefront": "consumer-test-b"}') - 'generated_at') = (dk_public_search_dishes('{"storefront": "no-existe-xyz"}') - 'generated_at'))::text),
  ('Public', 'Inactive organization is hidden', '',
    pg_temp.names(dk_public_search_dishes('{"storefront": "consumer-test-c"}'))),
  ('Public', 'No private keys at any depth', '',
    (select coalesce(string_agg(k, ', '), '') from pg_temp.keys(dk_public_search_dishes('{"terms": ["zeta"]}')) k
     where k ~* '(cost|margin|recipe|supplier|tax_id|legal_name|kitchen_id|organization_id|email|estimated|customer|quantity)'
        or (k ~* 'phone' and k <> 'whatsapp_phone'))),
  ('Public', 'The cost value never appears', 'false',
    (dk_public_search_dishes('{"terms": ["zeta"]}')::text like '%7777%')::text),
  ('Public', 'The account''s legal data never appears', 'false',
    (dk_public_search_dishes('{"terms": ["zeta"]}')::text ~ '(Razón Social|900111222|3001234567)')::text),
  ('Public', 'Ingredients hidden unless the account shows them', 'null',
    coalesce((dk_public_search_dishes('{"terms": ["zeta"]}') -> 'items' -> 0 ->> 'ingredients'), 'null')),
  ('Public', 'A hidden ingredient is not searchable', '',
    pg_temp.names(dk_public_search_dishes('{"terms": ["secreto"]}'))),
  ('Public', 'Metrics are null when the account does not share them', 'null',
    coalesce(dk_public_search_dishes('{"terms": ["zeta"]}') -> 'items' -> 0 -> 'storefront' ->> 'metrics', 'null')),
  ('Public', 'Rating does not exist: always null', 'null',
    coalesce(dk_public_search_dishes('{"terms": ["zeta"]}') -> 'items' -> 0 ->> 'rating', 'null')),
  ('Public', 'Anonymous cannot read private tables', 'none', pg_temp.none($q$select 1 from dk_products where name like 'Zeta%'$q$)),
  ('Public', 'Anonymous cannot read storefronts directly', 'blocked', pg_temp.blocked('select * from dk_storefronts')),
  ('Public', 'Anonymous cannot read consumers', 'blocked', pg_temp.blocked('select * from dk_consumers')),
  ('Public', 'Anonymous cannot manage a storefront', 'blocked', pg_temp.blocked('select dk_storefront_get()')),
  ('Public', 'Anonymous has no consumer profile', 'blocked', pg_temp.blocked('select dk_consumer_profile_get()')),
  ('Public', 'Bad parameters are rejected', 'blocked', pg_temp.blocked($q$select dk_public_search_dishes('[1]')$q$));
reset role;

-- ADR 0047: what customers see as the business is the account itself.
set local role anon;
insert into _t (area, test, expected, got) values
  ('Identity', 'Name, address and cuisine come from the account (cuisine: the organization''s by default)', 'Consumer Test A · consumer-test-a · burgers',
    (select concat_ws(' · ', i -> 'storefront' ->> 'name', i -> 'storefront' ->> 'slug', i -> 'storefront' ->> 'cuisine')
     from jsonb_array_elements(dk_public_search_dishes('{"terms": ["zeta"]}') -> 'items') i limit 1)),
  ('Identity', 'The account''s address finds it', 'Zeta Burger Publicada', pg_temp.names(dk_public_search_dishes('{"storefront": "consumer-test-a"}')));
reset role;
update dk_kitchens set name = 'Zeta Grill', cuisine = 'grill' where id = pg_temp.k('A');
set local role anon;
insert into _t (area, test, expected, got) values
  ('Identity', 'Renaming the account or choosing its cuisine shows at once', 'Zeta Grill · grill',
    (select concat_ws(' · ', i -> 'storefront' ->> 'name', i -> 'storefront' ->> 'cuisine')
     from jsonb_array_elements(dk_public_search_dishes('{"terms": ["zeta"]}') -> 'items') i limit 1)),
  ('Identity', 'The account''s cuisine is searchable', 'Zeta Burger Publicada', pg_temp.names(dk_public_search_dishes('{"terms": ["parrilla", "grill"]}')));
reset role;
update dk_kitchens set name = 'Consumer Test A', cuisine = null where id = pg_temp.k('A');

-- Ingredients appear (names only) once the account shows them; then they are searchable.
update dk_storefront_products set show_ingredients = true where product_id = '40000000-0000-0000-0000-0000000042a1';
set local role anon;
insert into _t (area, test, expected, got) values
  ('Public', 'Shown ingredients: names only', '["Queso secreto"]',
    (dk_public_search_dishes('{"terms": ["zeta"]}') -> 'items' -> 0 -> 'ingredients')::text),
  ('Public', 'Shown ingredients are searchable', 'Zeta Burger Publicada', pg_temp.names(dk_public_search_dishes('{"terms": ["secreto"]}'))),
  ('Public', 'The recipe quantity never appears', 'false', (dk_public_search_dishes('{"terms": ["zeta"]}')::text like '%123%')::text);
reset role;

-- 2. A forged account header changes nothing for anonymous callers ------------------
select set_config('request.headers', json_build_object('x-dk-kitchen-id', pg_temp.k('B'))::text, true);
set local role anon;
insert into _t (area, test, expected, got) values
  ('Forged header', 'Same public result', 'Zeta Burger Publicada', pg_temp.names(dk_public_search_dishes('{"terms": ["zeta burger"]}'))),
  ('Forged header', 'Still no private rows', 'none', pg_temp.none($q$select 1 from dk_products where name like 'Zeta%'$q$));
reset role;

-- 3. Staff: only storefront.manage, only their account --------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000042a2', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Staff', 'Cashier cannot manage the storefront', 'blocked', pg_temp.blocked('select dk_storefront_get()')),
  ('Staff', 'Cashier cannot publish', 'blocked',
    pg_temp.blocked($q$select dk_storefront_save('{"public_slug": "consumer-test-a", "display_name": "Hack", "published": true}')$q$));
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000042a1', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Staff', 'Admin reads the publication of A (its name is the account''s)', 'Consumer Test A', dk_storefront_get() -> 'storefront' ->> 'display_name'),
  ('Staff', 'Admin cannot publish a dish of B', 'blocked',
    pg_temp.blocked($q$select dk_storefront_products_save('[{"product_id": "40000000-0000-0000-0000-0000000042b1", "published": true}]')$q$)),
  ('Staff', 'Invalid dietary tag is rejected', 'blocked',
    pg_temp.blocked($q$select dk_storefront_products_save('[{"product_id": "40000000-0000-0000-0000-0000000042a1", "published": true, "dietary_tags": ["keto"]}]')$q$)),
  ('Staff', 'Staff cannot read consumers', 'blocked', pg_temp.blocked('select * from dk_consumers'));
select dk_storefront_products_save('[{"product_id": "40000000-0000-0000-0000-0000000042a2", "published": true, "dietary_tags": ["vegetarian"]}]');
insert into _t (area, test, expected, got) values
  ('Staff', 'Publishing a dish makes it public at once', 'Zeta Burger Oculta, Zeta Burger Publicada',
    pg_temp.names(dk_public_search_dishes('{"terms": ["zeta burger"]}'))),
  ('Staff', 'Dietary tags filter', 'Zeta Burger Oculta', pg_temp.names(dk_public_search_dishes('{"terms": ["zeta"], "tags": ["vegetarian"]}')));
select dk_storefront_save('{"public_slug": "otra-cosa", "display_name": "Hack", "published": false}');
insert into _t (area, test, expected, got) values
  ('Staff', 'Saving cannot change the name or the address (they are the account''s)', 'Consumer Test A · consumer-test-a',
    (dk_storefront_get() -> 'storefront' ->> 'display_name') || ' · ' || (dk_storefront_get() -> 'storefront' ->> 'public_slug')),
  ('Staff', 'Unpublishing the storefront hides everything', '', pg_temp.names(dk_public_search_dishes('{"terms": ["zeta"]}')));
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000042b1', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Staff', 'Admin of B with the header of A sees nothing of A', 'blocked', pg_temp.blocked('select dk_storefront_get()'));
reset role;

-- 4. Consumers: their profile only, only with consent ---------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000042f1', null);
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Consumer', 'Without consent nothing is stored', 'false',
    (dk_consumer_profile_save('{"profile_consent": false, "display_name": "X", "preferences": [{"kind": "avoid_ingredient", "value": "cebolla"}]}') ->> 'profile_consent')),
  ('Consumer', 'With consent the profile is saved', 'cebolla',
    (dk_consumer_profile_save('{"profile_consent": true, "display_name": "X", "phone": "3001112233", "preferences": [{"kind": "avoid_ingredient", "value": "cebolla"}]}') -> 'preferences' -> 0 ->> 'value'));
-- A new statement: dk_consumer_profile_get is STABLE and would not see a write of the same statement.
insert into _t (area, test, expected, got) values
  ('Consumer', 'Phone is normalized to E.164', '+573001112233', dk_consumer_profile_get() ->> 'phone'),
  ('Consumer', 'Unknown preference kind is rejected', 'blocked',
    pg_temp.blocked($q$select dk_consumer_profile_save('{"profile_consent": true, "preferences": [{"kind": "salary", "value": "x"}]}')$q$)),
  ('Consumer', 'No direct table access', 'blocked', pg_temp.blocked('select * from dk_consumer_preferences')),
  ('Consumer', 'A consumer is not staff: no account data', 'blocked', pg_temp.blocked('select dk_storefront_get()'));
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000042f2', null);
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Consumer', 'Another consumer does not see the first one''s profile', 'false', dk_consumer_profile_get() ->> 'profile_consent');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000042f1', null);
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Consumer', 'Withdrawing consent deletes the profile', 'false', dk_consumer_profile_save('{"profile_consent": false}') ->> 'profile_consent');
reset role;
insert into _t (area, test, expected, got) values
  ('Consumer', 'Nothing left after withdrawing', '0',
    ((select count(*) from dk_consumers where id = '00000000-0000-0000-0000-0000000042f1')
     + (select count(*) from dk_consumer_preferences where consumer_id = '00000000-0000-0000-0000-0000000042f1'))::text);

-- 5. Assistant limit ------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000042f2', null);
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('AI limit', '10 calls per minute, then no', '10 allowed, 11th false',
    (select count(*) filter (where ok) || ' allowed, 11th ' || (array_agg(ok order by i))[11]
     from (select i, dk_consumer_ai_allow() as ok from generate_series(1, 11) i) x));
reset role;
set local role anon;
insert into _t (area, test, expected, got) values ('AI limit', 'Anonymous (no session) cannot use it', 'blocked', pg_temp.blocked('select dk_consumer_ai_allow()'));
reset role;

-- 6. Grants of the new functions -------------------------------------------------------
insert into _t (area, test, expected, got) values
  ('Grants', 'Only dk_public_search_dishes is executable by anon among the new functions', 'dk_public_search_dishes',
    (select string_agg(p.proname, ', ' order by p.proname) from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('dk_fold', 'dk_storefront_open_state', 'dk_storefront_metrics', 'dk_storefront_products_guard', 'dk_public_search_dishes',
                         'dk_storefront_get', 'dk_storefront_save', 'dk_storefront_products_save', 'dk_consumer_profile_get',
                         'dk_consumer_profile_save', 'dk_consumer_ai_allow')
       and has_function_privilege('anon', p.oid, 'execute'))),
  ('Grants', 'Private helpers are not executable by authenticated', 'false',
    (has_function_privilege('authenticated', 'dk_storefront_metrics(uuid)', 'execute')
     or has_function_privilege('authenticated', 'dk_storefront_open_state(uuid, timestamptz)', 'execute'))::text),
  ('Grants', 'RLS on every new table', '5',
    (select count(*) from pg_class where relname in ('dk_storefronts', 'dk_storefront_products', 'dk_consumers', 'dk_consumer_preferences', 'dk_consumer_ai_runs') and relrowsecurity)::text),
  ('Grants', 'No policy for anon or public on the new tables', '0',
    (select count(*) from pg_policies where tablename like any (array['dk_storefront%', 'dk_consumer%']) and roles && array['anon', 'public']::name[])::text);

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
