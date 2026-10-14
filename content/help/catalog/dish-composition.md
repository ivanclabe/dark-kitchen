---
id: dish-composition
section: catalog
title: Platos configurables (opciones y acompañantes)
summary: "Opciones que el cliente elige en un plato (sopa, proteína, bebida, acompañantes): incluidas, extra o de cortesía, con su consumo de inventario. Precio y costo se calculan solos."
audience: [owner, admin, manager, cashier]
permissions: [products.edit, orders.edit]
appPath: /menu-planner
questions:
  - ¿Cómo hago un corrientazo con sopa, proteína y bebida a elegir?
  - ¿Cómo cobro un acompañante extra?
  - ¿Cómo doy algo de cortesía?
  - ¿El inventario descuenta lo que el cliente eligió?
  - ¿Cómo agrego opciones a un plato?
keywords: [opciones, acompañantes, corrientazo, almuerzo, combo, extra, adición, cortesía, obligatorio, opcional, sopa, proteína, bebida, patacones, personalizar, configurable, modificadores]
related: [recipes-and-cost, preparations, public-menu, dishes-and-menu]
updated: 2026-10-13
order: 5
---

Un plato **configurable** tiene grupos de opciones que el cliente elige. Por ejemplo, un corrientazo: **Sopa**, **Proteína**, **Bebida** y **Acompañantes**.

## Armar la composición

1. En **Catálogo**, abre el plato (**Editar plato**) y toca **Composición**.
2. Empieza con una **plantilla** («Corrientazo» o «Combo») o con un grupo en blanco.
3. En cada **grupo**:
   - escribe el nombre;
   - marca si es **Obligatorio**;
   - elige **hasta cuántas** opciones se pueden tomar;
   - marca **Permite repetir** si se puede pedir la misma dos veces, por ejemplo «Patacones ×2».
4. En cada **opción**, elige su tipo de precio:
   - **Incluido:** viene con el plato;
   - **Extra:** suma su precio, por ejemplo «Res +$3.000»;
   - **Cortesía:** no se cobra, pero sí sale del inventario.
5. En **Qué consume**, elige un **insumo o preparación** con su cantidad, en la unidad que quieras (350 ml de sancocho aunque se guarde en litros). También puedes elegir **otro plato**, por ejemplo la limonada, y entonces se descuenta su receta.
6. Marca la **Predeterminada** de cada grupo obligatorio: es la que se usa si nadie elige, por ejemplo en un pedido por WhatsApp.
7. Toca **Guardar composición**.

A la derecha ves **Así lo ve el cliente** y **Precio y costo**: el costo de lo elegido y el margen. Cada opción también muestra su costo, y los extras su margen.

## Lo que pasa con un pedido

- **Menú público:** el cliente toca el plato y elige. Ve el precio de cada opción y un **resumen** con el total antes de agregarlo. «Agregar» no se activa hasta que elige lo obligatorio.
- **Caja:** al elegir un plato configurable en el pedido, aparecen sus opciones con el total por unidad. El precio base lo puedes cambiar; los extras los calcula Quanela.
- **Cocina:** el tablero y el detalle del pedido muestran lo elegido («Sancocho · Res · Patacones ×2»).
- **Inventario:** al confirmar se reserva lo que lleva el plato **y** lo que se eligió, en la unidad correcta. La cocina lo descuenta al marcarlo listo, y si se cancela, todo vuelve. Una preparación (por ejemplo, los patacones) sale de su stock: el plátano ya salió cuando se preparó el lote.
- **Costos:** Insights y Finanzas usan el costo de lo que el cliente eligió.

> **Bueno saber:** si una opción no tiene stock para una porción, el menú público la muestra **Agotada**. Si al pedir falta algo, el pedido no se confirma y dice qué falta.

> **Bueno saber:** el precio siempre lo calcula Quanela con tu menú de hoy y la composición: lo que ve el cliente en su celular es solo una vista previa.
