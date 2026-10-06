---
id: stock
section: inventory
title: Stock e insumos bajo el mínimo
summary: En Abastecimiento → Stock ves cada insumo con su stock, su costo promedio y en qué platos se usa; el filtro Bajo mínimo y Reponer te dicen qué comprar.
audience: [owner, admin, manager, inventory]
permissions: [inventory.view]
appPath: /supply/stock
questions:
  - ¿Cómo creo un ingrediente?
  - ¿Cómo uso el módulo de inventario?
  - ¿Qué insumos están por agotarse?
  - ¿Cómo veo el stock?
  - ¿Cómo creo un insumo?
  - ¿Qué debo comprar?
keywords: [inventario, stock, insumos, bajo mínimo, reponer, existencias, bodega, crear insumo, costo promedio, ingrediente nuevo, materia prima]
related: [purchases, waste-adjustments, inventory-deduction, recipes-and-cost]
updated: 2026-10-06
order: 1
screenshots:
  - id: stock
    alt: Abastecimiento, sección Stock, con la lista de insumos, los filtros y la tarjeta Reponer
    notes:
      - Stock, Compras y Proveedores.
      - Filtros, incluido «Bajo mínimo».
      - La barra de cada insumo (rojo bajo el mínimo, ámbar cerca, verde bien).
      - "«Reponer»: lo que conviene comprar, por proveedor."
---

{{screenshot:stock}}

## Ver el stock

1. Abre **Abastecimiento**. Entras en **Stock**.
2. A la izquierda está la lista de **Insumos**. Usa el buscador o los filtros: **Todos**, **Bajo mínimo**, cada categoría, **Sin categoría** e **Inactivos**.
3. Cada insumo muestra su stock en la unidad base, su costo promedio y una barra: **roja** bajo el mínimo, **ámbar** cerca, **verde** bien.
4. Toca un insumo para ver su ficha: el stock con su mínimo y máximo, el **costo promedio**, el **valor en stock**, lo **reservado** por pedidos confirmados, en qué platos **se usa** y sus **movimientos**.

## Qué comprar

Sin ningún insumo elegido, a la derecha está **Reponer**: los insumos bajo el mínimo o con pocos días de cobertura, agrupados por proveedor, con la cantidad sugerida. Toca **Crear compra** y se arma un borrador con esas cantidades. Ver [Registrar una compra](help:purchases).

## Crear un insumo

1. Toca **Nuevo**.
2. Escribe el **Código**, el **Nombre** y elige la **Unidad base** (en ella se cuentan el stock y las recetas).
3. Opcional: **Categoría**, **Proveedor principal**, **Stock mínimo** (dispara la alerta), **Stock máximo** (meta de reposición) y si es **Perecedero** (con su vida útil).
4. Toca **Crear insumo**.

> **Bueno saber:** el stock **no se escribe a mano**: entra con las compras confirmadas, sale con los platos listos y se corrige con mermas y ajustes. Ver [Cómo se descuenta el inventario](help:inventory-deduction).
