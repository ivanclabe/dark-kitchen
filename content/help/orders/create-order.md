---
id: create-order
section: orders
title: Crear un pedido
summary: En Operación toca Nuevo pedido (o la tecla N), elige o crea el cliente, toca Crear pedido y agrega los platos con su cantidad y observación.
audience: [owner, admin, manager, cashier]
permissions: [orders.create]
appPath: /operations
questions:
  - ¿Cómo creo un pedido?
  - ¿Cómo hago un pedido nuevo?
  - ¿Cómo agrego platos a un pedido?
  - ¿Cómo registro una venta?
keywords: [nuevo pedido, crear, venta, platos, observación, cliente, tecla N]
related: [confirm-cancel, customers, first-order, operations-center]
updated: 2026-10-06
order: 2
screenshots:
  - id: new-order
    alt: Panel Nuevo pedido con el cliente elegido, el formulario para agregar platos y la tabla de platos con el total
    notes:
      - El plato, la cantidad y el precio (viene el del catálogo).
      - Observaciones rápidas, como «Sin cebolla».
      - Los platos agregados y el total.
      - «Confirmar pedido» lo envía a cocina.
---

1. En **Operación**, toca **Nuevo pedido** o presiona la tecla **N**.
2. En **Cliente**, escribe el nombre o el teléfono y elígelo. Si no existe, toca **Crear "…"** y guarda sus datos: el pedido se crea solo.
3. Toca **Crear pedido**. El borrador aparece de inmediato en **Por confirmar**.
4. Agrega cada plato: elígelo en **Plato**, ajusta la **Cantidad**, revisa el **Precio unitario** y escribe la **Observación** si hace falta (o toca una sugerencia: «Sin cebolla», «Para llevar»…). Toca **Agregar plato**.
5. Revisa la tabla con el subtotal, el descuento, el domicilio y el **Total**. Para quitar un plato, toca **Quitar**.
6. Cuando esté completo, toca **Confirmar pedido**. Ver [Confirmar y cancelar](help:confirm-cancel).

{{screenshot:new-order}}

> **Bueno saber:** también puedes crear el pedido desde un cliente: en **Clientes**, abre el cliente y toca **Nuevo pedido**; ya viene elegido.

> **Cuidado:** los platos solo se pueden agregar o quitar mientras el pedido está **Por confirmar**.

Los pedidos que llegan por WhatsApp (si tu negocio tiene la integración) aparecen solos en **Por confirmar**.
