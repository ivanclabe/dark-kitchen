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
  - ¿Puedo escribir la receta en gramos si compro en kilos?
keywords: [sub-receta, preparación, salsa, gramos, kilos, unidad, conversión, receta, sin receta, descuenta inventario, no usa inventario, ingredientes, insumos, costo, margen, versión, escandallo, ficha técnica]
related: [dishes-and-menu, preparations, inventory-deduction, stock, product-profitability]
updated: 2026-10-12
order: 2
screenshots:
  - id: recipe
    alt: Editor de receta de un plato con sus ingredientes, el costo estimado y el margen
    notes:
      - La versión activa de la receta.
      - Cada insumo con su cantidad, la unidad que elegiste y su costo.
      - «Costo estimado» y «Margen» frente al precio de venta.
      - «Guardar como nueva versión».
---

1. En **Planificador de Menús**, toca el lápiz del plato (**Editar plato**) y luego **Crear receta** (si ya tiene, dice **Receta v1**, **v2**…).
2. Toca **Agregar ingrediente**, busca el insumo por nombre o código, escribe la **Cantidad** y elige la **Unidad** (por ejemplo, 150 **g** de carne aunque la compres en kilos).
3. Repite con cada insumo. Abajo ves el **Costo estimado** y el **Margen** frente al precio de venta.
4. Toca **Guardar como nueva versión**.

{{screenshot:recipe}}

## Cómo se calcula el costo

Cada línea vale *cantidad × costo promedio del insumo*. El costo promedio se actualiza con cada compra confirmada, así que el costo del plato sigue a tus precios reales. Si el **Margen** sale en rojo, el plato cuesta más de lo que lo vendes.

## Unidades: compra en kilos, cocina en gramos

Cada insumo lleva su inventario en una **unidad base** (g, ml o unidad). En la receta puedes escribir la cantidad en **cualquier unidad compatible**: g o kg, ml o l, unidad o docena, o un empaque que hayas definido para ese insumo. Quanela convierte sola y te muestra la equivalencia debajo («5 g = 0,005 kg»). Al guardar, la receta recuerda la unidad que usaste, y el costo, la reserva y el descuento de inventario se calculan en la unidad base.

> **Bueno saber:** solo aparecen las unidades que se pueden convertir. Los gramos no pasan a unidades (un huevo no tiene un peso fijo).

## Preparaciones dentro de un plato

Una salsa o una ensalada base que haces por lotes se agrega como cualquier insumo: aparece como **Preparación**. Puedes escribirla en gramos o en **porciones**. El plato toma su costo real, y al vender descuenta solo la preparación, no sus insumos. Ver [Preparaciones y sub-recetas](help:preparations).

## Versiones

Guardar nunca borra la receta anterior: crea la versión siguiente (v2, v3…) y esa queda activa para los pedidos nuevos.

> **Cuidado:** si el plato tiene **Descuenta inventario** encendido y no tiene receta, **no se puede confirmar** en un pedido: el mensaje dice cuál es. Créale la receta o, si no usa tus insumos (por ejemplo, una bebida que compras lista), apaga **Descuenta inventario** en **Editar plato**.

> **Bueno saber:** un plato que **no usa inventario** se vende sin receta. Si tiene una, solo sirve para ver su costo: sus pedidos no reservan ni descuentan insumos. Sin receta no tiene costo registrado, así que Insights y Copilot no le calculan margen.

> **Bueno saber:** si el plato viene de **Platos compartidos**, su receta la define el plato compartido: aquí solo la consultas (**Ver receta**). Desde la receta, **Ventas y rentabilidad** te lleva a sus números en Insights.
