---
id: profitability
section: finance
title: Rentabilidad real y flujo de caja
summary: En Finanzas → Rentabilidad ves la utilidad real del periodo, de las ventas a la utilidad operativa; en Flujo de caja, lo que entró y salió. Las compras y los pagos no son gasto.
audience: [owner, admin, manager]
permissions: [finance.view, reports.profitability]
appPath: /finance/profit
questions:
  - ¿Cuánto me queda de verdad?
  - ¿Cuál es mi utilidad neta?
  - ¿Por qué la utilidad no es igual a lo que tengo en caja?
  - ¿Las compras cuentan como gasto?
  - ¿Cómo se calcula la rentabilidad?
keywords: [rentabilidad, utilidad, utilidad operativa, utilidad neta, estado de resultados, ganancia, flujo de caja, caja, iva, mermas]
related: [payables, expenses, payroll, insights]
updated: 2026-10-11
order: 1
---

Abre **Finanzas → Rentabilidad** y elige el periodo. Es un **estado de resultados**: cada renglón dice de dónde sale.

| Renglón | Qué es |
|---|---|
| **Ventas** − **Descuentos** = **Ventas netas** | Pedidos **confirmados** del periodo. Los que no se confirmaron no cuentan (igual que en Insights) |
| − **Costo de los ingredientes vendidos** | Lo que salió del inventario para esos platos, al costo promedio. Si un plato aún no se preparó, se estima con su receta |
| = **Utilidad bruta** | Con su margen |
| + **Domicilios cobrados** | Lo que pagaron los clientes por el domicilio |
| − **Mermas** y − **Ajustes de inventario** | Lo que se perdió o faltó en los conteos, al costo promedio (si sobró, suma) |
| − **IVA de compras** | Si no descuentas el IVA, lo que pagaste de IVA en tus compras es un costo |
| − **Nómina** | Las nóminas liquidadas, repartidas por los días del periodo. Ver [Nómina](help:payroll) |
| − **Gastos** | Por categoría, en su fecha o periodo. Ver [Gastos](help:expenses) |
| = **Utilidad operativa** | Lo que de verdad dejó el negocio, con su margen |

> **Bueno saber:** las **compras no son gasto**: el insumo cuesta cuando se usa en un plato vendido, o cuando se pierde. Y los **pagos tampoco**: el gasto cuenta en su fecha. Por eso comprar a crédito o de contado da la misma utilidad.

A la derecha, **Para que la utilidad sea completa** te avisa lo que falta: platos sin receta, personas sin pago configurado, periodos sin nómina o sin gastos registrados. Mientras falte algo, la utilidad está **sobreestimada**.

**Descuento el IVA de mis compras:** apagado (lo normal en una cocina pequeña), el IVA de tus compras es un costo. Enciéndelo si lo recuperas en tu declaración.

## Flujo de caja

En **Finanzas → Flujo de caja** ves lo que **entró** (los cobros de pedidos) y lo que **salió** (pagos a proveedores, gastos y nómina), por día y por método.

> **Bueno saber:** la caja no es la utilidad. Una compra a crédito cuesta cuando se usa, pero sale de la caja cuando la pagas. Una venta fiada entra a la caja cuando la cobras.
