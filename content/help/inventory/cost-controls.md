---
id: cost-controls
section: inventory
title: Control de costos
summary: Reglas sin IA que avisan cuando un insumo cambia de precio y cuando un plato pasa tu costo objetivo o se vende bajo costo, con un precio sugerido; también fijan cuántos días cubre la reposición.
audience: [owner, admin, manager, inventory]
permissions: [inventory.view]
appPath: /menu-planner
questions:
  - ¿Cuál es el costo de comida de un plato?
  - ¿Qué precio le pongo a un plato?
  - ¿Por qué dice que un plato se vende bajo costo?
  - ¿Cómo cambio el porcentaje del aviso de precio?
keywords: [food cost, costo de comida, margen, precio sugerido, costo objetivo, bajo costo, subió de precio, aviso de precio, reposición, días de reposición, control de costos]
related: [purchases, recipes-and-cost, product-profitability, stock]
updated: 2026-10-15
order: 8
---

**Control de costos** es una función general: no usa IA y viene encendida en todos los planes. Sus tres ajustes están en **Configuración → IA y voz → Funciones → Control de costos**:

| Ajuste | Por defecto | Para qué |
|---|---|---|
| **Costo de comida objetivo** | 35 % | Costo de la receta ÷ precio. Por encima, el plato se marca y se propone un precio |
| **Avisar si un precio cambia más de** | 10 % | Frente a la última compra y al promedio de 90 días, en compras y facturas importadas |
| **Reponer para** | 7 días | Cuántos días de consumo cubre la cantidad sugerida en Reponer |

## Platos

- En el **catálogo** del Planificador, un plato marca **Costo 47 %** si pasa el objetivo o **Bajo costo** si el precio no cubre la receta.
- Al **editar el plato**, debajo del precio ves el costo de la receta y el %, y **Usar $…** pone el precio sugerido (redondeado a $100). Tú decides si lo guardas.
- Un **precio promocional** por debajo del costo muestra un aviso en las reglas del día.
- La campana y **Inicio → Necesita atención** avisan cuántos platos están bajo costo o sobre el objetivo.

Solo lo ve quien ve recetas o la rentabilidad.

## Precios de insumos

Cuando el costo promedio de un insumo sube más del porcentaje configurado en los últimos 7 días, la campana avisa «N insumos subieron de costo». En cada compra, la línea muestra cuánto subió o bajó. Ver [Registrar una compra](help:purchases).

> **Bueno saber:** ninguna de estas reglas cambia precios por su cuenta: solo avisan y proponen.
