# ADR 0048: Platos sin receta, que no afectan el abastecimiento

## Estado
**Aprobada e implementada (2026-10-10).**

**Pedido:** que haya platos sin receta asignada y que no afecten el abastecimiento.

---

## 1. Auditoría
| Hoy | Qué significa |
|---|---|
| **Una sola regla** en toda la base: `dk_confirm_order` rechaza el pedido con «El plato … no tiene una receta activa; no se puede confirmar el pedido» | Es lo único que hay que cambiar en el flujo |
| Al confirmar, reserva los insumos con un `join` a los ingredientes de la receta | Si el plato no tiene receta, no hay filas que reservar: no reserva nada |
| Al pasar a «Listo» se descuentan las reservas activas; al retroceder o al cancelar tarde se devuelven; al cancelar se liberan (`dk_advance_kitchen_item`, `dk_revert_kitchen_item`, `dk_cancel_order`) | Trabajan sobre las reservas, no sobre la receta. Sin reservas no hay movimientos: **el abastecimiento no se toca** |
| Sugerencias de compra (`dk_supply_suggestions`) | Salen de los consumos. Un plato sin receta no aporta nada, que es lo correcto |
| Pedidos por WhatsApp (`dk_today_menu`) | No filtran por receta |
| Insights | Un plato sin receta cuenta sus ventas y figura «sin costo registrado», con el aviso de que el margen puede estar sobreestimado |
| **Copilot** (`dk_copilot_products`) | Calcula el margen con un costo de 0: para un plato sin receta dice **100 %**. Es un error que este cambio vuelve más común |
| Platos de un menú maestro sin ingredientes | Llegan a cada cuenta sin receta, y la cuenta no puede crearles una. Hoy no se pueden vender |
| Ayuda | 7 artículos dicen que un plato sin receta no se puede confirmar |
| `dk_products` | No tiene ninguna columna que diga «no usa inventario». La única señal es que no tenga receta |

## 2. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | ¿Cómo se marca? | **Una opción explícita por plato**: «**Descuenta inventario**», encendida por defecto (`dk_products.uses_inventory`). Apagada, el plato **no necesita receta** y **nunca** reserva ni descuenta, aunque tenga una (por ejemplo, una bebida que no controlas).<br>Encendida y sin receta, se sigue rechazando como hoy, para que olvidar una receta no deje de descontar en silencio.<br>*Alternativa: «sin receta = no descuenta», sin opción. Es más simple, pero un plato al que se le olvidó la receta dejaría de descontar sin que nadie lo note* |
| **D2** | Dónde se cambia | En el plato (Catálogo → Editar plato): un interruptor «Descuenta inventario» con su explicación. Cuando está apagado, la tarjeta del catálogo dice **«No usa inventario»** en lugar de «Sin receta» (en gris, no en ámbar) |
| **D3** | La confirmación | `dk_confirm_order` se recrea conservando sus cambios anteriores (permiso `orders.confirm` y cuenta activa). Exige receta solo si `uses_inventory`. Los platos que no usan inventario no congelan receta ni reservan nada. El mensaje de error da **el nombre del plato**, no su id, y dice cómo resolverlo: «La Hamburguesa Clásica no tiene receta. Créala o apaga «Descuenta inventario» en el plato» |
| **D4** | Costos y márgenes | Insights ya lo trata bien (sin costo registrado). **Copilot**: un plato sin costo devuelve margen **vacío**, no 100 %, y dice si usa inventario. El editor de recetas y la ficha del plato muestran «No usa inventario» |
| **D5** | Menús maestros | El menú maestro tiene la misma opción, y se copia a los platos de cada cuenta al sincronizar. Un plato maestro sin ingredientes se puede marcar «No usa inventario» y venderse |
| **D6** | Consumer | Un plato que no usa inventario no tiene ingredientes que mostrar (como hoy, sin receta). No cambia nada más |
| **D7** | Ayuda | Los 7 artículos y las notas de versión, y desplegar `dk-copilot`. El manual no se toca |

## 3. Fases
| Fase | Qué |
|---|---|
| 1 · Base | Migración `dk_products_uses_inventory`:<br>• la columna, con `true` para todos los platos de hoy (no cambia nada para ellos);<br>• la misma columna en los platos maestros, copiada al sincronizar;<br>• `dk_confirm_order` recreado (D3);<br>• `dk_copilot_products` con margen vacío sin costo y `usesInventory`;<br>• `dk_storefront_get` sin cambios.<br>Pruebas SQL nuevas |
| 2 · App | El interruptor en `DishFormDrawer` (y en el plato maestro). «No usa inventario» en la tarjeta del catálogo, en el editor de recetas y en el detalle del pedido (sin «insumos reservados»). Tipos |
| 3 · Ayuda | Artículos, notas y despliegue |
| — | **Validación (SQL):**<br>• confirmar un pedido con un plato que no usa inventario: no reserva nada;<br>• pasarlo a «Listo», retrocederlo y cancelarlo: cero movimientos;<br>• un pedido mixto reserva solo lo del plato con receta;<br>• un plato que descuenta inventario y no tiene receta se sigue rechazando, con el mensaje nuevo;<br>• permisos y cuenta sin cambios;<br>• la sincronización del menú maestro;<br>• el margen de Copilot vacío.<br>**Además:** Vitest, `tsc`, `oxlint`, builds y el navegador sin guardar datos |

## 4. Riesgos
| Riesgo | Mitigación |
|---|---|
| Un plato con insumos marcado «no usa inventario» por error deja de descontar | Es explícito y se ve en el catálogo («No usa inventario»). Por defecto está encendido |
| Que el margen parezca de 100 % | Copilot deja de decirlo; Insights ya avisa «sin costo registrado» |
| Recrear `dk_confirm_order` sin los cambios de migraciones anteriores | Se parte del cuerpo actual en la base (`pg_get_functiondef`), no del archivo original |

## 5. Resultados (2026-10-10)
| Fase | Qué quedó |
|---|---|
| 1 · Base | Migración `20261010100000_dk_products_uses_inventory` (aplicada; era la única pendiente):<br>• `dk_products.uses_inventory` y `dk_master_products.uses_inventory`, en `true` por defecto. Los 3 platos de hoy siguen descontando;<br>• `dk_confirm_order` recreado desde el cuerpo vigente en la base (cuenta activa y `orders.confirm` se conservan). Exige receta solo si el plato descuenta inventario. El error da el nombre del plato y cómo resolverlo, con un texto propio para los platos de un menú maestro;<br>• `dk_guard_master_product`: la cuenta no cambia la opción en una copia del maestro;<br>• `dk_sync_master_menu_kitchen` copia la opción;<br>• `dk_save_master_product` recibe `p_uses_inventory` al final, con valor por defecto, así que las llamadas de antes siguen sirviendo. Se recreó con los mismos permisos;<br>• `dk_copilot_products`: sin receta no hay costo ni margen (antes, 100 %). Además devuelve `usesInventory` y `hasRecipe`.<br>Tipos regenerados |
| 2 · App | **Descuenta inventario** en Editar plato, con una explicación que cambia según el estado. En un plato del maestro está deshabilitado («Lo define el menú maestro»).<br>• Catálogo: «No usa inventario» en gris, en lugar de «Sin receta» en ámbar.<br>• Editor de recetas: la etiqueta y un aviso de que la receta solo sirve para ver el costo.<br>• Menús maestros: el interruptor en el plato, la lista dice «No usa inventario» y el texto «Sin receta» depende de la opción.<br>• Confirmar pedido: el aviso habla de los platos que descuentan inventario.<br>• Detalle del pedido: la tarjeta «Insumos» ya se ocultaba cuando no hay reservas, así que no hubo que cambiarla |
| 3 · Ayuda | Los 7 artículos (`dishes-and-menu`, que gana la sección «Platos sin receta»; `recipes-and-cost`, `setup-account`, `inventory-deduction`, `confirm-cancel`, `faq` y `concepts`) y las notas de versión. La descripción de la herramienta `products` de Copilot explica `usesInventory`. `dk-copilot` está desplegada. `docs/01-database-erd.md` actualizado. El manual no se tocó |

**Validación:**
- SQL: suite nueva `dishes_without_recipe` **24/24**:
  - un pedido con solo un plato sin inventario se confirma y no reserva nada;
  - el pedido mixto reserva solo la hamburguesa (300 g), y un postre con receta pero sin inventario no congela receta;
  - preparar, retroceder y volver a preparar sin inventario deja cero movimientos;
  - al terminar el pedido mixto hay un solo consumo de 300 g;
  - cancelar un pedido listo sin inventario no genera devolución ni lo marca para revisar;
  - un plato que descuenta inventario y no tiene receta se rechaza con su nombre, y se confirma al apagar la opción;
  - Copilot no da margen sin receta y sí lo calcula con ella (92,5 %);
  - alguien de otra cuenta no puede confirmar.
- `master_menus` **21/21**: 4 pruebas nuevas. La copia llega sin inventario; un plato guardado sin la opción sigue descontando; la cuenta no puede cambiarla; encenderla en el maestro la enciende en la cuenta.
- `multikitchen_isolation` 72/72, `copilot_tools` 35/35, `copilot_safety` 34/34, `insights` 21/21, `orders_search` 12/12, `permission_catalog` 24/24 y `consumer_public` 52/52, todas con la migración.
- Vitest: **674**.
  - `DishFormDrawer.test` (nuevo): un plato nuevo descuenta por defecto y se puede apagar al crearlo; al editar se conserva y se puede volver a encender; en un plato del maestro está deshabilitado.
  - `RecipeEditorPage.test`: el aviso «No usa inventario».
- `tsc`, `oxlint` (13 avisos, los mismos de antes), los dos builds y la revisión de tipos de las funciones.
- Navegador: **no se revisó**. La sesión guardada para pruebas venció, y no se inicia sesión por el usuario.

