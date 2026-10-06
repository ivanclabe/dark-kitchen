---
id: inventory-deduction
section: inventory
title: Cómo se descuenta el inventario
summary: Al confirmar un pedido se reservan los insumos de sus recetas; al marcar cada plato Listo se descuentan; al cancelar se libera lo reservado o se registra una devolución.
audience: [owner, admin, manager, inventory, kitchen]
permissions: [inventory.view]
appPath: /supply/stock
questions:
  - ¿Cuándo baja el stock?
  - ¿Cuándo se descuenta el inventario?
  - ¿Por qué bajó el stock?
  - ¿Qué es el stock reservado?
  - ¿Cómo se calcula el costo promedio?
keywords: [descuento, reserva, reservado, consumo, devolución, costo promedio, movimientos, receta, baja el stock, sale del inventario, momento]
related: [stock, confirm-cancel, recipes-and-cost, purchases]
updated: 2026-10-06
order: 5
---

Quanela mueve el inventario solo, siguiendo al pedido:

| Momento | Qué pasa con los insumos |
|---|---|
| **Confirmar el pedido** | Se **reservan** los de todas las recetas: baja el stock *disponible*, pero siguen en bodega. Si falta algo, la confirmación se rechaza |
| **Iniciar la preparación** | Nada |
| **Marcar un plato Listo** | Se **descuentan** los de ese plato (movimiento **Consumo**, al costo promedio) |
| **Cancelar** | Lo reservado se **libera**. Si un plato ya estaba listo, se registra una **Devolución** y el pedido queda para **Revisar** |
| **Confirmar una compra** | **Entra** stock y se recalcula el costo promedio |
| **Merma / Ajuste** | Sale o se corrige lo que registres |

## Disponible y reservado

En la ficha del insumo, **Reservado** es lo apartado para pedidos confirmados que aún no se terminan. El stock **disponible** es lo que queda libre para nuevos pedidos.

## Costo promedio

Cada compra confirmada recalcula el costo promedio mezclando lo que había con lo que entró. Ese costo es el que usan las recetas, el consumo y los reportes de rentabilidad.

> **Bueno saber:** por eso es clave que **cada plato tenga receta**: sin receta no se puede confirmar en un pedido, y sus insumos no se descontarían. Ver [Recetas y costo de un plato](help:recipes-and-cost).
