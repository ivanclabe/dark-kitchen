# Auditoría UX/UI — Dark Kitchen

Estado: **auditoría, pendiente de aprobación**. No se ha modificado código de producto en esta iteración.

Alcance: los 13 módulos operativos existentes (Dashboard, Inventario/Insumos, Compras, Proveedores, Recetas, Platos, Menú, Pedidos, Cocina, Despachos, Clientes, Reportes, Usuarios). No existe un módulo de "Configuración" separado — se anota como ausente, no como defecto.

Método: lectura directa del código fuente de cada página (no inferencia genérica), conteo real de interacciones por flujo, e inventario del sistema de componentes compartido (`src/shared/ui/`).

---

## 1. Resumen ejecutivo

La aplicación es funcionalmente completa y técnicamente sólida: arquitectura modular limpia, ledger de inventario con trazabilidad real, reservas/consumo correctamente implementados, RLS por rol, y un pulido visual reciente (íconos, gráficas, toasts, modales de confirmación, chips de filtro) ya aplicado a la mayoría de pantallas.

El problema no es "se ve mal". El problema es que **cada interacción de alto volumen (elegir un insumo, un plato o un cliente) usa el mismo patrón — un `<select>` nativo con todas las opciones en texto plano** — sin importar si la lista tiene 5 o 200 elementos. Ese es un solo defecto estructural que se repite en al menos 8 formularios distintos (Compras, Recetas, Pedidos, Menú), y es la causa raíz de la mayoría de la fricción y del riesgo de error humano bajo presión. Corregirlo una vez (un componente Combobox reutilizable) resuelve la mayoría de los problemas P0/P1 de esta auditoría.

El segundo patrón ausente es la **creación contextual**: si al armar un pedido el cliente no existe, o al registrar una compra el insumo no existe, el usuario debe abandonar el flujo, navegar a otro módulo, crear el registro, y volver a empezar. No hay modales/drawers de "crear rápido" en ningún punto de la app todavía, pese a que el patrón de Modal ya existe y se usa bien para confirmaciones.

Lo que **ya funciona bien y no debe tocarse**: el flujo de Cocina (1 clic por cambio de estado, tiempo transcurrido visible, alerta visual a los 15 min), el flujo de Despachos (asignar y despachar en 2 clics, sin fricción), los defaults inteligentes ya presentes (fecha de hoy, precio autocompletado desde el catálogo, motivo de merma con default), y el uso ya disciplinado de confirmaciones (solo en acciones irreversibles: cancelar pedido, confirmar compra, desactivar usuario — no en toggles simples).

---

## 2. Estado actual de la aplicación

- **Stack**: React 19 + TypeScript + Vite + Tailwind v4, Supabase (Postgres + RLS + Auth + Storage), TanStack Query, React Hook Form + Zod, lucide-react, recharts.
- **Estructura**: modular por dominio (`src/modules/<dominio>/{api,hooks,pages,types}`), sin lógica de negocio en componentes (vive en funciones/RPC de Postgres).
- **Sistema de componentes compartido actual** (`src/shared/ui/`): `Modal.tsx` (+ `ConfirmDialog`), `Toast.tsx`, `Chip.tsx`, `formClasses.ts` (clases Tailwind reutilizables para inputs/botones/tablas). **No existen todavía**: Combobox/Autocomplete, Drawer, Card como componente, Table como componente, Select estilizado, NumberStepper, Skeleton, EmptyState, DatePicker custom.
- **13 páginas de "lista + formulario inline al tope"**: el patrón de creación en toda la app es un formulario fijo arriba de la tabla (nunca modal ni drawer para creación), excepto las confirmaciones destructivas que sí usan `ConfirmDialog`.
- **Feedback**: toasts de éxito/error ya presentes en las mutaciones críticas (pedidos, compras, cocina, despachos, movimientos de inventario, menú del día). Botones ya se deshabilitan durante `isPending` — no hay riesgo de doble-submit en las rutas revisadas.

---

## 3. Fortalezas actuales (no tocar sin razón)

1. **Kitchen Display System ya bien resuelto**: tarjetas por pedido, tiempo transcurrido en vivo (`useNow`), borde rojo automático a los 15 min, estado por plato individual (no solo por pedido), 1 clic por transición de estado, auto-refresco cada 15s.
2. **Defaults inteligentes ya implementados**: fecha de factura = hoy (editable), precio unitario de pedido autocompletado desde el catálogo al elegir el plato, motivo de merma con default sensato (`DANO`).
3. **Confirmaciones usadas con criterio**: solo en cancelar pedido, confirmar compra (genera movimientos reales) y activar/desactivar usuario. Los toggles reversibles (activar/desactivar insumo, activar/desactivar plato) **no** piden confirmación — exactamente lo que pide la Fase 9 del brief.
4. **Prevención de doble clic**: todos los botones de submit revisados usan `disabled={mutation.isPending}`.
5. **Trazabilidad de costos en tiempo real**: el editor de recetas ya calcula costo/margen en vivo mientras se agregan ingredientes, sin esperar a guardar.
6. **Auto-protección en Usuarios**: no se puede desactivar ni cambiar el propio rol — previene un error catastrófico (auto-bloqueo del único admin).
7. **RBAC real vía RLS**, no solo ocultando botones — un error de UI no puede convertirse en una fuga de datos entre roles.

---

## 4. Problemas críticos de UX

| # | Problema | Dónde |
|---|---|---|
| 1 | Selección de cliente en Pedidos es un `<select>` alfabético por nombre, sin búsqueda por teléfono. Con más de ~20 clientes se vuelve lento; no hay forma de encontrar "el cliente que llamó de tal número". | `OrdersPage.tsx` |
| 2 | Si el cliente no existe, el flujo de pedido se corta por completo: hay que ir a `/customers`, crear, volver a `/orders`, y el select ya no recuerda el contexto. | `OrdersPage.tsx` |
| 3 | Ningún selector de insumo/plato en la app tiene búsqueda — son `<select>` nativos con la lista completa. Con un catálogo real (50–200 insumos) esto es lento y propenso a elegir la opción equivocada por scroll. | Compras, Recetas, Pedidos, Menú |
| 4 | Cocina no tiene ninguna señal (visual persistente o sonora) de que llegó un ticket nuevo — solo un refetch silencioso cada 15s. En hora pico, un pedido puede pasar inadvertido. | `KitchenPage.tsx` |

## 5. Problemas de UI

| # | Problema | Dónde |
|---|---|---|
| 1 | Inconsistencia visual: `MenuDetailPage` no recibió el pulido de íconos/paleta "brasa" aplicado al resto de la app — sigue en `text-orange-500` plano, botones de texto sin ícono. | `MenuDetailPage.tsx` |
| 2 | El formulario de insumo muestra "Vida útil (días)" siempre visible, incluso cuando "Perecedero" está desmarcado (el campo no aplica). | `InventoryPage.tsx` |
| 3 | Inputs numéricos (cantidad, precio, stock) son `<input type=number>` planos, sin controles +/-, poco cómodos en tablet táctil. | Transversal |
| 4 | Sin skeleton loaders — toda carga muestra el texto "Cargando…"; funcional pero de baja percepción de velocidad en listas largas. | Transversal |

## 6. Problemas de navegación

| # | Problema | Dónde |
|---|---|---|
| 1 | Crear un pedido requiere 2 navegaciones de página completa (lista → detalle) antes de poder agregar el primer plato. | `OrdersPage` → `OrderDetailPage` |
| 2 | Crear una compra tiene el mismo patrón de 2 navegaciones. | `PurchasesPage` → `PurchaseDetailPage` |
| 3 | No existe forma de ver el detalle de un pedido sin abandonar la lista (útil en tablet para caja/cocina, donde volver atrás cuesta más). | `OrdersPage.tsx` |
| 4 | El Dashboard es de solo lectura — ninguna de sus tarjetas o secciones es accionable; para cualquier acción hay que ir al sidebar. | `DashboardPage.tsx` |

## 7. Problemas de formularios

| # | Problema | Dónde |
|---|---|---|
| 1 | Formulario de insumo tiene 9 campos visibles simultáneamente sin agrupar ni progresar según contexto. | `InventoryPage.tsx` |
| 2 | Sin "último precio pagado" ni "último proveedor usado" al registrar una línea de compra — el usuario debe recordarlo o buscarlo aparte. | `PurchaseDetailPage.tsx` |
| 3 | Sin plantillas de compra recurrente (mismo proveedor + mismos insumos cada semana, típico de una cocina). | `PurchasesPage.tsx` |
| 4 | Observación de pedido es texto libre sin sugerencias rápidas, pese a que los motivos se repiten mucho ("sin cebolla", "sin picante", "extra queso"). | `OrderDetailPage.tsx` |

## 8. Problemas de rendimiento percibido

| # | Problema | Dónde |
|---|---|---|
| 1 | "Cargando…" como único estado de carga — sin esqueleto que anticipe la forma del contenido. | Transversal |
| 2 | Cada línea de compra/pedido agregada dispara un refetch completo de la lista (correcto para consistencia, pero sin optimistic update visible — hay un parpadeo perceptible en listas largas). | `PurchaseDetailPage`, `OrderDetailPage` |

## 9. Problemas de operación bajo presión

| # | Problema | Dónde |
|---|---|---|
| 1 | Nada distingue un pedido "normal" de uno urgente más allá del tiempo transcurrido — no hay forma de marcar prioridad manual (la columna `priority` existe en la base de datos pero ninguna pantalla la usa). | Cocina, Pedidos |
| 2 | Un ticket de cocina con 4 platos requiere 4 clics de "Marcar listo" uno por uno — no hay atajo para "todo listo" cuando de verdad todo salió junto. | `KitchenPage.tsx` |
| 3 | Ningún flujo ha sido probado explícitamente en viewport de tablet horizontal (el dispositivo real de una cocina) — todo el desarrollo se verificó en desktop o mobile angosto. | Transversal |

## 10. Oportunidades de mejora (resumen)

Ver tabla completa de recomendaciones por módulo en la sección 15.

## 11. Quick wins (bajo esfuerzo, alto impacto inmediato)

- Aplicar el pulido visual ya existente (íconos, paleta) a `MenuDetailPage` — es copiar el patrón ya usado en las otras 12 páginas.
- Ocultar "Vida útil" del formulario de insumo hasta marcar "Perecedero".
- Agregar chips de observación rápida en Pedidos ("Sin cebolla", "Sin picante", etc., configurables).
- Exponer visualmente el campo `priority` ya existente en `dk_kitchen_tickets` con un toggle simple ("Marcar urgente") en Cocina/Pedidos.
- Botón "Marcar todo listo" en tickets de cocina.

## 12. Mejoras de mediano plazo

- Componente Combobox/Autocomplete reutilizable, aplicado a los 4+ selectores de insumo/plato/cliente.
- Creación contextual (modal) de cliente desde Pedidos y de insumo/proveedor desde Compras.
- "Último precio pagado" y "proveedor más usado" como sugerencia en Compras.
- NumberStepper reutilizable para cantidades (útil en tablet).

## 13. Mejoras estructurales

- Reemplazar el patrón "2 navegaciones de página" en creación de Pedidos/Compras por un flujo de un solo panel (drawer o página única con secciones), sin perder la separación NUEVO→CONFIRMADO ya bien diseñada a nivel de datos.
- Formalizar un Design System mínimo (`Card`, `Table`, `Select`, `EmptyState`, `Skeleton`) para dejar de reimplementar las mismas clases Tailwind en cada página.
- Auditoría y ajuste real en viewport tablet (1024×768 horizontal) para Cocina y Despachos.

## 14. Priorización por impacto/esfuerzo

| Prioridad | Criterio | Ítems |
|---|---|---|
| **P0 — Crítico** | Riesgo real de error operativo o pedido perdido/mal tomado | Selector de cliente sin búsqueda por teléfono + sin creación inline; selectores de insumo/plato sin búsqueda en ningún formulario; sin alerta de ticket nuevo en Cocina |
| **P1 — Alto impacto** | Reduce significativamente el tiempo de operación | Combobox reutilizable aplicado a todos los pickers; creación contextual de cliente/insumo/proveedor; "último precio"/"proveedor frecuente" en Compras; formulario de insumo progresivo; acciones rápidas visibles en Dashboard |
| **P2 — Productividad** | Optimizaciones adicionales | NumberStepper; plantillas de compra; "marcar todo listo" en Cocina; chips de observación en Pedidos; uso del campo `priority` |
| **P3 — Modernización** | No crítico | Skeleton loaders; consistencia visual en `MenuDetailPage`; micro-animaciones; búsqueda global / command palette |

## 15. Recomendaciones específicas por módulo

| Módulo | Problema | Impacto | Prioridad | Recomendación |
|---|---|---|---|---|
| Pedidos | Cliente se busca en select alfabético, sin filtro por teléfono | Alto — pedidos lentos o mal tomados en hora pico | P0 | Combobox con búsqueda por nombre y teléfono |
| Pedidos | No se puede crear cliente sin abandonar el flujo | Alto — corta el flujo de toma de pedido | P0 | Modal de "crear cliente rápido" embebido en el combobox |
| Pedidos / Compras / Recetas / Menú | Selector de insumo/plato sin búsqueda | Alto — lento y propenso a error con catálogos grandes | P0 | Mismo componente Combobox, reutilizado |
| Cocina | Sin alerta de ticket nuevo | Alto — pedido puede pasar inadvertido | P0 | Indicador visual persistente (badge con conteo) para tickets no vistos aún |
| Compras | Sin "último precio pagado" al elegir insumo | Medio — reingreso manual de datos que ya existen | P1 | Mostrar el último costo unitario registrado para ese insumo/proveedor como sugerencia |
| Inventario | Formulario de insumo no progresivo (9 campos siempre visibles) | Medio — carga cognitiva innecesaria | P1 | Ocultar "vida útil" hasta marcar "perecedero" |
| Dashboard | Solo lectura, sin acciones | Medio — navegación extra para tareas frecuentes | P1 | Botones de acción rápida (Nuevo pedido, Nueva compra, Ver cocina) |
| Pedidos / Compras | Creación en 2 navegaciones de página completa | Medio — fricción y pérdida de contexto | P1/P2 | Consolidar en un solo flujo (drawer o página con secciones), sin cambiar el modelo de estados |
| Cocina | Sin "marcar todo listo" | Bajo/Medio — clics repetidos en pedidos multi-plato | P2 | Botón de acción masiva por ticket |
| Pedidos | Observación sin sugerencias rápidas | Bajo — digitación repetida | P2 | Chips de observaciones frecuentes, configurables |
| Compras | Sin plantillas de compra recurrente | Bajo — reingreso manual semanal | P2 | Plantilla por proveedor con últimas cantidades |
| Menú | `MenuDetailPage` no recibió el pulido visual aplicado al resto | Bajo — inconsistencia visual | P3 | Aplicar el mismo patrón de íconos/paleta ya usado en las demás páginas |
| Transversal | Sin skeleton loaders | Bajo — percepción de velocidad | P3 | Skeletons en listas largas (Inventario, Pedidos, Reportes) |
| Transversal | Sin verificación real en tablet horizontal | Medio (riesgo no confirmado) | P2 | Sesión de prueba dedicada en viewport 1024×768 para Cocina/Despachos |

---

## 16. Propuesta de sistema de diseño (componentes a formalizar)

Ya existen y están bien resueltos: `Modal`/`ConfirmDialog`, `Toast`/`useToast`, `Chip`, `formClasses` (tokens de botón/input/tabla).

Por construir, en este orden de dependencia:

1. **`Combobox`** — búsqueda con teclado, resaltado de coincidencia, agrupación opcional por categoría, sección "usados recientemente". Es la pieza que desbloquea la mayoría de los P0/P1.
2. **`NumberStepper`** — input numérico con +/- y validación de rango, para cantidades y precios.
3. **`Drawer`** — panel lateral para creación/edición contextual sin perder la lista de fondo (mismo mecanismo de portal que `Modal`, distinto layout).
4. **`Card` / `EmptyState` / `Skeleton`** — formalizar lo que hoy son clases sueltas (`cardClass`) en componentes con estados de carga/vacío consistentes.

Ninguno de estos reemplaza el patrón actual (páginas + Tailwind + Supabase directo) — se insertan en los mismos formularios que ya existen, no requieren reescribir la arquitectura.

---

## 17. Plan de implementación por iteraciones

**Iteración 1 — Combobox + corrección crítica de Pedidos**
Construir `Combobox` reutilizable en `shared/ui`. Reemplazar el selector de cliente en `OrdersPage` (búsqueda por nombre/teléfono) y agregar creación rápida de cliente inline (modal) sin abandonar el flujo. Alerta visual de ticket nuevo en Cocina.
Archivos: `src/shared/ui/Combobox.tsx` (nuevo), `src/modules/orders/pages/OrdersPage.tsx`, `src/modules/customers/*`, `src/modules/kitchen/pages/KitchenPage.tsx`, `src/modules/kitchen/hooks/useKitchen.ts`.

**Iteración 2 — Combobox en el resto de selectores de alto volumen**
Reemplazar los `<select>` de insumo/plato en Compras, Recetas y Menú por el mismo `Combobox`. "Último precio pagado" en Compras. Formulario de insumo progresivo.
Archivos: `PurchaseDetailPage.tsx`, `RecipeEditorPage.tsx`, `MenuDetailPage.tsx`, `InventoryPage.tsx`, `purchases/api/purchases.ts` (nueva consulta de último precio).

**Iteración 3 — Pedidos y Cocina**
Consolidar creación de pedido en un solo flujo. Chips de observación rápida. "Marcar todo listo" y uso del campo `priority` en Cocina.
Archivos: `OrdersPage.tsx`, `OrderDetailPage.tsx`, `KitchenPage.tsx`, migración SQL menor si `priority` necesita una acción dedicada.

**Iteración 4 — Creación contextual en Compras y acciones rápidas en Dashboard**
Modal de "crear insumo"/"crear proveedor" desde Compras. Botones de acción rápida en el Dashboard.
Archivos: `PurchaseDetailPage.tsx`, `suppliers/*`, `inventory/*`, `DashboardPage.tsx`.

**Iteración 5 — Consistencia visual y Design System**
Aplicar el pulido pendiente a `MenuDetailPage`. Formalizar `Card`, `EmptyState`, `Skeleton`, `NumberStepper`.
Archivos: `MenuDetailPage.tsx`, `src/shared/ui/*` (nuevos).

**Iteración 6 — Tablet y accesibilidad**
Sesión de verificación dedicada en viewport 1024×768 para Cocina y Despachos; ajuste de tamaños táctiles; revisión de foco/Escape/Enter en modales existentes.

Cada iteración: explicar el cambio → identificar archivos → implementar → `tsc -b` → `oxlint` → `vite build` → verificar en navegador → resumen de resultado. Sin cambios destructivos ni reescritura de lo que ya funciona bien (Cocina, Despachos, defaults inteligentes, confirmaciones).
