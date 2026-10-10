-- ADR 0049 (rev. 2) — matching for POS tickets and market orders.
--
-- «ARROZ SABROSON X 1000» did not find «Arroz»: codes, sizes and units in the
-- text hide the product. Now each line is also compared:
--   * without codes, numbers and units (dk_invoice_clean_key → «arroz sabroson»);
--   * with the product in plain words the AI gives (genericName → «arroz»).
-- dk_invoice_line_suggestions gets p_generic; dk_invoice_match passes it.

-- The text of a line without codes, numbers, sizes and units.
create or replace function dk_invoice_clean_key(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(btrim(regexp_replace(regexp_replace(regexp_replace(' ' || coalesce(dk_match_key(p), '') || ' ',
    ' [0-9]+[a-z]* ', ' ', 'g'),
    ' (x|kl|kls|kg|kgs|k|g|gr|grs|und|un|u|ud|uds|unid|cj|cja|caja|cajas|p|d|ml|lt|lts|ltr|l|cc|bl|bls|bolsa|paq|pq|pqt|paquete|sel|selec) ', ' ', 'g'),
    ' (x|kl|kls|kg|kgs|k|g|gr|grs|und|un|u|ud|uds|unid|cj|cja|caja|cajas|p|d|ml|lt|lts|ltr|l|cc|bl|bls|bolsa|paq|pq|pqt|paquete|sel|selec) ', ' ', 'g')), '')
$$;
grant execute on function dk_invoice_clean_key(text) to authenticated;

drop function dk_invoice_line_suggestions(uuid, uuid, text, text);

-- Ingredient suggestions for one invoice line (top 3), with why.
create function dk_invoice_line_suggestions(p_kitchen uuid, p_supplier uuid, p_text text, p_code text, p_generic text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with k as (select dk_match_key(p_text) as key, dk_invoice_clean_key(p_text) as clean, dk_match_key(p_generic) as generic,
                    nullif(upper(btrim(coalesce(p_code, ''))), '') as code),
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
    -- By name: against the text without codes, sizes and units, and against the
    -- product in plain words the AI gave («Arroz»).
    select i.id,
           case when dk_match_key(i.name) in (k.clean, k.generic) then 0.95
                else round(greatest(
                  coalesce(extensions.similarity(dk_match_key(i.name), k.clean), 0),
                  0.9 * coalesce(extensions.word_similarity(dk_match_key(i.name), k.clean), 0),
                  coalesce(extensions.similarity(dk_match_key(i.name), k.generic), 0),
                  0.9 * coalesce(extensions.word_similarity(dk_match_key(i.name), k.generic), 0),
                  0.9 * coalesce(extensions.word_similarity(k.generic, dk_match_key(i.name)), 0))::numeric, 2) end,
           case when dk_match_key(i.name) in (k.clean, k.generic) then 'name' else 'similar' end, null
    from dk_ingredients i, k
    where i.kitchen_id = p_kitchen and i.active and coalesce(k.clean, k.generic) is not null
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
revoke all on function dk_invoice_line_suggestions(uuid, uuid, text, text, text) from public, anon, authenticated;

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
           'suggestions', dk_invoice_line_suggestions(v_kitchen, v_best, l.value ->> 'text', l.value ->> 'code', l.value ->> 'genericName')) order by l.ord), '[]')
  into v_lines
  from jsonb_array_elements(coalesce(p_extraction -> 'lines', '[]')) with ordinality as l(value, ord);

  return jsonb_build_object('suppliers', v_suppliers, 'supplierId', v_best, 'supplierStrong', v_strong,
                            'duplicateInvoice', v_dup, 'lines', v_lines);
end;
$$;

