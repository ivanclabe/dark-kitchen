# ADR 0033: «Oye Quanela», la voz de toda la app, y Copilot conversacional

## Estado
**Aceptada e implementada (2026-10-06).** Se aprobó la revisión 2 con D1 a D11 tal como se recomendaron. Los resultados están en la sección 9.

En la revisión 1, «Oye Quanela» se quedaba en Cocina y Copilot tenía su propio micrófono. Pediste que **«Oye Quanela» gestione el manos libres, el reconocimiento de voz (STT) y la lectura en voz alta (TTS)**, que **salga del módulo de Cocina y esté disponible en toda la app**. Esta revisión lo incorpora.

**Reglas:**
- **No se crea un segundo asistente.** Quanela Copilot (ADR 0020) es quien responde; «Oye Quanela» es **cómo se le habla y cómo contesta**.
- **No cambian los flujos de pedidos ni de cocina.** Los comandos de Cocina («pedido 1042, listo») siguen con el mismo intérprete, las mismas mutaciones, los mismos bloqueos (cancelar con Vosk) y las mismas respuestas. Lo que se mueve es **la plomería de la voz** (micrófono, palabra de activación, reconocimiento y lectura), no la lógica de los pedidos.
- **Copilot sigue siendo de solo lectura** fuera de los comandos de Cocina, que ya existen.
- Se mantienen RBAC, RLS y el aislamiento por cuenta.
- No se inventan datos.
- Textos en español; la marca es **Quanela**.
- El manual no se toca.

---

## 1. Auditoría (2026-10-06)

### 1.1 Lo que ya existe
| Pieza | Dónde | Estado |
|---|---|---|
| **Copilot** | Icono en la barra superior (escritorio y celular), Ctrl/⌘ + J, panel lateral. La Edge Function `dk-copilot` (Anthropic) tiene 10 herramientas de datos (`dk_copilot_*`, SECURITY INVOKER + RLS), enlaces seguros, cuota y registro en `dk_ai_insights` | Funciona; solo texto |
| **«Oye Quanela»** | `shared/voice/wakeWord/*`: captura (AudioWorklet), modelo ONNX **en el equipo**, `useWakeWord`, tono y ajustes. Está conectado **solo** en `kitchen/views/KitchenView.tsx` y se enciende por equipo (`dk-kitchen-wake-word`) | Funciona; solo en Cocina |
| **STT** | `shared/voice/recognition/engines.ts`: **navegador** (texto libre, el audio pasa por el servicio del navegador) o **Vosk** (en el equipo, pero solo entiende la gramática de comandos). `kitchen/voice/speechRecognition.ts` es genérico, aunque vive en Cocina | Funciona; solo en Cocina |
| **TTS** | `shared/voice/speechQueue.ts`: cola única con prioridades (`command` > `alert` > `insight`), voces del equipo, voz fijada por equipo y perfiles de voz. `useKitchenVoice()` es la única puerta | Funciona; atado a `voice_speech`, que exige **`kitchen.view`** |
| **Motor de comandos de Cocina** | `kitchen/voice/useVoiceCommandEngine.ts` (mezcla micrófono, STT, intérprete, ejecución y TTS), con `commandParser`, `commandGrammar` y `spokenNumbers` (estos tres con pruebas) | Funciona; el motor **no tiene pruebas** |

### 1.2 Lo que impide llevarlo a toda la app
| Bloqueo | Detalle |
|---|---|
| La voz está **dentro de una pantalla** | El micrófono, «Oye Quanela» y el STT viven en `KitchenView`: salen de Cocina y se apagan |
| **Permisos de cocina** | `voice_speech` y `voice_wake_word` exigen `kitchen.view`. Inventario o Domiciliario nunca podrían usar la voz, aunque tengan Copilot |
| **El motor mezcla capas** | `useVoiceCommandEngine` es a la vez micrófono, reconocimiento, intérprete de pedidos y voz de respuesta. No se puede reutilizar sin separarlo |
| **Un solo destino** | Después de «Oye Quanela» solo se aceptan comandos de pedido. Una pregunta no tiene a dónde ir |
| **Vosk no sirve para preguntas** | Solo reconoce las palabras de los comandos. Las preguntas libres necesitan el motor del navegador |
| **Claves por equipo con nombre de cocina** | `dk-kitchen-*` (manos libres, reconocedor, voz y respuesta hablada) |

### 1.3 Riesgos encontrados en Copilot (verificados en la base)
| # | Riesgo | Gravedad |
|---|---|---|
| R1 | **Cualquier miembro de la cuenta puede leer las preguntas y respuestas de Copilot de los demás.** La política de lectura de `dk_ai_insights` solo exige `dk_can_use_feature('copilot')`, y los 6 roles del sistema tienen `copilot.use`. La inserción tampoco amarra `created_by`. Hoy hay 1 fila | **Alta**: se corrige primero |
| R2 | La cuota se revisa al empezar y se descuenta al terminar: varias pestañas a la vez se la saltan | Media |
| R3 | El tope diario se comparte con los análisis automáticos de IA | Media |
| R4 | Se envían al modelo los teléfonos de clientes y las notas libres de los pedidos | Media (privacidad) |
| R5 | Imprecisiones de las herramientas: las ventas incluyen pedidos sin confirmar; «pagado» sale 0 sin permiso de cartera; «en cocina» incluye los listos; no hay herramienta para el próximo turno | Media (precisión) |
| R6 | Hasta 7 llamadas de 45 s en serie, sin caché del prompt y con las herramientas en serie | Media (tiempo) |

---

## 2. Arquitectura propuesta

```
                         AppLayout (toda la app, una por cuenta)
 ┌───────────────────────────────────────────────────────────────────────────┐
 │  VoiceProvider — «Oye Quanela»  (src/modules/voice)                         │
 │                                                                             │
 │   Manos libres ──► palabra «Oye Quanela» (ONNX, en el equipo)               │
 │   o 🎙 / Ctrl+Shift+J ─┐                                                    │
 │                        ▼                                                    │
 │   Escuchar (STT) ── navegador (texto libre) · Vosk (solo comandos)          │
 │                        │ frase                                             │
 │                        ▼                                                    │
 │   Enrutador ──► ¿hay un manejador de la pantalla que la reconoce?           │
 │                 ├─ Sí: Cocina (comandos de pedido, el mismo intérprete)     │
 │                 └─ No: Copilot (pregunta → dk-copilot → respuesta)          │
 │                        │                                                    │
 │                        ▼                                                    │
 │   Hablar (TTS) ── la cola única del equipo (voces del equipo)               │
 │                 prioridades: comando > alerta > respuesta > análisis        │
 └───────────────────────────────────────────────────────────────────────────┘
   Barra superior: [● Oye Quanela]  [✦ Copilot]
```

### 2.1 «Oye Quanela» como servicio de la app (`src/modules/voice`)
- **`VoiceProvider`**, montado en `AppLayout` igual que Copilot y con `key` por cuenta, es el **único dueño del micrófono**. Tiene una máquina de estados explícita:

  `apagado → esperando «Oye Quanela» → escuchando → procesando → hablando → esperando`

  - Hay un solo `getUserMedia` a la vez: la palabra de activación libera el micrófono mientras el STT escucha. Es lo que ya hace `useWakeWord` con `suspended`.
  - Mientras la app habla no escucha la palabra, con la cola de 700 ms que ya existe.
  - Se **pausa sola** cuando la pestaña se oculta (`visibilitychange`) y vuelve al mostrarse.
- **Manejadores por pantalla** (`useVoiceHandler`): una pantalla **registra** un manejador mientras está montada, y el enrutador le pregunta primero.

  ```
  { id: 'kitchen-commands', grammar?, canHandle(frase) → confianza, handle(frase) → respuesta hablada }
  ```

  - **Cocina** registra el intérprete de comandos que existe hoy (`commandParser` + las mismas mutaciones, confirmaciones y bloqueos). **Su comportamiento no cambia**: lo que antes hacía `useVoiceCommandEngine` lo hace ahora ese manejador, con el micrófono del servicio.
  - **Copilot** es el **manejador por defecto**: toda frase que nadie más reconoce va a Copilot como pregunta.
  - Un comando de pedido dicho **fuera de Cocina** no se ejecuta, como hoy. Copilot responde dónde hacerlo: «Desde aquí solo consulto; en Operación → Cocina puedes decir “pedido 1042, listo”».
- **Motor de reconocimiento:**
  - Con el **navegador**, entra cualquier frase: comandos y preguntas.
  - Con **Vosk** (elegido en el equipo para la cocina), solo entran comandos de Cocina, como hoy. Si se oye algo que no es un comando, «Oye Quanela» dice: «Para preguntas, cambia el reconocedor a “navegador” en este equipo». No se envía basura a Copilot.
- **Voz (TTS):** la cola actual (`speechQueue`) pasa a llamarse **`deviceSpeech`** y se agrega la prioridad **`answer`**, entre alerta y análisis. **Un aviso de cocina nunca queda tapado por una respuesta.**
  - Se lee el resumen hablado de Copilot (`spoken`, 1 o 2 frases), nunca las tablas.
  - Las respuestas de los comandos de Cocina se dicen igual que hoy.
- **Lo que pasa a `src/modules/voice`** (código de voz, sin lógica de pedidos):
  - `speechRecognition.ts`, `WakeWordIndicator`, `WakeWordPanel`, `CommandRecognitionPanel` y `VoiceMicButton`;
  - la conexión de `useWakeWord` que hoy está en `KitchenView`.
  - **Se quedan en Cocina:** `commandParser`, `commandGrammar`, `spokenNumbers`, `kitchenPhrases` y el manejador de comandos.

### 2.2 Permisos y funciones (D9)
- **Permiso nuevo `voice.use`** («Usar Oye Quanela»):
  - se da a **todos los roles del sistema**;
  - la migración también lo da a **todo rol propio que hoy tenga `kitchen.view`**, para que **nadie pierda la voz que ya usa**.
- **`voice_wake_word`** (manos libres) y **`voice_speech`** (hablar) pasan a exigir `voice.use` en lugar de `kitchen.view`. `voice_wake_word` deja de depender de `voice_commands`.
- **`voice_commands`** sigue exigiendo `kitchen.view`: son los comandos de pedido de Cocina.
- **Preguntar por voz** exige además Copilot (`copilot` usable).
- En un plan sin Copilot (Standard), «Oye Quanela» solo aparece donde puede hacer algo: Cocina.
- **Planes:** los mismos de hoy para la voz (Standard o superior). Las preguntas siguen el plan de Copilot (Business y Enterprise).

### 2.3 Privacidad
- La palabra «Oye Quanela» se detecta **en el equipo**: no sale audio mientras espera.
- **Solo después de «Oye Quanela»** (o del 🎙), y con el motor del navegador, el audio de esa frase pasa por el servicio del navegador. Se avisa antes de la primera vez.
- **Manos libres viene apagado** en cada equipo y lo enciende la persona. Mientras está encendido, el **indicador está siempre visible** en la barra superior, y un toque lo pausa.

---

## 3. Fases

### Fase 0: seguridad y cuota de Copilot (va primero)
1. **R1:** las filas `copilot` de `dk_ai_insights` solo las lee su autor, y la inserción exige `created_by = dk_current_profile_id()`. Los conteos de uso (agregados) no cambian.
2. **R2:** cuota atómica. `dk_ai_run_allowed` **reserva** la corrida (`running`) al aprobarla, y al final pasa a `ok`, `error` o `cancelled`.
3. **R3:** Copilot tiene su propio tope diario (D5).
4. **R4:** `dk_copilot_customers` envía el teléfono solo si la pregunta es de contacto (`include_contact`).
5. **R5:**
   - las ventas excluyen lo que no está confirmado;
   - «pagado» sale solo con `receivables.view`;
   - «en cocina» queda en *en cola + preparando*;
   - `dk_copilot_staff` acepta un rango de días.

### Fase 1: «Oye Quanela» en toda la app (icono y activadores)
1. **`src/modules/voice`:** `VoiceProvider`, la máquina de estados, el dueño único del micrófono, el registro de manejadores y el enrutador. Los archivos de voz salen de Cocina (sección 2.1).
2. **Cocina pasa a ser un manejador.**
   - `KitchenView` deja de crear el micrófono y la palabra de activación, y registra el manejador de comandos.
   - **Pruebas de regresión antes y después del traslado:** cada intención (confirmar, iniciar, listo, cancelar, prioridad), los bloqueos (cancelar con Vosk y confianza baja) y las respuestas habladas.
3. **Barra superior, junto a ✦ Copilot:**
   - **Indicador «Oye Quanela»**, visible si el manos libres está encendido en el equipo. Sus estados: esperando, escuchando, procesando, hablando, en pausa y error de micrófono. Un toque pausa o reanuda.
   - **Ctrl/⌘ + Shift + J** escucha una frase sin decir «Oye Quanela» (pulsar para hablar).
   - En el celular, el indicador va compacto, junto al icono de Copilot.
4. **Panel de Copilot:**
   - 🎙 (pulsar para hablar, con la transcripción en vivo y editable) y ⏹ (detener escucha, lectura o consulta);
   - 🔊 lee las respuestas en este equipo. Al preguntar por voz se lee siempre, y al escribir, según esta preferencia.
5. **Configuración → IA y voz → Este dispositivo**, que pasa a ser **«Oye Quanela en este equipo»**:
   - manos libres;
   - reconocedor (navegador o Vosk);
   - voz;
   - respuesta hablada;
   - sensibilidad (los ajustes que ya existen).
   - Las claves `dk-kitchen-*` se migran solas a `dk-voice-*` y se conserva lo que cada equipo ya había elegido.
6. **Permisos y funciones:** `voice.use` y el cambio de `voice_wake_word` y `voice_speech` (D9), con su migración y suite SQL.
7. **Accesibilidad:**
   - `aria-live` para cada estado;
   - todo se puede usar con teclado;
   - el foco va al campo de Copilot;
   - no se reproduce audio sin un gesto previo (requisito de iOS).

### Fase 2: intenciones y respuestas
**El contrato de cierre (`answer`):** toda respuesta de Copilot termina con una herramienta obligatoria:
```
intent:  sales | orders | order_detail | kitchen | products | ingredients | purchases |
         customers | payments | deliveries | staff | app_help | smalltalk | other
scope:   answered | partial | no_data | not_allowed | unsupported | out_of_scope | action | clarify
answer:  markdown (primero la respuesta; tablas de 8 filas como máximo)
spoken:  1 o 2 frases para leer en voz alta (sin tablas ni enlaces, con las cifras en palabras naturales)
followUp: hasta 2 preguntas sugeridas
```

| Intención | Herramienta | Permiso | Ejemplo hablado |
|---|---|---|---|
| Ventas | `sales` | `reports.view` | «Oye Quanela, ¿cuánto vendimos hoy?» |
| Pedidos | `orders` | `orders.view` | «¿Qué pedidos se están demorando?» |
| Un pedido | `order_detail` | `orders.view` | «¿Cómo va el pedido 1042?» |
| Cocina | `kitchen_performance` | `kitchen.view` | «¿Cómo van los tiempos de cocina?» |
| Platos y margen | `products` | `products.view` (+ `reports.profitability`) | «¿Qué plato deja más margen?» |
| Insumos | `ingredients` | `inventory.view` | «¿Qué insumos están por agotarse?» |
| Compras | `purchases` | `purchasing.view` | «¿Cuánto le compramos a cada proveedor?» |
| Clientes | `customers` | `customers.view` (+ `receivables.view`) | «¿Quién me debe más?» |
| **Cobros** (nuevo) | `payments` sobre `dk_order_payments` (ADR 0031) | `receivables.view` | «¿Cuánto cobramos hoy en efectivo?» |
| Domicilios | `deliveries` | `dispatch.view` | «¿Cómo van las entregas?» |
| Turnos | `staff` (+ rango de días) | `copilot.use` (lo propio) o `staff.view` | «¿Cuándo es mi próximo turno?» |
| **Ayuda de la app** (nuevo) | `app_help`: un catálogo fijo de pantallas y acciones, filtrado por permisos | `copilot.use` | «¿Dónde registro un pago?» |
| **Comandos de Cocina** (sin cambios) | Manejador de Cocina, no Copilot | `kitchen.prepare` y los de cada acción | «Pedido 1042, listo» (en la vista Cocina) |

### Fase 3: errores y preguntas fuera de alcance
| `scope` | Respuesta (hablada y escrita, sin salir del negocio) |
|---|---|
| `no_data` | «No hay pedidos entregados ayer.» Y dónde verlo |
| `not_allowed` | «Tu rol no permite ver la cartera. Pídeselo a quien administra la cuenta.» Sin pistas del dato |
| `unsupported` | «Quanela todavía no registra gastos; no puedo calcular la utilidad neta. Sí puedo darte ingresos y costo de lo vendido.» |
| `out_of_scope` | «Solo puedo ayudarte con tu negocio en Quanela: ventas, pedidos, cocina, inventario, clientes y equipo.» Más 2 sugerencias de su rol |
| `action` | Fuera de Cocina, o algo que no es un comando de Cocina: «Desde aquí solo consulto; puedes hacerlo en …», con enlace. **No ejecuta nada** |
| `clarify` | Una sola pregunta corta, o asume «hoy» y lo dice |
| `partial` | Responde lo que obtuvo y dice qué faltó |

**Errores de voz y de la consulta:**

| Caso | Manejo |
|---|---|
| Permiso de micrófono denegado | El indicador pasa a error y explica cómo darlo. El manos libres se pausa, no reintenta en bucle |
| Navegador sin soporte (Firefox, Safari irregular) | «Oye Quanela» no se ofrece en ese equipo, con el motivo. Copilot por texto sigue igual |
| «Oye Quanela» se activó pero no se oyó nada | Un tono corto de fin y vuelve a esperar, sin enviar nada |
| Falsa activación | Se descarta si la frase sale vacía o es demasiado corta. Se cuenta en métricas para ajustar la sensibilidad |
| Sin red, tiempo agotado o error del modelo | Mensaje + **Reintentar** (hablado: «No pude consultar, intenta de nuevo») |
| Cuota | «Puedes preguntar de nuevo en 5 s» o «Llegaste al tope diario de Copilot» |
| Respuesta cortada (`max_tokens`) | Se detecta y se marca `partial` |
| Cancelar | ⏹ o decir «Oye Quanela, cancela»: corta la escucha, la lectura o la consulta (`AbortController`). La corrida queda `cancelled` |
| La pestaña se oculta o la pantalla se bloquea | Se pausa y se reanuda al volver. Ya no sorprende el corte de iOS |

**Robustez del agente:**
- herramientas en paralelo;
- `cache_control` en el sistema y en las herramientas;
- un reintento ante 429 o 529;
- 25 s como máximo por pregunta, con cierre `partial`;
- historial acotado;
- los errores previos al bucle también se registran.

### Fase 4: prueba de precisión, claridad y tiempo
1. **Set de 80 preguntas** sobre una cuenta de prueba con datos fijos:
   - unas 50 respondibles;
   - 10 sin permiso;
   - 8 sin dato en Quanela;
   - 8 fuera de alcance;
   - 4 de acción.
2. **Set de voz:**
   - **30 frases** dichas en la app (pregunta y comando), con y sin ruido;
   - **20 minutos de audio de oficina y de cocina sin la frase**, para medir las falsas activaciones.
3. **Ejecutor** `scripts/copilot-eval.ts`: produce un informe en JSON y en Markdown. Se corre a mano y antes de cambiar el modelo o el prompt.

| Dimensión | Cómo se mide | Meta |
|---|---|---|
| Intención y alcance | `intent` y `scope` del contrato frente a lo esperado | ≥ 95 %; 100 % en `not_allowed` y `out_of_scope` |
| Cifras | Contra el fixture | ≥ 95 %; **0 inventadas** |
| Enrutamiento | Comandos a Cocina y preguntas a Copilot | 100 % en la vista Cocina; 0 comandos ejecutados fuera de Cocina |
| Claridad | Rúbrica de 1 a 5 (juez automático de bajo costo + revisión humana del 20 %) | Promedio ≥ 4,2 |
| Tiempo | Fin de la frase → inicio de la lectura, y envío → respuesta (cliente); `latency_ms` por ronda y por herramienta (servidor) | Respuesta p50 ≤ 4 s y p90 ≤ 8 s; «Oye Quanela» → escuchando ≤ 300 ms |
| Palabra de activación | Detecciones en las 30 frases y falsas activaciones por hora en el audio sin la frase | ≥ 90 % de detección; ≤ 1 falsa por hora |
| STT | Tasa de error de palabras de las 30 frases | ≤ 15 % en silencio (referencia con ruido) |

4. **En la app:**
   - 👍/👎 en cada respuesta;
   - «Uso y estado» suma latencia p50 y p90, `scope`, 👎 y falsas activaciones informadas.

---

## 4. Cambios en la base
| Migración | Qué |
|---|---|
| Fase 0 | Políticas de `dk_ai_insights` (autor). La reserva atómica y los estados `running` y `cancelled`. El tope propio de Copilot. Los ajustes de `dk_copilot_customers`, `dk_copilot_staff` y R5 |
| Fase 1 | El permiso `voice.use` (roles del sistema + roles propios con `kitchen.view`). `voice_wake_word` y `voice_speech` pasan a `voice.use`, y `voice_wake_word` deja de depender de `voice_commands` |
| Fase 2 | `dk_copilot_payments`. Las columnas `intent`, `scope`, `feedback` y `timings` en `dk_ai_insights` |

Todas van con su suite SQL: autor, roles, aislamiento, cuota en paralelo, permisos de voz y cobros.

## 5. Futuro (no se simula)
| Mejora | Qué falta |
|---|---|
| STT en la nube | Costo por minuto, un secreto y una decisión de privacidad. Ayudaría en Safari y con ruido |
| TTS en la nube (voces neuronales) | Una Edge Function `dk-tts` y su costo. El adaptador `SpeechEngine` ya está previsto |
| Más palabras de activación o una por persona | Entrenar modelos nuevos |
| Acciones por voz fuera de Cocina (por ejemplo, registrar un pago) | Choca con la regla de solo lectura. Va en una ADR propia, con confirmación |
| Respuestas en streaming | Conviene después de medir en la Fase 4 |
| Conversaciones guardadas | Tablas de conversación y una política de retención |

## 6. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | ¿Asistente nuevo o Copilot? | **Copilot.** «Oye Quanela» es su voz |
| **D2** | Planes | La voz, como hoy (Standard o superior). Las preguntas, con Copilot (Business y Enterprise) |
| **D3** | Motor para preguntas | **El del navegador**, con aviso. Vosk queda solo para comandos de Cocina |
| **D4** | ¿Qué se lee? | **Solo `spoken`** |
| **D5** | Tope de Copilot | **Propio**: el 50 % del tope de IA del plan por día y por cuenta |
| **D6** | Métricas | **Columnas** en `dk_ai_insights` |
| **D7** | Teléfonos | **No se envían**, salvo en preguntas de contacto |
| **D8** | ¿La Fase 0 va primero? | **Sí**, aunque el resto espere |
| **D9** | Permiso de la voz | **`voice.use` nuevo**, dado a todos los roles del sistema y a los roles propios con `kitchen.view`. `voice_commands` sigue con `kitchen.view` |
| **D10** | ¿Comandos de pedido fuera de Cocina? | **No**, como hoy: Copilot explica dónde hacerlo |
| **D11** | Manos libres en toda la app | **Apagado por defecto en cada equipo**, con el indicador siempre visible, la pausa con un toque y la pausa automática con la pestaña oculta |

## 7. Orden de ejecución
| Fase | Qué | ¿Cambia pedidos o cocina? |
|---|---|---|
| 0 | Seguridad, cuota, privacidad y precisión de Copilot | No |
| 1 | `src/modules/voice` (servicio, enrutador, indicador y atajos); Cocina como manejador, con pruebas de regresión antes y después; `voice.use`; los ajustes «Oye Quanela en este equipo» | **La lógica no cambia.** Cocina deja de ser dueña del micrófono y registra su intérprete de siempre |
| 2 | El contrato `answer`, `payments`, `app_help` y la lectura de `spoken` | No |
| 3 | Alcances, errores, cancelar, reintentar, el paralelo, la caché y el límite de tiempo | No |
| 4 | Los sets de preguntas y de voz, el ejecutor, el informe, 👍/👎 y «Uso y estado» | No |
| — | Vitest, `tsc`, `oxlint`, builds, SQL, esta ADR con resultados y la arquitectura | — |

## 8. Qué necesito de ti
1. **Aprobar esta ADR**, con D1 a D11 confirmadas o corregidas.
2. Para medir la voz: **30 frases** grabadas y **unos 20 minutos de audio sin la frase** (oficina y cocina), o permiso para usar solo audio sintético.
3. Aceptar el consumo de unas 80 preguntas de Copilot por cada corrida de la prueba.

## 9. Resultados (2026-10-06)

### 9.1 Base de datos (aplicada, con sus suites)
| Migración | Qué |
|---|---|
| `20261006120000_dk_copilot_safety_quota.sql` | **R1:** las filas `copilot` de `dk_ai_insights` solo las lee y escribe su autor. **R2:** cuota atómica con `dk_ai_run_reserve` (con lock y una fila `running`), `dk_ai_run_finish` y `dk_ai_run_feedback`. **R3:** tope propio de Copilot (el 50 % del plan) e intervalo por persona. Columnas `intent`, `scope`, `feedback` y `timings`. **R4 y R5** en las herramientas |
| `20261006130000_dk_voice_app_wide.sql` | El permiso `voice.use` (roles del sistema y roles propios con `kitchen.view`). `voice_wake_word` y `voice_speech` pasan a `voice.use`, sin dependencia de `voice_commands` |
| `20261006140000_dk_copilot_payments.sql` | `dk_copilot_payments`: lo cobrado menos las anulaciones, por método y por día, y lo que queda por cobrar |
| `20261006150000_dk_copilot_context_actions.sql` | `dk_copilot_context` también dice qué acciones puede hacer la persona (para la ayuda de la app) |
| `20261006160000_dk_copilot_quality.sql` | `dk_account_ai_usage` suma el bloque `copilot`: preguntas, por voz, p50 y p90, alcances, 👍/👎 y canceladas |

Suites nuevas:
- `copilot_safety` (33): autor, cuota en paralelo, tope propio, cierre, calificación, herramientas, cobros y calidad.
- `voice_app_wide` (8).

Se actualizaron `permission_catalog` y `wake_word`. **SQL: 844/844.**

### 9.2 El agente (`supabase/functions/dk-copilot`, desplegado)
- **`contract.ts`:** el contrato `answer` (intent, scope, answer, spoken, follow_up). Se valida y se limpia; el resumen hablado lee «#1042» como «número 1042».
- **`appHelp.ts`:** 24 entradas de «dónde se hace», filtradas por los permisos y las acciones de quien pregunta.
- **Herramientas nuevas:** `payments` y `app_help`. `staff` acepta un rango de días y `customers` tiene `include_contact`.
- **El modelo siempre responde con una herramienta** (`tool_choice: any`) y termina con `answer`. Hay un cierre forzado si se acerca el límite.
- **Robustez:**
  - herramientas en paralelo;
  - `cache_control` en el sistema y en las herramientas;
  - un reintento ante 429 o 529;
  - 25 s como máximo, con respuesta `partial`;
  - se detecta `max_tokens`;
  - errores con su código (`TIMEOUT` y `AI_ERROR` se pueden reintentar; la cuota no);
  - cancelación por `requestId`.
- **Registro:** cada corrida queda con su intención, su alcance y sus tiempos por ronda y por herramienta.

### 9.3 La app
| Pieza | Qué |
|---|---|
| `src/modules/voice` | `VoiceProvider` es el único dueño del micrófono. Tiene la máquina de estados (escuchar, procesar, resultado), la palabra de activación (pausa con la pestaña oculta y ante «micrófono denegado»), el dictado, `Ctrl/⌘ + Shift + J`, «cancela» y el enrutador puro (`router.ts`). También el registro de manejadores (`useVoiceHandler`), `VoiceMenu` en la barra superior (estado, hablar ahora, manos libres, pausar, «Voz en este equipo»), `VoiceDeviceSettings` y las preferencias por equipo |
| `src/shared/voice` | La cola pasa a `deviceSpeech`, con la prioridad `answer`. La puerta de la voz es `useQuanelaVoice`. El reconocimiento genérico está en `recognition/useSpeechRecognition.ts`. Las preferencias están en `devicePrefs.ts` (`dk-voice-*`): copian solas el valor de `dk-kitchen-*` |
| Cocina | `kitchenCommands.ts` (decisión pura, **las mismas palabras de siempre**) y `useKitchenVoiceCommands`, que registra el manejador mientras la vista Cocina está abierta. El micrófono de Cocina y su prueba de texto usan «Oye Quanela». Se eliminó `useVoiceCommandEngine` y el indicador de manos libres pasó a la barra superior |
| Copilot | Micrófono para dictar (con la transcripción editable), ⏹, «Leer respuestas», **Reintentar**, la etiqueta del alcance, 👍/👎, preguntas sugeridas y `aria-live`. Es el manejador por defecto de «Oye Quanela» |
| Configuración → IA y voz | «Este dispositivo» lo ve también quien tiene `voice.use`. «Uso y estado» muestra el bloque Copilot: preguntas, por voz, mediana y p90, % útiles y alcances |

### 9.4 Prueba (Fase 4)
- **Set:** `supabase/tests/copilot_eval/questions.json` con **87 preguntas**:
  - 57 respondibles (incluidas 6 de ayuda de la app);
  - 10 sin permiso;
  - 8 sin dato en Quanela;
  - 8 fuera de alcance;
  - 4 de acción.
- **Ejecutor:** `scripts/copilot-eval.ts` (Node, sin dependencias nuevas):

  ```
  QUANELA_EVAL_TOKEN=<access_token de tu sesión> QUANELA_EVAL_KITCHEN=<id de la cuenta> node scripts/copilot-eval.ts
  ```

  - Opciones: `--dry` (muestra las preguntas sin enviarlas), `--only s1,c3` y `--limit 10`.
  - Con `ANTHROPIC_API_KEY` también califica la claridad con un juez (Haiku).
  - Escribe en `supabase/tests/copilot_eval/results/` (ignorado por git) un informe Markdown y JSON con las metas de la sección 3.
- **Puntuación** (`score.ts`, con pruebas): la cifra correcta aparece en la respuesta; no hay montos donde no hay dato; claridad de 1 a 5; percentiles; tasa de error de palabras (WER).
- **Voz:** `voice-phrases.json` tiene las 30 frases (15 preguntas y 15 comandos) y el procedimiento para medir la WER y las falsas activaciones.

### 9.5 Ajustes durante la ejecución
| Ajuste | Por qué |
|---|---|
| **Las ventas siguen contando los pedidos por confirmar**, como Insights. Copilot recibe aparte `unconfirmedOrders` y `unconfirmedTotal` | Si las excluía, Copilot e Insights darían cifras distintas para la misma pregunta. Así la respuesta puede aclararlo |
| Las columnas `intent`, `scope`, `feedback` y `timings` van en la migración de la Fase 0 | `dk_ai_run_finish` las necesita desde el primer cierre |
| **La prueba no usa una cuenta de prueba con datos fijos**: corre sobre la cuenta que elijas y calcula la cifra correcta con la misma función de datos y tu sesión | No corresponde crear cuentas ni datos permanentes en producción. El resultado mide lo mismo |
| 87 preguntas en lugar de 80 | Se sumaron las de ayuda de la app |
| `CommandRecognitionPanel` se queda en Cocina | Su «Probar» muestra qué comando de pedido entendió. `VoiceDeviceSettings` lo incluye |
| Los ajustes de voz del equipo también se abren desde la barra superior («Voz en este equipo») | Configuración exige permisos de administración, pero cada persona debe poder ajustar su equipo |
| **Corrección tras la primera prueba real (2026-10-06):** el modelo de Copilot (`claude-sonnet-5-5`) no acepta `tool_choice: any/tool` | Todas las preguntas fallaban con un error 400 de Anthropic. Ahora el modelo elige (el prompt le pide cerrar con `answer`); si responde en texto, ese texto es la respuesta y la intención se deduce de la última herramienta (`answerFromText`) |
| El intervalo de 5 s de Copilot ya no cuenta las preguntas fallidas (migración `20261006170000`) | «Reintentar» respondía «Espera 3 s». El tope diario sí las sigue contando |
| La frase «Oye Quanela» se quita del inicio de lo oído (`stripWakePhrase`, que no toca palabras como «canela») | El reconocedor la colaba en la pregunta («oye juanela…») |
| Los tiempos del cliente no se guardan en la base | El ejecutor los mide de extremo a extremo; el servidor guarda los suyos por ronda y por herramienta |

### 9.6 Validación
| Prueba | Resultado |
|---|---|
| Vitest | **488/488** (+39): enrutador, regresión de los comandos de Cocina, servicio de voz, contrato y ayuda, panel de Copilot y puntuación de la prueba |
| SQL | **844/844** |
| `tsc` (app), tipos de la Edge Function y del ejecutor | limpios |
| oxlint | 14 avisos, sin nuevos |
| Builds de la app y del portal | pasan |
| Vista previa | todos los módulos cargan sin errores |

**Pendiente de tu parte:**
1. Iniciar sesión y probar «Oye Quanela» (encenderlo desde la barra superior → «Manos libres en este equipo») en Cocina y en otras pantallas.
2. Correr `scripts/copilot-eval.ts` con tu token: consume unas 87 preguntas de Copilot y tarda unos 10 minutos.
3. Grabar las 30 frases de voz.

**Nota:** el conector de Supabase de esta sesión apunta a otro proyecto. Todo se hizo contra `cqfzcwpqisaohcjaevxf` con la CLI.

