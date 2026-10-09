# ADR 0045: Una sola voz para todas las cuentas

## Estado
**Implementada (2026-10-09).** Pedido directo del usuario, sin propuesta previa.

**Pedido:** ocultar «Voz de la aplicación» en Configuración → IA y voz → Funciones, conservar la voz configurada hoy y dejarla como la de fábrica de todas las cuentas, las que ya existen y las nuevas.

## Antes
| Nivel | Voz |
|---|---|
| Plataforma (`dk_features.default_settings`) | Karen · natural · velocidad 1 · volumen 1 · **es-CO** |
| Negocio Dark Kitchen (Sopa donde Carmen, Hamburgesas del Norte) | Karen · natural · 1 · 1 · **es-US** (su propio ajuste) |
| Julian Hamburguesas | La de la plataforma (es-CO) |
| Cuentas con ajuste propio | Ninguna |

La función estaba encendida en las tres cuentas, y la incluyen todos los planes (standard, business y enterprise).

## Decisiones
- **La voz actual** es la de Dark Kitchen, el negocio de la cuenta activa. Solo se diferenciaba de la de la plataforma en el idioma (es-US).
- **Ahora es la de fábrica:** el valor por defecto de la plataforma pasa a Karen · natural · 1 · 1 · es-US. Se borran los ajustes propios de negocios y cuentas (`settings = '{}'`), así que todas las cuentas usan la de la plataforma, también las nuevas. El único ajuste propio que había tenía exactamente esos mismos valores.
- **Siempre encendida.** Como ya no hay interruptor, la migración la deja encendida en todo lugar donde estuviera apagada. Hoy no había ninguno.
- **Quién la cambia ahora:** solo la plataforma, desde el portal de administración → Voz.
- **Qué no cambia:** «Este dispositivo» sigue permitiendo elegir la voz instalada en cada equipo y apagar las respuestas habladas.

## Qué quedó
- **Migración `20261009110000_dk_voice_speech_platform_default` (aplicada):**
  - Antes de aplicarla, se revisó que fuera la única pendiente.
  - Después, las tres cuentas activas tienen la voz encendida y con la misma configuración (es-US).
- **App:**
  - `FeaturesPanel` oculta `voice_speech` (`HIDDEN_FEATURES`) y quita la nota «Para hablar usa «Voz de la aplicación»».
  - `AiSettingsPage` ya no muestra «Voz de cocina». Se eliminaron `KitchenVoicePanel` y la opción `extra` del panel, que quedaron sin uso.
  - `DEFAULT_VOICE_SETTINGS` (el respaldo de la app) pasa a es-US.
- **Pruebas:**
  - Nueva suite SQL `voice_default` (5/5).
  - `kitchen_voice` 29/29: se actualizaron 2 expectativas de es-CO a es-US.
  - `features`, `ai_platform`, `voice_app_wide`, `voice_models`, `wake_word`, `plans` y `billing` siguen en verde.
  - Vitest 650: se actualizó la expectativa de `toVoiceSettings`.
  - `tsc`, `oxlint` (13 avisos) y los dos builds correctos.
- **Navegador:** en Configuración → IA y voz → Funciones ya no aparecen «Voz de la aplicación» ni «Voz de cocina».
