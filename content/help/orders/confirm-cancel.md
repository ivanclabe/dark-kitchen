---
id: confirm-cancel
section: orders
title: Confirmar y cancelar un pedido
summary: Confirmar reserva los insumos y envía el pedido a la cocina; si falta stock se rechaza. Cancelar libera lo reservado y pide un motivo.
audience: [owner, admin, manager, cashier]
permissions: [orders.confirm, orders.cancel]
appPath: /operations
questions:
  - ¿Cómo confirmo un pedido?
  - ¿Cómo cancelo un pedido?
  - ¿Por qué no puedo confirmar un pedido?
  - ¿Qué pasa con el inventario si cancelo?
keywords: [confirmar, cancelar, anular pedido, reservar, stock insuficiente, receta, devolución]
related: [order-states, inventory-deduction, create-order]
updated: 2026-10-10
order: 3
---

## Confirmar

1. Abre el pedido (o usa el botón **Confirmar** de su tarjeta en **Por confirmar**).
2. Toca **Confirmar pedido** → **Sí, confirmar**.
3. El pedido pasa a **En cola** y aparece en la pantalla de la cocina.

Al confirmar, Quanela **reserva** los insumos de las recetas: bajan del stock disponible, pero todavía no salen de la bodega. Los platos que **no usan inventario** no reservan nada.

> **Cuidado:** la confirmación se rechaza si **falta stock** de algún insumo, si un plato que **descuenta inventario** no tiene receta o si el pedido **no tiene platos**. Revisa el mensaje: dice qué falta y cuál es el plato.

## Cancelar

1. Abre el pedido y toca **Cancelar pedido** (en Cocina también está en el detalle).
2. Escribe el **Motivo** (opcional, pero ayuda) y toca **Sí, cancelar**.

Lo que pasa con el inventario:

- Lo **reservado** se libera y vuelve a estar disponible.
- Si algún plato **ya estaba listo** (sus insumos ya se habían descontado), se registra una **devolución** y el pedido queda marcado **Revisar**, para que alguien verifique qué pasó con esa comida.

Un pedido **Entregado** o **Cancelado** ya no se puede cancelar. La cancelación **no se puede deshacer**.

> **Bueno saber:** cancelar no devuelve el dinero de los pagos registrados. Si hay que corregir un pago, ver [Registrar y anular pagos](help:register-payment).
