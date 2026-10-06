# ADR 0039: Pesos colombianos, teléfonos, correos y formularios consistentes

## Estado
**Aprobada e implementada (2026-10-06)**, con D4 aprobada explícitamente.

**Pedido:**
- Mostrar el dinero como pesos colombianos (`$` o `COP`, separador de miles colombiano) y guardarlo como números limpios.
- Teléfonos con selector de país (bandera de Colombia) normalizados al formato internacional, y correos validados.
- Auditar todos los formularios: corregir los tipos desde el frontend hasta Supabase, con componentes reutilizables (`CurrencyInput`, `PhoneInput`, `EmailInput`) y ayudas contextuales.
- Sin textos sobre cómo se guarda un dato o de qué tipo es.
- **Sin cambiar la lógica de negocio.**

---

## 1. Auditoría

### 1.1 Dinero
| Hoy | Problema |
|---|---|
| Todas las columnas de dinero son `numeric` (`dk_products.price`, `dk_orders.total`, `dk_order_payments.amount`, `dk_purchase_items.unit_cost`, `dk_ingredients.avg_cost`…). Todas las cuentas y organizaciones están en **COP** | Bien: ya se guardan como números limpios. No hay que cambiar tipos en la base |
| `formatMoney` (135 usos) siempre quita los decimales | Un costo por gramo de **$3,25 sale como «$3»** (insumos, líneas de receta, costo por unidad). Engaña |
| `formatMoney(-5000)` da «$-5.000» | Un margen negativo debería verse «-$5.000» |
| Hay copias del formato: `plans.ts` y el gráfico (`TrendChart`: «$1.2M», con punto decimal en inglés) | Formatos distintos para lo mismo |
| **9 campos de dinero** son `<input type="number">` sueltos: precio de venta (plato y plato compartido), precio promocional, precio unitario del pedido, monto del pago (pedido y cartera), costo unitario de la compra, y los filtros «Saldo desde / hasta» de Clientes | Sin `$`, sin separador de miles mientras escribes. Según el navegador, la coma decimal no funciona. No se ve que son pesos |
| Los precios de los modelos de IA (portal de plataforma) están en **USD** | Correcto: se quedan en USD, no son pesos |

### 1.2 Teléfonos
| Hoy | Problema |
|---|---|
| 8 campos de teléfono (`type="tel"` sueltos): cliente, proveedor, domiciliario, cuenta (General), organización, registro del negocio, portal de plataforma (crear organización) y el de SMS del registro (este **sí** tiene país y E.164, con `toE164`) | Solo el de SMS valida y normaliza. Los demás guardan lo que se escriba |
| En la base, los clientes tienen teléfonos en **tres formatos**: `300…` (3), `573…` (1) y **2 que no son teléfonos** (identificadores de WhatsApp tipo hash) | Formatos mezclados |
| **WhatsApp encuentra al cliente comparando el teléfono exacto**: `dk_find_or_create_customer_by_phone` usa `phone = p_phone or whatsapp_id = p_phone` | Un cliente creado en la app como `3001112233` **no se reconoce** cuando escribe por WhatsApp como `573001112233`: hoy ya se duplica. Si la app empezara a guardar `+57…` sin más, se duplicarían todos |
| La búsqueda de Clientes ya compara solo dígitos | Sigue funcionando con cualquier formato |

### 1.3 Correos
| Hoy | Problema |
|---|---|
| Entrada, registro, crear usuario y portal: `type="email"` (el navegador valida a medias) | Sin mensaje propio ni normalización (espacios, mayúsculas) |
| Proveedor: solo `inputMode="email"`, **sin validar** | Se puede guardar «juan@» |
| `dk_suppliers.email` no tiene restricción en la base (hoy no hay ninguno guardado) | Nada impide un correo inválido |

### 1.4 Otros números y ayudas
| Hoy | Problema |
|---|---|
| Cantidades, stock mínimo y máximo, vida útil, minutos de descanso y de los tiempos de cocina, límite de unidades, pedidos mínimos: mezcla de `type="number"` con y sin `inputMode`, `step` y `min` | Teclados distintos en el celular; la coma decimal no siempre sirve; la unidad (g, min, días) no se ve dentro del campo |
| `FormField` tiene `hint` (texto debajo), pero no un ⓘ con explicación | Las explicaciones largas ocupan la pantalla o faltan |

## 2. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Cómo se ve el dinero | **Un solo formateador**:<br>• `$25.000` en tablas, tarjetas y cifras;<br>• `-$5.000` si es negativo;<br>• costos por unidad con hasta 2 decimales cuando los tienen (`$3,25`);<br>• compacto para gráficos con coma (`$1,2 M`);<br>• `COP` explícito donde importa (los totales del pedido y de la compra, la confirmación de un pago, la facturación y los encabezados del CSV: «Total (COP)»).<br>Se eliminan las copias |
| **D2** | `CurrencyInput` | Prefijo **$** y sufijo **COP**. Pone los puntos de miles mientras escribes (`1.250.000`), acepta coma decimal solo donde hay centavos (costo unitario), no acepta negativos y entrega **un número limpio** (o vacío). Reemplaza los 9 campos de dinero |
| **D3** | `PhoneInput` | Selector de país con bandera (**🇨🇴 +57** por defecto, los mismos países del registro) y el número con espacios mientras escribes (`300 123 4567`). Valida (Colombia: celular `3…` o fijo `60…`, 10 dígitos; otros países: largo razonable) y entrega **E.164** (`+573001234567`). Al editar, separa el país del número guardado. En pantalla: `formatPhone` → `+57 300 123 4567`. Reemplaza los 8 campos, incluido el del SMS (mismo comportamiento) |
| **D4** | Teléfonos en la base (**necesita tu aprobación explícita**) | `dk_normalize_phone(text)`: lo que parece un teléfono pasa a E.164; **lo que no (identificadores de WhatsApp) queda intacto**. Se aplica con triggers en `dk_customers`, `dk_suppliers`, `dk_delivery_riders`, `dk_kitchens` y `dk_organizations`, venga de la app, de n8n o del portal.<br>La búsqueda de WhatsApp compara **normalizado contra normalizado** (además de `whatsapp_id`, que no se toca). Es la **misma regla** («busca por teléfono; si no existe, crea»), pero sin duplicar al cliente creado en la app.<br>Los **4 teléfonos existentes** con forma de número se normalizan en la migración; los 2 identificadores no se tocan |
| **D5** | `EmailInput` | `type="email"`, `autocomplete`, sin espacios y en minúsculas al salir del campo, con un mensaje claro si falta el @ o el dominio (`isValidEmail` compartida). En los 7 formularios con correo. En la base: un `check` en `dk_suppliers.email` y la misma limpieza (hoy no hay datos que lo violen). Los correos de usuario los maneja la autenticación: sin cambios |
| **D6** | Otros números | `NumberInput`: acepta coma decimal, teclado correcto en el celular, mínimo, y **la unidad dentro del campo** (g, kg, min, días, unidades). Reemplaza los `type="number"` sueltos de cantidades, stock, vida útil, minutos, límites y filtros |
| **D7** | Ayudas | `FormField` suma `info`: un **ⓘ con tooltip** junto a la etiqueta (accesible con teclado). Explica **para qué sirve y qué efecto tiene** (por ejemplo, Costo unitario: «Lo que pagaste por cada unidad de compra; con esto se recalcula el costo promedio del insumo»). **Nunca** cómo se guarda ni de qué tipo es. Se quitan los textos de formato que sobren |
| **D8** | Lógica de negocio | **Sin cambios**: precios, totales, saldos, costos, recetas, inventario y permisos siguen calculándose igual (en la base). Solo cambian la presentación, la lectura de lo que se escribe y la normalización de teléfonos y correos (D4 y D5). La única regla que se ajusta es la comparación del teléfono en WhatsApp, para que siga cumpliendo su propósito |

## 3. Fases
| Fase | Qué |
|---|---|
| 1 · Base | Migración:<br>• `dk_normalize_phone`;<br>• los triggers;<br>• la búsqueda de WhatsApp equivalente;<br>• normalizar los 4 teléfonos;<br>• el `check` y la limpieza del correo de proveedor.<br>Pruebas SQL: formatos (`3001234567`, `573…`, `+57 300…`, `(601) 234 5678`, un hash), triggers, el cliente creado en la app que llega por WhatsApp no se duplica, el hash no cambia, correos válidos e inválidos |
| 2 · Componentes | `src/shared/ui`:<br>• `CurrencyInput`, `PhoneInput`, `EmailInput`, `NumberInput` y `InfoTip`;<br>• `FormField.info`.<br>`src/shared/utils`: `formatMoney` (opciones), `formatPhone`, `toE164`/`splitE164` (movidos desde el registro), `isValidEmail` y el lector de números colombiano. Pruebas de cada uno |
| 3 · Formularios | Los 9 de dinero, los 8 de teléfono, los 7 de correo, los números sueltos y los tooltips. Las listas muestran `formatPhone`. Se quitan las copias del formato |
| 4 · Ayuda | Las guías que nombran estos campos (clientes, compras, platos, pagos), sin hablar de formatos |
| — | Validación: Vitest, SQL, `tsc`, `oxlint`, builds y el navegador (escritorio y celular) en las pantallas públicas. Las que piden sesión las verificas tú |

## 4. Futuro (no se simula)
| Mejora | Qué falta |
|---|---|
| Multimoneda por cuenta | El formateador ya recibiría la moneda de la cuenta; hoy todas son COP |
| Validación completa de números de todo el mundo | Una librería tipo `libphonenumber` (pesada) si llegan cuentas de otros países |

## 5. Resultados (2026-10-06)
| Fase | Qué quedó |
|---|---|
| 1 · Base | Migración `20261006190000_dk_phone_email_normalization.sql` (aplicada):<br>• `dk_normalize_phone`;<br>• triggers en clientes, proveedores, domiciliarios, cuentas y organizaciones;<br>• `dk_find_or_create_customer_by_phone` con la misma regla, comparando normalizado;<br>• los teléfonos existentes normalizados;<br>• `check` y limpieza del correo de proveedor.<br>En los datos reales: **4 teléfonos pasaron a `+57…`; los 2 identificadores de WhatsApp quedaron intactos**. Se verificó antes que no hubiera clientes que chocaran con la restricción única «cuenta + teléfono» (0) |
| 2 · Componentes | `CurrencyInput`, `NumberInput` (unidad dentro del campo; `allowNegative` para los ajustes), `PhoneInput` (bandera y +57; tope de 10 dígitos en Colombia; reconoce un número pegado con su indicativo), `EmailInput`, `InfoTip` y `FormField.info` (el ⓘ va **fuera** de la etiqueta, para que el nombre del campo siga siendo solo su etiqueta). Utilidades:<br>• `formatMoney` (opciones `decimals: 'auto'` y `code`, negativos `-$`) y `formatMoneyCompact`;<br>• `numberInput.ts` (lectura colombiana);<br>• `phone.ts` (`toE164`, `splitE164`, `formatPhone`, `phoneError`, `readTyped`; el registro lo reexporta);<br>• `email.ts`;<br>• `isUniqueViolation` |
| 3 · Formularios | **Dinero (9):** plato, plato compartido, precio promocional, precio unitario del pedido, pago en el pedido, abono en cartera, costo unitario de la compra (con centavos), y los filtros de saldo.<br>**Teléfonos (9):** cliente, proveedor (2), domiciliario, cuenta, organización, registro del negocio, portal (crear organización) y SMS.<br>**Correos (7):** entrada, registro, alta de administrador, crear usuario, proveedor, y la entrada y crear organización del portal.<br>**Números:** stock mínimo y máximo, vida útil, merma y ajuste, receta, receta compartida, descanso, tiempos de cocina, funciones y pedidos mínimos. `NumberStepper` ahora recibe el id de su etiqueta (antes «Cantidad» no estaba asociada).<br>**Mostrar:** teléfonos `+57 300 123 4567` en clientes, proveedores, domiciliarios, pedido y despacho; costos por unidad con centavos (insumos, movimientos, compras, recetas, Insights); «COP» en el total del pedido, el total y la confirmación de la compra, la confirmación de pagos y los encabezados del CSV de Insights; un solo formato (adiós a la copia de `plans.ts` y del gráfico).<br>**Ayudas ⓘ** en los campos clave. Mensaje claro si el teléfono del cliente ya existe |
| 4 · Ayuda | La guía de clientes y las notas de versión; `dk-copilot` desplegada |

**Validación:**
- SQL **889/889**: 24 nuevas en `phone_email.sql`. En `copilot_safety` el cliente de prueba usaba un número que ya existe en los datos reales (ahora son el mismo número), así que se cambió.
- Vitest **545**: utilidades (pesos, lectura colombiana, teléfonos, correos y escritura de teléfonos) y los componentes al escribir. `PaymentCard` ahora espera «85.000».
- `tsc` sin errores; `oxlint` con los 14 avisos de siempre; los dos builds correctos.
- Navegador: el teléfono del registro (🇨🇴 +57, agrupa, se detiene en 10 dígitos y habilita «Enviarme el código»).

**Lógica de negocio sin cambios:** los precios, totales, saldos y costos se siguen calculando en la base, y las validaciones de monto (mayor a cero, no más que el saldo) siguen iguales. La única regla ajustada es la de D4 (aprobada).

**No verificado en pantalla:** los formularios con sesión. Los verifica el usuario.

## 6. Seguimiento (2026-10-06)
- **Bug del foco en los diálogos:** al escribir en «Monto a abonar», el foco saltaba a la ✕.
  - La causa era `useDialogA11y`: su efecto dependía de `onClose`, y el formulario lo crea en cada render, así que cada tecla reiniciaba el efecto y el foco iba al primer botón.
  - Ahora `onClose` y el elemento a restaurar se leen de refs, y el efecto depende solo de `open`.
  - Además respeta el `autoFocus` del contenido (antes abría con el foco en la ✕).
  - Afectaba a todos los `Modal` y `Drawer`. Prueba: `src/shared/ui/Modal.test.tsx`.
- **Método de pago en cartera:** ahora es una lista (Efectivo, Transferencia, Tarjeta, Otro → «¿Cuál?»), con las mismas opciones del pago en el pedido (`orders/lib/paymentMethods.ts`). Sigue siendo opcional («Sin especificar»), como antes.
