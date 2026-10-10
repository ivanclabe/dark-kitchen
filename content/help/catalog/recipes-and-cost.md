---
id: recipes-and-cost
section: catalog
title: Recetas y costo de un plato
summary: La receta dice qué insumos lleva un plato y cuánto; con ella Quanela calcula su costo y su margen, y descuenta el inventario. Cada cambio es una versión nueva. Si el plato no usa inventario, no la necesita.
audience: [owner, admin, manager, inventory]
permissions: [recipes.edit]
appPath: /menu-planner
questions:
  - ¿Cómo creo una receta?
  - ¿Cuánto me cuesta un plato?
  - ¿Cuál es el margen de un plato?
  - ¿Por qué no puedo confirmar un pedido? Dice que el plato no tiene receta
  - ¿Cómo cambio los ingredientes de un plato?
keywords: [receta, sin receta, descuenta inventario, no usa inventario, ingredientes, insumos, costo, margen, versión, escandallo, ficha técnica]
related: [dishes-and-menu, inventory-deduction, stock, product-profitability]
updated: 2026-10-10
order: 2
screenshots:
  - id: recipe
    alt: Editor de receta de un plato con sus ingredientes, el costo estimado y el margen
    notes:
      - La versión activa de la receta.
      - Cada insumo con su cantidad en la unidad base y su costo.
      - «Costo estimado» y «Margen» frente al precio de venta.
      - «Guardar como nueva versión».
---

1. En **Catálogo**, toca el lápiz del plato (**Editar plato**) y luego **Crear receta** (si ya tiene, dice **Receta v1**, **v2**…).
2. Toca **Agregar ingrediente**, busca el insumo por nombre o código y escribe la **Cantidad** en su unidad base (por ejemplo, gramos).
3. Repite con cada insumo. Abajo ves el **Costo estimado** y el **Margen** frente al precio de venta.
4. Toca **Guardar como nueva versión**.

{{screenshot:recipe}}

## Cómo se calcula el costo

Cada línea vale *cantidad × costo promedio del insumo*. El costo promedio se actualiza con cada compra confirmada, así que el costo del plato sigue a tus precios reales. Si el **Margen** sale en rojo, el plato cuesta más de lo que lo vendes.

## Versiones

Guardar nunca borra la receta anterior: crea la versión siguiente (v2, v3…) y esa queda activa para los pedidos nuevos.

> **Cuidado:** si el plato tiene **Descuenta inventario** encendido y no tiene receta, **no se puede confirmar** en un pedido: el mensaje dice cuál es. Créale la receta o, si no usa tus insumos (por ejemplo, una bebida que compras lista), apaga **Descuenta inventario** en **Editar plato**.

> **Bueno saber:** un plato que **no usa inventario** se vende sin receta. Si tiene una, solo sirve para ver su costo: sus pedidos no reservan ni descuentan insumos. Sin receta no tiene costo registrado, así que Insights y Copilot no le calculan margen.

> **Bueno saber:** si el plato viene de **Platos compartidos**, su receta la define el plato compartido: aquí solo la consultas (**Ver receta**). Desde la receta, **Ventas y rentabilidad** te lleva a sus números en Insights.
