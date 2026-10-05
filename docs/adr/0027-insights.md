# ADR 0027: De Reportes a Insights

## Estado
**Aprobada (2026-10-05) con D1–D7 e implementada** (resultados en la sección 8). Falta la revisión visual con sesión.

**Reglas:**
- Código y URL en inglés; textos en español. El nombre del módulo es **Insights**, por pedido explícito.
- La marca es **Quanela**.
- El manual no se toca.
- **Nada de datos inventados**: cada cifra sale de una fuente real (tabla 2.2).
- No cambia la lógica de ventas ni de compras, ni RBAC, ni la RLS, ni el tenant.

---

## 1. Auditoría (2026-10-05)

### 1.1 El módulo de Reportes hoy
- `/k/{cuenta}/reports`: `ReportsPage` (288 líneas).
  - Un rango de fechas con presets y 6 RPC por separado, cada una en su pestaña: ventas por día, top productos, compras por proveedor, insumos comprados, mermas y rentabilidad.
  - Sin comparación de periodos, sin categorías, sin exportación y sin conclusiones.
- **Permisos:** `reports.view` para el módulo y `reports.profitability` para la rentabilidad.
- **Problemas de exactitud** en las RPC actuales:

| Problema | Efecto |
|---|---|
| Agrupan con `created_at::date`, en **UTC** | Un pedido de las 8 p. m. en Bogotá cuenta en el día siguiente; «hoy» no es el hoy de la cuenta |
| `dk_report_top_products` usa `dk_products.estimated_cost` **actual** | El margen de un mes pasado cambia si hoy cambia la receta o el costo del insumo |
| `dk_report_profitability` toma el costo por la fecha del **consumo**, y los ingresos por la fecha del **pedido** | Un pedido de un día y su preparación al día siguiente quedan en periodos distintos |
| Cada pestaña es una consulta y un cálculo aparte | No hay una vista que responda «¿cómo va el negocio?» |

### 1.2 Fuentes de datos disponibles (verificadas en la base)
| Dato | Fuente | Confiabilidad |
|---|---|---|
| **Pedidos e ingresos** | `dk_orders` (`status`, `channel`, `subtotal`, `discount`, `delivery_fee`, `total`, `created_at`) | Alta. Los CANCELADOS se excluyen |
| **Ventas por producto** | `dk_order_items` (`quantity`, `unit_price`, `line_total`, `product_id`, `recipe_id`) | Alta. El descuento es por pedido, no por plato |
| **Costo real de lo vendido** | `dk_inventory_movements` CONSUMO con `reference_type = 'order_item'` y `reference_id` = el plato, y `unit_cost` = costo promedio del insumo **en ese momento** (se registra cuando el plato pasa a LISTO) | Alta: es el costo real por plato. Las devoluciones por corrección (`order_item_revert`) se descuentan |
| **Costo estimado** | `dk_products.estimated_cost` (receta activa × costo promedio) | Media: es el costo de hoy, no el histórico. Solo sirve para lo que todavía no se preparó |
| **Categorías** | `dk_product_categories` y `dk_products.category_id` | Existen, pero hoy **ningún producto tiene categoría**: se muestra «Sin categoría» |
| **Compras** | `dk_purchases` CONFIRMADA y `dk_purchase_items` (`unit_cost` por insumo) | Alta |
| **Mermas** | `dk_inventory_movements` MERMA × `unit_cost` | Alta |
| **Cobros y cartera** | `dk_order_payments` | Alta (no es un ingreso nuevo, es cobranza) |
| **Zona horaria** | `dk_kitchens.timezone`, con `dk_local_date` y `dk_local_start` | — |

**Volumen real hoy:**
- solo «Sopa donde Carmen» tiene ventas: 19 pedidos (11 válidos), del 12 al 26 de septiembre de 2026, 1 producto con receta y 3 compras confirmadas;
- 15 de 18 platos tienen su consumo registrado.

Insights tiene que verse bien **con pocos datos y con cero datos**.

### 1.3 Métricas que **no** se pueden calcular (no se simulan)
| Métrica pedida | Por qué no |
|---|---|
| Costos operativos (nómina, arriendo, servicios) | No se registran gastos. Los turnos tienen horas, pero no salarios |
| Utilidad neta / EBITDA | Faltan los gastos operativos. Solo hay **utilidad bruta** |
| Impuestos, comisiones de pago o de plataformas de domicilios | No hay columnas para eso |
| Devoluciones / reembolsos | Solo hay cancelaciones (que se excluyen) |
| Ingresos por **sucursal comparando cuentas** | ADR 0024: la cuenta es el único nivel visible y el aislamiento es estricto. Cada cuenta ve sus datos; para ver otra, se cambia de cuenta |
| Métricas de toda la plataforma | Son del portal Global Admin (ADR 0019), no de Quanela |

## 2. Diseño

### 2.1 Arquitectura de información
```
Insights  (rail: reemplaza «Reportes»; /k/{cuenta}/insights; /reports redirige)
  [Periodo ▾] [Comparar con: periodo anterior ✓] [Categoría ▾] [Producto ▾]      [Exportar CSV]
  ─ Resumen · Ventas · Productos · Costos ─        (subnavegación subrayada, como en Configuración)
```
| Pestaña | Pregunta que responde | Contenido |
|---|---|---|
| **Resumen** (centro) | ¿Cómo va el negocio? | 6 indicadores con la comparación; un gráfico de ingresos y utilidad bruta con la línea de margen; el resumen del negocio (conclusiones por regla); alertas; top 5 productos y categorías |
| **Ventas** | ¿Cuánto vendemos, cuándo y por dónde? | Ingresos y pedidos por día; ticket promedio; ingresos por canal (manual, WhatsApp, teléfono); ventas por día de la semana y por hora |
| **Productos** | ¿Qué deja dinero? | Tabla de rentabilidad por producto, ordenable por ingresos, utilidad bruta, margen o unidades; comparación por categoría; detalle: categoría → producto → sus pedidos → el pedido (`/orders/:id`) |
| **Costos** | ¿Dónde suben los costos? | Tendencia del costo de ventas; costo por unidad por producto frente al periodo anterior; compras por proveedor; precio de compra por insumo frente al periodo anterior; mermas |

No se separa «Rentabilidad» de «Productos»: hoy los datos no lo justifican, y la rentabilidad general vive en el Resumen.

### 2.2 Definiciones (terminología financiera correcta)
| Indicador | Definición | Fuente |
|---|---|---|
| **Ingresos** (*Revenue*) | Σ `total` de pedidos no cancelados (incluye el domicilio) | `dk_orders` |
| **Ingresos netos de productos** | Σ (`subtotal` − `discount`). Base de la rentabilidad | `dk_orders` |
| **Costo de ventas** (*COGS*) | Por cada plato vendido, su **consumo real** (CONSUMO − devoluciones × costo del consumo). Si aún no se preparó y tiene receta, su **costo estimado**. Se muestra **cuánto es estimado** | `dk_inventory_movements` / `dk_products` |
| **Utilidad bruta** (*Gross Profit*) | Ingresos netos de productos − costo de ventas. **Nunca se llama «utilidad» a secas** | — |
| **Margen bruto** | Utilidad bruta / ingresos netos de productos | — |
| **Pedidos** | Pedidos no cancelados | `dk_orders` |
| **Ticket promedio** (*AOV*) | Ingresos / pedidos | — |
| **Cobertura de costo** | % de los ingresos de productos con costo real o estimado. Por debajo de 100 % se avisa que el margen puede estar sobreestimado | — |
| **Mermas** | Σ MERMA × `unit_cost` (pérdida; no entra en el costo de ventas) | `dk_inventory_movements` |
| **Compras** | Σ `total` de compras CONFIRMADAS (es inventario, no costo de ventas) | `dk_purchases` |

**Fechas:**
- Ingresos y costo de ventas se asignan **por la fecha local del pedido** (zona horaria de la cuenta). Así ingreso y costo del mismo pedido caen en el mismo periodo.
- Compras y mermas se asignan por su propia fecha local.

### 2.3 Periodos y comparación
- **Periodos:** Hoy, Esta semana, Este mes, Mes anterior, Este trimestre, Este año y Personalizado. Por defecto, **Este mes**.
- **Comparación:**
  - contra el **periodo anterior de igual duración**, y para «Mes anterior», contra el mes antes de ese;
  - se puede apagar;
  - siempre se nombra: «vs. 1–31 ago».
- Si el periodo anterior no tiene datos, se muestra «sin datos para comparar» y nunca un «+∞ %».

### 2.4 Resumen del negocio y alertas (reglas, sin IA)
Son funciones puras del frontend sobre las cifras que devuelve la base, documentadas y probadas.

| Regla | Texto (ejemplo) |
|---|---|
| Ingresos cambian ≥ 10 % | «Los ingresos subieron 12,4 % frente al periodo anterior.» |
| Margen bruto cambia ≥ 3 puntos | «El margen bruto bajó de 61 % a 57 %.» (alerta informativa ⚠) |
| Categoría con mayor margen (si hay 2 o más con ventas) | «Bebidas tuvo el mayor margen (70 %).» |
| Producto con más ingresos y margen < promedio | «Hamburguesa X generó más ingresos, pero su margen (38 %) está por debajo del promedio (52 %).» |
| Costo por unidad de un producto sube ≥ 10 % (con 3 unidades o más en cada periodo) | «El costo por unidad de Sopa de pollo subió 14 %.» |
| Precio de compra de un insumo sube ≥ 10 % (misma unidad, 2 compras o más) | «El pollo se compró 14 % más caro.» |
| Mermas ≥ 5 % del costo de ventas | «Las mermas equivalen al 7 % del costo de ventas.» |
| Cobertura de costo < 90 % | «El 18 % de las ventas no tiene costo registrado: el margen puede estar sobreestimado.» |

Con poca información (menos de 5 pedidos en el periodo) solo se describen los hechos, sin conclusiones.

### 2.5 Base de datos (sin borrar nada)
1. **`dk_insights(p_from date, p_to date, p_compare boolean, p_category uuid, p_product uuid)` → jsonb.**
   - Es `SECURITY DEFINER`, con `kitchen_id = dk_current_kitchen_id()` y `dk_can('reports.view')`.
   - **Sin `reports.profitability`** no devuelve costos, utilidad ni margen; la interfaz muestra solo ventas.
   - Devuelve:
     - los indicadores del periodo y del periodo anterior;
     - las series diarias en la zona horaria de la cuenta;
     - productos, categorías, canales, día de la semana y hora;
     - compras, insumos, mermas y la cobertura de costo.
   - Una sola consulta agregada en la base: el navegador no descarga pedidos ni movimientos.
2. **`dk_insights_product_orders(p_product uuid, p_from date, p_to date)`:** los pedidos de un producto en el periodo, para el detalle (máximo 100).
3. **Índice** parcial `dk_inventory_movements (reference_id) where reference_type = 'order_item'` para unir el consumo con cada plato.
4. **Las RPC `dk_report_*` no se borran.** Dejan de usarse y quedan para compatibilidad.

### 2.6 Interfaz
- **Componentes** en `src/modules/insights/`:

  | Componente | Qué es |
  |---|---|
  | `InsightsLayout` | Filtros fijos arriba y subnavegación |
  | `KpiStrip` / `KpiTile` | Valor, variación con flecha y «vs. periodo», y una mini tendencia |
  | `TrendChart` | Barras de ingresos y utilidad bruta, línea de margen; recharts, que ya está en el proyecto |
  | `InsightsTable` | `DataTable` ordenable, con exportación |
  | `PeriodFilter` | Presets y fechas personalizadas |
  | `BusinessSummary` / `InsightAlerts` | Las conclusiones y alertas de 2.4 |
  | `ProfitabilityBars` | Categorías |

  Reutilizan `SettingsSubNav`, `DataTable`, `EmptyState`, `LoadingState`, `Badge` y `typography`.
- **Jerarquía:** insight (resumen) → contexto (indicadores con comparación) → gráfico → detalle (tablas). No es una pared de cards:
  - los indicadores van en **una franja**, no en 6 cards sueltas;
  - las secciones son grupos con título.
- **Responsive:**
  - indicadores en 3 columnas y luego en 2;
  - gráficos a todo el ancho;
  - las tablas se desplazan en su propio ancho;
  - los filtros pasan a una fila que se ajusta.
- **Exportar CSV** (UTF-8 con BOM, separador `;` y números sin formato):
  - los indicadores del periodo;
  - la tabla visible con los filtros aplicados.

  Es una función compartida y nueva, porque hoy no hay ninguna exportación.
- **Rail y nombre:** «Reportes» pasa a **«Insights»** (con su icono de gráfico). Permiso `reports.view`, el mismo de antes.

### 2.7 Roles (sin cambios de RBAC)
| Rol | Qué ve en Insights |
|---|---|
| ADMIN y roles con `reports.view` | Su **cuenta activa** |
| Con `reports.profitability` | También costos, utilidad bruta y margen |
| SUPER_ADMIN | Lo mismo, en la cuenta en la que está; cambia de cuenta para ver otra (ADR 0024) |
| Global Admin (plataforma) | Su portal aparte (`admin.quanela.com`), que no cambia |

## 3. Pruebas
- **SQL (suite nueva `insights`):**
  - totales iguales a la suma de los pedidos;
  - excluye los cancelados;
  - costo real por plato (consumo menos revertido) y estimado solo para lo no preparado;
  - fecha local de la cuenta;
  - comparación del periodo anterior;
  - aislamiento: A no ve a B;
  - sin `reports.profitability`, no hay costos;
  - sin `reports.view`, bloqueado.
- **Vitest:**
  - presets de periodo y el periodo de comparación;
  - las reglas del resumen y de las alertas (incluido «sin datos»);
  - el CSV;
  - el orden de la tabla de productos;
  - la redirección de `/reports`.
- **Resto:**
  - `tsc`, `oxlint`, ambos builds y todas las suites SQL;
  - el navegador con tu sesión en «Sopa donde Carmen» (con datos) y en una cuenta vacía, a 1440, 1024, 768 y 390 px.

## 4. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Costo de ventas | **Consumo real por plato.** Si aún no se preparó y tiene receta, su costo estimado, mostrando cuánto es estimado. Los platos sin receta quedan sin costo y bajan la cobertura (aviso) |
| **D2** | Base de la rentabilidad | **Ingresos netos de productos** (subtotal − descuento). El domicilio entra en los ingresos totales, pero no en el margen |
| **D3** | Alcance | **La cuenta activa** (ADR 0024). Sin consolidado entre cuentas ni métricas de la plataforma en Quanela |
| **D4** | Pestañas | **Resumen · Ventas · Productos · Costos** (rentabilidad dentro de Resumen y Productos) |
| **D5** | Periodo por defecto | **Este mes**, comparado con el periodo anterior de igual duración |
| **D6** | Conclusiones | **Reglas fijas sobre datos reales** (2.4), sin IA. Más adelante Copilot puede explicar sobre estas mismas cifras |
| **D7** | Reportes viejos | **Se reemplazan por completo**: compras por proveedor, insumos y mermas pasan a «Costos». Las RPC viejas quedan en la base |

## 5. Riesgos
| Riesgo | Mitigación |
|---|---|
| Margen alto y engañoso si faltan costos | Cobertura visible y alerta bajo 90 % |
| Pocos datos que generan conclusiones falsas | Umbrales mínimos (5 pedidos, 3 unidades, 2 compras) |
| Consulta pesada con muchos datos | Agregados en la base, índice nuevo y ventanas por fecha local con índices `(kitchen_id, created_at)` |
| Diferencias con las cifras viejas | Se explican en la ADR: zona horaria y costo histórico. Las nuevas son las correctas |

## 6. Orden de ejecución
| Fase | Qué |
|---|---|
| 1 | Base: `dk_insights`, `dk_insights_product_orders`, índice y suite `insights` |
| 2 | Módulo `insights`: API, periodos, reglas y CSV |
| 3 | Resumen: indicadores, tendencia, resumen del negocio y alertas |
| 4 | Ventas, Productos (detalle) y Costos |
| 5 | Rail, ruta y redirección de `/reports` |
| 6 | Pruebas, `tsc`, `oxlint`, builds y navegador |
| 7 | Documentación: esta ADR con resultados y la arquitectura |

## 7. Qué necesito de ti
1. **Aprobar esta ADR**, con D1 a D7 confirmadas o corregidas.
2. **Iniciar sesión** en la vista previa (`fr3rk6.localhost:5173`) para validarlo con «Sopa donde Carmen».

## 8. Resultados (2026-10-05)

### 8.1 Base de datos (`20261005110000_dk_insights`, sin borrar nada)
| Pieza | Qué hace |
|---|---|
| `dk_insights(from, to, compare_from, compare_to, category, product)` → jsonb | Devuelve indicadores (actual y anterior), serie diaria completa, productos, categorías, canales, día de la semana, hora, compras (por **fecha de factura**), precio por insumo y unidad, y mermas. Sin `reports.profitability`, las claves de costo **no vienen** (no son cero) |
| `dk_insights_product_orders(product, from, to)` | Pedidos del producto, para el detalle (máximo 100) |
| `dk_insights_items` y `dk_insights_kpis` | Funciones internas sin acceso desde la API: el costo de cada plato vendido (consumo real − revertido, o estimado de receta si no se preparó) y los indicadores de una ventana |
| Índice parcial | `dk_inventory_movements (reference_id)` para `order_item` y `order_item_revert` |

**Decisión durante la ejecución:** las compras se asignan por `invoice_date`, la fecha de la factura. Es la fecha real del negocio; las RPC viejas usaban la fecha de registro en UTC.

### 8.2 Interfaz (`src/modules/insights`)
- **Rail:** «Reportes» pasó a **Insights** (`/k/{cuenta}/insights`). `/reports` redirige.
  - También se actualizaron los enlaces del Dashboard, las sugerencias de Copilot y el nombre del grupo de permisos en el editor de roles.
- **Filtros:** una sola fila para todas las pestañas:
  - periodo (Hoy, Esta semana, Este mes, Mes anterior, Este trimestre, Este año, Personalizado);
  - categoría y producto;
  - «Comparar con {periodo}», que se puede apagar;
  - «Exportar CSV», que exporta lo que se ve en la pestaña.
- **Resumen:**
  - franja de 6 indicadores: Ingresos, Costo de ventas (con la parte estimada), Utilidad bruta, Margen bruto (en puntos), Pedidos y Ticket promedio;
  - cada uno con su cambio «vs. periodo» o «sin datos para comparar», y una mini tendencia;
  - «Resumen del negocio» con reglas fijas;
  - gráfico de ingresos netos, utilidad bruta y margen por día;
  - productos que más venden y categorías (con detalle).
- **Ventas:** ingresos y pedidos por día; por canal, por día de la semana y por hora local.
- **Productos:**
  - categorías, que filtran al tocarlas;
  - tabla de rentabilidad ordenable por ingresos, utilidad bruta, margen o unidades, con aviso de costo parcial y comparación;
  - al tocar un producto se abren sus pedidos, y de ahí el pedido.
- **Costos:**
  - costo de ventas y margen por día;
  - costo por unidad ahora frente a antes;
  - compras por proveedor, mermas y precio de compra por insumo;
  - la nota de que la nómina, el arriendo y los demás gastos no se registran (por eso solo hay utilidad bruta).
- **Reutilizado:** `SettingsSubNav`, `SettingsSection`, `DataTable` y recharts (en el paquete aparte de Insights, de 58 kB).
- **`ReportsPage` se borró.** Su API (`useSalesByDay`) se mantiene porque la usa el Dashboard.

### 8.3 Validación
| Prueba | Resultado |
|---|---|
| SQL | **754/754** (nueva `insights` 21/21) |
| Vitest | **360/360** (Insights 20) |
| `tsc` | limpio |
| oxlint | 16 avisos, sin nuevos |
| Builds de la app y del portal | pasan |

**`insights.sql` verifica:**
- ingresos, ingresos netos, pedidos y ticket;
- costo real (consumo − revertido) más el estimado del plato no preparado;
- utilidad, margen y cobertura;
- la zona horaria (el pedido de las 23:30 del día anterior cae en el otro periodo);
- la comparación y los filtros;
- los precios de compra y las mermas;
- el detalle de pedidos;
- el cajero sin costos, la cocina bloqueada, otra cuenta bloqueada y el anónimo bloqueado.

**Pendiente:** la revisión en el navegador con sesión. Debe hacerse con «Sopa donde Carmen» (con datos) y con una cuenta vacía, a 1440, 1024, 768 y 390 px.
