# ADR 0069: Recetas sin depender del inventario e insumos creados desde la receta

## Estado
**Implementada (2026-10-18).** Se pidió en la conversación («Desacoplar recetas del inventario y crear ingredientes desde recetas»). Revisa el ADR 0002 (punto de consumo). Las decisiones de producto las tomó el usuario:
- el inventario se descuenta al iniciar cada plato;
- el stock se valida al confirmar y otra vez al iniciar;
- quien edita recetas puede crear insumos;
- la migración queda local: el usuario la aplica en producción.

## Contexto (auditoría)
**Recetas e insumos:**
- Guardar una receta (`dk_create_recipe_version`) nunca exigió stock.
- Pero la receta solo podía usar insumos que ya existieran: el selector del editor no permitía crear uno.
- Los nombres de insumo no eran únicos (solo `(kitchen_id, code)`). Solo la importación de facturas evitaba duplicados por nombre (`dk_match_key`).

**Fila de stock:**
- Un insumo nuevo no tenía fila en `dk_ingredient_stock` hasta su primer movimiento.
- El trigger de reservas solo hacía `UPDATE`, así que una reserva sobre un insumo sin fila no quedaba registrada en ningún lado.

**Ciclo del pedido (ADR 0002):** se reservaba al confirmar y se consumía al marcar cada plato Listo. La auditoría encontró, sin pruebas que lo cubrieran:
- devolver un plato desde Listo y volver a marcarlo listo nunca lo descontaba otra vez;
- devolverlo y luego cancelar devolvía los insumos **dos veces**;
- cancelar sobrescribía el aviso «Revisar» en lugar de conservarlo;
- marcar listo y cancelar al mismo tiempo no estaban serializados.

## Decisión

### 1. Toda fila de stock existe desde el inicio
- Un trigger `after insert` en `dk_ingredients` crea la fila de stock en cero.
- La migración completa las filas que faltaban.
- No se inventan movimientos: el stock solo sube con una compra confirmada.
- La reserva hace upsert sobre la fila.

### 2. `dk_create_ingredient` es el único camino para crear un insumo
- Lo usan el inventario, la compra y la receta.
- **Permiso:** `inventory.create` **o** `recipes.edit` (decisión del usuario). El insumo nace en cero y sin costo, así que no mueve nada.
- **Un nombre por cuenta,** con la misma clave que la importación (`dk_match_key`): «Tomate», «tomate » y «Tomáte» son el mismo.
  - Si ya existe, falla con `hint duplicate_ingredient` y el id del existente en `detail`. La pantalla ofrece «Usar "…"».
  - Renombrar un insumo hacia un nombre que ya existe también se rechaza (trigger `before update of name`).
- **Unidad base real:** g, kg, ml, l, unidad o docena. Caja, bolsa, paquete y porción no son unidad base; se configuran después como empaques. El formulario de inventario solo las muestra si el insumo ya tenía una.
- **Código:** si viene vacío se genera (`INS-001`, `INS-002`…). Se validan además los límites de stock (mínimo y máximo) y que la categoría sea de la cuenta.

### 3. Editor de recetas
- En el selector de insumo aparece «Crear el insumo "…"» para quien puede editar la receta.
- Abre el formulario corto (nombre, código opcional, unidad base, stock mínimo) y el insumo queda seleccionado en esa línea, sin salir de la receta.
- La receta conserva sus cantidades y unidades. No depende del stock.

### 4. Ciclo del inventario (revisa el ADR 0002)

| Momento | Qué pasa |
|---|---|
| Confirmar | Reserva y valida el disponible, sin cambios |
| Plato → `EN_PREPARACION` | Valida que el stock en mano cubra lo reservado (si no, `insufficient_stock` con nombre y cantidades, y el plato no empieza). Luego la reserva `ACTIVE → CONSUMED` y el movimiento `CONSUMO` al costo promedio |
| Plato → `LISTO` | No mueve nada |
| Plato → `PENDIENTE` (devuelto) | `DEVOLUCION` de lo consumido; la reserva vuelve a `ACTIVE` y el pedido pide revisión. Devolverlo de Listo a Preparando no mueve nada |
| Cancelar | `ACTIVE → RELEASED`. `CONSUMED → RELEASED` con su `DEVOLUCION`, una sola vez. `requires_review` se conserva (OR) |

Cómo se evita el doble descuento o la doble devolución:
- Solo una reserva `ACTIVE` se consume y solo una `CONSUMED` se devuelve, y el `UPDATE` vuelve a comprobar el estado.
- `dk_advance_kitchen_item` y `dk_revert_kitchen_item` bloquean primero el pedido (como `dk_cancel_order`) y luego el plato, así que las transiciones concurrentes se serializan.
- El trigger de reservas suma de nuevo lo reservado en `CONSUMED → ACTIVE`.

**Nunca negativo:** el descuento valida el stock en mano bajo bloqueo de la fila. No se cambió nada en mermas, ajustes ni conteos.

### 5. Compras y costos
Sin cambios: `dk_confirm_purchase` suma stock y recalcula el costo promedio. Si el stock previo es ≤ 0, el costo de la compra pasa a ser el promedio.

Insights sigue calculando el costo real como `CONSUMO 'order_item' − DEVOLUCION 'order_item_revert'`, así que empezar, devolver y empezar de nuevo cuenta un solo consumo.

## Verificación
- **SQL:** suite `recipes_decoupled_stock` 41/41:
  - insumo creado por quien solo edita recetas, en cero y sin movimientos;
  - duplicados por mayúsculas, tildes o espacios;
  - caja como unidad base, nombre vacío, límites, código repetido, Cocina sin permiso y renombrar sobre otro nombre;
  - receta con un insumo existente y uno nuevo (0,05 kg conservado);
  - confirmación rechazada sin stock; compra que sube stock y costo;
  - consumo al iniciar (2 unidades × receta); Listo no mueve nada;
  - devolver de Listo y de Preparando; volver a iniciar; cancelar después de empezar;
  - empezar, devolver y cancelar (una sola devolución);
  - sin stock al iniciar (mensaje, el plato no empieza y no hay negativos).
- **Suites con inventario siguen verdes:** `unit_conversion`, `dish_composition`, `sub_recipes`, `finance`, `invoice_import`, `cost_controls`, `insights`, `public_menu`, `whatsapp_*`.
- **Vitest:**
  - crear un insumo desde la receta, sin salir y sin cajas como unidad base;
  - quien no edita la receta no ve «Crear»;
  - `canBeBaseUnit`.
- **Navegador (stack local):**
  - receta desde cero con «Carne de res» (g) y «Pan brioche» (unidad), creados como INS-001 e INS-002, en cero, sin movimientos;
  - «carne de rés» rechazada con «Usar "Carne de res"»;
  - receta guardada como v1.
- **Documentación:**
  - centro de ayuda (Cómo se descuenta el inventario, Vista Cocina, Recetas, Conceptos, FAQ, Primer pedido, Stock, Platos, Composición, Novedades);
  - base de conocimiento de Copilot regenerada;
  - `docs/01`, `docs/02`, `docs/03`, ADR 0002 y ADR 0004.
