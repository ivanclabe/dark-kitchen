---
id: recipes-and-cost
section: catalog
title: Recetas y costo de un plato
summary: La receta dice qué insumos lleva un plato y en qué cantidad; con ella Quanela calcula su costo y su margen, y descuenta el inventario. Cada cambio se guarda como una versión nueva.
audience: [owner, admin, manager, inventory]
permissions: [recipes.edit]
appPath: /menu-planner
questions:
  - ¿Cómo creo una receta?
  - ¿Cuánto me cuesta un plato?
  - ¿Cuál es el margen de un plato?
  - ¿Por qué no puedo confirmar un pedido? Dice que el plato no tiene receta
  - ¿Cómo cambio los ingredientes de un plato?
keywords: [receta, ingredientes, insumos, costo, margen, versión, escandallo, ficha técnica]
related: [dishes-and-menu, inventory-deduction, stock, product-profitability]
updated: 2026-10-06
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

> **Cuidado:** sin receta activa, un plato **no se puede confirmar** en un pedido y sus insumos no se descontarían.

> **Bueno saber:** si el plato viene de **Platos compartidos**, su receta la define el plato compartido: aquí solo la consultas (**Ver receta**). Desde la receta, **Ventas y rentabilidad** te lleva a sus números en Insights.
