---
id: waste-adjustments
section: inventory
title: Mermas y ajustes de inventario
summary: Para registrar algo que se perdió usa Merma (con su motivo); para corregir el stock tras un conteo usa Ajuste, con una cantidad positiva o negativa.
audience: [owner, admin, manager, inventory]
permissions: [inventory.adjust]
appPath: /supply/stock
questions:
  - ¿Cómo registro una merma?
  - ¿Cómo ajusto el inventario?
  - El stock no coincide con lo que hay
  - Se dañó un insumo, ¿cómo lo saco?
keywords: [merma, ajuste, conteo, pérdida, vencido, dañado, corregir stock, desperdicio]
related: [stock, inventory-deduction, costs-and-purchases]
updated: 2026-10-06
order: 4
---

## Registrar una merma

1. En **Abastecimiento → Stock**, abre el insumo.
2. Toca **Merma**.
3. Escribe la **Cantidad** que se perdió y elige el **Motivo**: Vencimiento, Daño, Error de preparación u Otro. Agrega una **Observación** si ayuda.
4. Toca **Registrar merma**. Sale del inventario automáticamente.

## Corregir el stock (ajuste)

1. Abre el insumo y toca **Ajuste**.
2. Escribe la **Cantidad** en la unidad base: **positiva** suma stock, **negativa** resta.
3. Explica el motivo en **Observación** («conteo del viernes») y toca **Registrar ajuste**.

Cada merma y ajuste queda en los **Movimientos** del insumo con quién y cuándo. Las mermas también se ven en **Insights → Costos**.

> **Cuidado:** el inventario es un registro que solo crece: nada se borra. Para deshacer un error, haz el ajuste contrario.
