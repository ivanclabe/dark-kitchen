---
id: purchases
section: inventory
title: Registrar una compra
summary: En Abastecimiento → Compras crea un borrador (proveedor, factura y fecha), agrega las líneas y toca Confirmar compra; solo entonces entra el inventario y se actualiza el costo.
audience: [owner, admin, manager, inventory]
permissions: [purchasing.create, purchasing.view]
appPath: /supply/compras
questions:
  - ¿Dónde cargo las facturas de compra?
  - ¿Cómo registro una compra?
  - ¿Cómo ingreso inventario?
  - ¿Cómo cargo una factura de proveedor?
  - ¿Cómo sumo stock?
keywords: [compra, factura, proveedor, entrada, ingresar inventario, confirmar compra, costo, adjunto, factura del proveedor, cargar factura]
related: [stock, suppliers, inventory-deduction]
updated: 2026-10-06
order: 2
screenshots:
  - id: purchase
    alt: Detalle de una compra en borrador con el formulario Agregar línea y las líneas de la factura
    notes:
      - Elige el insumo; aparece el último precio que pagaste por él.
      - Cantidad, unidad de compra y costo unitario.
      - Las líneas de la factura.
      - «Confirmar compra» suma el inventario.
---

1. Abre **Abastecimiento → Compras** y toca **Nueva**.
2. Elige el **Proveedor** (o créalo ahí mismo), escribe el **N.º de factura** y la **Fecha**. Toca **Crear borrador**.
3. En **Agregar línea**, elige el **Insumo**, la **Cantidad**, la **Unidad de compra** y el **Costo unitario**. Si ya le compraste antes, toca la sugerencia **Último: $…** para usar ese precio. Toca **Agregar línea**.
4. Repite con cada producto de la factura. Para quitar una línea, toca **Quitar**.
5. Opcional: en **Adjuntos**, sube la foto o el PDF de la factura.
6. Revisa el total y toca **Confirmar compra** → **Sí, confirmar**.

{{screenshot:purchase}}

Al confirmar, cada línea suma al inventario y el **costo promedio** de cada insumo se recalcula con el precio de la compra.

> **Cuidado:** una compra confirmada **no se puede deshacer**. Si hubo un error, corrígelo con un **ajuste**. Ver [Mermas y ajustes](help:waste-adjustments).

> **Bueno saber:** mientras es **borrador**, la compra no toca el inventario. La lista muestra las 50 más recientes; **Cargar más** trae las anteriores.
