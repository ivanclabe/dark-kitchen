# Auditoría — Sidebar compacto, 4 vistas de Cocina, vista SLA y buffer de voz

Fecha: 2026-09-15
Alcance: `src/app/AppLayout.tsx`, `src/modules/kitchen/**`, `src/shared/ui/**`.

No se ha escrito código todavía — esto es la exploración y la propuesta, siguiendo la estructura A–J pedida.

---

## A. Arquitectura actual relevante

**Sidebar** (`AppLayout.tsx`): `<aside>` fijo de `w-60` (240px), ícono + label siempre visibles, 13 items de `NAV_ITEMS` filtrados por rol (`canAccessModule`). En móvil (`<sm`) se convierte en un drawer off-canvas activado por un botón hamburguesa (`sidebarOpen` state); en `sm+` es estático y siempre visible.

**Cocina** (`KitchenPage.tsx`, 316 líneas tras las iteraciones anteriores): un solo archivo con `ItemRow`, `TicketCard` y `KitchenPage`. Sin vistas alternativas — hoy es efectivamente una única vista tipo "Grid" (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3`). Contiene ya: paleta semántica (azul/ámbar/violeta), franja lateral de color, 3 niveles de urgencia por tiempo (`timeTier`), y el `VoiceCommandBar`.

**Datos de Cocina** (`kitchen/api/kitchen.ts`): `listKitchenQueue()` trae **solo** pedidos con `status IN ('CONFIRMADO','EN_PREPARACION')` — un pedido que llega a `LISTO` desaparece de esta consulta. `useKitchenQueue()` hace polling cada 15s (`refetchInterval`); **no existe Supabase Realtime en todo el proyecto** (confirmé con grep global — cero usos de `supabase.channel`/`postgres_changes`), así que no hay nada que "reutilizar" ahí; seguimos con el mismo polling ya establecido.

**Historial de estados** (`dk_order_status_history`): tabla que ya registra cada transición (`order_id, from_status, to_status, changed_by, changed_at`), pensada explícitamente para reportes operativos ("tiempo promedio en cocina" — está en `docs/03-order-lifecycle.md` desde el diseño original). RLS ya permite `SELECT` al rol `KITCHEN` (verificado en la migración). **Esta tabla es la pieza que falta usar para la vista SLA** — no hay que crear nada nuevo en base de datos.

**Voice Command Engine actual** (`kitchen/voice/`):
- `speechRecognition.ts`: `continuous: false`, `interimResults: false`. Cada llamada a `start()` crea una sesión que el navegador cierra solo apenas detecta una pausa, y dispara `onresult` **una sola vez** con lo que haya alcanzado a capturar.
- `useVoiceCommandEngine.ts`: `handleTranscript(transcript)` se ejecuta **inmediatamente** en cuanto `onresult` dispara — sin buffer, sin espera, sin distinguir parcial de final.

**Esto confirma exactamente el bug que describes**: no es que el parser sea malo (`commandParser.ts` ya tiene 14 tests pasando y es robusto con lo que recibe) — es que el navegador corta la sesión de reconocimiento en la primera pausa natural del habla ("Pedido..." *pausa* "2040...") y cada fragmento se envía completo al parser como si fuera el comando entero. El parser hace lo correcto (rechaza "Pedido" por no tener acción), pero eso ya es demasiado tarde — el usuario ve "No entendí el comando" cuando en realidad no había terminado de hablar.

**Design System reutilizable que ya existe**: `Card`, `Modal`, `ConfirmDialog`, `Drawer`, `Toast`, `Chip`, `Combobox`, `NumberStepper`, `EmptyState`, `Skeleton`, y las clases de `formClasses.ts` (`cardClass`, `tableWrapperClass`, `thClass`/`tdClass`, botones). **No existen `Tooltip` ni `Tabs`** — los busqué explícitamente y no hay ningún componente con ese nombre en el proyecto (los únicos resultados para "Tooltip" son el de `recharts`, no relacionado).

## B. Problemas encontrados

1. **El bug de voz confirmado y explicado arriba** — arquitectura de ejecución inmediata sin buffer, causado por `continuous: false` + falta de debounce propio.
2. **La cola de Cocina no incluye pedidos `LISTO`** — para un Kanban con columna "Listo" (como pediste), hay que ampliar la consulta. Es un cambio real, lo detallo en D.
3. **No existe ninguna fuente de datos para SLA** — la única tabla que sirve (`dk_order_status_history`) nunca se ha consultado desde el frontend fuera del detalle de un pedido individual.
4. **`KitchenPage.tsx` ya está en 316 líneas con una sola vista** — meter Kanban + Lista + Grid + SLA en el mismo archivo sin dividirlo sería insostenible. Hay que extraer.
5. **Sin `Tooltip` ni `Tabs`** — se necesitan de verdad para esta iteración (sidebar y selector de vistas), no es capricho.

## C. Componentes que reutilizarás

- `Chip` → selector de rango en SLA (hoy/última hora/turno), y filtros de estado en la vista Lista — mismo patrón que los filtros de `OrdersPage`.
- `Card` → tarjetas de métrica en SLA.
- `cardClass`/`tableWrapperClass`/`thClass`/`tdClass` → vista Lista (tabla compacta, mismo lenguaje visual que el resto de la app).
- `Toast`, `useToast` → feedback de voz (sin cambios).
- `useNow` → temporizador compartido para "hace N min" en todas las vistas y en SLA.
- Los RPC/mutaciones existentes (`useAdvanceKitchenItem`, `useAdvanceTicketItems`, `useSetTicketPriority`) → **sin cambios**, las llaman por igual Kanban, Lista, Grid y la voz.
- La paleta semántica y `timeTier` ya construidas → las extraigo a un módulo compartido (`kitchen/lib/ticketVisuals.ts`) para que las 4 vistas usen exactamente los mismos colores/umbrales, en vez de que cada vista reinvente su propia versión.

Nuevo, justificado por necesidad real:
- `Tooltip` (sidebar colapsado).
- `Tabs` (selector Kanban/Lista/Grid/SLA) — con semántica `role="tablist"`/`role="tab"` para accesibilidad y navegación por teclado (flechas ← →), como pediste explícitamente.

## D. Propuesta para las cuatro vistas

Extraigo de `KitchenPage.tsx` un `TicketCard` compartido (`kitchen/components/TicketCard.tsx`) y el módulo de colores/tiempo (`kitchen/lib/ticketVisuals.ts`), y divido en:

```
kitchen/
  lib/ticketVisuals.ts      ← paleta, timeTier, ORDER_STATUS_CONFIG (ya existen, se mueven)
  components/TicketCard.tsx  ← el ticket actual, extraído tal cual
  views/GridView.tsx         ← literalmente la vista actual de KitchenPage, sin cambios de fondo
  views/KanbanView.tsx       ← nuevo
  views/ListView.tsx         ← nuevo
  views/SlaView.tsx          ← nuevo
  pages/KitchenPage.tsx      ← selector de vista + datos compartidos + VoiceCommandBar
```

**Grid** — es la vista actual, migrada sin cambios funcionales. Queda como el valor por defecto (para no sorprender a nadie que ya está acostumbrado a la pantalla de hoy).

**Kanban** — columnas por `orderStatus`. Aquí está la decisión que necesito que confirmes:

> **Pregunta:** ¿las columnas deben ser Confirmado → En preparación → Listo (3, todas dentro del dominio de Cocina), o agregas también Despachado (4, cruzando al dominio de Despachos)?
>
> Mi recomendación es **3 columnas** (Confirmado / En preparación / Listo). Despachado ya es responsabilidad del módulo Despachos — mostrarlo en Cocina mezclaría dos dominios y no le añade nada operativo a quien cocina. Para tener la columna "Listo" necesito ampliar `listKitchenQueue()` para que además incluya pedidos en estado `LISTO` (hoy se excluyen por completo) — es un cambio real pero acotado: solo amplía el filtro `.in('status', [...])` de una consulta de **lectura**, no toca ningún RPC ni regla de negocio. Con esa ampliación, las 4 vistas comparten la misma fuente de datos (Grid y Lista también podrán mostrar pedidos "Listo, esperando despacho" si eso les sirve — lo trato como mejora, no como regresión).

Cada columna: header con conteo, tickets ordenados por prioridad→antigüedad (mismo criterio ya usado), cambio de estado directo desde el ticket (mismo botón "Iniciar"/"Marcar listo" ya existente). En tablet/pantallas angostas, columnas en scroll horizontal en vez de apilarse verticalmente (así se preserva la semántica de "flujo" del Kanban).

**Lista** — tabla compacta reutilizando `tableWrapperClass`. Columnas mínimas: código, hora, resumen de productos (ej. "2× Hamburguesa, 1× Papas"), estado (badge con la misma paleta), tiempo transcurrido (mismo indicador de 3 niveles), prioridad (ícono, no columna aparte). Búsqueda por código/cliente, filtro por estado (Chips), cambio de estado con un botón compacto por fila. Pensada para "ver muchos pedidos de un vistazo" — cero información secundaria (sin observaciones completas, por ejemplo — con hover o expandir si hace falta).

**SLA** — la pieza nueva de verdad. Consulta `dk_order_status_history` (rol KITCHEN ya tiene SELECT, confirmé la política — cero cambios de RLS) filtrando transiciones `CONFIRMADO → LISTO` en el rango elegido (hoy/última hora/turno/rango) para calcular tiempo de preparación real de pedidos ya completados, combinado con los pedidos **actualmente activos** (misma cola ya cargada) para contar "atrasados ahora" y "cerca del límite" — reutilizando el **mismo umbral** `TIME_LATE_MIN` (20 min) ya definido para "retrasado" en el resto del KDS, no invento un número nuevo. Métricas: total del período, % cumplimiento, tiempo promedio, tiempo máximo, atrasados ahora, cerca de incumplir — todas en `Card`s grandes, tipografía grande (pensada para leerse a distancia, como pediste). Debajo, una lista de los pedidos que more están causando el problema (código, tiempo, señal color+ícono+texto — igual que el resto del sistema, nunca solo color).

## E. Propuesta para el Voice Command Engine (buffer)

Reescribo `speechRecognition.ts` para exponer transcript parcial y final por separado:

```ts
useSpeechRecognition({
  onTranscriptChange: (text: string, isFinal: boolean) => void,  // cada actualización, parcial o final
  onError,
  lang,
})
```

Cambios internos: `continuous: true`, `interimResults: true`. En cada `onresult`, se concatena `results[i][0].transcript` de **todos** los resultados de la sesión (no solo el último) para tener siempre "todo lo dicho desde que se activó el micrófono", y se notifica junto con si ese fragmento específico ya es `isFinal` del navegador (útil para la UI, no para decidir cuándo procesar).

Un guardia de duración máxima (p. ej. 20s) detiene la sesión aunque el usuario no pare de hablar — evita que quede escuchando indefinidamente.

## F. Estrategia de buffering/debounce

Vive en `useVoiceCommandEngine.ts` (no en el wrapper del navegador — ahí solo entrega texto):

```
onTranscriptChange(text) →
  liveTranscript = text          (se muestra en pantalla de inmediato: "Escuchando... 'Pedido 2040'")
  reinicia un timer de VOICE_COMMAND_DELAY_MS (constante, default 1800ms)

cuando el timer llega a 0 sin nuevas actualizaciones →
  detener el reconocimiento (recognition.stop()) — nada más puede disparar onresult para esta sesión
  pasar liveTranscript (el acumulado completo) a parseVoiceCommand → validar → ejecutar
```

`VOICE_COMMAND_DELAY_MS` queda como constante exportada al inicio del archivo (ajustable, tal como pediste). Un flag `isProcessingRef` evita reentradas (defensa adicional, aunque detener el reconocimiento al disparar el timer ya lo impide estructuralmente — no hay forma de que llegue un segundo transcript de la misma sesión una vez detenida). Esto resuelve directamente los puntos 13–16 y 20 del brief: nunca se ejecuta con fragmentos, y no hay forma de ejecutar el mismo comando dos veces porque solo hay una sesión de reconocimiento activa a la vez y se apaga sola al procesar.

`VoiceCommandBar` gana un estado de transcript en vivo, mostrado mientras `phase === 'listening'`, distinto del mensaje final — así el operador ve crecer la frase igual que en tu ejemplo del punto 16.

`commandParser.ts` y las mutaciones que llama (`useAdvanceTicketItems`, `useSetTicketPriority`) **no cambian** — siguen siendo el único punto de escritura, para voz y para los botones por igual.

## G. Propuesta visual

**Sidebar**: `w-16` (64px), íconos centrados a `size={20}`, estado activo con fondo degradado (el mismo gradiente `brasa` que ya usa el ítem activo hoy, solo que ahora ocupa un cuadrado/círculo en vez de una barra completa), `Tooltip` a la derecha del ícono con el nombre del módulo (aparece en hover **y** en focus por teclado, para accesibilidad real, no solo mouse). El logo se reduce a solo el ícono de llama. El bloque de usuario al pie se reduce a solo el avatar con iniciales (tooltip con nombre/rol).

> **Pregunta:** hoy el sidebar en móvil es un drawer off-canvas con hamburguesa. Con un riel de 64px ya no compite tanto por espacio — ¿lo dejamos siempre visible también en móvil (elimino el hamburguesa y ese `useState` de `AppLayout`), o prefieres conservar el comportamiento móvil actual y que el riel de 64px aplique solo desde tablet hacia arriba? Mi recomendación es simplificarlo siempre-visible, dado que esta app es tablet/desktop/TV-first, pero es tu decisión.

**Selector de vistas**: `Tabs` estilo segmented control (fondo `neutral-900`, opción activa con fondo `neutral-800` + texto blanco), con ícono + label en cada tab — visible siempre en la parte superior de Cocina, cambio instantáneo (estado local, sin navegación), persistido en `localStorage` (mismo patrón ya usado para `soundEnabled`/`ttsEnabled` — no hay tabla de preferencias de usuario en la base de datos, y crear una sería sobre-ingeniería para esto).

**SLA**: números grandes (`text-4xl`/`text-5xl` en las métricas principales), íconos de estado (✓/⚠/✗) además de color, mismo lenguaje visual que el resto (bordes, `cardClass`).

## H. Archivos que modificarías

- `src/app/AppLayout.tsx` (sidebar)
- `src/shared/ui/Tooltip.tsx` (nuevo)
- `src/shared/ui/Tabs.tsx` (nuevo)
- `src/modules/kitchen/lib/ticketVisuals.ts` (nuevo, extraído de KitchenPage)
- `src/modules/kitchen/components/TicketCard.tsx` (nuevo, extraído)
- `src/modules/kitchen/views/{GridView,KanbanView,ListView,SlaView}.tsx` (nuevos)
- `src/modules/kitchen/pages/KitchenPage.tsx` (se reduce a shell + selector de vista)
- `src/modules/kitchen/api/kitchen.ts` (amplía el filtro de estado; nueva función de consulta SLA)
- `src/modules/kitchen/hooks/useKitchen.ts` (nuevo `useSlaSummary`)
- `src/modules/kitchen/voice/speechRecognition.ts` (continuous + interim)
- `src/modules/kitchen/voice/useVoiceCommandEngine.ts` (buffer/debounce)
- `src/modules/kitchen/voice/VoiceCommandBar.tsx` (transcript en vivo)
- `src/modules/kitchen/voice/commandParser.test.ts` (casos nuevos de transcript incompleto/progresivo a nivel del engine, no del parser puro)

## I. Riesgos

1. **Ampliar la consulta de Cocina a incluir `LISTO`** cambia qué tickets aparecen en Grid/Lista además de Kanban — lo trato como mejora (ver pedidos listos esperando despacho es operativamente útil), pero hay que revisar que no interfiera con `useNewTicketAlert` (la alerta de "ticket nuevo" usa la misma cola como fuente).
2. **Reconocimiento continuo (`continuous: true`)** puede quedarse escuchando más de lo esperado si el usuario no dice nada coherente — mitigado con el límite máximo de duración de sesión.
3. **Quitar el hamburguesa móvil** (si confirmas esa opción) es un cambio de comportamiento visible — lo hago solo con tu confirmación explícita.
4. **SLA con pocos datos históricos**: el entorno de desarrollo actual tiene pocos pedidos reales — las métricas se van a ver "vacías" o poco representativas al probarlas ahí; no es un bug, es una limitación de los datos de prueba disponibles.
5. **Kanban en tablet angosta** necesita scroll horizontal de columnas — lo diseño así desde el inicio, no como parche después.

## J. Plan de implementación por pasos

**Paso 1 — Sidebar compacto**: `Tooltip`, rediseño de `AppLayout.tsx`.

**Paso 2 — Extracción de Cocina**: `ticketVisuals.ts`, `TicketCard.tsx`, `GridView.tsx` (paridad 1:1 con el comportamiento actual), `Tabs.tsx` + shell de `KitchenPage.tsx` con un solo tab funcionando (Grid). Checkpoint: todo debe verse y comportarse exactamente igual que hoy antes de seguir.

**Paso 3 — Kanban y Lista**: ampliar `listKitchenQueue()`, construir ambas vistas sobre la misma fuente de datos.

**Paso 4 — SLA**: consulta a `dk_order_status_history`, `useSlaSummary`, `SlaView.tsx`.

**Paso 5 — Buffer de voz**: reescribir `speechRecognition.ts` y `useVoiceCommandEngine.ts`, transcript en vivo en `VoiceCommandBar.tsx`.

**Paso 6 — Testing y verificación**: casos nuevos de voz (transcript parcial/progresivo, silencio, doble comando), verificación manual de las 4 vistas y de la voz corrigiendo el bug original ("Pedido..." ya no debe disparar "no entendí"), tsc/lint/build/test.

---

Quedo a la espera de tu aprobación. Dos decisiones puntuales antes de empezar:

1. **Kanban: ¿3 columnas (Confirmado/En preparación/Listo) o 4 (+ Despachado)?** Recomiendo 3.
2. **Sidebar móvil: ¿riel de 64px siempre visible (elimino el hamburguesa) o mantengo el drawer actual solo en móvil?** Recomiendo simplificar a siempre-visible.
