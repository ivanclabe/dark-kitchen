# Auditoría — CANCELADO, Drag & Drop bidireccional, voz corta, solicitante, tiempo y SLA configurable

Alcance: extender el Kanban ya aprobado (no rediseñarlo). Cambios en: modelo de datos (1 migración nueva), voz, drag & drop, Kanban card, y un panel de configuración nuevo (no existía ninguno). Grid/Lista/SLA no se tocan salvo el formato de tiempo (mejora transversal ya cubierta por `ticketVisuals.ts`, no es un rediseño).

---

## 1. Cómo está implementado hoy (hallazgos de la auditoría)

- **El enum de estados YA incluye CANCELADO**: `dk_order_status = ('NUEVO','CONFIRMADO','EN_PREPARACION','LISTO','DESPACHADO','ENTREGADO','CANCELADO')` (`supabase/migrations/20260912232735_dk_orders_schema.sql`). El módulo Cocina simplemente nunca lo mira: `KitchenOrderStatus` (`src/modules/kitchen/types/index.ts`) es un subconjunto reducido a `CONFIRMADO|EN_PREPARACION|LISTO`, y `listKitchenQueue` filtra explícitamente `.in('status', [...])` a esos 3.
- **Ya existe un RPC de cancelación completo y correcto**: `dk_cancel_order(p_order_id, p_reason)`. Libera reservas de inventario activas, o si el insumo ya fue consumido (plato ya preparado), inserta un movimiento `DEVOLUCION` compensatorio y marca `requires_review = true` para que un admin lo revise. Permite cancelar desde cualquier estado excepto `CANCELADO`/`ENTREGADO`. **Está restringido a roles ADMIN/MANAGER/CASHIER — KITCHEN no puede llamarlo hoy.**
- **No existe ningún RPC para retroceder un estado.** `dk_advance_kitchen_item` (el único que cambia el estado de un ítem/pedido desde Cocina) solo avanza: `PENDIENTE→EN_PREPARACION→LISTO`, y cuando un ítem llega a `LISTO` **consume inventario de forma permanente** (mueve la reserva `ACTIVE→CONSUMED` e inserta un movimiento `CONSUMO` negativo). No hay una función "deshacer" a nivel de base de datos. Esto es lo más importante de esta auditoría — lo detallo en la sección 4.
- **Los comandos de voz cortos YA funcionan hoy, sin cambios.** Verifiqué el parser actual (`commandParser.ts`): la palabra "Pedido" nunca fue obligatoria — el regex busca cualquier número de 4 dígitos en el transcript (`/\b(\d{4})\b/g`) y las acciones por palabras clave en cualquier parte del texto. "1004 listo" ya produce hoy `{orderCode:"1004", action:"MARK_READY"}` exactamente igual que "Pedido 1004 listo". Solo falta agregar la acción `CANCELAR` al set de patrones — no hay que tocar la arquitectura del parser ni el buffer/debounce (`VOICE_COMMAND_DELAY_MS`, ya en 1800ms, se mantiene igual).
- **El nombre de quien pidió ya existe y ya se usa**: `dk_customers.full_name` vía `dk_orders.customer_id`, mapeado a `KitchenTicket.customerName`. Ya se muestra en Grid y Lista. **Falta en el card compacto del Kanban** (`KanbanCardBody.tsx`) — lo omití en la iteración anterior por priorizar densidad; lo agrego ahora de forma compacta, una sola línea.
- **No existe ningún módulo/tabla de configuración en toda la app.** Los únicos "settings" son toggles sueltos en `localStorage` (sonido, TTS, vista preferida). No hay patrón que extender — es infraestructura nueva, pero pequeña.
- **Sigue sin haber Supabase Realtime** (reconfirmé el grep). "Tiempo real" sigue siendo el polling de 15s ya existente.
- **`canTransition`/reglas de transición**: hoy solo existe `isForwardTransition` en `kanban/transitions.ts` (creado en la iteración anterior), que valida transiciones hacia adelante entre las 3 columnas. No contempla CANCELADO ni retroceso — lo extiendo, no lo reemplazo.

## 2. Decisión importante — el retroceso de estado necesita una función nueva en la base de datos

No puedo "reutilizar" una función de reversa porque no existe ninguna. Esto no es una limitación de mi implementación — es un vacío real en el backend. Para no duplicar lógica de negocio ni inventar un mecanismo paralelo, propongo una función nueva **simétrica** a la que ya existe, seleccionable en tu revisión antes de tocar código:

```sql
create or replace function dk_revert_kitchen_item(p_order_item_id uuid)
returns void
security definer
```

Comportamiento (espejo de `dk_advance_kitchen_item`, pero hacia atrás):

- Mismos roles autorizados: ADMIN/MANAGER/KITCHEN.
- Solo opera si el pedido está en CONFIRMADO/EN_PREPARACION/LISTO (igual que el avance — no se puede tocar un pedido ya DESPACHADO/ENTREGADO/CANCELADO).
- `LISTO → EN_PREPARACION`: como el insumo ya fue **consumido permanentemente** al llegar a LISTO, retroceder inserta un movimiento `DEVOLUCION` compensatorio por cada reserva `CONSUMED` de ese ítem (exactamente el mismo patrón que ya usa `dk_cancel_order` para "devolver" inventario ya consumido) y marca `requires_review = true` en el pedido, para que quede auditable que alguien corrigió una preparación ya consumida. La reserva permanece histórica como `CONSUMED` (no se "resucita"); el ajuste de stock ocurre vía el movimiento compensatorio, igual que en cancelación tardía.
- `EN_PREPARACION → PENDIENTE`: sin impacto de inventario (la reserva se creó al confirmar el pedido y sigue `ACTIVE` durante todo este rango — igual que hoy al avanzar de PENDIENTE a EN_PREPARACION tampoco toca inventario).
- Estado del pedido: en vez de replicar la lógica asimétrica "primer ítem dispara/todos-listos dispara" del RPC de avance, la recalculo con una regla simple y comprobablemente equivalente: *todos PENDIENTE → CONFIRMADO*, *todos LISTO → LISTO*, *cualquier mezcla → EN_PREPARACION*. Es la misma invariante que ya cumple el RPC de avance, solo que evaluada explícitamente en vez de optimizada por casos.
- Registra en `dk_order_status_history` igual que el resto.

El hook de cliente (`useRevertTicketItems`) sería el espejo exacto de `useAdvanceTicketItems` (mismo patrón de loop secuencial por ítem, nunca en paralelo), permitiendo saltos de más de un paso hacia atrás (p. ej. LISTO → CONFIRMADO se resuelve llamando la reversa dos veces por ítem), igual que hoy `advanceTicketItems` permite saltar directo de CONFIRMADO a LISTO.

**Esto es la parte que más quiero que confirmes antes de escribir código**, por ser inventario/dinero real.

## 3. Cancelar — reutilizando el RPC existente, con un cambio de permisos explícito

`dk_cancel_order` ya hace exactamente lo que necesito (libera o devuelve inventario, marca historial). Lo reutilizo tal cual desde Cocina — **pero hoy KITCHEN no está en su lista de roles autorizados**. Para que cancelar por voz/drag/botón funcione desde el Kanban de Cocina, necesito ampliar esa única línea:

```sql
if dk_current_role() not in ('ADMIN','MANAGER','CASHIER') then  -- hoy
if dk_current_role() not in ('ADMIN','MANAGER','CASHIER','KITCHEN') then  -- propuesto
```

Ningún otro cambio a esa función. Lo señalo explícitamente porque es un cambio de permisos, no solo de UI.

**CANCELADO es terminal dentro del Kanban**: igual que `dk_cancel_order` ya rechaza cancelar dos veces, no voy a permitir arrastrar/decir un pedido *fuera* de CANCELADO — no existe (ni debería inventarse) un "descancelar". Coherente con que ENTREGADO tampoco es reversible hoy.

## 4. Columna CANCELADO — fuente de datos separada (para no tocar Grid/Lista/SLA)

Si simplemente amplío `listKitchenQueue` (la query que ya alimentan Grid/Lista/SLA/las 3 columnas activas) para incluir CANCELADO, esas 3 vistas empezarían a mostrar pedidos cancelados sin que lo hayas pedido — Grid y Lista son para gestionar pedidos *activos*, no un archivo histórico (eso ya existe en el módulo Pedidos, pestaña "Cancelado").

Por eso propongo una **query independiente, solo para la columna CANCELADO del Kanban**: `listCancelledKitchenQueue()`, acotada a pedidos cancelados **hoy** (no todo el historial — evita que la columna crezca sin límite y "domine visualmente" como pediste evitar). Incluye un join a `dk_order_status_history` para mostrar cuándo se canceló y el motivo, si lo hay.

`useKitchenQueue` (Grid/Lista/SLA/columnas activas) **no cambia en absoluto**.

## 5. Voz — qué agrego realmente

- Nueva acción `CANCEL` en `VoiceAction`, con patrones `/cancelad[oa]/i` y `/\bcancelar\b/i` (sin colisión con los patrones existentes).
- El motor de voz (`useVoiceCommandEngine`) gana un `case 'CANCEL'` que llama a la misma función que usarán el botón manual y el drag & drop — cero lógica nueva ahí.
- El formato corto ("1004 cancelado") **ya funciona** por diseño del parser actual, como expliqué en la sección 1 — no hay cambios de arquitectura de voz, solo la acción nueva.
- **Aclaración de alcance — "despachado" por voz**: tu checklist de pruebas (punto 27) menciona "1004 despachado". La columna DESPACHADO fue deliberadamente excluida del Kanban de Cocina en la iteración anterior (aprobada) porque es responsabilidad del módulo Despachos, no de Cocina. No voy a agregar esa acción de voz en esta iteración, salvo que me confirmes que sí quieres que Cocina despache (en cuyo caso reutilizaría el RPC de Despachos ya existente, sin duplicar tampoco ahí). Si no dices nada, entiendo que esto queda fuera de alcance y sigo con el resto.

## 6. Drag & Drop bidireccional

`transitions.ts` pasa de `isForwardTransition` a un `canTransition(from, to)` centralizado:

```ts
const SEQUENCE = ['CONFIRMADO', 'EN_PREPARACION', 'LISTO'] // el orden de columnas no cambia

function canTransition(from, to) {
  if (from === to) return false
  if (from === 'CANCELADO') return false          // terminal
  if (to === 'CANCELADO') return true              // cualquier activo puede cancelarse
  return SEQUENCE.includes(from) && SEQUENCE.includes(to)  // avanzar o retroceder libremente entre las 3 activas
}
```

`useKanbanDragDrop` decide, según si `to` está adelante o atrás de `from` en `SEQUENCE`, si llama `advanceTicketItems` (ya existe), `revertTicketItems` (nuevo, sección 2) o `cancelKitchenOrder` (nuevo wrapper delgado sobre el RPC existente, sección 3) — un único punto de entrada (`runTransition`) usado por drag, botón manual y voz, como pediste explícitamente.

Nada cambia en cómo se maneja el error/reversión visual: sigue sin haber estado optimista propio (ya lo señalé en la auditoría anterior) — si la mutación falla, se muestra el toast y el próximo poll (15s) refleja el estado real; el mismo mecanismo ya cubre "drag mientras llega un poll" y "doble ejecución" porque cada botón/drag ya deshabilita mientras su mutación está `isPending`.

## 7. Card del Kanban — cambios visuales

- Agrego el nombre del cliente en una línea compacta bajo el header (mismo patrón que ya usan Grid/Lista), sin convertirlo en elemento dominante.
- Tiempo transcurrido: nueva función `formatElapsed(minutesAgo)` en `ticketVisuals.ts` — `< 60` → `"37 min"`, `>= 60` → `"1h 04m"`. La uso en Kanban, Grid, Lista y SLA (mismo lugar de siempre, cero duplicación) ya que las 4 vistas comparten esa utilidad.
- Card de CANCELADO: visualmente igual de compacto, acento rojo discreto en el borde (reutilizo `bg-red-500/20 text-red-400`, el mismo rojo que ya usa el módulo Pedidos para CANCELADO — consistencia visual entre módulos), sin botón de avance (es terminal), sin badge de prioridad activo, muestra "cancelado hace Xh Ym" en vez de tratarlo como pedido activo con alerta — no genera warning de SLA (`timeTier` no se evalúa para CANCELADO).
- Columna CANCELADO: mismo header compacto `CANCELADO · N`, mismo patrón de columna que las demás, con su propio ícono (`XCircle` de lucide, ya en el paquete) y color de acento rojo solo en el ícono/badge del header, no en el fondo de la columna completa.

## 8. Configuración de umbrales SLA — módulo nuevo, mínimo

No existe nada que extender, así que propongo la solución más chica posible:

- **Una tabla singleton** `dk_kitchen_sla_settings` (una sola fila, id fijo) con: `confirmado_alert_min`, `en_preparacion_alert_min`, `listo_alert_min` (minutos hasta "fuera de SLA", reemplazan los `TIME_WARN_MIN`/`TIME_LATE_MIN` globales actuales que hoy aplican el mismo umbral a los 3 estados) y `near_threshold_pct` (a partir de qué % del umbral se considera "cerca del límite" — hoy no configurable, lo agrego). RLS: todos los roles con acceso a Cocina pueden leer (lo necesitan para pintar los cards); solo ADMIN/MANAGER pueden actualizar.
- **Sin ruta ni módulo nuevo en la navegación**: un ícono de engranaje en el header de Cocina (mismo lugar que el toggle de sonido/voz) abre un `Modal` (componente ya existente) con el formulario — reutiliza `inputClass`/`labelClass`/`primaryButtonClass` del Design System. Gateado client-side a ADMIN/MANAGER (la RLS es la barrera real).
- `timeTier()` deja de usar `TIME_WARN_MIN`/`TIME_LATE_MIN` fijos y recibe el umbral correspondiente al estado del ticket, más el porcentaje "near" — misma función, misma firma conceptual, ahora parametrizada en vez de hardcodeada.

## 9. Qué NO cambia (verificado explícitamente)

- Grid, Lista y SLA no reciben pedidos CANCELADO (sección 4) — no hay rediseño ni filtro nuevo que mantener ahí.
- El cálculo de métricas de la vista SLA (`getSlaSummary`) no necesita cambios: ya se basa en transiciones a `LISTO` en `dk_order_status_history`; un pedido cancelado después de llegar a LISTO es un caso extremo que no distorsiona el promedio de forma relevante, y no es lo que pediste tocar.
- El buffer/debounce de voz (1.8s), el sistema de prioridad, el toggle TTS/sonido, `useKitchenQueue` (Grid/Lista/SLA) — sin cambios.
- Performance: el tick de tiempo sigue en 30s (`useNow`), `KanbanTicketCard` sigue memoizado — ya cumple lo pedido, no requiere trabajo adicional.

## 10. Archivos a crear/modificar

**Nuevos:**
- `supabase/migrations/2026...__dk_kitchen_revert_and_sla_settings.sql` — RPC `dk_revert_kitchen_item`, ampliar roles de `dk_cancel_order`, tabla `dk_kitchen_sla_settings` + RLS + seed.
- `src/modules/kitchen/api/kitchenSettings.ts` — leer/actualizar umbrales.
- `src/modules/kitchen/hooks/useKitchenSettings.ts`
- `src/modules/kitchen/components/KitchenSettingsModal.tsx`
- `src/modules/kitchen/kanban/CancelledColumn.tsx` (o extender `KanbanColumn` genérico — decido al implementar según cómo quede más limpio)

**Modificados:**
- `src/modules/kitchen/types/index.ts` — `KitchenOrderStatus` incluye `'CANCELADO'`.
- `src/modules/kitchen/api/kitchen.ts` — `listCancelledKitchenQueue()`, `cancelKitchenOrder()`, `revertKitchenItem()`.
- `src/modules/kitchen/hooks/useKitchen.ts` — hooks correspondientes + `useRevertTicketItems`.
- `src/modules/kitchen/lib/ticketVisuals.ts` — `formatElapsed()`, `timeTier()` parametrizado, `ORDER_STATUS_CONFIG.CANCELADO`.
- `src/modules/kitchen/kanban/transitions.ts` — `canTransition()`.
- `src/modules/kitchen/kanban/useKanbanDragDrop.ts` — soporte bidireccional + cancelación.
- `src/modules/kitchen/kanban/KanbanTicketCard.tsx`, `KanbanCardBody.tsx` — nombre del cliente, card de cancelado.
- `src/modules/kitchen/views/KanbanView.tsx` — 4ta columna.
- `src/modules/kitchen/voice/commandParser.ts` — acción `CANCEL`.
- `src/modules/kitchen/voice/useVoiceCommandEngine.ts` — case `CANCEL`.
- `src/modules/kitchen/pages/KitchenPage.tsx` — ícono de configuración.
- Tests: `commandParser.test.ts` (cancelar + formato corto), `transitions.test.ts` (bidireccional + cancelar + terminal).

## 11. Plan de implementación

1. Migración SQL (RPC reversa, permisos de cancelación, tabla de settings) — la reviso yo mismo con cuidado antes de aplicarla.
2. `ticketVisuals.ts`: formato de tiempo + thresholds parametrizados + entrada CANCELADO.
3. `types`/`api`/`hooks` de Cocina: CANCELADO, revertir, cancelar, settings.
4. `transitions.ts` (`canTransition`) + tests.
5. `commandParser.ts` (acción CANCEL) + tests + `useVoiceCommandEngine`.
6. Kanban: 4ta columna, card con nombre de cliente, drag bidireccional.
7. Modal de configuración SLA.
8. Verificación manual completa (drag adelante/atrás/cancelar, voz corta y con "Pedido", formato de tiempo, alertas configurables, Grid/Lista/SLA sin regresión, responsive) + tsc/lint/test/build.

---

Quedo pendiente de tu aprobación, especialmente sobre la sección 2 (RPC de reversa e inventario) y la aclaración de la sección 5 (voz "despachado" fuera de alcance salvo que digas lo contrario).
