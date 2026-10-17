# ADR 0068: Landing «La comanda que viaja»

## Estado
**Implementada (2026-10-17).** Se pidió en la conversación (calidad visual premium con los skills impeccable y taste, ronda de los P0 y P1 de la crítica). Reemplaza la composición de la landing del ADR 0010; no cambia los precios (siguen viniendo de `dk_plans`), ni la sesión (ADR 0067), ni el registro.

## Contexto
La crítica de la landing (`.impeccable/critique/…__src-modules-landing.md`) dio 22/32:
- **P0:** entre 1024 y 1280 px el portátil del hero tapaba el texto.
- **P1:** la página no tenía una idea propia (un hero de categoría con mockups) y el hero estaba recargado («Ver cómo funciona» con un ícono de video que no existía).
- Además, la landing descargaba toda la app: unos 667 KB de JS comprimido antes de pintarse.

## Decisión
- **Dirección «split stage»** (taste, `draw.mjs`, semilla 1580842747), con la paleta y las fuentes de la marca:
  - En pantallas anchas, la mitad izquierda es un escenario fijo con **un pedido de ejemplo hecho con los componentes de la app** (su insignia de estado, sus palabras, sus botones).
  - La mitad derecha cuenta cómo viaja ese pedido en cinco pasos: llega, la cocina lo prepara, sale con el domiciliario, se descuenta y se costea, y Quanela sugiere qué hacer.
  - Al leer cada paso, el pedido cambia de estado. Su botón usa los verbos del tablero (Confirmar, Iniciar, Marcar listo, Despachar, Entregar) y lo avanza; es lo único con lo que el visitante juega.
  - En el celular el pedido va arriba, sin quedarse fijo, para no tapar el texto.
- **El nombre en grande** («quanela») cruza del escenario a la columna, con una tinta para cada fondo.
- **Barra flotante** (pedida con una referencia, aunque la regla de taste prohíbe la navegación flotante: manda el pedido):
  - va separada de los bordes, con esquinas redondeadas y borde fino;
  - lleva el logo, las secciones al centro y la sesión, con «Crear cuenta» o «Ir a mi cuenta» en el color de la acción;
  - la sección que se está leyendo va en ember, subrayada en el borde de la barra;
  - por debajo de 1280 px las secciones se abren en un panel con fondo oscurecido, sin repetir lo que la barra muestra.
- **El título de la página** (`h1`) es la frase «Del pedido a la caja, tu cocina en un solo lugar.»; el nombre en grande es imagen del nombre. Entre el botón y el nombre queda siempre un espacio libre.
- **Fondo blanco** (pedido después de la primera versión, que usaba el crema de la marca): blanco para la página y un solo tono de panel, piedra casi neutra (`#F3F2F0`).
- **El robot de Quanela** (ADR 0060):
  - vive en el escenario, asomado sobre el pedido, y cambia de expresión con cada estado: emocionado cuando llega, contento en cola, guiña mientras se prepara, enamorado cuando está listo, contento en ruta, emocionado al entregar y con la idea cuando sugiere;
  - aparece junto a las preguntas frecuentes, en el cierre y en el pie;
  - en el celular, donde el escenario no queda fijo, el paso de la IA lleva su propio robot.
  - los diez originales (`docs/brand/robot`) se volvieron a recortar de la hoja de la marca con el gorro completo y margen (los PNG sueltos lo tenían cortado arriba), sin las manchas de fondo que traía la hoja; `scripts/robot-icons.sh` los exporta con `-sharp_yuv`. Esto mejora al robot también en la app (ADR 0060);
  - en pantallas bajas (menos de 900 px de alto) el pedido y el robot no se agrandan, para que el estado más alto quepa entero.
- **Después, a todo lo ancho:**
  - la app por dentro, con pantallas reales tomadas de un negocio de ejemplo con datos ficticios (`public/brand/landing`) y el menú web;
  - el resto del día, con una prueba pequeña al lado de cada texto;
  - los planes como tres bloques que crecen con el plan, más la comparativa;
  - las preguntas como texto corrido;
  - un cierre con el primer paso del registro ya abierto: elegir el plan y la periodicidad lleva a `/registro` con esa elección, igual que los botones de los planes.
- **Nada inventado:** ni clientes, ni testimonios, ni cifras de uso. Los datos del pedido de ejemplo cuadran: 22.000 + 6.000 = 28.000; costo 9.800; margen 65 %.
- **Rendimiento:**
  - cada pantalla de la app se descarga al abrirla (`lazy` de React Router): el JS inicial de la landing baja de 667 KB a 234 KB comprimidos;
  - el logo pasa de un PNG de 123 KB a un WebP de 28 KB.
- **P0:** el hero anterior ponía texto y producto lado a lado desde 1280 px. La nueva composición no los superpone en ningún ancho.

## Verificación
- **taste:**
  - `lint.mjs`: sin fallos.
  - `inspect.mjs` en 1440, 768 y 390 px: sin fallos. Quedan cinco advertencias defendidas:
    - el crema es el fondo de la marca;
    - no hay un video honesto que mostrar;
    - el texto pequeño y el borde fino están dentro de los fragmentos de la app y de la tabla comparativa;
    - la tabla comparativa se desplaza de lado en el celular.
- **Navegador:** el pedido recorre los seis estados con su botón, en orden, y los pasos acompañan.
- **Vitest:** la barra de la landing en sus tres estados de sesión sigue pasando.
