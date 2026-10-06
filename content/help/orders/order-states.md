---
id: order-states
section: orders
title: Estados del pedido y del pago
summary: "Un pedido va de Por confirmar a En cola, Preparando, Listo, En ruta y Entregado (o Cancelado); el pago es aparte: Pagado, Pago parcial o Pago pendiente."
audience: [everyone]
permissions: [orders.view]
appPath: /operations
questions:
  - ¿Qué significa cada estado del pedido?
  - ¿Qué es En cola?
  - ¿Cuándo un pedido está listo?
  - ¿Qué significa Revisar en un pedido?
keywords: [estados, por confirmar, en cola, preparando, listo, en ruta, entregado, cancelado, pagado, pendiente, revisar]
related: [confirm-cancel, kitchen-view, register-payment]
updated: 2026-10-06
order: 4
---

## Estados del pedido

| Estado | Qué significa | Siguiente paso |
|---|---|---|
| **Por confirmar** | Borrador: se pueden agregar o quitar platos | Confirmar |
| **En cola** | Confirmado, esperando a la cocina | Iniciar |
| **Preparando** | La cocina empezó al menos un plato | Marcar listo |
| **Listo** | Todos los platos están listos | Despachar (o entregar en el local) |
| **En ruta** | Salió con un domiciliario | Entregar |
| **Entregado** | Terminado | — |
| **Cancelado** | Se canceló; ya no cambia | — |

El estado del pedido sigue a sus platos: con el primer plato iniciado pasa a **Preparando**, y cuando todos están listos pasa a **Listo**. En la cocina se puede **retroceder** un paso si hubo un error.

## Estado del pago (aparte)

| Pago | Qué significa |
|---|---|
| **Pagado** | Lo pagado cubre el total |
| **Pago parcial** | Hay pagos, pero falta |
| **Pago pendiente** | No hay pagos |

Un pedido puede estar **Preparando** y **Pagado**, o **Entregado** y **Pago pendiente**: son dos cosas distintas. El pago solo lo ven los roles que ven la cartera. Ver [Registrar y anular pagos](help:register-payment).

## Otras marcas

- **Prioritario** (bandera): la cocina lo atiende primero.
- **Revisar**: tuvo una devolución de inventario (por ejemplo, se canceló con un plato ya listo). Alguien debe verificarlo.
- El **tiempo** de la tarjeta se pone ámbar cerca del límite y rojo si está atrasado. Ver [Tiempos y pedidos atrasados](help:kitchen-times).
