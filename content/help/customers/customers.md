---
id: customers
section: customers
title: Clientes y saldos pendientes
summary: En Clientes buscas y creas clientes, ves sus pedidos, lo que han comprado y cuánto deben; desde su ficha registras un abono o creas un pedido nuevo.
audience: [owner, admin, manager, cashier]
permissions: [customers.view, customers.create, receivables.collect]
appPath: /customers
questions:
  - ¿Cómo creo un cliente?
  - ¿Quién me debe?
  - ¿Cuánto me debe un cliente?
  - ¿Cómo registro un abono de un cliente?
  - ¿Cómo veo los pedidos de un cliente?
keywords: [cliente, deuda, saldo, cartera, fiado, crédito, abono, vencido, teléfono, WhatsApp]
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
2. Escribe el **Nombre** (obligatorio). Opcional: **Teléfono** (con él se reconoce al cliente en pedidos por WhatsApp), **Dirección** y **Notas**.
3. Toca **Crear cliente**.

También puedes crearlo mientras haces un pedido, y los pedidos que llegan por WhatsApp crean al cliente solos.

## Encontrar un cliente

Escribe en el buscador o usa los filtros: **Todos**, **Activos** (con un pedido en los últimos 90 días), **Inactivos**, **Con deuda**, **Sin deuda** y **Vencidos** (deben pedidos cuya fecha de pago ya pasó). Toca el encabezado de una columna para ordenar.

## La ficha del cliente

Toca un cliente. Arriba ves sus **Pedidos**, el **Total comprado**, el **Saldo pendiente** y su **Último pedido**. Las pestañas:

- **Pedidos**: todos sus pedidos.
- **Cuenta**: los **Pedidos con saldo** y los **Pagos recibidos**.
- **Información**: sus datos.

Desde la ficha: **Editar**, **Registrar pago** y **Nuevo pedido** (ya con el cliente elegido).

## Registrar un abono

1. En la ficha, toca **Registrar pago** (o en la lista, en el menú ⋯ del cliente).
2. Elige el **Pedido**, escribe el **Monto a abonar**, el **Método de pago** y, si quieres, una **Nota**.
3. Confirma. El saldo del pedido y del cliente bajan de inmediato.

> **Bueno saber:** las deudas solo las ve quien tiene permiso de cartera. Para el pago completo de un pedido, ver [Registrar y anular pagos](help:register-payment).
