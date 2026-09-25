-- ADR 0008, Fase F: registro público.
--
-- Registro → Organización → primera Cuenta → entorno de la Cuenta.
-- La app llama a dk_create_organization cuando la persona ya confirmó su
-- correo (ADR D-A): con el enlace del correo vuelve con sesión y la app crea
-- todo en UNA transacción. Solo correos confirmados crean organizaciones:
-- los registros basura (bots, correos mal escritos) no dejan nada en la base.
-- Es idempotente: si el enlace se abre dos veces, devuelve la misma Cuenta.

create or replace function dk_slugify(p_text text, p_fallback text default 'negocio')
returns text
language sql
immutable
as $$
  select case when char_length(s) >= 3 then s else p_fallback end
  from (
    select left(trim(both '-' from regexp_replace(
      lower(translate(btrim(coalesce(p_text, '')), 'áéíóúüñàèìòùâêîôûäëïöÁÉÍÓÚÜÑÀÈÌÒÙÂÊÎÔÛÄËÏÖ', 'aeiouunaeiouaeiouaeioAEIOUUNAEIOUAEIOUAEIO')),
      '[^a-z0-9]+', '-', 'g')), 50) as s
  ) x;
$$;

-- Primer slug libre: base, base-2, base-3…
create or replace function dk_unique_slug(p_base text, p_table text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slug text := p_base;
  v_n int := 1;
  v_taken boolean;
begin
  loop
    if p_table = 'kitchens' then
      select exists (select 1 from dk_kitchens where slug = v_slug) into v_taken;
    else
      select exists (select 1 from dk_organizations where slug = v_slug) into v_taken;
    end if;
    exit when not v_taken;
    v_n := v_n + 1;
    v_slug := left(p_base, 55) || '-' || v_n;
  end loop;
  return v_slug;
end;
$$;

create or replace function dk_create_organization(
  p_name text,
  p_sector text,
  p_category text,
  p_address text default null,
  p_city text default null,
  p_country text default 'CO',
  p_phone text default null,
  p_tax_id text default null,
  p_legal_name text default null,
  p_full_name text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth auth.users;
  v_profile uuid;
  v_org uuid;
  v_kitchen uuid;
  v_slug text;
  v_name text := btrim(coalesce(p_name, ''));
  v_full_name text;
  v_timezone text;
  v_currency text;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para crear tu negocio'; end if;
  select * into v_auth from auth.users where id = auth.uid();
  if v_auth.email_confirmed_at is null then
    raise exception 'Confirma tu correo antes de crear tu negocio';
  end if;

  select id into v_profile from dk_users where auth_user_id = auth.uid();

  -- Idempotente: quien ya es dueño de una organización vuelve a su primera Cuenta.
  if v_profile is not null then
    select k.slug into v_slug
    from dk_organizations o join dk_kitchens k on k.organization_id = o.id
    where o.owner_user_id = v_profile
    order by k.created_at limit 1;
    if v_slug is not null then return v_slug; end if;
    if exists (select 1 from dk_organizations where owner_user_id = v_profile) then
      raise exception 'Ya eres dueño de una organización';
    end if;
  end if;

  if char_length(v_name) not between 2 and 80 then raise exception 'El nombre del negocio debe tener entre 2 y 80 caracteres'; end if;

  v_full_name := btrim(coalesce(nullif(btrim(p_full_name), ''), v_auth.raw_user_meta_data ->> 'full_name', split_part(v_auth.email, '@', 1)));
  if char_length(v_full_name) < 2 then v_full_name := split_part(v_auth.email, '@', 1); end if;

  v_timezone := case upper(coalesce(p_country, 'CO'))
    when 'MX' then 'America/Mexico_City' when 'PE' then 'America/Lima' when 'EC' then 'America/Guayaquil'
    when 'CL' then 'America/Santiago' when 'AR' then 'America/Argentina/Buenos_Aires' when 'PA' then 'America/Panama'
    when 'VE' then 'America/Caracas' when 'US' then 'America/New_York' when 'ES' then 'Europe/Madrid'
    else 'America/Bogota' end;
  v_currency := case upper(coalesce(p_country, 'CO'))
    when 'MX' then 'MXN' when 'PE' then 'PEN' when 'CL' then 'CLP' when 'AR' then 'ARS' when 'ES' then 'EUR'
    when 'EC' then 'USD' when 'PA' then 'USD' when 'VE' then 'USD' when 'US' then 'USD'
    else 'COP' end;

  if v_profile is null then
    insert into dk_users (auth_user_id, full_name, active) values (auth.uid(), left(v_full_name, 80), true) returning id into v_profile;
  end if;

  -- La organización (el disparador deja al dueño como Super Admin activo)…
  insert into dk_organizations (slug, name, address, city, country, sector, category, legal_name, tax_id, phone,
                                currency, default_timezone, owner_user_id, created_by)
  values (dk_unique_slug(dk_slugify(v_name), 'organizations'), v_name, nullif(btrim(p_address), ''), nullif(btrim(p_city), ''),
          upper(coalesce(p_country, 'CO')), nullif(p_sector, ''), nullif(p_category, ''), nullif(btrim(p_legal_name), ''),
          nullif(btrim(p_tax_id), ''), nullif(btrim(p_phone), ''), v_currency, v_timezone, v_profile, v_profile)
  returning id into v_org;

  -- …y su primera Cuenta, con los valores por defecto de toda Cuenta nueva.
  v_slug := dk_unique_slug(dk_slugify(v_name), 'kitchens');
  v_kitchen := dk_create_kitchen(v_name, v_slug, v_timezone, v_currency, v_org);
  update dk_kitchens
  set address = nullif(btrim(p_address), ''), phone = nullif(btrim(p_phone), ''),
      legal_name = nullif(btrim(p_legal_name), ''), tax_id = nullif(btrim(p_tax_id), '')
  where id = v_kitchen;
  update dk_users set last_account_id = v_kitchen where id = v_profile;

  return v_slug;
exception when check_violation then
  raise exception 'Revisa el sector y la categoría del negocio';
end;
$$;

comment on function dk_create_organization is 'Registro público (ADR 0008, sección 8): crea perfil, organización (dueño = Super Admin) y primera Cuenta en una transacción. Exige correo confirmado. Idempotente.';

revoke execute on function dk_slugify(text, text), dk_unique_slug(text, text), dk_create_organization(text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function dk_create_organization(text, text, text, text, text, text, text, text, text, text) to authenticated;
