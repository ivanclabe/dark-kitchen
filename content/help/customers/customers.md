---
id: customers
section: customers
title: Clientes y saldos pendientes
summary: En Clientes buscas por nombre, teléfono o correo y abres la ficha 360° del cliente — pedidos, preferencias, direcciones, quejas, recomendaciones y saldo — para atenderlo sin cambiar de pantalla.
audience: [owner, admin, manager, cashier]
permissions: [customers.view, customers.create, receivables.collect]
appPath: /customers
questions:
  - ¿Cómo creo un cliente?
  - ¿Quién me debe?
  - ¿Cuánto me debe un cliente?
  - ¿Cómo registro un abono de un cliente?
  - ¿Cómo veo los pedidos de un cliente?
  - ¿Cómo registro una queja de un cliente?
  - ¿Dónde anoto lo que no le gusta a un cliente?
  - ¿Cómo cambio la dirección de un cliente?
  - ¿Qué es lo que más pide un cliente?
keywords: [cliente, ficha, "360", deuda, saldo, cartera, fiado, crédito, abono, vencido, teléfono, correo, WhatsApp, queja, reclamo, incidencia, preferencias, favoritos, alergia, dirección, recomendación]
related: [register-payment, create-order, search-orders]
updated: 2026-10-06
order: 1
screenshots:
  - id: customers
    alt: Lista de clientes con las cifras de arriba, el buscador y los filtros
    notes:
      - Total de clientes, activos, con deuda y saldo pendiente. Toca una cifra para filtrar.
      - Busca por nombre, teléfono o dirección.
      - Filtros como «Con deuda» o «Vencidos».
      - «Nuevo cliente».
---

{{screenshot:customers}}

## Crear un cliente

1. Abre **Clientes** y toca **Nuevo cliente**.
2. Escribe el **Nombre** (obligatorio). Opcional: **Correo**, **Teléfono** (Colombia 🇨🇴 viene elegida; para otro país, cámbialo en la lista), **Dirección** y **Notas**. Con el teléfono reconocemos al cliente cuando pide por WhatsApp, y no puede haber dos clientes con el mismo número.
3. Toca **Crear cliente**.

También puedes crearlo mientras haces un pedido, y los pedidos que llegan por WhatsApp crean al cliente solos.

## Encontrar un cliente

Escribe en el buscador (nombre, teléfono en cualquier formato, correo o dirección) o usa los filtros: **Todos**, **Activos** (con un pedido en los últimos 90 días), **Inactivos**, **Con deuda**, **Sin deuda** y **Vencidos** (deben pedidos cuya fecha de pago ya pasó). Toca el encabezado de una columna para ordenar.

## La ficha del cliente (360°)

Toca un cliente. Arriba: su estado (activo si pidió en los últimos 90 días, saldo vencido, quejas abiertas), su teléfono y su correo, y los botones **Editar**, **Registrar queja**, **Registrar pago** y **Nuevo pedido**. Las pestañas:

| Pestaña | Qué ves |
|---|---|
| **Resumen** | Lo más importante junto: cuántos pedidos, total comprado, cada cuánto pide, su último pedido y **lo que más pide**; lo que le gusta y **lo que no**; qué recomendarle; su contacto; la última dirección de envío; las quejas abiertas y la nota general |
| **Pedidos** | Todos sus pedidos |
| **Preferencias** | Platos favoritos, ingredientes que le gustan y que no, y preferencias alimentarias. Los platos e ingredientes se eligen del catálogo |
| **Direcciones** | La **última dirección de envío** (la que usan los pedidos y el despacho), las frecuentes y las anteriores |
| **Quejas** | Su historial de quejas e incidencias |
| **Cuenta** | Los pedidos con saldo y los pagos recibidos |

Todo sale de los datos reales: si algo no se ha registrado, la ficha lo dice en vez de suponerlo.

## Direcciones

1. En **Direcciones**, toca **Nueva dirección**.
2. Escribe la **Dirección**; opcional: **Referencia**, **Quién recibe** e **Indicaciones para la entrega**.
3. Deja marcado **Usar como última dirección de envío** si es a donde va el próximo pedido.

Nada se borra: una dirección nueva queda **además** de las anteriores. Con **Usar como última** cambias a otra; **Archivar** la saca de la lista sin perderla.

## Quejas

1. Toca **Registrar queja**, elige el **Motivo**, el **Pedido** (opcional) y escribe **Qué pasó**.
2. Para el seguimiento, en **Quejas** toca **Dar seguimiento**: cambia el **Estado** (Pendiente, En revisión, Resuelta), escribe la **Respuesta o solución** y, si quieres, **Notas internas**.

Lo que el cliente reportó no se edita ni se borra: cada queja queda en el historial con su fecha y quién la registró y la resolvió.

## Preferencias y recomendaciones

En **Preferencias**, agrega platos favoritos, lo que le gusta o no (si un ingrediente no está en el inventario, anótalo como texto) y lo que dice de su alimentación. En **Resumen → Recomendaciones**, anota qué ofrecerle; se puede descartar cuando ya no aplica.

## Registrar un abono

1. En la ficha, toca **Registrar pago** (o en la lista, en el menú ⋯ del cliente).
2. Elige el **Pedido**, escribe el **Monto a abonar**, el **Método de pago** y, si quieres, una **Nota**.
3. Confirma. El saldo del pedido y del cliente bajan de inmediato.

> **Bueno saber:** las deudas solo las ve quien tiene permiso de cartera. Para el pago completo de un pedido, ver [Registrar y anular pagos](help:register-payment).
