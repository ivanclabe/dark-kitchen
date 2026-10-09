# ADR 0046: Quanela Consumer como módulo de la app

## Estado
**Aprobada e implementada (2026-10-09).**

**Pedido:** convertir Quanela Consumer en un módulo de la app y acomodar su interfaz de forma profesional.

Este pedido también resuelve lo pendiente de la ADR 0042: la migración `20261007120000_dk_consumer_marketplace.sql`, aplicada por error el 2026-10-09, **se queda**, porque el módulo la usa.

---

## 1. Auditoría
| Hoy | Problema |
|---|---|
| Es una pestaña de **Configuración** (`/settings/consumer`, `ConsumerSettingsPage`), visible con `storefront.manage` (ADMIN y GERENTE) | Publicar el negocio para los clientes es una tarea del negocio, no un ajuste técnico. Queda escondido entre Facturación e Integraciones |
| Una sola página larga: el interruptor «Publicar», el formulario del negocio, el interruptor de tiempos y la lista de platos | No hay resumen. No dice qué falta para estar listo (horario, ubicación, fotos, descripciones). El estado de publicación se pierde dentro del formulario |
| La lista de platos tiene un interruptor por plato, etiquetas y «Publicar todos» | Sin búsqueda, sin filtros (sin foto, sin descripción, publicados) y sin foto del plato. Con muchos platos no se puede manejar |
| Los avisos «sin foto» y «sin descripción» | No dicen dónde se arreglan (en Catálogo) |
| La app del cliente (iOS, `quanela-ios`) no está publicada y `dk-consumer-assistant` no está desplegada (ADR 0042, §11.4) | La pantalla no lo dice: parece que los clientes ya ven lo que se publica |
| Datos: `dk_storefront_get` ya trae todo (el negocio, los valores sugeridos, el estado abierto o cerrado, la vista previa de los tiempos y los platos con foto, descripción y receta) | No hace falta nada nuevo en la base |

## 2. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Dónde vive | Un módulo propio en el menú lateral, **«Consumer»** (ícono de tienda), después de Clientes, con el título **«Quanela Consumer»**. Lo ve quien tiene `storefront.manage` (ADMIN y GERENTE, como hoy). Sale de Configuración, y `/settings/consumer` lleva al módulo |
| **D2** | Secciones | Tres, con la barra subrayada de los demás módulos (`/consumer`, `/consumer/perfil`, `/consumer/platos`):<br>**Resumen · Perfil del negocio · Platos** |
| **D3** | Resumen | • **Estado:** «Publicado desde el …» o «No publicado», con la acción principal **Publicar** o **Pausar publicación**.<br>• **Lista para publicar:** lo que tienes y lo que falta, cada punto con su enlace para arreglarlo: nombre y tipo de cocina, frase corta, ubicación, horario (Cocina → Horario), WhatsApp, al menos un plato publicado, platos con foto y platos con descripción. Solo se puede publicar si están los obligatorios: nombre, dirección pública y un plato. Los demás son recomendaciones.<br>• **Cómo te ven:** una vista previa de la tarjeta del negocio (nombre, frase, cocina, abierto o cerrado ahora y, si los compartes, los tiempos) y de un plato publicado.<br>• **Cifras:** platos publicados de los activos, con foto, con descripción y con etiquetas.<br>Todo sale de `dk_storefront_get`; **no se muestran visitas ni búsquedas**, porque no se miden |
| **D4** | Perfil del negocio | El mismo formulario de hoy, en tarjetas:<br>• **Identidad:** nombre para los clientes, dirección pública, frase corta y tipo de cocina;<br>• **Contacto y ubicación:** WhatsApp y ubicación (con «Ver en el mapa»);<br>• **Datos que compartes:** tiempos y cumplimiento, con la vista previa real.<br>Una sola barra de guardar. El interruptor «Publicar» pasa al Resumen |
| **D5** | Platos | Buscador, filtros (**Todos · Publicados · Sin publicar · Sin foto · Sin descripción**), seleccionar varios para **Publicar** u **Ocultar**, y por plato:<br>• foto, nombre, categoría y precio;<br>• etiquetas (vegetariano, vegano, sin gluten, picante, saludable);<br>• «Mostrar ingredientes»;<br>• el interruptor de publicar.<br>Lo que falta («sin foto», «sin descripción») enlaza al plato en Catálogo. Una barra de guardar para todos los cambios |
| **D6** | Honestidad | Mientras la app del cliente no esté publicada, un aviso en el Resumen: «La app para clientes todavía no está disponible. Lo que prepares aquí quedará listo para el lanzamiento». Lo controla `VITE_CONSUMER_APP_LIVE` (apagado). Al lanzar, lo enciendes y el aviso desaparece |
| **D7** | Ayuda | Un artículo nuevo, «Publicar tu negocio en Quanela Consumer», en la sección Catálogo; notas de versión; `npm run help` y desplegar `dk-copilot`. El manual no se toca |

## 3. Fases
| Fase | Qué |
|---|---|
| 1 · Módulo | `src/modules/consumer/` (`api`, `pages`, `components`). Se mueve `consumerApi.ts` de settings. `ModuleKey 'consumer'` → `storefront.manage`, que sale de `settings`. Entrada en `NAV_ITEMS`, rutas y redirección desde `/settings/consumer`. Se quita la pestaña de Configuración |
| 2 · Resumen | Estado y acción, lista de preparación, vista previa y cifras |
| 3 · Perfil y Platos | Las tarjetas del perfil. Platos con búsqueda, filtros, selección, fotos y enlaces a Catálogo |
| 4 · Ayuda | El artículo, las notas de versión y el despliegue |
| — | **Validación:**<br>• Vitest: navegación por permiso, la redirección, la lista de preparación (qué falta y cuándo se puede publicar), la acción de publicar o pausar, filtros y selección de platos, el aviso D6.<br>• `tsc`, `oxlint` y los builds.<br>• Navegador con la sesión guardada, **sin publicar nada** (solo lectura); el botón Publicar se prueba con datos simulados.<br>• La base no cambia: `consumer_public` sigue en verde |

## 4. Riesgos
| Riesgo | Mitigación |
|---|---|
| Publicar sin querer | Publicar es un botón con confirmación que dice cuántos platos verán los clientes. Pausar es inmediato |
| Mostrar cifras que no existen | Solo cifras de `dk_storefront_get`. Sin visitas, búsquedas ni calificaciones |
| Que se crea que los clientes ya ven el negocio | El aviso D6 hasta el lanzamiento |

## 5. Resultados (2026-10-09)
| Fase | Qué quedó |
|---|---|
| 1 · Módulo | `src/modules/consumer/`:<br>• `api/storefront.ts`, movido desde `settings/consumerApi.ts`;<br>• `hooks/useStorefront.ts`;<br>• `lib/readiness.ts`: lista para publicar, cifras, filtros y rutas;<br>• `pages/ConsumerPage.tsx`;<br>• `components/ConsumerOverview`, `ConsumerProfile` y `ConsumerDishes`.<br>`ModuleKey 'consumer'` → `storefront.manage`, que sale de `settings`. «Consumer» en el menú lateral, después de Clientes. Rutas `/consumer` y `/consumer/:section`; `/settings/consumer` redirige al módulo. Se quitaron la pestaña de Configuración y `ConsumerSettingsPage` |
| 2 · Resumen | Aviso de que la app todavía no está disponible (`VITE_CONSUMER_APP_LIVE`). Estado con **Publicar** (con confirmación y el número de platos) o **Pausar publicación**. Cifras de los platos publicados. «Lista para publicar», con 9 puntos, los obligatorios marcados y su enlace. «Cómo te ven los clientes» |
| 3 · Perfil y Platos | Perfil en tres tarjetas. «Ver en el mapa» abre las coordenadas en Google Maps. Guardar el perfil no cambia la publicación. Platos: buscador, 5 filtros con su conteo, selección de varios con **Publicar** u **Ocultar**, foto, etiquetas, ingredientes y una sola barra de guardar. «sin foto» y «sin descripción» llevan a `/menu-planner?plato=<id>`: Catálogo ahora abre el editor de ese plato con ese parámetro |
| 4 · Ayuda | Artículo `quanela-consumer` (sección Catálogo). `/consumer` se agregó a las pantallas válidas de la ayuda (`scripts/help/lib.ts`) y Copilot reconoce la pantalla «Quanela Consumer». Notas de versión. `dk-copilot` desplegada |

**Validación:**
- Vitest: **663** (104 archivos). Nuevas:
  - `lib/readiness.test.ts`: lo obligatorio, los enlaces para arreglar, un negocio completo, las cifras, los filtros y los tiempos compartidos;
  - `ConsumerPage.test.tsx`: las secciones y el aviso, publicar con confirmación, sin plato no se publica, pausar, los filtros y el enlace a Catálogo, publicar varios, Platos sin perfil.
  - `sections.test.ts` actualizado.
- `tsc`, `oxlint` (13 avisos) y los dos builds correctos.
- `consumer_public` **48/48** contra la base. La base no cambió.
- **Navegador, sin publicar ni guardar nada:**
  - `/settings/consumer` redirige a `/consumer`, y Configuración ya no tiene la pestaña;
  - las tres secciones cargan sin errores de red;
  - «sin descripción» abre el plato en Catálogo.
- **El perfil que ya existía en producción** (Sopa donde Carmen, sin publicar y sin platos) lo guardó tu propia sesión hoy a las 11:08 (hora de Colombia), antes de este trabajo.
