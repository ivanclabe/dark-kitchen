---
id: inventory-deduction
section: inventory
title: Cómo se descuenta el inventario
summary: Al confirmar un pedido se reservan los insumos de sus recetas; al empezar cada plato se descuentan; al cancelar se libera lo reservado o vuelve lo usado. Los platos que no usan inventario no mueven nada.
audience: [owner, admin, manager, inventory, kitchen]
permissions: [inventory.view]
appPath: /supply/stock
questions:
  - ¿Cuándo baja el stock?
  - ¿Cuándo se descuenta el inventario?
  - ¿Por qué bajó el stock?
  - ¿Qué es el stock reservado?
  - ¿Cómo se calcula el costo promedio?
  - ¿Qué pasa si no alcanza un insumo en cocina?
  - ¿Qué pasa si devuelvo un plato a pendiente?
keywords: [descuento, reserva, reservado, consumo, devolución, costo promedio, movimientos, receta, baja el stock, sale del inventario, momento, preparando, iniciar, no alcanza, sin stock, existencia]
related: [stock, confirm-cancel, recipes-and-cost, purchases]
updated: 2026-10-18
order: 5
---

Quanela mueve el inventario solo, siguiendo al pedido:

| Momento | Qué pasa con los insumos |
|---|---|
| **Confirmar el pedido** | Se **reservan** los de las recetas de los platos que descuentan inventario: baja el stock *disponible*, pero siguen en bodega. Si falta algo, la confirmación se rechaza |
| **Iniciar un plato** (pasa a **Preparando**) | Se **descuentan** los de ese plato, según su receta y sus unidades (movimiento **Consumo**, al costo promedio). Si ya no alcanza un insumo, la cocina no puede empezarlo: el mensaje dice cuál y cuánto falta |
| **Marcar un plato Listo** | Nada: sus insumos ya salieron al empezarlo |
| **Devolver un plato a Pendiente** | Lo que consumió **vuelve** (movimiento **Devolución**) y queda reservado otra vez; el pedido queda para **Revisar** |
| **Cancelar** | Lo reservado se **libera**. Si un plato ya había empezado, lo que consumió **vuelve** una sola vez y el pedido queda para **Revisar** |
| **Confirmar una compra** | **Entra** stock y se recalcula el costo promedio |
| **Merma / Ajuste** | Sale o se corrige lo que registres |

Cada paso se aplica una sola vez: si se repite (un doble toque, la página que se recarga), nada se descuenta ni se devuelve dos veces. El stock **nunca queda negativo** por un pedido.

## Disponible y reservado

En la ficha del insumo, **Reservado** es lo apartado para pedidos confirmados cuyos platos aún no empiezan a prepararse. El stock **disponible** es lo que queda libre para nuevos pedidos.

## Insumos nuevos

Un insumo creado desde una receta o desde una compra entra al inventario con **existencia cero**: no se inventa stock. Las recetas no dependen de lo que haya: guardas la receta cuando quieras y el insumo sube cuando confirmas su compra. Ver [Recetas y costo de un plato](help:recipes-and-cost).

## Costo promedio

Cada compra confirmada recalcula el costo promedio mezclando lo que había con lo que entró. Ese costo es el que usan las recetas, el consumo y los reportes de rentabilidad.

> **Bueno saber:** por eso es clave que **cada plato que se prepara con tus insumos tenga receta**: si **Descuenta inventario** está encendido y no tiene receta, no se puede confirmar en un pedido. Un plato con **Descuenta inventario** apagado se vende sin receta y **nunca** reserva ni descuenta insumos. Ver [Recetas y costo de un plato](help:recipes-and-cost).
