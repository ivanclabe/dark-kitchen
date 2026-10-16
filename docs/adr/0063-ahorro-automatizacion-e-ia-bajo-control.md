# ADR 0063: Ahorro, automatización e IA bajo control

## Estado
**Aceptada e implementada (2026-10-15).** Aprobada en la conversación («aprobado!»); las cuatro fases están hechas y desplegadas. Ver **4. Resultados**.

**Pedido:**
- auditar Quanela módulo por módulo buscando ahorro de costos, automatización y procesos repetitivos, empezando por inventario, costos y procesos administrativos;
- que toda función de IA se configure desde Configuración y no haga llamadas innecesarias ni tenga costos ocultos;
- control humano, permisos y métricas claras.

**Principio del plan:**
- **Reglas primero.** Casi todo lo que ahorra plata se resuelve con aritmética sobre datos que la app ya tiene: es barato, predecible y no depende de un modelo.
- **La IA solo donde aporta:** leer documentos, priorizar y explicar listas largas, y responder preguntas libres.
- **Nada se escribe solo:** el sistema calcula, avisa y sugiere, y una persona confirma. Lo único automático es lo que ya es determinista, como generar el gasto recurrente del mes o fijar el vencimiento de un pedido a crédito.

---

## 1. Auditoría

Las referencias van como `archivo:línea`. El detalle completo está en los informes de la auditoría.

### 1.1 IA y servicios pagos

Siete funciones llaman al modelo (Anthropic), con la clave de la plataforma:
- Cocina, Reponer, Perecederos y Poco movimiento (`dk-ai-insights`);
- Copilot;
- Lectura de facturas;
- Diseñador del menú;
- Pedidos por WhatsApp;
- Asistente de Consumer.

No hay voz ni OCR pagos: la voz corre en el dispositivo.

| # | Hallazgo | Dónde | Impacto |
|---|---|---|---|
| I1 | **Cocina consulta la IA cada 10 min sin que nadie pregunte.** Además, el servidor compara contra la hora en que *terminó* la llamada anterior, así que casi cada consulta llama al modelo, aunque los pedidos no hayan cambiado | `useAi.ts:48`, `KitchenInsightLine.tsx:42`, `dk-ai-insights/index.ts:339-354` | Hasta unas 72 llamadas en un día de 12 h. Agota el tope diario de 50 (Standard) y el de 200 (Business), que comparte con facturas y diseñador |
| I2 | **Sin «huella» de la entrada:** Reponer, Perecederos y Poco movimiento vuelven a llamar al modelo al abrir la pantalla o volver a la pestaña, aunque los datos sean idénticos | `dk-ai-insights/index.ts` (sin hash) | Llamadas repetidas pagadas |
| I3 | **Carrera:** `dk-ai-insights` usa `dk_ai_run_allowed` (consultar) y no `dk_ai_run_reserve` (reservar). Dos pestañas o equipos pueden llamar a la vez | `index.ts:384` | Llamadas duplicadas |
| I4 | **Los errores no se guardan:** después de un error, cada consulta vuelve a intentar | `index.ts:339-354` | Reintentos pagados |
| I5 | **Cancelar Copilot no detiene el modelo:** el servidor sigue haciendo sus hasta 7 rondas, no registra los tokens y la consulta cancelada no cuenta en el tope | `dk-copilot/index.ts:423-430, 523` | Costo oculto |
| I6 | **Copilot por voz:** cualquier frase tras un «Oye Quanela» falso que ninguna pantalla entienda se vuelve una consulta (Sonnet, hasta 7 rondas). La escucha de seguimiento está activa por defecto | `router.ts:47-64`, `VoiceProvider.tsx:80` | Llamadas no intencionales |
| I7 | **Facturas:** si el archivo no era una factura (`empty`) o falla el formato, el modelo sí se cobró, pero no cuenta en el tope ni en el uso | `dk-invoice-import/index.ts:153-180` | Costo invisible |
| I8 | **Asistente de Consumer:** sin interruptor de plataforma, sin plan y sin medición de tokens. Su modelo sale de una variable de entorno | `dk-consumer-assistant/index.ts:72` | Costo sin control |
| I9 | **Medición incompleta:**<br>• los tokens de caché se suman como entrada normal (`dk-copilot/index.ts:531`);<br>• el uso de plataforma ignora `empty`, `cancelled` y Consumer;<br>• los precios de los modelos están vacíos, así que no hay costo en USD;<br>• las ejecuciones `running` que quedaron colgadas siguen contando en el tope;<br>• `dk_ai_insights` no tiene purga | varios | Métricas engañosas |
| I10 | **La cuenta no ve su consumo real:** «Uso y estado» muestra conteos, no tokens ni costo. Solo muestra un tope; los de Copilot (la mitad) y WhatsApp (400) no aparecen. **No hay presupuesto ni alerta de gasto** | `AiSettingsPage.tsx:98-147` | Sin control de costo |
| I11 | **Funciones sin ajustes:** Copilot, Lectura de facturas, Diseñador y WhatsApp solo tienen encendido o apagado. `max_tokens` está fijo en cada función | — | Poco control |
| I12 | **Texto engañoso:** «La IA no crea compras ni cambia pedidos». Pedidos por WhatsApp **sí crea pedidos** cuando el cliente confirma, que es su diseño | `AiStatusPanel.tsx:28-29`, `_whatsapp/agent.ts:455` | Transparencia |

### 1.2 Inventario y costos

| # | Hallazgo | Dónde | Impacto |
|---|---|---|---|
| C1 | **No hay conteo físico.** Corregir el stock es restar a mano, insumo por insumo. Un stock mal llevado **bloquea la confirmación de pedidos**, y los ajustes de «desbloqueo» se confunden con mermas reales en Finanzas | `MovementFormDrawer.tsx:114`, `20261013120000…:346-356` | Alto |
| C2 | **Subidas de precio de proveedores invisibles:** la importación solo avisa si el precio cambia 3× (o sea, un error de unidad), y la compra manual no avisa nada | `invoiceReview.ts:18`, `PurchaseDetail.tsx:114-118` | Alto |
| C3 | **Error:** «Último precio» ordena dentro de la compra embebida y no entre compras, así que puede mostrar un precio viejo cualquiera | `purchases.ts:143-151` | Medio |
| C4 | **Erosión de margen silenciosa:** el costo del plato se recalcula solo, pero nadie se entera:<br>• no hay % de costo objetivo;<br>• no hay alerta de platos bajo margen o bajo costo;<br>• el catálogo carga el costo pero no lo muestra;<br>• el precio especial del planificador no se compara con el costo | `products.ts:24`, `DishCatalogCard.tsx:78` | Alto |
| C5 | **Sugerencia de reposición pobre:**<br>• máx − disponible, sin usar el consumo que ya calcula;<br>• el borrador sale en g/ml con costo promedio, no en la unidad y precio de compra;<br>• exige un número de factura antes de que exista | `…sub_recipes.sql:1015`, `NewPurchaseDialog.tsx:70-77, 106` | Medio |
| C6 | **Alertas por reglas escondidas tras la IA:** Perecederos y Poco movimiento son reglas SQL, pero solo se ven con la función de IA encendida, y solo en Business | `SupplyAiCards.tsx:131-139` | Medio |
| C7 | **Compras manuales sin IVA:** la deuda con el proveedor y el «IVA de compras» quedan cortos. Además, la cabecera de un borrador no se puede editar | `purchases.ts:65`, `…finance.sql:518-521, 891` | Medio, de exactitud |

### 1.3 Procesos administrativos

| # | Hallazgo | Dónde | Impacto |
|---|---|---|---|
| A1 | **Error: la cartera nunca vence.** `dk_orders.due_date` no se escribe en ninguna parte: «saldo vencido» siempre es 0 y la alerta de la campana nunca se dispara. No hay plazo de pago por cliente | `…cartera_schema.sql:19`, `…customers_list.sql:45`, `…notifications.sql:88-95` | Alto (error silencioso) |
| A2 | **Gastos recurrentes:**<br>• se generan solo al abrir Finanzas;<br>• el monto es fijo (luz y gas varían) y no se puede editar;<br>• los pagos se registran de a uno | `…finance.sql:594, 987, 282-404` | Medio |
| A3 | **Turnos sin salida se pagan como 0 horas, en silencio:**<br>• Horas cuenta el turno abierto hasta «ahora» y Nómina lo ignora;<br>• un gerente no puede corregir la marcación | `…finance.sql:668`, `week.ts:47-50` | Medio |
| A4 | **La campana no avisa de lo administrativo:**<br>• deudas por vencer o vencidas;<br>• compras en borrador olvidadas;<br>• facturas leídas sin guardar;<br>• subidas de precio y erosión de margen;<br>• turnos sin salida.<br>Además genera ruido: un insumo con mínimo 0 y stock 0 cuenta como «bajo el mínimo» | `…notifications.sql:37-189` | Medio |

**Fuera de este plan (para después):**
- órdenes de compra enviadas al proveedor;
- carga de varias facturas a la vez;
- pronóstico de demanda con IA;
- variación de rendimiento de preparaciones;
- uso teórico vs. real;
- resumen diario por WhatsApp o correo al dueño;
- comisión por canal.

---

## 2. Decisiones

### D1. La IA solo llama cuando hay algo nuevo (I1-I4)
- **Huella de entrada:** `dk-ai-insights` calcula un hash de la entrada. Si es igual al del último análisis `ok` o `empty`, devuelve ese análisis sin llamar al modelo, aunque haya pasado la ventana de tiempo. Cocina solo llama cuando cambian sus pedidos atrasados o en riesgo.
- **Reserva atómica** (`dk_ai_run_reserve`) antes de llamar: nunca dos llamadas a la vez.
- **Error con espera:** después de un error, no se reintenta antes de la frecuencia configurada, salvo con «Volver a analizar».
- **Cocina:** la consulta periódica sigue, pero ahora casi nunca llega al modelo. La frecuencia mínima sube de 3 a 5 min.

### D2. Costos ocultos cerrados (I5-I9)
- **Copilot:** revisa la cancelación entre rondas y se detiene; la consulta cancelada registra sus tokens y cuenta en el tope.
- **Facturas:** las lecturas `empty` o con error de formato cuentan en el tope y registran tokens. El tope se revisa **antes** de crear la importación.
- **Tokens:** se registran por separado la entrada, la salida, la lectura de caché y la escritura de caché.
- **Asistente de Consumer:** entra al catálogo de funciones (`consumer_assistant`), con interruptor de plataforma, modelo desde la plataforma y medición de tokens.
- **Limpieza programada** (pg_cron):
  - ejecuciones `running` de más de 15 min → `error`;
  - purga de análisis `empty` de más de 30 días.

### D3. Configuración y presupuesto por cuenta (I10, I11)
En **Configuración → IA**:
- **Uso real del mes por función:** ejecuciones, tokens y **costo estimado** (con los precios que fije la plataforma), más **todos los topes**: análisis, Copilot y WhatsApp.
- **Presupuesto mensual de IA** opcional, en ejecuciones o en USD estimados:
  - aviso en la campana al 80 %;
  - al 100 %, las funciones **automáticas** se pausan (Cocina, Reponer, Perecederos, Poco movimiento);
  - las que una persona pide siguen hasta el tope del plan, con aviso.
- **Ajustes nuevos:**
  - Copilot: «Responder por voz lo que no entiende la pantalla» (activado) y «Escucha de seguimiento» (activado);
  - Lectura de facturas: «Leer al soltar el archivo» (activado) o «Leer al confirmar»;
  - WhatsApp: el tope diario de turnos visible.
- **Permiso:** lo edita quien tenga `features.manage`, y el uso lo ven también quienes tengan `observability.view`.

### D4. Inventario y costos con reglas (C1-C7)
- **Conteo físico:**
  - una sesión de conteo por categoría, proveedor o todo;
  - se escribe lo contado y el sistema calcula la diferencia y la registra como ajuste **al confirmar el conteo**;
  - el ajuste queda marcado «por conteo», separado de la merma.
  - Permiso: `inventory.adjust`.
- **Control de precio:**
  - en la compra manual y en la revisión de la factura, aviso si el precio por unidad base sube o baja más de **X %** (ajustable, por defecto 10 %) frente a la última compra y al promedio de 90 días;
  - aviso en la campana cuando una compra confirmada sube el costo promedio de un insumo más de X %.
- **Último precio:** se corrige la consulta.
- **Margen:**
  - **% de costo objetivo** por cuenta (por defecto 35 %), en Configuración;
  - el catálogo muestra el **% de costo de cada plato** y lo resalta si pasa el objetivo o si el precio no cubre el costo;
  - **precio sugerido** = costo ÷ objetivo, solo como sugerencia;
  - aviso «N platos sobre el costo objetivo o bajo costo» en la campana, para quien tenga `products.edit` o `reports.profitability`;
  - aviso si un precio especial del planificador queda bajo costo.
- **Reposición:**
  - cantidad sugerida = consumo diario × días de cobertura objetivo − disponible (con mín/máx si existen);
  - el borrador usa la **unidad y el precio de la última compra**;
  - el número de factura pasa a ser opcional en el borrador, y la cabecera del borrador se puede editar.
- **Alertas por reglas en todos los planes:** las tarjetas Perecederos y Poco movimiento muestran las reglas sin IA; la IA, si está activa, solo agrega la priorización y la explicación.
- **IVA en compras manuales:** campo de IVA en el borrador, con un % por defecto del proveedor (opcional).

### D5. Procesos administrativos (A1-A4)
- **Cartera:**
  - plazo de pago por cliente (`payment_terms_days`, opcional);
  - al confirmar un pedido **a crédito** de ese cliente, se fija `due_date` = fecha del pedido + plazo;
  - vista de antigüedad (al día, 1-30, 31-60, más de 60).

  Con esto se arregla «saldo vencido» y su alerta.
- **Recurrentes:**
  - se generan con pg_cron cada día, sin depender de abrir Finanzas;
  - opción **«monto variable»**: la obligación nace con el monto de referencia y estado «por confirmar monto»; se confirma el valor real antes de pagar;
  - **pago en lote** de varias obligaciones de un mismo beneficiario.
- **Turnos sin salida:**
  - aviso en la campana (más de 2 h después del fin del turno);
  - un gerente (`staff.manage`) puede **corregir la marcación**, y queda en la bitácora;
  - Nómina avisa «N turnos sin salida» en el periodo.
- **Campana:** suma deudas por vencer (7 días) y vencidas, compras en borrador de más de 3 días, facturas leídas sin guardar, subidas de precio, platos fuera de margen y turnos sin salida, cada una con su permiso. Se quita el ruido de «bajo el mínimo» cuando el mínimo es 0.

### D6. Control humano y transparencia
- **Ninguna regla ni IA nueva escribe datos por su cuenta.** Las excepciones son deterministas y documentadas:
  - generar el gasto recurrente;
  - fijar `due_date`;
  - registrar el ajuste del conteo **cuando la persona lo confirma**.
- **El texto de «Uso y estado» se corrige:** dice qué hace cada función, incluido que Pedidos por WhatsApp **crea el pedido cuando el cliente lo confirma**.
- **Permisos:** cada aviso y cada acción nueva usa los permisos existentes; no hace falta ninguno nuevo.

### D7. Métricas claras
En Configuración → IA → «Uso y estado»:
- llamadas evitadas por la huella o la caché, por función;
- costo estimado del mes;
- % del presupuesto usado.

En **Inicio**, los avisos nuevos aparecen en «Necesita atención».

---

## 3. Fases

| Fase | Qué |
|---|---|
| **1 · IA bajo control** | D1, D2, D3, D6 (texto) y D7 (métricas de IA): migración de medición y presupuesto, `dk-ai-insights`, `dk-copilot`, `dk-invoice-import`, `dk-consumer-assistant`, pg_cron de limpieza, Configuración → IA |
| **2 · Inventario y costos** | D4: conteo físico, control de precio, margen y precio sugerido, reposición, alertas por reglas, IVA |
| **3 · Administrativo** | D5: cartera y vencimientos, recurrentes con cron y monto variable, pago en lote, turnos sin salida, avisos de la campana |
| **4 · Pruebas y cierre** | Suite SQL nueva, Vitest, `tsc`, `oxlint`, builds y recorridos en el stack local con datos ficticios (incluido contar las llamadas al modelo antes y después). Despliegue de las funciones y las migraciones a producción, revisando antes las pendientes. Ayuda y novedades. Resultados en este ADR |

**Riesgos:**
- **Migraciones con pg_cron en producción:** solo agregan tareas nuevas, y cada una se prueba antes en local.
- **Cambiar la sugerencia de reposición cambia los números que ya ven:** se explica en la ayuda.
- **El presupuesto en USD depende de que la plataforma cargue el precio de cada modelo:** sin precio, el presupuesto en USD queda desactivado y solo funciona en ejecuciones.

---

## 4. Resultados

### Qué quedó en producción
- **Migraciones** (las únicas pendientes antes del push, verificadas):
  - `20261015130000_dk_ai_cost_control.sql` (fase 1);
  - `20261015140000_dk_cost_controls.sql` (fase 2);
  - `20261015150000_dk_admin_processes.sql` (fase 3).
- **Tareas pg_cron nuevas:** `dk-ai-housekeeping` (cada 10 min) y `dk-finance-recurring` (diaria, 10:20 UTC = 5:20 Bogotá).
- **Funciones edge desplegadas:** `dk-ai-insights`, `dk-copilot` (con la ayuda nueva), `dk-invoice-import`, `dk-consumer-assistant`.
- **Funciones del catálogo nuevas:** `ai_budget` (Presupuesto de IA, apagada por defecto) y `cost_controls` (Control de costos, encendida, sin IA). Ambas en todos los planes. Ahora son 15 funciones.

### Llamadas al modelo, antes y después (D1, D7)
La regla de reutilización de `dk-ai-insights` pasó a `supabase/functions/_shared/aiReuse.ts`. La Edge Function y la prueba `aiReuse.test.ts` usan el mismo código, y la prueba simula días de uso con la regla anterior (solo frecuencia) y la nueva (frecuencia y huella de la entrada):

| Escenario | Antes | Después |
|---|---|---|
| Cocina en vivo, 11:00–23:00, cada 10 min (almuerzo y cena cambian, tarde quieta) | 57 | 34 (−40 %) |
| Reponer, cada 6 h, stock que cambia dos veces en el día | 2 | 2 (manda la frecuencia; el ahorro aquí es la reserva que evita dos pantallas a la vez) |
| Poco movimiento, diaria, 7 días con el mismo stock 5 de ellos | 7 | 3 (−57 %) |

Hallazgo durante la medición: con frecuencia diaria la huella nunca ahorraba, porque la ventana de «misma entrada» (24 h) era igual a la frecuencia. Se dejó en `max(1 día, 3 × frecuencia)`.

Además, sin simulación:
- un error ya no se reintenta en cada apertura (espera la frecuencia);
- Copilot cancelado no sigue llamando en las rondas siguientes;
- la factura que no era factura, o duplicada, ya no consume una lectura sin medirla.

No se contaron llamadas reales de punta a punta en local: `dk-ai-insights` llama directamente a la API del proveedor y no se cargan claves en el entorno local.

### Pruebas
| Qué | Resultado |
|---|---|
| SQL nuevas | `ai_cost_control` 34/34, `cost_controls` 29/29, `admin_processes` 23/23 (local y en producción, dentro de una transacción revertida) |
| SQL relacionadas, con las tres migraciones | `finance`, `customers_list`, `customer_360`, `notifications`, `whatsapp_notifications`, `ai_platform`, `features`, `ai_quota`, `observability`, `invoice_import`, `staff_shifts`, `copilot_safety`, `copilot_tools`, `dish_composition` y `sub_recipes`: todas pasan. `customers_list` tuvo una vez su prueba de tiempo en 361 ms, contra el límite de 300; repetida tres veces, pasó |
| Vitest | 139 archivos, 885 pruebas |
| `tsc` | limpio |
| `oxlint` | 13 avisos, los mismos de antes |
| Builds | app y admin |

### Recorrido en el stack local
Con datos ficticios en la cuenta «Brasa & Pan»; las capturas están en `docs/qa/costos/`:
- borrador sin número de factura, con IVA y aviso de precio;
- la factura se pide al confirmar;
- conteo físico en kg, aplicado como ajuste;
- antigüedad de la cartera;
- monto variable por confirmar;
- turno sin salida;
- costo de los platos y precio sugerido;
- avisos nuevos en Inicio y la campana;
- costo de IA del mes.

No hubo errores de consola.

### Ajustes hechos al probar
- **Permisos:** el costo de los platos se muestra a quien tiene `recipes.view` o `reports.profitability`, no `reports.view`, porque la caja tiene `reports.view`.
- **Permisos faltantes:** las tablas nuevas de conteo y la bitácora de costos necesitaban `grant select`, como el resto del proyecto.
- **Conteo:** propone contar en kg o l en vez de g o ml.
- **Contar inventario:** el acceso subió en el panel de Stock.
- **Poco movimiento:** dice «se usó hoy» en vez de «sin consumo hace 0 días».

### Pendiente o fuera de este plan
- Lo listado en 1.3 como «Fuera de este plan».
- La lista de compras muestra $0 en los borradores, porque el total se calcula al confirmar. Ya pasaba antes y se dejó igual.

