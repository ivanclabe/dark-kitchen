---
id: payables
section: finance
title: Lo que se debe y los pagos
summary: En Finanzas → Por pagar ves lo que debe el negocio (a proveedores, gastos y nómina), qué vence y qué está vencido, y registras pagos completos o abonos. En Pagos, el registro de lo que salió.
audience: [owner, admin, manager]
permissions: [finance.view, finance.pay]
appPath: /finance/payables
questions:
  - ¿Cuánto le debo a mis proveedores?
  - ¿Qué cuentas por pagar tengo?
  - ¿Cómo registro un pago a un proveedor?
  - ¿Puedo pagar una factura por partes?
  - ¿Cómo anulo un pago mal registrado?
  - ¿Qué compras a crédito tengo?
keywords: [por pagar, cuentas por pagar, deudas, obligaciones, pagos, abono, crédito, vencido, proveedor, anular pago, pago en lote, pagar varias, monto variable, confirmar monto]
related: [profitability, expenses, purchases, suppliers]
updated: 2026-10-15
order: 2
---

**Por pagar** reúne todo lo que el negocio debe:

- **Proveedores:** cada compra confirmada crea **una** deuda con su proveedor, por el total de la factura. Vence en la fecha de la factura más el **plazo de pago** del proveedor.
- **Gastos:** arriendo, servicios y demás. Ver [Gastos](help:expenses).
- **Nómina:** lo liquidado a cada persona. Ver [Nómina](help:payroll).

Arriba ves **Por pagar**, **Vencido** y **Vence en 7 días**. Filtra por estado (Por pagar, Vencidas, Pagadas, Anuladas) o por tipo.

## Pagar

1. Toca **Pagar** en la obligación.
2. Escribe el **Valor** (por defecto, todo el saldo; menos es un **abono** y el resto queda pendiente), la **Fecha del pago**, **Cómo se pagó** y, si quieres, la **Referencia**.
3. Toca **Registrar pago**.

**Pagar varias de un mismo beneficiario:** marca las casillas de las obligaciones de ese proveedor o persona (al marcar otro beneficiario, la selección empieza de nuevo) y toca **Pagar las N**. Se registra un pago por cada una, con la misma fecha, método y referencia.

**Monto por confirmar:** un gasto fijo de **monto variable** (luz, gas) nace con el valor de referencia y la etiqueta **Monto por confirmar**. Toca **Confirmar monto**, escribe el valor real de la factura y ya se puede pagar. Ver [Gastos](help:expenses).

Al confirmar una compra, Quanela pregunta **¿Cómo se pagó?**: **De contado** la deja pagada en ese momento, y **A crédito** la deja en Por pagar con su vencimiento.

> **Bueno saber:** un pago solo saca plata y baja lo que se debe. **No** es un gasto nuevo ni mueve el inventario.

## Pagos y anulaciones

En **Finanzas → Pagos** ves cada pago del periodo. Si uno quedó mal, toca **Anular** y escribe el motivo: se registra una anulación y lo que se debía vuelve a quedar pendiente. Nada se borra.

Un gasto se puede **anular** si no tiene pagos (primero anula sus pagos). La deuda de una compra no se anula: viene de la compra confirmada.

> **Cuidado:** las compras confirmadas **antes** de Finanzas no se volvieron deuda solas. Si todavía debes alguna, toca **Agregar compras anteriores** y márcala.
