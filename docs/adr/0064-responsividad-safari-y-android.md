# ADR 0064: Responsividad en Safari (iOS) y Android

## Estado
**Aceptada e implementada (2026-10-15).** Se pidió en la conversación: auditar toda la responsividad, corregir directamente, ejecutar pruebas automatizadas y entregar un informe.

## Cómo se auditó
1. **Inspección estática del código.** Patrones que fallan en Safari iOS o en Chrome Android: unidades `vh`, tamaño de letra de los campos, contenedores que atrapan `position: fixed`, acciones visibles solo con el puntero encima, tecla Enter con teclados predictivos o IME, anchos fijos, grillas y filas flex que no se encogen, y fechas.
2. **Recorrido automático en teléfono.** Lo hace `scripts/responsive-audit.ts`.
   - Corre en Chrome, el motor real de Android, con emulación de teléfono.
   - Cubre 60 pantallas en tres dispositivos: Android de 360 px, iPhone de 390 × 664 (con la barra de Safari visible) e iPhone SE de 320 px.
   - El detector (`scripts/responsive/detect.js`) busca tres problemas:
     - desborde horizontal de la página;
     - elementos que salen de la pantalla;
     - textos o controles que se pisan.
   - Para no dar falsos positivos, el detector:
     - descuenta lo recortado por contenedores y las listas con scroll propio;
     - con un diálogo o menú abierto, mira solo dentro de él;
     - ignora los adornos dentro de un campo y lo que está oculto o es decorativo.
   - Deja una captura con los problemas marcados en rojo.
3. **Revisión de cada hallazgo en su captura** antes de corregir. También se confirmó que, a 1366 px, el escritorio no cambió.

No hay WebKit de Playwright instalado y Safari no tiene activada la automatización remota. Por eso, las reglas propias de Safari se verificaron de dos formas: con inspección estática y con la prueba de contrato `scripts/responsive/responsiveContract.test.ts`.

## Hallazgos y correcciones

| # | Problema (dispositivo) | Causa | Corrección |
|---|---|---|---|
| R1 | **El menú de usuario, la campana y el selector de cuenta se abrían hacia arriba, fuera de la pantalla** (todos los celulares) | La barra superior móvil tenía `backdrop-blur`. Un filtro convierte al elemento en el contenedor de todo `position: fixed` interno, así que la hoja inferior se anclaba a la barra de 56 px | Barra sin filtro (fondo sólido): no aporta, porque no queda encima del contenido. Contrato: la barra móvil no puede tener filtros ni transformaciones |
| R2 | **El nombre de la cuenta quedaba tapado por «Solo tú» y el micrófono** (360–390 px) | El botón del selector medía lo que su texto y no se encogía, así que se derramaba sobre los vecinos | `max-w-full`: se trunca («Brasa…») |
| R3 | **A 320 px no cabían los siete botones de la barra** | Demasiados controles | «Quién está en línea» pasa al menú lateral en celulares (en escritorio sigue en la barra) |
| R4 | **El borde inferior quedaba bajo la barra del navegador** (Safari iOS, Chrome Android) | `h-screen`/`100vh` mide la pantalla con la barra oculta | `dvh` en el armazón de la app, las páginas de pantalla completa, los modales (92dvh), las hojas inferiores (85dvh) y Mensajes (26 archivos) |
| R5 | **iPhone hacía zoom al tocar cualquier campo** y dejaba la pantalla descuadrada | Los campos usan 14 px y Safari iOS amplía los menores de 16 px | Regla solo para iOS (`@supports (-webkit-touch-callout: none)`): campos, listas y áreas de texto a 16 px. Android y escritorio no cambian |
| R6 | **Campos de fecha y hora aplastados y centrados** (iOS) | Estilo nativo de Safari | Alto mínimo y texto a la izquierda, solo en iOS |
| R7 | **Despacho: «Listos para salir» cortaba el botón «Despachar»** (celulares) | Las dos columnas se repartían el alto con scroll interno | En celular cada columna crece con sus pedidos y la página hace scroll; desde md siguen lado a lado |
| R8 | **Menú público → Diseño: «Publicado» quedaba debajo de «Descartar cambios» y el título se aplastaba a 7 px** (iPhone) | Fila `flex-wrap` con un bloque `min-w-0 flex-1`, que se encoge a 0 en vez de pasar de renglón | Ancho mínimo (12rem) para que baje de renglón |
| R9 | El mismo patrón en Nómina (el nombre en «L.» y el rol tapado), Gastos, Pagos, Por pagar, registro e Integraciones → Mensajes | Igual que R8 | `min-w-[9rem] flex-1` en las siete filas |
| R10 | **Integraciones → Conexión se salía 5 px de la pantalla** (320 px) | Grilla de una columna sin `minmax(0,1fr)`: el contenido largo (URL, código) la ensanchaba | `grid-cols-[minmax(0,1fr)]` y corte de palabras largas en los pasos |
| R11 | **Personal → Semana: el botón de agregar turno no se veía en celular** | Solo aparecía con el puntero encima (`group-hover`) | Visible en pantallas táctiles (`hover:none`). Contrato: ninguna acción solo con hover |
| R12 | **El aviso flotante (toast) se salía en teléfonos angostos y quedaba bajo la barra de inicio del iPhone** | 320 px fijos abajo a la derecha | En celular a todo el ancho con márgenes y por encima de la zona segura; desde sm, como antes |
| R13 | **El globo ⓘ se salía de la pantalla cerca de un borde, y su área táctil medía 16 px** | Centrado sobre el ícono sin límites | Se desplaza para quedar dentro de la pantalla; área táctil de 36 px sin cambiar el aspecto |
| R14 | Las burbujas de «Oye Quanela» y del comando de voz de Cocina medían 288 px fijos | Ancho fijo | `max-w-[calc(100vw-1.5rem)]` |
| R15 | **Enter enviaba la palabra a medio escribir** (Gboard en Android, teclados japonés y chino en iOS): Copilot, Mensajes, buscadores, Combobox y la categoría nueva | No se miraba `isComposing` | Se ignora el Enter que confirma una composición |
| R16 | Los botones Google, Instagram y Teléfono tocaban el borde (320 px) | Tres botones en la fila | Menos relleno por debajo de 360 px y texto truncado |

## Resultados
- **Auditoría final:** 60 pantallas en Android de 360 px, iPhone de 390 px e iPhone SE de 320 px. 0 superposiciones, 0 elementos fuera de pantalla y 0 desbordes. Se repitió con el script del repositorio y terminó sin problemas (código 0).
- **Escritorio a 1366 px:** las pantallas tocadas quedan sin problemas e iguales a antes.
- **Pruebas:** contrato responsivo 6/6; Vitest 141 archivos y 892 pruebas.
- **Calidad:** `tsc` limpio, oxlint con los 13 avisos de siempre, y los builds de app y admin pasan.
- **Capturas** de antes y después en `docs/qa/responsive/`.

## Cómo reproducirlo
Contra el stack local, con un usuario de prueba ficticio:

```bash
QUANELA_AUDIT_URL=http://<código>.localhost:5180 QUANELA_AUDIT_ROOT=http://localhost:5180 \
QUANELA_AUDIT_ACCOUNT=<slug> QUANELA_AUDIT_EMAIL=<usuario de prueba> QUANELA_AUDIT_PASSWORD=<clave local> \
QUANELA_AUDIT_IDS="order=…,product=…,ingredient=…,purchase=…,customer=…,dish=<plato>" \
npm run audit:responsive -- --devices android,iphone,se
```

## Pendiente
- **Verificar en un iPhone real o en WebKit.** Hace falta instalar el WebKit de Playwright (requiere permiso de descarga) o activar en Safari «Permitir automatización remota».
- **A 320 px, la barra superior muestra solo el ícono de la cuenta.** El nombre se lee en el menú lateral.
- **En Abastecimiento móvil, el detalle aparece debajo de la lista**: hay que bajar para verlo. No es una superposición, pero conviene llevar el detalle a una vista propia en el celular.
