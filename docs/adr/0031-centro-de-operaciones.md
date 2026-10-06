# ADR 0031: Centro de operaciones (Pedidos + Cocina) y el pago dentro del pedido

## Estado
**Aceptada e implementada (2026-10-06).** D1 a D7 se aprobaron tal como se recomendaron. Resultados en la sección 10.

**Reglas:**
- **No se reconstruye** Insights, Clientes, Configuración, la autenticación, RBAC, la RLS ni la lógica de pedidos.
- **No se inventan estados ni datos.** El pago se lee de su única fuente, `dk_order_payments`.
- Se reorganiza y se conecta lo que existe. Solo hay dos cambios en la base y los dos son opcionales (D5 y D6).
- Código y URL en inglés; textos en español; la marca es **Quanela**.
- El manual no se toca.

---

## 1. Auditoría (2026-10-06)

### 1.1 Pedidos y Cocina ya comparten los datos; lo que los separa es la interfaz
La ADR 0020 dejó **una sola capa de datos del pedido**:
- una consulta (`useLiveOrders`, que se refresca cada 15 s);
- un tipo `Order`;
- una raíz de caché (`['orders']`);
- las mismas mutaciones y el mismo tablero (`OrderBoard`);
- el mismo detalle (`OrderDetailDrawer`).

Cocina (`KitchenPage`) es ese mismo tablero con 3 columnas y un alcance de acciones limitado (`KITCHEN_SCOPE`). **No hay datos duplicados.**

Lo que hace que se sientan como dos aplicaciones:

| Hallazgo | Dónde | Efecto |
|---|---|---|
| Dos ítems en el menú y dos pantallas con su propio encabezado, KPI, buscador y menú «Más opciones» (código copiado) | `OrdersPage:28,147-191` · `KitchenPage:64,205-251` | El mismo pedido vive en «dos lugares» |
| Dos formas de abrir un pedido | `/orders/:orderId` vs `/kitchen?order=` | Un enlace no sirve en la otra pantalla |
| **Dos vocabularios de estado** | `orderStatus.tsx` («Nuevo», «Confirmado», «Despachado») vs `orderVisuals.ts` («Por confirmar», «En cola», «En ruta») | En el detalle, el subtítulo dice «En cola» y la insignia dice «Confirmado» |
| El conjunto «etapas de cocina» está definido 6 veces | `OrderDetailDrawer:22`, `OrderCardBody:31`, `useOrderActions:25`, `KitchenPage:43`, `api/orders:109`, `transitions:13` | Riesgo de que diverjan |
| Confirmar y cancelar implementados dos veces | `BoardDialogs` (cancela con motivo) vs `OrderBuilder:114-136,279-308` (cancela sin motivo) | La misma acción se comporta distinto |
| «Entregado» implementado dos veces | `useOrderActions:68-73` vs `DispatchView:83-90` | Lógica repetida |

Lo que **sí** es propio de Cocina y se mantiene:
- voz y «Oye Quanela»;
- alertas de pedidos detenidos;
- la línea de IA;
- la vista de tiempos (SLA);
- horario y calendario;
- el tamaño grande;
- su alcance de acciones.

Lo que es propio de Pedidos:
- crear y confirmar;
- Despacho y domiciliarios;
- la Lista con búsqueda en la base;
- los atajos `N` y `/`.

### 1.2 Estados: ya existen y están bien separados
| Dimensión | Valores | Dónde vive |
|---|---|---|
| **Operativa** (pedido) | NUEVO → CONFIRMADO → EN_PREPARACION → LISTO → DESPACHADO → ENTREGADO, y CANCELADO desde cualquier estado activo | `dk_orders.status`. La base la deriva de los ítems en la etapa de cocina |
| **Cocina** (ítem) | PENDIENTE → EN_PREPARACION → LISTO | `dk_order_items.kitchen_status` |
| **Entrega** | EN_RUTA, ENTREGADO, FALLIDO | `dk_deliveries.status`. FALLIDO no tiene acción: solo se muestra |
| **Financiera** (pago) | **No hay columna.** Se calcula: pagado = Σ `dk_order_payments.amount` y saldo = `total − pagado` | `dk_order_payments` (registro de solo inserción) y la vista `dk_receivables` |

**La secuencia que pediste ya existe tal cual. No hace falta ningún estado nuevo.** El pago ya es una dimensión aparte y nunca toca `dk_orders.status`. Un pedido puede estar «Preparando + Pagado» o «Preparando + Pendiente» **sin cambiar nada en la base**.

### 1.3 Pagos: las 10 preguntas
| # | Pregunta | Respuesta (hoy) |
|---|---|---|
| 1 | ¿Dónde se registra? | **Solo en Clientes**: el detalle (botón y Cuenta → «Registrar pago») y el menú de la fila. Llama al RPC `dk_register_payment`. **Pedidos y Cocina no muestran nada del pago** |
| 2 | ¿Dónde se guarda? | En `dk_order_payments`: `order_id`, `amount`, `method` (texto libre), `note`, `created_by`, `created_at`, `kitchen_id`. No hay tabla de cuentas por cobrar: `dk_receivables` es una vista |
| 3 | ¿Quién puede modificarlo? | **Nadie.** No hay políticas de UPDATE ni DELETE, y el RPC rechaza montos ≤ 0 |
| 4 | ¿Quién puede registrarlo? | Quien tenga `receivables.collect` en la cuenta activa: Admin, Gerente, Caja y el Super Admin. El RPC es `security definer`; valida el permiso, que el pedido sea de la cuenta, que no esté cancelado y que 0 < monto ≤ saldo. Bloquea la fila del pedido |
| 5 | ¿Qué estados existen? | **Ninguno.** No hay «pendiente de verificación», «validado» ni «rechazado». Registrar el pago **es** la validación |
| 6 | ¿Cómo afecta al pedido? | No lo afecta. Su estado operativo no cambia. `dk_orders.payment_method` es el método «acordado» y **ninguna pantalla lo llena**; solo Despacho lo muestra |
| 7 | ¿Cómo afecta a Finanzas? | No existe Finanzas. Afecta el saldo del cliente (`dk_customers_with_stats`), la cartera de Inicio y la de Clientes |
| 8 | ¿Hay trazabilidad? | Solo `created_by` y `created_at` de la fila. **`dk_order_payments` no tiene trigger de auditoría**, así que los pagos no aparecen en Configuración → Actividad |
| 9 | ¿Hay historial? | Sí, por cliente: «Pagos recibidos» en Clientes. **No lo hay por pedido** en ninguna pantalla |
| 10 | ¿Y si un pago se registra mal? | **No hay forma de corregirlo.** El comentario de la tabla prevé una reversa con monto negativo, pero el RPC la rechaza y no hay otra vía. Si el pedido se cancela, los pagos quedan y no hay reembolso |

Hay tres hallazgos más:
- **`dk_orders.due_date` nunca se llena**: no tiene permiso de columna y ningún RPC lo escribe. Por eso «vencido» nunca se activa (lo usan Inicio y Clientes).
- **La vista `dk_receivables` usa `security_invoker`**: además de `receivables.view`, exige `orders.view` y `customers.view`.
- Hoy, de 11 pedidos válidos, solo 2 tienen pagos (dato de la ADR 0030). **La cartera está inflada porque el pago no se registra donde ocurre la operación.**

### 1.4 Navegación y roles
- **El menú tiene 8 ítems de operación y 2 de administración:** Inicio · Pedidos · Cocina · Catálogo · Abastecimiento · Clientes · Personal · Insights | Usuarios · Configuración.
  - En escritorio es un riel de iconos; en el celular, un cajón con descripciones.
- **Roles del sistema:**
  - **ADMIN:** todo lo de la cuenta.
  - **GERENTE:** igual, sin equipo ni auditoría.
  - **CAJA:** pedidos, despacho, clientes y cobros.
  - **COCINA:** preparar y priorizar.
  - **INVENTARIO.**
  - **DOMICILIARIO:** solo despacho.
- **Super Admin** es el dueño de la organización y tiene todos los permisos en sus cuentas. **Global Admin** es la plataforma y usa otro portal (`admin.quanela.com`). Este cambio no lo toca.
- **Inicio por rol:**
  - COCINA → Cocina;
  - CAJA y DOMICILIARIO → Pedidos;
  - el resto → Inicio.
- **Productos e inventario:**
  - **Catálogo** = platos, menú del día y recetas, con `menus.view`.
  - **Abastecimiento** = stock, compras y proveedores, con `inventory`, `purchasing` y `suppliers`.
  - La receta conecta el plato con los insumos, **pero solo en una dirección**:
    - desde un insumo no se ve en qué platos se usa;
    - desde una fila de la receta no se llega al insumo.
- **Código muerto:**
  - `src/modules/reports`, que nadie importa;
  - `getOrderByNumber`, `useUpdateOrder`, `PREP_STATUSES` y `ORDER_STATUS_SEQUENCE`.

### 1.5 Rendimiento
| Dónde | Hoy | Riesgo al crecer |
|---|---|---|
| Mover un pedido de 5 platos a «Listo» | Unos 10 RPC por ítem, en serie, y **cada uno vuelve a pedir** toda la caché `['orders']` y 3 de stock | Lentitud en hora pico |
| Lista, «Cargar más» | Sube `limit` desde el offset 0: cada clic vuelve a traer todo | Crece con cada página |
| El detalle del pedido | Vuelve a pedir un pedido que ya está en caché y carga **todos** los productos aunque no edites | Consultas de más |
| El tablero | Todos los pedidos abiertos, sin límite. Los borradores viejos se acumulan | Moderado: los abiertos son pocos por naturaleza |
| Tiempo real | No hay: todo se refresca por intervalos (15 s y 30 s) | Hasta 15 s de retraso entre caja y cocina |

---

## 2. Clasificación
| | Qué |
|---|---|
| **Mantener** | La capa de datos del pedido. Las transiciones y sus permisos. El tablero (`OrderBoard`). Toda la experiencia de Cocina (voz, detenidos, IA, tiempos, horario, tamaño grande). Despacho y domiciliarios. La Lista con búsqueda en la base. `dk_register_payment` y su RLS. Insights, Clientes, Configuración, Usuarios y Personal |
| **Unificar** | Pedidos y Cocina en **una pantalla con vistas**. Un solo encabezado, KPI, buscador y menú. Un solo vocabulario de estado. Un solo conjunto de «etapas de cocina». Un solo confirmar y cancelar (con motivo). Un solo «Entregado». Una sola forma de abrir un pedido |
| **Reubicar** | El **registro del pago** pasa al pedido. Clientes lo conserva |
| **Separar** | Lo que no es operar el día se queda fuera del Centro de operaciones: el análisis (Insights), la cartera por cliente (Clientes), el horario y los tiempos objetivo (se quedan en la configuración de cocina, a la que se llega desde la vista Cocina) |
| **Mejorar** | El encabezado del pedido muestra las dos dimensiones (operativa y de pago). Las tarjetas y la Lista llevan la insignia de pago. La Lista filtra por pago. Se navega del insumo a sus platos y de la receta al insumo. Se refresca una sola vez por movimiento. La paginación de la Lista se corrige y se quita el código muerto |
| **Futuro** | Finanzas (gastos y caja). Tiempo real (Supabase Realtime). Un RPC que avance todos los ítems de un pedido en una transacción. Las entregas fallidas como acción. Los plazos de crédito (`due_date`). Los reembolsos al cancelar. Un método de pago como catálogo y no como texto |

---

## 3. Propuesta

### 3.1 Centro de operaciones: una pantalla, varias vistas del mismo pedido
```
Centro de operaciones                                    [Buscar] [+ Nuevo pedido] [⋯]
Por confirmar 3 · En cocina 5 · Listos 2 · En ruta 1 · Entregados hoy 18 · Pago pendiente 4
──────────────────────────────────────────────────────────────────────────────
 Tablero   Cocina   Despacho   Lista
```
- **Ruta:** `/operations?view=board|kitchen|dispatch|list`, y `/operations/:orderId` abre el pedido sobre cualquier vista.
  - Las rutas viejas (`/orders`, `/orders/:id`, `/kitchen`, `/kitchen?order=`, `/delivery`) **redirigen** a la nueva y conservan la vista, los filtros y el pedido abierto.
  - Todos los enlaces internos se actualizan: Inicio, alertas, Copilot, Clientes, Insights y las pruebas.
- **Menú:** **«Operación»** reemplaza a «Pedidos» y «Cocina» (descripción: «Centro de operaciones: pedidos, cocina y despacho»). Hay 7 ítems en lugar de 8.
- **Vistas según permiso.** Con una sola vista no hay pestañas, y esa persona ve exactamente lo que ve hoy.

  | Vista | Permiso | Qué es |
  |---|---|---|
  | **Tablero** | `orders.view` | El flujo completo, de «Por confirmar» a «En ruta» (lo de hoy) |
  | **Cocina** | `kitchen.view` | La pantalla de preparación de hoy, igual: voz, detenidos, IA, tamaño grande, «Tiempos» como sub-vista y configuración de cocina |
  | **Despacho** | `dispatch.view` o `dispatch.assign` | Listos para salir y en ruta (lo de hoy) |
  | **Lista** | `orders.view` | Todos, también entregados y cancelados, con búsqueda en la base |

- **La línea de cifras es la navegación rápida:**
  - cada cifra abre la vista o la Lista ya filtrada. Por ejemplo, «Entregados hoy» abre la Lista con entregados de hoy, y «Pago pendiente» la abre con pago pendiente;
  - se muestra solo lo que el rol puede ver;
  - no son gráficas ni tendencias: **operar, no analizar**.
- **Inicio por rol:**
  - **COCINA:** la vista Cocina, sin pestañas.
  - **DOMICILIARIO:** Despacho, sin pestañas.
  - **CAJA:** el Tablero.
  - **El resto:** Inicio.
- **Lo que no cambia:** las columnas del tablero, el arrastrar y soltar, los botones de un toque, los atajos `N` y `/`, el sonido del pedido nuevo y el alcance de acciones de Cocina.

### 3.2 El pedido como unidad central
El detalle (cajón) se reordena para responder primero lo urgente:
```
Pedido #1042                                   [Preparando]  [Pago pendiente]
Juan Pérez · 300 123 4567 · Saldo e historial →            $85.000
──────────────────────────────────────────────────────────────────────────
[Acción principal: Marcar listo]   [Prioridad]   [Cancelar]
Pago        Pendiente · $85.000 por cobrar           [Registrar pago]
Cocina      Hamburguesa ✓  ·  Papas ●  ·  Bebida ○
Cliente · Entrega · Platos y totales · Historial de estados · Insumos reservados
```
- **Dos insignias, dos dimensiones.** El estado operativo y el estado del pago nunca se mezclan.
- **Un solo vocabulario de estado** (D3).
- **Las acciones son las de hoy**, con sus permisos. Confirmar y cancelar se hacen igual desde el tablero y desde el detalle: cancelar siempre pide motivo.
- **Contexto:**
  - cliente → su detalle, y «Volver» regresa al pedido;
  - plato → receta → insumo → stock;
  - pago → historial de pagos del pedido.

### 3.3 El pago dentro del pedido (sin una segunda fuente de verdad)
- **El estado del pago se calcula, no se guarda:** la consulta del pedido trae sus pagos (`dk_order_payments(amount, method, created_at, created_by)`).

  | Pagado | Insignia |
  |---|---|
  | = total | **Pagado** |
  | 0 < pagado < total | **Pago parcial** · $X por cobrar |
  | 0 | **Pago pendiente** |
  | Pedido cancelado | No se muestra |

- **Solo lo ve quien tiene `receivables.view`.** La RLS ya devuelve vacíos los pagos a quien no lo tiene, y la interfaz no muestra «pendiente» por error: sin permiso, no hay insignia.
- **«Registrar pago» en línea, sin modal, solo con `receivables.collect`:**
  1. Lleva el monto ya lleno con el saldo.
  2. Ofrece elegir el método con un toque: Efectivo, Transferencia, Tarjeta u Otro (sigue siendo texto libre, como hoy).
  3. Tiene una nota opcional y un botón «Confirmar pago».
  4. Llama al **mismo RPC `dk_register_payment`**, con todas sus validaciones de base, y refresca Pedidos, Clientes e Inicio.
- **Pagado:** «✓ Pagado» y «Ver detalle», que lista los pagos (monto, método, quién y cuándo).
- **Tarjetas del tablero y de Despacho:** una insignia pequeña («Pagado» o «Pendiente») solo para quien tenga `receivables.view`. El domiciliario no la ve: no tiene ese permiso.
- **Lista:** una columna «Pago» y un filtro Todos · Pagados · Pendientes. Requiere ampliar `dk_order_search` (el mismo RPC, que pasa a devolver lo pagado). Solo filtra por pago si quien consulta tiene `receivables.view`.
- **Corrección de errores (D5):** registrar desde la operación hace más probable equivocarse, y hoy un error no se puede deshacer. Se propone **«Anular pago»**:
  1. Inserta un movimiento **negativo** que anula uno anterior, exactamente como lo prevé el diseño original de la tabla. Nada se borra ni se edita.
  2. Exige `receivables.collect` y un motivo.
  3. Queda en la auditoría.
- **Trazabilidad (D6):** un trigger de auditoría en `dk_order_payments`, con el mismo `dk_audit_row` que ya usa `dk_orders`, para que cada pago y cada anulación aparezcan en Configuración → Actividad.
- **Nombre del botón (D4):** en Quanela no existe un paso de verificación aparte. Registrar el pago **es** validarlo. Se recomienda «Registrar pago», el mismo nombre que en Clientes: un concepto, un nombre.

### 3.4 Contexto entre módulos
| Desde | Hacia | Estado |
|---|---|---|
| Pedido → cliente → historial | `/customers/:id`, con «Volver» al pedido | Existe; el «Volver» es nuevo |
| Pedido → plato → receta | `/recipes/:id` | Existe |
| **Receta → insumo** | `/supply/stock/:id` (con `inventory.view`) | **Nuevo** |
| **Insumo → «Se usa en»** | Los platos cuya receta activa lo usa, con enlace a cada receta | **Nuevo.** Es una lectura de `dk_recipe_items`, que ya existe |
| Pedido → pago → historial del pedido | En el mismo cajón | **Nuevo** (3.3) |
| Cliente → nuevo pedido | Existe (ADR 0030) | — |
| Plato → ventas | Insights (ADR 0030) | — |
| Pago → Finanzas | — | **Futuro** (la ADR de Finanzas) |

### 3.5 Jerarquía y menú
| Pregunta del negocio | Ítem del menú | Grupo que analizaste | Decisión |
|---|---|---|---|
| ¿Qué pasa hoy? | **Inicio** | — | Se mantiene (ADR 0030) |
| ¿Qué tengo que operar ahora? | **Operación** | Pedidos + Cocina | **Se unen:** son el mismo proceso sobre el mismo pedido |
| ¿Quiénes son mis clientes? | **Clientes** | Clientes + actividad | Ya están juntos (cartera, pagos e historial) |
| ¿Qué vendo? | **Catálogo** | Productos + Inventario | **Siguen separados pero conectados (D2).** Los usan personas y momentos distintos: el menú del día lo arma cocina; las compras y el stock, inventario. La receta los une y ahora se navega en las dos direcciones |
| ¿Qué recursos consumo? | **Abastecimiento** | | |
| ¿Quién trabaja y cuándo? | **Personal** | — | Se mantiene |
| ¿Cómo funciona el negocio? | **Insights** | — | Se mantiene |
| ¿Cómo está el dinero? | **Finanzas** | Finanzas + pagos | **No en esta ADR.** Hoy sería una copia de la cartera. Con los pagos registrados en cada pedido (3.3) ya tendrá datos reales. Va en la próxima ADR |
| ¿Quién entra y con qué permisos? / ¿Cómo funciona el sistema? | **Usuarios · Configuración** | Configuración + administración | Se mantienen (ADR 0026); son de administración y van debajo |

**El menú queda así:** Inicio · **Operación** · Clientes · Catálogo · Abastecimiento · Personal · Insights | Usuarios · Configuración.

### 3.6 Experiencia según el rol (sin tocar permisos)
| Rol | Entra a | Ve en Operación | Pago |
|---|---|---|---|
| **Super Admin** (el dueño) | Inicio | Las 4 vistas | Ve y registra (y anula, con D5) |
| **Admin y Gerente** | Inicio | Las 4 vistas | Ve y registra |
| **Caja** | Tablero | Tablero, Cocina, Despacho y Lista | Ve y registra |
| **Cocina** | Vista Cocina | Solo Cocina | No lo ve |
| **Domiciliario** | Despacho | Solo Despacho, sus entregas | No lo ve |
| **Inventario** | Inicio | No tiene Operación | — |
| **Global Admin** | Su portal | Sin cambios | — |

### 3.7 Rendimiento y crecimiento
- **Al mover un pedido entre etapas,** los RPC por ítem siguen igual (la lógica no cambia), pero **se refresca una sola vez al final** en lugar de una vez por ítem.
- **Lista:** «Cargar más» pide la página siguiente con `offset`.
- **Detalle del pedido:**
  - usa el pedido que ya está en caché como primer dato;
  - carga los productos solo cuando se va a editar (NUEVO con `orders.edit`).
- **Pagos en la consulta del pedido:** viajan en la misma consulta (relación anidada). No es una consulta por pedido.
- **Lista con filtro de pago:** se calcula con un agregado en el RPC, apoyado en el índice `(order_id, created_at)` que ya existe.

---

## 4. Cambios en la base (solo con D5 y D6)
| Migración | Qué | Seguridad |
|---|---|---|
| `dk_order_search` (ampliar) | Devuelve `paid` y acepta `p_payment` (`all`, `paid` o `pending`). Sin `receivables.view` lo ignora y no devuelve montos | La misma firma más un parámetro opcional y el mismo `dk_can` |
| **D5** `dk_void_payment(p_payment_id, p_reason)` | Inserta un monto negativo igual al pago, con su `note` y un enlace a la fila original. Un pago no se puede anular dos veces | `security definer`, `receivables.collect`, `dk_assert_in_active_kitchen` y bloqueo de la fila del pedido. La tabla sigue sin UPDATE ni DELETE |
| **D6** trigger de auditoría en `dk_order_payments` | `dk_audit_row`, como en `dk_orders` | Solo agrega; no cambia la RLS |

Cada uno tiene su suite SQL: permisos, cuenta ajena, doble anulación y saldo resultante.

## 5. Pruebas
- **Vitest:**
  - Vistas según el rol:
    - Cocina sola, sin pestañas;
    - Domiciliario solo Despacho;
    - Caja las 4.
  - Las redirecciones de rutas viejas, que conservan la vista y el pedido.
  - Un solo vocabulario de estado.
  - Las insignias de pago según lo pagado y el permiso.
  - «Registrar pago» en línea: monto prellenado, método y permiso.
  - El filtro de pago en la Lista.
  - «Anular pago».
  - Insumo → «Se usa en» y receta → insumo.
  - Una sola actualización por movimiento.
  - El contrato de la ADR 0029.
- **Resto:**
  - SQL: todas las suites más las nuevas;
  - `tsc`, `oxlint` y los dos builds;
  - en el navegador con tu sesión: el recorrido del criterio de éxito en escritorio y celular, como Admin, Caja, Cocina y Domiciliario.

## 6. Futuro (requiere datos o backend que no existen; no se simula)
| Mejora | Qué falta |
|---|---|
| **Finanzas** (caja, gastos, utilidad) | La próxima ADR. Esta ya deja los cobros registrados en el pedido |
| **Tiempo real** entre caja y cocina | Supabase Realtime y cuidar su costo. Hoy son 15 s |
| **Avanzar el pedido completo en una transacción** | Un RPC por pedido en lugar de uno por ítem |
| **Entrega fallida** como acción | Definir qué pasa con el pedido y el cobro |
| **Plazos de crédito** (`due_date`) | Una regla de negocio: quién fija el plazo y cuánto. Hasta entonces, «vencido» siempre vale 0 |
| **Reembolso al cancelar un pedido pagado** | Decidir la política; con D5 se puede anular el pago a mano |
| **Métodos de pago como catálogo** (para conciliar en Finanzas) | Una tabla de métodos por cuenta |
| **Borradores viejos** fuera del tablero | Decidir cuándo un borrador se da por perdido |

## 7. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Nombre y ruta | Menú «**Operación**», título «**Centro de operaciones**», ruta **`/operations`** con redirecciones desde las viejas |
| **D2** | Productos + Inventario | **No unir.** Conectarlos en las dos direcciones (3.4) |
| **D3** | Vocabulario de estado | El del tablero, que ya es operativo: **Por confirmar · En cola · Preparando · Listo · En ruta · Entregado · Cancelado** |
| **D4** | Nombre del botón | **«Registrar pago»**, igual que en Clientes. En Quanela registrarlo es validarlo |
| **D5** | Anular un pago | **Sí**, como movimiento negativo con motivo. Sin esto, un error en hora pico queda para siempre |
| **D6** | Auditoría de pagos | **Sí**, con el trigger estándar |
| **D7** | Finanzas | **En la ADR siguiente**, sobre los cobros que esta deja registrados |

## 8. Orden de ejecución
| Fase | Qué |
|---|---|
| 1 | **Centro de operaciones:** la ruta `/operations` con sus 4 vistas, encabezado y cifras compartidos, redirecciones, menú, Inicio por rol, etiquetas de Copilot y enlaces internos |
| 2 | **El pedido como unidad:** un solo vocabulario de estado; las «etapas de cocina» en un solo lugar; un solo confirmar, cancelar y entregar; el detalle reordenado con las dos insignias |
| 3 | **Pago:** la base (`dk_order_search`; D5 y D6 si se aprueban) con sus suites SQL; después, la sección de pago en el pedido, el registro en línea, las insignias en tarjetas y Lista, y el filtro |
| 4 | **Contexto:** receta → insumo, insumo → «Se usa en» y «Volver» al pedido |
| 5 | **Rendimiento:** una sola actualización por movimiento, `offset` en la Lista, el detalle desde la caché, los productos bajo demanda y quitar el código muerto |
| 6 | **Validación:** pruebas, `tsc`, `oxlint`, builds, SQL, y revisión de RBAC y RLS |
| 7 | **Documentación:** esta ADR con resultados y la arquitectura |

## 9. Qué necesito de ti
1. **Aprobar esta ADR** con D1 a D7, confirmadas o corregidas.
2. **Iniciar sesión** en la vista previa al final, para recorrer el flujo con varios roles.

## 10. Resultados (2026-10-06)

### 10.1 Qué cambió
| Fase | Hecho |
|---|---|
| 1 | **Centro de operaciones** en `src/modules/operations`: `OperationsPage`, `OperationsShell`, `OperationsFigures`, `useOperations`, `lib/views.ts` y `OperationsRedirect`. «Operación» reemplaza a Pedidos y Cocina en el rail, y el menú queda en 7 ítems. Se eliminaron `OrdersPage` y `KitchenPage`; Cocina vive en `kitchen/views/KitchenView.tsx` sin perder nada. Se actualizaron Inicio, las alertas, Copilot y la tarjeta de bienvenida |
| 2 | **Un solo vocabulario de estado**, que incluye la etiqueta del ítem «Preparando». `KITCHEN_STAGES` está definido una sola vez. `OrderBuilder` ya no tiene diálogos propios: el detalle confirma y cancela desde su barra de acciones, y «Nuevo pedido» usa los mismos diálogos. Despacho usa `useOrderActions` (un solo «Entregar»). En la Lista, el estado es una fila de chips, uno por estado |
| 3 | La migración `20261006100000_dk_order_payments_operations.sql` agrega `voids_payment_id` (con índice único y regla de signo), `dk_void_payment`, el trigger de auditoría con su clasificación y `dk_order_search(p_payment)`. En la interfaz: `PaymentBadge` y `PaymentCard` en el detalle, la marca «Pagado / Por cobrar» en las tarjetas del tablero y de Despacho, la columna y el filtro de pago en la Lista, y la cifra «Por cobrar» |
| 4 | Receta → insumo, con el enlace «Ver en Stock». Insumo → «Se usa en». Abastecimiento muestra «Volver» cuando se llega desde una receta o desde Insights. Desde el pedido, «Volver» dice «Pedido» |
| 5 | Mover un pedido entre etapas refresca una sola vez. La Lista pagina con `offset` (`useOrderSearchPages`). El detalle usa el pedido en caché. Los platos solo se cargan al editar. Se eliminaron `getOrderByNumber`, `updateOrder`/`useUpdateOrder`, `PREP_STATUSES`, `ORDER_STATUS_SEQUENCE` y el módulo `src/modules/reports`, que nadie usaba |

### 10.2 Ajustes durante la ejecución
| Ajuste | Por qué |
|---|---|
| El rol **Cocina** ve las vistas Tablero, Cocina y Lista. **Entra a Cocina** | Ya tenía `orders.view` (para abrir el detalle). Los permisos no se tocan. Un rol que solo prepara ve únicamente Cocina, sin pestañas |
| La cifra y el filtro dicen **«Por cobrar»** | Es más corto y operativo que «Pago pendiente» en la línea de cifras. Las insignias del pedido siguen diciendo Pagado, Pago parcial y Pago pendiente. «Por cobrar» no se pinta de rojo: un pedido abierto sin pagar es normal |
| El enlace de Inicio «Pedidos por confirmar» no filtraba | La Lista no conocía `status=NUEVO`. Ahora cada estado es un filtro |
| `KitchenLink` en la receta y en la ficha del insumo pasa `state.from` | Para que «Volver» regrese al lugar de origen |

### 10.3 Revisión de RBAC, RLS y aislamiento
- **Ningún permiso cambió.**
  - Ver el pago exige `receivables.view`, que la RLS de `dk_order_payments` ya aplicaba.
  - Registrar y anular exigen `receivables.collect`.
  - Anular un pago de otra cuenta se rechaza con `dk_assert_in_active_kitchen`.
- **El registro de pagos sigue siendo solo de inserción:**
  - no hay políticas de INSERT, UPDATE ni DELETE;
  - un movimiento negativo solo puede ser una anulación;
  - un pago se anula una sola vez, y una anulación no se anula.
- **Sin `receivables.view` no hay datos falsos:**
  - la interfaz no muestra insignias de pago;
  - el filtro de pago se ignora tanto en la base como en la dirección.

### 10.4 Validación
| Prueba | Resultado |
|---|---|
| Vitest | **449/449**: 39 nuevas (10 archivos de prueba nuevos y la prueba de Receta ampliada) |
| SQL | **803/803**, con la suite nueva `order_payments` (24) |
| `tsc` | limpio |
| oxlint | 14 avisos (antes 16) |
| Builds de la app y del portal | pasan |
| Vista previa | compila y carga sin errores |

**Pendiente:** el recorrido en el navegador con sesión, con los roles Admin, Caja, Cocina y Domiciliario, en escritorio y celular.

