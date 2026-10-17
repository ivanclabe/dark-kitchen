# ADR 0065: Sistema de diseño de calidad premium

## Estado
**Fases 2, 3 y 4 implementadas (2026-10-15). Las fases 2 y 3 están aprobadas; la Fase 4 está pendiente de aprobación.** Se pidió en la conversación: subir la calidad visual y de experiencia de Quanela por fases, sin tocar lógica de negocio, consultas de Supabase, permisos ni migraciones, y detenerse al final de cada fase.

- **Fase 1:** auditoría (solo lectura). Aprobada.
- **Fase 2:** sistema de diseño. Aprobada.
- **Fase 3:** pulido por módulo, empezando por los P0 y P1 de la auditoría. Aprobada.
- **Fase 4:** movimiento.

## Decisiones del usuario
- **Botón primario:** naranja más oscuro (`#c2410c`) con texto blanco. El naranja de marca (`brasa-500`) con texto blanco daba 2,8:1.
- **Tarjeta de Cocina:** un plato por línea, solo en la vista Cocina (Fase 3).
- **Nombres:** Insights → «Análisis» y Consumer → «App de clientes» (Fase 3). SUPER_ADMIN no cambia.
- **Datos:** las cifras en 0, los datos falsos mientras carga y el stock bajo con mínimo 0 se corrigen en la Fase 3, en su módulo.

## Fase 2: qué cambió

### Tokens (`src/index.css`)
- **Tokens semánticos como alias** de las escalas que cada tema ya remapea, para que funcionen en los tres temas y en los bloques `.theme-light`:
  - superficies y texto: `canvas`, `surface`, `surface-raised`, `line`, `line-strong`, `text`, `text-secondary`, `text-muted`;
  - estados: `success`, `warning`, `danger`, `info`.
- **Nuevos tokens:**
  - `primary`, `primary-hover`, `primary-active`, `on-primary`: las superficies llenas de la marca.
  - `focus`: el anillo de foco. En los temas claros es más oscuro para llegar a 3:1.
  - `text-2xs` (11 px): reemplaza los `text-[10px]` y `text-[11px]` sueltos.
- **Temas claro y neutro:**
  - Los tonos `-400` de estado y los de marca se oscurecen para pasar AA sobre fondos claros.
  - Bordes de campo e interruptor apagado llegan a 3:1.
  - Se quitaron los valores hex duplicados de cada tema.
- **Base:**
  - selección de texto con la marca;
  - cursor de texto naranja;
  - sin el destello gris al tocar (Android);
  - `touch-action: manipulation` en los controles (sin la espera del doble toque);
  - movimiento reducido: también corta las animaciones que se repiten.
- **Primer pintado:** la fuente Inter se carga desde el HTML con `preconnect` (antes, `@import` bloqueaba el CSS). El fondo y el color de la barra del navegador ya salen con el tema elegido, sin destello blanco.

### Componentes (`src/shared/ui`)

| Componente | Cambio |
|---|---|
| Button | Primario con `primary`. En pantallas táctiles, alto de 40 a 44 px |
| Campos (`inputClass`, Combobox) | Borde visible, foco con `focus`, borde rojo cuando el campo es inválido |
| Chip, Switch, Tabs, RouteTabs | Estado activo con `primary`. El chip con nombre largo se trunca |
| Badge | Tonos de estado con los tokens semánticos; tamaño `sm` en 11 px |
| StatCard, KpiStrip | Prop `loading`: muestra un esqueleto en vez de un «0» o un «todo al día» que todavía no es verdad |
| DataTable | `layout="fixed"` con `width` por columna (para que `truncate` funcione); anillo de foco visible en las filas clicables |
| Combobox | Patrón ARIA completo: `listbox`, `option`, `aria-activedescendant`, `aria-controls`, `aria-required`. Tab cierra la lista y devuelve la opción elegida |
| Menu, Popover, MenuPanel | Foco visible en los ítems. El scroll de la lista no arrastra la página |
| Modal, Drawer | Escape cierra solo el diálogo de arriba cuando hay varios abiertos. El scroll interno no arrastra la página |
| InfoTip | La burbuja va en un portal con posición fija: ya no se recorta dentro de modales y cajones. Va arriba o abajo según el espacio. Escape la cierra sin cerrar el modal |
| Tooltip | Escape lo oculta (WCAG 1.4.13) |
| Toast | Región `aria-live` estable. Se pausa con el puntero o el foco encima. `alert` solo para errores y advertencias |
| PageHeader | Ícono en un recuadro neutro: el naranja queda para estados y acciones |
| Contadores (campana, Copilot) | `primary` con `text-2xs` |

### Errores
`getErrorMessage` traduce el error de red del navegador («Failed to fetch», «Load failed», …) a «No pudimos conectarnos con Quanela. Revisa tu conexión e inténtalo de nuevo.». Los errores de la base de datos se siguen mostrando tal cual.

### Foco
Todos los `focus-visible:ring-brasa-500`, `focus:border-brasa-500` y similares de la app usan ahora el token `focus` (66 usos).

## Fase 3: qué cambió por módulo

### Operación
| Problema | Corrección |
|---|---|
| Al entrar directo a la Lista, todas las cifras salían en 0 | La Lista también carga los pedidos abiertos. Mientras cargan (o si fallan), cada cifra muestra «—» |
| En celulares y tabletas, deslizar sobre una tarjeta no movía la columna | El arrastre táctil empieza con una pulsación larga (250 ms); deslizar desplaza la columna |
| La acción de la tarjeta era un ícono gris de 24 px que cambiaba de sentido en cada columna | Botón con su palabra («Confirmar», «Iniciar», «Marcar listo», «Despachar», «Entregar»). En pantallas táctiles mide 36 px. El tooltip solo aparece cuando la acción no está permitida, para explicar por qué |
| Al pasar el puntero, la franja de color de la tarjeta (atraso o prioridad) desaparecía | El hover aclara solo los otros tres bordes |
| La tarjeta de Cocina cortaba los platos a dos líneas | En Cocina: un plato por línea, completo, sin el estado de pago. Las notas y las opciones tampoco se cortan |
| En el celular, las columnas del tablero quedaban cortadas a la mitad | Una columna al 85 % del ancho, que encaja al deslizar, y se asoma la siguiente |
| Con poca altura (zoom al 200 %, portátil de 768 px, tableta acostada), las columnas quedaban de unos 70 px | Las pantallas de tablero miden al menos 34 rem; por debajo, se desplaza la página |
| La línea de estado de Cocina se cortaba en el celular | Una sola línea: los atrasados van primero, la nota se acorta y el reloj se oculta en el celular |
| Los anuncios del arrastre para lectores de pantalla estaban en inglés | En español y con el número de pedido |
| En la Lista, un nombre largo empujaba Estado, Pago y Total fuera de la vista | Columnas de ancho fijo que se truncan. En el celular, el estado y el pago van bajo el cliente, y cada grupo de filtros ocupa una fila que se desliza |
| La Lista vacía decía «ningún pedido coincide» aunque no hubiera filtros | Sin filtros, el mensaje dice que no hubo pedidos en esas fechas |
| Las filas de las tablas eran `role="button"` y escondían las celdas a los lectores de pantalla | Fila enfocable con su anillo de foco, sin cambiar su rol |

### Abastecimiento
- Un insumo sin mínimo (0) ya no sale «bajo mínimo». En la cuenta de prueba pasaron de 240 a 48.
- Las cifras de Stock esperan a los datos: no muestran «$0» ni «Todo con cobertura» mientras cargan.
- Cantidades legibles en Reponer: «+500 kg» en vez de «+500000 g».
- Las fechas del conteo físico usan la hora local: antes, de noche, salía el día siguiente.
- Abrir un adjunto de compra ya no lo bloquea Safari.

### Clientes, Planificador e Inicio
- Clientes: las cifras muestran un esqueleto mientras cargan.
- Planificador:
  - si el catálogo falla, se muestra el error con «Reintentar»;
  - «Sin platos» distingue un catálogo vacío de una búsqueda sin resultados.
- Inicio:
  - «Cocina ahora» muestra «—» hasta tener los pedidos;
  - «Vencido» no se pinta de verde sin datos;
  - «En turno ahora» muestra el error si falla;
  - el reloj va en horas y minutos.

### General
- Nombres: Insights → «Análisis» y Consumer → «App de clientes» (menú, título, permisos, Copilot e Inicio). Las rutas no cambian.
- Enlace «Saltar al contenido» con el primer Tab.

## Fase 4: movimiento

Se buscaron oportunidades con el criterio de Emil Kowalski (find-animation-opportunities): animar solo lo que tiene un propósito y no se repite cientos de veces al día. El usuario aprobó las cinco propuestas.

| # | Dónde | Cambio |
|---|---|---|
| 1 | Inicio («En vivo»), línea de estado de Cocina, quién está en línea | Se quitó el pulso infinito: el punto queda fijo y el color sigue diciendo el estado |
| 2 | Toasts | Entran desde el borde inferior: 300 ms, `--ease-snappy` |
| 3 | Modal, cajón, Popover y MenuPanel | Celular: la hoja sube desde abajo (300 ms, `--ease-drawer`). Escritorio: el modal aparece con escala 0,97 + opacidad (200 ms) y el cajón se desliza desde su lado. El fondo oscuro aparece en 200 ms |
| 4 | Button | Escala 0,97 al presionar, 150 ms, `--ease-snappy` |
| 5 | Menús y popovers en escritorio | Escala 0,97 + opacidad desde el botón que los abre (`transform-origin`), 150 ms |

**Reglas que se respetan:**
- Solo se animan `transform` y `opacity`, siempre con transiciones y `@starting-style`: si algo se vuelve a abrir enseguida, la animación parte de donde está en vez de reiniciarse.
- Cerrar es instantáneo.
- Con movimiento reducido no se mueve nada; queda un fundido de 150 ms.
- Tokens nuevos: `--ease-snappy` (`cubic-bezier(0.23, 1, 0.32, 1)`) y `--ease-drawer` (`cubic-bezier(0.32, 0.72, 0, 1)`).

**Descartado:**
- Tarjetas del tablero que entran o cambian de columna: pantalla operativa que se actualiza cada 15 s.
- Cifras que cuentan hacia arriba: son datos que se leen.
- Atajos de teclado y cambio de vista: uso constante.
- Acordeón de Configuración: habría que animar la altura, y se usa poco.

**Rendimiento:** la barra de stock ya no usa `transition-all` sobre `width`; no necesita animación.

**Verificación:** se midió fotograma a fotograma en Chrome (escritorio, celular y movimiento reducido).
- Modal: en escritorio va de escala 0,97 y opacidad 0 al reposo; en el celular sube desde 776 px abajo.
- Cajón: entra desde la derecha.
- Menús: en escritorio, escala 0,97 desde la esquina del botón; en el celular, hoja que sube.
- Con movimiento reducido: transform `none` y opacidad de 0 a 1.

El contrato de movimiento (`scripts/responsive/responsiveContract.test.ts`) impide que vuelvan:
- los pulsos en pantallas operativas;
- `transition-all`;
- entradas que animen la maquetación (`width`, `height`, `top`, `left`, `margin`, `padding`).

## Qué no cambió
- Textos funcionales, rutas, permisos, consultas y comportamiento.
- La landing (página pública) conserva su CTA en `brasa-500`. Se revisa en la Fase 3 con su módulo.

## Verificación
- `tsc`, `npm run lint` (13 avisos, los mismos de antes), Vitest completo (143 archivos, 897 pruebas), `npm run build` y `npm run build:admin`.
- Pruebas nuevas:
  - `src/shared/utils/errors.test.ts`: error de red;
  - `src/shared/ui/Overlays.test.tsx`: InfoTip dentro de un modal, Tooltip con Escape, StatCard cargando.
- Capturas antes y después en los temas oscuro, claro y neutro, en escritorio y celular: inicio, tablero, lista, stock, clientes y un modal con foco.
- Fase 3:
  - Vitest completo (145 archivos, 903 pruebas). Hay pruebas nuevas para las cifras de Operación, la tarjeta de Cocina y la regla de stock bajo.
  - Capturas antes y después de Operación (tablero, cocina y lista) en escritorio, celular y pantalla baja, y de Inicio, Stock, Clientes y Planificador.
