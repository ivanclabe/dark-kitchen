# ADR 0057: Sub-recetas y preparaciones por lote

## Estado
**Aceptada e implementada (2026-10-12).**

**Pedido:** sub-recetas reutilizables (una ensalada base, una salsa de la casa):
- cada una con su **rendimiento** y su **costo**;
- se usan en varios platos sin copiar el costo a mano;
- al **preparar un lote** se descuentan sus insumos, una sola vez;
- su costo pasa a cada plato que la usa, con el **costo por porción** calculado solo;
- se integran con las unidades de ADR 0056, sin un sistema paralelo y sin duplicar estructuras;
- trazabilidad completa.

**Pruebas pedidas:**
- una sub-receta sencilla;
- una sub-receta reutilizada en tres platos;
- una conversión automática de kg a g.

---

## 1. Auditoría
| Hoy | Consecuencia |
|---|---|
| **Recetas:**<br>• `dk_recipes` es una versión inmutable, con una sola activa, y está **atada a un plato**: `product_id` es obligatorio;<br>• `dk_recipe_items` guarda el insumo y la cantidad en unidad base, más la unidad escrita (ADR 0056);<br>• `dk_create_recipe_version` crea la versión;<br>• `dk_calculate_recipe_cost` = Σ cantidad × costo promedio;<br>• un trigger recalcula `dk_products.estimated_cost` cuando cambia el costo promedio de un insumo | El motor de recetas ya resuelve versiones, unidades y costos. Solo le falta que la receta pueda ser **de un insumo** y no solo de un plato, y un **rendimiento** (hoy, la receta de un plato es una porción) |
| **Consumo:**<br>• al confirmar un pedido se **reserva** cada insumo de la receta del plato, y se **rechaza** si no alcanza el stock;<br>• al marcarlo listo se registra **CONSUMO** a costo promedio;<br>• al cancelar se registra **DEVOLUCION** | Este flujo funciona con cualquier insumo. Si una sub-receta **es un insumo**, se reserva y se consume igual, sin tocar este flujo |
| **Inventario:**<br>• `dk_inventory_movements` solo crece: COMPRA, MERMA, AJUSTE, CONSUMO, DEVOLUCION;<br>• el stock es una caché que mantiene un trigger;<br>• el costo promedio es ponderado y se recalcula en cada compra | Falta un movimiento para **producir**: sale lo crudo y entra lo preparado |
| **Reportes:**<br>• Insights y Finanzas toman el costo de lo vendido del CONSUMO de los pedidos, y las mermas y ajustes aparte;<br>• las sugerencias de compra (`dk_supply_suggestions`) y las señales de IA (`dk_inventory_signals`) miden el ritmo con CONSUMO | Producir **no es vender**: no debe sumar al costo de ventas, porque contaría dos veces. Pero el ajo que se gasta en salsa **sí** debe contar en su ritmo de consumo, o las sugerencias de compra se quedan cortas |
| **Unidades** (ADR 0056): `dk_unit_factor`, empaques propios por insumo, el formateador | Las sub-recetas los reutilizan tal cual: comprar en kg, escribir la receta en g, rendimiento en kg o g |
| **Permisos:**<br>• `recipes.edit` → ADMIN, MANAGER;<br>• `inventory.adjust` → ADMIN, MANAGER, INVENTORY;<br>• `kitchen.prepare` → ADMIN, MANAGER, KITCHEN | Nadie tiene hoy un permiso para «preparar un lote», y quien cocina (KITCHEN) no entra a Abastecimiento |
| **No existe** nada de sub-recetas, lotes ni rendimiento | Es una extensión, no una migración |
| **Datos reales:** 4 cuentas, 59 insumos, 15 platos, 2 recetas con 2 líneas, 121 movimientos | **No hace falta migrar datos** |

## 2. Decisiones
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | **Una sub-receta es un insumo preparado** | Una columna nueva, `dk_ingredients.is_preparation`. La «Salsa de ajo» es un insumo con todo lo que ya tienen los insumos: unidad base, stock, costo promedio, mínimo, mermas, ajustes y movimientos.<br>Un plato la lleva como a cualquier insumo, así que la reserva, el consumo, la cocina, el despacho y los reportes **no cambian**.<br>**Descartado:**<br>• una tabla aparte de sub-recetas, que sería un sistema paralelo;<br>• «explotar» la sub-receta al vender, que descontaría de nuevo lo crudo de un lote que ya se preparó |
| **D2** | **Su receta usa las tablas de recetas** | En `dk_recipes`:<br>• `ingredient_id` (opcional);<br>• `product_id` pasa a ser opcional;<br>• una regla exige que la receta tenga **o** plato **o** insumo;<br>• una sola versión activa por preparación, con el mismo versionado.<br>Rendimiento: `yield_quantity` (en la unidad base de la preparación) y lo que se escribió (`yield_unit_id`, `yield_unit_quantity`, p. ej. «1,2 kg»).<br>`dk_create_recipe_version` recibe el rendimiento, que es obligatorio en una preparación.<br>Una preparación puede llevar insumos crudos u **otras preparaciones**. Se rechazan los ciclos («A lleva B y B lleva A») y más de 5 niveles |
| **D3** | **Porciones** | Una unidad nueva en `dk_units`: **porción**. Es un empaque como caja: solo convierte con el factor propio del insumo.<br>Cada preparación puede decir «1 porción = 150 g», guardado en `dk_ingredient_purchase_units`, que ya existe. Un plato puede llevar «1 porción de ensalada base», y la pantalla muestra el **costo por porción** |
| **D4** | **Preparar un lote** | Tabla de cabecera `dk_production_batches`: es al lote lo que `dk_purchases` es a la COMPRA. Guarda:<br>• preparación y versión de receta;<br>• número de lotes;<br>• rendimiento esperado y **real**;<br>• costo total y por unidad;<br>• quién, cuándo, observación y estado.<br>RPC `dk_register_production(preparación, lotes, rendimiento real, unidad, observación)`, en una sola transacción:<br>1. verifica el stock **disponible** de cada componente, respetando las reservas; si falta, dice cuál;<br>2. registra una salida **PRODUCCION** por componente, a su costo promedio;<br>3. registra la entrada **PRODUCCION** de la preparación por el rendimiento real, a *costo total ÷ rendimiento real*;<br>4. recalcula el costo promedio ponderado de la preparación.<br>La diferencia entre el rendimiento real y el esperado se guarda y se muestra («−3,5 %»). Un rendimiento real menor encarece la unidad, como debe ser.<br>Valor nuevo del enum: `PRODUCCION`, que admite ambos signos. Va en su propia migración, porque Postgres no deja usar un valor nuevo de enum en la misma transacción |
| **D5** | **Descontar inventario una sola vez** | Lo crudo sale **al preparar el lote**; la preparación sale **al vender**, con el flujo actual.<br>• PRODUCCION **no** cuenta como costo de ventas: Insights y Finanzas no cambian y el costo de lo vendido sale al costo real de la salsa.<br>• Sugerencias de compra y señales de IA: el ritmo de consumo de un insumo crudo incluye lo que se gasta en lotes.<br>• Una preparación **no se compra** (se bloquea en las compras y en la importación) y no aparece como sugerencia de compra.<br>• Si está bajo su mínimo, se marca «Por preparar» |
| **D6** | **Costos** | El costo de un plato sigue siendo Σ cantidad × costo promedio. Para una preparación, ese costo promedio es el **costo real de sus lotes**.<br>Mientras no tiene stock (nunca se preparó o se acabó), el costo **sigue a su receta**: costo de la receta ÷ rendimiento. Se recalcula solo cuando cambia el precio de un componente, y el trigger existente lo pasa a los platos.<br>La pantalla muestra:<br>• costo teórico por unidad y por porción;<br>• costo real del último lote y promedio;<br>• rendimiento esperado contra real |
| **D7** | **Anular un lote** | `dk_void_production(lote, motivo)` crea los movimientos contrarios, si el stock de la preparación todavía alcanza. Si no alcanza, lo explica y sugiere una merma.<br>El lote queda **ANULADO**, con sus dos juegos de movimientos: nada se borra |
| **D8** | **Permisos** | Permiso nuevo **`inventory.produce`** («Preparar lotes»), para ADMIN, MANAGER, INVENTORY y KITCHEN.<br>Crear o editar una preparación exige `recipes.edit`.<br>El módulo Abastecimiento también se abre con `inventory.produce`, y la cocina ve **solo** Preparaciones.<br>La base de datos verifica cada permiso, no solo la pantalla |
| **D9** | **Interfaz** | **Abastecimiento → Preparaciones**, con lista y detalle como Stock y Compras.<br>• **Lista:** nombre, rendimiento, costo por unidad o porción, stock, «Por preparar» y «Usada en N».<br>• **Detalle:**<br>  – la **receta**, con sus unidades;<br>  – el **rendimiento**;<br>  – las **dependencias**: «Lleva» (árbol de componentes) y «Se usa en» (platos y otras preparaciones, directos e indirectos);<br>  – los **lotes**: historial con real contra esperado y costo;<br>  – el botón **Preparar lote**.<br>• **Preparar lote** (panel): número de lotes, lo que se va a descontar con su disponibilidad, rendimiento real y costo previsto.<br>• **Editor de la receta:** el mismo editor de recetas de platos, con los campos de rendimiento y porción.<br>• **Receta de un plato:** las preparaciones aparecen en la búsqueda con la etiqueta «Preparación» y la unidad porción.<br>• **Ficha de un insumo crudo:** «Se usa en» incluye preparaciones y los platos que lo llevan a través de ellas.<br>• **Mensaje al confirmar un pedido:** hoy muestra el id del insumo. Pasa a decir «Falta Salsa de ajo (hay 200 g, se necesitan 450 g): prepara un lote» |
| **D10** | **Menús maestros** | Las preparaciones son de cada cuenta. La sincronización de recetas maestras no cambia: si un código es una preparación en la cuenta, se usa como insumo |

## 3. Fases
| Fase | Qué |
|---|---|
| 1 · Base | Migración `dk_production_enum` (valor PRODUCCION).<br>Migración `dk_sub_recipes`:<br>• columnas;<br>• unidad porción;<br>• `dk_production_batches` con RLS por cuenta;<br>• `dk_create_recipe_version` con rendimiento y control de ciclos;<br>• `dk_register_production` y `dk_void_production`;<br>• costo teórico y su propagación;<br>• bloqueo de compras de preparaciones;<br>• `dk_supply_suggestions` y `dk_inventory_signals` con lo gastado en lotes;<br>• mensaje de stock con el nombre;<br>• permiso `inventory.produce`.<br>Pruebas SQL |
| 2 · Pantallas | Vista Preparaciones (lista, detalle, dependencias, lotes), Preparar lote y Anular, el editor de recetas generalizado, la búsqueda con preparaciones y porción, «Se usa en», y movimientos con «Producción» |
| 3 · Prueba | Ver la tabla siguiente, en SQL y en el navegador sobre un Supabase local, con capturas en `docs/qa/sub-recetas/` |
| 4 · Ayuda | Artículo «Preparaciones y sub-recetas», notas de versión y `dk-copilot` |

**Prueba de la fase 3:**

| Caso | Qué se verifica |
|---|---|
| **Sub-receta sencilla** | **Salsa de ajo** = 800 g de mayonesa + 0,05 **kg** de ajo (se guarda como **50 g**) + 10 g de sal. Rendimiento esperado: 850 g.<br>Un lote con rendimiento real de **820 g** → salen 800 g, 50 g y 10 g una vez; entran 820 g; costo por gramo = costo total ÷ 820 |
| **Reutilizada en tres platos** | Hamburguesa (30 g), Papas con salsa (40 g) y Wrap (1 **porción** = 25 g).<br>• El costo de cada plato incluye la salsa, sin copiarlo.<br>• Si sube el precio del ajo y se prepara otro lote, los tres platos se actualizan.<br>• Al vender uno de cada uno, sale solo la salsa (95 g) y **ningún** insumo crudo: el inventario se descuenta una sola vez |
| **Conversión de kg a g** | Comprar 1 **kg** de ajo → 1.000 g. La receta escrita en kg se guarda en g. El rendimiento escrito «1,2 kg» → 1.200 g |
| **Además** | Ciclo rechazado; preparación anidada (ensalada base dentro de un combo); anular un lote; falta de stock con mensaje claro; Finanzas e Insights con el mismo costo de ventas; permisos y aislamiento entre cuentas |

**Validación:**
- todas las suites SQL, incluidas `finance`, `insights`, `unit_conversion`, `master_menus` e `invoice_import`;
- Vitest;
- `tsc`, `oxlint` y las builds.

## 4. Riesgos
| Riesgo | Mitigación |
|---|---|
| Descontar dos veces | Lo crudo sale solo en el lote; lo preparado, solo en la venta. Hay pruebas que cuentan los movimientos exactos de cada insumo |
| Que los reportes cuenten la producción como venta o como merma | PRODUCCION es un tipo propio. Las funciones que filtran por tipo quedan revisadas, y hay pruebas de Finanzas e Insights con cifras iguales |
| Pedidos rechazados porque no se preparó el lote | Es la misma regla que hoy rige para cualquier insumo, pero con un mensaje claro y la marca «Por preparar» bajo el mínimo |
| Costos circulares | Los ciclos se rechazan al guardar y hay un límite de niveles |
| El valor nuevo del enum | Va en su propia migración, antes de la que lo usa |

## 5. Resultados (2026-10-12)

**Base de datos.** Dos migraciones, aplicadas en producción:
- `20261012120000_dk_production_enum.sql`: el valor `PRODUCCION`.
- `20261012120100_dk_sub_recipes.sql`:
  - `dk_ingredients.is_preparation`;
  - en `dk_recipes`: `ingredient_id`, `yield_quantity`, `yield_unit_id` y `yield_unit_quantity`, con un dueño (plato o preparación), una versión activa por preparación y la herencia de cuenta;
  - unidad **porción**, que solo convierte con el factor del insumo;
  - `dk_production_batches` (RLS por cuenta y sin escritura directa) y la regla de signo con PRODUCCION;
  - `dk_create_preparation` y `dk_create_preparation_version`, con control de ciclos y de 5 niveles;
  - `dk_register_production` y `dk_void_production`;
  - `dk_preparation_list`, `dk_preparation_detail`, `dk_preparation_tree` y `dk_ingredient_usage`;
  - el costo de una preparación sin stock sigue a su receta (`dk_trg_preparations_follow_cost`);
  - bloqueo de compras de preparaciones;
  - bloqueo de la marca y de la unidad base con historial;
  - `dk_supply_suggestions`, `dk_inventory_signals` y `dk_copilot_ingredients` cuentan lo gastado en lotes, neto de anulaciones, y nunca sugieren comprar una preparación;
  - el mensaje de stock insuficiente dice el nombre (antes, el id).
- **Diferencia con D2:**
  - una preparación se guarda con su propia función, `dk_create_preparation_version`;
  - `dk_create_recipe_version` conserva su firma y ambas comparten `dk_recipe_insert_items`, así que la app y Copilot no cambian.
- Permiso nuevo `inventory.produce` para ADMIN, MANAGER, INVENTORY y KITCHEN: 72 permisos, 60 de cuenta.

**Pantallas:**
- **Abastecimiento → Preparaciones:**
  - lista con «Por preparar» y «Sin receta»;
  - detalle con receta, costos (lote, unidad real y teórica, porción), «Lleva», «Se usa en» y lotes con anulación;
  - **Preparar lote**, con vista previa de lo que sale, la disponibilidad y el costo;
  - **Nueva preparación**.
- Cada sección de Abastecimiento se muestra según los permisos: la cocina ve solo Preparaciones.
- El editor de recetas es el mismo para platos y preparaciones (`RecipeForm`); en una preparación agrega rendimiento y porción.
- «Se usa en» de cualquier insumo incluye las preparaciones y los platos que lo llevan a través de ellas.
- El movimiento «Producción» aparece en los movimientos y en Actividad.
- Las preparaciones se marcan en Stock y quedan fuera de las compras y de la importación de facturas.

**Prueba.** SQL `sub_recipes` 48/48 en producción, y la misma cadena en el navegador sobre un Supabase local. Capturas en `docs/qa/sub-recetas/`.

| Caso | Resultado |
|---|---|
| Comprar ajo en kg | 1 kg → 1.000 g a $8/g |
| Salsa de ajo: 800 g + **0,05 kg** de ajo + 10 g; rinde **0,85 kg**; porción 25 g | Se guarda como 50 g y 850 g. Costo $10.020 por lote, $11,79/g, $295 por porción |
| Lote con rendimiento real de **0,82 kg** | Salen 800 + 50 + 10 g una vez y entran 820 g a $12,22/g (−3,5 %). Hay 4 movimientos ligados al lote |
| Tres platos: hamburguesa 30 g, papas 40 g, wrap «1 porción» | Cada plato toma el costo real de la salsa, sin copiarlo |
| Vender uno de cada uno | Sale solo la salsa (95 g → quedan 725 g). Mayonesa, ajo y sal no se mueven: se descuentan una sola vez |
| Ajo más caro y un segundo lote | Los tres platos se actualizan solos |
| Además | Anulación; lote ya usado que no se anula; faltantes con nombre; anidadas (ensalada base dentro de otra) con el costo que sigue a la receta; ciclos y 5 niveles; Finanzas (el costo de ventas sale del consumo, la producción no es venta ni merma); compras bloqueadas; permisos; aislamiento |

**Validación:**
- SQL contra producción: todas las suites pasan salvo las 3 fallas previas de `copilot_safety`, que dependen de la fecha y la zona horaria. Se actualizó `permission_catalog` por el permiso nuevo.
- Vitest: 813/813.
- `tsc`, `oxlint` (13 avisos de base) y las dos builds pasan.
- Ayuda: artículo «Preparaciones y sub-recetas», enlace desde Recetas y notas de versión. `dk-copilot` desplegado.
