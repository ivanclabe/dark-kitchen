# ADR 0053: Menú Público premium — plantillas, editor de apariencia y diseño por negocio

## Estado
**Aprobado e implementado (2026-10-11).**

**Pedido:** convertir el Menú Público en una experiencia de marca premium y personalizable:
- **6 plantillas** (elegante, moderna, artesanal, dark premium, fresca y carta tradicional), **realmente distintas**;
- un **editor de apariencia** (colores, tipografía, fondos y cabeceras) con **vista previa inmediata**;
- elegir cómo se ven las tarjetas, cómo se navega y cómo se muestran las imágenes y las descripciones;
- **diseño guardado por negocio** y **publicación controlada**;
- separar la presentación del contenido (precios, disponibilidad e ingredientes), sin duplicar componentes y sin tocar pedidos, cocina ni el planificador.

---

## 1. Auditoría
| Hoy (ADR 0052) | Consecuencia |
|---|---|
| El **contenido** sale de `dk_public_menu` (planificador de hoy, precios, disponibilidad y reglas); el **pedido**, de `dk_public_place_order`. La lógica pura está en `lib/cart.ts` | Ya está separado. **No se toca**: la apariencia solo cambia cómo se dibuja |
| La **presentación** está escrita a mano con clases de un único tema claro, repartida en `PublicMenuPage` (encabezado, categorías, `DishCard`, barra del carrito), `CartSheet` y `OrderTrackingPage` | No hay capa de tema. Hay que pasarla a **variables de diseño** y **variantes de diseño**, en **un solo árbol de componentes** |
| Las opciones de la web viven en `dk_storefronts` (`web_*`), y el personal las edita en `PublicMenuAdminPage` con `dk_public_menu_settings` / `_save` | El diseño se guarda en la **misma fila** de la vitrina: una por negocio |
| La página pública solo funciona **publicada**. No hay forma de ver el menú de hoy sin publicarlo | Para la vista previa hace falta una lectura **para el personal** que devuelva lo mismo sin publicar |
| La app ya carga **Google Fonts** (Inter) en `index.css`. Tailwind 4 | Se pueden cargar fuentes de una lista cerrada, a pedido |
| Las fotos de los platos están en el bucket público `dk-product-images`, que solo deja escribir en `kitchens/{cuenta}/products/` con `products.edit`. El navegador las reduce (`prepareImage`) | La portada y el fondo pueden vivir en el **mismo bucket**, carpeta `branding/`, con `storefront.manage`. Se reutiliza `prepareImage` |
| `qrcode-generator`, `whatsappLink` y `publicMenuUrl` ya existen | Se reutilizan; el QR puede tomar el color de la marca |

## 2. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Dónde se guarda el diseño | Dos columnas nuevas en `dk_storefronts`:<br>• `web_theme_draft`: lo que se edita;<br>• `web_theme`: lo **publicado**, lo único que ve el cliente.<br>Más `web_theme_published_at` y `web_theme_previous` (para **volver al anterior**). Son **solo presentación**: plantilla y ajustes. Precios, disponibilidad, platos e ingredientes siguen saliendo del planificador y del catálogo |
| **D2** | Publicación controlada | El editor guarda un **borrador** (automático, sin afectar la página) y ofrece **Publicar diseño**, **Descartar cambios** y **Volver al diseño anterior**. Un indicador dice si hay cambios sin publicar. La página pública nunca muestra un borrador |
| **D3** | Las 6 plantillas, **distintas en estructura y no solo en color** | Cada una define colores, fuentes, fondo, cabecera, navegación, forma de las tarjetas, imágenes y botones:<br>• **Elegante:** crema y dorado; serif fina (Cormorant Garamond); cabecera centrada; **lista** con línea de puntos hasta el precio; fotos pequeñas redondas; navegación con pestañas subrayadas;<br>• **Moderna:** blanco y negro; sans geométrica (Poppins); cabecera con **portada** a todo lo ancho; **cuadrícula de 2 columnas** con foto grande; chips;<br>• **Artesanal:** fondo de **papel kraft**; títulos a mano (Caveat) y texto serif (Lora); terracota; tarjetas con borde irregular y precio tipo sello;<br>• **Dark premium:** casi negro y dorado; serif display (DM Serif Display); **fotos a todo lo ancho con degradado** y el texto encima; navegación translúcida;<br>• **Fresca:** menta y coral; sans redondeada (Nunito); categorías en **carrusel horizontal** con fotos grandes; botones píldora;<br>• **Carta tradicional:** pergamino con **marco y ornamentos**; títulos centrados en versalitas (Playfair Display); **sin fotos**, platos numerados y precio a la derecha, como una carta impresa |
| **D4** | El editor de apariencia | Por secciones, cada una con su efecto en vivo:<br>**1. Plantilla:** las 6, con miniatura real;<br>**2. Colores:** principal, fondo, tarjeta, texto y precio, con paletas sugeridas y selector libre; aviso si el **contraste** no se lee bien;<br>**3. Tipografía:** títulos y texto, de una lista curada de 10 fuentes; tamaño S / M / L;<br>**4. Fondo:** color, degradado, textura (papel, puntos, líneas) o **imagen**;<br>**5. Cabecera:** compacta, centrada, con **portada** o con el logo grande; mostrar u ocultar frase y horario;<br>**6. Platos:** tarjetas (lista, cuadrícula, foto grande, compacta o carrusel); imágenes (mostrar u ocultar; cuadrada, redondeada o circular; a la izquierda, a la derecha o arriba); descripciones (completa, 2 líneas u oculta);<br>**7. Navegación:** chips, pestañas, menú desplegable o sin barra;<br>**8. Botones:** redondeados, píldora o rectos.<br>«Restablecer a la plantilla» deshace los ajustes |
| **D5** | Vista previa inmediata | A un lado del editor, el **mismo componente** de la página pública con el borrador y el **menú real de hoy** (también sin publicar), en marco de **celular o escritorio**. El carrito se puede probar, pero «Hacer pedido» dice «Vista previa». Si hoy no hay platos, **platos de ejemplo** para ver el diseño. Cada cambio se ve al instante, sin guardar |
| **D6** | Sin duplicar componentes | Un tema resuelto = plantilla + ajustes → **variables CSS** (colores, fuentes, radios) y **variantes** (cabecera, tarjeta, navegación, imagen). `PublicMenuView` (encabezado, navegación, `DishCard` con sus variantes, barra del carrito), `CartSheet` y `OrderTrackingPage` los consumen. **Un solo árbol** para la página, la vista previa y las miniaturas. La lógica de carrito, pedido y seguimiento no cambia |
| **D7** | Imágenes de marca | Portada y fondo en `dk-product-images/kitchens/{cuenta}/branding/`, con `storefront.manage` (política de almacenamiento nueva, solo esa carpeta). Se reducen en el navegador como las fotos de platos. Hasta 2 activas |
| **D8** | Fuentes | Lista cerrada de Google Fonts: Inter, Poppins, Nunito, Montserrat, Lora, Playfair Display, Cormorant Garamond, DM Serif Display, Fraunces y Caveat. La página carga **solo las 2 elegidas**, con `display=swap` |
| **D9** | Seguridad del diseño | El servidor **valida** el diseño: solo claves conocidas, colores en hexadecimal, fuentes y variantes de la lista, e imágenes solo de la carpeta de la cuenta. **Nada de CSS ni URLs libres.** La función pública devuelve solo el diseño publicado |
| **D10** | Panel del propietario | **Menú público** pasa a tener pestañas: **Resumen** (lo de hoy: publicar, enlace, QR, opciones de pedido) y **Diseño** (editor y vista previa). El QR toma el color principal |
| **D11** | Ayuda | Artículo `public-menu` ampliado (plantillas, editor, publicar diseño) y notas de versión. El manual no se toca |

## 3. Fases
| Fase | Qué |
|---|---|
| 1 · Base | Migración `dk_public_menu_theme`:<br>• columnas del diseño;<br>• `dk_public_menu_theme_valid(jsonb)`;<br>• `dk_public_menu_theme_save_draft`, `_publish`, `_discard` y `_revert`;<br>• `dk_public_menu_preview()` para el personal (el menú de hoy sin publicar, con el borrador);<br>• `dk_public_menu` devuelve `theme` (el publicado) y `dk_public_order_status` también;<br>• política de almacenamiento para `branding/`.<br>Pruebas SQL |
| 2 · Motor de temas | `lib/themes.ts`: las 6 plantillas, `resolveTheme(plantilla, ajustes)`, variables CSS, contraste y fuentes. `PublicMenuView` con las variantes de cabecera, navegación, tarjeta e imagen; `CartSheet` y el seguimiento con el tema. **La página pública sin diseño propio se ve como hoy** (la plantilla por defecto es la actual, «Moderna clara») |
| 3 · Editor | Pestaña **Diseño**: controles, vista previa en vivo (celular o escritorio), guardado automático del borrador, publicar, descartar y volver al anterior, subida de portada y fondo |
| 4 · Ayuda | Artículo, notas y `dk-copilot` |
| — | **Validación:**<br>• **SQL:** diseño válido e inválido (color, fuente, clave o imagen ajena); el borrador no se ve en público; publicar, descartar y volver; permisos; aislamiento; el pedido, sin cambios (`public_menu` 50/50).<br>• **Vitest:** cada plantilla resuelve; los ajustes ganan; contraste; el editor cambia la vista previa al instante; la página pública aplica el diseño publicado.<br>• **Navegador:** las 6 plantillas en celular y escritorio, con capturas, y un pedido de punta a punta con la plantilla más distinta (carta tradicional).<br>• **Además:** `tsc`, `oxlint` y builds |

## 4. Riesgos
| Riesgo | Mitigación |
|---|---|
| Un diseño ilegible (poco contraste) | Aviso en el editor con el par de colores y botón «Corregir». Las plantillas cumplen contraste AA |
| Romper pedidos o cocina | Solo cambia la capa visual. Las funciones del pedido no se tocan y sus 50 pruebas se vuelven a correr |
| Cambios que se publican sin querer | Borrador separado, «Publicar diseño» explícito, descartar y volver al anterior |
| Peso de la página | Solo 2 fuentes; imágenes reducidas; el código de la página sigue en su propio paquete |
| Inyección por el diseño | Validación con lista cerrada en el servidor; el navegador nunca recibe CSS libre |

## 5. Resultados (2026-10-11)

### Qué se hizo
| Fase | Entregado |
|---|---|
| 1 · Base | Migración `20261011160000_dk_public_menu_theme.sql` (aplicada): columnas `web_theme`, `web_theme_draft`, `web_theme_previous` y `web_theme_published_at` en `dk_storefronts`; validación `dk_public_menu_theme_problem` (lista cerrada, colores hex, fuentes de la lista, imágenes solo de `kitchens/{cuenta}/branding/`, máx. 4000 caracteres); `_save_draft`, `_publish`, `_discard` y `_revert`; un único armador `dk_public_menu_build` para la página (diseño publicado) y para `dk_public_menu_preview()` (borrador, solo personal); `theme` en `dk_public_menu`, `dk_public_menu_settings` y `dk_public_order_status`; políticas de almacenamiento para `branding/` con `storefront.manage` |
| 2 · Motor de temas | `lib/themes.ts` (6 plantillas, `resolveTheme`, `designFrom`, contraste WCAG, `fixContrast`, paletas, fuentes, variables CSS `--pm-*`); `ThemeRoot` (variables, fondo, fuentes y ancho propio: la variante `pm-wide:` mira el ancho de la página o del marco, no de la ventana); `MenuView.tsx` → `PublicMenuView`, **un solo árbol** para la página, la vista previa y las miniaturas: cabeceras compacta/centrada/portada/logo, navegación chips/pestañas/desplegable/sin barra, tarjetas lista/cuadrícula/foto grande/compacta/carrusel/carta, estilos plana/sombra/borde/artesanal/translúcida, foto (forma y posición) y descripción. `CartSheet` y `OrderTrackingPage` con el tema. Sin diseño, la página se ve como antes |
| 3 · Editor | `Menú público` con pestañas **Resumen** (lo de ADR 0052 + tarjeta de diseño y QR del color de marca) y **Diseño** (`/public-menu/design`): galería con miniaturas reales del menú, editor por secciones, aviso de contraste con «Corregir», subida de portada y fondo (`prepareImage`), vista previa en celular (375 px) o escritorio (1024 px reducido), borrador automático, **Publicar diseño**, **Descartar cambios**, **Volver al anterior**, indicador de cambios sin publicar. En vista previa el carrito funciona pero no se envía ni se guarda nada |
| 4 · Ayuda | Artículo `public-menu` con la sección «El diseño de tu página», notas de versión y `dk-copilot` desplegado con la base de conocimiento nueva. Manual sin tocar |

### Pruebas
- **SQL:** `public_menu_theme` 25/25 (validación, borrador invisible en público, publicar/descartar/volver, seguimiento con diseño, vista previa sin publicar, aislamiento, permisos) y `public_menu` 50/50 (el pedido, sin cambios).
- **Vitest:** 765/765 (118 archivos). Nuevas: `themes.test.ts` (10), `MenuView.test.tsx` (10: las 6 plantillas muestran el mismo contenido, fotos/descripciones, navegación, límites del carrito, vista previa sin envío), `DesignTab.test.tsx` (5: plantillas, cambio inmediato en la vista previa, borrador automático, contraste, publicar después de guardar) y 2 en `PublicMenuPage.test.tsx` (diseño publicado y aspecto por defecto).
- **Navegador (RPC simulados, datos de ejemplo):** las 6 plantillas y la básica en celular y escritorio sin desbordes; pedido de punta a punta con Carta tradicional (carrito, datos, envío y seguimiento); editor con cambio de plantilla, carrusel y color, y borrador guardado `{template: dark, colors: {primary}, cards: {layout: carousel}}`. Capturas en `docs/qa/menu-publico-plantillas/`.
- **Además:** `tsc`, `oxlint` (13 avisos, los de siempre), `npm run build` y `npm run build:admin`.

### Pendiente con sesión real
Publicar un diseño en la cuenta real y abrir el enlace en un celular; subir una portada real (la política de almacenamiento solo se probó por SQL).
