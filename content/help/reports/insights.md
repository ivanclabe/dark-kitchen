---
id: insights
section: reports
title: "Insights: cómo va el negocio"
summary: Insights muestra ventas, pedidos, ticket promedio, costos y margen del periodo que elijas, comparados con el periodo anterior, más un resumen con conclusiones y la opción de exportar a CSV.
audience: [owner, admin, manager, inventory]
permissions: [reports.view]
appPath: /insights
questions:
  - ¿Cuánto vendí este mes?
  - ¿Cómo veo los reportes?
  - ¿Cuál es mi ticket promedio?
  - ¿Qué día u hora vendo más?
  - ¿Cómo exporto las ventas a Excel?
  - ¿Cómo comparo con el mes anterior?
keywords: [reportes, informes, ventas, ingresos, ticket promedio, comparar, periodo, exportar, CSV, Excel, canal, hora, día de la semana]
related: [product-profitability, costs-and-purchases, home-screen]
updated: 2026-10-06
order: 1
screenshots:
  - id: insights
    alt: Insights en la pestaña Resumen con los filtros, las cifras del periodo y el resumen del negocio
    notes:
      - El periodo, la categoría y el producto.
      - «Comparar» con el periodo anterior.
      - Las pestañas Resumen, Ventas, Productos y Costos.
      - Las cifras del periodo y cuánto cambiaron.
      - «Exportar CSV» descarga lo que estás viendo.
---

1. Abre **Insights**.
2. Elige el **Periodo**: Hoy, Esta semana, Este mes, Mes anterior, Este trimestre, Este año o Personalizado (con fechas **Desde** y **Hasta**).
3. Si quieres, filtra por **Categoría** o **Producto**. **Quitar filtros** vuelve a todo.
4. Activa **Comparar** para ver cuánto subió o bajó cada cifra frente al periodo anterior.
5. Recorre las pestañas: **Resumen**, **Ventas**, **Productos** y **Costos**.

{{screenshot:insights}}

## Qué hay en cada pestaña

| Pestaña | Qué ves |
|---|---|
| **Resumen** | Ingresos, pedidos, ticket promedio y, si tienes permiso, costo de ventas, utilidad y margen. El **Resumen del negocio** son conclusiones calculadas con reglas fijas sobre tus datos (nada es inventado por IA). Abajo, los productos y categorías que más venden |
| **Ventas** | Ingresos y pedidos por día, **por canal**, **por día de la semana** y **por hora del día** |
| **Productos** | Cuánto vende y cuánto deja cada producto. Ver [Rentabilidad por producto](help:product-profitability) |
| **Costos** | Costo de ventas, costo por unidad, compras por proveedor, mermas y precio de compra de los insumos. Ver [Costos, compras y mermas](help:costs-and-purchases) |

## Exportar

Toca **Exportar CSV**: descarga la pestaña que estás viendo, con el mismo periodo y filtros. El archivo se abre en Excel o Google Sheets.

> **Bueno saber:** las ventas cuentan todos los pedidos **que no están cancelados**, incluido el domicilio, en la fecha y la hora de tu cuenta. Las cifras de costo y margen solo las ve quien tiene permiso de rentabilidad.
