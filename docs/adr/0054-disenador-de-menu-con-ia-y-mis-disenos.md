# ADR 0054: Diseñador de menú con IA, editor visual y «Mis diseños»

## Estado
**Aprobado e implementado (2026-10-11).**

**Pedido:** en la pestaña **Diseño** del Menú público, dos formas de diseñar:
1. el **editor visual** que ya existe (ADR 0053);
2. un **diseñador con IA**: el dueño escribe, por ejemplo, «diseña una carta elegante con fondo negro y detalles dorados»; la IA propone **una o dos** opciones con **vista previa funcional**; el dueño elige una y pide cambios («haz el fondo un poco más claro»), y la IA **modifica ese diseño**.

Cada diseño queda en un **historial del negocio** («Mis diseños»), para recuperarlo, compararlo y publicarlo cuando el dueño quiera. Probar con IA **no puede cambiar** el menú público ni los pedidos.

---

## 1. Auditoría
| Hoy | Consecuencia |
|---|---|
| **Una sola arquitectura de IA (ADR 0014 y 0018):**<br>• toda llamada va a **Anthropic** desde una Edge Function, con el secreto `DK_ANTHROPIC_API_KEY`;<br>• el **modelo** sale del catálogo (`dk_features.model_key` → `dk_ai_models`), no del código;<br>• el permiso, el plan, el intervalo y la cuota diaria se controlan con `dk_ai_run_reserve`, y cada ejecución se registra con `dk_ai_run_finish` (tokens, latencia y error);<br>• la plataforma activa o desactiva cada función en **IA y voz**, y la organización y la cuenta, en sus paneles | **No hay que elegir proveedor:** se reutiliza Anthropic con el mismo secreto, cuotas y registro. Basta con una **función nueva del catálogo** (`menu_designer`) que la plataforma pueda prender, apagar o cambiar de modelo sin tocar código |
| **Las funciones de IA siguen el mismo patrón:**<br>• `dk-invoice-import` (ADR 0049) llama con el **JWT del usuario**, así que RLS y permisos aplican;<br>• la respuesta llega por una **herramienta con esquema**, con `tool_choice: auto`: Sonnet 5.5 rechaza la herramienta forzada (ADR 0049 §5);<br>• el texto del usuario es **dato y no instrucciones**, y la IA nunca escribe sola en la base de datos | El diseñador copia ese patrón: el modelo **solo propone** un diseño en JSON, y el servidor lo **valida** antes de guardarlo |
| **El diseño ya es configuración tipada (ADR 0053):**<br>• `ThemeDesign`: plantilla y ajustes en una lista cerrada;<br>• `dk_public_menu_theme_problem` lo valida en el servidor: colores en hexadecimal, fuentes de la lista, imágenes solo de la cuenta y nada de CSS ni URLs;<br>• `resolveTheme` lo dibuja con `PublicMenuView` | La IA **no inventa un formato**: genera un `ThemeDesign` dentro de las **6 plantillas y opciones que ya existen**. Así, lo que propone se puede abrir y ajustar en el editor visual, y se dibuja con el mismo componente |
| **Estados del diseño (ADR 0053):**<br>• **publicado** (`web_theme`), lo único que ve el cliente;<br>• **borrador** (`web_theme_draft`), lo que edita el editor;<br>• **anterior** (`web_theme_previous`).<br>No hay **historial** de varios diseños | Hace falta una **tabla de diseños guardados** que no sea ni el borrador ni lo publicado |
| La **vista previa** (`PublicMenuView` en modo `preview`) no envía pedidos ni guarda el carrito. Las **miniaturas** son el menú real reducido | Las propuestas de la IA y las tarjetas de «Mis diseños» usan esa misma vista previa: **cero riesgo** para los pedidos |
| `ai_platform.sql` comprueba **10** funciones en el catálogo | Al agregar `menu_designer`, esa prueba se actualiza a 11 |

## 2. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Proveedor y modelo | **Anthropic**, por la arquitectura actual: sin proveedor nuevo ni otra clave.<br>• **Función del catálogo** `menu_designer` (categoría IA): permiso de uso `storefront.manage`, de gestión `ai.manage`, intervalo mínimo de 5 s y los mismos planes que `invoice_import`.<br>• **Modelo por defecto:** `claude-sonnet-5-5`, por su criterio visual; la plataforma lo puede cambiar.<br>• **Cuota:** comparte la cuota diaria de IA del plan |
| **D2** | Qué genera la IA | Solo un **`ThemeDesign`**: una de las 6 plantillas como base, más colores, fuentes, fondo, cabecera, tarjetas, navegación y botones de la lista cerrada. También un **nombre corto** («Noche dorada») y **una frase** que explica la propuesta.<br>**Nunca:**<br>• imágenes: la IA no sube fotos y conserva la portada y el fondo que ya tenga el diseño;<br>• CSS o URLs;<br>• precios, platos ni textos del menú |
| **D3** | Una o dos propuestas | Con una idea nueva, la IA devuelve **2 propuestas distintas** (por ejemplo, otra plantilla base o un acento distinto). Con un ajuste («más claro»), devuelve **1**: la **versión siguiente** del diseño elegido |
| **D4** | Pedir cambios | Se envía el diseño elegido (JSON) más la instrucción. La IA devuelve el diseño completo modificado, y el servidor conserva lo que no se pidió cambiar. Cada ajuste es una **versión nueva**, enlazada a su diseño padre, para poder **volver a una versión anterior** |
| **D5** | Seguridad | • **Instrucción como dato:** máximo 500 caracteres; el system prompt dice que la instrucción del dueño solo habla de apariencia y que nunca se siguen órdenes de otro tipo.<br>• **Salida acotada:** solo por la herramienta `proponer_disenos`, con esquema de enumeraciones (sin texto libre, salvo el nombre y la frase, con largo máximo).<br>• **Doble validación:** la función limpia todo lo desconocido y la base de datos vuelve a validar con `dk_public_menu_theme_problem`.<br>• **Contraste:** si un par queda bajo 4.5:1, se corrige solo, como el botón «Corregir», y la propuesta lo dice.<br>• **Datos mínimos:** a la IA solo le llegan el nombre del negocio, el tipo de cocina, la frase y los nombres de las categorías de hoy (para el ambiente). Nada de clientes, precios ni pedidos.<br>• **Control:** permiso, función activa y cuota con `dk_ai_run_reserve`; registro con `dk_ai_run_finish` |
| **D6** | Historial: «Mis diseños» | Tabla nueva **`dk_menu_designs`**, una fila por diseño. Columnas:<br>• `design jsonb`, validado por la base de datos;<br>• `name`;<br>• `source`: `ai`, `editor`, `published` o `draft_backup`;<br>• `prompt` (la instrucción que lo creó);<br>• `parent_id` (la versión anterior);<br>• `ai_run_id`;<br>• `favorite`;<br>• `created_by` y `created_at`;<br>• `last_published_at`.<br>RLS por cuenta; ver y editar exige `storefront.manage`. Tope de **200** por cuenta: al llenarse, se borran solos los más viejos que no son favoritos ni están publicados |
| **D7** | Separación borrador / vista previa / publicado | Cuatro estados, y la IA **solo escribe en el historial**:<br>• **Propuesta / historial** (`dk_menu_designs`): nunca se ve en público;<br>• **Vista previa:** se dibuja en el navegador; nada se envía;<br>• **Borrador** (`web_theme_draft`): solo cambia cuando el dueño toca **Usar en el editor** o edita;<br>• **Publicado** (`web_theme`): solo cambia con **Publicar**.<br>Antes de reemplazar un borrador con cambios sin publicar, ese borrador se **guarda en «Mis diseños»** (`draft_backup`), así nunca se pierde trabajo. Cada publicación queda en el historial (`published`). Los pedidos y el menú (`dk_public_menu`, `dk_public_place_order`) **no cambian** |
| **D8** | Publicar desde una tarjeta | `dk_menu_design_publish(id)`, en **una transacción**: respalda el borrador si tiene cambios, copia el diseño al borrador y publica con la lógica de ADR 0053, de modo que el diseño actual pasa a «anterior». Siempre pide confirmación |
| **D9** | Interfaz | La pestaña **Diseño** pasa a tener tres vistas, con la vista previa siempre a la derecha:<br>**Diseñador con IA**<br>• cuadro de texto con ideas listas para tocar («Elegante, fondo negro y dorado», «Moderno, minimalista, crema y verde oliva», «Fresco y colorido para jugos»…);<br>• **2 tarjetas de propuesta** con su vista previa real;<br>• al elegir una: vista previa grande, el campo **«Pídele un cambio»** con atajos («Más claro», «Más contraste», «Letra más grande», «Sin fotos») y la línea de versiones v1 → v2 → v3;<br>• acciones: **Usar en el editor**, **Publicar** y **Comparar**.<br>**Editor visual:** el de ADR 0053, más **Guardar en Mis diseños**.<br>**Mis diseños**<br>• tarjetas con miniatura, nombre, origen (IA, Editor o Publicado), fecha y la instrucción;<br>• filtros: Todos, Favoritos e IA;<br>• por tarjeta: **Ver**, **Comparar** (elige 2 y los ves lado a lado, en celular), **Usar en el editor**, **Publicar**, **Renombrar**, **Favorito** y **Eliminar**;<br>• marca **Publicado** en el diseño que está en línea.<br>Mientras la IA trabaja, se ven tarjetas «pensando», un mensaje claro si se acaba la cuota del día y un botón para reintentar |
| **D10** | Si la IA no está disponible | El diseñador se oculta, igual que las demás funciones de IA, si la plataforma, el plan o la organización la tienen apagada, o si el usuario no tiene permiso. Si no hay clave, muestra «La IA no está configurada». El editor visual y «Mis diseños» funcionan siempre |
| **D11** | Ayuda | Se amplía el artículo `public-menu`, con las notas de versión y `dk-copilot` actualizado. La función aparece sola en **IA y voz** de la plataforma y de la organización, porque sale del catálogo. El manual no se toca |

## 3. Fases
| Fase | Qué |
|---|---|
| 1 · Base | Migración `dk_menu_designer`:<br>• función `menu_designer` en el catálogo y en los planes;<br>• tabla `dk_menu_designs` con RLS, validación y tope;<br>• RPC `dk_menu_design_save` (desde el editor), `_list`, `_rename`, `_favorite`, `_delete`, `_use` (al borrador, con respaldo), `_publish` (con respaldo y publicación);<br>• registro de cada publicación de ADR 0053 en el historial;<br>• `dk_menu_design_ai_context()`: los datos mínimos del negocio para la IA;<br>• `dk_menu_design_ai_save(...)`: inserta las propuestas validadas, para uso de la Edge Function con el JWT del usuario.<br>Pruebas SQL: separación (nada de esto cambia `web_theme` ni el menú público), permisos, aislamiento, validación, tope y respaldos; `ai_platform` pasa a 11 funciones |
| 2 · IA | Edge Function **`dk-menu-designer`**, con las acciones `generate` (instrucción → 2 propuestas) y `refine` (diseño + cambio → versión siguiente).<br>• `contract.ts`: la herramienta `proponer_disenos` con enumeraciones, `sanitizeDesign` (lista cerrada, conserva las imágenes del diseño base y respeta largos máximos) y `ensureContrast`;<br>• patrón de `dk-invoice-import`: JWT del usuario, `dk_ai_run_reserve` / `dk_ai_run_finish`, `tool_choice: auto`, reintento ante 429/529 y error real en el registro.<br>Pruebas Vitest del contrato |
| 3 · Interfaz | Pestaña **Diseño** con **Diseñador con IA**, **Editor visual** y **Mis diseños**; tarjetas de propuesta, versiones, comparar, publicar y respaldos. Se reutilizan `PublicMenuView`, `ThemeThumbnail`, `DesignPreview` y `DesignControls`, sin duplicar |
| 4 · Ayuda | Artículo, notas y `dk-copilot` |
| — | **Validación:**<br>• **SQL:** lo de la fase 1, más `public_menu` 50/50 y `public_menu_theme` 25/25 (el pedido y el menú no cambian).<br>• **Vitest:** contrato (limpieza, contraste, imágenes conservadas e instrucción maliciosa sin efecto); el diseñador muestra 2 propuestas, pide un cambio y crea la versión 2; «Mis diseños» compara y publica con confirmación; el borrador se respalda.<br>• **Navegador:** flujo completo con la IA simulada.<br>• **Con tu sesión:** una generación real, porque necesita tu inicio de sesión.<br>• **Además:** `tsc`, `oxlint`, builds y despliegue de la función |

## 4. Riesgos
| Riesgo | Mitigación |
|---|---|
| La IA propone algo ilegible o feo | Solo puede usar plantillas y opciones probadas; el contraste se corrige solo; siempre hay 2 opciones y se pueden pedir cambios o seguir en el editor visual |
| La experimentación cambia lo que ven los clientes | La IA solo escribe en el historial. El borrador cambia solo con **Usar en el editor**, y lo publicado solo con **Publicar**, con confirmación. Las pruebas SQL lo verifican |
| Se pierde un borrador sin publicar | Respaldo automático en «Mis diseños» antes de reemplazarlo |
| Inyección por la instrucción («ignora lo anterior y…») | La instrucción es dato; la salida solo sale por un esquema de enumeraciones; la base de datos valida; la IA no tiene herramientas que lean ni escriban datos |
| Costo | Cuota diaria del plan e intervalo mínimo; la plataforma puede cambiar el modelo o apagar la función |
| El historial crece sin control | Tope de 200 por cuenta, con limpieza de lo más viejo que no sea favorito ni esté publicado |

## 5. Resultados (2026-10-11)

### Qué se hizo
| Fase | Entregado |
|---|---|
| 1 · Base | Migración `20261011170000_dk_menu_designer.sql` (aplicada):<br>• función `menu_designer` en el catálogo (Sonnet 5.5, `storefront.manage`, intervalo 5 s, mismos planes que `invoice_import`);<br>• tabla `dk_menu_designs` con RLS de solo lectura, validación por `CHECK` con `dk_public_menu_theme_problem`, auditoría y tope de 200;<br>• `dk_menu_design_list`, `_save` (solo `ai`/`editor`), `_update`, `_delete`, `_use` y `_publish` (ambas con respaldo del borrador) y `_ai_context` (nombre, cocina, frase, categorías y diseño actual; nada de precios ni clientes);<br>• disparador que registra cada publicación (editor, tarjeta o «volver al anterior») sin duplicar |
| 2 · IA | Edge Function `dk-menu-designer` (desplegada): acciones `generate` (2 propuestas) y `refine` (versión siguiente, enlazada a su padre). Mismo patrón que `dk-invoice-import`: JWT del usuario, `dk_ai_run_reserve` / `dk_ai_run_finish`, `tool_choice: auto`, reintento ante 429/529, error real en el registro. `contract.ts`: herramienta `proponer_disenos` con enumeraciones, `sanitizeDesign` (lista cerrada, conserva portada y fondo del negocio, la IA nunca pone imágenes), `ensureContrast` y la instrucción delimitada como dato |
| 3 · Interfaz | Pestaña **Diseño** con tres vistas, guardadas en la URL (`?view=ai` o `library`):<br>• **Diseñador con IA:** instrucción con ideas, 2 tarjetas con vista previa real, «Pídele un cambio» con atajos y versiones v1 → v2, **Usar en el editor** y **Publicar** con confirmación;<br>• **Editor visual:** el de ADR 0053, más **Guardar en Mis diseños**;<br>• **Mis diseños:** tarjetas con origen, marcas «En línea» y «En el editor», favoritos, filtros, comparar dos lado a lado, renombrar y eliminar.<br>Antes de usar o publicar, se guardan las ediciones pendientes. Si la función no se puede usar, la vista con IA no aparece |
| 4 · Ayuda | Artículo `public-menu` con «Diseñador con IA» y «Mis diseños», notas de versión y `dk-copilot` desplegado. Manual sin tocar |

### Pruebas
- **SQL:** `menu_designer` 35/35:
  - catálogo y permiso;
  - el contexto de IA sin precios;
  - las propuestas solo van al historial;
  - el cliente no ve nada;
  - validación (CSS, imagen ajena, origen manual, instrucción limitada);
  - versiones;
  - usar con respaldo y sin duplicar;
  - publicar una tarjeta, desde el editor y volver al anterior, con su registro;
  - renombrar, favorito, eliminar y tope de 200;
  - aislamiento entre cuentas (diseños y ejecuciones de IA);
  - permisos (cocina, anónimo y tabla sin escritura directa).

  Además: `public_menu` 50/50, `public_menu_theme` 25/25, `ai_platform` 45/45 (11 funciones) y `permission_catalog` 24/24.
- **Vitest:** 779/779 (119 archivos). Nuevas:
  - `designerContract.test.ts` (7): mismas listas y colores que la app, limpieza, imágenes conservadas, contraste, límites, instrucción como dato y resultado válido para el editor;
  - `DesignTab.test.tsx` (+7): la vista con IA se oculta sin la función, 2 propuestas sin tocar el borrador, cambio → v2, publicar con confirmación, error de cuota visible, «Mis diseños» con comparar y usar, y guardar desde el editor.
- **Navegador (función de IA simulada):** generar → 2 propuestas → cambio v2 → «Mis diseños» en escritorio y celular, sin desbordes. Capturas en `docs/qa/disenador-ia/`.
- **Además:** `tsc`, typecheck de Deno, `oxlint` (13, los de siempre), builds. La función desplegada responde 401 sin sesión.

### Pendiente con sesión real
Una generación real con la IA (necesita el inicio de sesión del dueño). Revisar en **IA y voz** de la plataforma que `menu_designer` aparezca activa con su modelo y su uso.
