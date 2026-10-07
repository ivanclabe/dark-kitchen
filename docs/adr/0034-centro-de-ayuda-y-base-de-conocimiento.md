# ADR 0034: Centro de ayuda público y base de conocimiento de «Oye Quanela»

## Estado
**Aprobada e implementada (2026-10-06).** La dirección pública es **`doc.quanela.com`** ([ADR 0035](./0035-documentacion-en-doc-quanela.md)); `/help` de la app redirige allá. Faltan las capturas que necesitan la cuenta demo (ver la sección 8).

**Pedido:** documentación pública de **Quanela** (sin inicio de sesión), con:
- un menú lateral tipo wiki;
- introducción, primeros pasos, guías por módulo, capturas anotadas, preguntas frecuentes y notas de versión.

Debe ser **la fuente de verdad** que también consulta «Oye Quanela»: si alguien pregunta «¿cómo uso Cocina?», responde breve y muestra el enlace exacto al artículo.

**Reglas:**
- No se reconstruye nada de la app.
- El contenido describe la app **tal como es hoy** (ADR 0024 a 0033), sin funciones inventadas.
- URL e identificadores en inglés; textos en español; la marca es **Quanela**.
- Las capturas **nunca muestran datos reales de clientes**.
- **El manual actual (`docs/manual/`) no se toca** (D7).

---

## 1. Auditoría (Fase 1)

### 1.1 Documentación que existe hoy
| Pieza | Estado |
|---|---|
| `docs/manual/manual-usuario.html` (108 KB) y el PDF | **Desactualizado.** Habla de «Dashboard», de Cocina como módulo aparte, de «Reportes», del «Centro de administración de la organización» y de crear pedidos desde Cocina. Hoy eso es Inicio, Operación (ADR 0031), Insights (ADR 0027) y la cuenta como único nivel (ADR 0024). **No tiene ninguna imagen.** Es un solo archivo y no es buscable por secciones |
| `docs/adr/*`, `docs/00-architecture.md` | Técnicos, para el equipo: no sirven a una persona del negocio |
| Ayuda dentro de la app | Los atajos de teclado y «Reportar un problema» (`app/help`). Copilot tiene `appHelp.ts`, **24 respuestas fijas** de «dónde se hace», en el código de la Edge Function: es una segunda fuente que se desactualiza sola |

### 1.2 La app que hay que documentar (estado actual)
| Área | Pantallas y flujos |
|---|---|
| Entrada | Registro del dueño (correo, Google, Instagram y teléfono), login, activación de invitados, «Tus cuentas», un subdominio por organización |
| **Inicio** | La operación de hoy, «Necesita atención» y alertas con enlace |
| **Operación** (pedidos y cocina) | Tablero, Cocina (voz, tiempos, tamaño grande), Despacho, Lista, el pedido (estado y pago), Registrar y anular pago, domiciliarios |
| **Catálogo** | Planificador de menús, platos, recetas y costo, platos compartidos |
| **Abastecimiento** (inventario) | Stock (bajo mínimo, «Se usa en»), Compras, Proveedores, mermas y ajustes |
| **Clientes** | Lista con filtros, cartera, detalle, nuevo pedido desde el cliente |
| **Insights** (reportes) | Resumen, Ventas, Productos y Costos |
| **Personal** | Turnos y Mis turnos |
| **Usuarios** | Usuarios, roles y permisos |
| **Configuración** | General, Facturación, IA y voz, Integraciones y Actividad |
| **Copilot y «Oye Quanela»** | Preguntas, voz en toda la app y comandos en Cocina |

### 1.3 Restricciones técnicas encontradas
| Hallazgo | Consecuencia |
|---|---|
| **Una sola app** (Vite + React) en Vercel, con reescritura de todo a `index.html` | El centro de ayuda puede vivir **dentro de la misma app** como una ruta pública, sin otro despliegue |
| `TenantGate` deja pasar `OPEN_PATHS` (`/login`, `/registro`, `/landing`…) sin sesión | Se agrega `/help`, que funciona en `quanela.com/help` **y** en el subdominio de cada negocio |
| La Edge Function `dk-copilot` no lee archivos del repositorio en tiempo de ejecución | Necesita un **índice generado** (JSON) junto a la función, y un despliegue cuando cambia el contenido |
| No hay herramienta de capturas. **Chrome está instalado** | `playwright-core` (dependencia de desarrollo, **sin** descargar navegadores) con el Chrome local |
| **No puedo iniciar sesión por ti** y no corresponde mostrar datos reales | Las capturas se toman con **tu token** sobre una **cuenta demo con datos ficticios** (D6) |

---

## 2. Arquitectura de información y diseño (Fase 2)

### 2.1 Dónde vive
- **`/help`**: una ruta pública de la app, cargada aparte, así la app no se hace más pesada. Se le agrega a `OPEN_PATHS`.
  - Ejemplo: `https://quanela.com/help/operations/kitchen-view`, y lo mismo en `{código}.quanela.com/help/…`.
- El título visible es «**Centro de ayuda de Quanela**». Las URL van en inglés, como el resto de la app.
- **Accesos:**
  - en la landing y el login, «Centro de ayuda»;
  - dentro de la app, el menú de usuario → «Centro de ayuda»;
  - un **«?» en el encabezado de cada pantalla**, que abre el artículo de esa pantalla;
  - Copilot y «Oye Quanela».

### 2.2 Menú lateral (tipo wiki)
```
Centro de ayuda de Quanela                      [🔍 Buscar   /]
├─ Introducción
│   ├─ ¿Qué es Quanela?
│   ├─ Conceptos: organización, cuentas, roles y pedidos
│   └─ Qué ve cada rol
├─ Primeros pasos
│   ├─ Crear tu negocio
│   ├─ Entrar a Quanela y cambiar de cuenta
│   ├─ Preparar tu cuenta (horario, platos, equipo)
│   └─ Tu primer pedido, de principio a fin
├─ Pedidos (Operación)
│   ├─ El Centro de operaciones
│   ├─ Crear un pedido
│   ├─ Confirmar, cancelar y estados del pedido
│   ├─ Despachar y entregar
│   ├─ Buscar pedidos (Lista)
│   └─ Registrar y anular pagos
├─ Cocina
│   ├─ Usar la vista Cocina
│   ├─ Tiempos y pedidos atrasados
│   ├─ Comandos de voz en cocina
│   └─ Horario y tiempos objetivo
├─ Inventario (Abastecimiento)
│   ├─ Stock e insumos bajo el mínimo
│   ├─ Registrar una compra
│   ├─ Proveedores
│   ├─ Mermas y ajustes
│   └─ Cómo se descuenta el inventario
├─ Catálogo
│   ├─ Platos y menú del día
│   └─ Recetas y costo de un plato
├─ Clientes
│   └─ Clientes y cartera
├─ Reportes (Insights)
│   ├─ Leer Insights
│   ├─ Rentabilidad de los platos
│   └─ Costos y compras
├─ Equipo
│   ├─ Usuarios y roles
│   └─ Turnos
├─ Copilot y «Oye Quanela»
│   ├─ Preguntarle a Copilot
│   ├─ Activar «Oye Quanela»
│   └─ Qué puede y qué no puede responder
├─ Configuración
│   └─ IA y voz, integraciones y actividad
├─ Capturas anotadas        (galería de todas las pantallas, con sus notas)
├─ Preguntas frecuentes
└─ Notas de versión
```
Son unos **40 artículos**.

### 2.3 Cómo es cada artículo
- **Encabezado:**
  - título;
  - resumen de una línea (el mismo que lee «Oye Quanela»);
  - «Para: Caja · Administración»;
  - «Abrir en Quanela →», que lleva a la pantalla si hay sesión.
- **Pasos numerados**, cortos y en imperativo («Toca **Nuevo pedido**»), con lo que se ve en pantalla en **negrita**.
- **Capturas anotadas:** la imagen con **marcadores numerados** sobre la pantalla real y, debajo, la lista de notas con esos números. El texto alternativo describe la imagen.
- **Notas** («Bueno saber», «Cuidado»).
- **Preguntas relacionadas** y «Artículos relacionados».
- **Pie:** «Actualizado el …» y «¿Te sirvió?» (👍/👎, guardado solo en el navegador; ver Futuro).
- **Diseño:**
  - el mismo de la app (marca, oscuro y claro);
  - el menú lateral fijo en escritorio y un cajón en el celular;
  - un índice de la página a la derecha en pantallas anchas;
  - anclas en los títulos;
  - un enlace para saltar al contenido.

### 2.4 Fuente de verdad: Markdown con metadatos
Los artículos son archivos `content/help/<sección>/<id>.md`, versionados con el código:
```yaml
---
id: kitchen-view                 # estable, en inglés; también es la URL: /help/kitchen/kitchen-view
section: kitchen
title: Usar la vista Cocina
summary: La pantalla de la línea: los pedidos en cola, preparando y listos, que avanzas con un toque.
audience: [kitchen, admin, owner]          # para quién es (texto «Para:» y ranking)
permissions: [kitchen.view]                # qué permiso abre esa pantalla
appPath: /operations?view=kitchen          # «Abrir en Quanela»
questions:                                 # cómo lo pregunta la gente (búsqueda y Copilot)
  - ¿Cómo uso el módulo de Cocina?
  - ¿Cómo marco un pedido como listo?
keywords: [cocina, KDS, comanda, preparar, listo, en cola]
related: [kitchen-times, kitchen-voice, orders-states]
screenshots:
  - file: kitchen-view.png
    alt: Vista Cocina con tres columnas y un pedido prioritario
    notes:
      - Columnas En cola, Preparando y Listo.
      - El botón de cada tarjeta avanza el pedido.
      - Marca de prioritario.
updated: 2026-10-06
order: 1
---
```
- **`scripts/build-help.ts`** valida el contenido:
  - campos obligatorios, `id` únicos y `related` existentes;
  - que las capturas existan;
  - que `appPath` sea una ruta de la app;
  - que cada `summary` tenga 220 caracteres o menos.
- Con eso genera:
  1. el índice del sitio;
  2. **`supabase/functions/_shared/kb.json`**, el índice compacto para Copilot (id, URL, título, resumen, preguntas, palabras clave, permisos, pasos resumidos y encabezados).
- Una prueba de Vitest falla si el índice quedó desactualizado frente a los `.md`: el agente nunca responde con un índice viejo.
- **`appHelp.ts` desaparece:** sus 24 respuestas pasan a artículos. **Una sola fuente.**

### 2.5 Búsqueda (Fase 6)
- **Un solo buscador compartido** en `supabase/functions/_shared/kbSearch.ts`, puro, sin dependencias. Lo usan el sitio y la Edge Function, así que encuentran lo mismo.
  - Ignora tildes y mayúsculas, quita palabras vacías y reduce a la raíz («registro» y «registrar»).
  - Usa sinónimos del negocio: pedido/orden/comanda, inventario/stock/abastecimiento, reportes/Insights, cobro/pago/abono, domicilio/despacho/entrega, cocina/KDS.
  - Pesa más el título y las `questions` que las `keywords`, y estas más que el cuerpo.
  - Con un rol, sube los artículos de su `audience` o `permissions`.
- **En el sitio:**
  - `/` enfoca el buscador;
  - los resultados aparecen mientras se escribe, con el fragmento resaltado;
  - el teclado ↑ ↓ Enter funciona;
  - si no hay resultados, sugiere preguntarle a Copilot.

### 2.6 Integración con «Oye Quanela» (Fase 7)
- **La herramienta nueva `help`** reemplaza a `app_help`. Recibe la pregunta y devuelve los 3 mejores artículos con su id, título, resumen, pasos clave y URL.
  - El permiso de la persona solo cambia el **orden**: la documentación es pública.
  - Si el artículo es de una acción que su rol no puede hacer, Copilot lo dice.
- **El contrato `answer` suma `links`:** hasta 2 artículos. **Se validan contra el índice**, así que un id inventado se descarta.
- **En el panel de Copilot:** debajo de la respuesta breve aparece la tarjeta «📄 Usar la vista Cocina · Centro de ayuda», que abre `/help/kitchen/kitchen-view` en una pestaña nueva para no perder la conversación.
- **Por voz:** «Oye Quanela, ¿cómo uso el módulo de Cocina?»
  - Dice el resumen y «Te dejé el enlace a la guía».
  - La burbuja de la barra superior muestra **«Abrir guía»**.
  - Si estás en otra pantalla, también ofrece «Ir a Cocina» (`appPath`).
- **Prueba:**
  - 40 preguntas de «¿cómo…?» con su artículo esperado, en Vitest y sin red. Meta: el correcto **primero en ≥ 85 %** y entre los **3 primeros en ≥ 95 %**.
  - `copilot-eval` suma 10 preguntas que verifican el enlace correcto.

---

## 3. Capturas anotadas (Fases 4 y 6)
- **`scripts/help-screenshots.ts`** (`playwright-core` con el Chrome local):
  1. abre la app con **tu token** en la **cuenta demo**;
  2. recorre una lista de escenas (pantalla, tamaño, acciones como «abrir el pedido 1042»);
  3. **dibuja los marcadores numerados** sobre los elementos indicados;
  4. guarda la imagen en `public/help/img/<escena>.png` (escritorio, y celular cuando ayuda).
- **Se pueden repetir:** cuando cambie una pantalla, se vuelve a correr el script y todas las capturas quedan al día.
- **Privacidad:** solo la **cuenta demo** con datos ficticios (D6). Antes de guardar, el script revisa que no aparezca ningún teléfono ni correo con forma real (salvo los inventados del demo).

---

## 4. Fases y entregables
| Fase | Qué | Resultado |
|---|---|---|
| 1 | Auditoría | Esta sección 1 |
| 2 | Arquitectura de información y diseño | Las secciones 2 y 3, más un borrador visual del sitio |
| 3 | El sitio | `src/modules/help` con el diseño, el menú lateral, el artículo, la galería, las preguntas frecuentes y las notas de versión, en la ruta pública `/help`. El «?» en `PageHeader` y los accesos desde la landing, el login y el menú de usuario |
| 4 | Contenido real | Unos 40 artículos en español, revisados contra la app actual (cada paso verificado en el código). Capturas anotadas con el script sobre la cuenta demo |
| 5 | Base de conocimiento | Los metadatos, `build-help.ts`, `kb.json` y la prueba de sincronía. Adiós a `appHelp.ts` |
| 6 | Búsqueda | `kbSearch.ts` compartido, el buscador del sitio y la prueba de 40 preguntas |
| 7 | «Oye Quanela» | La herramienta `help`, `links` en el contrato, las tarjetas en Copilot, «Abrir guía» en la voz, el despliegue de `dk-copilot` y las 10 preguntas en `copilot-eval` |
| — | Validación | Vitest, `tsc`, `oxlint`, builds, la revisión en el navegador (escritorio, celular, sin sesión y en el subdominio) y esta ADR con resultados |

## 5. Futuro (no se simula)
| Mejora | Qué falta |
|---|---|
| Páginas pre-renderizadas para buscadores (SEO) | Un paso de prerender en el build (Google ya indexa SPA; se mide primero) |
| 👍/👎 de los artículos guardados en la base | Una tabla pública con límite anti-abuso |
| Búsqueda en Postgres (texto completo) | Conviene si pasa de unos 200 artículos |
| Videos cortos | Grabación y alojamiento |
| Inglés | Traducción y un selector de idioma |
| Retirar el manual HTML/PDF | Tu autorización explícita (D7) |

## 6. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | ¿Sitio aparte o dentro de la app? | **Dentro de la app**, en la ruta pública `/help` cargada aparte: mismo diseño, mismo despliegue, funciona en cada subdominio |
| **D2** | Formato del contenido | **Markdown con metadatos** en `content/help/`, renderizado con `marked` (una dependencia pequeña y conocida). Sin HTML crudo |
| **D3** | ¿Cómo lo ve Copilot? | **Índice generado** (`kb.json`) junto a la función, con una prueba que exige que esté al día. Sin tablas nuevas en la base |
| **D4** | Búsqueda | **Propia y compartida** (`kbSearch.ts`), sin dependencias; Postgres va a «Futuro» |
| **D5** | `appHelp.ts` | **Se elimina.** La documentación es la única fuente |
| **D6** | ¿Con qué datos se toman las capturas? | **Una cuenta demo con datos ficticios.** Tú creas el negocio demo (registro normal, yo no puedo crear cuentas) y **yo cargo los datos ficticios** con un script idempotente que solo toca esa organización (necesita tu autorización, porque escribe datos). Después me pasas un token de esa sesión |
| **D7** | El manual HTML/PDF actual | **No se toca** (tu instrucción). Queda desactualizado y el centro de ayuda pasa a ser la fuente de verdad. Retirarlo o redirigirlo, solo cuando me lo pidas |
| **D8** | Notas de versión | **Por fecha y escritas para el negocio** (no técnicas), desde la ADR 0020 hasta hoy |
| **D9** | Herramienta de capturas | **`playwright-core`** (desarrollo, sin descargar navegadores) con tu Chrome |

## 7. Qué necesito de ti
1. **Aprobar esta ADR**, con D1 a D9 confirmadas o corregidas.
2. Para las capturas (D6):
   - crear el negocio demo en `quanela.com/registro`, por ejemplo «Quanela Demo», con un correo tuyo con alias, como `tu+demo@gmail.com`;
   - decirme cuando exista, para cargar los datos ficticios;
   - pasarme un token de esa sesión.

   Mientras tanto avanzo con las Fases 2, 3, 5, 6 y 7 y con los textos de la Fase 4; las capturas entran al final.

## 8. Resultados (2026-10-06)

### Lo que quedó
| Fase | Resultado |
|---|---|
| 3 · Sitio | `/help` pública, cargada aparte con `lazy` del router: menú tipo wiki (14 secciones), buscador con «/», artículo con pasos, capturas, relacionados, «Abrir en Quanela», ¿te sirvió?, anterior/siguiente e índice. «?» junto al título de cada pantalla (`PageHeader`/`SectionLayout`; en Operación y Abastecimiento, la guía de la vista activa). «Centro de ayuda» siempre en el menú de usuario (`VITE_HELP_URL` solo lo redirige), en el login y en la landing |
| 4 · Contenido | **40 artículos** en `content/help/`, cada paso revisado contra el código y la base: introducción (4), primeros pasos (5), pedidos (7), cocina (4), inventario (5), catálogo (2), clientes (1), reportes (3), equipo (2), asistente (3), configuración (1), capturas (1), preguntas frecuentes (1), notas de versión (1) |
| 5 · Base de conocimiento | `npm run help` valida y genera el sitio, `helpPaths.ts` y `kb.ts` (un módulo TS en lugar de `kb.json`: lo importan igual la app y la función). Valida id, sección, resumen ≤ 220, audiencias, permisos, `appPath`, relacionados, enlaces `help:`, capturas y elementos de listas mal escritos en YAML. `appHelp.ts` eliminado |
| 6 · Búsqueda | `kbSearch.ts` compartido. Prueba con 40 preguntas parafraseadas: **92,5 % acierta en el primer resultado y 100 % entre los tres primeros** (meta: 85 % y 95 %) |
| 7 · «Oye Quanela» | Herramienta `help`, `links` en el contrato, tarjetas «Centro de ayuda» en Copilot y «Abrir guía» en la burbuja de voz. `dk-copilot` **desplegada** (responde 401 sin sesión, como debe). `copilot-eval` suma 10 preguntas con la guía esperada y mide «Enlaza la guía correcta» |
| Capturas | Script repetible con números fuera del texto, recorte opcional (`crop`), escenas con ids de la demo por variable (no crea datos) y modo `--login` (inicias sesión tú, la sesión queda en `.help-session.local`). **Las 17 capturas listas** (ver «Capturas con sesión») |

### Validación
- `tsc` sin errores; `oxlint` con los 14 avisos de siempre.
- Vitest: **499 pruebas** (84 archivos) al cerrar la ADR; **554** (91 archivos) después de las capturas. Nuevas: sincronía y búsqueda (`scripts/help/help.test.ts`) y páginas (`src/modules/help/HelpPages.test.tsx`).
- `npm run build` y `npm run build:admin` correctos. El contenido de la ayuda va en su propio fragmento: el paquete principal no lo carga.
- Navegador: `/help` sin sesión en un subdominio, buscador y artículo con captura.
- SQL: sin cambios en la base en esta ADR.

### Correcciones de contenido encontradas al verificar
- No existe «¿Olvidaste tu contraseña?»: la guía dice que el soporte envía un enlace para crear una nueva.
- El cupo de Copilot es de toda la cuenta, en una ventana de 24 horas, y los intentos fallidos sí cuentan (solo no hacen esperar).

### Capturas con sesión (2026-10-06)
- **Datos:** en lugar de una cuenta demo nueva, se usó la cuenta de prueba «Dark Kitchen» (en pantalla, «Sopa donde Carmen»). Tú confirmaste que sus datos son ficticios. **No se escribió nada en la base.**
- **Privacidad:**
  - `QUANELA_HELP_REPLACE` cambia, antes de capturar, tu nombre por «Laura Gómez» y tu correo por `laura@negocio.co`. Lo hace en el texto y en `aria-label`, `title` y `alt`.
  - El control de privacidad sigue bloqueando cualquier teléfono o correo que no esté en `QUANELA_HELP_ALLOW`. Esa lista solo tiene los teléfonos ficticios de los clientes de prueba.
- **Mejoras al script:**
  - `select` elige una opción de una lista. Así Insights muestra «Mes anterior» y no el mes en curso, que estaba vacío.
  - `fill` llena campos.
  - `crop` recorta la imagen a un selector.
  - Los marcadores numerados se ubican en el primer lugar libre (izquierda, arriba, derecha, abajo) y no tapan texto, controles ni otros marcadores.
  - Antes de capturar se quita el foco, para que no salga el anillo de foco.
- **Notas ajustadas a la pantalla real:** `create-order` (el total y «Confirmar pedido» aparecen al agregar platos), `kitchen-view` (qué muestra cada tarjeta) y `purchases` («Último precio» aparece al elegir el insumo).
- **Error de producto corregido:** un cliente que llegó por WhatsApp mostraba un identificador interno como teléfono. Ahora `formatPhone` muestra «Vía WhatsApp» cuando el valor tiene letras.
- **Peso:** 17 PNG, 5,3 MB en total; la más pesada es `login.png` (1,27 MB). No hay compresor instalado (`pngquant`/`oxipng`). Las imágenes cargan con `loading="lazy"`, solo al abrir cada artículo.
- **Dato de prueba raro (sin cambiar):** en la receta de la Hamburguesa Clásica, la Carne de res figura con 150 en una unidad base de kg; parece que quisieron decir gramos.

### Pendiente
1. Correr `copilot-eval` con las 10 preguntas nuevas.
2. Posible error de producto (no corregido): si un plato vuelve de **Listo** a un estado anterior y luego vuelve a **Listo**, su stock no se descuenta de nuevo.
