# ADR 0051: Obligaciones, pagos y rentabilidad real

## Estado
**Aprobada e implementada (2026-10-11).** Falta revisarla en el navegador con tu sesión.

**Pedido:** un módulo de **Obligaciones y Pagos** que:
- registre obligaciones y pagos, **separados**;
- se integre con compras, inventario y empleados;
- integre las compras a crédito **sin contarlas dos veces** ni duplicar compras ni inventario;
- calcule la **rentabilidad real** con datos consistentes **antes** de cualquier tablero vistoso;
- no cambie la arquitectura existente.

---

## 1. Auditoría
| Área | Hoy | Consecuencia |
|---|---|---|
| Compras | Una compra confirmada mete el inventario (movimientos `COMPRA`) y recalcula el costo promedio. **No tiene forma de pago, vencimiento ni saldo**. Los proveedores no tienen plazo de crédito. No existe «por pagar» | No se sabe cuánto se debe, a quién ni para cuándo |
| Inventario → costo | Insights calcula el **costo de lo vendido** con lo que realmente salió del inventario (consumo al costo promedio) y, si el plato aún no se preparó, con el estimado de la receta (ADR 0027) | Está bien hecho: se **reutiliza**, no se recalcula |
| Mermas y ajustes | La merma se valora (cantidad × costo promedio). El **ajuste no guarda costo**, así que no se valora en ningún lado | Las diferencias de inventario no llegan a la utilidad |
| Ventas y cobros | `dk_orders` (subtotal, descuento, domicilio y total) y `dk_order_payments`: un libro de cobros solo de inserción, con anulaciones. Insights cuenta como venta todo lo no cancelado, **incluidos los pedidos NUEVO sin confirmar** | Hay una base de cobros (entradas de caja). La de ventas mezcla pedidos sin confirmar |
| Personal | `dk_shifts` tiene horas planeadas y trabajadas (entrada y salida, menos el descanso). **No hay salario, tarifa por hora ni nómina** | Las horas existen; falta el valor |
| Domiciliarios | No hay pago por domicilio. `delivery_fee` es lo que se cobra al cliente | El costo de los domicilios no existe |
| Gastos | **Ninguna tabla**: no hay arriendo, servicios ni libro contable. Copilot responde «no disponible» a gastos, nómina y utilidad neta | La utilidad real hoy es imposible |
| IVA de compras | La compra guarda IVA (`tax`), pero el costo de los insumos va sin IVA | Para un negocio que **no descuenta IVA**, ese IVA es un costo que hoy no aparece |
| Patrones a seguir | Libros solo de inserción con anulación (cobros y movimientos), funciones `security definer` con `dk_can`, tablas por cuenta con RLS, auditoría `dk_audit_row`, zona horaria de la cuenta | El módulo nuevo usa los mismos patrones; **la arquitectura no cambia** |

## 2. Principios: que nada cuente dos veces
| Concepto | Qué es | Dónde cuenta | Dónde **no** cuenta |
|---|---|---|---|
| **Compra** (ya existe) | Entra inventario | Inventario (y su obligación con el proveedor) | **No es gasto.** El insumo pasa a costo solo cuando se consume en un plato vendido, o cuando se pierde (merma o ajuste) |
| **Obligación** (nueva) | Lo que el negocio **debe**: a un proveedor, un gasto o una nómina | «Por pagar» | — |
| **Gasto** | Una obligación de tipo gasto o nómina | Rentabilidad, en la **fecha o periodo** al que corresponde | No cuenta al pagarlo |
| **Pago** (nuevo) | Plata que **sale** para saldar una obligación | Flujo de caja; baja el saldo por pagar | **Nunca** es gasto (el gasto ya contó en su obligación) y **nunca** mueve inventario |
| **Cobro** (ya existe) | Plata que **entra** de un pedido | Flujo de caja | No es venta (la venta es el pedido) |

**Reglas:**
- Una compra confirmada crea **una y solo una** obligación (única por compra, en la misma transacción).
- Pagar una compra **no** toca el inventario ni la rentabilidad.
- Comprar a crédito o de contado da **la misma** rentabilidad; solo cambia cuándo sale la plata.

## 3. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Obligaciones | Tabla `dk_obligations`, de tres tipos:<br>• **compra**: se crea sola al confirmar. Monto = total de la compra, bloqueado; vence en la fecha de la factura + el plazo del proveedor;<br>• **gasto**: arriendo, servicios, gas, internet, empaques no inventariados, publicidad, comisiones de plataformas, mantenimiento, impuestos y trámites, domicilios, otros. Categorías editables por cuenta, con estas de base;<br>• **nómina**: D6.<br>Cada una tiene a quién se le debe (proveedor, persona o texto libre), monto, **fecha del gasto o periodo** (para la rentabilidad), vencimiento y estado calculado: *pendiente*, *abonada*, *pagada*, *vencida* o *anulada*.<br>Se **anula** con un motivo, nunca se borra. Una de compra no se anula a mano |
| **D2** | Pagos | `dk_obligation_payments`: un **libro de solo inserción**, como los cobros. Cada pago tiene obligación, monto, fecha, método (Efectivo, Transferencia, Tarjeta, Otro), referencia y nota.<br>Se admiten **abonos parciales**; nunca se paga más que el saldo. Un error se corrige **anulando** el pago (con motivo), igual que en Cartera |
| **D3** | Compras a crédito y de contado | Cada proveedor tiene **plazo de pago** en días (0 = de contado). Al confirmar una compra, la pantalla pregunta **«¿Cómo se pagó?»**: *de contado* (con el método) o *a crédito* (vence el …, con el plazo del proveedor ya puesto).<br>De contado: se crean la obligación y su pago **en la misma transacción**. A crédito: queda por pagar.<br>Igual en *Guardar y confirmar* de la factura importada.<br>`dk_confirm_purchase` recibe un parámetro opcional al final; las llamadas actuales siguen sirviendo y la compra se sigue confirmando igual |
| **D4** | Las compras anteriores | Las 5 compras confirmadas que hay hoy **no** se vuelven deuda automáticamente: no sabemos si se pagaron. En «Por pagar», **«Agregar compras anteriores»** deja elegir cuáles se deben todavía |
| **D5** | Pérdidas de inventario | Desde ahora, el **ajuste** guarda el costo promedio, igual que la merma. La rentabilidad muestra **«Mermas y ajustes»**: la merma resta; el ajuste resta si falta inventario y suma si sobra. Los ajustes viejos no tienen costo y quedan fuera, con una nota |
| **D6** | Nómina | Por cada persona de la cuenta, **cómo se le paga**: **por hora** (tarifa) o **mensual** (salario), con fecha desde la que rige. Es un dato reservado (D10).<br>**«Liquidar nómina»** de un periodo propone, por persona: horas trabajadas de sus turnos (entrada y salida, menos el descanso) × tarifa, o el salario proporcional al periodo. Se puede **editar** (extras, auxilios, deducciones, con nota) y crea una obligación de nómina por persona con su periodo. Se paga como cualquier obligación.<br>No calcula prestaciones sociales ni seguridad social colombiana: se suman a mano como otra línea o un gasto |
| **D7** | Gastos fijos | **Gastos que se repiten** (arriendo cada mes el día 5): una plantilla crea la obligación del mes **una sola vez** (única por plantilla y periodo), al abrir el módulo |
| **D8** | Rentabilidad real (estado de resultados) | Una sola función en la base, `dk_finance_pnl(desde, hasta)`, que **reutiliza** los cálculos de Insights:<br>**Ventas netas** (subtotal − descuentos de los pedidos confirmados)<br>+ **Domicilios cobrados**<br>− **Costo de ingredientes vendidos** (el mismo de Insights)<br>= **Utilidad bruta**<br>− **Mermas y ajustes** (D5)<br>− **IVA de compras no descontable** (D9)<br>− **Nómina** y − **Gastos** por categoría<br>= **Utilidad operativa** y su margen.<br>Las obligaciones con periodo (arriendo de octubre, nómina de la quincena) se **reparten por días**: una semana de octubre lleva 7/31 del arriendo. Las compras y los pagos **no** aparecen.<br>Cada cifra dice de dónde sale y se puede abrir. La **cobertura** avisa lo que falta: platos sin costo, ajustes sin valorar, personas sin pago configurado, meses sin arriendo registrado |
| **D9** | IVA de las compras | Un ajuste de la cuenta: **«¿Descuentas el IVA de tus compras?»**, apagado por defecto (la mayoría de las cocinas pequeñas no lo descuenta).<br>Apagado: el IVA de las compras confirmadas es un costo («IVA de compras no descontable»), en la fecha de la factura. Encendido: no cuenta.<br>El impuesto al consumo de las ventas queda fuera de este ADR |
| **D10** | Base de ventas consistente | «Venta» = pedido **confirmado** (confirmado, en preparación, listo, despachado o entregado), por fecha de creación en la zona horaria de la cuenta. Los **NUEVO sin confirmar no son venta**.<br>Para que Insights y Finanzas digan lo mismo, **Insights adopta la misma regla** (un filtro en `dk_insights`). Hoy Insights los suma |
| **D11** | Flujo de caja | Aparte de la rentabilidad. **Entradas:** cobros netos de anulaciones. **Salidas:** pagos de obligaciones, por tipo (proveedores, gastos y nómina). **Neto del periodo**, por día y por método.<br>Explica por qué la utilidad y la caja difieren (compras a crédito, cartera por cobrar) |
| **D12** | Permisos | Nuevos:<br>• `finance.view`: ver obligaciones, pagos, flujo y rentabilidad;<br>• `finance.manage`: registrar gastos y plazos y anular obligaciones;<br>• `finance.pay`: registrar y anular pagos;<br>• `finance.payroll`: ver salarios y liquidar nómina.<br>ADMIN los tiene todos (automático). GERENTE: ver, gestionar y pagar, **sin** nómina. Los demás, ninguno.<br>La rentabilidad muestra costos solo a quien también tiene `reports.profitability` |
| **D13** | Dónde vive | Un módulo nuevo en el menú, **«Finanzas»** (`/finance`), con pestañas: **Rentabilidad** · **Por pagar** · **Pagos** · **Gastos** · **Nómina** · **Flujo de caja**.<br>En esta entrega, **tablas y cifras claras con su detalle**, no gráficas: el tablero visual va en otro ADR, cuando los datos estén validados con uso real.<br>En Compras, cada compra muestra su estado de pago y su saldo. En el proveedor, cuánto se le debe |
| **D14** | Copilot y ayuda | Una herramienta de Copilot, `finance`, con la rentabilidad del periodo, lo que se debe y vence y el flujo, respetando permisos. Deja de responder «no disponible» sobre utilidad, gastos y nómina.<br>Ayuda: artículos nuevos de Finanzas, cambios en Compras e Insights, y notas de versión. El manual no se toca |

## 4. Fases
| Fase | Qué |
|---|---|
| 1 · Base | Migración `dk_finance`:<br>• permisos;<br>• `dk_expense_categories` (con las de base por cuenta), `dk_obligations`, `dk_obligation_payments`, `dk_recurring_obligations`, `dk_member_pay`;<br>• `dk_suppliers.payment_terms_days`; `dk_kitchens.purchase_vat_deductible`;<br>• trigger de compra confirmada → obligación (única, monto bloqueado);<br>• `dk_confirm_purchase` con el pago opcional; `dk_create_purchase_from_import` lo pasa;<br>• RPC para gastos, pagos, anulaciones, compras anteriores, plantillas, nómina (propuesta y liquidación);<br>• `dk_register_adjustment` con costo;<br>• `dk_finance_pnl`, `dk_finance_cashflow` y `dk_finance_payables`;<br>• filtro de ventas confirmadas en `dk_insights`;<br>• RLS, auditoría y aislamiento por cuenta |
| 2 · Finanzas | Módulo con las 6 pestañas, formularios de gasto y pago, anulación con motivo y «Agregar compras anteriores» |
| 3 · Integraciones | «¿Cómo se pagó?» al confirmar una compra y en la factura importada. Estado de pago en el detalle de la compra. Plazo y deuda en el proveedor. Pago de cada persona en Personal (con `finance.payroll`). Nota de Insights actualizada |
| 4 · Copilot y ayuda | Herramienta `finance`, artículos, notas y despliegue |
| — | **Validación** con un caso completo en SQL:<br>• una compra a crédito y una de contado: una obligación por compra, nunca dos; reconfirmar es imposible; los movimientos de inventario no cambian; pagar no crea movimientos ni gasto;<br>• abonos y anulación; no se paga de más;<br>• gasto con periodo repartido por días;<br>• nómina por hora desde turnos reales y mensual proporcional;<br>• plantilla que no se duplica;<br>• el estado de resultados **cuadra al peso** con un cálculo a mano;<br>• la utilidad es **igual** a crédito y de contado;<br>• el flujo de caja cuadra con cobros y pagos;<br>• Insights y Finanzas dan las mismas ventas y el mismo costo;<br>• el IVA no descontable;<br>• permisos (GERENTE no ve nómina, CAJA no ve nada) y aislamiento entre cuentas.<br>**Además:** Vitest, `tsc`, `oxlint` y builds, y el navegador con tu sesión |

## 5. Riesgos
| Riesgo | Mitigación |
|---|---|
| Contar una compra como gasto **y** como costo de ingredientes | Las compras nunca entran a la rentabilidad, solo el consumo. Una prueba lo verifica: la utilidad es la misma a crédito o de contado |
| Duplicar la obligación de una compra | Índice único por compra; se crea dentro de la confirmación, que no se puede repetir; el monto no se edita |
| Deudas falsas con las compras viejas | No se crean solas (D4) |
| Que Insights cambie sus cifras | Solo deja de sumar pedidos sin confirmar (D10). Las notas de versión lo explican |
| Datos de salario visibles | Permiso aparte (`finance.payroll`) y RLS: la caja y la cocina no los ven; el gerente tampoco, salvo que se le dé |
| Que la nómina parezca exacta | Es una **propuesta** editable a partir de horas reales. No calcula prestaciones; la ayuda lo dice |
| Un módulo grande | Por fases, cada una con pruebas. El tablero visual se deja para cuando los datos estén validados |

## 6. Resultados (2026-10-11)
| Fase | Qué quedó |
|---|---|
| 1 · Base | Tres migraciones aplicadas; antes de cada una se revisó que fuera la única pendiente.<br>**`20261011100000_dk_finance`:**<br>• 4 permisos; GERENTE sin nómina; ADMIN los recibe solo;<br>• `dk_suppliers.payment_terms_days` y `dk_kitchens.purchase_vat_deductible`;<br>• `dk_expense_categories`: 11 de base por cuenta, sembradas en las 4 cuentas actuales y en las nuevas por trigger;<br>• `dk_obligations`: tres tipos, índices únicos por compra, por mes de gasto fijo y por persona y periodo de nómina, y anulación con motivo;<br>• `dk_obligation_payments`: solo inserción, anulación negativa;<br>• `dk_recurring_obligations`, `dk_member_pay` y la vista `dk_obligation_balances` (pagado, saldo y estado);<br>• trigger de compra confirmada → una obligación;<br>• `dk_confirm_purchase(id, p_payment)`: de contado paga en la misma transacción; a crédito puede cambiar el vencimiento. `dk_create_purchase_from_import` pasa `payload.payment`;<br>• RPC de gastos, pagos, anulaciones, gastos fijos, compras anteriores y nómina (propuesta desde turnos y liquidación);<br>• `dk_is_sale_status`, aplicado a las 4 funciones de Insights;<br>• ajuste con costo;<br>• `dk_finance_pnl` (reutiliza `dk_insights_items` y reparte por días), `dk_finance_cashflow` y `dk_finance_payables_summary`.<br>**`20261011110000_dk_finance_copilot`:** el ajuste del IVA y `dk_copilot_finance`.<br>**`20261011120000_dk_finance_team`:** el equipo con su pago vigente, para quien tiene `finance.payroll` aunque no tenga `staff.view`.<br>**Datos reales:** 44 categorías (11 × 4 cuentas) y **0 obligaciones**: las 6 compras ya confirmadas no se volvieron deuda (D4). 5 ajustes viejos sin costo, que la rentabilidad avisa |
| 2 · Finanzas | Módulo **Finanzas** (`/finance/:tab`) en el menú, con las pestañas:<br>• **Rentabilidad:** estado de resultados con la fuente de cada renglón, gastos por categoría, avisos de cobertura, «Cómo se calcula» y el interruptor del IVA;<br>• **Por pagar:** resumen, filtros por estado y tipo, pagar o abonar, anular con motivo y «Agregar compras anteriores»;<br>• **Pagos:** registro con anulación;<br>• **Gastos:** registrar gasto con periodo opcional y «Ya lo pagué», categorías nuevas y gastos fijos;<br>• **Nómina:** pago por persona, liquidar con propuesta editable y nóminas liquidadas;<br>• **Flujo de caja:** entradas, salidas y neto, por tipo, por método y por día.<br>Solo tablas y cifras; el tablero visual queda para otro ADR |
| 3 · Integraciones | «¿Cómo se pagó?» (`PurchasePaymentChoice`) al confirmar una compra y en *Guardar y confirmar* de la factura importada, con el plazo del proveedor propuesto. Estado de pago y «Registrar pago» en el detalle de la compra. **Plazo de pago** en el formulario del proveedor y «Le debes» en su ficha. La nota de Insights enlaza a Finanzas.<br>**Cambio frente a D13:** el pago de cada persona se configura en **Finanzas → Nómina**, no en Personal, para tenerlo en un solo lugar reservado |
| 4 · Copilot y ayuda | Herramienta `finance` en Copilot. La instrucción ya no responde «no disponible» a utilidad, gastos y nómina, y la herramienta `sales` aclara la regla de pedidos confirmados. Sección de ayuda **Finanzas** con 4 artículos (`profitability`, `payables`, `expenses`, `payroll`), cambios en `purchases`, `suppliers`, `insights` y `waste-adjustments`, y notas de versión. `dk-copilot` desplegada. El manual no se tocó |

**Validación:**
- SQL `finance` **59/59**, un caso completo:
  - compra a crédito y compra de contado: una obligación cada una;
  - confirmar dos veces: rechazado;
  - 3.000 g en 2 movimientos, y pagar no crea movimientos;
  - el estado de resultados **cuadra al peso**: ventas netas 36.000 (el pedido NUEVO no cuenta), domicilio 5.000, ingredientes 3.000, bruta 33.000, merma 500, ajuste 1.000, IVA 3.800, nómina 75.000, gastos 750.000, operativa **−792.300**;
  - **misma utilidad después de pagar la compra**;
  - Insights da las mismas ventas y el mismo costo;
  - abono, pago de más rechazado, anulación con motivo, anular dos veces rechazado;
  - la deuda de una compra no se anula; un gasto con pagos no se anula; anulado, sale de la rentabilidad;
  - flujo de caja 41.000 / 83.800 / −42.800, con su desglose por tipo;
  - por pagar 775.000;
  - nómina: 7,5 h × 10.000 desde turnos reales; salario mensual proporcional; no se liquida dos veces;
  - gastos fijos: 3 meses sin duplicar, vencen el día 5;
  - compras anteriores: una y no dos;
  - IVA descontable;
  - Copilot (GERENTE ve la rentabilidad, no la nómina);
  - permisos: GERENTE sin nómina ni equipo; CAJA sin nada; no se escribe directo por la API;
  - aislamiento entre cuentas.
- Con las migraciones siguen en verde: `insights` 21/21, `invoice_import` 62/62, `dishes_without_recipe`, `multikitchen_isolation`, `copilot_tools`, `copilot_safety`, `staff_shifts`, `order_payments`, `customers_list`, `observability` y `permission_catalog` (68 · 56 · 12).
- **Ya fallaban antes** de estas migraciones, y no se tocaron:
  - `audit_events` («Inicio de sesión: uno por minuto»);
  - `customer_360` (dirección más reciente);
  - `ai_platform` («Usage»).
- Vitest **725**: `finance.test` (renglones que suman a la utilidad operativa, IVA, estimado, cobertura) y `PurchasePaymentChoice.test`. `tsc` (app y funciones), `oxlint` (13 avisos, los mismos) y los dos builds.
- **Navegador: pendiente** (hace falta tu sesión).

