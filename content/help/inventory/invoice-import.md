---
id: invoice-import
section: inventory
title: Importar una compra desde una factura
summary: Sube la foto o el PDF de la factura y Quanela lee el proveedor, las líneas y los precios. Tú revisas todo, y la compra queda en borrador o confirmada.
audience: [owner, admin, manager, inventory]
permissions: [purchasing.create, invoices.upload]
appPath: /supply/compras/importar
questions:
  - ¿Cómo importo una factura de compra?
  - ¿Puedo subir la foto de la factura para crear la compra?
  - ¿Quanela lee las facturas?
  - ¿Por qué un ítem de la factura no se asoció a mi insumo?
  - ¿Qué pasa si subo la misma factura dos veces?
keywords: [importar factura, foto de la factura, pdf, leer factura, escanear, ocr, ia, compra automática, asociar insumos, por revisar]
related: [purchases, suppliers, stock]
updated: 2026-10-10
order: 3
---

En **Abastecimiento → Compras**, toca **Nueva → Importar desde factura**. También puedes **soltar la factura** sobre la lista de Compras.

## Subir la factura

1. Arrastra el archivo, toca **Elegir archivo** o, en el celular, **Tomar foto**. Sirve una foto (JPG, PNG o WebP) o un PDF de hasta 10 MB.
2. Quanela la sube y la lee con IA. Tarda entre 10 y 40 segundos. Puedes salir: la factura queda en **Compras → Por revisar**.

> **Bueno saber:** la factura se envía al proveedor de IA de Quanela solo para leerla, y queda guardada, privada, como adjunto de la compra. Cada lectura cuenta en el cupo diario de IA de tu plan.

## Revisar lo que se leyó

A la izquierda ves la factura (toca la foto para acercarla). En el celular, ábrela con **Ver la factura**. A la derecha está lo que se leyó, listo para corregir:

- **Proveedor:** Quanela lo busca por **NIT** (con o sin dígito de verificación) y, si no hay NIT, por **nombre**. Dice por qué lo eligió: «Mismo NIT», «Mismo nombre» o «Parecido 82 %». Toca **Cambiar** para elegir otro, o **Crear proveedor con los datos de la factura**.
- **Factura:** número, fecha, IVA y notas. Lo que se leyó con dudas lo dice.
- **Líneas:** cada línea muestra el texto de la factura y el **insumo** que le corresponde.
  - Si Quanela está segura (lo asociaste antes, el mismo código o el mismo nombre), ya viene elegido. Si no, toca una de las **Sugerencias**, busca el insumo, o toca **Crear insumo nuevo**.
  - Revisa **cantidad**, **unidad** y **costo**. La unidad solo ofrece las que tienen sentido para ese insumo.
  - Si la unidad es **caja**, **bolsa** o **paquete**, Quanela pregunta **¿Cuánto trae?** (por ejemplo, 12.000 g). Se guarda en el insumo para las próximas compras.
  - **Ignorar** deja fuera una línea que no es un insumo (domicilio, bolsas).
- En **ámbar**: lo leído con dudas, una cantidad × costo que no da el total de la línea o un precio muy distinto al costo promedio del insumo.
- Abajo, el **cuadre**: la suma de las líneas frente al subtotal de la factura. Si no cuadra, revisa cantidades y costos.

## Guardar

- **Guardar borrador:** crea la compra en borrador. No mueve el inventario; la confirmas después desde su detalle, como cualquier compra.
- **Guardar y confirmar:** la crea y la confirma de una vez. Entra el inventario y se actualiza el costo promedio.

Todo se guarda junto o no se guarda nada. Si pediste crear un proveedor o un insumo que ya existe (mismo NIT, mismo código o mismo nombre), Quanela usa el existente y no lo duplica.

> **Bueno saber:** Quanela **aprende**. Lo que asocies («TOMATE CHONTO X KG» es tu «Tomate») llega ya asociado en la próxima factura de ese proveedor. Si no quieres que lo recuerde, desmarca **Recordar esta asociación**.

> **Cuidado:** la misma factura (mismo proveedor y número) no se registra dos veces: Quanela avisa y enlaza la compra que ya existe. Si subes el mismo archivo, te dice «Ya importaste este archivo».

Si la factura no se pudo leer (borrosa, cortada o escrita a mano), toca **Leer de nuevo** o crea la compra a mano. Ver [Registrar una compra](help:purchases).
