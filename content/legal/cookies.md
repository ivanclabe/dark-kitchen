---
slug: cookies
title: Política de Cookies
summary: Qué cookies y qué almacenamiento del navegador usa Quanela, para qué sirven, cuánto duran y cómo gestionarlos. No usamos analítica ni publicidad.
version: "1.0"
effective: 2026-10-19
order: 5
---

## 1. Qué son

Las **cookies** son pequeños archivos que un sitio guarda en tu navegador. El **almacenamiento local** (`localStorage`) y el **de sesión** (`sessionStorage`) cumplen una función parecida: el primero dura hasta que se borra; el segundo, hasta que cierras la pestaña.

Cuando permiten identificarte, su uso es tratamiento de datos personales y se rige por la [Política de Tratamiento de Datos](/legal/privacidad).

## 2. En resumen

- Solo usamos lo **necesario** para que el servicio funcione y lo que guarda tus **preferencias** cuando las cambias.
- **No usamos analítica ni publicidad**, ni píxeles de redes sociales. Las fuentes tipográficas se sirven desde nuestro propio dominio.
- Si algún día agregamos analítica o marketing, quedarán **apagadas** hasta que las aceptes en [Preferencias de privacidad](/legal/preferencias).

## 3. Estrictamente necesarias

Sin ellas no puedes iniciar sesión ni usar el servicio. No se pueden desactivar desde Quanela.

| Nombre | Tipo | Duración | Para qué | Quién la pone |
| --- | --- | --- | --- | --- |
| `sb-<proyecto>-auth-token` (y sus partes `.0`, `.1`) | Cookie, dominio `.quanela.com` | Hasta 400 días | Mantener tu sesión abierta en los subdominios de tu organización | Quanela (Supabase) |
| `dk-wait` | Cookie | 15 segundos | Continuidad de la barra de carga al iniciar sesión | Quanela |
| `dk-choose-account`, `dk-owner-sign-in` | sessionStorage | Hasta cerrar la pestaña | Recordar el paso del inicio de sesión | Quanela |
| `dk-signup-plan`, `dk-signup-period` | sessionStorage | Hasta cerrar la pestaña | Recordar el plan y el periodo elegidos al registrarte | Quanela |
| `dk-legal-consent` | sessionStorage | Hasta cerrar la pestaña | Recordar que marcaste las casillas de aceptación mientras terminas el registro | Quanela |
| Sesión de respaldo | localStorage | Hasta cerrar sesión | Guardar la sesión solo en entornos de prueba y vista previa | Quanela (Supabase) |
| `quanela:cart:*` | localStorage | El día del pedido; los carritos viejos se borran | Guardar tu carrito en el menú web público | Quanela |

## 4. Preferencias

Se guardan **solo cuando cambias** una opción, para recordarla. Si las borras, Quanela vuelve a los valores por defecto.

| Nombre | Tipo | Duración | Para qué | Quién la pone |
| --- | --- | --- | --- | --- |
| `dk-appearance` | Cookie y localStorage | 400 días | Tema y tamaño del texto | Quanela |
| `dk-last-kitchen`, `dk-active-role:*` | localStorage | Hasta que lo borres | Última cocina y rol que usaste | Quanela |
| `dk-kitchen-sound`, `dk-kitchen-view`, `dk-kitchen-density` | localStorage | Hasta que lo borres | Sonido, vista y densidad de la pantalla de cocina | Quanela |
| `dk-kitchen-insight-dismissed`, `dk-tip-dismissed`, `dk-help-feedback` | localStorage | Hasta que lo borres | No repetir los avisos y consejos que ya cerraste, y recordar si un artículo de ayuda te sirvió | Quanela |
| `dk-voice-*` | localStorage | Hasta que lo borres | Preferencias de voz de «Oye Quanela» | Quanela |
| `dk-consent` | localStorage | Hasta que lo borres | Tus preferencias de privacidad | Quanela |
| `dk-copilot-conversation:*` | sessionStorage | 30 minutos | Los últimos 40 mensajes de tu conversación con Copilot; se quedan en tu dispositivo | Quanela |

## 5. Terceros

| Servicio | Cuándo | Para qué |
| --- | --- | --- |
| Cloudflare Turnstile | Solo en el registro y al pedir un código por SMS | Seguridad: distinguir personas de bots. Puede poner sus propias cookies en su dominio |
| Wompi | Solo cuando pagas | Procesar el pago en su checkout. Puede poner sus propias cookies en su dominio |

Estas cookies las controla cada proveedor según sus propias políticas.

## 6. Analítica y marketing

Hoy no hay ninguna. Si en el futuro las usamos, actualizaremos esta política, las listaremos aquí y no se activarán hasta que las aceptes.

## 7. Cómo gestionarlas

- En [Preferencias de privacidad](/legal/preferencias) ves cada cookie y clave por categoría y eliges qué permitir.
- En tu navegador puedes bloquear o borrar cookies y datos de sitios. Si borras las necesarias, se cerrará tu sesión; si las bloqueas, no podrás iniciar sesión.

## 8. Cambios

Si cambian las cookies que usamos, publicaremos una nueva versión de esta política con su fecha.
