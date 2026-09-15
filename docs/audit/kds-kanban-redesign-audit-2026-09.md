# Auditoría — Reestructuración profunda del Kanban de Cocina

Alcance confirmado: **solo la vista Kanban** (`src/modules/kitchen/views/KanbanView.tsx`). Grid, Lista y SLA no se tocan. No se crean nuevos estados de negocio, no se duplica ninguna mutación existente.

---

## 1. Cómo funciona el Kanban actualmente

- `KanbanView.tsx` agrupa `tickets` en 3 columnas fijas (`CONFIRMADO`, `EN_PREPARACION`, `LISTO` — `DESPACHADO` queda fuera a propósito, es dominio de Despachos) usando `useMemo`, y por cada ticket renderiza el mismo `TicketCard` que usan **Grid y Lista**.
- `TicketCard` es un componente pensado para Grid (pantalla grande, pocos tickets por fila): header con nombre+badges, tiempo transcurrido, notas, **una fila completa por cada producto** (nombre, cantidad, observación, badge de estado del ítem, botón "Iniciar"/"Marcar listo"), y al final dos botones de texto completo ("Iniciar todo" / "Marcar todo listo") más el botón de prioridad ("Prioritario" / "Quitar prioridad").
- El header de columna ya es compacto (`ESTADO · N`), eso no cambia.
- Toda la lógica de mutación pasa por `useAdvanceKitchenItem`, `useAdvanceTicketItems` y `useSetTicketPriority` (`src/modules/kitchen/hooks/useKitchen.ts`) → RPCs de Supabase (`dk_advance_kitchen_item`, `dk_set_ticket_priority`). Es la única fuente de verdad y la reutiliza también el motor de voz.
- No existe ninguna librería ni lógica de drag & drop en el proyecto (confirmado por búsqueda global).

## 2. Problemas visuales/UX encontrados

- **Cards demasiado altos para un Kanban**: al reutilizar `TicketCard` tal cual, cada card mide varios cientos de px (una fila completa por producto + botones grandes), así que cada columna muestra 1–2 pedidos por pantalla. Con decenas de pedidos, el Kanban se vuelve una lista vertical con scroll infinito, no un tablero de un vistazo.
- **Exceso de color simultáneo**: badge de estado del pedido, badge de cada producto y borde de acento repiten el mismo color de estado 3 veces por card; en Kanban esto es además **redundante** — la columna ya dice el estado.
- **Botones de texto largos** ("Iniciar todo", "Marcar todo listo", "Quitar prioridad") ocupan una fila entera cada uno; en un tablero de alta densidad son el principal desperdicio de espacio vertical.
- **Sin Drag & Drop**: mover un pedido de estado requiere clic en un botón de texto dentro del card; no hay forma táctil/arrastre de "pasar" un pedido a la siguiente columna.
- **Espacio horizontal desaprovechado**: el sidebar ya es compacto (64px, de la iteración anterior) y el `<main>` tiene `p-4 sm:p-6`; el Kanban en sí usa columnas de ancho fijo (`w-80`/`2xl:w-96`) con `gap-4`, lo cual en monitores grandes deja aire a los lados en vez de aprovechar el ancho para más columnas visibles o cards más anchos con más info por fila.

## 3. Componentes existentes que se reutilizan (sin duplicar)

| Necesidad | Reutilizo |
|---|---|
| Mutaciones (avanzar ítems/ticket, prioridad) | `useAdvanceTicketItems`, `useSetTicketPriority`, `useAdvanceKitchenItem` — **sin cambios** |
| Paleta semántica de estado/tiempo | `ORDER_STATUS_CONFIG`, `TIME_TIER_STYLE`, `timeTier`, `minutesAgoSince`, `TIME_WARN_MIN`/`TIME_LATE_MIN` de `ticketVisuals.ts` |
| Tooltip accesible (hover + foco teclado) | `shared/ui/Tooltip.tsx` |
| Filtros rápidos | `shared/ui/Chip.tsx` |
| Input de búsqueda | `inputClass` de `formClasses.ts` (mismo patrón que `ListView`) |
| Toast de feedback | `shared/ui/Toast.tsx` |
| Voz → mismo pipeline | `useVoiceCommandEngine` — no se toca, ya converge en las mismas mutaciones |

No se crea Design System paralelo. Los únicos archivos nuevos son específicos del Kanban.

## 4. Decisión de arquitectura (cambio importante, lo explico antes de tocar código)

**No voy a modificar `TicketCard.tsx` ni reutilizarlo dentro del nuevo Kanban.** Lo dejo intacto para Grid y Lista (que el usuario pidió no rediseñar). En su lugar creo un card nuevo y propio del Kanban:

- `src/modules/kitchen/kanban/KanbanTicketCard.tsx` — compacto, sin filas por producto con botón individual.
- `src/modules/kitchen/kanban/useDragDrop.ts` — hook de drag & drop basado en Pointer Events (mouse + touch unificados, ver punto 5).
- `src/modules/kitchen/kanban/KanbanToolbar.tsx` — búsqueda + 2 chips de filtro (prioritarios / con alerta).
- `KanbanView.tsx` se reescribe para orquestar columnas + toolbar + drag & drop, pero seguirá recibiendo `tickets`/`now`/`newIds`/`onAcknowledge` igual que hoy (mismo contrato con `KitchenPage.tsx`).

**Cambio de UX que quiero señalar explícitamente:** el card de Kanban **no tendrá botones por producto individual** (eso se queda en Grid/Lista, donde el operador ya trabaja el detalle). El Kanban muestra los productos como texto compacto de solo lectura y ofrece **una sola acción de avance por ticket** (icono, no botón de texto) + drag & drop. Razón: el Kanban sirve para triage/movimiento rápido de decenas de pedidos de un vistazo; forzar control por-plato ahí es lo que hoy infla el card. El control fino de cada plato sigue disponible en Grid/Lista sin cambios.

Ningún tipo/estado nuevo: sigue usando `KitchenOrderStatus`/`KitchenTicket` tal cual existen.

## 5. Drag & Drop sin duplicar lógica

No hay librería de DnD instalada. Evalué las opciones:

- **HTML5 Drag and Drop API nativa (sin dependencia)**: descartada — no soporta touch de forma confiable en tablets (requisito explícito del enunciado).
- **react-dnd**: pesa más, requiere backends separados para mouse/touch, poco idiomático para React 19.
- **react-beautiful-dnd**: deprecado, no soporta React 18/19.
- **@dnd-kit/core** (~10kB gzip, sin dependencias nativas): soporta mouse, touch y teclado con el mismo modelo de sensores, es la opción moderna estándar para React, y no necesito `@dnd-kit/sortable` (no hay reordenamiento dentro de una columna, solo mover entre columnas).

**Propongo agregar `@dnd-kit/core`** como única dependencia nueva. Flujo:

```
Drag de un card → onDragEnd(ticketId, columnDestino)
  → validar transición (mismo mapa que ya define las 3 columnas)
  → si inválida: no hacer nada, el card vuelve a su posición (comportamiento por defecto de dnd-kit al no haber "commit")
  → si válida: exactamente la misma llamada que ya usan los botones:
       destino EN_PREPARACION → advanceTicketItems(ticket.items, 'EN_PREPARACION')
       destino LISTO          → advanceTicketItems(ticket.items, 'LISTO')
  → optimista: TanStack Query ya invalida 'kitchen-queue' on success: si falla, el toast de error se dispara igual que hoy y el ticket vuelve a aparecer en su columna real en el siguiente refetch (no hay estado local paralelo que revertir a mano)
```

Un solo punto de entrada a la mutación (`runTransition(ticket, targetStatus)`), invocado desde: botón de avance manual, `onDragEnd`, y sin cambios en el motor de voz (que ya usa `advanceTicketItems` directamente). Las tres vías convergen en el mismo código, como pide el enunciado.

Drops inválidos (p.ej. soltar en la misma columna, o retroceder de LISTO a CONFIRMADO) simplemente no disparan mutación.

## 6. Cambios en los Order Cards del Kanban

`KanbanTicketCard` (compacto, altura objetivo ~90–110px vs ~250px+ actual):

- **Franja de acento** de 3px a la izquierda (ya existe el patrón) en vez de badge de color de fondo grande — color como acento, no como bloque.
- **Header en una línea**: `#1042` · `12 min` (con color/ícono solo si `atencion`/`retrasado`, texto neutro si está a tiempo) · ícono de prioridad (`★`/`Flag`, solo visible si `priority>0`, con Tooltip "Pedido prioritario") · ícono de alerta contextual (`⚠`) solo si hay algo que atender (retrasado o nota).
- **Productos**: lista de solo texto compacta (`2× Costillas, 1× Papas`), máximo 3 líneas, con "+N más" si hay más — sin badge ni botón por producto.
- **Sin repetir el nombre del estado**: la columna ya lo dice; el card no vuelve a escribir "LISTO"/"EN PREPARACIÓN".
- **Una sola acción por ticket**: ícono de avance (▶) con Tooltip explicando el destino ("Pasar a preparación" / "Marcar listo"); no aparece en la columna `LISTO` (no hay siguiente paso dentro de Cocina). Usa `useAdvanceTicketItems`, la misma función que hoy.
- **Prioridad**: ícono-only, toggle con Tooltip, sin texto "Quitar prioridad"/"Prioritario" ocupando una fila.
- **Draggable**: todo el card es el "handle" de arrastre (cursor `grab`), con elevación/sombra sutil durante el drag (soporte nativo de `@dnd-kit`) y sin animaciones largas.
- Mantiene `isNew` (glow para pedido recién llegado) y `onAcknowledge`, igual que hoy.

## 7. Aprovechamiento del espacio

- Columnas pasan de ancho fijo (`w-80`/`2xl:w-96`) a **flexibles** (`flex-1 min-w-72`), repartiendo el ancho completo del viewport entre las 3 columnas en vez de dejar aire a los lados en monitores grandes/Smart TV.
- Cards más bajos → más pedidos visibles por columna sin scroll.
- Toolbar del Kanban en una sola fila compacta (buscador + 2 chips), no un bloque nuevo de altura considerable.
- Header de columna se mantiene compacto tal cual está hoy.
- No toco `AppLayout`, sidebar ni `main` padding — ya están optimizados de la iteración anterior.

---

## Puntos adicionales (para que quede explícito, no son preguntas bloqueantes — si no hay objeción, sigo con lo indicado)

- **Virtualización**: no la agrego. Las columnas solo contienen pedidos *activos* (CONFIRMADO/EN_PREPARACION/LISTO), no el historial del día — el volumen real por columna en un turno normal no justifica esa complejidad ni una dependencia nueva (`react-window`). Si en producción una columna llega a cientos de tickets simultáneos, se puede agregar después sin tocar la arquitectura de datos.
- **Dependencia nueva**: `@dnd-kit/core` (justificada en punto 5). Es la única dependencia nueva del proyecto para esta tarea.
- **Performance**: `KanbanTicketCard` envuelto en `React.memo`; el tick de "tiempo transcurrido" ya corre cada 30s vía `useNow` (no por segundo) y no cambia.
- **Tests**: agrego tests para la función pura de "¿transición válida?" (`kanban/transitions.ts`) y, si el tiempo lo permite, un test de integración ligero del `onDragEnd` simulando el evento de `@dnd-kit`.

---

Con tu aprobación implemento en este orden: (1) `npm install @dnd-kit/core`, (2) `kanban/transitions.ts` + tests, (3) `KanbanTicketCard.tsx`, (4) `useDragDrop.ts` + reescritura de `KanbanView.tsx`, (5) `KanbanToolbar.tsx`, (6) verificación manual (drag mouse, touch simulado, voz, botones, responsive, tsc/lint/test/build), (7) commit.
