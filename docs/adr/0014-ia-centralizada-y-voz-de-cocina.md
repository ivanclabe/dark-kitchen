# ADR 0014 — IA administrada centralmente y voz de cocina configurable

## Estado
**Aceptada e implementada (2026-09-29).** Aprobada una sola vez con las recomendaciones D1–D8 (voz del dispositivo) y ejecutada completa (fases 1–9). La sección 21 resume la implementación, las diferencias con el plan y lo pendiente.

**Relación con otras ADR:**
- Continúa las ADR 0009 (funciones), 0010 (planes), 0011 (cuota de IA) y 0012 (centro de administración).
- Todo lo nuevo se escribe con código y URL en inglés, según la regla de la ADR 0013, aunque esa ADR siga pendiente.

---

## 1. Auditoría (2026-09-29)

### 1.1 Capacidades que existen de verdad
| Clave | Qué hace | Tipo | Proveedor | Dónde actúa | Datos que usa | Usos reales |
|---|---|---|---|---|---|---|
| `supply_reorder` | Sugerencias de compra | IA (modelo) | Anthropic, `claude-sonnet-5` | Abastecimiento | stock, consumo, compras | 0 (apagada en todas las cuentas) |
| `supply_perishables` | Perecederos en riesgo | IA (modelo) | Anthropic, `claude-sonnet-5` | Abastecimiento | lotes, vencimientos | 0 |
| `supply_slow_movers` | Poco movimiento | IA (modelo) | Anthropic, `claude-sonnet-5` | Abastecimiento | consumo, stock | 0 |
| `kitchen_insights` | Sugerencias de Cocina en vivo (y las puede decir en voz alta) | IA (modelo) | Anthropic, `claude-haiku-4-5-20251001` | Cocina | pedidos en curso, tiempos, domiciliarios | 33 (24 ok, 8 vacías, 1 error), en 2 cuentas |
| `kitchen_stall_alerts` | Alertas de pedidos detenidos, con voz | Reglas (**sin modelo**) | — | Cocina | tiempos por estado | Apagada en todas las cuentas |
| `voice_commands` | Comandos de voz ("pedido 1042 listo") | Reconocimiento de voz del navegador + intérprete propio | Web Speech API, `es-CO` | Cocina | lo que se dice | Encendida por defecto |
| `voice_speech` | Voz de la aplicación | Texto a voz del navegador | `speechSynthesis`, `es-CO` | Cocina | frases fijas | Encendida por defecto |

**No existen** asistente, chatbot, consultas en lenguaje natural, agentes, resúmenes generados, integración con n8n ni otro proveedor de voz. Tampoco hay claves de IA en el frontend: las variables `VITE_*` no incluyen ninguna. El sonido de pedido nuevo (`useNewTicketAlert`) es un pitido del navegador (`AudioContext`), no IA; queda igual.

### 1.2 Cómo se controla hoy
Regla actual en la base (`dk_can_use_feature`):

```
usable = dk_features.active ∧ el plan la incluye ∧ la organización la ofrece
         ∧ la Cuenta la activó ∧ permiso de uso
```

| Nivel | Tabla | Quién lo cambia hoy | Interfaz |
|---|---|---|---|
| Plataforma (interruptor global) | `dk_features.active` | Nadie: **no tiene pantalla** | — |
| Plan | `dk_plan_features` | Datos fijos de la migración | — |
| Organización | `dk_organization_features.available` (sin filas: rige `default_available`) | SUPER_ADMIN (`features.manage`) | Centro → Configuración → Funciones |
| Cuenta: activación + parámetros | `dk_kitchen_features.enabled` y `.settings` | SUPER_ADMIN, **y también el ADMIN o GERENTE de la Cuenta** (`ai.manage` para IA, `settings.manage` para voz) | Cuenta → Configuración → Funciones (`AiSettingsPage`, `FeatureSwitchCard`) |
| Dispositivo | `localStorage` (`dk-kitchen-voice-tts`, sonido) | Quien usa el equipo | Cocina → ⋯ |

**Duplicación que pide eliminar el requerimiento:** la activación por Cuenta se puede cambiar desde dos lugares (el centro y la Cuenta), y el ADMIN de la Cuenta puede encender IA para su local.

### 1.3 Proveedor de IA
- **Edge Function `dk-ai-insights`:** Anthropic Messages API, `max_tokens` 2500.
- **Clave:** en el secreto `DK_ANTHROPIC_API_KEY`; nunca sale del servidor.
- **Modelos:** fijos en el código (`MODEL_SUPPLY`, `MODEL_KITCHEN`); no se configuran.
- **Cuota:** `dk_ai_run_allowed` (ADR 0011):
  - 120 s entre análisis;
  - tope en 24 h según el plan (`dk_plans.limits.ai_runs_per_day`).
- **Registro:** cada ejecución queda en `dk_ai_insights` (estado, entrada, salida y modelo). **No se guardan tokens ni tiempos de respuesta**, así que hoy no se puede calcular el costo.

### 1.4 Voz
| Aspecto | Hoy |
|---|---|
| Texto a voz | `speechSynthesis` del navegador (`src/modules/kitchen/voice/speak.ts`). Solo fija el idioma (`es-CO`): **no elige voz ni ajusta velocidad, tono ni volumen**. |
| Voces disponibles | Las que trae cada equipo y navegador: por ejemplo, en Chrome "Google español"; en macOS o iOS Paulina y Mónica; en Windows, voces de Microsoft. Varían entre equipos. |
| Latencia | Prácticamente inmediata: no hay red. |
| Costo | Cero, sin llamadas externas. |
| SSML / estilos / *streaming* | No se admiten; solo `rate`, `pitch`, `volume`, `lang` y `voice`. |
| Reconocimiento de voz | Web Speech API, `es-CO`, intérprete determinista (`commandParser`). No usa un modelo. |
| Puerta única | `useSpeech()`: solo habla si `voice_speech` está permitida. |

### 1.5 Frases que dice hoy la cocina
| Origen | Frase actual | Evaluación |
|---|---|---|
| Comando de voz, éxito | "Pedido 1042 confirmado." / "…en preparación." / "…listo." / "…cancelado." / "…marcado como prioritario." | Ya es corta y natural. |
| Comando de voz, error | "No entendí el comando." / "El pedido 1042 no existe." / "El pedido 1042 ya está listo." | Puede ser más corta ("No entendí." / "Pedido 1042 no existe."). |
| Alertas de pedidos detenidos | "Atención. Pedido 1042: Hamburguesa doble lleva 12 minutos sin empezar. Y 2 avisos más en el tablero." | Larga. |
| Sugerencia de IA | "Sugerencia: {título}." | Corta. El texto lo genera el modelo, pero no se genera nada para hablar. |

Todas las frases se arman con plantillas, **sin modelo de lenguaje**. Se mantiene así.

### 1.6 Varios mensajes a la vez
`speak()` **cancela lo que está sonando** antes de decir lo nuevo (`speechSynthesis.cancel()`). No hay superposición, pero **un aviso puede cortar otro a la mitad y perderse**. Por ejemplo, una alerta de pedido detenido interrumpe la confirmación de un comando. No existe una cola ni prioridades.

### 1.7 Uso y costos
- **Qué se puede medir hoy:** análisis de IA por Cuenta, función, día y estado (`dk_ai_insights`).
- **Qué no:** tokens y costo no se registran.
- **Voz:** no genera llamadas ni costo; no hay nada que medir en el servidor.

### 1.8 Seguridad (estado actual)
- RLS en todas las tablas `dk_*`. Las funciones se leen con `dk_my_features` y se escriben con RPC `SECURITY DEFINER` que verifican permisos.
- La clave de Anthropic solo existe como secreto de la Edge Function.

### 1.9 Hallazgos
| # | Hallazgo | Severidad |
|---|---|---|
| H1 | El ADMIN o GERENTE de una Cuenta puede activar IA o voz en su local: hay dos lugares de activación. | Media (control) |
| H2 | El interruptor global (`dk_features.active`) existe pero no tiene pantalla. Los modelos, precios y límites finos están fijos en el código. | Media |
| H3 | **`MODEL_SUPPLY = "claude-sonnet-5"` no coincide con los identificadores vigentes** (p. ej. `claude-sonnet-5-5`). Las 3 funciones de abastecimiento nunca se han ejecutado, así que el error no se ha visto. | Alta (la función fallaría al activarla) |
| H4 | La voz corta avisos: sin cola ni prioridades. | Media (operación) |
| H5 | La voz no se puede configurar: una sola voz, la que elija el navegador. | Media (producto) |
| H6 | No hay registro de tokens: no se puede estimar el costo de IA. | Baja |

---

## 2. ¿Quién es el "Super Admin" de este cambio? (D1)
En Dark Kitchen hay dos niveles por encima de la Cuenta:
- **Plataforma** (`/admin`, `platform_role = SUPERADMIN`): tú, como operador del servicio. Ve todas las organizaciones.
- **SUPER_ADMIN de la organización** (creador del negocio): administra sus Cuentas desde `/o/:org`.

El requerimiento mezcla responsabilidades de ambos: proveedores y modelos por un lado, activación por Cuenta por otro. **Recomendación:** repartirlas así, sin crear roles nuevos.

| Responsabilidad | Plataforma | SUPER_ADMIN de la organización | ADMIN de la Cuenta | Equipo de cocina |
|---|---|---|---|---|
| Interruptor global de cada función | ✅ | — | — | — |
| Proveedores, modelos por función, precios para estimar costos | ✅ | — | — | — |
| Catálogo de voces y voz por defecto de la plataforma | ✅ | — | — | — |
| Límites (cuota por plan, intervalo mínimo, rangos de parámetros) | ✅ | — | — | — |
| Uso de todas las organizaciones | ✅ | — | — | — |
| Ofrecer una función a su organización | — | ✅ | — | — |
| **Activar o desactivar por Cuenta** | ✅ (soporte) | ✅ | ❌ (**cambia**) | — |
| Voz por defecto de la organización y "permitir personalizar por Cuenta" | — | ✅ | — | — |
| Uso de su organización | — | ✅ | — | — |
| Preferencias permitidas: voz, estilo, velocidad, volumen, idioma y umbrales operativos | — | ✅ | ✅ | — |
| Escuchar la vista previa | — | ✅ | ✅ | — |
| Usar lo habilitado; silenciar su equipo | — | — | — | ✅ |

## 3. Regla de activación
```
usable = platform.active                (interruptor global)
       ∧ plan.includes                  (lo contratado)
       ∧ organization.offers            (SUPER_ADMIN)
       ∧ account.enabled                (SUPER_ADMIN o plataforma; ya no el ADMIN de la Cuenta)
       ∧ permission.use                 (RBAC de la Cuenta)
```
- Sigue siendo **una sola fuente** en la base (`dk_can_use_feature` / `dk_my_features`); la app no evalúa condiciones por su cuenta.
- Si la plataforma apaga una función, **ninguna** Cuenta la usa. Su configuración se conserva y vuelve igual si se reactiva, como ya ocurre con la organización.

## 4. Qué se configura en cada nivel
| Parámetro | Nivel | Motivo |
|---|---|---|
| `active`, modelo por función, límites, intervalo mínimo, rangos (`settings_schema`) | Plataforma | Técnico y de costo |
| Valores por defecto de cada función (`default_settings`) | Plataforma | Punto de partida de todas las Cuentas |
| `available` por organización; `enabled` por Cuenta | Organización | Control del negocio |
| Voz por defecto de la organización; permitir personalizar | Organización | Política del negocio |
| Umbrales operativos (días de cobertura, minutos de alerta, frecuencia dentro del rango, "decir en voz alta") | Cuenta (ADMIN) | Dependen del local (lo decidido en la ADR 0012) |
| Perfil de voz, estilo, velocidad, volumen, idioma | Cuenta, **solo si la organización lo permite**; si no, rige la voz de la organización | Preferencia operativa |
| Silenciar la voz o el sonido, y fijar una voz instalada concreta en ese equipo | Dispositivo (`localStorage`) | Cada tableta de cocina es distinta |

## 5. Modelo de datos (reutiliza lo existente)
| Objeto | Acción | Detalle |
|---|---|---|
| `dk_features` | **Modifica** | + `model_key` (FK a `dk_ai_models`, solo si `uses_model`), + `min_interval_seconds` (hoy 120 fijo). `active`, `default_settings` y `settings_schema` pasan a editarse desde la plataforma. |
| `dk_ai_models` | **Crea** | Catálogo: `key` (id del proveedor), `provider` (`anthropic`), `label`, `input_price_per_mtok`, `output_price_per_mtok` (nulos hasta que la plataforma los cargue: **no se inventan precios**), `active`. Lectura y escritura solo de la plataforma. |
| `dk_ai_insights` | **Modifica** | + `input_tokens`, `output_tokens`, `latency_ms` (los devuelve Anthropic; desde ahora). |
| `dk_organization_features` | **Modifica** | + `settings jsonb` (voz por defecto de la organización y `allow_account_override`). |
| `dk_kitchen_features` | Se mantiene | `enabled` (solo organización/plataforma) + `settings` (preferencias permitidas). Para `voice_speech` guarda la voz de la Cuenta. |
| `dk_voice_profiles` | **Crea** | Catálogo de voces de la plataforma: `key`, `name` (Sofía, Laura, Daniel, Mateo, Alex), `gender` (`female`/`male`/`neutral`), `style`, `rate`, `pitch`, `lang`, `provider` (`device`), `device_voice_hints` (nombres de voces instaladas por sistema, en orden de preferencia), `active`, `sort_order`. Lectura: usuarios autenticados. Escritura: plataforma. |
| `voice_speech` (fila de `dk_features`) | **Datos** | `default_settings` = `{profile: 'laura', style: 'natural', rate: 1.0, volume: 1.0, lang: 'es-CO', verbosity: 'standard'}` y su `settings_schema` con rangos. |

**No se crea** `account_voice_configuration`: la configuración de voz por Cuenta ya tiene su lugar en `dk_kitchen_features.settings` de `voice_speech`.

**Configuración efectiva de voz:**

```
platform (dk_features.default_settings)
  ← organization (dk_organization_features.settings)
  ← account (dk_kitchen_features.settings, solo si allow_account_override)
  ← device (voz instalada fijada en ese equipo)
```

La calcula la base en `dk_my_features`, que ya entrega los `settings` efectivos.

## 6. Plataforma → IA (`/admin`, pestaña **AI**)
Pestañas cortas en lugar de una pantalla gigante:
- **Features:** tabla de las 7 funciones con estado global, planes que la incluyen, organizaciones que la ofrecen, Cuentas con ella activa y errores recientes. Cada una tiene su *drawer* con interruptor global, modelo, intervalo mínimo, valores por defecto, rangos y dependencias (p. ej. las alertas habladas dependen de `voice_speech`).
- **Providers:**
  - si la clave de Anthropic está configurada, sin revelarla: una verificación del servidor responde solo sí o no;
  - catálogo de modelos y precios para estimar costos;
  - qué modelo usa cada función.
- **Voice:** catálogo de perfiles de voz (alta, orden, activación), voz por defecto de la plataforma y vista previa.
- **Usage:** análisis por día y mes, por organización, Cuenta y función; ok/error; tokens y costo estimado **solo** desde que se registran y con precios cargados. Voz: "Voz del dispositivo: sin llamadas ni costo".
- **Policies:** cuota por plan (`ai_runs_per_day`), intervalo mínimo y rangos de los parámetros.

## 7. Centro de la organización → **IA** (`/o/:org/ai`)
La pestaña "Funciones (IA y voz)" de Configuración **se mueve aquí**; su dirección vieja redirige.
- **Features:** la matriz de hoy (ofrecer a la organización / activar por Cuenta), con candados por plan y "Apagada por la plataforma".
- **Kitchen Voice:** voz por defecto de la organización (perfil, estilo, velocidad, volumen, idioma), "Permitir que cada cuenta personalice" y ▶ Vista previa.
- **Usage:** análisis por Cuenta y función (30 días), con error y cuota usada. Sin costos: eso es de la plataforma.

## 8. Cuenta → Configuración → **IA y voz**
- **Sin interruptores de activación.** Cada función muestra su estado ("Activa en esta cuenta" o "No disponible para esta cuenta") y a quién pedirla.
- Si está activa: sus **umbrales operativos**, igual que hoy, dentro de los rangos de la plataforma.
- **Voz de cocina:**
  - si la organización permite personalizar: perfil, estilo, velocidad, volumen, idioma y ▶ Vista previa;
  - si no, la voz de la organización en solo lectura;
  - si la función está apagada: "La voz de cocina no está disponible para esta cuenta".
- **En este equipo:** silenciar y, opcionalmente, fijar una voz instalada concreta (se guarda en el equipo).

## 9. Voz de cocina

### 9.1 Proveedor (D2)
**Actual:** voz del dispositivo (`speechSynthesis`). Cumple casi todo lo pedido:
- varias voces cuando el equipo las tiene;
- velocidad, tono, volumen e idioma;
- vista previa instantánea y sin costo;
- latencia cercana a cero, y funciona sin internet.

**Lo que no puede:** garantizar la **misma** voz en todos los equipos ni estilos emocionales reales.

| Proveedor | Naturalidad en español | Latencia | Costo | Voces es-CO/es-MX | Estilo | Integración |
|---|---|---|---|---|---|---|
| **Dispositivo (actual)** | Media, según el equipo | ~0 | 0 | Según el equipo | Solo velocidad y tono | Ya existe |
| Azure Speech | Alta | Baja, con red | Por carácter, con capa gratuita | **Sí, voces colombianas** | SSML (velocidad, tono, volumen); pocos estilos en español | Edge Function + secreto |
| OpenAI TTS (`gpt-4o-mini-tts`) | Alta | Baja, con red | Por carácter o minuto, bajo | Voces multilingües (sin acento local garantizado) | **Instrucciones de tono** ("cálida", "enérgica") | Edge Function + secreto |
| ElevenLabs | Muy alta | Muy baja (modelos *flash*) | El más alto | Clonables y multilingües | Buena | Edge Function + secreto |
| Google Cloud TTS | Alta | Baja | Por carácter, con capa gratuita | es-US / es-ES | SSML | Edge Function + secreto |

Precios y latencias exactos se confirman con cada proveedor al contratar; no los fijo aquí.

**Recomendación:** mantener **la voz del dispositivo** en esta ejecución, porque es más rápida, no cuesta nada, funciona sin conexión y no agrega proveedor. El diseño deja preparado el cambio:
- el catálogo tiene la columna `provider`;
- la reproducción pasa por un adaptador (`SpeechEngine`).

Agregar un proveedor en la nube sería una Edge Function `dk-tts` más un secreto: tú configurarías la clave; yo nunca la manejo. Si quieres la misma voz en todas las tabletas, la opción que recomendaría es **Azure**, por sus voces colombianas y su capa gratuita. Puedes elegirla al aprobar (ver D2).

### 9.2 Perfiles de voz (catálogo inicial)
| Perfil | Tipo | Estilo | Velocidad / tono |
|---|---|---|---|
| Sofía | Femenina | Amable (*Friendly*) | 1,0 / 1,1 |
| Laura | Femenina | Natural (**por defecto**) | 1,0 / 1,0 |
| Daniel | Masculina | Profesional (*Professional*) | 1,0 / 0,95 |
| Mateo | Masculina | Enérgica (*Energetic*) | 1,15 / 1,05 |
| Alex | Neutra | Directa (*Direct*) | 1,1 / 1,0 |

- **Cómo se asigna la voz en cada equipo:** entre las voces instaladas del idioma elegido, se usa la primera que coincida con `device_voice_hints` (p. ej. mujer: Paulina, Mónica, Salomé, Dalia, Helena, "Google español"…).
- **Si no hay coincidencia:** se usa la voz por defecto del idioma y la pantalla lo avisa ("En este equipo se usará: Google español").
- **Voz neutra:** solo existe si el equipo la tiene; si no, se indica.

### 9.3 Estilos
En la voz del dispositivo, el estilo se traduce en **velocidad, tono y extensión de la frase**. Es lo técnicamente posible.

| Estilo | Efecto |
|---|---|
| Amable / Profesional / Natural / Tranquila | Velocidad y tono propios; frase estándar |
| Enérgica | Más rápida y un poco más aguda |
| Directa | Más rápida; frase corta |
| Mínima | Frase mínima ("1042 listo.") |

### 9.4 Frases (más cortas y naturales, sin modelo)
| Caso | Estándar | Mínima |
|---|---|---|
| Comando: éxito | "Pedido 1042 listo." (igual que hoy) | "1042 listo." |
| Comando: no entendido | "No entendí." | "¿Perdón?" |
| Comando: no existe | "Pedido 1042 no existe." | "1042 no existe." |
| Comando: ya estaba | "Pedido 1042 ya está listo." | "1042 ya listo." |
| Pedido detenido | "Pedido 1042: hamburguesa doble, 12 minutos sin empezar." | "1042, 12 minutos." |
| Varios detenidos | "Tres pedidos detenidos. El más antiguo, 1042, 18 minutos." | "Tres detenidos." |
| Sugerencia de IA | "Sugerencia: {título}." | "Sugerencia en pantalla." |

Las frases se arman con plantillas (`kitchenPhrases.ts`), con pruebas. **No cambia ninguna regla de estados, arrastre, códigos, demoras ni protecciones.**

### 9.5 Cola de audio (H4)
Un único `speechQueue` para toda la app:
- **Nunca superpone ni corta:** cada mensaje espera a que termine el anterior.
- **Prioridades:** comando (el que acaba de pedir alguien) > alerta > sugerencia. Un mensaje prioritario pasa adelante en la cola, sin interrumpir lo que está sonando.
- **Sin repeticiones:** el mismo texto ya en cola no se repite. Un mensaje que espera más de 20 s se descarta, porque ya no sirve. Como máximo 3 en espera; si entra uno más, sale el de menor prioridad.
- **Silenciar** vacía la cola al instante.

### 9.6 Vista previa
Botón ▶ con "Pedido 1042 listo." y "Pedido 1042. Hamburguesa doble y papas listas.", usando **exactamente** el perfil, estilo, velocidad, volumen e idioma elegidos, en ese equipo. No se crean archivos de audio.

### 9.7 Latencia
- **Qué se mide:** de "evento → encolado" a "empieza a sonar" (`onstart`), en cada equipo.
- **Dónde se ve:** en la sección de voz ("En este equipo la voz tarda ~X ms"). Es un dato real, no estimado.
- **Objetivo:** menos de 150 ms sin cola.
- **Qué no se usa:** ningún modelo de lenguaje para frases de cocina.

## 10. Uso y costos
- **Análisis de IA:**
  - por plataforma, organización, Cuenta, función, día y mes, desde `dk_ai_insights`;
  - tokens y latencia **desde esta versión**; los análisis anteriores cuentan como ejecuciones, sin tokens.
- **Costo estimado:** tokens × precio del modelo cargado por la plataforma. Sin precio, se muestra "Sin precio configurado".
- **Voz del dispositivo:** sin llamadas ni costo. No se inventa una métrica.
- **Si en el futuro hay una voz en la nube:** caracteres y segundos por Cuenta. Queda como mejora futura.

## 11. RBAC y RLS
| Acción | Quién | Cómo se valida |
|---|---|---|
| Cambiar `dk_features`, `dk_ai_models`, `dk_voice_profiles`, precios, límites | Plataforma | RPC `SECURITY DEFINER` con `dk_is_platform_admin()`; sin escritura directa desde la API |
| Ofrecer a la organización, activar por Cuenta, voz de la organización, permitir personalizar | SUPER_ADMIN (`features.manage`) o plataforma | `dk_set_org_feature`; `dk_set_kitchen_feature` **ya no acepta el permiso de la Cuenta para `enabled`** |
| Umbrales y preferencias de voz de una Cuenta | ADMIN de la Cuenta (`ai.manage` / `settings.manage`) o SUPER_ADMIN | RPC nueva `dk_set_kitchen_feature_settings`: solo `settings`, con la función activa, dentro de `settings_schema` y, para la voz, solo con `allow_account_override` |
| Leer uso de la organización | SUPER_ADMIN (`observability.view`) | RPC que verifica la organización |
| Leer uso de la plataforma | Plataforma | RPC con `dk_is_platform_admin()` |
| Clave del proveedor | Nadie desde la app | Solo el secreto de la Edge Function; la verificación devuelve solo sí o no |

**Pruebas de aislamiento:** otra Cuenta, otra organización, un ADMIN que intenta activar, un Miembro que intenta leer uso o secretos. Todas deben fallar.

## 12. Bitácora
Se reutiliza `dk_audit_log` (ADR 0012). Hay eventos nuevos en `dk_audit_classify`:
- `feature.platform_changed` ("Apagó Sugerencias de compra en la plataforma");
- `ai.model_changed`;
- `voice.catalog_changed`;
- `voice.settings_changed` ("Cambió la voz de Hamburguesería Centro: Laura → Daniel").

## 13. Migración de datos (sin pérdidas)
1. Las activaciones por Cuenta actuales (`dk_kitchen_features.enabled`) **se conservan tal cual**: desde ahora solo las cambia la organización.
2. Los umbrales actuales de cada Cuenta se conservan y se validan contra los rangos; si alguno queda fuera, se ajusta al límite y queda en la bitácora.
3. `voice_speech` recibe su configuración por defecto. Las Cuentas sin preferencia heredan la de la organización o la plataforma (Laura, natural, es-CO, 1,0), que se oye igual que hoy: la voz por defecto del equipo en es-CO.
4. `dk_organization_features` no tiene filas: rigen los valores por defecto (sin cambio).
5. El modelo de abastecimiento se corrige (H3) al nuevo catálogo (`claude-sonnet-5-5`); el de cocina se mantiene (`claude-haiku-4-5-20251001`).
6. La preferencia de voz y el sonido de cada equipo (`localStorage`) se respetan.
7. **Limpieza al final**, solo tras verificar que ya no se usan: se retiran los interruptores de activación de la Cuenta (`FeatureSwitchCard` en modo activación), la pestaña Funciones de Configuración del centro (con redirección) y los modelos fijos en la Edge Function.

## 14. Migraciones
| Migración | Contenido |
|---|---|
| `20260930200000_dk_ai_platform_control` | `dk_ai_models` (+ datos), `dk_features.model_key` / `min_interval_seconds`, `dk_ai_insights` con tokens y latencia, RPC de plataforma (`dk_platform_set_feature`, `dk_platform_set_model`, `dk_platform_ai_usage`), `dk_ai_run_allowed` con el intervalo por función, bitácora |
| `20260930210000_dk_feature_activation_rules` | `dk_set_kitchen_feature` solo organización/plataforma, `dk_set_kitchen_feature_settings`, `dk_organization_features.settings`, `dk_my_features` con configuración efectiva por capas, `dk_org_ai_usage` |
| `20260930220000_dk_kitchen_voice` | `dk_voice_profiles` (+ 5 perfiles), configuración y rangos de `voice_speech`, RPC `dk_platform_set_voice_profile`, bitácora |

Cada una se ensaya con `run.py --with …` contra todas las suites; después `db push`, tipos, asesores y despliegue de `dk-ai-insights`.

## 15. Cambios de frontend
| Área | Cambio |
|---|---|
| `src/shared/voice/` (nuevo) | `speechQueue.ts` (cola con prioridades), `SpeechEngine` (adaptador; hoy `deviceEngine`), `resolveVoice.ts` (perfil → voz instalada), `kitchenPhrases.ts` (plantillas por extensión), `useKitchenVoice()`, que reemplaza a `useSpeech` con la misma puerta de permiso |
| `src/modules/kitchen/voice/*` | `speak.ts` pasa a la cola; los llamadores (comandos, alertas, sugerencias) usan `kitchenPhrases` y prioridad |
| Plataforma | Pestaña **AI**, con Features, Providers, Voice, Usage y Policies |
| Centro de la organización | Sección **IA** (`/o/:org/ai`), con Features, Kitchen Voice y Usage; la pestaña vieja redirige |
| Cuenta | "IA y voz": estado de solo lectura, umbrales y voz de cocina con vista previa y latencia del equipo |
| Componentes compartidos | `VoicePicker`, `VoicePreviewButton`, `SliderField` (velocidad y volumen) y el `FeatureStatusBadge` que explica por qué está apagada |

## 16. Riesgos
| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Un ADMIN de Cuenta pierde la posibilidad de activar funciones que hoy activa. | Es el objetivo. El SUPER_ADMIN lo hace desde el centro y el manual lo explica. |
| R2 | Las voces varían por equipo. | Perfiles con preferencias por sistema, el aviso de qué voz se usará en ese equipo, la voz fija por equipo y la opción de proveedor en la nube (D2). |
| R3 | La cola retrasa un aviso importante. | Prioridades, frases cortas y descarte de lo viejo. Se mide la latencia real. |
| R4 | Cambiar `dk_set_kitchen_feature` rompe una pantalla. | Pruebas SQL de cada permiso; la pantalla vieja se retira solo después. |
| R5 | Corregir el modelo de abastecimiento activa costo. | Las 3 funciones siguen apagadas en todas las Cuentas. Solo quedan listas para usarse. |
| R6 | Un precio mal cargado da un costo estimado falso. | Se rotula como "estimado"; solo la plataforma lo edita y queda en la bitácora. |

## 17. Pruebas
- **SQL (suites nuevas `ai_platform` y `kitchen_voice`, y `features` actualizada):**
  - apagar globalmente → ninguna Cuenta la usa, y su configuración se conserva;
  - el ADMIN de una Cuenta no puede activar (error) pero sí cambiar umbrales;
  - la voz sin `allow_account_override` se rechaza;
  - rangos de `settings_schema`;
  - configuración efectiva por capas;
  - uso: otra organización ve 0 y un Miembro recibe un error;
  - las RPC de plataforma rechazan a quien no es plataforma;
  - la bitácora registra cada cambio;
  - el intervalo por función respeta la cuota.
- **App (Testing Library / Vitest):**
  - `speechQueue`: orden, prioridad, sin cortes, descarte de lo viejo, silenciar;
  - `kitchenPhrases`: cada caso en estándar y mínima;
  - `resolveVoice`: coincidencias y respaldo;
  - pantallas: Cuenta sin interruptores, mensaje de "no disponible" y vista previa con la configuración exacta (`speechSynthesis` simulado).
- **Navegador (verificación visual):**
  - plataforma (5 pestañas), centro (IA) y Cuenta (IA y voz);
  - vista previa real;
  - el tablero de Cocina con un comando de voz simulado y alertas simultáneas, sin superposición.
- **Regresión:** todas las suites SQL, las pruebas de la app, `tsc`, `oxlint`, `build` y los asesores.

## 18. Criterios de aceptación
1. Las 7 capacidades de IA y voz están inventariadas y se administran desde la plataforma (global) y el centro (organización y Cuentas); la Cuenta no las activa.
2. Una sola regla de activación en la base; si se apaga globalmente, nadie la usa.
3. Configuración existente migrada sin pérdidas.
4. Voz de cocina configurable:
   - 5 perfiles;
   - estilo, velocidad, volumen e idioma;
   - voz por defecto de plataforma y de organización;
   - personalización por Cuenta solo si se permite;
   - vista previa.
5. Frases cortas y naturales; cola sin superposición ni cortes; latencia medida.
6. Uso por Cuenta y función; costo estimado solo con tokens y precios reales.
7. Ninguna credencial expuesta; RBAC, RLS y aislamiento probados.
8. Sin regresiones en Cocina (estados, arrastre, comandos, códigos, demoras).

## 19. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Quién es el "Super Admin" | El reparto de la sección 2: la plataforma controla lo técnico y global; el SUPER_ADMIN de la organización, la activación por Cuenta y la voz del negocio. |
| **D2** | Proveedor de voz | **A: voz del dispositivo** ahora, con el adaptador listo. Alternativa: **B: Azure** (misma voz en todos los equipos, voces colombianas); requiere que configures la clave. |
| **D3** | El ADMIN de la Cuenta pierde los interruptores de activación | Sí (es el pedido); conserva umbrales y voz si se permite. |
| **D4** | Umbrales de IA | Quedan en la Cuenta, dentro de los rangos de la plataforma. |
| **D5** | Idiomas de la voz | Variantes de español disponibles en el equipo (es-CO por defecto; es-MX, es-ES, es-US). Inglés después, cuando existan las frases en inglés. |
| **D6** | Costos | Tokens desde ahora; costo solo con precios cargados por la plataforma. |
| **D7** | Modelo de abastecimiento (H3) | Corregirlo a `claude-sonnet-5-5` en el catálogo. |
| **D8** | Convención de código | Todo lo nuevo en inglés (rutas, identificadores y claves), aunque la ADR 0013 siga pendiente. |

## 20. Orden de ejecución
| Fase | Qué | Depende de |
|---|---|---|
| 1 | Auditoría (este documento) | — |
| 2 | Modelo de configuración: migraciones 1–3 ensayadas + suites `ai_platform` y `kitchen_voice` | 1 |
| 3 | Migración de datos: activaciones, umbrales, voz por defecto, modelos | 2 |
| 4 | Plataforma → AI (5 pestañas) + Edge Function con modelo, tokens y latencia desde la base | 2 |
| 5 | Centro → IA y Cuenta → IA y voz (sin interruptores de activación) | 2 |
| 6 | Voz de cocina: `speechQueue`, `SpeechEngine`, perfiles, frases, vista previa, latencia | 2 |
| 7 | RBAC/RLS: pruebas de aislamiento y permisos | 2–6 |
| 8 | Validación integral (SQL, app, `tsc`, `oxlint`, `build`, asesores, navegador, despliegue de la Edge Function) | 1–7 |
| 9 | Limpieza de lo viejo tras verificar, y documentación (manual, esta ADR, arquitectura, ERD) | 8 |

---

## 21. Implementación (2026-09-29)

### 21.1 Estado por fase
| Fase | Estado | Resultado |
|---|---|---|
| 1 | ✅ | Auditoría (sección 1). |
| 2 | ✅ | Migraciones `20260930200000_dk_ai_platform_control`, `…210000_dk_feature_activation_rules` y `…220000_dk_kitchen_voice`, más una corrección `…230000_dk_ai_helpers_private` (21.3). Suites nuevas: `ai_platform` (44) y `kitchen_voice` (28). Se actualizaron `features` y `ai_quota`. |
| 3 | ✅ | Datos sin pérdidas: activaciones y umbrales intactos (0 parámetros inválidos), voz por defecto Laura/natural/es-CO, modelos del catálogo (abastecimiento → `claude-sonnet-5-5`, H3). |
| 4 | ✅ | Plataforma → pestaña **IA y voz**, con Funciones, Proveedores, Voz, Uso y Políticas. La Edge Function toma el modelo de la base y guarda tokens y latencia (desplegada). |
| 5 | ✅ | Centro → **IA y voz** (`/o/:org/ai`: Funciones, Voz de cocina, Uso). Cuenta → **IA y voz**, sin interruptores de activación. |
| 6 | ✅ | `src/shared/voice/`: `speechQueue` (prioridades, sin cortes ni superposición), `resolveVoice`, `kitchenPhrases`, `VoiceSettingsForm`, `DeviceVoicePanel`, `useKitchenVoice`. Los comandos, las alertas y las sugerencias pasan por la cola. |
| 7 | ✅ | RBAC/RLS probados: plataforma, dueño de otra organización, ADMIN y COCINA de la Cuenta. |
| 8 | ✅ | SQL 476/476 en la base real; app 174/174 (26 archivos); `tsc` limpio; `oxlint` 0 errores y los 17 avisos previos; `build` correcto; asesores sin hallazgos nuevos. Verificación visual en 1280 px y 375 px. Voz real en el navegador: la cola no superpone, el comando pasa adelante, los duplicados se descartan y la latencia del equipo es ~65 ms. |
| 9 | ✅ | Limpieza: se retiraron `FeatureSwitchCard`, `useSpeech`, `speak.ts` y los modelos fijos de la Edge Function. La pestaña Funciones de Configuración del centro redirige a IA y voz. Manual 3.5 y PDF; esta ADR; arquitectura; ERD. |

### 21.2 Diferencias con el plan
- **Verbosidad:** no es una clave aparte. Se deriva del estilo: Directa y Mínima usan frases mínimas; los demás, estándar.
- **Latencia:** se mide la del equipo (entrega al motor → empieza a hablar). La espera en la cola es intencional y no se cuenta.
- **Permitir personalizar (`allow_account_override`):** vive en `dk_organization_features.settings` y aplica a cualquier función. En la interfaz solo se ofrece para la voz; los umbrales de IA siguen personalizables por Cuenta.
- **Nombres en la interfaz:** la sección del centro y la pestaña de la Cuenta se llaman **IA y voz**. **Configuración** del centro queda con datos del negocio e integraciones y exige `organization.manage`.
- **Componente compartido `Tabs`:** ahora se desplaza dentro de su ancho en pantallas angostas (antes, con 5 pestañas, ensanchaba la página).
- **Bitácora de la plataforma:** los eventos de plataforma (`feature.platform_changed`, `ai.model_changed`, `ai.model_catalog_changed`, `plan.limits_changed`, `voice.catalog_changed`) no tienen organización. Se ven en Plataforma → IA y voz → Políticas → *Cambios recientes*. `voice.settings_changed` sí aparece en la bitácora de la organización.

### 21.3 Seguridad verificada
- **Todas las RPC de plataforma** llaman a `dk_require_platform_admin()`, así que el dueño de otra organización recibe un error (probado). `dk_ai_models` no se lee fuera de la plataforma.
- **Activar por Cuenta** exige `features.manage` de la organización (probado con el ADMIN y con COCINA).
- **Configuración por Cuenta** exige el permiso de la función, la función activa y que la organización lo permita.
- **Hallazgo durante la validación:** Supabase concede EXECUTE a `anon`/`authenticated` en cada función nueva, y `revoke … from public` no lo quita. Las 7 auxiliares (`dk_feature_*_settings`, `dk_feature_override_allowed`, `dk_feature_config_issues`, `dk_require_platform_admin`, `dk_audit_classify_ai`) se revocaron explícitamente en `…230000_dk_ai_helpers_private`. Hay una prueba (`has_function_privilege`) y los asesores quedaron limpios.
- **Clave de Anthropic:** solo existe como secreto de la Edge Function. La pantalla muestra si está configurada, nunca su valor.

### 21.4 Pendiente (fuera de alcance, documentado)
- **Voz en la nube (D2, alternativa B):** no se agregó. El adaptador (`SpeechEngine`) y la columna `provider` la dejan preparada: bastan una Edge Function `dk-tts` y su secreto.
- **Costo estimado:** requiere que la plataforma cargue los precios vigentes de cada modelo (Proveedores). Sin precios se muestra "Sin precio"; no se inventan.
- **Uso de la voz:** la voz del dispositivo no genera llamadas; no hay nada que medir en el servidor.
- **Modelo de abastecimiento:** `claude-sonnet-5-5` quedó en el catálogo, pero no se ejecutó un análisis real de abastecimiento (esas funciones están apagadas en todas las Cuentas). Conviene probarlo al activarlas por primera vez.
- **ADR 0013** (código y URL en inglés) sigue pendiente de aprobación. Todo lo nuevo de esta ADR ya está en inglés.

### 21.5 Acciones manuales
- Cargar los precios de los modelos en Plataforma → IA y voz → Proveedores, si quieres ver el costo estimado.
- Commits pendientes (ADR 0011–0014), cuando los pidas.
