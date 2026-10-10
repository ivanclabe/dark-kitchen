-- ADR 0049: importar compra desde factura — coincidencias, guardar todo o nada,
-- sin duplicar proveedores ni insumos, y la confirmación endurecida.
-- Transacción revertida.
--
--   python3 supabase/tests/run.py invoice_import

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, v jsonb) on commit drop;
grant all on _t, _ctx to authenticated;
grant usage on sequence _t_n_seq to authenticated;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', (case when p_kitchen is null then '{}'::jsonb else jsonb_build_object('x-dk-kitchen-id', p_kitchen) end)::text, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.v(p_key text) returns jsonb language sql as $$ select v from _ctx where key = p_key $$;
create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return sqlerrm; end;
$$;
create or replace function pg_temp.hint(p_sql text) returns text language plpgsql as $$
declare v_hint text;
begin execute p_sql; return 'ALLOWED';
exception when others then get stacked diagnostics v_hint = pg_exception_hint; return coalesce(nullif(v_hint, ''), 'sin hint'); end;
$$;
create or replace function pg_temp.blocked(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return 'blocked'; end;
$$;
create or replace function pg_temp.unit(p_code text) returns uuid language sql as $$ select id from dk_units where code = p_code $$;

-- Owner with two accounts (A and B), and a kitchen user in A.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000049a01', 'duena.facturas@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000049a02', 'cocina.facturas@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-000000049a01', '00000000-0000-0000-0000-000000049a01', 'Dueña', true),
  ('10000000-0000-0000-0000-000000049a02', '00000000-0000-0000-0000-000000049a02', 'Cocina', true);
insert into dk_organizations (slug, name, owner_user_id, sector, category)
  values ('grupo-facturas', 'Grupo Facturas', '10000000-0000-0000-0000-000000049a01', 'fast_food', 'burgers');
insert into _ctx (key, id) values ('org', (select id from dk_organizations where slug = 'grupo-facturas'));
insert into _ctx (key, id) values ('owner', '00000000-0000-0000-0000-000000049a01'), ('cook', '00000000-0000-0000-0000-000000049a02');

select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin
  insert into _ctx (key, id) values ('A', dk_create_kitchen('Centro', 'centro-facturas', 'America/Bogota', null, pg_temp.k('org')));
end $$;
reset role;
select pg_temp.as_owner();
update dk_subscriptions set plan_key = 'business' where organization_id = pg_temp.k('org');
select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin
  insert into _ctx (key, id) values ('B', dk_create_kitchen('Norte', 'norte-facturas', 'America/Bogota', null, pg_temp.k('org')));
end $$;
reset role;
select pg_temp.as_owner();

insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
  select pg_temp.k('A'), '10000000-0000-0000-0000-000000049a02', id from dk_roles where is_system and key = 'KITCHEN';

-- Catalog of A (and a supplier with the same NIT in B).
insert into dk_suppliers (id, kitchen_id, name, tax_id) values
  ('60000000-0000-0000-0000-000000049a01', pg_temp.k('A'), 'Frutas El Sol S.A.S.', '900.123.456-7'),
  ('60000000-0000-0000-0000-000000049a02', pg_temp.k('A'), 'Carnes La 70', null),
  ('60000000-0000-0000-0000-000000049b01', pg_temp.k('B'), 'Frutas El Sol S.A.S.', '900123456');
insert into dk_ingredients (id, kitchen_id, code, name, base_unit_id) values
  ('61000000-0000-0000-0000-000000049a01', pg_temp.k('A'), 'TOM', 'Tomate', pg_temp.unit('g')),
  ('61000000-0000-0000-0000-000000049a02', pg_temp.k('A'), 'CARNE', 'Carne de res', pg_temp.unit('g')),
  ('61000000-0000-0000-0000-000000049a03', pg_temp.k('A'), 'HUEVO', 'Huevo', pg_temp.unit('unidad')),
  ('61000000-0000-0000-0000-000000049b01', pg_temp.k('B'), 'TOM', 'Tomate', pg_temp.unit('g'));

-- What the AI read (same shape as dk-invoice-import).
insert into _ctx (key, v) values ('ex', '{
  "supplier": {"name": "FRUTAS EL SOL SAS", "taxId": "9001234567"},
  "invoice": {"number": "FE-1001", "date": "2026-10-09", "subtotal": 98000, "tax": 0, "total": 98000},
  "lines": [
    {"text": "TOMATE CHONTO X KG", "quantity": 2, "unit": "kg", "unitPrice": 4000, "lineTotal": 8000},
    {"text": "Carne molida res", "code": "CARNE", "quantity": 3000, "unit": "g", "unitPrice": 25, "lineTotal": 75000},
    {"text": "Huevos AA x 30", "quantity": 30, "unit": "und", "unitPrice": 500, "lineTotal": 15000}
  ]}'::jsonb);

-- ---------------------------------------------------------------------------
-- 1. Comparar textos
-- ---------------------------------------------------------------------------
insert into _t (area, test, expected, got) values
  ('Claves', 'Nombre sin forma jurídica', 'frutas el sol', dk_supplier_name_key('Frutas El Sol S.A.S.')),
  ('Claves', 'Nombre con «LTDA» y tildes', 'lacteos la pradera', dk_supplier_name_key('Lácteos La Pradera Ltda.')),
  ('Claves', 'NIT base sin dígito de verificación', '900123456', dk_nit_base('900.123.456-7')),
  ('Claves', 'NIT: con guion = sin guion con dígito', 'true', dk_nit_matches('900.123.456-7', '9001234567')::text),
  ('Claves', 'NIT: con dígito = sin dígito', 'true', dk_nit_matches('9001234567', '900123456')::text),
  ('Claves', 'NIT: otro número', 'false', dk_nit_matches('900123456', '800123456')::text),
  ('Claves', 'NIT vacío no coincide con nada', 'false', dk_nit_matches(null, '')::text);

-- ---------------------------------------------------------------------------
-- 2. Coincidencias (como la dueña, en A)
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v jsonb;
begin
  v := dk_invoice_match(pg_temp.v('ex'));
  insert into _t (area, test, expected, got) values ('Coincidencias', 'Proveedor por NIT con dígito', 'Frutas El Sol S.A.S. · tax_id · fuerte',
    (v -> 'suppliers' -> 0 ->> 'name') || ' · ' || (v -> 'suppliers' -> 0 ->> 'reason') || ' · ' || case when (v ->> 'supplierStrong')::boolean then 'fuerte' else 'débil' end);
  insert into _t (area, test, expected, got) values ('Coincidencias', 'No sugiere el proveedor de la otra cuenta', '0',
    (select count(*)::text from jsonb_array_elements(v -> 'suppliers') s where s ->> 'id' = '60000000-0000-0000-0000-000000049b01'));
  insert into _t (area, test, expected, got) values ('Coincidencias', 'Línea «TOMATE CHONTO X KG» → Tomate', 'Tomate · similar',
    (v -> 'lines' -> 0 -> 'suggestions' -> 0 ->> 'name') || ' · ' || (v -> 'lines' -> 0 -> 'suggestions' -> 0 ->> 'reason'));
  insert into _t (area, test, expected, got) values ('Coincidencias', 'Línea con código CARNE → por código', 'Carne de res · code',
    (v -> 'lines' -> 1 -> 'suggestions' -> 0 ->> 'name') || ' · ' || (v -> 'lines' -> 1 -> 'suggestions' -> 0 ->> 'reason'));
  insert into _t (area, test, expected, got) values ('Coincidencias', 'Línea «Huevos AA x 30» → Huevo (base unidad)', 'Huevo · unidad',
    (v -> 'lines' -> 2 -> 'suggestions' -> 0 ->> 'name') || ' · ' || (v -> 'lines' -> 2 -> 'suggestions' -> 0 ->> 'baseUnitCode'));
  insert into _t (area, test, expected, got) values ('Coincidencias', 'No sugiere insumos de la otra cuenta', '0',
    (select count(*)::text from jsonb_array_elements(v -> 'lines') l, jsonb_array_elements(l -> 'suggestions') s
     where s ->> 'ingredientId' = '61000000-0000-0000-0000-000000049b01'));

  v := dk_invoice_match(jsonb_set(pg_temp.v('ex'), '{supplier}', '{"name": "Frutas El Sol SAS"}'));
  insert into _t (area, test, expected, got) values ('Coincidencias', 'Sin NIT: por nombre sin «SAS»', 'name · fuerte',
    (v -> 'suppliers' -> 0 ->> 'reason') || ' · ' || case when (v ->> 'supplierStrong')::boolean then 'fuerte' else 'débil' end);
  v := dk_invoice_match(jsonb_set(pg_temp.v('ex'), '{supplier}', '{"name": "Frutas del Sol"}'));
  insert into _t (area, test, expected, got) values ('Coincidencias', 'Nombre parecido: se sugiere pero no se elige solo', 'similar · sin elegir',
    (v -> 'suppliers' -> 0 ->> 'reason') || ' · ' || coalesce(v ->> 'supplierId', 'sin elegir'));
  v := dk_invoice_match(jsonb_set(pg_temp.v('ex'), '{supplier}', '{"name": "Frutas El Sol SAS", "taxId": "800999888"}'));
  insert into _t (area, test, expected, got) values ('Coincidencias', 'Mismo nombre y otro NIT: avisa y no lo elige', 'true · sin elegir',
    (v -> 'suppliers' -> 0 ->> 'taxIdDiffers') || ' · ' || coalesce(v ->> 'supplierId', 'sin elegir'));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Importaciones
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v jsonb; v_path text := 'kitchens/' || pg_temp.k('A') || '/invoice-imports/';
begin
  insert into _t (area, test, expected, got) values ('Importación', 'Ruta fuera de la cuenta: rechazada', 'Ruta de archivo no válida',
    pg_temp.err(format($q$select dk_invoice_import_start('kitchens/%s/invoice-imports/x.jpg', 'x.jpg', 'image/jpeg', 100, null)$q$, pg_temp.k('B'))));
  v := dk_invoice_import_start(v_path || 'f1.jpg', 'factura 1.jpg', 'image/jpeg', 2000, repeat('a', 64));
  insert into _ctx (key, id) values ('imp1', (v ->> 'importId')::uuid);
  v := dk_invoice_import_start(v_path || 'f1b.jpg', 'factura 1.jpg', 'image/jpeg', 2000, repeat('a', 64));
  insert into _t (area, test, expected, got) values ('Importación', 'El mismo archivo otra vez: avisa', 'LEYENDO',
    v #>> '{duplicate,status}');
  perform dk_invoice_import_save(pg_temp.k('imp1'), 'LISTA', pg_temp.v('ex'));
  -- Two more imports for later.
  insert into _ctx (key, id) values ('imp2', (dk_invoice_import_start(v_path || 'f2.pdf', 'f2.pdf', 'application/pdf', 3000, repeat('b', 64)) ->> 'importId')::uuid);
  perform dk_invoice_import_save(pg_temp.k('imp2'), 'LISTA', pg_temp.v('ex'));
  insert into _ctx (key, id) values ('imp3', (dk_invoice_import_start(v_path || 'f3.png', 'f3.png', 'image/png', 3000, repeat('c', 64)) ->> 'importId')::uuid);
  perform dk_invoice_import_save(pg_temp.k('imp3'), 'LISTA', pg_temp.v('ex'));
  insert into _ctx (key, id) values ('imp4', (dk_invoice_import_start(v_path || 'f4.png', 'f4.png', 'image/png', 3000, repeat('d', 64)) ->> 'importId')::uuid);
  perform dk_invoice_import_save(pg_temp.k('imp4'), 'LISTA', pg_temp.v('ex'));
  -- No write policy: the update touches no row.
  perform pg_temp.blocked(format($q$update dk_invoice_imports set status = 'USADA' where id = '%s'$q$, pg_temp.k('imp1')));
  insert into _t (area, test, expected, got) values ('Importación', 'Por la API no se cambia una importación', 'LISTA',
    (select status from dk_invoice_imports where id = pg_temp.k('imp1')));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Guardar: todo o nada
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  -- A box of tomatoes without saying how much it brings: the whole purchase is refused.
  insert into _t (area, test, expected, got) values ('Todo o nada', 'Caja sin factor: se rechaza', 'Línea 2: indica cuántos g trae 1 caja',
    pg_temp.err(format($q$select dk_create_purchase_from_import('%s', '{
      "supplier": {"id": "60000000-0000-0000-0000-000000049a02"},
      "invoice": {"number": "C-1", "date": "2026-10-09"},
      "lines": [
        {"text": "Carne", "ingredient": {"id": "61000000-0000-0000-0000-000000049a02"}, "quantity": 1000, "unitCode": "g", "unitCost": 20},
        {"text": "Tomate caja", "ingredient": {"id": "61000000-0000-0000-0000-000000049a01"}, "quantity": 1, "unitCode": "caja", "unitCost": 40000}
      ]}')$q$, pg_temp.k('imp2'))));
end $$;
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Todo o nada', '… y no queda compra a medias', '0 · LISTA',
  (select count(*)::text from dk_purchases where kitchen_id = pg_temp.k('A') and invoice_number = 'C-1') || ' · ' ||
  (select status from dk_invoice_imports where id = pg_temp.k('imp2')));

-- The real save: supplier written with another NIT format (reused), «tomate» to create (reused),
-- a new onion, eggs by the unit.
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v jsonb;
begin
  v := dk_create_purchase_from_import(pg_temp.k('imp1'), '{
    "supplier": {"create": {"name": "FRUTAS EL SOL SAS", "taxId": "9001234567", "email": "no es correo"}},
    "invoice": {"number": "FE-1001", "date": "2026-10-09", "tax": 0},
    "lines": [
      {"text": "TOMATE CHONTO X KG", "ingredient": {"create": {"name": "tomate", "baseUnitCode": "g"}}, "quantity": 2, "unitCode": "kg", "unitCost": 4000},
      {"text": "Cebolla cabezona", "ingredient": {"create": {"name": "Cebolla cabezona", "baseUnitCode": "g"}}, "quantity": 1000, "unitCode": "g", "unitCost": 3},
      {"text": "Huevos AA x 30", "ingredient": {"id": "61000000-0000-0000-0000-000000049a03"}, "quantity": 30, "unitCode": "unidad", "unitCost": 500}
    ]}');
  insert into _ctx (key, id, v) values ('p1', (v ->> 'purchaseId')::uuid, v);
end $$;
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values
  ('Guardar', 'Proveedor con el NIT en otro formato: se reutiliza', 'reutilizado · 60000000-0000-0000-0000-000000049a01',
    case when (pg_temp.v('p1') ->> 'supplierReused')::boolean then 'reutilizado' else 'nuevo' end || ' · ' || (pg_temp.v('p1') ->> 'supplierId')),
  ('Guardar', 'No se creó otro proveedor', '2', (select count(*)::text from dk_suppliers where kitchen_id = pg_temp.k('A'))),
  ('Guardar', '«tomate» se reutiliza; solo se crea la cebolla', '1 creado · 1 reutilizado',
    (pg_temp.v('p1') ->> 'ingredientsCreated') || ' creado · ' || (pg_temp.v('p1') ->> 'ingredientsReused') || ' reutilizado'),
  ('Guardar', 'La cebolla nueva: código y proveedor principal', 'CEBOLLA-CABEZONA · Frutas El Sol S.A.S.',
    (select i.code || ' · ' || s.name from dk_ingredients i join dk_suppliers s on s.id = i.primary_supplier_id where i.kitchen_id = pg_temp.k('A') and i.name = 'Cebolla cabezona')),
  ('Guardar', 'Compra en borrador con 3 líneas', 'BORRADOR · 3',
    (select p.status || ' · ' || (select count(*) from dk_purchase_items where purchase_id = p.id) from dk_purchases p where p.id = pg_temp.k('p1'))),
  ('Guardar', 'Quién la creó', '10000000-0000-0000-0000-000000049a01', (select created_by::text from dk_purchases where id = pg_temp.k('p1'))),
  ('Guardar', 'La factura queda adjunta', 'factura 1.jpg · image/jpeg',
    (select file_name || ' · ' || mime_type from dk_attachments where entity_type = 'purchase' and entity_id = pg_temp.k('p1'))),
  ('Guardar', 'La importación queda usada y enlazada', 'USADA · sí',
    (select status || ' · ' || case when purchase_id = pg_temp.k('p1') then 'sí' else 'no' end from dk_invoice_imports where id = pg_temp.k('imp1'))),
  ('Guardar', 'Se aprenden las 3 líneas', '3', (select count(*)::text from dk_ingredient_aliases where kitchen_id = pg_temp.k('A'))),
  ('Guardar', 'El borrador no mueve el inventario', '0',
    (select count(*)::text from dk_inventory_movements where kitchen_id = pg_temp.k('A')));

select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v jsonb;
begin
  v := dk_invoice_match(pg_temp.v('ex'));
  insert into _t (area, test, expected, got) values ('Aprendido', 'La próxima factura llega asociada', 'Tomate · learned · 1.0 · kg',
    (v -> 'lines' -> 0 -> 'suggestions' -> 0 ->> 'name') || ' · ' || (v -> 'lines' -> 0 -> 'suggestions' -> 0 ->> 'reason') || ' · ' ||
    (v -> 'lines' -> 0 -> 'suggestions' -> 0 ->> 'score') || ' · ' || (v -> 'lines' -> 0 -> 'suggestions' -> 0 ->> 'learnedUnitCode'));
  insert into _t (area, test, expected, got) values ('Duplicados', 'La coincidencia avisa que la factura ya está', 'FE-1001 · BORRADOR',
    (v #>> '{duplicateInvoice,invoiceNumber}') || ' · ' || (v #>> '{duplicateInvoice,status}'));
  insert into _t (area, test, expected, got) values ('Duplicados', 'Guardar la misma factura otra vez: se rechaza', 'duplicate_invoice',
    pg_temp.hint(format($q$select dk_create_purchase_from_import('%s', '{
      "supplier": {"id": "60000000-0000-0000-0000-000000049a01"}, "invoice": {"number": " fe-1001 ", "date": "2026-10-09"},
      "lines": [{"text": "x", "ingredient": {"id": "61000000-0000-0000-0000-000000049a03"}, "quantity": 1, "unitCode": "unidad", "unitCost": 1}]}')$q$, pg_temp.k('imp2'))));
  insert into _t (area, test, expected, got) values ('Duplicados', 'Una importación usada no se vuelve a guardar', 'Esta factura ya no está por revisar (estado USADA)',
    pg_temp.err(format($q$select dk_create_purchase_from_import('%s', '{"supplier": {"id": "60000000-0000-0000-0000-000000049a01"}, "invoice": {"number": "Z", "date": "2026-10-09"}, "lines": [{"text": "x", "ingredient": {"id": "61000000-0000-0000-0000-000000049a03"}, "quantity": 1, "unitCode": "unidad", "unitCost": 1}]}')$q$, pg_temp.k('imp1'))));
  insert into _t (area, test, expected, got) values ('Duplicados', 'Otro proveedor con el mismo NIT por la API: rechazado', 'blocked',
    pg_temp.blocked($q$insert into dk_suppliers (name, tax_id) values ('Frutas Sol', '900123456-7')$q$));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. Guardar y confirmar (caja con factor; carne repetida en dos líneas)
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v jsonb;
begin
  v := dk_create_purchase_from_import(pg_temp.k('imp3'), '{
    "supplier": {"id": "60000000-0000-0000-0000-000000049a02"},
    "invoice": {"number": "C-2", "date": "2026-10-09", "tax": 1000},
    "lines": [
      {"text": "Tomate caja", "ingredient": {"id": "61000000-0000-0000-0000-000000049a01"}, "quantity": 2, "unitCode": "caja", "unitCost": 48000, "factor": 12000},
      {"text": "Carne A", "ingredient": {"id": "61000000-0000-0000-0000-000000049a02"}, "quantity": 1000, "unitCode": "g", "unitCost": 10},
      {"text": "Carne B", "ingredient": {"id": "61000000-0000-0000-0000-000000049a02"}, "quantity": 1000, "unitCode": "g", "unitCost": 20}
    ]}', true);
  insert into _ctx (key, id, v) values ('p2', (v ->> 'purchaseId')::uuid, v);
end $$;
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values
  ('Confirmar', 'Guardar y confirmar: confirmada con su total', 'CONFIRMADA · 126000 · 127000',
    (select status || ' · ' || subtotal::numeric(12, 0) || ' · ' || total::numeric(12, 0) from dk_purchases where id = pg_temp.k('p2'))),
  ('Confirmar', 'La caja se guarda como unidad de compra del tomate', '12000',
    (select factor_to_base::numeric(12, 0)::text from dk_ingredient_purchase_units where ingredient_id = '61000000-0000-0000-0000-000000049a01' and unit_id = pg_temp.unit('caja'))),
  ('Confirmar', 'Entran 2 cajas = 24.000 g de tomate (un solo movimiento)', '1 · 24000',
    (select count(*) || ' · ' || sum(quantity_base_unit)::numeric(12, 0) from dk_inventory_movements where ingredient_id = '61000000-0000-0000-0000-000000049a01')),
  ('Confirmar', 'Carne en dos líneas (10 y 20 por g): promedio 15', '15',
    (select trim_scale(avg_cost::numeric(12, 2))::text from dk_ingredients where id = '61000000-0000-0000-0000-000000049a02')),
  ('Confirmar', 'Tomate: 4 por g', '4',
    (select trim_scale(avg_cost::numeric(12, 2))::text from dk_ingredients where id = '61000000-0000-0000-0000-000000049a01'));

-- ---------------------------------------------------------------------------
-- 6. Compras endurecidas (D10)
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v_empty uuid;
begin
  insert into dk_purchases (supplier_id, invoice_number, invoice_date) values ('60000000-0000-0000-0000-000000049a02', 'VACIA-1', '2026-10-09') returning id into v_empty;
  insert into _t (area, test, expected, got) values ('Endurecer', 'Compra nueva por la API: queda con quién la creó', '10000000-0000-0000-0000-000000049a01',
    (select created_by::text from dk_purchases where id = v_empty));
  insert into _t (area, test, expected, got) values ('Endurecer', 'Confirmar una compra sin líneas: rechazado', 'La compra no tiene líneas: agrega al menos un insumo antes de confirmarla',
    pg_temp.err(format($q$select dk_confirm_purchase('%s')$q$, v_empty)));
  insert into _t (area, test, expected, got) values ('Endurecer', 'Marcar CONFIRMADA por la API (sin mover inventario): rechazado', 'blocked',
    pg_temp.blocked(format($q$update dk_purchases set status = 'CONFIRMADA' where id = '%s'$q$, v_empty)));
  insert into _t (area, test, expected, got) values ('Endurecer', 'Crear una compra ya CONFIRMADA por la API: rechazado', 'blocked',
    pg_temp.blocked($q$insert into dk_purchases (supplier_id, invoice_number, invoice_date, status) values ('60000000-0000-0000-0000-000000049a02', 'X-9', '2026-10-09', 'CONFIRMADA')$q$));
  insert into _t (area, test, expected, got) values ('Endurecer', 'Cambiar el total de una compra confirmada: rechazado', 'blocked',
    pg_temp.blocked(format($q$update dk_purchases set total = 1 where id = '%s'$q$, pg_temp.k('p2'))));
  insert into _t (area, test, expected, got) values ('Endurecer', 'Las notas de una compra confirmada sí se cambian', 'ALLOWED',
    pg_temp.err(format($q$update dk_purchases set notes = 'revisada' where id = '%s'$q$, pg_temp.k('p2'))));
  insert into _t (area, test, expected, got) values ('Endurecer', 'Confirmar dos veces: rechazado', 'Solo se pueden confirmar compras en estado BORRADOR (actual: CONFIRMADA)',
    pg_temp.err(format($q$select dk_confirm_purchase('%s')$q$, pg_temp.k('p2'))));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. Permisos y aislamiento
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('cook'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Permisos', 'Cocina: no inicia una importación', 'blocked',
      pg_temp.blocked(format($q$select dk_invoice_import_start('kitchens/%s/invoice-imports/z.jpg', 'z.jpg', 'image/jpeg', 10, null)$q$, pg_temp.k('A')))),
    ('Permisos', 'Cocina: no ve coincidencias', 'blocked', pg_temp.blocked($q$select dk_invoice_match('{}')$q$)),
    ('Permisos', 'Cocina: no guarda la compra', 'blocked',
      pg_temp.blocked(format($q$select dk_create_purchase_from_import('%s', '{}')$q$, pg_temp.k('imp4')))),
    ('Permisos', 'Cocina: no ve las importaciones', '0', (select count(*)::text from dk_invoice_imports));
end $$;
reset role;

select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('B'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Aislamiento', 'Desde B no se usa una importación de A', 'Importación no encontrada',
      pg_temp.err(format($q$select dk_create_purchase_from_import('%s', '{}')$q$, pg_temp.k('imp4')))),
    ('Aislamiento', 'Desde B no se ven las importaciones de A', '0', (select count(*)::text from dk_invoice_imports)),
    ('Aislamiento', 'Desde B no se usa un proveedor de A', 'Proveedor no encontrado',
      pg_temp.err($q$select dk_invoice_match('{}', '60000000-0000-0000-0000-000000049a01')$q$));
end $$;
reset role;
select pg_temp.as_owner();

select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_invoice_import_discard(pg_temp.k('imp4'));
  insert into _t (area, test, expected, got) values ('Importación', 'Descartar una importación', 'DESCARTADA',
    (select status from dk_invoice_imports where id = pg_temp.k('imp4')));
end $$;
reset role;
select pg_temp.as_owner();

-- ---------------------------------------------------------------------------
-- 8. Rev. 2: tiquetes de plaza (descripciones cortadas, tamaños y unidades en el texto)
-- ---------------------------------------------------------------------------
insert into _t (area, test, expected, got) values
  ('Tiquetes', 'Texto sin código, tamaño ni unidad', 'arroz sabroson · trifogon · aguacate papelillo',
    dk_invoice_clean_key('ARROZ SABROSON X 1000') || ' · ' || dk_invoice_clean_key('TRIFOGON CAJA P X 24') || ' · ' || dk_invoice_clean_key('AGUACATE PAPELILLO X KL'));
insert into dk_ingredients (id, kitchen_id, code, name, base_unit_id) values
  ('61000000-0000-0000-0000-000000049a11', pg_temp.k('A'), 'ARROZ', 'Arroz', pg_temp.unit('g')),
  ('61000000-0000-0000-0000-000000049a12', pg_temp.k('A'), 'ACEITE', 'Aceite vegetal', pg_temp.unit('ml')),
  ('61000000-0000-0000-0000-000000049a13', pg_temp.k('A'), 'CALDO', 'Caldo de gallina', pg_temp.unit('unidad'));
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v jsonb := dk_invoice_match('{
  "supplier": {"name": "MERKPLAZA VIVERES MKP", "taxId": "1052959291-3"},
  "invoice": {"total": 68900},
  "lines": [
    {"text": "ARROZ SABROSON X 1000", "genericName": "Arroz", "code": "11384", "quantity": 6},
    {"text": "ACEITE CUISINE X3000", "genericName": "Aceite vegetal", "quantity": 1},
    {"text": "MAGGI CON ESPECIAS D", "genericName": "Caldo de gallina", "quantity": 12},
    {"text": "ARROZ SABROSON X 1000", "quantity": 6}
  ]}');
begin
  insert into _t (area, test, expected, got) values
    ('Tiquetes', 'Con el nombre genérico: «ARROZ SABROSON X 1000» → Arroz', 'Arroz · name',
      (v -> 'lines' -> 0 -> 'suggestions' -> 0 ->> 'name') || ' · ' || (v -> 'lines' -> 0 -> 'suggestions' -> 0 ->> 'reason')),
    ('Tiquetes', '«ACEITE CUISINE X3000» → Aceite vegetal', 'Aceite vegetal', v -> 'lines' -> 1 -> 'suggestions' -> 0 ->> 'name'),
    ('Tiquetes', '«MAGGI CON ESPECIAS D» (marca) → Caldo de gallina por el genérico', 'Caldo de gallina', v -> 'lines' -> 2 -> 'suggestions' -> 0 ->> 'name'),
    ('Tiquetes', 'Sin genérico, el texto limpio también encuentra Arroz (fuerte)', 'Arroz · sí',
      (v -> 'lines' -> 3 -> 'suggestions' -> 0 ->> 'name') || ' · ' || case when (v -> 'lines' -> 3 -> 'suggestions' -> 0 ->> 'score')::numeric >= 0.9 then 'sí' else 'no' end);
end $$;
reset role;
select pg_temp.as_owner();

insert into _t (area, test, expected, got) values ('IA', 'La función de IA está en los planes con IA', '2',
  (select count(*)::text from dk_plan_features where feature_key = 'invoice_import'));

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
