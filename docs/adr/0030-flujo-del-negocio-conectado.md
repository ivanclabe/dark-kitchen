# ADR 0030: Un solo flujo de negocio (conectar lo que ya existe)

## Estado
**Aceptada e implementada (2026-10-05).** Decisiones D1 a D5 aprobadas tal como se recomendaron. El módulo de Finanzas irá en una ADR propia. Resultados en la sección 10.

**Reglas:**
- **No se reconstruye** Insights, Clientes, Configuración ni Pedidos.
- **No se agregan funcionalidades ni datos:** solo se conecta y se simplifica lo que ya existe.
- No cambian la base de datos, RBAC, la RLS ni el tenant.
- Textos en español; la marca es **Quanela**.
- El manual no se toca.

---

## 1. Auditoría (2026-10-05)

### 1.1 Módulos y su pregunta de negocio
| Rail | Pregunta que debe responder | ¿La responde hoy? |
|---|---|---|
| **Dashboard** | ¿Qué está pasando **hoy** y qué debo hacer? | **A medias.** Mezcla operación de hoy (cocina ahora, en turno, pedidos recientes) con **análisis de 7, 30 y 90 días** (gráfico y resumen de ventas), que es la pregunta de Insights. Además, ese gráfico agrupa por día en **UTC** (`dk_report_sales_by_day`), así que Inicio e Insights pueden mostrar cifras distintas para el mismo día. El nombre está en inglés |
| **Pedidos** | ¿Qué tengo que preparar, entregar o resolver? | Sí (tablero, lista y despacho; la lista se filtra por URL) |
| **Cocina** | ¿Qué preparo ahora? | Sí |
| **Catálogo** | ¿Qué vendo y a qué costo? | Solo lo primero: platos, menú y receta con costo estimado. **No hay forma de saltar a cuánto se vende ni qué margen deja** (eso vive en Insights) |
| **Abastecimiento** | ¿Qué tengo y qué compro? | Sí. Las compras se cargan **todas** (`listPurchases` sin límite) |
| **Clientes** | ¿Quiénes son, cuánto compran y cuánto deben? | Sí (ADR 0028) |
| **Personal** | ¿Quién trabaja y cuántas horas? | Sí |
| **Insights** | ¿Qué funciona, qué empeora y por qué? | Sí (ADR 0027), pero **sin salidas** al dato operativo (receta, insumo, proveedor) |
| **Usuarios / Configuración** | ¿Quién trabaja aquí y cómo funciona el sistema? | Sí (ADR 0024 y 0026) |

**«Finanzas»:** no existe como módulo, y está bien así.
- **Lo que entra:** ingresos (Insights) y cobros y cartera (Clientes).
- **Lo que sale:** compras (Abastecimiento) y mermas.
- **Lo que no existe:** no hay gastos operativos ni flujo de caja. Un módulo de Finanzas hoy solo **repetiría** esas tres vistas. Ver «Futuro».

### 1.2 El flujo del negocio: dónde se corta
```
Cliente ──✓──> Pedido ──✓──> Cliente           (el pedido enlaza al cliente: «Saldo e historial»)
Cliente ──✗──> Nuevo pedido para ESE cliente   (hay que ir a Pedidos y volver a buscarlo)
Inicio ──✗──> el dato filtrado                 (sus enlaces van a /customers, /kitchen, /supply… sin filtro)
Alerta ──✗──> la causa                         (los avisos son texto, sin enlace)
Insights ─✓─> Producto ─✓─> Pedidos ─✗─> el pedido SIN salir (abre /orders y se pierde Insights)
Insights ─✗─> receta del producto / insumo / proveedor
Catálogo / Receta ─✗─> ventas y rentabilidad del plato (Insights)
Insights / Clientes ─✗─> un enlace que abra ya filtrado (los filtros no viven en la URL)
```

### 1.3 Fricciones y riesgos de crecimiento
| # | Fricción | Efecto |
|---|---|---|
| F1 | Inicio repite el análisis de Insights y además en otra zona horaria | Dos números distintos para «ventas de ayer», y una pantalla larga sin foco |
| F2 | Las tarjetas de Inicio llevan a la pantalla sin filtro («Ir a Clientes») | Para ver quién debe hay que llegar y filtrar a mano |
| F3 | La cartera de Inicio descarga **todas** las cuentas por cobrar (`useReceivables`) para sumarlas | No escala con miles de pedidos con saldo. El resumen ya existe en la base (`dk_customers_summary`) |
| F4 | «Nuevo pedido» descarga **todos** los clientes para el selector (`useCustomers`) | Con 10.000 clientes es lento; quedó pendiente en la ADR 0028 |
| F5 | Desde un cliente no se puede crear un pedido para él | Hay que cambiar de módulo y buscarlo otra vez |
| F6 | Desde Insights, un pedido abre la pantalla de Pedidos | Se pierde el análisis |
| F7 | Desde Insights no se llega a la receta, al insumo ni al proveedor | Se ve que un costo subió, pero no por qué |
| F8 | Desde Catálogo y Receta no se llega a las ventas ni a la rentabilidad del plato | El costo se ve sin la venta |
| F9 | Los filtros de Clientes e Insights no están en la URL | No se puede enlazar «clientes con deuda» ni «Insights de este producto» |
| F10 | «Volver» del detalle de cliente o de la receta siempre lleva a la lista | Si viniste de Insights o de Inicio, pierdes el lugar |
| F11 | Las compras se cargan completas | Crece sin límite con los años |

### 1.4 Roles (sin cambios)
| Rol | Ámbito |
|---|---|
| **ADMIN y roles de cuenta** | Su cuenta activa |
| **SUPER_ADMIN** (dueño) | Todas sus cuentas, cambiando de cuenta (ADR 0024) |
| **Global Admin** | La plataforma, en su portal aparte (ADR 0019) |

Cada enlace nuevo respeta el permiso del destino: si no puedes abrirlo, no aparece.

## 2. Clasificación
| Grupo | Qué |
|---|---|
| **Mantener** | Pedidos (tablero, lista y despacho); Cocina; Clientes (ADR 0028); Insights (ADR 0027); Configuración y Usuarios; el panel de pedido con enlace al cliente; el rail con Usuarios y Configuración separados; la consistencia visual (ADR 0029) |
| **Mejorar** | Inicio con foco en **hoy** y en lo que necesita atención; alertas con enlace a su causa; selector de cliente con búsqueda en la base; cartera de Inicio con el resumen agregado; compras paginadas |
| **Reagrupar** | El análisis de 7, 30 y 90 días de Inicio **vive en Insights** (Inicio deja un enlace); «Dashboard» pasa a llamarse **«Inicio»** |
| **Conectar** | Cliente → nuevo pedido; Insights → pedido sin salir; Insights → receta, insumo y proveedor; Catálogo y Receta → Insights del plato; filtros enlazables; «Volver» al lugar de origen |
| **Eliminar** | El gráfico y el resumen de ventas de 7, 30 y 90 días de Inicio (duplicado y en UTC). El RPC viejo queda en la base |
| **Futuro** | Ver la sección 5 |

## 3. Cambios propuestos (mínimos y de alto impacto)

### 3.1 Inicio = la operación de hoy
- **Rail:** «Dashboard» pasa a **«Inicio»** (la ruta `/dashboard` no cambia).
- **Se quita el análisis de 7, 30 y 90 días** (`SalesOverview`) y se reemplaza por una línea: «Tendencias y rentabilidad → Insights».
- **Bloque nuevo, «Necesita atención».** Solo cifras que ya existen; cada una abre el destino **ya filtrado**. Las filas en cero se ocultan y, si todo está en orden, se dice.

  | Fila | Fuente | Abre |
  |---|---|---|
  | Pedidos por confirmar | `ordersNuevo` | `/orders?view=list&status=NUEVO` |
  | En preparación o listos | `ordersEnPreparacion` + `ordersListo` | `/kitchen` |
  | Clientes con saldo vencido | `dk_customers_summary.withOverdue` | `/customers?status=overdue` |
  | Insumos bajo el mínimo | `lowStockCount` | `/supply/stock?filter=low` |

- **Se mantienen:** el saludo con las ventas y los pedidos de hoy, las alertas de la cuenta, Pedidos recientes, Cocina ahora, En turno ahora, y Cartera y compras del mes.
- **«Cartera y compras»** usa `dk_customers_summary` (sin descargar las cuentas por cobrar) y enlaza a `/customers?status=debt`.
- **Accesos rápidos:** «Compras», «Clientes» e «Insights» se mantienen.

### 3.2 Alertas con enlace a su causa
Cada alerta de `dk_account_alerts` ya trae su `type`. La interfaz agrega «Ver» hacia su origen, si tienes el permiso:

| `type` | Destino |
|---|---|
| `late_orders` | Cocina |
| `low_stock` | Stock bajo el mínimo |
| `ai_errors` y `ai_quota` | Configuración → IA y voz → Uso y estado |
| `trial` y `plan_limit` | Configuración → Facturación |

### 3.3 Filtros que viven en la URL (para poder enlazar)
| Pantalla | Parámetros |
|---|---|
| **Clientes** | `?status=` y `?q=` |
| **Insights** | `?tab=` (ya existía), `?product=` y `?category=` |
| **Stock** | `?filter=low` |

Se pueden compartir, guardar y usar como destino de los enlaces de las demás pantallas.

### 3.4 Conexiones nuevas
| Desde | Acción | Hacia |
|---|---|---|
| Detalle de cliente | **«Nuevo pedido»** (con `orders.create`) | «Nuevo pedido» con ese cliente ya elegido, sin salir |
| Insights → producto → pedidos | Tocar un pedido | El **panel del pedido sobre Insights**. El `CustomerOrderDrawer` se generaliza a `OrderPeekDrawer` en el módulo de pedidos y lo usan Clientes e Insights |
| Insights → producto | «Ver receta y costo» | `/recipes/:id` |
| Insights → Costos | Insumo o proveedor | `/supply/stock/:id` y `/supply/proveedores/:id` |
| Catálogo (plato) y Receta | **«Ventas y rentabilidad»** | `/insights?tab=products&product=:id` |
| Detalle de cliente y Receta | «Volver» | **Al lugar de origen** (Inicio, Insights, Pedidos…) cuando se llegó desde otra pantalla. Se pasa por el estado de navegación; si no, a la lista |

### 3.5 Crecimiento
| Dónde | Cambio |
|---|---|
| **Nuevo pedido** | El selector de cliente busca en la base (`dk_customers_list`, 20 resultados mientras se escribe) en lugar de cargar todos |
| **Compras** | Se cargan de 50 en 50 con «Cargar más». La búsqueda y los filtros siguen funcionando sobre lo cargado, y la interfaz avisa cuando no está todo cargado |
| **Inicio** | La cartera sale del resumen agregado |

## 4. Pruebas
- **Vitest:**
  - Inicio: el bloque «Necesita atención» (oculta los ceros y cada fila lleva su enlace filtrado), el rail dice «Inicio» y ya no está el gráfico de 90 días;
  - alertas con enlace según su tipo y permiso;
  - Clientes e Insights leen sus filtros desde la URL;
  - «Nuevo pedido» desde el cliente sale preseleccionado;
  - el selector busca en la base con espera;
  - `OrderPeekDrawer` sin acciones de flujo;
  - «Volver» al origen;
  - compras con «Cargar más»;
  - el contrato de la ADR 0029 sigue pasando.
- **Resto:**
  - `tsc`, `oxlint`, ambos builds y todas las suites SQL, sin cambios;
  - el navegador con tu sesión: recorrer las 12 preguntas del pedido (sección 6) en escritorio y celular.

## 5. Futuro (requiere datos o backend que no existen; no se simula)
| Mejora | Qué falta |
|---|---|
| **Finanzas**: flujo de caja, gastos, utilidad neta | Registrar gastos operativos (nómina, arriendo, servicios) y unificar cómo se registran los cobros de todos los pedidos (hoy solo los que van a cartera tienen pagos) |
| **Búsqueda global** (cliente, pedido o producto desde la barra superior) | Es una funcionalidad nueva. Hoy cada módulo busca en su pantalla y Copilot responde preguntas |
| **Productos comprados por un cliente** | Una agregación por cliente y producto (RPC nueva) |
| **Vista consolidada de varias cuentas** para el dueño | Choca con el aislamiento por cuenta (ADR 0024). Si se quiere, va en una ADR propia con su modelo de permisos |
| **Compras con búsqueda en la base** | La paginación de 3.5 es el primer paso; la búsqueda y los filtros por proveedor y fecha requieren un RPC |

## 6. Las 12 preguntas del pedido, después del cambio
| # | Pregunta | Dónde se responde |
|---|---|---|
| 1 | ¿Qué pasa hoy? | Inicio (ventas y pedidos de hoy, cocina y turno) |
| 2 | ¿Qué debo hacer ahora? | Inicio → «Necesita atención» y alertas con «Ver» |
| 3 | ¿Qué pedidos necesitan atención? | «Por confirmar» → Pedidos filtrados; Cocina |
| 4 | ¿Qué clientes necesitan atención? | «Clientes con saldo vencido» → Clientes filtrados |
| 5 | ¿Quién me debe? | Cartera → `/customers?status=debt` |
| 6 | ¿Qué vendo? | Insights → Productos; Catálogo → «Ventas y rentabilidad» |
| 7 | ¿Qué es rentable? | Insights → Productos (margen) |
| 8 | ¿Cómo funciona el negocio? | Insights → Resumen |
| 9 | ¿Por qué cambió una cifra? | Insights → producto → pedidos (sin salir); costo → receta, insumo o proveedor |
| 10 | ¿Llego de la cifra al dato? | Sí: los enlaces abren el destino filtrado |
| 11 | ¿Hago lo habitual sin saltar de módulo? | Pedido desde el cliente; pedido sobre Insights o Clientes; «Volver» al origen |
| 12 | ¿Sigue siendo simple al crecer? | Clientes, selector de cliente, cartera y compras paginados o agregados en la base |

## 7. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Análisis de 7, 30 y 90 días en Inicio | **Quitarlo** (duplica Insights y usa UTC). Inicio queda para hoy, con un enlace a Insights |
| **D2** | Nombre | **«Inicio»** en el rail (UI en español) |
| **D3** | Finanzas | **No crear el módulo**: hoy sería una copia. Va a «Futuro» |
| **D4** | Volver | **Al lugar de origen** por estado de navegación, sin breadcrumbs nuevos (el diseño usa «Volver» en el encabezado) |
| **D5** | Compras | **Paginadas de 50 en 50 con «Cargar más»** (cambio mínimo); la búsqueda en la base va a «Futuro» |

## 8. Orden de ejecución
| Fase | Qué |
|---|---|
| 1 | Filtros en la URL (Clientes, Insights y Stock) y `OrderPeekDrawer` compartido |
| 2 | Inicio: nombre, «Necesita atención», cartera agregada y sin el análisis de 90 días |
| 3 | Alertas con enlace a su causa |
| 4 | Conexiones: nuevo pedido desde el cliente; Insights → pedido, receta, insumo y proveedor; Catálogo y Receta → Insights; «Volver» al origen |
| 5 | Crecimiento: selector de cliente en la base y compras paginadas |
| 6 | Pruebas, `tsc`, `oxlint`, builds y SQL |
| 7 | Documentación: esta ADR con resultados y la arquitectura |

## 9. Qué necesito de ti
1. **Aprobar esta ADR**, con D1 a D5 confirmadas o corregidas.
2. **Iniciar sesión** en la vista previa para recorrer las 12 preguntas como administrador.

## 10. Resultados (2026-10-05)

### 10.1 Qué cambió
| Fase | Hecho |
|---|---|
| 1 | Clientes lee `?status` y `?q` (un estado desconocido se ignora). Insights lee `?category` y `?product`. Stock abre con `?filter=low`. El panel del pedido de Clientes pasó a `orders/components/OrderPeekDrawer.tsx`: es de solo lectura y lo usan Clientes e Insights |
| 2 | El rail, los permisos y Copilot dicen **«Inicio»**. Se quitó `SalesOverview` (7, 30 y 90 días). Se agregó **«Necesita atención»**: oculta las filas en cero y, si no hay nada, dice «Todo al día». «Cartera y compras» usa `dk_customers_summary` |
| 3 | `AlertList` acepta `linkFor`. Inicio enlaza cada alerta a su causa según tipo y permiso |
| 4 | **Detalle de cliente:** «Nuevo pedido» con el cliente ya elegido. **Insights:** producto → pedidos → pedido encima, sin salir; «Ver receta y costo» (`recipes.view`); en Costos, insumo → Stock y proveedor → Proveedores. **Catálogo (plato) y Receta:** «Ventas y rentabilidad» (`reports.view`). **«Volver» al origen** en Detalle de cliente y Receta |
| 5 | El selector de «Nuevo pedido» busca en la base: 20 resultados y 250 ms de espera. Compras se cargan de 50 en 50, con «Cargar más» y un aviso. El detalle del proveedor trae solo sus compras, completas, y su total no cambia |

### 10.2 Piezas nuevas
- **`src/shared/hooks/useBackTarget.ts`**
  - `useBackTarget(fallback)` lee `state.from` (`{ to, label }`). Acepta solo rutas internas: lo que empieza por `//` o no empieza por `/` se descarta. Quita el prefijo `/k/{cocina}` porque `PageHeader` usa `KitchenLink`.
  - `useHere(label?)` entrega la pantalla actual con la etiqueta de su sección.
  - Lo usan el panel del pedido («Saldo e historial» y el enlace de cada plato a su receta) y el panel de pedidos de un producto en Insights.
  - Al cambiar de pestaña en el detalle del cliente se conserva el estado, así que el origen no se pierde.
- **`src/modules/dashboard/lib/attention.ts`**: `attentionRows` y `alertLink`. Son funciones puras con sus pruebas.
- **`listPurchases({ limit, supplierId })`**: pide una fila de más para saber si hay otra página sin contar toda la tabla. Hooks: `usePurchases(limit)` (con `keepPreviousData`) y `useSupplierPurchases(id)`.
- **`Combobox`**: `onQueryChange` y `filterLocally`.
- **`Chip`**: expone `aria-pressed`. Es accesibilidad y además permite probar qué filtro está activo.

### 10.3 Validación
| Prueba | Resultado |
|---|---|
| Vitest | **411/411**: 22 nuevas en 7 archivos de prueba y 1 ajustada (el detalle de cliente necesitaba `QueryClient`) |
| `tsc` | limpio |
| oxlint | 16 avisos, sin nuevos |
| Builds de la app y del portal | pasan |
| Suites SQL | **779/779**, sin cambios en la base |

**Cobertura:**
- «Necesita atención»: enlaces filtrados y permisos.
- Alertas: el destino según tipo y permiso, y «Ver» solo donde aplica.
- Filtros en la URL de Clientes, Insights y Stock.
- Nuevo pedido: el cliente preseleccionado y la búsqueda en la base.
- El pedido abierto sobre Insights.
- «Volver» al origen: por defecto, desde otra pantalla, conservado entre pestañas, y una ruta externa ignorada.
- Compras: «Cargar más», el aviso y los conteos.

**Pendiente:** el recorrido en el navegador con sesión (las 12 preguntas de la sección 6, en escritorio y celular). La vista previa redirige al login.

