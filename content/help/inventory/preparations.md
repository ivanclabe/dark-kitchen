---
id: preparations
section: inventory
title: Preparaciones y sub-recetas
summary: Una salsa de la casa o una ensalada base se prepara por lotes y se usa en varios platos. Al preparar un lote salen sus insumos una sola vez; los platos descuentan solo la preparación, con su costo real.
audience: [owner, admin, manager, inventory, kitchen]
permissions: [inventory.produce, recipes.edit]
appPath: /supply/preparaciones
questions:
  - ¿Cómo creo una sub-receta?
  - ¿Cómo uso una salsa en varios platos?
  - ¿Cómo registro un lote de salsa?
  - ¿Qué es el rendimiento de una preparación?
  - ¿Cuánto me cuesta una porción de salsa?
  - No puedo confirmar un pedido, dice que falta una preparación
keywords: [litros, kilos, aguapanela, fondo, sub-receta, subreceta, preparación, preparaciones, lote, lotes, producción, salsa, ensalada base, mise en place, rendimiento, porción, costo por porción, anular lote]
related: [recipes-and-cost, stock, inventory-deduction, waste-adjustments]
updated: 2026-10-13
order: 6
---

Una **preparación** (o sub-receta) es algo que haces en tu cocina y luego usas en varios platos: una salsa de ajo, una ensalada base, un fondo. Tiene su propia receta, lo que **rinde** un lote y su **costo**, y se guarda en el inventario como cualquier insumo.

## Crear una preparación

1. Abre **Abastecimiento → Preparaciones** y toca **Nueva**.
2. Escribe el **Nombre** y elige dónde se guarda: gramos, kilogramos, mililitros, litros o unidades (una aguapanela o un fondo que haces por litros puede guardarse en **litros**). Toca **Crear y escribir su receta**.
3. Agrega lo que lleva **un lote**, en la unidad que te sea cómoda: «0,05 kg de ajo» se guarda como 50 g. Puede llevar otras preparaciones.
4. En **Rinde por lote**, escribe lo que sale (por ejemplo **0,85 kg**, o **2.000 ml** de una preparación en litros). Si quieres, define **Una porción** (por ejemplo 25 g).
5. Toca **Guardar como nueva versión**. Ves el **costo del lote**, el costo por su unidad (gramo, litro…) y el **costo por porción**.

Guardada en litros o kilos, la puedes seguir escribiendo en mililitros o gramos en su receta y en los platos (un vaso de **300 ml** se descuenta como 0,3 l): se convierte sola.

## Preparar un lote

1. En la preparación, toca **Preparar lote**.
2. Escribe cuántos **Lotes** hiciste. Antes de confirmar ves lo que sale del inventario, cuánto hay de cada insumo y el costo del lote.
3. En **Rendimiento real**, escribe lo que realmente salió (por ejemplo 0,82 kg). Si lo dejas vacío, se toma lo de la receta.
4. Toca **Registrar lote**.

Los insumos salen del inventario **una sola vez**, en el lote. La preparación entra al **costo real**: el costo del lote dividido entre lo que rindió. Si rinde menos de lo esperado, cada gramo cuesta más, y lo ves en el historial de **Lotes** («−3,5 %»).

## Usarla en los platos

En la receta de un plato, busca la preparación como cualquier insumo (dice **Preparación**) y escribe la cantidad: **30 g**, o **1 porción** si definiste una. El plato toma el costo real de la preparación, así que no copias costos a mano. Cuando preparas otro lote con precios nuevos, el costo de todos los platos que la llevan se actualiza solo.

Al vender, el plato descuenta **solo la preparación**: sus insumos ya salieron cuando preparaste el lote.

## Dependencias

- La preparación muestra **Se usa en** (los platos y otras preparaciones que la llevan) y, si lleva otras preparaciones, **Lleva** con todo lo que hay detrás.
- La ficha de un insumo en **Stock** también dice en qué preparaciones está y qué platos lo usan a través de ellas.

> **Cuidado:** si un pedido lleva una preparación y no hay suficiente, no se puede confirmar: el mensaje dice cuál falta y cuánto. Prepara un lote primero. Las preparaciones bajo su mínimo aparecen como **Por preparar**.

> **Bueno saber:** un lote registrado por error se **anula** desde el historial de **Lotes**: la preparación sale y sus insumos vuelven, cada uno a su costo. Si ya se usó parte, no se puede anular; registra una merma o un ajuste. Ver [Mermas y ajustes](help:waste-adjustments).

> **Bueno saber:** una preparación no se compra, se prepara, así que no aparece en las compras ni en las sugerencias de compra. Quien cocina puede preparar lotes sin ver el resto del inventario; crear o cambiar recetas requiere permiso de recetas.
