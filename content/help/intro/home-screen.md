---
id: home-screen
section: intro
title: "Inicio: Destacado"
summary: Inicio (Destacado) muestra lo urgente, cómo va el negocio en el periodo que elijas, por hora o por día, y lo que pasa ahora mismo en la cocina, los turnos y la cartera.
audience: [owner, admin, manager, cashier, inventory]
permissions: [dashboard.view]
appPath: /dashboard
questions:
  - ¿Qué muestra Inicio?
  - ¿Qué necesita atención hoy?
  - ¿Dónde veo las ventas de hoy?
  - ¿Cómo veo las ventas de la semana pasada?
  - ¿Cómo cambio los paneles de Inicio?
  - ¿Qué es el tiempo en cocina?
keywords: [inicio, destacado, dashboard, resumen, hoy, alertas, necesita atención, métricas, gráficas, rango, granularidad, cada hora, paneles, personalizar, ticket promedio, cancelados, tiempo en cocina]
related: [notifications, operations-center, insights, navigation]
updated: 2026-10-20
order: 4
screenshots:
  - id: home
    alt: Pantalla Destacado con avisos, el selector de periodo y los paneles de pedidos, ventas y ticket promedio
    notes:
      - «Ventas de hoy» y cuántos pedidos van. El ojo las oculta (por ejemplo, si hay clientes cerca).
      - "El periodo: ← y → lo mueven; «Cada hora» o «Cada día» cambian el detalle de las gráficas."
      - El engranaje muestra, oculta y ordena los paneles.
      - "«Ahora mismo»: lo que necesita atención y la operación de este momento."
---

Inicio responde dos preguntas: **¿qué necesita atención?** y **¿cómo va el negocio?**

{{screenshot:home}}

## Arriba: lo destacado

Hasta tres tarjetas:

- **Lo urgente** (por ejemplo, pedidos atrasados), con el botón para resolverlo. No se puede descartar mientras siga pasando.
- **El siguiente paso** de tu negocio (por ejemplo, publicar tu menú web) o una guía de la ayuda.
- **Novedades** de Quanela.

La guía y las novedades se cierran con la **×** y no vuelven a aparecer en ese equipo.

## Los paneles

1. Elige el **periodo**: Hoy, Últimos 7 días, Últimos 30 días o Este mes. Con **←** vas al periodo anterior y con **→** vuelves. Las fechas son las de la zona horaria de tu cuenta (se ve al lado, por ejemplo «UTC-5»).
2. Elige el detalle: **Cada hora** (hasta 7 días) o **Cada día**.
3. Cada panel muestra la cifra del periodo, cuánto cambió frente al periodo anterior del mismo largo y su gráfica:

| Panel | Qué mide |
| --- | --- |
| Pedidos | Pedidos vendidos (sin los cancelados ni los que siguen por confirmar) |
| Ventas | Lo que suman esos pedidos |
| Ticket promedio | Ventas ÷ pedidos |
| Tiempo en cocina | Minutos promedio de Preparando a Listo |
| Cancelados | Cancelados sobre los pedidos confirmados o cancelados |
| Costo de comida | Costo de las recetas sobre las ventas (solo si puedes ver la rentabilidad) |
| Platos más vendidos | Los cinco con más unidades |
| Canales | En el local, Menú web, WhatsApp y Teléfono |

La variación sale en verde cuando es buena (más ventas, menos cancelados) y en rojo cuando no. Si el periodo anterior no tiene datos, lo dice en vez de inventar una comparación.

Con el **engranaje** muestras, ocultas y ordenas los paneles; se guarda en tu equipo para ti y esta cuenta. **Ver análisis** abre [Análisis](help:insights) para ir más a fondo.

## Ahora mismo

Debajo está la operación de este momento: **Necesita atención** (toca una tarjeta para ir a la lista ya filtrada), **Pedidos recientes**, **Cocina ahora**, **Cartera y compras** y **En turno ahora**.

Cada rol ve en Inicio solo lo suyo. COCINA y DOMICILIARIO no tienen Inicio: empiezan directo en su pantalla.
