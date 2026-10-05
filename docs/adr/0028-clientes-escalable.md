# ADR 0028: Clientes como centro de gestión, escalable

## Estado
**Aprobada (2026-10-05) con D1–D6 e implementada** (resultados en la sección 8). Falta la revisión visual con sesión.

**Reglas:**
- Código y URL en inglés; textos en español.
- La marca es **Quanela**.
- El manual no se toca.
- **No se inventan datos ni métricas.**
- No cambia la lógica de negocio, RBAC, la RLS ni el tenant.

---

## 1. Auditoría (2026-10-05)

### 1.1 El módulo hoy
| Pieza | Qué hace | Problema |
|---|---|---|
| `CustomersPage` (`/customers`) | Grilla de **tarjetas**, 4 indicadores y «Actividad reciente» (últimos 8 pagos) | Descarga **todos** los clientes (`dk_customers`, sin límite) y **todas** las cuentas por cobrar (`dk_receivables`), y filtra y busca **en el navegador**. Con 5.000 clientes es lento y pesado |
| Búsqueda | Nombre o teléfono, en el navegador | No llega a la base |
| Filtros | Todos · Con saldo · Vencidos | En el navegador |
| Orden y paginación | Solo alfabético; **no hay paginación** | — |
| `CustomerDetailPage` (`/customers/:id`) | Encabezado, indicadores de saldo, «Actividad» (pedidos y pagos), editar y registrar pago | Descarga la lista **completa** de clientes para encontrar uno, y todas las cuentas por cobrar |
| Acciones existentes | Crear y editar (`CustomerFormModal`), registrar pago (`RegisterPaymentModal`, RPC `dk_register_payment`), ver pedidos (`useOrderSearch` por cliente, límite 100) y el detalle de un pedido (`/orders/:id`) | — |

### 1.2 Datos que existen (verificados en la base)
| Dato | Fuente | Disponible |
|---|---|---|
| Nombre, teléfono, dirección, notas, fecha de registro | `dk_customers` (`full_name`, `phone`, `address`, `notes`, `created_at`; también `whatsapp_id`) | Sí |
| **Email, identificación, código de cliente** | — | **No existen.** No se buscan ni se muestran |
| **Estado activo/inactivo** | — | **No existe columna.** Se puede **derivar** de la actividad (D2) |
| Pedidos, total comprado y último pedido | `dk_orders` por `customer_id` (sin CANCELADOS) | Sí |
| Saldo pendiente y vencido | Misma regla que `dk_receivables`: `total` − pagos (`dk_order_payments`), sin CANCELADOS; vencido = `due_date` < hoy | Sí |
| Pagos por cliente | `dk_order_payments` → `dk_orders.customer_id` | Sí |

**Volumen real hoy:** 6 clientes en una cuenta. El diseño tiene que funcionar igual con 5.000 o más.

### 1.3 Seguridad e índices
- **RLS:**
  - `dk_customers`: con `customers.view` en la cuenta activa (y el domiciliario solo ve a sus clientes);
  - `dk_receivables`: con `receivables.view`.
- **Índices:**
  - **No hay índice de pedidos por cliente**: los totales por cliente recorren los pedidos de toda la cuenta;
  - tampoco hay índice para ordenar por nombre.

## 2. Diseño

### 2.1 Pantalla principal (`/customers`)
```
Clientes                                                        [+ Nuevo cliente]
Gestiona y consulta los clientes de tu negocio.
┌ Total clientes ┬ Activos (90 días) ┬ Con deuda ┬ Saldo pendiente (vencido $X) ┐   ← UNA franja
[🔍 Buscar por nombre, teléfono o dirección…]
[Todos] [Activos] [Inactivos] [Con deuda] [Sin deuda] [Vencidos]   [Más filtros ▾]
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Cliente ▲   Contacto       Pedidos  Total comprado  Saldo   Último pedido  Estado  ⋯ │
│ Juan Pérez  300 123 4567      24      $1.240.000    $80.000  Hoy          Activo   │
└──────────────────────────────────────────────────────────────────────────────────┘
Mostrando 1–25 de 1.284                                     [‹] Página 1 de 52 [›]
Últimos pagos (compacto)
```
- **Búsqueda en la base:**
  - por nombre, teléfono (ignora espacios y guiones) y dirección;
  - espera 300 ms tras escribir;
  - siempre combinada con los filtros.
- **Filtros (rápidos):** Todos · Activos · Inactivos · Con deuda · Sin deuda · Vencidos. Activo e inactivo según D2.
- **«Más filtros»:** registrado desde/hasta, pedidos mínimos y saldo desde/hasta (solo con permiso de cartera).
- **Orden** por cliente, pedidos, total comprado, saldo, último pedido o fecha de registro, con la flecha en la columna activa.
  - **Por defecto:** saldo descendente si puedes ver la cartera; si no, el último pedido.
- **Paginación** de 25 por página en la base, con el total de resultados.
- **Saldo:**
  - con deuda, en texto claro con fuente semibold;
  - vencido, con un **badge «Vencido» discreto** (ámbar suave);
  - $0 en gris.
  - Sin filas de colores.
- **Acciones por fila** (solo las que existen): Ver cliente · Editar · Ver pedidos · Registrar pago (con saldo y el permiso). La fila entera abre el cliente.
- **Responsive:**
  - en `md` o más, la tabla;
  - por debajo, una **lista compacta**: nombre, teléfono, saldo y último pedido en dos líneas;
  - la página nunca se desplaza en horizontal.
- **Estados:**

  | Estado | Qué se ve |
  |---|---|
  | Cargando | Esqueleto de filas de la misma altura (sin saltos) |
  | Sin clientes | «No hay clientes todavía. Agrega tu primer cliente para comenzar.» |
  | Sin resultados | «No encontramos clientes que coincidan con tu búsqueda.» y «Quitar filtros» |
  | Error | `ErrorState` con «Reintentar» |

- **Clientes relevantes, sin un dashboard aparte:**
  - más pedidos y mayor compra: ordenando;
  - con deuda y vencidos: filtro;
  - sin actividad reciente: filtro «Inactivos».

### 2.2 Detalle (`/customers/:id`, la misma ruta)
```
‹ Clientes
Juan Pérez · Activo                                     [Editar] [Registrar pago]
300 123 4567 · Calle 10 #5-20 · Cliente desde 12 sep 2026
┌ Pedidos 24 ┬ Total comprado $1.240.000 ┬ Saldo pendiente $80.000 ┬ Último pedido Hoy ┐
─ Pedidos · Cuenta · Información ─        (subnavegación subrayada)
```
| Pestaña | Contenido |
|---|---|
| **Pedidos** | Los pedidos del cliente, paginados de 20 en 20 (número, fecha, estado, total y saldo). Al tocar uno se abre su detalle (`/orders/:id`), y «Volver» regresa al cliente |
| **Cuenta** | Saldo, vencido y pedidos con saldo, con «Registrar pago» en cada uno; además, el historial de pagos |
| **Información** | Nombre, teléfono, dirección, notas, WhatsApp vinculado (sí/no) y fecha de registro |

- **Consultas:** una RPC trae al cliente con sus totales. Ya no se descarga la lista completa.

### 2.3 Base de datos (sin borrar nada)
1. **`dk_customers_list(p_search, p_status, p_sort, p_dir, p_limit, p_offset, p_created_from, p_created_to, p_min_orders, p_min_balance, p_max_balance)` → jsonb `{ total, rows }`.**
   - Es `SECURITY DEFINER`, sobre la cuenta activa, y exige `customers.view`.
   - **Los totales de pedidos** solo vienen con `orders.view` o `receivables.view`.
   - **El saldo, el vencido y sus filtros** solo vienen con `receivables.view`, igual que hoy en `dk_receivables`.
   - Agrega una sola vez los pedidos y pagos de la cuenta (`group by customer_id`), sin N+1, y luego filtra, ordena y pagina en la base.
   - Límite de 100 por página.
2. **`dk_customers_summary()`:** total, activos, con deuda, saldo pendiente y vencido, con los mismos permisos.
3. **`dk_customer_detail(p_id)`:** el cliente y sus totales, para el encabezado del detalle.
4. **Índices:**
   - `dk_orders (kitchen_id, customer_id, created_at desc)`;
   - `dk_customers (kitchen_id, lower(full_name))`.
5. **No cambian** la RLS, las políticas, `dk_receivables` ni `dk_register_payment`.

### 2.4 Componentes (`src/modules/customers/`)
| Componente | Qué es |
|---|---|
| `CustomersPage` | Encabezado, franja de indicadores, búsqueda y filtros, tabla o lista, paginación y últimos pagos |
| `CustomerFilters` | Filtros rápidos y «Más filtros» |
| `CustomerTable` | Tabla ordenable en escritorio y lista compacta en el celular |
| `Pagination` | Componente compartido nuevo en `shared/ui` |
| `CustomerDetailPage` | Encabezado, indicadores y 3 pestañas: `CustomerOrders`, `CustomerAccount` y `CustomerInfo` |

**Se reutilizan:**
- `KpiStrip` (se mueve de Insights a `shared/ui`);
- `SortableHeader`;
- `SettingsSubNav`;
- `DataTable`, `Badge`, `EmptyState`, `ErrorState` y `Skeleton`;
- `CustomerFormModal` y `RegisterPaymentModal`.

## 3. Pruebas
- **SQL (suite nueva `customers_list`):**
  - búsqueda por nombre, por teléfono con espacios y por dirección;
  - cada filtro;
  - el orden por cada columna;
  - la paginación y el total;
  - totales iguales a la suma de los pedidos, sin CANCELADOS;
  - saldo y vencido iguales a `dk_receivables`;
  - sin `receivables.view` no hay saldo;
  - otra cuenta, bloqueada;
  - el anónimo, bloqueado;
  - rendimiento con **5.000 clientes y 20.000 pedidos sintéticos** dentro de la transacción revertida, verificando que cada página tarde menos de 300 ms.
- **Vitest:**
  - búsqueda con espera (debounce);
  - filtros combinados;
  - orden y paginación;
  - los estados (cargando, sin clientes, sin resultados, error);
  - sin permiso de cartera no hay columna de saldo;
  - las pestañas del detalle.
- **Resto:** `tsc`, `oxlint`, ambos builds, todas las suites SQL, y el navegador con tu sesión a 1440, 1024, 768 y 390 px.

## 4. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Búsqueda | **Nombre, teléfono y dirección.** El email, la identificación y el código no existen en la base. Agregarlos sería otro cambio, si lo quieres |
| **D2** | «Activo» e «Inactivo» (no hay columna) | **Derivado y explicado en la interfaz:** **activo** si tuvo un pedido en los últimos 90 días; **inactivo** si no (incluye a quien nunca pidió). Sin cambios en la base |
| **D3** | Saldo | **Solo con `receivables.view`**, como hoy. Sin ese permiso no hay columna, filtros ni indicadores de deuda |
| **D4** | Detalle | **Página con 3 pestañas: Pedidos · Cuenta · Información.** «Actividad» se integra en Pedidos y en los pagos de Cuenta para no duplicar |
| **D5** | Actividad reciente | **Se conserva como «Últimos pagos», compacto, debajo de la tabla.** No es una card lateral |
| **D6** | Paginación | **25 por página, numerada** (más simple de entender que el scroll infinito) |

## 5. Riesgos
| Riesgo | Mitigación |
|---|---|
| Ordenar por total o saldo obliga a agregar los pedidos de toda la cuenta | Un solo `group by` con el índice nuevo; se mide con 20.000 pedidos en la suite |
| Búsqueda `ilike` con muchos clientes | Siempre acotada a la cuenta; con 5.000 filas es trivial. Si un día pasan de 50.000, se evalúa `pg_trgm` |
| Cambiar la página que usan los cajeros | Mismas acciones y mismos permisos; las pruebas cubren los dos perfiles |

## 6. Orden de ejecución
| Fase | Qué |
|---|---|
| 1 | Base: RPCs, índices y suite `customers_list` (con la prueba de carga) |
| 2 | `Pagination` y `KpiStrip` en `shared/ui` |
| 3 | `CustomersPage`: búsqueda, filtros, tabla, lista móvil, paginación y estados |
| 4 | `CustomerDetailPage` con 3 pestañas |
| 5 | Pruebas, `tsc`, `oxlint`, builds y navegador |
| 6 | Documentación: esta ADR con resultados y la arquitectura |

## 7. Qué necesito de ti
1. **Aprobar esta ADR**, con D1 a D6 confirmadas o corregidas.
2. **Iniciar sesión** en la vista previa para validarlo con datos reales.

## 8. Resultados (2026-10-05)

### 8.1 Base de datos (`20261005120000_dk_customers_list`, sin borrar nada)
| Pieza | Qué hace |
|---|---|
| `dk_customers_list(...)` | Búsqueda, filtros, orden y paginación en la base, sobre la cuenta activa. Las cifras y los saldos aparecen según el permiso; sin él, las claves no vienen (no son cero) |
| `dk_customers_summary()` | Total, activos, con deuda, saldo pendiente, vencido y cuántos tienen saldo vencido |
| `dk_customer_detail(id)` | Un cliente con sus cifras |
| `dk_customers_with_stats(...)` | Función interna sin acceso desde la API: agrega **una vez** los pedidos y pagos de la cuenta |
| Índices | `dk_orders (kitchen_id, customer_id, created_at desc)` y `dk_customers (kitchen_id, lower(full_name))` |

La RLS, `dk_receivables` y `dk_register_payment` no cambian.

**Carga medida en la base remota** (5.000 clientes y 20.000 pedidos, en una transacción revertida):

| Consulta | Tiempo |
|---|---|
| Primera página | **177 ms** |
| Búsqueda por teléfono | **56 ms** |
| Página 101, filtrada por deuda y ordenada por total | **69 ms** |

### 8.2 Interfaz
- **`/customers`:**
  - encabezado y «Nuevo cliente»;
  - franja de 4 indicadores (cada uno filtra al tocarlo);
  - búsqueda con espera de 300 ms;
  - filtros rápidos y «Más filtros» (registro desde/hasta, pedidos mínimos, saldo desde/hasta);
  - tabla ordenable con Cliente, Contacto (con indicador de WhatsApp), Pedidos, Total comprado, Saldo (con «Vencido» discreto), Último pedido, Estado y el menú de acciones;
  - en el celular, una lista compacta;
  - paginación de 25 («Mostrando 1–25 de N»);
  - «Últimos pagos», compacto;
  - los estados: cargando, sin clientes, sin resultados y error.
- **Acciones:**
  - Ver cliente, Editar (carga el cliente completo solo al abrir) y Ver pedidos;
  - Registrar pago (carga solo los pedidos con saldo de ese cliente, filtrados en la base).
- **`/customers/:id`:**
  - encabezado con el estado y «Saldo vencido»;
  - Editar y Registrar pago;
  - indicadores (pedidos, total comprado, saldo y último pedido);
  - pestañas **Pedidos** (de 20 en 20), **Cuenta** (pedidos con saldo, cada uno con «Registrar pago», y los pagos recibidos) e **Información**;
  - **el pedido se abre en `OrderDetailDrawer` sobre la misma página**, así que el cliente no se pierde.
- **Componentes:**
  - **compartidos nuevos:** `shared/ui/Pagination`;
  - **movidos de Insights a `shared/ui`:** `KpiStrip` y `SortableHeader`.
- **Borrados (ya no se usaban):** `CustomerCard`, `CustomerStatusBadge` y `lib/balance`.
- **Pagos:** un pago registrado ahora refresca también los clientes (`['customers']`).

### 8.3 Validación
| Prueba | Resultado |
|---|---|
| SQL | **779/779** (nueva `customers_list` 25/25) |
| Vitest | **367/367** (Clientes 7) |
| `tsc` | limpio |
| oxlint | 16 avisos, sin nuevos |
| Builds de la app y del portal | pasan |

**Pendiente:**
- **Revisión en el navegador:** con sesión, a 1440, 1024, 768 y 390 px.
- **Fuera de alcance:** el selector de clientes de «Nuevo pedido» (`NewOrderDrawer`, módulo de pedidos) todavía descarga todos los clientes con `useCustomers()`. Se puede pasar a la búsqueda en la base cuando lo pidas.
