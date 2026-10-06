---
id: home-screen
section: intro
title: "Inicio: la operación de hoy"
summary: Inicio muestra las ventas de hoy, lo que necesita atención (pedidos por confirmar, insumos bajo el mínimo, clientes con saldo vencido) y las alertas de la cuenta.
audience: [owner, admin, manager, cashier, inventory]
permissions: [dashboard.view]
appPath: /dashboard
questions:
  - ¿Qué muestra Inicio?
  - ¿Qué necesita atención hoy?
  - ¿Dónde veo las ventas de hoy?
keywords: [inicio, dashboard, resumen, hoy, alertas, necesita atención]
related: [operations-center, insights, stock]
updated: 2026-10-06
order: 4
screenshots:
  - id: home
    alt: Pantalla de Inicio con las ventas de hoy, el bloque Necesita atención y las tarjetas de Cocina ahora y Cartera
    notes:
      - «Ventas de hoy» y cuántos pedidos van. El ojo las oculta (por ejemplo, si hay clientes cerca).
      - Accesos rápidos a Compras, Clientes e Insights.
      - "«Necesita atención»: cada fila abre la lista ya filtrada."
      - "«Cocina ahora»: los pedidos por estado en este momento."
---

Inicio responde una pregunta: **¿qué está pasando hoy y qué necesita atención?**

{{screenshot:home}}

## Qué hay en Inicio

1. Arriba, el saludo, la hora y **Ventas de hoy** con el número de pedidos. Toca el ojo para ocultar la cifra.
2. **Alertas de la cuenta**, solo cuando hay algo: pedidos atrasados, insumos bajo el mínimo, avisos del plan. Toca **Ver** para ir a la causa.
3. **Necesita atención**: «Pedidos por confirmar», «Preparando o listos para despachar», «Clientes con saldo vencido» e «Insumos bajo el mínimo». Las filas en cero no aparecen; si todo está bien dice «Todo al día: nada pendiente por ahora.»
4. Las tarjetas **Pedidos recientes**, **Cocina ahora**, **Cartera y compras** y **En turno ahora**.

> **Bueno saber:** las tendencias (semanas, meses, comparaciones) están en [Insights](help:insights). Inicio es solo para el día de hoy.

Cada rol ve en Inicio solo lo suyo. COCINA y DOMICILIARIO no tienen Inicio: empiezan directo en su pantalla.
