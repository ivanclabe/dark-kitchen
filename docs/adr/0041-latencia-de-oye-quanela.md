# ADR 0041: Latencia de «Oye Quanela»

## Estado
**Aprobada e implementada (2026-10-07).** Falta la prueba con micrófono real (la haces tú) y decidir el modelo para voz (D8) con `copilot-eval --channel voice`.

**Pedido:** que «Oye Quanela» responda más rápido.

**Meta:** que entre el momento en que terminas de hablar y el momento en que Quanela empieza a responder pasen **2 a 4 segundos menos** en una pregunta típica a Copilot. Además, que «Oye Quanela» funcione justo después de una respuesta, sin un rato en que no oye. Las cifras de esta ADR son **estimadas**: salen de leer el código. Al consultar los tiempos reales guardados, la API de Supabase respondió 502. Por eso la Fase 0 mide cada paso antes de comparar.

---

## 1. Auditoría: el recorrido de una pregunta

| # | Paso | Hoy (archivo) | Costo estimado |
|---|---|---|---|
| 1 | Detectar la frase | 3 modelos ONNX cada 80 ms en el hilo principal. Dispara con 2 puntajes seguidos ≥ 0,9 (`wakeWordStream.ts`, `tuning.ts`) | ~0,1–0,2 s tras decir «Quanela». Está bien |
| 2 | Empezar a escuchar | Suelta el micrófono, **espera el tono completo** (`await playWakeTone()`, 220 ms) y solo después arranca el reconocedor del navegador (`VoiceProvider.startSession`) | 0,2 s + 0,3–1 s de arranque. Lo que digas antes se pierde, así que la gente aprende a esperar |
| 3 | Saber que terminaste | `VOICE_PHRASE_DELAY_MS = 1800`: espera 1,8 s sin cambios en el texto. El navegador avisa cuándo un resultado es definitivo (`isFinal`), pero `engines.ts` descarta esa señal | **1,8 s fijos en cada pregunta** |
| 4 | Llamar a `dk-copilot` | `supabase.functions.invoke`: la respuesta llega toda junta. La función puede arrancar en frío | 0,3–1 s en la primera pregunta |
| 5 | Preparar la consulta | `dk_ai_run_reserve` y **después** `dk_copilot_context`, una tras otra | 2 viajes a la base (~0,1–0,2 s) |
| 6 | Pensar | Al menos 2 rondas de **Claude Sonnet 5.5** (el modelo de `copilot`, migración `20261001140000_dk_copilot.sql`). La última escribe la respuesta Markdown completa **y** la frase hablada antes de enviar nada | **Lo más lento**: varios segundos |
| 7 | Cerrar el registro | `dk_ai_run_finish` se espera **antes** de responder | ~0,05–0,15 s |
| 8 | Hablar | `speechSynthesis` del equipo empieza cuando llega la respuesta entera. Las voces que funcionan por internet tardan más en arrancar | 0,1–0,8 s según la voz |
| 9 | Volver a oír «Oye Quanela» | Al detectar, el detector se destruye y se crea otro (micrófono nuevo y ~2 s de calentamiento). Además, cada vez que Quanela habla, el detector se **reinicia** (`stream.reset()`) y vuelve a calentar ~2 s | Después de cada respuesta hay **~2,7 s en que no oye** |

**Ya funciona bien y no se toca:** el caché del prompt y de las herramientas, las herramientas en paralelo dentro de una ronda, la cola de voz y la detección en el equipo.

## 2. Decisiones (con recomendación)

| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Medir cada paso | Cada pregunta por voz guarda sus tiempos en el registro que ya existe (`dk_ai_insights.timings`): <br>• **en la app:** frase detectada → escuchando; última palabra → pregunta cerrada; pregunta cerrada → respuesta; respuesta → Quanela empieza a hablar;<br>• **en el servidor:** preparación (cupo y contexto), cada ronda (como hoy) y cuándo estuvo lista la frase hablada.<br>Los tiempos de la app llegan con la pregunta. El inicio de la voz se manda después, con una llamada que no espera respuesta (`action: 'timings'`) y solo sobre la consulta propia. No hay tablas nuevas. En los resultados de esta ADR queda la consulta SQL que da la mediana y el p90 de cada paso |
| **D2** | Cerrar la frase con la señal del navegador | El reconocedor entrega el texto y si ya es definitivo (en el navegador, `isFinal`; en Vosk, el evento `result`). <br>• Con texto definitivo: se cierra a los **500 ms** si no llegan más palabras.<br>• Con texto provisional: se espera **1.200 ms** (hoy 1.800).<br>• En el dictado de Copilot: 700 ms y 1.500 ms.<br>Si llegan más palabras, el conteo vuelve a empezar, así que una pausa corta no corta la frase. Los valores quedan en constantes para ajustarlos con lo que mida D1. Vale para Copilot y para los comandos de cocina |
| **D3** | Escuchar desde el tono | El reconocedor arranca **al mismo tiempo** que suena el tono, no después. Lo que digas mientras suena ya cuenta. Si el reconocedor llegara a captar el tono, la regla de hoy lo descarta (texto vacío o una sola palabra después de una respuesta) |
| **D4** | Preparar la función | Al detectar «Oye Quanela», mientras la persona todavía habla, la app manda `{ action: 'warm' }` a `dk-copilot`. Solo se hace si Copilot puede responder en esa pantalla, y como máximo una vez por minuto. La función exige sesión, responde **204** sin tocar la base y no gasta cupo. Así la pregunta encuentra la función despierta |
| **D5** | Servidor sin filas de espera | `dk_ai_run_reserve` y `dk_copilot_context` corren **en paralelo**. `dk_ai_run_finish` se guarda **después** de responder (`EdgeRuntime.waitUntil`). Las respuestas de error siguen iguales |
| **D6** | Detector siempre listo | • Mientras Quanela habla, el detector recibe **silencio** (un ruido mínimo) en lugar de saltarse el audio y reiniciarse. Así no se llena con su voz y no tiene que calentar otra vez.<br>• Al detectar la frase o mientras atiende, el detector **pausa** y se reanuda; ya no se destruye. El micrófono sigue abierto, como ya pasa en manos libres, y no busca la frase mientras atiende.<br>• **Safari / iOS** conservan el comportamiento de hoy (soltar el micrófono), porque dos capturas a la vez no son confiables ahí |
| **D7** | Hablar mientras se escribe la respuesta | Solo cuando la pregunta llega **por voz**: <br>• la app pide la respuesta por partes (`stream: true`), leyendo la respuesta con `fetch` y los mismos encabezados de hoy (sesión, cuenta y rol);<br>• el servidor usa el modo por partes de Anthropic. Cuando el modelo escribe la herramienta `answer` y la frase **`spoken`** queda completa, la limpia con el mismo `cleanSpoken` y la envía (`event: spoken`); al final envía la respuesta completa, igual que hoy (`event: final`);<br>• en el esquema, `spoken` va **antes** que `answer`, y el prompt pide escribirla primero;<br>• Quanela empieza a hablar con `spoken` y no lo repite al llegar `final`.<br>Si el modelo escribe `spoken` al final o la red junta las partes, queda igual que hoy, sin empeorar. El chat escrito no cambia |
| **D8** | Modelo para la voz | Un ajuste nuevo en el portal de administración, en la función `copilot`: **«Modelo para preguntas por voz»**. Vacío significa el mismo modelo de siempre. `dk_ai_run_reserve` lo usa cuando `channel = 'voice'`, solo si ese modelo está activo. **Queda vacío por defecto**: nada cambia hasta que lo elijas. Para decidir, `copilot-eval` suma `--channel voice` y compara Sonnet 5.5 con Haiku 4.5 en las mismas preguntas. Se recomienda Haiku solo si **no inventa cifras**, acierta lo mismo o hasta 2 puntos menos, y responde más rápido. La evaluación necesita tu sesión, así que la corres tú (yo te dejo el comando) |
| **D9** | La voz del equipo | En «Voz en este equipo», al lado de la voz elegida: **«en línea»** o **«instalada»**. Si es en línea, aparece una pista: «Las voces instaladas en el equipo empiezan a hablar antes». Es solo informativo; no cambia la voz de nadie |
| **D10** | Ayuda | Actualizar el artículo «Oye Quanela» del centro de ayuda (puedes hablar desde el tono; responde más rápido; la pista de la voz instalada) y las notas de versión. Después, `npm run help` y desplegar `dk-copilot`, porque la base de conocimiento cambia. **El manual no se toca** |

**Ahorro esperado** (estimado; se confirma con D1):

| Paso | Hoy | Después |
|---|---|---|
| Saber que terminaste (D2) | 1,8 s | ~0,5 s con texto definitivo |
| Empezar a escuchar (D3) | tono + arranque | arranque (−0,2 s, y no se pierden palabras) |
| Primera pregunta (D4) | + arranque en frío | sin arranque en frío (−0,3–1 s) |
| Servidor (D5) | 2 viajes en fila + cierre | 1 viaje (−0,1–0,3 s) |
| Primera palabra de la respuesta (D7) | al final de todo | apenas está la frase hablada (−1–3 s según el largo del detalle) |
| Oír «Oye Quanela» otra vez (D6) | ~2,7 s en que no oye | ~0,7 s (el margen por el eco) |

## 3. Fases
| Fase | Qué |
|---|---|
| 0 · Medir (D1) | La app marca los tiempos de cada turno. `dk-copilot` guarda la preparación, las rondas y la frase hablada, y recibe los tiempos de la app y `action: 'timings'`. Una migración agrega `dk_ai_run_client_timings(p_run_id, p_timings)`: solo deja escribir sobre la consulta propia y valida números entre 0 y 60.000 ms. Los tiempos del servidor anteriores a esta ADR (`timings.rounds`, `total`) sirven como punto de partida |
| 1 · App (D2, D3, D6) | `engines.ts` entrega el texto con su señal de definitivo. `VoiceProvider` cierra la frase según D2 y arranca el reconocedor junto con el tono. `useWakeWord` y `capture` pausan en lugar de destruir y alimentan silencio mientras Quanela habla, con la excepción de Safari/iOS |
| 2 · Servidor y respuesta por partes (D4, D5, D7) | `dk-copilot`: `warm`, la preparación en paralelo, el cierre del registro en segundo plano, Anthropic por partes, extraer `spoken` del JSON a medio llegar y los eventos `spoken` / `final`. `contract.ts`: `spoken` primero en el esquema. App: `askCopilotStream` en `api.ts` y el manejador de voz de Copilot hablando con `spoken`. Se despliega la función |
| 3 · Modelo para la voz (D8) | Una migración: `dk_ai_run_reserve` respeta el modelo para voz, validado contra los modelos activos. Portal de administración (`FeatureDrawer`): el selector «Modelo para preguntas por voz». `scripts/copilot-eval.ts`: la opción `--channel voice` |
| 4 · Voz del equipo y ayuda (D9, D10) | La pista en «Voz en este equipo», el artículo de ayuda, las notas de versión, `npm run help` y desplegar otra vez |
| — | **Validación:**<br>• Vitest: el cierre de frase con reloj falso (definitivo, provisional, pausas cortas, dictado), la señal de definitivo de cada motor, la extracción de `spoken` a medio llegar (comillas, escapes, `spoken` al final, respuesta cortada), la lectura de eventos en la app, el detector con silencio y pausa, y el manejador de voz que no repite la frase.<br>• SQL: el modelo para voz (activo, inactivo, vacío) y `dk_ai_run_client_timings` (propia sí, ajena no, valores fuera de rango).<br>• Chequeo de tipos de la función, `tsc`, `oxlint` y los dos builds.<br>• **La prueba con micrófono la haces tú**, porque yo no puedo hablarle. Te dejo la consulta de D1 para comparar antes y después |

## 4. Riesgos
| Riesgo | Mitigación |
|---|---|
| Cortar la frase antes de tiempo («pedido mil cuarenta y dos… listo») | El cierre rápido solo aplica con texto **definitivo**, y cada palabra nueva reinicia el conteo. Los valores son constantes que se ajustan con D1. Hay pruebas con pausas típicas de cocina |
| Que el silencio artificial confunda al detector (D6) | Se usa un ruido mínimo, no ceros exactos, para que el log-mel no se dispare. Antes de cerrar, se revisa con el medidor «Probar» de manos libres: la frase debe seguir disparando y el silencio no |
| Dos capturas del micrófono a la vez | Solo en navegadores que lo soportan bien. Safari/iOS conservan el comportamiento de hoy. Si abrir la captura falla, se vuelve al comportamiento de hoy |
| Que la respuesta por partes no llegue en partes (un proxy que la junta) | La app espera `final` como hoy: no empeora. La frase hablada pasa por la misma limpieza que la respuesta final |
| Que el modelo escriba `spoken` después de `answer` | Igual que hoy: se habla cuando llega `final` |
| Calidad con un modelo más rápido | Está apagado por defecto. Solo se activa si `copilot-eval` lo respalda, y lo decides tú |
| Abuso de `warm` | Exige sesión, no toca la base, no gasta cupo y la app lo manda como máximo una vez por minuto |

## 5. Lo que no entra
- **Un reconocedor en la nube** (con mejor detección del fin de la frase). Cuesta cada mes y necesita llaves que pondrías tú. Se reconsidera solo si después de esta ADR la medición sigue mostrando el paso 2 o el 3 como cuello de botella.
- **Mover el detector a un proceso aparte.** Solo si D1 muestra que el detector se atrasa y se reinicia con frecuencia (hoy lo hace cuando acumula más de 1 s de audio).
- **Respuesta por partes en el chat escrito.** Puede ser otra ADR.
- **Empezar a consultar antes de que termines de hablar** (con el texto provisional). Gasta cupo con preguntas a medias.

## 6. Para aprobar
1. **D2:** cerrar a los 500 ms con texto definitivo y a los 1.200 ms con texto provisional, ajustables después de medir.
2. **D6:** Safari/iOS se quedan como hoy.
3. **D7:** la respuesta por partes solo para la voz.
4. **D8:** el modelo para voz queda vacío por defecto; lo activas tú después de correr `copilot-eval --channel voice`.
5. **Dos migraciones nuevas, sin borrar nada:** la que guarda los tiempos y la que cambia `dk_ai_run_reserve`. Se aplican con `supabase db push`, y la función `dk-copilot` se despliega otra vez.

## 7. Resultados (2026-10-07)

### Punto de partida medido
Los tiempos del servidor ya se guardaban. Antes de esta ADR, **37 preguntas por voz** de los últimos 30 días dieron:

| Medida | Mediana | p90 |
|---|---|---|
| Total en el servidor (Sonnet 5.5) | **7,0 s** | **11,1 s** |
| Última ronda (la que escribe la respuesta y la frase hablada) | 4,2 s | — |
| Fuera del modelo (preparación, herramientas, cierre) | 1,2 s | — |
| Rondas por pregunta | 1,8 en promedio | — |

A eso se sumaban, en la app, los 1,8 s fijos para cerrar la frase y el tono antes de escuchar.

### Qué quedó
| Fase | Qué |
|---|---|
| 0 · Medir (D1) | **App:**<br>• `VoiceProvider` marca cada turno (`turnRef`: inicio, reconocedor escuchando, última palabra) y le pasa al manejador `turn` (`wake`, `followUp`, `listenMs`, `endpointMs`, `lastWordAt`);<br>• `SpeechQueue.onStart` y `whenSpoken(text)` dicen cuándo empieza a sonar una frase;<br>• Copilot envía `client` con la pregunta y, al empezar a hablar, `requestMs`, `speechMs`, `totalMs` y `streamed` con `dk_ai_run_client_timings`. Es una llamada directa a la base, más simple que el `action: 'timings'` de la propuesta.<br>**Servidor:** el registro guarda además `setup`, `spoken` (ms hasta la frase hablada) y `streamed`.<br>**Base:** migración `20261007100000_dk_ai_run_client_timings`. `dk_ai_run_finish` ahora **une** los tiempos en lugar de reemplazarlos (las dos mitades pueden llegar en cualquier orden). `dk_ai_run_client_timings` solo escribe en la consulta propia de los últimos 15 minutos y solo acepta claves conocidas |
| 1 · App (D2, D3, D6) | • `engines.ts` entrega `final` (navegador: `isFinal` del último resultado; Vosk: sin parcial pendiente).<br>• `VoiceProvider` cierra la frase con `VOICE_FINAL_DELAY_MS = 500` / `VOICE_PHRASE_DELAY_MS = 1200`, y el dictado con 700 / 1.500. Un texto repetido igual no estira la pausa. El reconocedor arranca sin esperar el tono.<br>• `useWakeWord`: con micrófono compartido (`canShareMicrophone`), el detector no se destruye. Mientras está suspendido o Quanela habla recibe `silentChunk` (ruido de ±2) y no busca la frase. Ya no hay `stream.reset()` después de hablar. En Safari/iOS suelta el micrófono como antes |
| 2 · Servidor y respuesta por partes (D4, D5, D7) | `dk-copilot`:<br>• `{ action: 'warm' }` → 204;<br>• cupo y contexto con `Promise.all`;<br>• cierre del registro con `EdgeRuntime.waitUntil`;<br>• con `stream: true` y canal voz, Anthropic por partes (`readModelStream` en `contract.ts`, que rearma cada bloque tal cual llegó, incluidos los de razonamiento con su firma) y respuesta NDJSON `spoken` → `final` / `error`;<br>• `spoken` va antes que `answer` en el esquema y el prompt lo pide primero;<br>• la respuesta incluye `model`.<br>App:<br>• `askCopilot({ onSpoken })` lee por partes con `fetch` (sesión, cuenta y rol); si la respuesta llega entera, la lee como antes;<br>• `warmCopilot()`, como máximo una vez por minuto, desde `prepare` del manejador de voz;<br>• el manejador habla con `spoken` apenas llega y no lo repite al final |
| 3 · Modelo para voz (D8) | Migración `20261007110000_dk_copilot_voice_model`:<br>• `dk_features.voice_model_key`;<br>• `dk_ai_run_reserve` lo usa con `channel = 'voice'` si está activo, y si no, el de la función;<br>• `dk_platform_set_voice_model` (solo plataforma, solo Copilot);<br>• `dk_platform_set_model` no deja apagar un modelo usado para voz;<br>• `dk_platform_ai_overview` muestra `voiceModelKey`.<br>Portal (`FeatureDrawer`): «Modelo para preguntas por voz», que queda **vacío**. `copilot-eval --channel voice` pregunta todo como voz y anota el modelo en el informe (`…-voice.md`) |
| 4 · Voz del equipo y ayuda (D9, D10) | «Voz en este equipo → Hablar» muestra «Habla con: … · instalada / en línea» y la pista si es en línea. Ayuda: «Oye Quanela» (te escucha desde el tono; «Que responda más rápido»; instalada o en línea) y notas de versión del 7 de octubre. `npm run help` y `dk-copilot` desplegada |

### Prueba real de la respuesta por partes
Una pregunta por voz contra la función desplegada («¿Cuántos pedidos tuvimos ayer?», 3 rondas):
- la frase hablada llegó a los **5,5 s** y la respuesta completa a los **6,5 s**: Quanela empieza **~1 s antes**;
- `warm` responde 204 en ~0,3 s;
- el registro guardó los tiempos del servidor y de la app.

Esa prueba encontró un error que las pruebas locales no veían: Sonnet 5.5 envía bloques de **razonamiento**, y al rearmarlos se les agregaba un campo `text` que la API rechaza en la ronda siguiente. Quedó corregido (`readModelStream` conserva cada bloque como llegó) y cubierto con una prueba.

### Validación
- Vitest: **588** (94 archivos). Las nuevas cubren:
  - el cierre de frase con reloj falso (definitivo, provisional, pausas, repetidos, dictado), el tono en paralelo, `prepare` y el `turn`;
  - el detector compartido, en silencio y con Safari;
  - `canShareMicrophone` y `silentChunk`;
  - la señal `final` del navegador;
  - `onStart` y `whenSpoken`;
  - `extractSpoken`, `readClientTimings` y `readModelStream` (razonamiento, texto, herramienta, error);
  - la lectura por partes y `warmCopilot` en `api.ts`;
  - el manejador de Copilot (habla una vez, informa los tiempos).
- SQL: `voice_latency` **19/19**; `copilot_safety`, `copilot_tools`, `ai_platform`, `ai_quota` y `global_admin` siguen en verde con las migraciones.
- Chequeo de tipos de la función, `tsc`, `oxlint` (los 14 avisos de siempre) y los dos builds correctos.
- No se probó en el navegador: no hay sesión iniciada en el panel, y el selector del portal necesita la sesión de plataforma con segundo factor.

### Comparar antes y después
```sql
with v as (
  select created_at >= '2026-10-07 17:00+00' as despues, model, timings t
  from dk_ai_insights
  where feature_key = 'copilot' and status = 'ok' and input ->> 'channel' = 'voice'
    and created_at > now() - interval '30 days'
)
select case when despues then 'después' else 'antes' end as periodo, model, count(*) as preguntas,
  percentile_cont(0.5) within group (order by (t -> 'client' ->> 'endpointMs')::int)::int as cierre_p50,
  percentile_cont(0.5) within group (order by (t ->> 'setup')::int)::int as preparacion_p50,
  percentile_cont(0.5) within group (order by coalesce((t ->> 'spoken')::int, (t ->> 'total')::int))::int as servidor_hasta_frase_p50,
  percentile_cont(0.9) within group (order by coalesce((t ->> 'spoken')::int, (t ->> 'total')::int))::int as servidor_hasta_frase_p90,
  percentile_cont(0.5) within group (order by (t -> 'client' ->> 'speechMs')::int)::int as voz_p50,
  percentile_cont(0.5) within group (order by (t -> 'client' ->> 'totalMs')::int)::int as fin_de_tu_voz_a_quanela_p50,
  percentile_cont(0.9) within group (order by (t -> 'client' ->> 'totalMs')::int)::int as fin_de_tu_voz_a_quanela_p90
from v group by 1, 2 order by 1, 2;
```
La consulta de prueba del 7 de octubre a las 16:35 (UTC) tiene tiempos de la app inventados para probar la función: no la cuentes.

### Pendiente
1. **Probar con micrófono** en Chrome o Edge: que una pausa corta no corte la frase y que Quanela empiece a hablar antes. Si corta frases, se suben los 500 ms.
2. **Modelo para voz:** correr `copilot-eval --channel voice` con el campo vacío y luego con Haiku 4.5, y comparar los dos informes.
3. Revisar con la consulta de arriba después de unas 20 preguntas por voz.
