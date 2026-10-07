# ADR 0040: Ficha 360° del cliente

## Estado
**Aprobada por el pedido e implementada (2026-10-06).** Resultados en la sección 4. El pedido pidió auditar, diseñar e implementar directamente; esta ADR deja constancia.

**Pedido:** que al abrir un cliente se vea en una sola ficha todo lo relevante:
- datos de contacto (correo validado, teléfono con país);
- preferencias (platos favoritos, ingredientes que le gustan y que no, preferencias alimentarias, recomendaciones, notas);
- direcciones (última, frecuentes y anteriores, sin perder historial);
- quejas e incidencias (como historial);
- el comportamiento de pedidos con datos reales;
- recomendaciones, con una estructura lista para automatizarlas después.

Además, buscar por nombre, teléfono o correo.

Reglas: sin romper ni cambiar pedidos, cocina, inventario ni menú; sin inventar datos; sin duplicar; sin borrar nada existente.

---

## 1. Auditoría

### 1.1 Lo que ya existe y se reutiliza
| Pieza | Qué trae |
|---|---|
| `dk_customers` | `full_name`, `phone` (E.164 desde la ADR 0039), `address` (una sola), `notes`, `whatsapp_id`, `created_at`, `updated_at`, `kitchen_id`. Restricción única «cuenta + teléfono» |
| `dk_customers_with_stats` | Pedidos, total comprado, último pedido, saldo y vencido, calculados de `dk_orders` (sin cancelados) y `dk_order_payments`. Lo usan la lista, el resumen, la ficha y las notificaciones |
| `dk_customer_detail(id)` / `dk_customers_list(...)` | La ficha y la lista paginada, con campos según el permiso (`orders.view` / `receivables.view`). La búsqueda ya compara los dígitos del teléfono |
| `dk_orders` → `dk_order_items` → `dk_products` | Historial real de pedidos y platos pedidos por cliente |
| `dk_products`, `dk_ingredients` | Catálogo de platos e insumos de la cuenta (las preferencias se relacionan con ellos) |
| Permisos `customers.view / create / edit / delete` | RLS por cuenta en `dk_customers`. ADMIN, GERENTE y CAJA los tienen todos; COCINA no ve clientes; el domiciliario solo ve los de sus entregas |
| `dk_audit_row()` | Auditoría genérica por trigger: cada cambio de una fila queda en la bitácora |
| UI | `CustomerDetailPage` (pestañas Pedidos, Cuenta, Información), `CustomerFormModal`, `CustomerTable`, `KpiStrip`, `SubNav`, `Section`, `Badge`, `PhoneInput`, `EmailInput`, `InfoTip`, `OrderPeekDrawer`, `NewOrderDrawer`, `RegisterPaymentModal` |

### 1.2 Lo que falta
| Necesidad | Hoy |
|---|---|
| Correo del cliente | No existe la columna |
| Estado del cliente | No hay un estado manual. «Activo» = pedido en los últimos 90 días (calculado), más los avisos de saldo y saldo vencido. **Se mantiene así**: es un dato real, no inventado |
| Historial de direcciones | Solo `dk_customers.address`, que **se sobrescribe**. Los pedidos **no guardan** a qué dirección fueron |
| Preferencias, quejas y recomendaciones | No existen |
| Comportamiento de pedidos | Faltan los platos más pedidos, la frecuencia y el detalle del último pedido. Los datos sí existen en `dk_orders` y `dk_order_items` |

### 1.3 Conflictos
- **`dk_customers.address` lo leen el pedido, el despacho, Copilot y n8n** (`customerAddress` sale de ahí). Si la dirección se moviera a otra tabla, se rompería todo eso. Por eso **se queda como «Última dirección de envío»** y el historial vive aparte, sincronizado por triggers.
- Como los pedidos no guardan la dirección, **no se puede saber a qué dirección fue cada pedido viejo**, ni deducir las «frecuentes» de los pedidos. Las frecuentes se marcan a mano. Guardar la dirección en el pedido cambiaría el flujo de pedidos: queda en «Futuro».
- `dk_customers_with_stats` alimenta varias funciones: **no se cambia su firma**. El correo se lee aparte.

## 2. Diseño

### 2.1 Datos (migración `dk_customer_360`)
| Entidad | Decisión |
|---|---|
| `dk_customers.email` | **Columna nueva** (opcional), en minúsculas y sin espacios por trigger, con `check` de formato. Buscable |
| `dk_customer_addresses` | Cada dirección del cliente, con su referencia, el nombre de quien recibe, las indicaciones, si es frecuente, la última vez que se usó y si está archivada. **Nunca se sobrescribe**: cambiar el texto crea otra fila.<br>Triggers:<br>• cuando `dk_customers.address` cambia (desde la app, n8n o el pedido), la dirección entra al historial (o se marca como usada ahora si ya estaba);<br>• «Usar como última» actualiza `dk_customers.address`.<br>Se cargan las direcciones que ya existen (backfill). Se archiva en vez de borrar |
| `dk_customer_preferences` | `kind` ∈ {plato favorito, ingrediente que le gusta, ingrediente que no le gusta, preferencia alimentaria}. Los platos y los insumos van **por id** (`dk_products`, `dk_ingredients`); el texto libre solo para lo que no está en el catálogo (por ejemplo, «Vegetariano» o un ingrediente que no se usa). Sin duplicados por cliente |
| `dk_customer_complaints` | Fecha, categoría, descripción, estado (Pendiente / En revisión / Resuelta), respuesta, fecha de resolución (automática al resolver), notas internas, el pedido (opcional, del mismo cliente) y quién la registró. **Sin borrado** (no hay política `delete`); los cambios quedan en la bitácora |
| `dk_customer_recommendations` | Título, plato (opcional), motivo, **origen** (`manual` hoy, `auto` reservado para el recomendador futuro), estado (activa o descartada) y `score` (para el futuro) |
| Notas generales | Se reutiliza **`dk_customers.notes`**: sin tabla nueva ni duplicado |
| `dk_customer_order_stats(id)` | Función de solo lectura: primer y último pedido (número, estado, total, fecha), pedidos en los últimos 90 días, frecuencia promedio (días entre pedidos, solo con 2 o más) y los 5 platos más pedidos (unidades y en cuántos pedidos). Todo de `dk_orders` y `dk_order_items`, sin cancelados. Pide `orders.view` |
| Búsqueda | `dk_customers_list` busca también por correo; el teléfono por dígitos (`300 111 2233`, `+57…`, `57…`) |
| Permisos y RLS | Las tablas nuevas siguen a `dk_customers`: leer con `customers.view`; crear y editar con `customers.edit`; nada se borra salvo las preferencias (`customers.edit`, con confirmación). Todo por cuenta (`kitchen_id = dk_current_kitchen_id()`), y el cliente debe ser de la misma cuenta. Auditoría con `dk_audit_row` |

### 2.2 Recomendaciones automáticas (preparado, sin IA)
La tabla ya distingue el origen (`manual` / `auto`) y tiene `score`. `dk_customer_order_stats` y las preferencias son las señales: historial, favoritos, gustos, frecuencia y platos comprados. Un futuro recomendador (función de la base o de IA) solo tiene que leer esas señales y escribir filas `auto`; la UI ya las muestra con su etiqueta. **No se implementa IA ahora.**

### 2.3 La ficha
- **Encabezado:** nombre; estado (Activo o Inactivo, saldo vencido, quejas abiertas); teléfono (llamar o WhatsApp), correo y «Cliente desde»; acciones (Editar, Registrar pago, Nuevo pedido, Registrar queja).
- **Cifras:** pedidos, total comprado, saldo y último pedido.
- **Pestañas:**
  - **Resumen**: tarjetas con contacto, última dirección, comportamiento, preferencias en etiquetas (lo que **no** le gusta, resaltado), quejas abiertas, recomendaciones y nota general (edición en línea);
  - **Pedidos** y **Cuenta**: las de hoy;
  - **Preferencias**, **Direcciones** y **Quejas**: la gestión completa, con formularios cortos en paneles o en línea, confirmación al quitar o archivar, y ⓘ en los campos que no son obvios.
- **Componentes:** `CustomerProfile` (el resumen), `CustomerContact`, `CustomerOrderSummary`, `CustomerPreferences`, `CustomerAddresses`, `CustomerComplaints`, `CustomerRecommendations` y `CustomerNotes`, en `src/modules/customers/components/profile/`. El formulario del cliente (`CustomerFormModal`) suma el correo.

## 3. Futuro (no se simula)
| Mejora | Qué falta |
|---|---|
| La dirección de cada pedido | Guardarla en el pedido (cambia el flujo de pedidos) |
| Direcciones frecuentes automáticas | Depende de lo anterior |
| Recomendaciones automáticas | El recomendador que escriba filas `auto` |
| Estado manual del cliente (bloqueado, VIP…) | Si el negocio lo pide |

## 4. Resultados (2026-10-06)

### Base (aplicadas)
- `20261006200000_dk_customer_360.sql`:
  - `dk_customers.email` con limpieza y `check`;
  - `dk_customer_addresses` con `dk_address_key`, el trigger desde `dk_customers.address`, el backfill, `dk_customer_address_save` y `_archive`;
  - `dk_customer_preferences`, `dk_customer_complaints` (con el guardián `dk_customer_complaint_guard`) y `dk_customer_recommendations`;
  - RLS en las cuatro; auditoría de quejas y direcciones;
  - `dk_customer_order_stats`, `dk_customer_preference_options` y `dk_catalog_item_in_account`;
  - `dk_customer_detail` y `dk_customers_list` con el correo.
- `20261006210000_dk_customer_profile_read.sql`: `dk_customer_profile(id)`, una lectura con los nombres resueltos.
- Datos: **la única dirección existente pasó al historial** como última dirección de envío. No se borró ni cambió nada más.

### Decisiones que salieron al implementar
- **CAJA no puede leer `dk_ingredients`** (es de inventario). Por eso:
  - la comprobación de cuenta del plato o insumo va en una función (`dk_catalog_item_in_account`);
  - las opciones para elegir y los nombres de la ficha salen de funciones que devuelven **solo el id y el nombre**.
  - Sin abrir el inventario a CAJA.
- **Las direcciones no se escriben directo** (no hay política de insert, update ni delete): solo por las funciones, que mantienen `dk_customers.address` en sincronía. Si una dirección viene muy corta o muy larga desde afuera (n8n), el trigger la omite del historial sin romper el guardado del cliente.
- **Cambiar el texto de una dirección crea otra fila**; editar la referencia, quién recibe o las indicaciones actualiza la misma.
- **Quejas:** lo reportado (cliente, texto, fecha, autor) es inmutable por trigger; al resolver se sellan la fecha y quién la cerró; el pedido debe ser del cliente; no hay `delete`; cada cambio queda en la bitácora.
- **Recomendaciones:** el usuario solo crea `source = 'manual'` (RLS); `auto` queda para el recomendador.
- **Nota general:** se reutiliza `dk_customers.notes` y se edita sola (`updateCustomerNotes`), sin tocar el resto del cliente.

### Frontend
- `components/profile/`: `CustomerProfile` (Resumen), `CustomerContact`, `CustomerOrderSummary`, `CustomerPreferences`, `CustomerAddresses`, `CustomerComplaints` (+ `NewComplaintDrawer`), `CustomerRecommendations` y `CustomerNotes`.
- `api/profile.ts`, `hooks/useCustomerProfile.ts`, `lib/profile.ts` y los tipos nuevos.
- `CustomerDetailPage`:
  - pestañas Resumen, Pedidos, Preferencias, Direcciones, Quejas (n) y Cuenta (se quitó «Información», que pasó a Contacto y Resumen);
  - insignia de quejas abiertas y «Registrar queja» en el encabezado.
- `CustomerFormModal`: correo (`EmailInput`) y «Dirección de envío» con ⓘ.
- Lista: muestra el correo y lo busca.
- Centro de ayuda: guía de Clientes y notas de versión; `dk-copilot` desplegada.

### Validación
- SQL **921/921**; la suite nueva `customer_360.sql` tiene **35** pruebas:
  - correo;
  - historial y sincronización de direcciones (nueva, misma con otro formato, muy corta desde afuera, usar como última, no archivar la actual, el texto cambiado es nueva, no se escribe directo);
  - preferencias por id, sin duplicados ni platos de texto;
  - quejas (sello al resolver, lo reportado no cambia, no se borran, pedido del cliente, bitácora);
  - recomendaciones manuales sí y automáticas no;
  - estadísticas reales sin cancelados;
  - búsqueda por correo y por teléfono con espacios;
  - la lectura de la ficha;
  - COCINA no lee ni escribe, y otra cuenta no puede.
- Vitest **554**: la ficha (pestañas, Resumen con datos reales, historial de direcciones, quejas y su registro) y la frecuencia.
- `tsc` sin errores; `oxlint` con los 14 avisos de siempre; los dos builds correctos.

**No verificado en pantalla:** la ficha pide sesión, así que la revisa el usuario. Está pensada para celular, tablet y escritorio (una columna en el celular y tres en escritorio).
