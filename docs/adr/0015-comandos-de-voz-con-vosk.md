# ADR 0015 — Comandos de voz sin internet con Vosk (prueba)

## Estado
**Aceptada e implementada como beta (2026-09-30).** Aprobada con D1–D5 y ejecutada completa. La sección 8 tiene los resultados de la prueba comparativa y las diferencias con el plan.

**Alcance:** es una **prueba opcional por equipo**; el reconocimiento actual del navegador sigue siendo el predeterminado. Si Vosk demuestra ser mejor en una cocina real, una ADR posterior lo vuelve predeterminado. Todo el código nuevo va en inglés. El manual de usuario no se toca.

---

## 1. Auditoría (2026-09-30)

### 1.1 Cómo funciona hoy
| Pieza | Archivo | Detalle |
|---|---|---|
| Reconocimiento | `src/modules/kitchen/voice/speechRecognition.ts` | Web Speech API (`SpeechRecognition`), `es-CO`, continuo y con resultados parciales, 1 alternativa. En Chrome el audio va a servidores de Google (necesita internet). No existe en Firefox; en Safari es irregular. |
| Espera de silencio | `useVoiceCommandEngine.ts` | Se procesa tras 1,8 s sin cambios en la transcripción. |
| Intérprete | `commandParser.ts` (puro, con pruebas) | Exige **exactamente un número de 4 cifras** (`/\b(\d{4})\b/`) y una acción (listo, cancelar, preparación, prioritario…). |
| Respuesta | `useKitchenVoice` + cola (ADR 0014) | Sin cambios. |

**Hallazgo clave:** Chrome entrega los números **en cifras** ("pedido 2040 listo"). Vosk los entrega **en palabras** ("pedido dos mil cuarenta listo"). Hace falta un conversor de números hablados a cifras que cubra cómo se dicen en cocina:
- "dos mil cuarenta";
- "veinte cuarenta", por pares;
- "dos cero cuatro cero", cifra por cifra;
- "mil cuarenta y dos".

### 1.2 Vosk en el navegador
| Aspecto | Dato |
|---|---|
| Paquete | `vosk-browser` 0.0.8, Apache 2.0. Motor Kaldi en WebAssembly, dentro de un *worker*. **Última publicación en npm: 2022-12**. El repositorio sigue activo (último cambio en 2025-12, 530 estrellas, 29 incidencias abiertas). |
| Modelo | `vosk-model-small-es-0.42`, Apache 2.0: **~40 MB**. Se descarga una vez y queda en la caché del navegador. Hay modelos grandes (1,4 GB), pero no sirven para un navegador. |
| Vocabulario limitado | Vosk acepta una **gramática**: la lista de palabras posibles. Solo reconoce eso, y lo desconocido sale como `[unk]`. Es ideal para comandos: números, "pedido", acciones. Mejora la precisión y resiste el ruido. |
| Requisitos | WebAssembly, micrófono (`getUserMedia`, HTTPS) y Web Audio. Funciona en Chrome, Edge, Firefox y Safari modernos. |
| Privacidad y costo | El audio **no sale del equipo**. Costo cero y sin internet (después de la primera descarga). |
| Riesgos | Paquete sin publicaciones recientes; CPU en tabletas modestas; 40 MB la primera vez. |

## 2. Diseño

### 2.1 Adaptador de reconocimiento
Se sigue el mismo patrón que la voz de salida (`SpeechEngine`, ADR 0014):

```
SpeechRecognizer { supported, start(onTranscript), stop() }
  ├─ browserRecognizer   (lo actual, sin cambios de comportamiento)
  └─ voskRecognizer      (nuevo: worker + modelo + gramática)
```

- `useSpeechRecognition` elige el motor según la preferencia **del equipo**.
- El resto del flujo no cambia: espera de silencio, intérprete, validaciones, mutaciones y respuesta hablada.
- **Carga diferida:** `vosk-browser` (~6 MB) y el modelo solo se cargan si ese equipo eligió Vosk. El resto de la app no crece.

### 2.2 Gramática
Palabras permitidas:
- **números:** cero a nueve, diez a veintinueve, decenas, cien/ciento, centenas y mil;
- **conectores:** "y";
- **"pedido"**;
- **acciones:** listo/lista, terminado, preparación, iniciar, empezar, cancelar/cancelado, prioritario, prioridad, urgente, quitar, sin, no, confirmar;
- **`[unk]`** para lo desconocido.

Se genera desde el mismo catálogo de acciones del intérprete, para no duplicar listas.

### 2.3 Números hablados → cifras
Una función pura `spokenNumbersToDigits(text)` (con pruebas) reescribe las secuencias numéricas antes del intérprete. Formas cubiertas y resultado:

| Forma | Resultado |
|---|---|
| Cardinal | "dos mil cuarenta" → `2040`, "mil cuarenta y dos" → `1042` |
| Pares | "veinte cuarenta" → `2040`, "diez cero cinco" → `1005` |
| Cifra por cifra | "dos cero cuatro cero" → `2040` |

Si el resultado no tiene 4 cifras, se deja tal cual: el intérprete ya responde "No entendí".

### 2.4 Modelo: dónde vive
**Bucket público `voice-models` en Supabase Storage** (solo lectura pública; solo la plataforma escribe). Se sube el modelo convertido al formato que espera `vosk-browser` (`.tar.gz`), con caché larga (`Cache-Control: max-age=31536000, immutable`). No va en el repositorio de git, porque es un binario de 40 MB.

### 2.5 Interfaz
En *Configuración → IA y voz → En este equipo*, un campo nuevo **Reconocimiento de comandos**:
- **Navegador** (actual, predeterminado).
- **Sin internet (Vosk, beta):** muestra el progreso de la primera descarga ("Descargando modelo de voz: 23 de 40 MB") y el estado (listo o error).
- Botón **Probar**: escucha una frase y muestra qué entendió y qué comando resultaría, sin tocar ningún pedido.

La preferencia se guarda en el equipo (`localStorage`), igual que la voz fijada. No cambia ninguna tabla de datos.

## 3. Pruebas
- **Unitarias:**
  - `spokenNumbersToDigits` (cardinal, pares y cifra por cifra, con "y", números fuera de rango y texto sin números);
  - la gramática contiene todas las palabras del intérprete;
  - el adaptador elige el motor según la preferencia.
- **Prueba comparativa con audio real (en el navegador):**
  - se generan unas 40 frases de cocina con las voces del Mac (`say`: Paulina, Mónica, Jorge, Juan, Diego) en las tres formas numéricas;
  - también en versión **con ruido de cocina** mezclado;
  - se pasan por Vosk con la gramática y se mide el porcentaje de comandos correctos y el tiempo de respuesta.
  - Objetivo: **≥ 90 % sin ruido**; con ruido, se informa el resultado.
  - El reconocimiento del navegador no acepta archivos de audio (solo el micrófono), así que la comparación directa se hace en la prueba real en cocina.
- **SQL:** el bucket permite lectura pública y rechaza escrituras de usuarios que no son de la plataforma.
- **Regresión:** `tsc`, `oxlint`, todas las pruebas, `build` (el paquete principal no debe crecer) y verificación visual del ajuste nuevo.

## 4. Riesgos
| # | Riesgo | Mitigación |
|---|---|---|
| R1 | `vosk-browser` sin publicaciones desde 2022 | Versión fija, detrás del adaptador: cambiar de motor no toca el resto. Es opcional y beta. |
| R2 | 40 MB en la primera descarga | Una sola vez por equipo, con progreso visible y caché larga. Solo si ese equipo lo elige. |
| R3 | CPU en tabletas modestas | Se mide la latencia en la prueba comparativa. Si no alcanza, se queda en beta. |
| R4 | El modelo pequeño se confunde con acentos o ruido | La gramática limitada reduce mucho el error. La prueba con ruido lo cuantifica. |
| R5 | Una palabra fuera de la gramática | Sale como `[unk]` → "No entendí". Nunca ejecuta algo no dicho, gracias a las validaciones actuales. |

## 5. Criterios de aceptación
1. Un equipo puede elegir "Sin internet (Vosk, beta)" y dar comandos de voz sin conexión (después de la descarga).
2. Los números se entienden en las tres formas habladas.
3. ≥ 90 % de comandos correctos en la prueba comparativa sin ruido; con ruido, resultado informado.
4. Nada cambia para los equipos que no lo eligen; el paquete principal no crece.
5. Todas las pruebas en verde; ADR y arquitectura actualizadas (el manual no).

## 6. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Alcance | Opción **por equipo y en beta**; el navegador sigue como predeterminado. |
| **D2** | Dónde vive el modelo | Bucket público `voice-models` en Supabase Storage, con caché larga. |
| **D3** | Vocabulario | Gramática limitada a los comandos. |
| **D4** | Modelo | `vosk-model-small-es-0.42` (40 MB). |
| **D5** | Paquete | `vosk-browser` 0.0.8, versión fija y detrás del adaptador. |

## 7. Orden de ejecución
| Fase | Qué |
|---|---|
| 1 | Auditoría (este documento) |
| 2 | `spokenNumbersToDigits` y gramática, con pruebas |
| 3 | Adaptador `SpeechRecognizer`: `browserRecognizer` (lo actual) y `voskRecognizer` con carga diferida |
| 4 | Bucket `voice-models` (migración y prueba SQL), conversión y subida del modelo |
| 5 | Ajuste "Reconocimiento de comandos" en *En este equipo*, con descarga, estado y **Probar** |
| 6 | Prueba comparativa con audio sintetizado (sin y con ruido) en el navegador |
| 7 | Validación integral (`tsc`, `oxlint`, pruebas, `build`, tamaño del paquete, navegador) |
| 8 | Documentación: esta ADR con resultados y la arquitectura |

---

## 8. Implementación y resultados (2026-09-30)

### 8.1 Qué se construyó
| Pieza | Archivo |
|---|---|
| Números hablados → cifras | `src/modules/kitchen/voice/spokenNumbers.ts` (+ pruebas) |
| Gramática de comandos | `src/modules/kitchen/voice/commandGrammar.ts` (+ pruebas: cada acción del intérprete se puede decir solo con palabras de la gramática) |
| Motores intercambiables | `src/shared/voice/recognition/engines.ts` (`browserEngine`, `voskEngine`), `preference.ts` (por equipo), `voskModel.ts` (descarga con progreso, carga diferida) |
| Hook | `useSpeechRecognition` usa el motor del equipo; con Vosk, el modelo se precarga al abrir Cocina |
| Interfaz | `CommandRecognitionPanel`: *IA y voz → Comandos de voz · En este equipo* (motor, progreso, estado, **Probar**) |
| Modelo | `vosk-model-small-es-0.42` (39,8 MB) en el bucket público `dk-voice-models` (migración `20260930250000`), caché de 1 año inmutable; suite `voice_models` |
| Paquete | `vosk-browser` 0.0.8 fijo, en un archivo aparte (5,8 MB) que solo descargan los equipos que eligen Vosk. El paquete principal creció 12 KB por el código nuevo. |

### 8.2 Prueba comparativa
Audio sintetizado con las voces del Mac:
- **Naturales:** Paulina y Mónica.
- **Robóticas:** Eddy, Reed, Rocko y Flo.

8 frases × 6 voces = 48 grabaciones, en las tres formas numéricas, sin ruido y con ruido de cocina sintético (fondo, zumbido de 50 Hz y golpes de utensilios) a 10 dB y 5 dB de relación señal/ruido.

| Condición | Voces naturales | Todas las voces | Pedido equivocado* (todas) |
|---|---|---|---|
| Sin ruido | **15/16 (94 %)** | 30/48 | 2/48 |
| Ruido moderado (10 dB) | 11/16 (69 %) | 22/48 | 4/48 |
| Ruido fuerte (5 dB) | 5/16 (31 %) | 15/48 | 4/48 |

\*Número de pedido distinto con confianza alta. El resto de los fallos terminan en "No entendí", que es el fallo seguro.

- **Latencia:**
  - ~0,55–0,75 s desde el fin de la frase hasta el resultado (más la ventana de silencio de 1,8 s del motor de Cocina);
  - modelo: 18,8 s la primera vez (descarga) y ~0,6 s después (caché).
- **Voces robóticas:** son poco representativas del habla humana (Rocko: 0/8). Las naturales cumplen el objetivo de ≥ 90 % sin ruido.
- **Primera corrección encontrada con la prueba:** Vosk pierde a menudo la "y" corta ("cuarenta dos"). El conversor ahora la acepta como opcional, lo que subió el resultado sin ruido de 25/48 a 30/48.
- **Se descartó filtrar por confianza por palabra:** no separa aciertos de errores. El peor caso es cuando omite una palabra entera ("tres mil doscientos [cinco]" → 3200, con confianza total). Tapar palabras a veces produce otro número erróneo.

### 8.3 Diferencias con el plan
- **Salvaguarda agregada (seguridad):** con el motor Vosk, **cancelar por voz se desactiva**. Responde "Cancela desde la pantalla", porque un número mal oído podría cancelar otro pedido y cancelar es lo difícil de revertir. Las demás acciones siguen y se deshacen con un toque. El motor del navegador no cambia.
- **Conversión de números para todos los motores:** se aplica también a lo que entrega el navegador (con cifras no cambia nada).
- **Prueba comparativa:** se hizo con una página temporal del servidor de desarrollo (ya retirada), no con el micrófono.

### 8.4 Pendiente
- **Probar en una cocina real,** con personas, acento colombiano y el ruido y el micrófono de la tableta (con la supresión de ruido del navegador, que la prueba sintética no aplica), y comparar con el motor del navegador. Con esos datos se decide si Vosk deja de ser beta o si conviene Picovoice Rhino (intención directa) para más robustez con ruido.
- **Manos libres ("Oye Quanela"):** no incluido.
