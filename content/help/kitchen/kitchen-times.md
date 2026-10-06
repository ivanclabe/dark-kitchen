---
id: kitchen-times
section: kitchen
title: Tiempos y pedidos atrasados
summary: Cada estado tiene un tiempo objetivo; el tiempo de la tarjeta se pone ámbar cerca del límite y rojo al pasarlo, y Ver tiempos (SLA) muestra el cumplimiento del día.
audience: [kitchen, admin, manager]
permissions: [kitchen.view]
appPath: /operations?view=kitchen
questions:
  - ¿Cómo veo los pedidos atrasados?
  - ¿Qué significa el tiempo en rojo?
  - ¿Cómo van los tiempos de cocina?
  - ¿Qué es el SLA?
keywords: [tiempos, atrasados, SLA, cumplimiento, rojo, ámbar, demora, detenido, alertas]
related: [kitchen-view, kitchen-hours]
updated: 2026-10-06
order: 2
---

## Colores del tiempo

En cada tarjeta, **#número · tiempo** cambia de color:

- **Gris**: dentro del tiempo.
- **Ámbar**: cerca del límite (por defecto, al 80 %).
- **Rojo**: atrasado.

Los límites por defecto son **10 minutos en cola**, **20 preparando** y **15 listo esperando despacho**. Se cambian en **Configuración de cocina → Alertas**. Ver [Horario y tiempos objetivo](help:kitchen-hours).

La cifra **Atrasados** (arriba, en rojo) cuenta los pedidos fuera de tiempo ahora.

## Ver tiempos (SLA)

1. En la vista **Cocina**, abre **⋯ → Ver tiempos (SLA)**.
2. Elige el periodo: **Hoy**, **Última hora** o **Últimas 4 horas**.
3. Revisa **Cumplimiento**, **Atrasados ahora**, **Tiempo promedio** y **Mayor tiempo** (de confirmado a listo).
4. Abajo, los pedidos activos del más antiguo al más reciente, con **Dentro SLA**, **Cerca del límite** o **Fuera SLA**.
5. Para volver, toca **Volver a la pantalla de cocina**.

## Pedidos detenidos

Si tu cuenta tiene activadas las **Alertas de pedidos detenidos**, Quanela marca en rojo los platos que llevan demasiado sin avanzar («Hamburguesa · 13 min sin empezar») y puede decirlo en voz alta.
