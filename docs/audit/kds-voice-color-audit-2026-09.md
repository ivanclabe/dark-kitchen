# Auditoría — Control por voz y sistema visual de estados para el KDS

Fecha: 2026-09-15
Alcance: `src/modules/kitchen/**`, tabla `dk_orders` / `dk_kitchen_tickets` / `dk_order_items`, componentes compartidos (`Toast`, `formClasses`, `Chip`).

Esta auditoría cubre los 12 puntos pedidos (sección 27 del brief) y, dentro de cada uno, ya deja explícitas las decisiones de diseño necesarias para las secciones 15–26. **No se ha escrito código de aplicación todavía** — solo esta lectura del repo y la propuesta. Al final hay un plan de 7 fases para tu aprobación.

---

## 1. Arquitectura actual del KDS

`KitchenPage.tsx` (`src/modules/kitchen/pages/KitchenPage.tsx`) es un componente único con tres piezas:

- `ItemRow` — una fila de plato dentro de un ticket. Botón "Iniciar"/"Marcar listo" que llama `useAdvanceKitchenItem().mutateAsync(item.id)`.
- `TicketCard` — el ticket completo. Contiene:
  - `handleMarkAllReady()` — bucle que llama `advanceAll.mutateAsync(item.id)` una o dos veces por ítem pendiente (según si está PENDIENTE o EN_PREPARACION), **secuencialmente** para evitar una condición de carrera al cerrar el pedido completo (esto ya lo resolvimos en la Iteración 3).
  - `handleTogglePriority()` — llama `setPriority.mutateAsync({ orderId, priority })`.
- `KitchenPage` — orquesta `useKitchenQueue()` (polling cada 15s vía TanStack Query), `useNewTicketAlert()` (alerta de ticket nuevo, Iteración 1) y ordena los ITKM tickets por prioridad y antigüedad.

Todo el estado vive en TanStack Query; no hay estado global propio del módulo Kitchen más allá de eso.

**Conclusión clave:** la lógica de "avanzar item", "marcar todo listo" y "togglear prioridad" ya está encapsulada en tres funciones reutilizables (`useAdvanceKitchenItem`, y las dos funciones de `TicketCard`). El control por voz debe llamar **exactamente estas mismas funciones** — no debe tocar Supabase directamente.

Una nota de refactor necesaria: `handleMarkAllReady` hoy vive como closure *dentro* de `TicketCard`. Para que voz y botón compartan una sola implementación sin duplicar código, hay que **extraerla** a un hook compartido (p. ej. `useAdvanceTicketToStatus()` en `kitchen/hooks/useKitchen.ts`) que ambos consuman. Detalle en la sección 5.

## 2. Cómo funcionan actualmente los estados

Dos modelos de estado distintos, y esto es importante para no confundirlos en los comandos de voz:

| Nivel | Campo | Valores | Dónde vive |
|---|---|---|---|
| Pedido (`dk_orders.status`) | `OrderStatus` | `NUEVO → CONFIRMADO → EN_PREPARACION → LISTO → DESPACHADO → ENTREGADO`, o `CANCELADO` desde cualquier punto anterior a `ENTREGADO` | `src/modules/orders/types/index.ts`, documentado en `docs/03-order-lifecycle.md` |
| Plato dentro del pedido (`dk_order_items.kitchen_status`) | `KitchenItemStatus` | `PENDIENTE → EN_PREPARACION → LISTO` | `src/modules/kitchen/types/index.ts` |
| Prioridad (`dk_kitchen_tickets.priority`) | `integer` (0 = normal, >0 = prioritario) | independiente del estado | Iteración 3 de esta sesión |

**Hallazgo crítico para el diseño de comandos:** la cola de Cocina (`listKitchenQueue`) solo trae pedidos con `status IN ('CONFIRMADO', 'EN_PREPARACION')` — un pedido `NUEVO` (recién creado, sin confirmar) **nunca aparece en el KDS**. Confirmar un pedido es una acción que ocurre en **Pedidos** (`OrderBuilder.handleConfirm`), no en Cocina.

Esto significa que **"pedido 2040 confirmado" no es una transición válida desde la pantalla de Cocina** — para cuando un ticket es visible ahí, ya está confirmado por definición. El parser debe reconocer la palabra "confirmado" (para no fallar silenciosamente si alguien la dice), pero la validación debe rechazarla con un mensaje claro tipo *"El pedido 2040 ya está confirmado"*, igual que el ejemplo que diste para "listo". Dejo esto para tu confirmación en el punto 5 del análisis (comandos soportados).

Las transiciones que **sí** tienen sentido desde voz-en-Cocina son:

- **"en preparación"** → avanza todos los ítems `PENDIENTE` del ticket a `EN_PREPARACION` (una llamada a `dk_advance_kitchen_item` por ítem pendiente).
- **"listo"** → avanza todos los ítems no-`LISTO` del ticket hasta `LISTO` (la misma lógica que ya existe en `handleMarkAllReady`).
- **"prioritario"** / **"quitar prioridad"** → toggle de `dk_kitchen_tickets.priority`.

`PRIORITARIO` ya es exactamente lo que pediste en la sección 5 del brief: **una propiedad independiente del estado**, no un estado exclusivo. Un pedido puede estar `EN_PREPARACION` + prioritario al mismo tiempo — así está implementado desde la Iteración 3. No hay que cambiar el modelo de datos en este punto, solo reutilizarlo.

## 3. Cómo se actualizan los pedidos (capa de datos)

Todas las escrituras pasan por funciones Postgres `SECURITY DEFINER` con guardas de rol (`dk_current_role() in ('ADMIN','MANAGER','KITCHEN')`), llamadas vía `supabase.rpc(...)`:

- `dk_advance_kitchen_item(p_order_item_id uuid)` — avanza un ítem un paso (`PENDIENTE→EN_PREPARACION` o `EN_PREPARACION→LISTO`). Si el pedido pasa de `CONFIRMADO` a `EN_PREPARACION` por el primer ítem, lo hace automáticamente. Si todos los ítems quedan `LISTO`, cierra el pedido a `LISTO`. Lanza excepciones con mensajes claros en español si el pedido no existe, no está en un estado válido, o el ítem ya está `LISTO`.
- `dk_set_ticket_priority(p_order_id uuid, p_priority integer)` — actualiza la prioridad (Iteración 3, mismo patrón de autorización).

Estos mensajes de error ya viajan tal cual hasta la UI vía `getErrorMessage(err, fallback)` + `useToast().show(msg, 'error')`. El control por voz debe usar **el mismo camino** — si el RPC rechaza la acción, el mensaje que ya existe ("El plato ya esta LISTO", "El pedido debe estar CONFIRMADO o EN_PREPARACION...") es el mismo que debe verse/oírse en voz. Cero lógica de validación nueva del lado del servidor.

## 4. Componentes que pueden reutilizarse

| Necesidad del brief | Componente/patrón existente a reutilizar |
|---|---|
| Feedback visual de éxito/error | `useToast()` (`src/shared/ui/Toast.tsx`) — ya soporta `success`/`error`/`info`, auto-dismiss a 4s, cola de toasts apilados (relevante para "no superponer mensajes en hora pico", aunque para voz conviene una única línea de estado, ver sección 8 de esta auditoría) |
| Botón de ícono con estados visuales | El botón de silenciar/activar sonido ya en el header de `KitchenPage` (`Volume2`/`VolumeX`) es el precedente visual exacto para el botón de micrófono |
| Preferencia on/off persistida | `useNewTicketAlert.ts` ya guarda `soundEnabled` en `localStorage` con try/catch — mismo patrón para "voz activada"/"TTS activado" |
| Badges de estado | `STATUS_BADGE` (por ítem) y el badge de `orderStatus` en `TicketCard` — se rediseñan (sección 8 de esta auditoría) pero el patrón `rounded-full px-2 py-0.5 text-xs font-medium` se mantiene |
| Ordenamiento de tickets | Ya implementado: prioridad desc, luego antigüedad asc (`useMemo` en `KitchenPage`) — no hace falta rehacerlo, solo hacer el corte visual entre "prioritarios" y el resto más claro (sección 26.1) |
| Mutaciones existentes | `useAdvanceKitchenItem()`, `useSetTicketPriority()` — se llaman igual desde voz que desde los botones |

## 5. Cómo integrar el Voice Command Engine

### 5.1 El problema de fondo que hay que resolver primero: no existe un código de 4 dígitos

Revisé el esquema de `dk_orders` completo — **no existe ningún campo numérico corto**. El único identificador visible hoy en el ticket es `#{ticket.orderId.slice(0, 8)}`, un fragmento del UUID (ej. `0759a4b8`): alfanumérico, no decible en voz alta de forma natural, y no es lo que pediste como "código de 4 dígitos".

Esto no es opcional de resolver — sin un código de 4 dígitos real en la base de datos, no hay nada contra qué hacer *match* cuando alguien dice "pedido 2040". Propongo:

- Nueva columna `dk_orders.order_number smallint`, asignada por un trigger `BEFORE INSERT` usando una secuencia Postgres `dk_order_number_seq` que cicla entre 1000 y 9999 (`CYCLE`).
- **No** uso una restricción `UNIQUE` global (con el ciclo, un número se repetirá cada ~9000 pedidos — perfectamente normal, es como funcionan los números de ticket en cualquier restaurante). En su lugar, un índice único **parcial**: `UNIQUE (order_number) WHERE status NOT IN ('ENTREGADO', 'CANCELADO')`. Esto garantiza que nunca hay ambigüedad entre pedidos **activos** (que es lo único que le importa a la cocina y a la voz), sin bloquear el ciclo natural de reuso de números para pedidos ya cerrados.
- Backfill de los pedidos históricos existentes en una sola migración (asignar números vía `row_number()` antes de crear el trigger).
- El número se muestra en el ticket **en lugar de** `orderId.slice(0,8)` (único lugar del código que lo usa hoy, confirmado por grep) y también conviene mostrarlo en Pedidos (`OrdersPage`/`OrderDetailPage`) para que quien toma el pedido y quien lo prepara hablen del mismo número — lo marco como recomendado pero no bloqueante para la v1 de voz.

Esto es un cambio de esquema real, así que quiero tu confirmación explícita antes de tocarlo (te lo dejo en el plan de fases como Fase 1, primer paso).

### 5.2 Capa independiente (no meter lógica en `KitchenPage.tsx`)

Siguiendo tu diagrama, propongo `src/modules/kitchen/voice/`:

```
kitchen/voice/
  speechRecognition.ts     ← wrapper del Web Speech API (hook useSpeechRecognition)
  commandParser.ts         ← función PURA parseVoiceCommand(transcript): ParsedVoiceCommand
  useVoiceCommandEngine.ts ← orquesta: reconocimiento → parser → match ticket → valida → ejecuta mutación existente → feedback
  speak.ts                 ← wrapper de speechSynthesis (TTS), con cola de profundidad 1
```

`commandParser.ts` es la pieza más importante y la más fácil de probar (función pura, sin React, sin Supabase):

```ts
interface ParsedVoiceCommand {
  orderCode: string | null      // "2040" — exactamente 4 dígitos, o null si no se encontró
  action: VoiceAction | null    // 'START_PREPARATION' | 'MARK_READY' | 'SET_PRIORITY' | 'UNSET_PRIORITY' | 'CONFIRM' | null
  confidence: 'high' | 'low'    // heurística estructural, ver sección 7
  rawTranscript: string
}
```

`action: 'CONFIRM'` se reconoce (para no fallar en silencio si alguien lo dice) pero, como se explicó en el punto 2, se rechaza en la capa de validación con un mensaje claro cuando el ticket ya está en Cocina.

`useVoiceCommandEngine.ts` NO llama Supabase directamente. Recibe la lista de tickets ya cargada por `useKitchenQueue()` (la misma que ya está en pantalla), busca el ticket cuyo `orderNumber` matchee, valida contra su estado actual, y llama `useAdvanceKitchenItem()` / `useSetTicketPriority()` — las mismas mutaciones, mismo `queryClient.invalidateQueries`, mismo manejo de error.

### 5.3 Extracción necesaria para no duplicar lógica

Como se dijo en la sección 1: `handleMarkAllReady` (avanzar todos los ítems pendientes hasta `LISTO`) hoy es un closure interno de `TicketCard`. Para que el botón "Marcar todo listo" y el comando de voz "listo" ejecuten **la misma función**, la extraigo a `kitchen/hooks/useKitchen.ts` como algo así:

```ts
// Avanza cada ítem no-LISTO del ticket hasta el status objetivo.
// Reutilizado por el botón "Marcar todo listo" / "Iniciar todo" y por el motor de voz.
async function advanceTicketItems(items: KitchenTicketItem[], target: 'EN_PREPARACION' | 'LISTO', advance: (id: string) => Promise<void>)
```

Esto también me permite implementar "en preparación" (avanzar solo los `PENDIENTE` a `EN_PREPARACION`, sin tocar los que ya están `EN_PREPARACION`) sin inventar ninguna regla nueva — es un subconjunto de la misma función con `target = 'EN_PREPARACION'`. Hoy no existe un botón "Iniciar todo" en la UI (solo por ítem individual); si te parece útil, lo agrego como botón junto a "Marcar todo listo" para mantener paridad voz=botón (recomendado, bajo costo).

## 6. Cómo implementar el feedback (visual + auditivo)

**Visual:**
- Reutilizo `useToast()` para el resultado final ("✓ Pedido 2040 actualizado" / "⚠ El pedido 2040 no existe") — mismo componente que usa el resto de la app, cero código nuevo de UI para eso.
- Para el estado *en vivo* del micrófono (escuchando/procesando), un `Toast` no sirve porque es efímero y apilable — propongo una pequeña barra de estado fija junto al botón de micrófono (ver sección 8) que muestra el último transcript reconocido y el resultado, similar al mockup que diste:
  ```
  🎤 "Pedido 2040 en preparación"
  ✓ Pedido 2040 actualizado
  ```

**Auditivo (TTS):**
- `window.speechSynthesis`, con un wrapper `speak(text)` que **cancela** cualquier locución en curso antes de emitir la nueva (evita superposición en hora pico — resuelve el punto 9 del brief directamente).
- Toggle on/off persistido en `localStorage`, mismo patrón que `soundEnabled` en `useNewTicketAlert`.
- Mensajes cortos, solo en confirmación/error — nunca lee el ticket completo.

## 7. Propuesta de estados visuales y de colores

Antes de proponer colores, un hallazgo concreto sobre tu queja de "muchos tickets usan el mismo rojo": revisé `TicketCard` y **no hay ningún color rojo de estado** — `PENDIENTE` es gris, `EN_PREPARACION` es `brasa` (el naranja de marca), `LISTO` es verde. El rojo que ves es el borde `urgent` (tiempo transcurrido ≥15 min, `border-red-900/60`), que se aplica a **toda la tarjeta** encima de cualquier otro color. Con datos de prueba viejos (como los que generamos en esta sesión), casi todos los tickets superan los 15 min y por eso *parecen* todos iguales — el rojo de urgencia está compitiendo visualmente con el color de estado en vez de ser un indicador secundario. Esa es la causa real, y la corrijo en el punto 7.3.

También encontré una colisión real de color: `EN_PREPARACION` usa `brasa` (naranja) y el borde de `PRIORITARIO` usa `amber` — tonos muy cercanos. Y el badge "Nuevo" (alerta de ticket recién llegado, Iteración 1) **también** usa `brasa`. Tres señales distintas compitiendo por el mismo tono.

### 7.1 Paleta semántica propuesta (sin colisiones)

| Señal | Color | Motivo |
|---|---|---|
| `CONFIRMADO` (ticket recién llegado a cocina, nada iniciado) | **azul** (`blue-500`/`blue-400`) | frío = "esperando", como pediste |
| `EN_PREPARACION` | **ámbar** (`amber-500`/`amber-400`) | cálido = "en marcha", con ícono 🔥 (`Flame`) |
| `LISTO` (por ítem) | **verde esmeralda** (`emerald-500`, ya en uso) | se mantiene, funciona bien |
| `PRIORITARIO` (flag ortogonal) | **violeta** (`violet-500`) | distinto de azul/ámbar/esmeralda y del naranja de marca — no compite con ningún estado |
| "Nuevo" (alerta transitoria, desaparece al reconocer) | se mantiene `brasa` (naranja) | es temporal, no permanente, y ya no colisiona con nada al mover prioridad a violeta |
| Urgencia por tiempo | ver 7.3 — **no** vuelve a ser un borde rojo de tarjeta completa |

### 7.2 El ticket completo refleja el estado (no solo el label)

Propongo una franja lateral de color (`border-l-4`) + ícono + label, en vez de solo teñir el badge:

```
┃ #2040                          (franja azul = CONFIRMADO)
┃ 🕐 CONFIRMADO
┃
┃ 2x Hamburguesa
┃ 1x Papas

┃ #2040                          (franja ámbar = EN_PREPARACION)
┃ 🔥 EN PREPARACIÓN
┃
┃ 2x Hamburguesa
┃ 1x Papas
```

Esto cumple el punto 18 del brief (no depender solo del color): color de franja + ícono (`Clock`/`Flame`/`CheckCircle2`) + label de texto siempre visible + jerarquía (la franja es más ancha/saturada que cualquier otro borde).

### 7.3 Urgencia por tiempo (ya no es un borde rojo de tarjeta completa)

Reemplazo el booleano `urgent` por 3 niveles, con umbrales nombrados y configurables (constantes al inicio del archivo, no hace falta una tabla de configuración en base de datos para esto):

| Rango | Tratamiento |
|---|---|
| < 10 min | Normal — sin indicador adicional |
| 10–20 min | Atención — ícono de reloj + texto en ámbar, **contenido al badge de tiempo**, no a toda la tarjeta |
| > 20 min | Retrasado — ícono de reloj + texto en rojo, mismo badge contenido |

Al estar contenido al pequeño badge de "hace N min" (como ya está hoy, solo que hoy además pinta el borde completo), deja de competir con el color de estado o de prioridad por la atención visual — exactamente el problema que describiste.

### 7.4 Accesibilidad / contraste

Todos los tonos propuestos (`blue-400/500`, `amber-400/500`, `violet-400/500`, `emerald-400/500`) ya se usan en la app sobre fondo `neutral-900`/`neutral-950` con opacidad `/20` para el fondo y el tono sólido `-400` para texto — el mismo patrón que ya pasa el contraste razonablemente en el resto de la UI (badges de `OrdersPage`, `MenuDetailPage`, etc.). No introduzco tonos nuevos fuera de la paleta estándar de Tailwind que ya usa el proyecto.

## 8. Propuesta de estructura del ticket (mic + estados)

```
┌──────────────────────────────────────────┐
│ ┃ #2040 · María Gómez        🔥 PRIORITARIO│  ← franja lateral + código 4 dígitos + flag
│ ┃ 🔥 EN PREPARACIÓN      ⏱ 12 min (atención)│
│ ┃                                          │
│ ┃ 2x Hamburguesa  [En preparación] [Listo] │
│ ┃ 1x Papas        [Pendiente]     [Iniciar]│
│ ┃                                          │
│ ┃ [Prioritario] [Iniciar todo] [Todo listo]│
└──────────────────────────────────────────┘
```

Header de `KitchenPage`, junto al botón de sonido ya existente:

```
🔥 Cocina   [2 nuevos]         [🎤 Escuchar]  [🔊]
"Pedido 2040 en preparación" → ✓ Pedido 2040 actualizado
```

## 9. Riesgos

1. **Privacidad**: `SpeechRecognition` en Chrome no procesa el audio 100% en el dispositivo — lo envía a los servidores de Google para el reconocimiento en la mayoría de configuraciones. Si el negocio tiene alguna política sobre grabar audio ambiente en la cocina, esto vale la pena tenerlo presente antes de desplegar (no es algo que yo pueda mitigar en código, es una decisión de negocio).
2. **Malinterpretación silenciosa** (2040 escuchado como 2049, ambos números existen): la mitigación no puede ser "bloquear todo con confirmación" sin matar la velocidad — la resuelvo con eco visual+auditivo inmediato ("Pedido 2049 → en preparación") para que el cocinero note el error al instante y lo corrija manualmente. Como ninguna acción alcanzable por voz en Cocina es destructiva (no hay cancelar/eliminar desde esta pantalla), el peor caso de un error así es un ticket adelantado por error, corregible con un toque manual — no hay pérdida de datos.
3. **Migración de esquema**: agregar `order_number` toca una tabla con datos reales (histórico de pedidos ya creados en esta sesión). Requiere secuencia + trigger + backfill + índice único parcial en el orden correcto para no romper nada existente.
4. **Múltiples dispositivos con micrófono activo simultáneamente** (tablet + un segundo dispositivo cerca): si ambos tienen reconocimiento activo y escuchan la misma voz, podrían ejecutar el mismo comando dos veces. La ejecución duplicada ya está protegida por el RPC (`dk_advance_kitchen_item` rechaza un ítem que ya está `LISTO`), pero recomiendo operativamente activar el micrófono en **un solo dispositivo designado**, no en todos los KDS abiertos.
5. **Limpieza de recursos**: si `SpeechRecognition` no se detiene al desmontar el componente o salir de la ruta `/kitchen`, puede quedar escuchando en segundo plano. Hay que garantizar `recognition.stop()` en el cleanup del hook.

## 10. Compatibilidad de navegador

| API | Soporte | Notas |
|---|---|---|
| `SpeechRecognition` / `webkitSpeechRecognition` (reconocimiento de voz) | Chrome/Edge (desktop y Android) sí; Firefox **no**; Safari parcial/inconsistente históricamente | Requiere contexto seguro (HTTPS o `localhost`) |
| `speechSynthesis` (texto a voz) | Amplio soporte — Chrome, Firefox, Safari, Edge | Mucho más confiable que el reconocimiento |

**Estrategia de fallback (obligatoria, no opcional):** feature-detection con `('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window)`. Si no está disponible, el botón de micrófono **no se muestra** (no un botón roto ni deshabilitado con tooltip confuso) — el resto del KDS (botones táctiles/mouse) sigue funcionando exactamente igual, porque la voz llama las mismas mutaciones que ya usan los botones. Esto ya lo garantiza la arquitectura de la sección 5: la voz nunca es un camino de datos distinto, solo un disparador adicional.

Para el Smart TV: asumo que es solo **pantalla de visualización** (como dijiste, "posiblemente"), sin micrófono propio — el mismo `KitchenPage` ya es responsive y el botón de voz simplemente no aparecerá si ese navegador/dispositivo no soporta `SpeechRecognition` (común en navegadores embebidos de TV). No hace falta una versión separada de la página.

## 11. Testing

El proyecto **no tiene ningún framework de pruebas instalado** (confirmé en `package.json` — no hay `vitest`/`jest`/`@testing-library`). Hasta ahora, toda esta sesión (6 iteraciones) se verificó manualmente en el navegador, sin suite automatizada.

Propuesta puntual para esta feature (sin arrastrar todo el proyecto a tener una suite completa, que sería sobre-ingeniería para el alcance actual):

- Agregar **vitest** (cero fricción con Vite, ya en el stack) **solo** para probar `commandParser.ts` — es una función pura, es la pieza con más superficie de error (interpretar texto libre), y es la más barata de cubrir con tests reales. Casos: comando válido, pedido inexistente (se valida en el engine, no en el parser, pero el parser debe devolver `orderCode` correctamente para que el engine pueda rechazarlo), estado inválido, número incorrecto, comando incompleto, reconocimiento ambiguo, variantes naturales ("2040 en preparación" vs "pedido 2040, listo").
- El resto (hook de reconocimiento, integración con Supabase, UI) sigue el mismo método ya usado en toda la sesión: verificación manual en el navegador.
- **Limitación importante que debo declarar honestamente:** no puedo hablarle a un micrófono real desde este entorno — el navegador sandboxed no tiene entrada de audio física. Para verificar el pipeline completo sin depender de hablar en voz alta, voy a agregar un campo de texto de "simular transcript" (solo un input que alimenta exactamente el mismo `commandParser` → `useVoiceCommandEngine` que usaría un resultado real de `SpeechRecognition`) — útil tanto para mi propia verificación como, después, para que ustedes prueben comandos sin hablar durante el desarrollo. Lo puedo ocultar/quitar en producción si no lo quieren visible.

## 12. Plan de implementación (7 fases)

**Fase 1 — Voice Command Engine**
- Migración: `dk_orders.order_number` (secuencia 1000–9999 cíclica, trigger, índice único parcial, backfill de pedidos existentes).
- Exponer `orderNumber` en `Order`/`KitchenTicket` (tipos + mappers de API).
- `commandParser.ts` puro + `speechRecognition.ts` (wrapper con feature-detection) + `useVoiceCommandEngine.ts`.
- Extraer `advanceTicketItems` compartido (botón "Marcar todo listo" + nuevo "Iniciar todo" + voz, una sola implementación).

**Fase 2 — Micrófono + feedback**
- `VoiceMicButton` (estados: inactivo/escuchando/procesando/error/éxito), junto al botón de sonido existente.
- Barra de estado con último transcript + resultado.
- `speak.ts` (TTS) con toggle persistido, cola de profundidad 1.

**Fase 3 — Validaciones y seguridad**
- Confianza estructural (nunca ejecutar si falta código o acción).
- Mensajes de rechazo reutilizando `getErrorMessage`.
- Eco visual+auditivo de cada acción ejecutada.

**Fase 4 — Sistema visual de estados**
- Paleta sin colisiones (azul/ámbar/esmeralda/violeta), franja lateral + ícono + label por ticket.
- Mostrar `orderNumber` en el ticket (reemplaza el fragmento de UUID).

**Fase 5 — Prioridad + tiempo transcurrido**
- Badge de prioridad en violeta.
- 3 niveles de urgencia por tiempo, contenidos al badge (no a toda la tarjeta), umbrales nombrados.

**Fase 6 — Responsive / Smart TV / Tablet**
- Verificación real en viewport grande (legibilidad a distancia) y tablet (ya sólido desde la Iteración 6) — mismo método de medición con `getBoundingClientRect` usado en esa iteración.

**Fase 7 — Testing y refinamiento**
- Tests de `commandParser.ts` con vitest (casos del punto 29 del brief).
- Input de "simular transcript" para verificar el pipeline sin micrófono real.
- Verificación manual completa en navegador (tsc/lint/build + flujo botón-only sigue idéntico + flujo voz).

---

Quedo a la espera de tu aprobación antes de tocar código. Dos decisiones puntuales que te pido confirmar explícitamente porque implican cambios de esquema/alcance:

1. **¿Apruebas agregar `order_number` (4 dígitos) a `dk_orders`** con el esquema de secuencia cíclica + índice único parcial descrito en 5.1? Es la base sin la cual no hay comandos de voz posibles.
2. **¿"confirmado" debe rechazarse con mensaje cuando se dice desde Cocina** (porque el ticket ya está confirmado por definición), o preferirías que la voz también pueda operar desde la pantalla de Pedidos en una fase futura? Para esta v1 asumo que no — el brief se enmarca como "KDS", así que la voz vive solo en Cocina.
