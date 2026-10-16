---
id: purchases
section: inventory
title: Registrar una compra
summary: En Abastecimiento → Compras crea un borrador (la factura puede esperar), agrega las líneas y toca Confirmar compra; solo entonces entra el inventario. Quanela avisa si un precio cambió mucho.
audience: [owner, admin, manager, inventory]
permissions: [purchasing.create, purchasing.view]
appPath: /supply/compras
questions:
  - ¿Dónde cargo las facturas de compra?
  - ¿Cómo registro una compra?
  - ¿Cómo ingreso inventario?
  - ¿Cómo cargo una factura de proveedor?
  - ¿Cómo sumo stock?
  - Compré en kilos pero el insumo está en gramos
  - ¿Cómo registro una caja?
  - ¿Por qué me avisa que el precio subió?
  - ¿Cómo pongo el IVA de una compra?
keywords: [kilos, gramos, caja, empaque, conversión, unidad de compra, compra, factura, proveedor, entrada, ingresar inventario, confirmar compra, costo, adjunto, factura del proveedor, cargar factura, IVA, impuesto, precio subió, aviso de precio, número de factura]
related: [invoice-import, payables, stock, suppliers, inventory-deduction]
updated: 2026-10-15
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

1. Abre **Abastecimiento → Compras** y toca **Nueva → Manual**. Para que Quanela lea la factura por ti, elige **Importar desde factura**: ver [Importar una compra desde una factura](help:invoice-import).
2. Elige el **Proveedor** (o créalo ahí mismo) y la **Fecha**. El **N.º de factura** es opcional en el borrador (se pide al confirmar) y el **IVA** se propone con el habitual del proveedor. Toca **Crear borrador**.
3. En **Agregar línea**, elige el **Insumo**, la **Cantidad**, la **Unidad de compra** y el **Costo unitario**. Si ya le compraste antes, toca la sugerencia **Último: $…** para usar ese precio. Si el costo que escribes cambia más de lo normal frente a la última compra o al promedio de 90 días, Quanela lo avisa («Sube 31 % frente a la última compra»). Debajo ves cómo entra al inventario («Entra al inventario: 2 kg = 2.000 g · $20/g»). Toca **Agregar línea**.
4. Repite con cada producto de la factura. Para quitar una línea, toca **Quitar**.
5. Opcional: en **Adjuntos**, sube la foto o el PDF de la factura.
6. Revisa el total y toca **Confirmar compra**. Si todavía no escribiste el número de factura, se pide ahí. Elige **¿Cómo se pagó?**: **De contado** (con el método; queda pagada) o **A crédito** (con su vencimiento, por defecto la fecha de la factura más el plazo del proveedor; queda en Finanzas → Por pagar). Toca **Sí, confirmar**.

{{screenshot:purchase}}

Al confirmar, cada línea suma al inventario y el **costo promedio** de cada insumo se recalcula con el precio de la compra.

## Datos de la factura e IVA

Mientras es borrador, toca **Editar datos** junto al proveedor para cambiar el **N.º de factura**, la **Fecha** o el **IVA**. Con un IVA en %, el total muestra el subtotal y el IVA, y al confirmar el IVA se calcula sobre el subtotal. El IVA habitual de cada proveedor se configura en su ficha.

## Avisos de precio

En el borrador, cada línea compara su costo por unidad de inventario con la **última compra** y con el **promedio de los últimos 90 días**. Si cambia más del porcentaje configurado (10 % por defecto), aparece un aviso en amarillo. Es solo un aviso: tú decides. El porcentaje se cambia en **Configuración → IA y voz → Funciones → Control de costos**. Ver [Control de costos](help:cost-controls).

## Comprar en otra unidad

Compra en la unidad de la factura: Quanela convierte a la unidad base del insumo. Si compras **2 kg** de carne a $40.000 el kilo y el insumo está en gramos, entran **2.000 g** a **$20 el gramo**.

Para un empaque (**caja**, **bolsa** o **paquete**), la primera vez Quanela pregunta **¿Cuántos trae?** («¿Cuántos unidad trae 1 caja?»). Escribe 12 y queda guardado para ese insumo: la próxima vez ya lo sabe.

> **Cuidado:** una compra confirmada **no se puede deshacer**. Si hubo un error, corrígelo con un **ajuste**. Ver [Mermas y ajustes](help:waste-adjustments).

> **Bueno saber:** una compra sin líneas no se puede confirmar, y una confirmada ya no cambia su proveedor, su factura ni sus valores (las notas sí).

> **Bueno saber:** mientras es **borrador**, la compra no toca el inventario. La lista muestra las 50 más recientes; **Cargar más** trae las anteriores.
