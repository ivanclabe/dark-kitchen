---
id: register-payment
section: orders
title: Registrar y anular pagos
summary: Abre el pedido, en Pago toca Registrar pago (el monto viene con el saldo), elige el método y confirma; un pago mal registrado se anula con su motivo.
audience: [owner, admin, manager, cashier]
permissions: [receivables.collect, receivables.view]
appPath: /operations
questions:
  - ¿Dónde registro que un cliente pagó?
  - ¿Cómo registro un pago?
  - ¿Dónde registro un pago?
  - ¿Cómo cobro un pedido?
  - ¿Cómo anulo un pago?
  - Registré un pago por error
  - ¿Cómo valido un pago?
keywords: [pago, cobro, cobrar, abono, efectivo, transferencia, tarjeta, anular, validar, pagado, por cobrar]
related: [order-states, customers, search-orders]
updated: 2026-10-06
order: 7
screenshots:
  - id: payment
    alt: Detalle del pedido con la sección Pago y el formulario de Registrar pago abierto
    notes:
      - El estado del pago y lo que falta por cobrar.
      - El monto viene lleno con el saldo.
      - El método se elige con un toque.
      - «Confirmar pago» lo registra.
---

## Registrar un pago

1. Abre el pedido (tócalo en el tablero, la lista o el despacho).
2. En la sección **Pago**, toca **Registrar pago**.
3. Revisa el **Monto**: viene con lo que falta por pagar. Cámbialo si es un abono parcial.
4. Elige el método: **Efectivo**, **Transferencia**, **Tarjeta** u **Otro** (escribe cuál).
5. Agrega una **Nota** si quieres y toca **Confirmar pago**.

{{screenshot:payment}}

El pedido pasa a **Pagado** o **Pago parcial**. Registrar el pago **es** validarlo: no hay un paso aparte.

> **Bueno saber:** también puedes registrar pagos desde **Clientes**: abre el cliente → **Registrar pago**, o desde la pestaña **Cuenta**.

## Anular un pago registrado por error

1. Abre el pedido y en **Pago** toca **Ver detalle**.
2. En el pago equivocado, toca **Anular**.
3. Escribe el **Motivo** (es obligatorio) y toca **Anular pago**.

Nada se borra: queda una **anulación** con tu nombre, la fecha y el motivo, y el saldo vuelve a estar pendiente. Un pago se anula una sola vez. Todo queda en **Configuración → Actividad**.

> **Cuidado:** no puedes registrar más de lo que falta por pagar, ni registrar pagos en un pedido cancelado.

Registrar y anular pagos es de los roles que cobran (por ejemplo CAJA y administración). Cocina y domiciliarios no ven los pagos.
