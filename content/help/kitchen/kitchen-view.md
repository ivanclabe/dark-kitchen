---
id: kitchen-view
section: kitchen
title: Usar la vista Cocina
summary: La pantalla de la línea muestra los pedidos En cola, Preparando y Listo; los avanzas con un toque (Iniciar, Marcar listo) o arrastrando la tarjeta.
audience: [kitchen, admin, manager, cashier]
permissions: [kitchen.view]
appPath: /operations?view=kitchen
questions:
  - ¿Cómo uso el módulo de Cocina?
  - ¿Cómo uso la cocina?
  - ¿Cómo marco un pedido como listo?
  - ¿Cómo inicio un pedido en cocina?
  - ¿Cómo marco un plato listo?
  - ¿Cómo pongo un pedido prioritario?
keywords: [cocina, KDS, comanda, preparar, listo, en cola, iniciar, prioritario, tamaño grande, plato por plato]
related: [kitchen-times, kitchen-voice, kitchen-hours, order-states]
updated: 2026-10-06
order: 1
screenshots:
  - id: kitchen-view
    alt: Vista Cocina con las columnas En cola, Preparando y Listo y una tarjeta prioritaria
    notes:
      - Las cifras de la línea, con los atrasados en rojo.
      - Columnas En cola, Preparando y Listo.
      - "Cada tarjeta: sus platos, las observaciones y cuánto lleva (en rojo si está atrasado)."
      - El menú ⋯ (tiempos, tamaño grande, sonidos, configuración).
---

La vista **Cocina** es la pantalla de la línea: solo lo que hay que preparar.

{{screenshot:kitchen-view}}

## Preparar un pedido

1. Abre **Operación → Cocina**. Si tu rol es COCINA, entras directo aquí.
2. Los pedidos confirmados aparecen solos en **En cola**, con un sonido, los más antiguos y los **prioritarios** primero.
3. Toca **Iniciar** en la tarjeta: pasa a **Preparando**.
4. Cuando todo esté listo, toca **Marcar listo**: pasa a **Listo** y sus insumos se descuentan del inventario.
5. También puedes **arrastrar** la tarjeta entre En cola, Preparando y Listo, en los dos sentidos.

## Plato por plato

Toca la tarjeta para abrir el pedido. En la sección **Cocina** cada plato tiene su estado (**Pendiente**, **Preparando**, **Listo**) y sus botones **Iniciar** y **Listo**, y la flecha para retroceder un paso si te equivocaste.

## Prioridad y cancelación

En el detalle del pedido: **Prioritario** lo pone de primero (y **Quitar prioridad** lo regresa). **Cancelar pedido** está si tu rol lo permite.

> **Bueno saber:** desde Cocina no se confirman ni se despachan pedidos; eso es de caja. Si un pedido se queda quieto mucho tiempo, Quanela puede avisar en la tarjeta y en voz alta. Ver [Tiempos y pedidos atrasados](help:kitchen-times).

## Menú ⋯ de Cocina

- **Ver tiempos (SLA)**: cómo van los tiempos de hoy.
- **Tamaño grande**: letras y tarjetas más grandes para la tablet de la línea.
- **Sonidos y avisos de voz**: encender o apagar.
- **Respuesta hablada** y **Probar comando de texto** (si usas comandos de voz). Ver [Comandos de voz en cocina](help:kitchen-voice).
- **Configuración de cocina**: horario y alertas. Ver [Horario y tiempos objetivo](help:kitchen-hours).
