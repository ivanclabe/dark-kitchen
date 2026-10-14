# ADR 0058: Menú público — plantillas modernas e imágenes de marca

## Estado
**Aceptada e implementada (2026-10-13).**

**Pedido:**
- los menús públicos se ven anticuados y feos;
- hay que mejorar las plantillas predeterminadas para que se vean modernas y atractivas;
- el negocio debe poder poner una imagen de fondo y de cabecera, «o como guste».

---

## 1. Auditoría
Las capturas de hoy están en `docs/qa/menu-publico-v2/antes-*.png`: las 6 plantillas y el aspecto sin diseño, en celular, con un menú de prueba de 9 platos.

| Hoy | Consecuencia |
|---|---|
| **Sin foto, un hueco gris.** Cada plato sin foto muestra un recuadro gris con un tenedor. En los datos reales, **13 de 15 platos no tienen foto** | Es lo que más se ve en pantalla, y hace que todas las plantillas parezcan inacabadas. **Una plantilla moderna tiene que verse bien sin fotos** |
| **El «logo» es el ícono ilustrado de la cuenta** (por ejemplo, un camarón). No se puede subir un logo real | La marca no se reconoce |
| **Portada e imagen de fondo ya existen, pero escondidas:**<br>• la portada solo aparece con la cabecera «Con portada»;<br>• el fondo con foto solo aparece con el tipo de fondo «Foto»;<br>• **ninguna cuenta usa imágenes** (de 1 diseño publicado, 1 borrador y 4 guardados) | El problema es de **descubrimiento y de flexibilidad**, no de almacenamiento. La carpeta `kitchens/{cuenta}/branding/`, la reducción de la foto en el navegador y la validación ya existen (ADR 0053) |
| **Cabecera:** la portada sin foto es un bloque plano (negro en Moderna, dorado en Dark). Las cabeceras Centrada y Logo grande no admiten imagen | Sin foto no hay «primera impresión» |
| **Detalles anticuados:**<br>• botones «Agregar» grandes y rectangulares;<br>• poca jerarquía tipográfica;<br>• adornos de carta impresa (❦, «— Menú del día —», doble marco);<br>• el carrusel de Fresca corta el texto;<br>• no hay una franja con lo que el cliente necesita saber (abierto, domicilio, mínimo) | El aire «antiguo» que se percibe |
| **El diseño es una lista cerrada:**<br>• la base valida cada opción (`dk_public_menu_theme_problem`);<br>• el diseñador con IA (ADR 0054) usa la misma lista;<br>• hay 10 fuentes | Cada opción nueva se agrega en los tres lugares: base, app y diseñador. Los diseños guardados deben seguir siendo válidos |
| **Datos:** 1 diseño publicado (Carta tradicional), 1 borrador y 4 en «Mis diseños» | **No hace falta migrar datos.** El menú publicado tomará el aspecto renovado de su plantilla (es lo pedido) y conserva lo que su dueño cambió (colores y fuentes) |

## 2. Decisiones
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | **Un lienzo común renovado.** Aplica a las 6 plantillas, dentro de `MenuView` | • **Sin foto no hay hueco:** el plato se dibuja solo con texto. Nombre, descripción, precio y botón quedan bien compuestos; la foto aparece cuando existe.<br>• **Botón «+» redondo** para agregar, con un contador compacto (–  2  +). La accesibilidad no cambia («Agregar Clásica de la casa»).<br>• **Franja de datos** bajo la cabecera, en chips: abierto/cerrado y hasta qué hora, domicilio y su costo, para recoger, pedido mínimo. Salen de datos que el menú ya trae.<br>• **Jerarquía tipográfica clara:** el título de cada categoría con el número de platos; el precio destacado.<br>• Etiqueta **«Oferta»** cuando hay precio especial.<br>• La barra de categorías **sigue el scroll**: marca la categoría que se está viendo.<br>• El carrito es una **píldora flotante**.<br>• **En escritorio**, los platos van a dos columnas.<br>• Sin adornos de carta impresa en el lienzo común; la Carta clásica conserva un toque propio |
| **D2** | **Las 6 plantillas, renovadas.** Mismos identificadores, para que los diseños guardados y la IA sigan funcionando | • **Moderna:** blanca, tipografía geométrica, portada de borde a borde y platos en tarjetas limpias.<br>• **Elegante:** crema y oro, serifa fina y lista con precios alineados.<br>• **Artesanal:** cálida, títulos con carácter, sin el borde irregular.<br>• **Noche** (antes «Dark premium»): negro y dorado, fotos grandes.<br>• **Fresca:** clara y colorida, lista en cuadrícula (el carrusel queda como opción).<br>• **Clásica** (antes «Carta tradicional»): carta de restaurante con serifa y numeración, actualizada.<br>Se agregan **3 fuentes modernas** a la lista: Plus Jakarta Sans, Outfit y Bricolage Grotesque. El aspecto **sin diseño publicado** pasa a ser la nueva Moderna |
| **D3** | **Imágenes de marca, a la vista y donde el negocio quiera** | En el editor, una sección nueva y **primera**, **«Imágenes de tu marca»**, con tres espacios:<br>• **Logo** (`header.logo`): reemplaza al ícono en todas las cabeceras.<br>• **Imagen de cabecera** (`header.cover`): sirve en **todas** las cabeceras, no solo en «Con portada». En Compacta y Centrada es un banner detrás del nombre. Se elige su encuadre (`header.coverPosition`: arriba, centro o abajo).<br>• **Imagen de fondo** (`background.image`): al subirla, el fondo pasa a «Foto» solo. Tiene una **intensidad del velo** (`background.overlay`: suave, media o fuerte) para que el texto siempre se lea.<br>Todo vive en la carpeta de marca de la cuenta y se valida igual que hoy: nada externo, solo imágenes de esa cuenta. Al cambiar de plantilla, las imágenes se conservan (como hoy la portada y el fondo) |
| **D4** | **Compatibilidad** | • Las claves nuevas son opcionales: un diseño viejo sigue siendo válido y se ve con el lienzo nuevo.<br>• Se actualiza la validación en la base (`dk_public_menu_theme_problem`), el resolutor de la app y el contrato del diseñador con IA. La IA conoce las opciones nuevas y **nunca inventa imágenes**: solo conserva las que la cuenta subió.<br>• Los precios, los platos y los pedidos no cambian: es solo presentación (ADR 0053) |
| **D5** | **Legibilidad y rendimiento** | • Sobre una imagen, el texto lleva siempre un velo o un degradado.<br>• El revisor de contraste sigue funcionando.<br>• Las imágenes cargan diferidas y ya se reducen al subirlas (1600 px).<br>• Solo se cargan las fuentes que usa el diseño |

## 3. Fases
| Fase | Qué |
|---|---|
| 1 · Base | Migración `dk_public_menu_theme_v2`: la validación con `header.logo`, `header.coverPosition`, `background.overlay` y las 3 fuentes. Pruebas SQL (`public_menu_theme` y `menu_designer`) |
| 2 · Lienzo y plantillas | `MenuView` renovado (D1) y las 6 plantillas (D2), `themes.ts` y las miniaturas de la galería |
| 3 · Editor | La sección «Imágenes de tu marca» (logo, cabecera con encuadre y fondo con velo); el diseñador con IA con las opciones nuevas, su contrato y el despliegue de `dk-menu-designer` |
| 4 · Prueba | Capturas **antes y después** de las 6 plantillas en celular y escritorio, sin fotos y con logo, cabecera y fondo propios. Pruebas Vitest de la tarjeta sin foto, del botón «+», de la franja de datos y de las imágenes. Suites SQL, `tsc`, `oxlint` y builds |
| 5 · Ayuda | Artículo del diseño del menú público y notas de versión. No se toca el manual |

## 4. Riesgos
| Riesgo | Mitigación |
|---|---|
| El menú publicado cambia de aspecto | Es lo pedido. Conserva lo que su dueño ajustó. Se muestra en el informe con captura antes y después |
| Texto ilegible sobre una foto | Velo y degradado siempre presentes, con intensidad elegible y el revisor de contraste |
| Diseños guardados con claves viejas | Todas siguen siendo válidas; las nuevas son opcionales |
| Peso de la página | Imágenes reducidas y diferidas; solo las fuentes usadas |

## 5. Resultados (2026-10-13)

**Base de datos.** La migración `20261013100000_dk_public_menu_theme_v2.sql` está aplicada. La validación acepta `header.logo` (solo de la carpeta de marca de la cuenta), `header.coverPosition`, `background.overlay` y las fuentes Plus Jakarta Sans, Outfit y Bricolage Grotesque. Todo diseño anterior sigue siendo válido.

**App:**
- **`themes.ts`:** las 6 plantillas renovadas, con Noche y Clásica renombradas y los mismos identificadores. El aspecto sin diseño es la nueva Moderna. El velo del fondo tiene tres intensidades, y al cambiar de plantilla se conservan el logo, la cabecera con su encuadre y el fondo con foto.
- **`MenuView`:**
  - sin recuadros vacíos cuando un plato no tiene foto;
  - botón «+» redondo con «− n +», y franja de datos (abierto, domicilio, recoger, mínimo);
  - etiqueta «Oferta» y número de platos por categoría;
  - barra de categorías que sigue el scroll y carrito en píldora flotante;
  - dos columnas en escritorio;
  - cabeceras con logo e imagen en los cuatro estilos.
- **Editor:** sección «Imágenes de tu marca» al inicio: logo (reducido a 600 px y sobre blanco), imagen de cabecera con encuadre e imagen de fondo con velo. Al subir el fondo, el tipo pasa a «Foto» solo.
- **Diseñador con IA:** el contrato tiene los colores y fuentes nuevos y las opciones de encuadre y velo. Conserva las imágenes de la cuenta y nunca las propone. `dk-menu-designer` está desplegado.

**Prueba**, en el navegador sobre un Supabase local con un menú de 9 platos sin fotos. Capturas en `docs/qa/menu-publico-v2/`:
- `comparacion-antes.png` y `comparacion-despues.png`: las 6 plantillas en celular;
- `despues-*-celular.png` y `despues-*-escritorio.png`;
- `editor-imagenes-de-tu-marca.png`: logo, cabecera y fondo subidos desde el editor real, publicados y validados por la base;
- `imagenes-*.png`: el menú con esas imágenes en Moderna, Elegante, Noche, Fresca y Artesanal (con velo suave).

**Validación:**
- SQL contra producción: 1492/1492 (`public_menu_theme` 31/31).
- Vitest: 822/822 (`MenuView` 15, contrato del diseñador 8, temas 12).
- `tsc`, `oxlint` (13 avisos de base), las dos builds y la verificación de tipos de las funciones pasan.
- Ayuda: «Menú público y pedidos online» y notas de versión. `dk-copilot` desplegado.

**Nota:** el menú publicado en producción (plantilla Clásica) ya se ve con el diseño renovado y conserva lo que su dueño ajustó. No se capturó ese menú real; la comparación usa datos de prueba.
