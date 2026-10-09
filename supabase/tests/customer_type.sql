-- ADR 0044: business customers (empresas) and preferred customers — the type and
-- its fields, the tax id unique per account without separators, who may mark a
-- customer as preferred, the list (search, filters, summary), the detail and
-- Copilot, and that WhatsApp intake keeps creating persons. Rolled back.
--
--   python3 supabase/tests/run.py customer_type

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid) on commit drop;
create temp table _r (key text primary key, v jsonb) on commit drop;
grant all on _t, _ctx, _r to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', json_build_object('x-dk-kitchen-id', p_kitchen)::text, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.r(p_key text) returns jsonb language sql as $$ select v from _r where key = p_key $$;
create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end;
$$;

insert into _ctx values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx values ('B', (select id from dk_kitchens where id <> pg_temp.k('A') order by created_at limit 1));
insert into _ctx values ('org', (select organization_id from dk_kitchens where id = pg_temp.k('A')));
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000044a01', 'caja.empresas@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000044a02', 'solo.crea@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-000000044a01', '00000000-0000-0000-0000-000000044a01', 'Caja Empresas', true),
  ('10000000-0000-0000-0000-000000044a02', '00000000-0000-0000-0000-000000044a02', 'Solo Crea', true);
-- A custom role that may create customers but not edit them.
insert into dk_roles (id, organization_id, key, name, is_system) values ('60000000-0000-0000-0000-000000044a01', pg_temp.k('org'), 'SOLO_CREA_CLIENTES', 'SOLO_CREA_CLIENTES', false);
insert into dk_role_permissions (role_id, permission_key) values
  ('60000000-0000-0000-0000-000000044a01', 'customers.view'), ('60000000-0000-0000-0000-000000044a01', 'customers.create');
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id) values
  (pg_temp.k('A'), '10000000-0000-0000-0000-000000044a01', (select id from dk_roles where is_system and key = 'CASHIER')),
  (pg_temp.k('A'), '10000000-0000-0000-0000-000000044a02', '60000000-0000-0000-0000-000000044a01');

-- 1. Every customer so far is a person, not preferred.
insert into _t (area, test, expected, got) values
  ('Model', 'Existing customers: persons, not preferred', '0',
    (select count(*)::text from dk_customers where customer_type <> 'person' or preferred));

-- 2. Cashier creates a company and a person (as the app does: a direct insert).
select pg_temp.act_as('00000000-0000-0000-0000-000000044a01', pg_temp.k('A'));
set local role authenticated;
insert into dk_customers (id, full_name, phone, customer_type, legal_name, tax_id, contact_name, preferred, preferred_note) values
  ('30000000-0000-0000-0000-000000044a01', 'Oficinas Andinas', '3009990441', 'company', '  Oficinas Andinas S.A.S. ', ' 900.123.456-7 ', 'Marta Ruiz', true, ' Convenio corporativo '),
  ('30000000-0000-0000-0000-000000044a02', 'Pedro Pérez', '3009990442', 'person', '', '', '', false, '');
insert into _t (area, test, expected, got) values
  ('Model', 'Fields trimmed, blank is nothing, tax id upper case', 'Oficinas Andinas S.A.S. · 900.123.456-7 · Convenio corporativo · null · null',
    (select concat_ws(' · ', a.legal_name, a.tax_id, a.preferred_note, coalesce(b.legal_name, 'null'), coalesce(b.tax_id, 'null'))
     from dk_customers a, dk_customers b where a.id = '30000000-0000-0000-0000-000000044a01' and b.id = '30000000-0000-0000-0000-000000044a02')),
  ('Tax id', 'The same NIT written another way is a duplicate', 'duplicate',
    case when pg_temp.err($$insert into dk_customers (full_name, customer_type, tax_id) values ('Otra', 'company', '9001234567')$$) like '%dk_customers_kitchen_tax_id_key%' then 'duplicate' else 'ALLOWED' end),
  ('Model', 'An unknown type is refused', 'refused',
    case when pg_temp.err($$insert into dk_customers (full_name, customer_type) values ('X', 'empresa')$$) = 'ok' then 'ALLOWED' else 'refused' end);
reset role;

-- The same NIT in another account is not a duplicate.
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values
  ('Tax id', 'Another account may have the same NIT', 'ok',
    pg_temp.err(format($$insert into dk_customers (kitchen_id, full_name, customer_type, tax_id) values (%L, 'Oficinas B', 'company', '900123456-7')$$, pg_temp.k('B'))));

-- 3. Who may mark a customer as preferred: customers.edit.
select pg_temp.act_as('00000000-0000-0000-0000-000000044a02', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Preferred', 'Creating is allowed without customers.edit…', 'ok',
    pg_temp.err($$insert into dk_customers (full_name, phone) values ('Cliente Normal', '3009990443')$$)),
  ('Preferred', '…but not marking it preferred', 'refused',
    case when pg_temp.err($$insert into dk_customers (full_name, phone, preferred) values ('Cliente VIP', '3009990444', true)$$) like '%preferencial%' then 'refused' else 'ALLOWED' end);
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000044a01', pg_temp.k('A'));
set local role authenticated;
update dk_customers set preferred = true where id = '30000000-0000-0000-0000-000000044a02';
reset role;
insert into _t (area, test, expected, got) values
  ('Preferred', 'Who edits customers marks one preferred', 'true', (select preferred::text from dk_customers where id = '30000000-0000-0000-0000-000000044a02'));

-- 4. The list, the summary and the detail.
select pg_temp.act_as('00000000-0000-0000-0000-000000044a01', pg_temp.k('A'));
set local role authenticated;
insert into _r values
  ('by-nit', dk_customers_list(p_search => '900123', p_status => 'all')),
  ('by-legal', dk_customers_list(p_search => 'andinas s.a.s', p_status => 'all')),
  ('by-contact', dk_customers_list(p_search => 'marta', p_status => 'all')),
  ('companies', dk_customers_list(p_type => 'company', p_status => 'all', p_limit => 100)),
  ('preferred', dk_customers_list(p_preferred => true, p_status => 'all', p_limit => 100)),
  ('summary', dk_customers_summary()),
  ('detail', dk_customer_detail('30000000-0000-0000-0000-000000044a01'));
insert into _t (area, test, expected, got) values
  ('Model', 'An unknown type filter is refused', 'refused',
    case when pg_temp.err($$select dk_customers_list(p_type => 'empresa')$$) like '%Tipo de cliente%' then 'refused' else 'ALLOWED' end);
reset role;
insert into _t (area, test, expected, got) values
  ('List', 'Search by NIT (part, without separators)', 'Oficinas Andinas', pg_temp.r('by-nit') -> 'rows' -> 0 ->> 'fullName'),
  ('List', 'Search by legal name and by contact', '1 · 1', (pg_temp.r('by-legal') ->> 'total') || ' · ' || (pg_temp.r('by-contact') ->> 'total')),
  ('List', 'A row says type, NIT, contact and preferred', 'company · 900.123.456-7 · Marta Ruiz · true · Convenio corporativo',
    (select concat_ws(' · ', r ->> 'type', r ->> 'taxId', r ->> 'contactName', r ->> 'preferred', r ->> 'preferredNote')
     from jsonb_array_elements(pg_temp.r('by-nit') -> 'rows') r)),
  ('List', 'Filter: companies', 'true',
    ((select bool_and(r ->> 'type' = 'company') from jsonb_array_elements(pg_temp.r('companies') -> 'rows') r)
     and (pg_temp.r('companies') ->> 'total')::int = (select count(*) from dk_customers where kitchen_id = pg_temp.k('A') and customer_type = 'company'))::text),
  ('List', 'Filter: preferred', 'true',
    ((select bool_and((r ->> 'preferred')::boolean) from jsonb_array_elements(pg_temp.r('preferred') -> 'rows') r)
     and (pg_temp.r('preferred') ->> 'total')::int = (select count(*) from dk_customers where kitchen_id = pg_temp.k('A') and preferred))::text),
  ('Summary', 'Counts preferred customers and companies', 'true',
    ((pg_temp.r('summary') ->> 'preferred')::int = (select count(*) from dk_customers where kitchen_id = pg_temp.k('A') and preferred)
     and (pg_temp.r('summary') ->> 'companies')::int = (select count(*) from dk_customers where kitchen_id = pg_temp.k('A') and customer_type = 'company'))::text),
  ('Detail', 'The detail brings the company fields', 'company · Oficinas Andinas S.A.S. · Marta Ruiz · true',
    concat_ws(' · ', pg_temp.r('detail') ->> 'type', pg_temp.r('detail') ->> 'legalName', pg_temp.r('detail') ->> 'contactName', pg_temp.r('detail') ->> 'preferred'));

-- 5. Copilot: filters and the NIT only with the contact.
select pg_temp.act_as('00000000-0000-0000-0000-000000044a01', pg_temp.k('A'));
set local role authenticated;
insert into _r values
  ('cop', dk_copilot_customers(p_preferred => true, p_type => 'company')),
  ('cop-contact', dk_copilot_customers(p_search => '9001234567', p_include_contact => true));
reset role;
insert into _t (area, test, expected, got) values
  ('Copilot', 'Preferred companies, without NIT unless contact is asked', 'Oficinas Andinas · company · true · null',
    concat_ws(' · ', pg_temp.r('cop') -> 'customers' -> 0 ->> 'name', pg_temp.r('cop') -> 'customers' -> 0 ->> 'type',
      pg_temp.r('cop') -> 'customers' -> 0 ->> 'preferred', coalesce(pg_temp.r('cop') -> 'customers' -> 0 ->> 'taxId', 'null'))),
  ('Copilot', 'By NIT (exact, any format) with the contact', '900.123.456-7 · Marta Ruiz',
    (pg_temp.r('cop-contact') -> 'customers' -> 0 ->> 'taxId') || ' · ' || (pg_temp.r('cop-contact') -> 'customers' -> 0 ->> 'contactName'));

-- 6. WhatsApp intake keeps creating persons (it runs without a person's session).
select pg_temp.act_as('00000000-0000-0000-0000-000000044a01', pg_temp.k('A'));
insert into _r values ('wa', jsonb_build_object('id', dk_find_or_create_customer_by_phone('+573009990449', 'Cliente WhatsApp')));
insert into _t (area, test, expected, got) values
  ('WhatsApp', 'A customer created by WhatsApp is a person, not preferred', 'person · false',
    (select customer_type || ' · ' || preferred::text from dk_customers where id = (pg_temp.r('wa') ->> 'id')::uuid));

select area, test, expected, got, case when expected is not distinct from got then 'PASS' else 'FAIL' end as result, detail from _t order by n;
rollback;
