# ADR 0065: Sistema de diseño de calidad premium

## Estado
**Fase 2 implementada (2026-10-15), pendiente de aprobación.** Se pidió en la conversación: subir la calidad visual y de experiencia de Quanela por fases, sin tocar lógica de negocio, consultas de Supabase, permisos ni migraciones, y detenerse al final de cada fase.

- **Fase 1:** auditoría (solo lectura). Aprobada.
- **Fase 2:** sistema de diseño (este documento).
- **Fase 3:** pulido por módulo, empezando por los P0 y P1 de la auditoría.
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

## Qué no cambió
- Textos funcionales, rutas, permisos, consultas y comportamiento.
- La landing (página pública) conserva su CTA en `brasa-500`. Se revisa en la Fase 3 con su módulo.

## Verificación
- `tsc`, `npm run lint` (13 avisos, los mismos de antes), Vitest completo (143 archivos, 897 pruebas), `npm run build` y `npm run build:admin`.
- Pruebas nuevas:
  - `src/shared/utils/errors.test.ts`: error de red;
  - `src/shared/ui/Overlays.test.tsx`: InfoTip dentro de un modal, Tooltip con Escape, StatCard cargando.
- Capturas antes y después en los temas oscuro, claro y neutro, en escritorio y celular: inicio, tablero, lista, stock, clientes y un modal con foco.
