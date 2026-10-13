# ADR 0056: Conversión automática de unidades

## Estado
**Aceptada e implementada (2026-10-12).**

**Pedido:** un sistema de conversión automática de unidades:
- comprar carne en **kilogramos** y usarla en **gramos** en las recetas, sin cálculos manuales;
- una **unidad base por insumo**;
- inventario, consumo y costos sincronizados;
- el editor de recetas acepta estas unidades;
- sin tablas nuevas y sin romper la lógica actual.

---

## 1. Auditoría
| Hoy | Consecuencia |
|---|---|
| **Unidades:**<br>• `dk_units` (código, tipo PESO, VOLUMEN o UNIDAD, `factor_to_base`): g = 1, kg = 1000, ml = 1, l = 1000, unidad = 1, docena = 12; caja, bolsa y paquete son genéricas;<br>• `dk_ingredient_purchase_units` guarda los empaques propios de un insumo («caja = 24 unidades»);<br>• ADR 0003 ya definió el modelo de dos niveles | **No hace falta ninguna tabla nueva.** La conversión es: misma unidad → 1; empaque propio del insumo → su factor; mismo tipo → razón de factores; tipos distintos → no hay conversión |
| **Unidad base:** cada insumo tiene `base_unit_id`. Stock, movimientos, costo promedio, mínimos y máximos, reservas y consumo están **siempre en la unidad base** | La unidad base ya existe y no cambia: es la «moneda» interna del inventario |
| **Compras:** `dk_confirm_purchase` **ya convierte** al confirmar (2 kg → 2000 g, $/kg → $/g) y recalcula el costo promedio. La importación de facturas (ADR 0049) también convierte empaques y recuerda el factor | Comprar en kg ya funciona en la base de datos. Pero la **pantalla de compra manual** ofrece todas las unidades (incluso las que no convierten), no muestra la equivalencia y no deja definir un empaque: el error aparece recién al confirmar |
| **Recetas:**<br>• `dk_recipe_items.quantity` está **siempre en la unidad base**: la columna lo dice y el editor muestra la unidad base fija;<br>• el costo es `cantidad × costo promedio`;<br>• el consumo (reserva al confirmar y CONSUMO al marcar listo) usa esa cantidad | **Es el hueco principal:** para un insumo con base en kg, el cocinero debe escribir 0,15 en vez de 150 g. No hay selector de unidad |
| **Mermas y ajustes:** `dk_register_waste` y `dk_register_adjustment` reciben solo la unidad base | Mismo hueco: «se dañó medio kilo» en un insumo en gramos obliga a escribir 500 |
| **La regla de conversión está copiada** en `dk_confirm_purchase` (y sus copias históricas), en la importación y en el cliente (`invoiceReview.ts`) | Hace falta **una sola función** de conversión |
| **Menús maestros:** la sincronización del menú de la organización **falla** si la receta maestra usa kg y el insumo de la cuenta está en g | Debe **convertir**, no fallar |
| **Riesgos:**<br>• nada impide **cambiar la unidad base** de un insumo con historial, lo que reinterpretaría en silencio todo el stock y el costo;<br>• no hay un formato común (se ve «12500 g» en vez de «12,5 kg») | Hace falta una **protección** y un **formateador** |
| **Datos reales:**<br>• 41 insumos en g, 14 en unidad y 1 en ml;<br>• **3 en kg** (1 en una receta);<br>• 2 líneas de receta;<br>• 5 empaques propios | **No hace falta migrar datos.** Los 3 insumos en kg siguen igual, y ahora sus recetas se podrán escribir en gramos |

## 2. Decisiones
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Una sola regla de conversión | **`dk_unit_factor(insumo, unidad)`**: cuántas unidades base trae 1 de esa unidad, o nada si no hay conversión. La usan las recetas, las mermas, los ajustes, los menús maestros y, sin cambiar su resultado, `dk_confirm_purchase`. En el cliente, `src/shared/units/` replica la misma regla, con pruebas que comparan las dos |
| **D2** | La unidad base sigue siendo la verdad | Stock, movimientos, costo por unidad base, reservas y consumo **no cambian**. Toda cantidad que entra en otra unidad se convierte **al guardarla**. Así la cocina, el despacho y los reportes siguen exactamente igual |
| **D3** | Recetas en cualquier unidad compatible | Dos columnas **opcionales** en la tabla existente `dk_recipe_items`: `unit_id` (la unidad elegida) y `unit_quantity` (lo que se escribió, p. ej. 150 g).<br>• `quantity` sigue en la unidad base: 0,15 kg si la base es kg, 150 si es g.<br>• `dk_create_recipe_version` acepta `{ingredient_id, quantity, unit_id}` y convierte.<br>• Sin `unit_id` funciona como hoy (compatibilidad total).<br>• El editor trae un **selector de unidad** con solo las compatibles (mismo tipo y empaques del insumo) y muestra la equivalencia y el costo de cada línea al instante |
| **D4** | Mermas y ajustes en cualquier unidad | `dk_register_waste` y `dk_register_adjustment` reciben una **unidad opcional** y convierten. La pantalla trae el selector y la equivalencia |
| **D5** | Compra manual sin sorpresas | **Solo** las unidades que convierten; la equivalencia en vivo («2 kg = 2.000 g · $20/g»); y, para un empaque nuevo («caja»), el campo **«¿Cuántos trae?»**, que se guarda en `dk_ingredient_purchase_units` para la próxima vez. Se reutiliza la lógica de la importación de facturas, movida a `src/shared/units/` |
| **D6** | Proteger la unidad base | Un insumo con movimientos o recetas **no puede cambiar de unidad base**: lo impide la base de datos, con un mensaje claro. Para un insumo nuevo, la pantalla sugiere g, ml o unidad, y explica que se puede comprar en kg y usar en g |
| **D7** | Menús maestros | La sincronización **convierte** entre unidades del mismo tipo (kg ↔ g) en vez de fallar. Solo falla si no hay conversión posible (por ejemplo, kg contra unidad) |
| **D8** | Mostrar cantidades | Un formateador común: «12,5 kg» en vez de «12500 g», «1,2 l», «3 docenas» cuando aplica. Se usa en stock, movimientos y recetas. Los datos guardados no cambian |

## 3. Fases
| Fase | Qué |
|---|---|
| 1 · Base | Migración `dk_unit_conversion`:<br>• `dk_unit_factor` y `dk_unit_options(insumo)` (unidades compatibles con su factor);<br>• `dk_recipe_items.unit_id` y `unit_quantity`;<br>• `dk_create_recipe_version`, `dk_register_waste` y `dk_register_adjustment` con unidad;<br>• `dk_confirm_purchase` con el factor de la función (mismo resultado);<br>• `dk_ingredient_set_purchase_unit` (empaque propio);<br>• protección de la unidad base;<br>• sincronización de menús maestros con conversión.<br>Pruebas SQL |
| 2 · Pantallas | `src/shared/units/` (conversión y formato); editor de recetas con unidad; compra manual con equivalencia y empaques; mermas y ajustes con unidad; formulario de insumo con la guía de unidad base; formato en stock y movimientos |
| 3 · Prueba | La cadena completa en SQL y en el navegador:<br>1. Comprar **2 kg** de carne a $40.000 → **2.000 g** y **$20/g**.<br>2. Receta de hamburguesa con **150 g** → costo **$3.000**.<br>3. Un pedido de 3 → reserva de **450 g**.<br>4. Cocina lo marca listo → consumo de **450 g** → quedan **1.550 g**.<br>5. Merma de **0,1 kg** → **100 g** → quedan **1.450 g**.<br>6. Comprar una **caja × 12** de huevos → 12 unidades.<br>Más la receta de un insumo con base en kg escrita en gramos. Capturas |
| 4 · Ayuda | Artículo y notas de versión |

**Validación:**
- **SQL:** factores; conversiones inválidas rechazadas; recetas, consumo y costo; mermas y ajustes; compras sin cambios (`finance`, `invoice_import`, `insights`); protección; menús maestros (`master_menus`).
- **Vitest:** la lógica del cliente igual a la de la base; editor y compra.
- **Además:** `tsc`, `oxlint` y builds.

## 4. Riesgos
| Riesgo | Mitigación |
|---|---|
| Romper el consumo o los costos | La unidad base y la cantidad en base no cambian; solo se agrega la conversión al guardar. Se corren todas las suites existentes |
| Redondeos (1 g de sal en una base de kg = 0,001) | `numeric` sin redondeo en la base; la pantalla redondea solo al mostrar |
| Una conversión equivocada en un empaque | El empaque se pide de forma explícita («¿cuántos trae?»), se muestra la equivalencia antes de guardar y queda editable |
| Recetas viejas | Sin `unit_id`, se muestran en la unidad base como hoy |

## 5. Resultados (2026-10-12)

**Base de datos** (migración `20261012100000_dk_unit_conversion.sql`, aplicada):
- `dk_unit_factor` y `dk_unit_options`: una sola regla de conversión. Las genéricas caja, bolsa y paquete **solo** convierten con el factor propio del insumo (antes valían 1 en silencio).
- `dk_recipe_items.unit_id` y `unit_quantity` (opcionales). `dk_create_recipe_version` convierte; sin `unit_id` funciona como antes.
- `dk_register_waste` y `dk_register_adjustment` con `p_unit_id` opcional. La observación guarda lo escrito («Registrada como 0,1 kg»).
- `dk_ingredient_set_purchase_unit`: el empaque propio de un insumo. Rechaza redefinir unidades estándar (kg ya convierte solo).
- Protección `base_unit_locked`: un insumo con movimientos, recetas o compras no cambia de unidad base.
- La sincronización de menús maestros convierte kg ↔ g en vez de fallar.
- **`dk_confirm_purchase` no se tocó:** su resultado ya coincidía con la regla, y una prueba lo verifica.

**Pantallas:**
- `src/shared/units/conversion.ts` (regla y formato);
- editor de recetas con selector de unidad y equivalencia;
- compra manual con solo unidades convertibles, «Entra al inventario: …» y «¿Cuántos trae?»;
- mermas y ajustes con unidad;
- formato «1,45 kg» en stock, panel y movimientos;
- guía de unidad base en el formulario del insumo.
- Corrección defensiva: el stock embebido se lee aunque PostgREST lo devuelva como lista (en el Supabase local se veía 0).

**Prueba** (cadena completa, SQL `unit_conversion` 29/29 y navegador sobre un Supabase local, capturas en `docs/qa/unidades/`):

| Paso | Resultado |
|---|---|
| Comprar 2 kg de carne a $20.000/kg | +2.000 g a $20/g |
| Comprar 1 caja × 12 de huevos a $9.600 | +12 unidades a $800 |
| Comprar 500 g de sal (insumo en kg) | +0,5 kg a $1.000/kg |
| Receta: 150 g carne + 1 huevo + 5 g sal (= 0,005 kg) | Costo $3.805 |
| Pedido de 3 → confirmar y listo | Reserva y CONSUMO −450 g; quedan 1.550 g |
| Merma de 0,1 kg | −100 g; quedan 1.450 g (se ve «1,45 kg») |
| Ajuste de +1 docena | +12 unidades |
| Receta maestra en kg con insumo en g | Se sincroniza como 200 g (unidad kg) |

**Validación:**
- SQL: 1429/1432 contra producción. Las 3 fallas son de `copilot_safety`, previas y por fecha/zona horaria.
- Vitest: 803/803.
- `tsc`, `oxlint` (13 avisos de base) y las dos builds pasan.
- Ayuda: artículos de recetas, compras y mermas; notas de versión. `dk-copilot` desplegado.
