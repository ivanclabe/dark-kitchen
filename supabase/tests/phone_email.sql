-- ADR 0039: phones in E.164 whatever writes them, WhatsApp identifiers untouched,
-- the WhatsApp lookup finds the customer created in the app (no duplicate), and
-- supplier e-mails clean and valid. Rolled-back transaction.
--
--   python3 supabase/tests/run.py phone_email

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid) on commit drop;
grant all on _t, _ctx to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', json_build_object('x-dk-kitchen-id', p_kitchen)::text, true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.blocked(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return 'blocked'; end;
$$;

insert into _ctx values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into auth.users (id, email, aud, role) values ('00000000-0000-0000-0000-000000039a01', 'caja.telefonos@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values ('10000000-0000-0000-0000-000000039a01', '00000000-0000-0000-0000-000000039a01', 'Caja Teléfonos', true);
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
values (pg_temp.k('A'), '10000000-0000-0000-0000-000000039a01', (select id from dk_roles where is_system and key = 'CASHIER'));

-- 1. The normalizer.
insert into _t (area, test, expected, got) values
  ('Normalize', 'Colombian mobile, as typed', '+573001234567', dk_normalize_phone('300 123 4567')),
  ('Normalize', 'With the country code, as WhatsApp sends it', '+573001234567', dk_normalize_phone('573001234567')),
  ('Normalize', 'Already international, with spaces', '+573001234567', dk_normalize_phone('+57 300 123 4567')),
  ('Normalize', 'Colombian landline (60x)', '+576012345678', dk_normalize_phone('(601) 234 5678')),
  ('Normalize', 'With 00 instead of +', '+573001234567', dk_normalize_phone('00573001234567')),
  ('Normalize', 'Another country, with its code', '+525512345678', dk_normalize_phone('+52 55 1234 5678')),
  ('Normalize', 'A WhatsApp identifier is not a phone: unchanged', 'e9f1aa22b3c4d', dk_normalize_phone('e9f1aa22b3c4d')),
  ('Normalize', 'Too short: unchanged', '12345', dk_normalize_phone('12345')),
  ('Normalize', 'A 7-digit number without area code: unchanged', '2345678', dk_normalize_phone('2345678')),
  ('Normalize', 'Empty is null', 'null', coalesce(dk_normalize_phone('   '), 'null')),
  ('Normalize', 'Same result twice (idempotent)', '+573001234567', dk_normalize_phone(dk_normalize_phone('300-123-4567')));

-- 2. Whatever writes it: the stored phone is E.164.
insert into dk_customers (id, kitchen_id, full_name, phone) values ('30000000-0000-0000-0000-000000039a01', pg_temp.k('A'), 'Cliente App', '311 222 3344');
insert into dk_suppliers (id, kitchen_id, name, phone) values ('50000000-0000-0000-0000-000000039a01', pg_temp.k('A'), 'Proveedor Tel', '(604) 555 1234');
insert into _t (area, test, expected, got) values
  ('Triggers', 'A customer typed in the app', '+573112223344', (select phone from dk_customers where id = '30000000-0000-0000-0000-000000039a01')),
  ('Triggers', 'A supplier landline', '+576045551234', (select phone from dk_suppliers where id = '50000000-0000-0000-0000-000000039a01'));
update dk_customers set phone = '3001110000' where id = '30000000-0000-0000-0000-000000039a01';
insert into _t (area, test, expected, got) values
  ('Triggers', 'Editing it is normalized too', '+573001110000', (select phone from dk_customers where id = '30000000-0000-0000-0000-000000039a01'));

-- 3. WhatsApp: the customer created in the app is found (no duplicate); an identifier keeps working.
select pg_temp.act_as('00000000-0000-0000-0000-000000039a01', pg_temp.k('A'));
set local role authenticated;
insert into _ctx values ('found', dk_find_or_create_customer_by_phone('573001110000', 'Desde WhatsApp'));
insert into _ctx values ('by-id-1', dk_find_or_create_customer_by_phone('wa-abc123def', 'Por identificador'));
insert into _ctx values ('by-id-2', dk_find_or_create_customer_by_phone('wa-abc123def', 'Por identificador'));
insert into _ctx values ('new', dk_find_or_create_customer_by_phone('3205556677', 'Nuevo'));
reset role;
insert into _t (area, test, expected, got) values
  ('WhatsApp', 'The app''s customer is found from 57… (no duplicate)', '30000000-0000-0000-0000-000000039a01', pg_temp.k('found')::text),
  ('WhatsApp', 'Its WhatsApp id is remembered as sent', '573001110000', (select whatsapp_id from dk_customers where id = '30000000-0000-0000-0000-000000039a01')),
  ('WhatsApp', 'An identifier finds the same customer twice', 'true', (pg_temp.k('by-id-1') = pg_temp.k('by-id-2'))::text),
  ('WhatsApp', 'An identifier is stored as it came', 'wa-abc123def · wa-abc123def', (select phone || ' · ' || whatsapp_id from dk_customers where id = pg_temp.k('by-id-1'))),
  ('WhatsApp', 'A new phone: created, phone normalized, whatsapp_id as sent', '+573205556677 · 3205556677',
    (select phone || ' · ' || whatsapp_id from dk_customers where id = pg_temp.k('new'))),
  ('WhatsApp', 'Only one customer with that phone', '1', (select count(*)::text from dk_customers where kitchen_id = pg_temp.k('A') and phone = '+573001110000'));

-- 4. Supplier e-mails.
insert into dk_suppliers (id, kitchen_id, name, email) values
  ('50000000-0000-0000-0000-000000039a02', pg_temp.k('A'), 'Proveedor Correo', '  Ventas@Proveedor.CO '),
  ('50000000-0000-0000-0000-000000039a03', pg_temp.k('A'), 'Proveedor Sin Correo', '   ');
insert into _t (area, test, expected, got) values
  ('Email', 'Trimmed and lowercase', 'ventas@proveedor.co', (select email from dk_suppliers where id = '50000000-0000-0000-0000-000000039a02')),
  ('Email', 'Empty is no e-mail', 'null', (select coalesce(email, 'null') from dk_suppliers where id = '50000000-0000-0000-0000-000000039a03')),
  ('Email', 'An invalid e-mail is rejected', 'blocked',
    pg_temp.blocked(format('update dk_suppliers set email = %L where id = %L', 'juan@', '50000000-0000-0000-0000-000000039a02'))),
  ('Email', 'Every stored phone-shaped value is already E.164', '0',
    (select count(*)::text from dk_customers where phone is distinct from dk_normalize_phone(phone)));

select area, test, expected, got, case when expected is not distinct from got then 'PASS' else 'FAIL' end as result, detail from _t order by n;
rollback;
