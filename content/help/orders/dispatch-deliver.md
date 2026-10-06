---
id: dispatch-deliver
section: orders
title: Despachar y entregar
summary: En Operación → Despacho toca Despachar en un pedido listo, elige el domiciliario y confirma; cuando llegue, toca Entregar.
audience: [owner, admin, manager, cashier, delivery]
permissions: [dispatch.view, dispatch.assign, dispatch.deliver]
appPath: /operations?view=dispatch
questions:
  - ¿Cómo despacho un pedido?
  - ¿Cómo marco un pedido como entregado?
  - ¿Cómo agrego un domiciliario?
  - ¿Qué ve el domiciliario?
keywords: [despacho, domicilio, domiciliario, entregar, en ruta, repartidor, envío]
related: [order-states, operations-center, register-payment]
updated: 2026-10-06
order: 5
screenshots:
  - id: dispatch
    alt: Vista Despacho con las columnas Listos para salir y En ruta
    notes:
      - Los domiciliarios de turno ahora.
      - Pedidos listos para salir, con la dirección y el teléfono.
      - Pedidos en ruta, con su domiciliario.
---

{{screenshot:dispatch}}

## Despachar

1. En **Operación**, abre la vista **Despacho**.
2. En **Listos para salir**, toca **Despachar** en el pedido.
3. Elige el **Domiciliario** (los que están de turno aparecen primero) y escribe **Notas para el reparto** si hace falta («tocar el timbre», «paga en efectivo»).
4. Toca **Despachar**. El pedido pasa a **En ruta**.

## Entregar

1. En **En ruta**, toca **Entregar** cuando el pedido llegue.
2. El pedido queda **Entregado** y sale del tablero (sigue en la **Lista**).

## Domiciliarios

En **Operación → ⋯ → Domiciliarios** agregas uno nuevo (nombre, teléfono y vehículo) y activas o desactivas los existentes. **Solo los activos** aparecen al despachar. Agregarlos es de administración.

> **Bueno saber:** el **DOMICILIARIO** entra directo a Despacho y solo ve los pedidos que le asignaron, con la dirección y el teléfono del cliente. Puede marcarlos **Entregados**, pero no despachar.
