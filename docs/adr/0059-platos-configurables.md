# ADR 0059: Platos configurables (composición, opciones y consumo por componente)

## Estado
**Aceptada e implementada (2026-10-13).**

**Pedido:** platos compuestos y configurables, por ejemplo un corrientazo con plato principal, sopa, bebida y acompañantes como patacones, tajadas o yuca.
- Cada parte es **obligatoria u opcional**, **incluida, con costo extra o de cortesía**, y se asocia con **recetas o sub-recetas** que ya consumen inventario.
- Al confirmar el pedido, el consumo de cada componente se calcula con las unidades y conversiones existentes.
- En el menú público, el cliente ve el plato con sus opciones, los precios al día y un resumen antes de agregarlo.
- Multiempresa, sin duplicar lógica, con precios y costos reales y una administración sencilla.

**Pruebas pedidas:**
- un plato compuesto;
- una sub-receta reutilizable;
- acompañantes opcionales que afecten bien el inventario y el total del pedido.

---

## 1. Auditoría
| Hoy | Consecuencia |
|---|---|
| **Platos:** `dk_products` tiene precio, receta activa, `uses_inventory` y `estimated_cost`. El precio del día sale del planificador (`dk_menu_plan_items.special_price`). No existe ninguna noción de opciones | Hace falta modelar la **composición** del plato |
| **Recetas y sub-recetas** (ADR 0056 y 0057):<br>• recetas por plato o por preparación;<br>• unidades con conversión (`dk_unit_factor`, porción);<br>• preparaciones con stock propio | Los componentes reutilizan esto tal cual: una opción consume **un insumo o preparación** (con unidad) **o la receta de otro plato** |
| **Tres caminos para crear líneas de pedido:**<br>• **caja** (`OrderBuilder`): inserta la línea directo en la tabla, con el precio que escribe la persona;<br>• **menú público y WhatsApp**: comparten `dk_place_order_internal`, que pone el precio del menú de hoy (nunca el del cliente), revisa el stock con la receta y **fusiona dos líneas del mismo plato** | Con opciones, dos líneas del mismo plato son distintas. El precio extra y la validación deben vivir en **una sola función del servidor**, usada por los tres caminos |
| **Confirmar** (`dk_confirm_order_internal`): reserva los insumos de la receta **por línea de pedido**. **Cocina** (CONSUMO al marcar listo), **cancelar** y **revertir** (DEVOLUCION) y el **costo real** de Insights y Finanzas salen de esas reservas | Si la confirmación reserva **también cada componente** con el id de la línea, el consumo, las devoluciones y el costo real **funcionan sin tocar nada más** |
| **Insights** estima el costo de una línea aún sin consumir con `estimated_cost` del plato | Debe estimar con lo que se eligió: plato más componentes |
| **Cocina y tablero** muestran el plato y su observación | Deben mostrar lo elegido («Sopa: sancocho · Patacones ×2») |
| **Datos reales:** 16 platos, 101 líneas de pedido, 0 pedidos web, 1 preparación, ninguna copia de menú maestro | No hace falta migrar datos: todo es opcional y los platos actuales siguen iguales |

## 2. Decisiones
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | **Modelo: grupos y opciones del plato** (dos tablas, por cuenta) | **`dk_product_option_groups`:**<br>• plato, nombre («Elige tu sopa»), orden;<br>• **mínimo y máximo** de elecciones: obligatorio = mínimo ≥ 1, opcional = mínimo 0;<br>• si permite repetir la misma opción («Patacones ×2»).<br>**`dk_product_options`:**<br>• grupo, nombre y orden;<br>• **tipo de precio:** `included` (incluido), `extra` (con su precio adicional) o `courtesy` (cortesía, sin costo para el cliente);<br>• **predeterminada:** se usa si nadie elige, por ejemplo en WhatsApp;<br>• activa o no;<br>• **componente**, uno de dos: un **insumo o preparación** con cantidad y unidad (convertidas a la base, como en las recetas), o **otro plato**, cuya receta activa se consume;<br>• puede no tener componente: «sin cebolla» no consume nada.<br>Todo con `kitchen_id`, llaves por cuenta, RLS como `dk_products` y escritura solo por funciones |
| **D2** | **Lo que se eligió queda en el pedido** | **`dk_order_item_options`:** línea, opción, grupo, nombre y precio en el momento, cantidad y componente resuelto.<br>Se agrega `dk_order_items.estimated_unit_cost`: el costo de lo elegido al pedir, para Insights.<br>Una opción con pedidos no se borra: se desactiva, y el historial conserva el nombre |
| **D3** | **Una sola regla de precio y validación** | **`dk_dish_configuration(plato, precio base, elecciones)`** valida y devuelve las elecciones normalizadas, el precio unitario y el costo estimado:<br>• mínimos y máximos;<br>• opciones activas y del plato;<br>• predeterminadas cuando falta una elección obligatoria.<br>Precio unitario = precio base (el del menú de hoy, o el que escribe la caja) + Σ extras × cantidad. Incluido y cortesía suman 0.<br>La usan los tres caminos:<br>• **menú público y WhatsApp**, dentro de `dk_place_order_internal`, que ya no fusiona líneas con opciones distintas;<br>• **caja**, con la función nueva `dk_order_add_item`, que reemplaza la inserción directa (el precio base sigue siendo editable).<br>En la app, `lib/composition.ts` replica la regla solo para mostrar el total en vivo; las mismas pruebas cubren ambas |
| **D4** | **Consumo: una sola función de requerimientos** | **`dk_order_line_requirements(líneas)`** → insumo y cantidad en unidad base: la receta del plato × cantidad, más cada componente × cantidad de la opción × cantidad de la línea.<br>• Insumo o preparación: la cantidad ya convertida.<br>• Otro plato: su receta activa.<br>La usan el **chequeo de stock** al pedir y la **reserva al confirmar**; las reservas llevan el id de la línea.<br>Cocina, cancelar, revertir, Insights y Finanzas no cambian (ver auditoría). Una sub-receta se consume desde su stock y lo crudo ya salió en su lote (ADR 0057): **una sola vez**.<br>Un plato compuesto que descuenta inventario ya no necesita receta propia si su composición consume algo |
| **D5** | **Costos reales** | • **Plato** (catálogo): costo con las opciones predeterminadas, y el margen.<br>• **Cada opción:** su costo y su margen (un extra de $2.000 que cuesta $600).<br>• **Línea de pedido:** costo estimado de lo elegido. Insights lo usa mientras no hay consumo real; con consumo, el costo es el real de siempre |
| **D6** | **Menú público** | • El menú trae los grupos y opciones de cada plato, con precio y disponibilidad: una opción sin stock para una unidad sale «agotada».<br>• Tocar un plato compuesto abre una **ficha del plato** (hoja inferior en celular, ventana en escritorio):<br>  – foto, descripción y precio base;<br>  – cada grupo con «Obligatorio» o «Opcional» y «Elige hasta N»;<br>  – opciones con «+$2.000», «Incluido» o «Cortesía»;<br>  – cantidad y un **resumen final** («Bandeja · Sancocho · Limonada · Patacones ×2 (+$4.000) = $28.000»);<br>  – el botón «Agregar · $28.000» se activa solo cuando lo obligatorio está elegido.<br>• En el carrito, cada línea muestra lo elegido y se puede editar; dos configuraciones distintas son dos líneas.<br>• El servidor recalcula todo al pedir (D3): el total que se cobra es siempre el real.<br>• Funciona con las 6 plantillas (ADR 0058) |
| **D7** | **Administración sencilla** | Página **Composición** del plato (Catálogo → Editar plato → Composición):<br>• grupos como tarjetas, con nombre, «Obligatorio», «Hasta N» y «Permite repetir»;<br>• cada opción en una fila: nombre, tipo (Incluido, Extra con precio o Cortesía) y componente (insumo, preparación o plato, con cantidad y la unidad que quieras), con su **costo y margen** al lado;<br>• marcar la predeterminada y reordenar;<br>• **vista previa** con la misma ficha del menú público;<br>• **plantillas rápidas** para empezar: «Corrientazo» (sopa, principio, proteína, bebida, acompañantes) y «Combo» (bebida y acompañante).<br>Permiso: `menus.edit`, como editar el plato. Las copias de un menú maestro no se componen en esta versión |
| **D8** | **Cocina, caja y seguimiento** | • **Tablero y cocina:** lo elegido bajo cada plato.<br>• **Caja:** al elegir un plato compuesto, la misma ficha para escoger, con el total en vivo.<br>• **Seguimiento del cliente:** lo elegido en cada línea.<br>• **WhatsApp:** sin cambios; si el asistente no elige, se aplican las predeterminadas |

## 3. Fases
| Fase | Qué |
|---|---|
| 1 · Base | Migración `dk_dish_composition`:<br>• las 3 tablas con RLS y auditoría, y la columna `estimated_unit_cost`;<br>• `dk_dish_configuration` y `dk_order_line_requirements`;<br>• guardar y leer la composición;<br>• `dk_order_add_item`;<br>• `dk_place_order_internal` y `dk_confirm_order_internal` con opciones;<br>• `dk_public_menu` con opciones y disponibilidad;<br>• `dk_insights_items` con el costo estimado de la línea.<br>Pruebas SQL |
| 2 · Administración | Página Composición, con costos, márgenes, vista previa y plantillas rápidas |
| 3 · Menú público | Ficha del plato, carrito con opciones y seguimiento |
| 4 · Operación | Caja con la ficha, y lo elegido en el tablero y la cocina |
| 5 · Prueba | Ver la tabla siguiente: en SQL contra producción (revertido) y en el navegador sobre un Supabase local, con capturas en `docs/qa/platos-configurables/` |
| 6 · Ayuda | Artículo «Platos configurables» y notas de versión. No se toca el manual |

**Prueba de la fase 5:**

| Caso | Qué se verifica |
|---|---|
| **Plato compuesto: «Corrientazo»**, $18.000 | • **Sopa** (obligatoria, incluida): sancocho, 350 **ml** de la preparación «Sancocho», que se guarda en **litros** (se reservan 0,35 l).<br>• **Proteína** (obligatoria): pollo (180 g) o res (+$3.000).<br>• **Bebida** (obligatoria): limonada (otro plato con su receta) o gaseosa (1 unidad).<br>• **Acompañantes** (opcional, hasta 3, permite repetir): patacones +$2.000 (preparación «Patacón», 2 unidades), tajadas +$1.500 (plátano 120 g), yuca de **cortesía** (0,15 **kg** de yuca) |
| **Sub-receta reutilizable** | El «Patacón» se usa en el corrientazo y en otro plato. Un lote de patacones descuenta el plátano; al vender, solo baja el stock de patacones |
| **Acompañantes opcionales** | Corrientazo con res, limonada, patacones ×2 y yuca: **$18.000 + $3.000 + $4.000 = $25.000** por unidad; con 2 unidades, $50.000.<br>• Al confirmar se reservan exactamente: sancocho 0,7 l, res 360 g, la receta de 2 limonadas, 8 patacones y 300 g de yuca.<br>• Al marcar listo, CONSUMO de cada componente, con el costo real en Finanzas.<br>• Al cancelar, todo vuelve |
| **Además** | Falta un obligatorio: se rechaza, o se usa la predeterminada si la hay. Más del máximo: se rechaza. Una opción de otro plato o de otra cuenta: se rechaza. El cliente no puede cambiar el precio. Dos configuraciones del mismo plato son dos líneas. Opción sin stock: agotada. WhatsApp sin elección: usa las predeterminadas. Aislamiento entre cuentas y permisos |

**Validación:**
- todas las suites SQL (`public_menu`, `whatsapp_ordering`, `finance`, `insights`, `sub_recipes`, `unit_conversion`…);
- Vitest;
- `tsc`, `oxlint` y las builds.

## 4. Riesgos
| Riesgo | Mitigación |
|---|---|
| Precios distintos entre la pantalla y el cobro | El servidor siempre recalcula (D3). La app solo muestra, con las mismas pruebas |
| Descontar dos veces o de menos | Una sola función de requerimientos (D4) para el chequeo de stock y las reservas. Pruebas que cuentan cada movimiento |
| Romper la caja, WhatsApp o el menú público | Sin opciones, todo funciona como hoy; las suites existentes cubren esos caminos |
| Editar la composición con pedidos abiertos | Lo elegido queda guardado en la línea y una opción usada solo se desactiva |

## 5. Resultados (2026-10-13)

**Base de datos.** Dos migraciones, aplicadas:
- **`20261013120000_dk_dish_composition.sql`:**
  - las tablas `dk_product_option_groups`, `dk_product_options` y `dk_order_item_options`, con llaves por cuenta, RLS de lectura, sin escritura directa y con auditoría;
  - la columna `dk_order_items.estimated_unit_cost`;
  - la regla de precio y validación, `dk_dish_configuration`;
  - el consumo, `dk_order_line_requirements` y `dk_order_lines`;
  - `dk_order_insert_line`;
  - `dk_confirm_order_internal`, que reserva cada componente por línea;
  - `dk_place_order_internal`, con opciones: el servidor pone el precio, fusiona solo las líneas iguales, cuenta el límite del plato en todas sus líneas y revisa el stock con la misma regla;
  - `dk_order_add_item`, para la caja;
  - `dk_product_composition` y `dk_product_composition_save`;
  - el menú público, con los grupos y la disponibilidad de cada opción (sin costos);
  - Insights, con el costo estimado de lo elegido.
- **`20261013120100_dk_order_status_options.sql`:** el seguimiento del cliente muestra lo elegido.
- **Diferencia con D7:** editar la composición exige `products.edit`, el mismo permiso con el que se edita el plato (no `menus.edit`).

**Pantallas:**
- **Regla compartida:** `src/shared/composition/` (la regla en el navegador y la lista de opciones), usada por el menú público, la caja y la vista previa de la administración.
- **Menú público:** «Elige: …» en la tarjeta y la ficha del plato (`DishSheet`), con reglas, precios, «Agotado», cantidad, resumen y el botón con el total. En el carrito, cada configuración es una línea, con «Editar». El mensaje de WhatsApp incluye lo elegido.
- **Administración:** página **Composición** (Catálogo → Editar plato → Composición), con plantillas («Corrientazo» y «Combo»), costo y margen por opción, «Así lo ve el cliente» y precio y costo con lo elegido.
- **Operación:**
  - la caja (`OrderBuilder`) muestra las opciones con el total por unidad y agrega la línea por `dk_order_add_item`;
  - el tablero y el detalle del pedido muestran lo elegido;
  - el seguimiento del cliente también.

**Prueba.** SQL `dish_composition` 30/30 contra producción (revertido), y la misma cadena en el navegador sobre un Supabase local. Capturas en `docs/qa/platos-configurables/`.

| Caso | Resultado |
|---|---|
| **Plato compuesto:** corrientazo con res, limonada, patacones ×2 y yuca (cortesía), ×2 | $25.000 por unidad y **$50.000** por la línea. Con otro corrientazo tal cual ($18.000) y unos patacones con hogao ($8.000), el pedido da **$76.000**, aunque el navegador dijera $1 |
| **Reserva exacta** de la línea de 2 | arroz 300 g · sancocho 0,7 l (350 ml × 2, guardado en litros) · res 360 g · limón 4 · azúcar 60 g (la receta de la limonada) · patacón 8 · yuca 300 g (0,15 kg × 2) |
| **Sub-receta reutilizable** | El patacón se usa en el corrientazo y en «Patacones con hogao» (3): sale de su stock (12 → 1), y el plátano no se mueve al vender |
| **Cocina, costos y cancelación** | • El CONSUMO de cada componente es igual a lo reservado.<br>• Costo real de la línea: $14.350 = 2 × $7.175, el mismo que estimaba Insights.<br>• En Finanzas, el costo de ventas es todo lo consumido.<br>• Al cancelar, vuelven la gaseosa y el plátano |
| **Además** | • Falta un obligatorio, más del máximo, repetir sin permiso o una opción ajena: se rechazan.<br>• WhatsApp sin elegir usa las predeterminadas y junta las líneas iguales.<br>• La caja: $17.000 escritos + res = $20.000.<br>• Una opción sin stock sale agotada.<br>• Aislamiento y permisos |

**Validación:**
- SQL contra producción: 1519/1522. Las 3 fallas son de `copilot_safety`, previas: fallan igual sin estas migraciones.
- Vitest: 835/835 (regla 4, carrito 10, ficha 2, composición 3).
- `tsc`, `oxlint` (13 avisos de base) y las dos builds pasan.
- Ayuda: artículo «Platos configurables» y notas de versión. `dk-copilot` desplegado.
