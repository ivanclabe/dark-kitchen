# ADR 0049: Importar compra desde factura

## Estado
**Aprobada e implementada (2026-10-10).** Falta la prueba real con la IA (ver Validación).

**Pedido:** en Compras, una opción nueva, **«Importar desde factura»**:
- El usuario arrastra o elige una foto o un PDF de la factura.
- La IA lee el proveedor, el NIT, los ítems, las cantidades y los precios. Si no hay NIT, busca al proveedor por nombre.
- Quanela sugiere coincidencias, pero el usuario revisa y corrige todo antes de afectar el inventario, en una pantalla de revisión (*human in the loop*): cantidades, precios y la asociación manual de ítems cuyo nombre en la factura no es el del insumo.
- Todo queda en borrador hasta confirmar. La confirmación es transaccional, reutiliza lo que ya existe y no duplica proveedores ni insumos.
- El flujo manual se queda igual.

---

## 1. Auditoría

### Lo que se reutiliza
| Pieza | Hoy | Uso en la importación |
|---|---|---|
| `dk_purchases` (BORRADOR → CONFIRMADA) | Proveedor, número y fecha de factura, IVA, notas. **Único `(supplier_id, invoice_number)`** | La compra importada es una compra normal en BORRADOR. El índice único evita registrar dos veces la misma factura |
| `dk_purchase_items` | Insumo, cantidad y **unidad de compra**, y costo por unidad de compra | Cada línea revisada es un ítem normal |
| `dk_confirm_purchase` | Única forma de confirmar. En una transacción: convierte a la unidad base, inserta el movimiento COMPRA, el trigger actualiza el stock, recalcula el costo promedio y marca CONFIRMADA. Exige `purchasing.confirm` y cuenta activa | **El inventario solo se mueve por aquí.** La importación no escribe stock ni costos |
| `dk_ingredient_purchase_units` | Factor propio por insumo («la caja de tomate trae 12 kg»). **La app no lo usa todavía** | Cuando la factura dice «caja», «bolsa» o «paquete», la revisión pide el factor y lo guarda aquí. La confirmación ya lo usa |
| `dk_attachments` y el bucket privado `dk-attachments` | Adjuntos de la compra, con la ruta `kitchens/{cuenta}/…`, y los permisos `invoices.view` / `invoices.upload` | La factura original queda como adjunto de la compra, igual que si se subiera a mano |
| `dk_suppliers`, `dk_ingredients` | Proveedor con `tax_id` (NIT) e insumo con código único por cuenta | Se buscan antes de crear. Solo se crea si el usuario lo decide |
| `dk_tax_id_key()` | NIT normalizado (solo letras y números, en mayúsculas). Hoy solo lo usan los clientes | Comparar NIT del proveedor |
| Plataforma de IA | `DK_ANTHROPIC_API_KEY` (la misma de Copilot), catálogo de modelos `dk_ai_models`, funciones `dk_features` / plan, cupo diario y registro de cada uso (`dk_ai_run_reserve` / `dk_ai_run_finish` en `dk_ai_insights`) | La lectura de facturas es una función de IA más, con su cupo y su registro |

### Lo que falta o está flojo
| Hallazgo | Riesgo |
|---|---|
| La IA nunca ha leído imágenes ni PDF. No hay búsqueda aproximada (`pg_trgm`) | Hay que construir la lectura y la búsqueda de coincidencias |
| **Los proveedores no tienen ninguna protección contra duplicados** (ni por NIT ni por nombre). El alta rápida ni siquiera pide NIT | La importación podría duplicarlos. Hoy hay 2 proveedores, ninguno con NIT: el índice único se puede crear sin conflictos |
| **Quien puede crear compras puede cambiar `status` a CONFIRMADA directamente por la API**, sin pasar por `dk_confirm_purchase`: la compra queda «confirmada» sin mover el inventario | Inconsistencia de inventario (existe hoy, no es nuevo) |
| `dk_confirm_purchase` acepta una compra sin ítems. Si el mismo insumo viene en dos líneas, la segunda calcula el costo promedio con el valor de antes de la primera | Una factura importada suele traer líneas repetidas: el costo promedio quedaría mal |
| «Caja», «bolsa» y «paquete» convierten con factor 1 si el insumo no tiene su factor propio | 1 caja de tomate entraría como 1 kg |
| `created_by` queda vacío en compras y adjuntos | Sin rastro de quién lo hizo |
| La unidad de compra se elige entre **todas** las unidades, sin filtrar por tipo | Se puede comprar «litros» de un insumo en gramos (la confirmación lo rechaza tarde) |

## 2. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Dónde vive | En **Abastecimiento → Compras**, el botón **Nueva** se vuelve un menú con **Manual** (el flujo de hoy, sin cambios) e **Importar desde factura**. Ruta `/supply/compras/importar`. También se puede soltar una factura sobre la lista de Compras |
| **D2** | Archivos | Fotos JPG, PNG o WebP y PDF de hasta **10 MB y 10 páginas**. En el celular se puede **tomar la foto** directamente; el selector del iPhone entrega JPG. Las fotos grandes se reducen en el navegador antes de subirlas. El archivo va al bucket privado de siempre (`kitchens/{cuenta}/invoice-imports/…`) y **la IA lo lee desde ahí**, no viaja en la petición |
| **D3** | La lectura | Una función nueva, **`dk-invoice-import`**, con el modelo de visión configurable en el catálogo (por defecto **Claude Sonnet 5.5**). Lee imagen o PDF y devuelve un formato fijo (*tool* forzada):<br>• proveedor: nombre, NIT, teléfono y dirección;<br>• factura: número, fecha, subtotal, IVA, total y moneda;<br>• líneas: texto tal cual, código si lo hay, cantidad, unidad escrita, precio unitario y total de línea;<br>• una **confianza** por dato y avisos («foto borrosa», «falta una página»).<br>El texto de la factura es **dato, nunca instrucciones**. El servidor valida los números (cantidad > 0, precios ≥ 0) y **la IA nunca escribe en la base** |
| **D4** | Coincidencias | Las calcula **la base, no la IA**, con reglas que se pueden explicar (`dk_invoice_match`). **Proveedor**, en este orden:<br>1. **NIT** igual, con o sin dígito de verificación («900.123.456-7» = «9001234567» = «900123456»);<br>2. **nombre** igual sin tildes, puntos ni «S.A.S.», «LTDA» o «S.A.»;<br>3. **parecidos** (`pg_trgm`).<br>**Ítem**, en este orden:<br>1. **Lo aprendido**: la asociación que el usuario hizo antes para ese texto con ese proveedor (D5);<br>2. **código** igual;<br>3. **nombre** parecido, con las 3 mejores opciones.<br>Cada sugerencia dice **por qué** («Mismo NIT», «Lo asociaste antes», «Parecido 82 %») |
| **D5** | Aprender las asociaciones | Tabla nueva **`dk_ingredient_aliases`**: cuenta, proveedor, texto normalizado de la factura → insumo, unidad de compra y factor. Se guarda cuando el usuario confirma la revisión. Así, la próxima factura del mismo proveedor ya llega asociada. `dk_supplier_ingredients` no sirve porque no guarda el texto de la factura. **Esta tabla es necesaria** |
| **D6** | Pantalla de revisión | Una pantalla, no un paso a paso:<br>• **la factura a la izquierda** (zoom, páginas del PDF), **lo leído a la derecha**. En el celular, la factura se abre con un botón;<br>• **Proveedor**: la coincidencia, con «Elegir otro» o **«Crear proveedor»** con los datos leídos (NIT, nombre, teléfono). Número, fecha e IVA son editables;<br>• **Líneas**: texto de la factura → **insumo** (buscador con las sugerencias primero), cantidad, unidad (solo las que tienen sentido para ese insumo), costo unitario y total. Se pueden **Ignorar** (domicilio, bolsas) o **Crear insumo** con el texto leído;<br>• si la unidad es caja, bolsa o paquete y el insumo no tiene factor: **«¿Cuánto trae la caja?»**, y se guarda (D7);<br>• lo dudoso, en ámbar: confianza baja, sin coincidencia, cantidad o precio raro frente a la última compra (más de 3 veces o menos de un tercio);<br>• **cuadre**: suma de líneas frente a subtotal y total de la factura. Si difieren más de 1 %, se avisa (no bloquea);<br>• no se puede guardar mientras quede una línea sin insumo ni marcada «Ignorar». **Nada se asocia solo: todo lo sugerido se ve y se puede cambiar** |
| **D7** | Guardar | **«Guardar borrador»** llama a un solo RPC nuevo, **`dk_create_purchase_from_import`**, que en **una transacción**:<br>• crea el proveedor si el usuario lo pidió, revisando de nuevo por NIT. Si ya existe, usa ese y no duplica;<br>• crea los insumos pedidos, con código único;<br>• crea la compra en BORRADOR con sus ítems;<br>• guarda los factores de unidad y lo aprendido;<br>• adjunta la factura y marca la importación como usada.<br>Si algo falla, **no queda nada a medias**. Si esa factura ya está registrada (mismo proveedor y número), lo dice y enlaza la compra existente.<br>**«Guardar y confirmar»** (con `purchasing.confirm`) hace lo mismo y confirma con **`dk_confirm_purchase`** dentro de la misma transacción.<br>Después se llega al detalle de la compra de siempre. Un borrador se sigue confirmando como hoy |
| **D8** | Registro de importaciones | Tabla nueva **`dk_invoice_imports`**: archivo, estado (`LEYENDO`, `LISTA`, `ERROR`, `USADA`, `DESCARTADA`), lo que leyó la IA (tal cual), compra creada, quién y cuándo. Sirve para:<br>• retomar la revisión si se recarga la página;<br>• auditar lo que leyó la IA frente a lo que guardó la persona;<br>• avisar «Ya importaste este archivo» (huella SHA-256).<br>Las importaciones no usadas se ven en Compras como «Por revisar» y se pueden descartar |
| **D9** | Proteger contra duplicados | **Proveedores:** índice único por cuenta sobre el **NIT normalizado** (`dk_tax_id_key`), cuando hay NIT. La migración revisa antes que no haya duplicados; si los hay, **se detiene y te los muestra** (no fusiona nada sola). **Insumos:** ya son únicos por código; la importación siempre propone los existentes antes de crear. **Facturas:** el índice único que ya existe |
| **D10** | Endurecer la confirmación | Arreglos de lo que encontró la auditoría:<br>• `status` de una compra **solo cambia por `dk_confirm_purchase`** (trigger). Nadie la marca CONFIRMADA por la API sin mover el inventario;<br>• `dk_confirm_purchase` rechaza una compra sin ítems y calcula bien el costo promedio cuando un insumo se repite (lee y bloquea el insumo línea por línea). Se recrea desde su cuerpo vigente en la base, conservando los permisos;<br>• `created_by` se llena solo en compras y adjuntos.<br>**Esto cambia un comportamiento existente; por eso va en el ADR** |
| **D11** | Permisos, plan y cupo | **No hay permisos nuevos.** Importar requiere `purchasing.create` e `invoices.upload`. Crear un proveedor o un insumo requiere los permisos de siempre (`suppliers.edit`, `inventory.create`); sin ellos, solo se pueden elegir existentes. **Guardar y confirmar** requiere `purchasing.confirm`.<br>Función de IA nueva, **`invoice_import`**, en los mismos planes que «Kitchen Insights», con el cupo diario compartido y un intervalo mínimo de **30 segundos** (el mínimo del catálogo; el de por defecto, 120 s, estorba al importar varias facturas seguidas). Cada lectura registra tokens y tiempo |
| **D12** | Privacidad | La factura se envía al mismo proveedor de IA que ya usa Copilot. La pantalla lo dice antes de subir: «Quanela lee la factura con IA; tú revisas todo antes de guardar». El archivo queda en el bucket privado de la cuenta |
| **D13** | Ayuda | Un artículo nuevo, «Importar una compra desde una factura», cambios en «Compras» y en las notas de versión, y desplegar `dk-copilot`. El manual no se toca |

## 3. Fases
| Fase | Qué |
|---|---|
| 1 · Base | Migración `dk_invoice_import`:<br>• `pg_trgm` y una clave de nombre (`dk_match_key`: sin tildes ni signos, minúsculas);<br>• las tablas `dk_invoice_imports` y `dk_ingredient_aliases`, con RLS por cuenta y permisos;<br>• el índice único de NIT (D9);<br>• `dk_invoice_match`, `dk_create_purchase_from_import` y el endurecimiento (D10);<br>• la función de IA `invoice_import`.<br>Antes de aplicar, se ensaya contra la base y se revisa que no haya proveedores con NIT repetido |
| 2 · Lectura | Función `dk-invoice-import`:<br>• verifica la sesión, la cuenta y el cupo;<br>• lee el archivo del bucket (con los permisos del usuario);<br>• llama al modelo con imagen o PDF y la *tool* forzada;<br>• valida, guarda en `dk_invoice_imports` y devuelve lo leído junto con las coincidencias.<br>La validación queda en un `contract.ts` con pruebas |
| 3 · App | El menú **Nueva**, la zona para soltar archivos, la pantalla de revisión (D6) y «Por revisar» en Compras. Lógica pura (cuadre, unidades, líneas pendientes, alertas de precio) en `lib/` con pruebas. Que funcione en celular |
| 4 · Ayuda | Artículos, notas y despliegue de `dk-copilot` |
| — | **Validación:**<br>• **SQL:** coincidencias por NIT con y sin dígito, por nombre con tildes y «S.A.S.» y por lo aprendido; no duplica proveedor ni insumo; factura repetida; todo o nada (si una línea falla, no queda compra); «Guardar y confirmar» mueve el stock una sola vez; `status` no se cambia por la API; insumo repetido con el costo promedio correcto; compra vacía rechazada; permisos y aislamiento entre cuentas.<br>**Vitest** y pruebas de `contract.ts`.<br>**Prueba real** con 3 facturas **de ejemplo inventadas** (foto, foto torcida y PDF de 2 páginas), sin datos de clientes reales, guardando solo en borrador y descartándolas después.<br>**Además:** `tsc`, `oxlint` y builds |

## 4. Riesgos
| Riesgo | Mitigación |
|---|---|
| La IA lee mal un número | Nada se guarda sin revisión. Lo dudoso va en ámbar, el cuadre de totales avisa y se compara con el precio de la última compra |
| Asociar mal un ítem enseña mal para la próxima | Lo aprendido siempre se muestra como sugerencia («Lo asociaste antes») y se corrige en la revisión. Al corregirlo, se reemplaza |
| Fotos borrosas, facturas a mano o PDF escaneados | La IA avisa y baja la confianza. El usuario corrige o crea la compra manual |
| Costo y demora (10 a 40 s por factura) | Cupo diario del plan, intervalo de 30 s, registro de tokens. La pantalla muestra el avance y se puede salir y volver (D8) |
| El índice de NIT falla porque ya hay duplicados | La migración se detiene antes y los muestra. No se fusiona nada sin tu decisión |
| Cambiar `dk_confirm_purchase` | Se parte del cuerpo vigente en la base. Las pruebas cubren lo de antes y lo nuevo |

## 5. Resultados (2026-10-10)
| Fase | Qué quedó |
|---|---|
| 1 · Base | Migración `20261010110000_dk_invoice_import` (aplicada; era la única pendiente):<br>• `pg_trgm` (en `extensions`) y las claves `dk_match_key`, `dk_supplier_name_key` (sin «S.A.S.», «LTDA»…), `dk_nit_base` y `dk_nit_matches` (con o sin dígito de verificación);<br>• índice único `dk_suppliers_kitchen_nit_key`, un NIT por cuenta. Antes, la migración revisa que no haya duplicados: no había;<br>• tablas `dk_invoice_imports` (sin políticas de escritura: solo cambian por funciones) y `dk_ingredient_aliases`, con claves compuestas por cuenta;<br>• `dk_invoice_import_start` / `_save` / `_discard`, `dk_invoice_match` (con `dk_invoice_line_suggestions`, interna) y `dk_create_purchase_from_import` (todo o nada; si se pide, confirma dentro de la misma transacción);<br>• D10: trigger `dk_trg_purchases_guard_status`, que solo aplica a la API: una compra nace en borrador, su estado no cambia y una confirmada no cambia sus cifras. `dk_confirm_purchase`, recreado desde la base, rechaza la compra vacía y lee y bloquea el costo promedio línea por línea. `created_by` y `uploaded_by` se llenan solos;<br>• función de IA `invoice_import` (Claude Sonnet 5.5, intervalo de 5 s como Copilot, planes Business y Enterprise).<br>Tipos regenerados |
| 2 · Lectura | Función `dk-invoice-import` (desplegada):<br>• sesión del usuario, cupo con `dk_ai_run_reserve` / `_finish` y el modelo del catálogo;<br>• lee el archivo del bucket privado: imagen de hasta 5 MB, PDF de hasta 10 MB y 10 páginas;<br>• *tool* forzada `registrar_factura`; el texto de la factura es dato;<br>• `normalizeExtraction` valida los montos colombianos («1.250.000», «12.500,50»), las fechas reales, las cantidades positivas y hasta 150 líneas;<br>• guarda LISTA o ERROR y devuelve las coincidencias.<br>Si el archivo ya se importó, avisa sin llamar al modelo |
| 3 · App | **Compras → Nueva**: un menú con *Manual* (igual que antes) e *Importar desde factura*, cuando la función está disponible. También se puede **soltar** la factura sobre la lista. Las importaciones sin guardar aparecen en **«Por revisar»**, con un botón para descartarlas.<br>`/supply/compras/importar[/:id]`:<br>• zona para soltar el archivo, con *Tomar foto* en el celular; las fotos se reducen a 2400 px en JPG;<br>• avance de la lectura y manejo de «ya importaste este archivo»;<br>• la revisión: factura a la izquierda con zoom (en el celular, con el botón *Ver la factura*); proveedor con el motivo de la coincidencia, *Cambiar* o *Crear con los datos de la factura*; líneas con sugerencias, crear o ignorar, unidades filtradas por insumo, «¿Cuántos g trae 1 caja?», alertas en ámbar (dudas, total de línea, precio más de 3 veces lejos del promedio); cuadre con el subtotal; *Guardar borrador* y *Guardar y confirmar*.<br>Lógica pura en `lib/invoiceReview.ts` y `lib/invoiceFile.ts`.<br>El formulario de proveedor muestra «Ya tienes un proveedor con ese NIT» |
| 4 · Ayuda | Artículo nuevo `invoice-import`, y cambios en `purchases` (Nueva → Manual, reglas nuevas), en `suppliers` (un NIT por cuenta) y en las notas de versión. `dk-copilot` desplegada. El manual no se tocó |

**Validación:**
- SQL: suite nueva `invoice_import` **57/57**:
  - claves de nombre y NIT;
  - coincidencias por NIT con dígito, por nombre sin «SAS», parecido sin elegirlo solo, y mismo nombre con otro NIT (avisa);
  - insumos por parecido, por código y por lo aprendido;
  - aislamiento entre cuentas;
  - archivo repetido y ruta fuera de la cuenta;
  - **todo o nada**: una caja sin factor no deja compra ni consume la importación;
  - proveedor con el NIT en otro formato y «tomate» reutilizados, sin duplicar; la cebolla creada con código y proveedor principal;
  - borrador con su adjunto y quién lo creó, sin movimientos;
  - lo aprendido llega con la unidad;
  - factura repetida (también con espacios y minúsculas) e importación ya usada;
  - NIT repetido por la API rechazado;
  - *Guardar y confirmar*: 2 cajas = 24.000 g en un movimiento; carne en dos líneas a 10 y 20 por g da un promedio de **15** (antes daba 10);
  - compra vacía, estado por la API, compra nacida confirmada y total de una confirmada: rechazados; las notas sí se cambian; confirmar dos veces: rechazado;
  - permisos (Cocina no importa, no ve coincidencias, no guarda, no ve importaciones) y descartar.
- Con la migración siguen en verde: `permission_catalog`, `multikitchen_isolation`, `insights`, `copilot_tools`, `copilot_safety`, `audit_events`, `customer_type`, `global_admin`, `billing`, `ai_quota`. En `features`, `plans`, `ai_platform` y `observability` el catálogo pasó de 9 a 10 funciones.
- `ai_platform` → «Usage: Metered runs and latency» **ya fallaba antes** de esta migración: depende del uso real de IA en la base. No se tocó.
- Vitest: **700**:
  - `invoiceContract.test` (montos, normalización, páginas del PDF);
  - `invoiceReview.test` (unidades, factor, primer borrador, problemas, alertas, cuadre, lo que se envía);
  - `InvoiceReview.test` (pantalla: sugerido y por qué, lo que falta, guardar con lo decidido, ignorar, sin «Guardar y confirmar» sin permiso);
  - `PurchasePanel.test` (menú Nueva, sin la función solo Manual, Por revisar, soltar un archivo).
- `tsc` (app y funciones), `oxlint` (13 avisos, los mismos) y los dos builds.
- **Primer intento real (2026-10-10):** las 3 facturas fallaron. Claude Sonnet 5.5 no acepta una *tool* forzada (`tool_choice: tool` → error 400). Se cambió a `tool_choice: auto`; la instrucción del sistema exige usar `registrar_factura`, y una respuesta sin la herramienta cuenta como lectura fallida. Además, la causa técnica de cada error queda ahora en `dk_ai_insights.error` (la persona ve el mensaje claro).
- **Prueba real con la IA: pendiente.** La sesión guardada para pruebas venció, y no se inicia sesión por el usuario. Las 3 facturas de ejemplo inventadas están en `docs/qa/facturas-ejemplo/`: foto limpia, foto torcida y algo borrosa, y PDF de 2 páginas con una bolsa de arroz y una caja de limones. La prueba llega hasta la revisión y descarta la importación, sin crear compras.

## 6. Revisión 2 (2026-10-10): tiquetes de plaza y pedidos
**Caso real:** el tiquete «MERKPLAZA VIVERES» («ESTE DOCUMENTO NO TIENE VALIDEZ», pedido en espera, sin número) **fue descartado** aunque la IA leyó bien sus 6 líneas, el NIT, la fecha y el total. La función tomaba `isInvoice: false` como «no hay nada que revisar».

| Qué | Cambio |
|---|---|
| Nunca descartar lo leído | `isInvoice` pasa a significar **documento de compra** (factura, tiquete, remisión, pedido, pre-cuenta, cuenta de cobro), aunque diga que no tiene validez. Un documento **con líneas nunca se descarta**: solo se rechaza el que no tiene productos. Nuevo `documentType`; la revisión avisa «Es un pedido. Se registra igual como compra» |
| Lectura más fina | Instrucciones para tiquetes POS (descripciones cortadas a 20 caracteres, coma de miles «22,800», «KL»=kilo). Por línea: **`genericName`** («ARROZ SABROSON X 1000» → «Arroz»), **`unitCode`** normalizado y **`packSize`/`packUnit`** («X 1000» → 1000 g, «X3000» → 3000 ml). Cabecera: `time`. `readAmount` entiende «22,800» y «1,250,000» |
| Coincidencias | Migración `20261010130000_dk_invoice_match_generic` (aplicada): `dk_invoice_clean_key` (sin códigos, números, tamaños ni unidades) y `dk_invoice_line_suggestions(…, p_generic)`, que compara con el texto limpio y con el nombre genérico. En la cuenta real, «ARROZ SABROSON X 1000» ahora encuentra «Arroz Blanco» (0,90) y queda elegido; los demás productos no existen en el catálogo y se ofrecen para crear |
| Completar lo que falte | Sin número: referencia propuesta `SN-AAAAMMDD-HHMM`, editable. Compra por **unidad** de algo en g o ml: «unidad» entre las unidades del insumo, y el factor viene lleno desde el empaque («Lo dice la factura; revísalo»). Insumo nuevo: el nombre genérico y la unidad base del empaque. **Agregar línea** (líneas a mano, que se pueden quitar y no se aprenden). **Revisar lo que se leyó**: una lectura que falló pero trajo productos se abre sin volver a leerla (sin gastar cupo) |

**Validación:** `invoice_import` **62/62** (5 nuevas con las líneas del tiquete). Vitest **716** (contrato: comas de miles, nunca descartar con líneas, nombre, unidad y empaque válidos; revisión: referencia propuesta, «X 1000» = 1000 g, empaque en ml que no encaja en g, línea a mano; pantalla: agregar y quitar línea). `tsc` (app y funciones), `oxlint` (13 avisos), build y `dk-invoice-import` desplegada.

