-- ADR 0049 — Importar compra desde factura.
--
-- La IA lee la factura (función dk-invoice-import) y la base propone las
-- coincidencias con reglas explicables. La persona revisa todo y guarda en
-- UNA transacción: proveedor e insumos (sin duplicar), la compra en BORRADOR,
-- los factores de unidad, lo aprendido y el adjunto. El inventario solo se
-- mueve con dk_confirm_purchase, como siempre.
--
--   1. pg_trgm y claves de comparación (nombre, NIT).
--   2. Proveedores: un NIT por cuenta (D9).
--   3. dk_invoice_imports y dk_ingredient_aliases.
--   4. dk_invoice_import_start / _save / _discard.
--   5. dk_invoice_match (coincidencias).
--   6. dk_create_purchase_from_import (guardar, y confirmar si se pide).
--   7. Endurecer compras (D10).
--   8. La función de IA invoice_import.

-- ---------------------------------------------------------------------------
-- 1. Comparar textos
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm with schema extensions;

-- Sin tildes ni signos, en minúsculas y con un espacio entre palabras.
create or replace function dk_match_key(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(btrim(regexp_replace(lower(translate(coalesce(p, ''),
    'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç',
    'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc')), '[^a-z0-9]+', ' ', 'g')), '')
$$;

-- Nombre de una empresa sin su forma jurídica («Frutas El Sol S.A.S.» = «frutas el sol»).
create or replace function dk_supplier_name_key(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(btrim(regexp_replace(regexp_replace(' ' || coalesce(dk_match_key(p), '') || ' ',
    ' (s a s|sas|s a|sa|ltda|limitada|e u|eu|s en c|y cia|cia|bic|s c a|sca) ', ' ', 'g'),
    ' (s a s|sas|s a|sa|ltda|limitada|e u|eu|s en c|y cia|cia|bic|s c a|sca) ', ' ', 'g')), '')
$$;

-- NIT sin puntos ni espacios y sin el dígito de verificación escrito tras un guion
-- («900.123.456-7» → «900123456»).
create or replace function dk_nit_base(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select dk_tax_id_key(regexp_replace(coalesce(p, ''), '-\s*[0-9]\s*$', ''))
$$;

-- El mismo NIT, con o sin dígito de verificación («900123456» = «9001234567» = «900.123.456-7»).
create or replace function dk_nit_matches(a text, b text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when dk_nit_base(a) is null or dk_nit_base(b) is null then false
    when dk_nit_base(a) = dk_nit_base(b) or dk_tax_id_key(a) = dk_tax_id_key(b) then true
    when length(dk_tax_id_key(a)) >= 7 and dk_tax_id_key(a) = dk_nit_base(b) || right(dk_tax_id_key(a), 1)
         and length(dk_tax_id_key(a)) = length(dk_nit_base(b)) + 1 then true
    when length(dk_tax_id_key(b)) >= 7 and dk_tax_id_key(b) = dk_nit_base(a) || right(dk_tax_id_key(b), 1)
         and length(dk_tax_id_key(b)) = length(dk_nit_base(a)) + 1 then true
    else false
  end
$$;

grant execute on function dk_match_key(text), dk_supplier_name_key(text), dk_nit_base(text), dk_nit_matches(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Un NIT por cuenta (D9)
-- ---------------------------------------------------------------------------

do $$
declare v_dups text;
begin
  select string_agg(format('%s (%s)', names, nit), '; ') into v_dups
  from (
    select dk_nit_base(tax_id) as nit, string_agg(name, ', ') as names
    from dk_suppliers where dk_nit_base(tax_id) is not null
    group by kitchen_id, dk_nit_base(tax_id) having count(*) > 1
  ) d;
  if v_dups is not null then
    raise exception 'Hay proveedores con el mismo NIT en una cuenta; resuélvelos antes de aplicar esta migración: %', v_dups;
  end if;
end $$;

create unique index dk_suppliers_kitchen_nit_key on dk_suppliers (kitchen_id, dk_nit_base(tax_id))
  where dk_nit_base(tax_id) is not null;

-- ---------------------------------------------------------------------------
-- 3. Tablas
-- ---------------------------------------------------------------------------

create table dk_invoice_imports (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default dk_current_kitchen_id() references dk_kitchens (id) on delete cascade,
  status text not null default 'LEYENDO' check (status in ('LEYENDO', 'LISTA', 'ERROR', 'USADA', 'DESCARTADA')),
  file_path text not null,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  file_size integer check (file_size between 1 and 10485760),
  file_sha256 text check (file_sha256 ~ '^[0-9a-f]{64}$'),
  -- Lo que leyó la IA, tal cual (auditoría: se compara con lo que guardó la persona).
  extraction jsonb,
  error text,
  ai_run_id uuid references dk_ai_insights (id) on delete set null,
  purchase_id uuid,
  created_by uuid references dk_users (id) default dk_current_profile_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (kitchen_id, purchase_id) references dk_purchases (kitchen_id, id) on delete set null (purchase_id)
);
comment on table dk_invoice_imports is
  'ADR 0049: facturas leídas con IA. Pasan de LEYENDO a LISTA (o ERROR) y a USADA al guardar la compra, o DESCARTADA.';

create index dk_invoice_imports_kitchen_idx on dk_invoice_imports (kitchen_id, status, created_at desc);
create index dk_invoice_imports_sha_idx on dk_invoice_imports (kitchen_id, file_sha256);

create trigger dk_trg_invoice_imports_updated_at before update on dk_invoice_imports
  for each row execute function dk_set_updated_at();

alter table dk_invoice_imports enable row level security;
create policy dk_invoice_imports_select on dk_invoice_imports for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('purchasing.view')));
-- Sin políticas de escritura: solo las funciones de abajo la cambian.
grant select on dk_invoice_imports to authenticated;

create table dk_ingredient_aliases (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default dk_current_kitchen_id() references dk_kitchens (id) on delete cascade,
  supplier_id uuid not null,
  -- dk_match_key del texto de la factura.
  alias_key text not null check (char_length(alias_key) between 1 and 200),
  alias_text text not null,
  ingredient_id uuid not null,
  purchase_unit_id uuid references dk_units (id),
  uses integer not null default 1,
  last_used_at timestamptz not null default now(),
  created_by uuid references dk_users (id) default dk_current_profile_id(),
  created_at timestamptz not null default now(),
  unique (kitchen_id, supplier_id, alias_key),
  foreign key (kitchen_id, supplier_id) references dk_suppliers (kitchen_id, id) on delete cascade,
  foreign key (kitchen_id, ingredient_id) references dk_ingredients (kitchen_id, id) on delete cascade
);
comment on table dk_ingredient_aliases is
  'ADR 0049: cómo escribe un proveedor un insumo en su factura («TOMATE CHONTO X KG» → Tomate). Se aprende al guardar una compra importada.';

alter table dk_ingredient_aliases enable row level security;
create policy dk_ingredient_aliases_select on dk_ingredient_aliases for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('purchasing.view')));
create policy dk_ingredient_aliases_delete on dk_ingredient_aliases for delete to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('purchasing.create')));
grant select, delete on dk_ingredient_aliases to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Ciclo de una importación
-- ---------------------------------------------------------------------------

-- Registra el archivo ya subido. Si el mismo archivo ya se importó (y no se
-- descartó), lo devuelve en «duplicate» y no crea otra (salvo p_force).
create or replace function dk_invoice_import_start(
  p_file_path text, p_file_name text, p_mime_type text, p_file_size integer, p_sha256 text, p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_dup record;
  v_id uuid;
begin
  if v_kitchen is null then raise exception 'No hay una cuenta activa'; end if;
  if not (dk_can('purchasing.create') and dk_can('invoices.upload')) then
    raise exception 'No autorizado para importar facturas';
  end if;
  if p_file_path is null or p_file_path not like 'kitchens/' || v_kitchen::text || '/invoice-imports/%' then
    raise exception 'Ruta de archivo no válida';
  end if;

  if not coalesce(p_force, false) and p_sha256 is not null then
    select i.id, i.status, i.purchase_id, p.invoice_number into v_dup
    from dk_invoice_imports i left join dk_purchases p on p.id = i.purchase_id
    where i.kitchen_id = v_kitchen and i.file_sha256 = lower(p_sha256) and i.status <> 'DESCARTADA'
    order by i.created_at desc limit 1;
    if found then
      return jsonb_build_object('duplicate', jsonb_build_object('importId', v_dup.id, 'status', v_dup.status,
        'purchaseId', v_dup.purchase_id, 'invoiceNumber', v_dup.invoice_number));
    end if;
  end if;

  insert into dk_invoice_imports (kitchen_id, file_path, file_name, mime_type, file_size, file_sha256)
  values (v_kitchen, p_file_path, left(coalesce(nullif(btrim(p_file_name), ''), 'factura'), 200), p_mime_type, p_file_size, lower(p_sha256))
  returning id into v_id;
  return jsonb_build_object('importId', v_id);
end;
$$;

-- Guarda lo leído (LISTA) o el error (ERROR). Lo llama la función dk-invoice-import.
create or replace function dk_invoice_import_save(p_import_id uuid, p_status text, p_extraction jsonb, p_ai_run_id uuid default null, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('LISTA', 'ERROR') then raise exception 'Estado no válido'; end if;
  if not dk_can('purchasing.create') then raise exception 'No autorizado para importar facturas'; end if;
  update dk_invoice_imports
  set status = p_status, extraction = p_extraction, ai_run_id = coalesce(p_ai_run_id, ai_run_id), error = left(p_error, 500)
  where id = p_import_id and kitchen_id = dk_current_kitchen_id() and status in ('LEYENDO', 'ERROR', 'LISTA');
  if not found then raise exception 'Importación no encontrada'; end if;
end;
$$;

create or replace function dk_invoice_import_discard(p_import_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not dk_can('purchasing.create') then raise exception 'No autorizado para importar facturas'; end if;
  update dk_invoice_imports set status = 'DESCARTADA'
  where id = p_import_id and kitchen_id = dk_current_kitchen_id() and status in ('LEYENDO', 'LISTA', 'ERROR');
  if not found then raise exception 'Esta importación ya se usó o no existe'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Coincidencias
-- ---------------------------------------------------------------------------

-- Ingredient suggestions for one invoice line (top 3), with why.
create or replace function dk_invoice_line_suggestions(p_kitchen uuid, p_supplier uuid, p_text text, p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with k as (select dk_match_key(p_text) as key, nullif(upper(btrim(coalesce(p_code, ''))), '') as code),
  cand as (
    -- Lo aprendido con este proveedor, o con otro.
    select a.ingredient_id, case when a.supplier_id = p_supplier then 1.0 else 0.9 end as score,
           'learned'::text as reason, (select code from dk_units where id = a.purchase_unit_id) as learned_unit
    from dk_ingredient_aliases a, k
    where a.kitchen_id = p_kitchen and k.key is not null and a.alias_key = k.key
    union all
    select i.id, 0.95, 'code', null from dk_ingredients i, k
    where i.kitchen_id = p_kitchen and k.code is not null and upper(i.code) = k.code
    union all
    select i.id,
           case when dk_match_key(i.name) = k.key then 0.95
                else round(greatest(extensions.similarity(dk_match_key(i.name), k.key),
                                    0.9 * extensions.word_similarity(dk_match_key(i.name), k.key))::numeric, 2) end,
           case when dk_match_key(i.name) = k.key then 'name' else 'similar' end, null
    from dk_ingredients i, k
    where i.kitchen_id = p_kitchen and i.active and k.key is not null
  ),
  best as (
    select distinct on (ingredient_id) ingredient_id, score, reason, learned_unit
    from cand where score >= 0.4
    order by ingredient_id, score desc
  ),
  top as (select * from best order by score desc limit 3)
  select coalesce(jsonb_agg(jsonb_build_object(
      'ingredientId', i.id, 'name', i.name, 'code', i.code, 'active', i.active,
      'baseUnitCode', u.code, 'baseUnitType', u.unit_type, 'avgCost', i.avg_cost,
      'purchaseUnits', (select coalesce(jsonb_agg(jsonb_build_object('unitCode', pu.code, 'factor', ipu.factor_to_base)), '[]')
                        from dk_ingredient_purchase_units ipu join dk_units pu on pu.id = ipu.unit_id where ipu.ingredient_id = i.id),
      'score', t.score, 'reason', t.reason, 'learnedUnitCode', t.learned_unit) order by t.score desc, i.name), '[]')
  from top t join dk_ingredients i on i.id = t.ingredient_id join dk_units u on u.id = i.base_unit_id
$$;
revoke all on function dk_invoice_line_suggestions(uuid, uuid, text, text) from public, anon, authenticated;

-- Coincidencias de una factura leída: proveedor (por NIT, nombre o parecido),
-- factura ya registrada y, por línea, los insumos sugeridos. p_supplier_id:
-- el proveedor que eligió la persona (cambia lo aprendido).
create or replace function dk_invoice_match(p_extraction jsonb, p_supplier_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_name_key text := dk_supplier_name_key(p_extraction #>> '{supplier,name}');
  v_nit text := nullif(btrim(coalesce(p_extraction #>> '{supplier,taxId}', '')), '');
  v_suppliers jsonb;
  v_best uuid := p_supplier_id;
  v_strong boolean := p_supplier_id is not null;
  v_number text := nullif(upper(btrim(coalesce(p_extraction #>> '{invoice,number}', ''))), '');
  v_dup jsonb;
  v_lines jsonb;
begin
  if v_kitchen is null then raise exception 'No hay una cuenta activa'; end if;
  if not dk_can('purchasing.create') then raise exception 'No autorizado para importar facturas'; end if;
  if p_supplier_id is not null and not exists (select 1 from dk_suppliers where id = p_supplier_id and kitchen_id = v_kitchen) then
    raise exception 'Proveedor no encontrado';
  end if;

  with scored as (
    select s.id, s.name, s.tax_id, s.active,
      case when v_nit is not null and dk_nit_matches(s.tax_id, v_nit) then 1.0
           when v_name_key is not null and dk_supplier_name_key(s.name) = v_name_key then 0.95
           when v_name_key is not null then round(greatest(extensions.similarity(dk_supplier_name_key(s.name), v_name_key),
                                                           0.9 * extensions.word_similarity(dk_supplier_name_key(s.name), v_name_key))::numeric, 2)
           else 0 end as score,
      case when v_nit is not null and dk_nit_matches(s.tax_id, v_nit) then 'tax_id'
           when v_name_key is not null and dk_supplier_name_key(s.name) = v_name_key then 'name'
           else 'similar' end as reason
    from dk_suppliers s where s.kitchen_id = v_kitchen
  ),
  top as (select * from scored where score >= 0.4 order by score desc, active desc, name limit 3)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'taxId', tax_id, 'active', active, 'score', score, 'reason', reason,
           -- Mismo nombre pero otro NIT: se avisa.
           'taxIdDiffers', v_nit is not null and tax_id is not null and not dk_nit_matches(tax_id, v_nit))
         order by score desc, active desc, name), '[]')
  into v_suppliers from top;

  if v_best is null and jsonb_array_length(v_suppliers) > 0 and (v_suppliers -> 0 ->> 'score')::numeric >= 0.95
     and not coalesce((v_suppliers -> 0 ->> 'taxIdDiffers')::boolean, false) then
    v_best := (v_suppliers -> 0 ->> 'id')::uuid;
    v_strong := true;
  end if;

  if v_best is not null and v_number is not null then
    select jsonb_build_object('purchaseId', p.id, 'status', p.status, 'invoiceNumber', p.invoice_number, 'invoiceDate', p.invoice_date)
    into v_dup from dk_purchases p
    where p.kitchen_id = v_kitchen and p.supplier_id = v_best and upper(btrim(p.invoice_number)) = v_number
    limit 1;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('index', l.ord - 1,
           'suggestions', dk_invoice_line_suggestions(v_kitchen, v_best, l.value ->> 'text', l.value ->> 'code')) order by l.ord), '[]')
  into v_lines
  from jsonb_array_elements(coalesce(p_extraction -> 'lines', '[]')) with ordinality as l(value, ord);

  return jsonb_build_object('suppliers', v_suppliers, 'supplierId', v_best, 'supplierStrong', v_strong,
                            'duplicateInvoice', v_dup, 'lines', v_lines);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Guardar la compra (todo o nada)
-- ---------------------------------------------------------------------------

-- p_payload:
--   supplier: { id } | { create: { name, taxId, phone, email, address, contactName } }
--   invoice:  { number, date, tax, notes }
--   lines:    [{ text, ingredient: { id } | { create: { code, name, baseUnitCode } },
--                quantity, unitCode, unitCost, factor, remember }]
-- Devuelve { purchaseId, supplierId, supplierCreated, supplierReused, ingredientsCreated, ingredientsReused, confirmed }.
create or replace function dk_create_purchase_from_import(p_import_id uuid, p_payload jsonb, p_confirm boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_import dk_invoice_imports;
  v_sup jsonb := p_payload -> 'supplier';
  v_supplier uuid;
  v_supplier_created boolean := false;
  v_supplier_reused boolean := false;
  v_number text := btrim(coalesce(p_payload #>> '{invoice,number}', ''));
  v_date date;
  v_tax numeric := coalesce(nullif(p_payload #>> '{invoice,tax}', '')::numeric, 0);
  v_dup uuid;
  v_purchase uuid;
  v_line jsonb;
  v_n integer := 0;
  v_ing jsonb;
  v_ingredient uuid;
  v_ing_row record;
  v_unit record;
  v_factor numeric;
  v_has_factor boolean;
  v_qty numeric;
  v_cost numeric;
  v_created integer := 0;
  v_reused integer := 0;
  v_code text;
  v_name text;
  v_email text;
  v_i integer;
begin
  if v_kitchen is null then raise exception 'No hay una cuenta activa'; end if;
  if not dk_can('purchasing.create') then raise exception 'No autorizado para crear compras'; end if;
  if coalesce(p_confirm, false) and not dk_can('purchasing.confirm') then raise exception 'No autorizado para confirmar compras'; end if;

  select * into v_import from dk_invoice_imports where id = p_import_id and kitchen_id = v_kitchen for update;
  if not found then raise exception 'Importación no encontrada'; end if;
  if v_import.status <> 'LISTA' then
    raise exception 'Esta factura ya no está por revisar (estado %)', v_import.status;
  end if;

  if v_number = '' then raise exception 'Falta el número de la factura'; end if;
  begin
    v_date := (p_payload #>> '{invoice,date}')::date;
  exception when others then v_date := null;
  end;
  if v_date is null then raise exception 'Falta la fecha de la factura'; end if;
  if v_tax < 0 then raise exception 'El IVA no puede ser negativo'; end if;
  if jsonb_array_length(coalesce(p_payload -> 'lines', '[]')) = 0 then
    raise exception 'La compra necesita al menos una línea con insumo';
  end if;

  -- Proveedor: el elegido o uno nuevo, sin duplicar (NIT y luego nombre).
  if v_sup ? 'id' then
    select id into v_supplier from dk_suppliers where id = (v_sup ->> 'id')::uuid and kitchen_id = v_kitchen;
    if v_supplier is null then raise exception 'Proveedor no encontrado'; end if;
  elsif v_sup ? 'create' then
    v_name := btrim(coalesce(v_sup #>> '{create,name}', ''));
    if v_name = '' then raise exception 'Falta el nombre del proveedor'; end if;
    select id into v_supplier from dk_suppliers
    where kitchen_id = v_kitchen and dk_nit_matches(tax_id, v_sup #>> '{create,taxId}')
    order by active desc, created_at limit 1;
    if v_supplier is null then
      select id into v_supplier from dk_suppliers
      where kitchen_id = v_kitchen and dk_supplier_name_key(name) = dk_supplier_name_key(v_name)
        and (tax_id is null or dk_nit_base(v_sup #>> '{create,taxId}') is null)
      order by active desc, created_at limit 1;
    end if;
    if v_supplier is not null then
      v_supplier_reused := true;
    else
      if not dk_can('suppliers.edit') then raise exception 'No autorizado para crear proveedores: elige uno existente'; end if;
      v_email := lower(nullif(btrim(coalesce(v_sup #>> '{create,email}', '')), ''));
      if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_email := null; end if;
      insert into dk_suppliers (kitchen_id, name, tax_id, phone, email, address, contact_name)
      values (v_kitchen, v_name, nullif(btrim(coalesce(v_sup #>> '{create,taxId}', '')), ''),
              nullif(btrim(coalesce(v_sup #>> '{create,phone}', '')), ''), v_email,
              nullif(btrim(coalesce(v_sup #>> '{create,address}', '')), ''),
              nullif(btrim(coalesce(v_sup #>> '{create,contactName}', '')), ''))
      returning id into v_supplier;
      v_supplier_created := true;
    end if;
  else
    raise exception 'Falta el proveedor';
  end if;

  -- La misma factura no se registra dos veces.
  select id into v_dup from dk_purchases
  where kitchen_id = v_kitchen and supplier_id = v_supplier and upper(btrim(invoice_number)) = upper(v_number) limit 1;
  if v_dup is not null then
    raise exception 'La factura % de este proveedor ya está registrada', v_number using hint = 'duplicate_invoice', detail = v_dup::text;
  end if;

  insert into dk_purchases (kitchen_id, supplier_id, invoice_number, invoice_date, tax, notes, created_by)
  values (v_kitchen, v_supplier, v_number, v_date, v_tax, nullif(btrim(coalesce(p_payload #>> '{invoice,notes}', '')), ''), dk_current_profile_id())
  returning id into v_purchase;

  for v_line in select value from jsonb_array_elements(p_payload -> 'lines') loop
    v_n := v_n + 1;
    v_ing := v_line -> 'ingredient';
    v_ingredient := null;

    if v_ing ? 'id' then
      select id into v_ingredient from dk_ingredients where id = (v_ing ->> 'id')::uuid and kitchen_id = v_kitchen;
      if v_ingredient is null then raise exception 'Línea %: insumo no encontrado', v_n; end if;
    elsif v_ing ? 'create' then
      v_name := btrim(coalesce(v_ing #>> '{create,name}', ''));
      if v_name = '' then raise exception 'Línea %: falta el nombre del insumo nuevo', v_n; end if;
      v_code := nullif(upper(btrim(coalesce(v_ing #>> '{create,code}', ''))), '');
      -- No duplicar: el mismo código o el mismo nombre ya existen → se usa ese.
      select id into v_ingredient from dk_ingredients
      where kitchen_id = v_kitchen and ((v_code is not null and upper(code) = v_code) or dk_match_key(name) = dk_match_key(v_name))
      order by (v_code is not null and upper(code) = v_code) desc, active desc limit 1;
      if v_ingredient is not null then
        v_reused := v_reused + 1;
      else
        if not dk_can('inventory.create') then raise exception 'Línea %: no autorizado para crear insumos; elige uno existente', v_n; end if;
        select * into v_unit from dk_units where code = v_ing #>> '{create,baseUnitCode}';
        if not found then raise exception 'Línea %: unidad base no válida', v_n; end if;
        if v_code is null then
          v_code := left(upper(regexp_replace(coalesce(dk_match_key(v_name), 'insumo'), ' ', '-', 'g')), 24);
          v_i := 1;
          while exists (select 1 from dk_ingredients where kitchen_id = v_kitchen and upper(code) = v_code) loop
            v_i := v_i + 1;
            v_code := left(upper(regexp_replace(coalesce(dk_match_key(v_name), 'insumo'), ' ', '-', 'g')), 24) || '-' || v_i;
          end loop;
        end if;
        insert into dk_ingredients (kitchen_id, code, name, base_unit_id, primary_supplier_id)
        values (v_kitchen, v_code, v_name, v_unit.id, v_supplier)
        returning id into v_ingredient;
        v_created := v_created + 1;
      end if;
    else
      raise exception 'Línea %: falta el insumo', v_n;
    end if;

    select i.id, i.base_unit_id, bu.unit_type as base_type, bu.code as base_code into v_ing_row
    from dk_ingredients i join dk_units bu on bu.id = i.base_unit_id where i.id = v_ingredient;
    select * into v_unit from dk_units where code = v_line ->> 'unitCode';
    if not found then raise exception 'Línea %: unidad no válida', v_n; end if;

    v_qty := nullif(v_line ->> 'quantity', '')::numeric;
    v_cost := nullif(v_line ->> 'unitCost', '')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Línea %: la cantidad debe ser mayor que 0', v_n; end if;
    if v_cost is null or v_cost < 0 then raise exception 'Línea %: el costo no puede ser negativo', v_n; end if;

    -- Unidad de compra distinta a la base: factor propio del insumo (se guarda si viene).
    if v_unit.id <> v_ing_row.base_unit_id then
      v_factor := nullif(v_line ->> 'factor', '')::numeric;
      if v_factor is not null then
        if v_factor <= 0 then raise exception 'Línea %: el factor debe ser mayor que 0', v_n; end if;
        insert into dk_ingredient_purchase_units (ingredient_id, unit_id, factor_to_base)
        values (v_ingredient, v_unit.id, v_factor)
        on conflict (ingredient_id, unit_id) do update set factor_to_base = excluded.factor_to_base;
      end if;
      v_has_factor := exists (select 1 from dk_ingredient_purchase_units where ingredient_id = v_ingredient and unit_id = v_unit.id);
      if not v_has_factor and (v_unit.unit_type <> v_ing_row.base_type or v_unit.code in ('caja', 'bolsa', 'paquete')) then
        raise exception 'Línea %: indica cuántos % trae 1 %', v_n, v_ing_row.base_code, v_unit.code;
      end if;
    end if;

    insert into dk_purchase_items (kitchen_id, purchase_id, ingredient_id, quantity, purchase_unit_id, unit_cost)
    values (v_kitchen, v_purchase, v_ingredient, v_qty, v_unit.id, v_cost);

    -- Aprender cómo escribe este proveedor el insumo.
    if coalesce((v_line ->> 'remember')::boolean, true) and dk_match_key(v_line ->> 'text') is not null then
      insert into dk_ingredient_aliases (kitchen_id, supplier_id, alias_key, alias_text, ingredient_id, purchase_unit_id)
      values (v_kitchen, v_supplier, left(dk_match_key(v_line ->> 'text'), 200), left(v_line ->> 'text', 300), v_ingredient, v_unit.id)
      on conflict (kitchen_id, supplier_id, alias_key) do update
        set ingredient_id = excluded.ingredient_id, purchase_unit_id = excluded.purchase_unit_id, alias_text = excluded.alias_text,
            uses = dk_ingredient_aliases.uses + 1, last_used_at = now();
    end if;
  end loop;

  -- La factura queda como adjunto de la compra.
  insert into dk_attachments (kitchen_id, entity_type, entity_id, file_path, file_name, mime_type, uploaded_by)
  values (v_kitchen, 'purchase', v_purchase, v_import.file_path, v_import.file_name, v_import.mime_type, dk_current_profile_id());

  update dk_invoice_imports set status = 'USADA', purchase_id = v_purchase where id = p_import_id;

  if coalesce(p_confirm, false) then
    perform dk_confirm_purchase(v_purchase);
  end if;

  return jsonb_build_object('purchaseId', v_purchase, 'supplierId', v_supplier, 'supplierCreated', v_supplier_created,
    'supplierReused', v_supplier_reused, 'ingredientsCreated', v_created, 'ingredientsReused', v_reused,
    'confirmed', coalesce(p_confirm, false));
exception when unique_violation then
  raise exception 'La factura % de este proveedor ya está registrada', v_number using hint = 'duplicate_invoice';
end;
$$;

revoke all on function dk_invoice_import_start(text, text, text, integer, text, boolean), dk_invoice_import_save(uuid, text, jsonb, uuid, text),
  dk_invoice_import_discard(uuid), dk_invoice_match(jsonb, uuid), dk_create_purchase_from_import(uuid, jsonb, boolean) from public, anon;
grant execute on function dk_invoice_import_start(text, text, text, integer, text, boolean), dk_invoice_import_save(uuid, text, jsonb, uuid, text),
  dk_invoice_import_discard(uuid), dk_invoice_match(jsonb, uuid), dk_create_purchase_from_import(uuid, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Endurecer compras (D10)
-- ---------------------------------------------------------------------------

alter table dk_purchases alter column created_by set default dk_current_profile_id();
alter table dk_attachments alter column uploaded_by set default dk_current_profile_id();

-- Por la API (rol authenticated/anon) una compra nace en BORRADOR y su estado
-- no cambia: solo dk_confirm_purchase (que corre como dueño) la confirma y
-- mueve el inventario. Una compra confirmada no cambia sus cifras ni su factura.
create or replace function dk_purchase_guard_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'BORRADOR' then
      raise exception 'Una compra nueva empieza en borrador; se confirma con «Confirmar compra»';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    raise exception 'El estado de una compra solo cambia al confirmarla con «Confirmar compra»';
  end if;
  if old.status = 'CONFIRMADA' and (new.supplier_id, new.invoice_number, new.invoice_date, new.subtotal, new.tax, new.total, new.kitchen_id)
       is distinct from (old.supplier_id, old.invoice_number, old.invoice_date, old.subtotal, old.tax, old.total, old.kitchen_id) then
    raise exception 'Una compra confirmada no se puede modificar';
  end if;
  return new;
end;
$$;

create trigger dk_trg_purchases_guard_status before insert or update on dk_purchases
  for each row execute function dk_purchase_guard_status();

create or replace function dk_confirm_purchase(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status dk_purchase_status;
  v_item record;
  v_conversion numeric;
  v_qty_base numeric;
  v_cost_per_base numeric;
  v_current_stock numeric;
  v_current_avg_cost numeric;
  v_new_avg_cost numeric;
  v_subtotal numeric := 0;
begin
  perform dk_assert_in_active_kitchen('dk_purchases', p_purchase_id);
  if not dk_can('purchasing.confirm') then
    raise exception 'No autorizado para confirmar compras';
  end if;

  select status into v_status from dk_purchases where id = p_purchase_id for update;
  if v_status is null then
    raise exception 'Compra % no existe', p_purchase_id;
  end if;
  if v_status <> 'BORRADOR' then
    raise exception 'Solo se pueden confirmar compras en estado BORRADOR (actual: %)', v_status;
  end if;
  -- ADR 0049 (D10): una compra sin líneas no se confirma.
  if not exists (select 1 from dk_purchase_items where purchase_id = p_purchase_id) then
    raise exception 'La compra no tiene líneas: agrega al menos un insumo antes de confirmarla';
  end if;

  for v_item in
    select pi.*, i.base_unit_id
    from dk_purchase_items pi
    join dk_ingredients i on i.id = pi.ingredient_id
    where pi.purchase_id = p_purchase_id
    order by pi.ingredient_id, pi.id
  loop
    if v_item.purchase_unit_id = v_item.base_unit_id then
      v_conversion := 1;
    else
      select factor_to_base into v_conversion
      from dk_ingredient_purchase_units
      where ingredient_id = v_item.ingredient_id and unit_id = v_item.purchase_unit_id;

      if v_conversion is null then
        select pu.factor_to_base / bu.factor_to_base into v_conversion
        from dk_units pu, dk_units bu
        where pu.id = v_item.purchase_unit_id
          and bu.id = v_item.base_unit_id
          and pu.unit_type = bu.unit_type;
      end if;

      if v_conversion is null then
        raise exception 'No hay conversion definida entre la unidad de compra y la unidad base del insumo % (linea %)', v_item.ingredient_id, v_item.id;
      end if;
    end if;

    v_qty_base := v_item.quantity * v_conversion;
    v_cost_per_base := v_item.unit_cost / v_conversion;

    -- ADR 0049 (D10): costo promedio vigente, leído y bloqueado línea por línea
    -- (si el insumo se repite, la segunda línea parte del promedio de la primera).
    select avg_cost into v_current_avg_cost from dk_ingredients where id = v_item.ingredient_id for update;

    insert into dk_inventory_movements (
      ingredient_id, movement_type, quantity_base_unit, unit_cost,
      reference_type, reference_id, created_by
    ) values (
      v_item.ingredient_id, 'COMPRA', v_qty_base, v_cost_per_base,
      'purchase_item', v_item.id, dk_current_profile_id()
    );

    select coalesce(stock_on_hand, 0) into v_current_stock
    from dk_ingredient_stock where ingredient_id = v_item.ingredient_id;
    v_current_stock := coalesce(v_current_stock, 0) - v_qty_base; -- stock antes de este movimiento (el trigger ya lo aplico)

    if v_current_stock <= 0 then
      v_new_avg_cost := v_cost_per_base;
    else
      v_new_avg_cost := (v_current_stock * coalesce(v_current_avg_cost, 0) + v_qty_base * v_cost_per_base)
                         / (v_current_stock + v_qty_base);
    end if;

    update dk_ingredients set avg_cost = v_new_avg_cost where id = v_item.ingredient_id;

    v_subtotal := v_subtotal + v_item.line_total;
  end loop;

  update dk_purchases
  set status = 'CONFIRMADA', subtotal = v_subtotal, total = v_subtotal + tax
  where id = p_purchase_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. La función de IA
-- ---------------------------------------------------------------------------

insert into dk_features (key, category, label, description, uses_model, model_key, use_permission, manage_permission,
                         default_available, default_enabled, active, min_interval_seconds, settings_schema, default_settings, depends_on, sort_order)
values ('invoice_import', 'ai', 'Importar compras desde facturas',
        'Lee la foto o el PDF de una factura de compra y propone el proveedor, los insumos, las cantidades y los precios para que los revises.',
        true, 'claude-sonnet-5-5', 'purchasing.create', 'ai.manage', true, true, true, 5, '{}'::jsonb, '{}'::jsonb, '{}', 15)
on conflict (key) do nothing;

insert into dk_plan_features (plan_key, feature_key)
select distinct pf.plan_key, 'invoice_import' from dk_plan_features pf where pf.feature_key = 'kitchen_insights'
on conflict do nothing;
