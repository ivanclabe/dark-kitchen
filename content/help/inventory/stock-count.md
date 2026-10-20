---
id: stock-count
section: inventory
title: Conteo físico del inventario
summary: En Abastecimiento → Stock → Contar inventario cuentas lo que hay en la bodega (todo, una categoría o un proveedor), en kg, l o la unidad que uses, y al aplicar cada diferencia queda como un ajuste «Conteo físico».
audience: [owner, admin, manager, inventory]
permissions: [inventory.adjust]
appPath: /supply/stock/conteo
questions:
  - ¿Cómo hago un inventario físico?
  - ¿Cómo cuento la bodega?
  - El stock no coincide con lo que hay
  - ¿Cómo corrijo varios insumos a la vez?
keywords: [conteo, conteo físico, inventario físico, toma física, contar bodega, cuadrar inventario, diferencia de conteo]
related: [stock, waste-adjustments, inventory-deduction]
updated: 2026-10-15
order: 4
---

1. Abre **Abastecimiento → Stock** y toca **Contar inventario**.
2. Elige qué contar: **Todo el inventario**, **Una categoría** o **Un proveedor**, y toca **Empezar conteo**. quanela guarda lo que dice el sistema en ese momento.
3. Escribe lo que hay de cada insumo. Puedes contar en **kg** o **l** (vienen propuestos) o en cualquier unidad del insumo, incluidas sus cajas. Se guarda al salir del campo y al lado ves la diferencia y lo que vale.
4. Usa **Por contar**, **Contados** y el buscador para no perderte. Puedes cerrar y volver después: el conteo queda abierto.
5. Toca **Aplicar ajustes** y confirma.

Al aplicar, cada insumo contado que no coincide registra un **ajuste «Conteo físico»** por la diferencia con el stock de **ese momento** (si se vendió algo mientras contabas, no se cuenta dos veces). Los insumos que no contaste no cambian. **Descartar** cierra el conteo sin tocar el inventario.

> **Bueno saber:** hay un conteo abierto a la vez por cuenta. Los anteriores aparecen en **Conteos anteriores**, y cada ajuste queda en los movimientos del insumo.

> **Cuidado:** aplicar no se puede deshacer. Si te equivocaste, registra otro ajuste. Ver [Mermas y ajustes](help:waste-adjustments).
