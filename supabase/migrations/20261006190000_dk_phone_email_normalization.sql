-- ADR 0039 (D4, D5): phones in international format (E.164) and clean supplier e-mails,
-- whatever writes them (the app, n8n, the platform portal). No business rule changes:
--   * dk_normalize_phone(text): what looks like a phone becomes E.164 (+573001234567).
--     What does not (a WhatsApp identifier, letters, too short or too long) is left
--     exactly as it is.
--   * Triggers on every table with a phone: customers, suppliers, riders, accounts,
--     organizations.
--   * WhatsApp's «find or create the customer by phone» keeps its rule, comparing
--     normalized with normalized, so a customer created in the app as 300 123 4567
--     is found when they write as 573001234567 (no duplicate). whatsapp_id is untouched.
--   * The phone-shaped values already stored are normalized; the others stay.
--   * dk_suppliers.email: trimmed, lowercase, and valid (a check).

create or replace function dk_normalize_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := btrim(coalesce(p_phone, ''));
  d text;
begin
  if v = '' then return null; end if;
  -- Only phone characters (digits, spaces, + ( ) . -): anything else is an identifier, kept as is.
  if v !~ '^\+?[0-9 ().-]+$' then return p_phone; end if;
  d := regexp_replace(v, '\D', '', 'g');
  if length(d) < 7 or length(d) > 15 then return p_phone; end if;
  if left(v, 1) = '+' then return '+' || d; end if;
  if d ~ '^00[1-9]' then return '+' || substr(d, 3); end if;
  -- Colombia: 10 digits, mobile (3…) or landline (60…); with the country code (57 + 10).
  if d ~ '^(3|60)[0-9]{8,9}$' and length(d) = 10 then return '+57' || d; end if;
  if d ~ '^57(3|60)' and length(d) = 12 then return '+' || d; end if;
  -- 11 to 15 digits without "+": they already carry a country code.
  if length(d) between 11 and 15 then return '+' || d; end if;
  -- Anything else (a 7-digit number without area code…): cannot be sure, kept as written.
  return p_phone;
end;
$$;

grant execute on function dk_normalize_phone(text) to authenticated;

create or replace function dk_normalize_phone_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.phone := dk_normalize_phone(new.phone);
  return new;
end;
$$;

drop trigger if exists dk_customers_phone_normalize on dk_customers;
create trigger dk_customers_phone_normalize before insert or update of phone on dk_customers
  for each row execute function dk_normalize_phone_trigger();
drop trigger if exists dk_suppliers_phone_normalize on dk_suppliers;
create trigger dk_suppliers_phone_normalize before insert or update of phone on dk_suppliers
  for each row execute function dk_normalize_phone_trigger();
drop trigger if exists dk_delivery_riders_phone_normalize on dk_delivery_riders;
create trigger dk_delivery_riders_phone_normalize before insert or update of phone on dk_delivery_riders
  for each row execute function dk_normalize_phone_trigger();
drop trigger if exists dk_kitchens_phone_normalize on dk_kitchens;
create trigger dk_kitchens_phone_normalize before insert or update of phone on dk_kitchens
  for each row execute function dk_normalize_phone_trigger();
drop trigger if exists dk_organizations_phone_normalize on dk_organizations;
create trigger dk_organizations_phone_normalize before insert or update of phone on dk_organizations
  for each row execute function dk_normalize_phone_trigger();

-- The same rule as before (find by phone or WhatsApp id; else create), with the phone normalized.
create or replace function dk_find_or_create_customer_by_phone(p_phone text, p_full_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_phone text := dk_normalize_phone(p_phone);
begin
  perform dk_assert_in_active_kitchen('dk_kitchens', null);
  if not dk_can('customers.create') then
    raise exception 'No autorizado para gestionar clientes';
  end if;
  if p_phone is null or length(trim(p_phone)) = 0 then
    raise exception 'El teléfono es obligatorio';
  end if;

  select id into v_customer_id from dk_customers
  where kitchen_id = dk_current_kitchen_id() and (phone = p_phone or phone = v_phone or whatsapp_id = p_phone)
  limit 1;

  if found then
    update dk_customers set whatsapp_id = coalesce(whatsapp_id, p_phone) where id = v_customer_id;
    return v_customer_id;
  end if;

  insert into dk_customers (full_name, phone, whatsapp_id)
  values (coalesce(nullif(trim(p_full_name), ''), p_phone), p_phone, p_phone)
  returning id into v_customer_id;

  return v_customer_id;
end;
$$;
revoke execute on function dk_find_or_create_customer_by_phone(text, text) from public, anon;
grant execute on function dk_find_or_create_customer_by_phone(text, text) to authenticated;

-- The phone-shaped values already stored (the triggers do it; identifiers come back unchanged).
update dk_customers set phone = phone where phone is distinct from dk_normalize_phone(phone);
update dk_suppliers set phone = phone where phone is distinct from dk_normalize_phone(phone);
update dk_delivery_riders set phone = phone where phone is distinct from dk_normalize_phone(phone);
update dk_kitchens set phone = phone where phone is distinct from dk_normalize_phone(phone);
update dk_organizations set phone = phone where phone is distinct from dk_normalize_phone(phone);

-- Supplier e-mails (D5): trimmed, lowercase, valid.
create or replace function dk_normalize_supplier_email()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  return new;
end;
$$;
drop trigger if exists dk_suppliers_email_normalize on dk_suppliers;
create trigger dk_suppliers_email_normalize before insert or update of email on dk_suppliers
  for each row execute function dk_normalize_supplier_email();

alter table dk_suppliers drop constraint if exists dk_suppliers_email_valid;
alter table dk_suppliers add constraint dk_suppliers_email_valid
  check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
