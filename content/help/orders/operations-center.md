---
id: operations-center
section: orders
title: El Centro de operaciones
summary: Operación es donde se trabaja el día, con cuatro vistas del mismo pedido (Tablero, Cocina, Despacho y Lista) y las cifras de hoy arriba.
audience: [owner, admin, manager, cashier, kitchen, delivery]
permissions: [orders.view, kitchen.view, dispatch.view]
appPath: /operations
questions:
  - ¿Cómo uso el módulo de pedidos?
  - ¿Qué es el Centro de operaciones?
  - ¿Dónde veo los pedidos?
  - ¿Cómo uso Operación?
  - ¿Qué es el tablero?
keywords: [operación, pedidos, tablero, kanban, vistas, centro de operaciones, cifras]
related: [create-order, order-states, kitchen-view, dispatch-deliver, search-orders]
updated: 2026-10-06
order: 1
screenshots:
  - id: operations-board
    alt: Centro de operaciones en la vista Tablero, con las pestañas, las cifras del día y las columnas de pedidos
    notes:
      - Las cuatro vistas del mismo pedido.
      - Las cifras del día; cada una abre su lista.
      - Columnas del tablero, de «Por confirmar» a «En ruta».
      - «Nuevo pedido» (tecla N).
---

**Operación** responde: *¿qué tengo que hacer ahora?* Pedidos y cocina trabajan sobre el mismo pedido, en vistas distintas.

{{screenshot:operations-board}}

## Las vistas

| Vista | Para qué | Quién |
|---|---|---|
| **Tablero** | Todo el flujo, de «Por confirmar» a «En ruta» | Caja, administración |
| **Cocina** | Solo lo que se prepara: En cola, Preparando, Listo | Cocina, caja, administración |
| **Despacho** | Listos para salir y en ruta | Caja, administración, domiciliarios |
| **Lista** | Todos los pedidos, también entregados y cancelados | Caja, administración |

Cada rol ve sus vistas y empieza en la suya. Si solo tiene una, no ve pestañas.

## Las cifras de arriba

**Por confirmar**, **En cola**, **Preparando**, **Listos**, **En ruta**, **Entregados hoy** y, si ves la cartera, **Por cobrar**. Toca una para abrir esos pedidos en la Lista.

## En el tablero

1. Cada tarjeta muestra los platos, las observaciones, el número y el tiempo que lleva. El tiempo se pone **ámbar** cerca del límite y **rojo** si está atrasado.
2. El botón de la tarjeta hace el siguiente paso: **Confirmar**, **Iniciar**, **Marcar listo**, **Despachar** o **Entregar**.
3. También puedes **arrastrar** la tarjeta a otra columna. Las columnas que no se pueden usar se oscurecen.
4. Toca la tarjeta para abrir el pedido completo.

> **Bueno saber:** con la tecla **/** buscas un pedido por número o cliente, y con **N** creas uno nuevo. En **⋯** activas o apagas el sonido de pedidos nuevos.
