---
id: kitchen-voice
section: kitchen
title: Comandos de voz en cocina
summary: "En la vista Cocina di el número del pedido y la acción, por ejemplo «pedido 1042 listo»: lo ejecuta y te responde en voz alta."
audience: [kitchen, admin, manager]
permissions: [kitchen.prepare]
appPath: /operations?view=kitchen
questions:
  - ¿Cómo uso los comandos de voz en cocina?
  - ¿Qué puedo decirle a Quanela en cocina?
  - ¿Cómo marco un pedido listo con la voz?
  - No me entiende los comandos de voz
keywords: [voz, comandos, dictar, micrófono, pedido listo, iniciar, prioridad, manos libres, cocina]
related: [oye-quanela, kitchen-view]
updated: 2026-10-06
order: 3
---

En la vista **Cocina** puedes mover pedidos con la voz. Funciona con el botón del micrófono o diciendo **«Oye Quanela»** si tienes el manos libres encendido (ver [Activar «Oye Quanela»](help:oye-quanela)).

1. Toca el **micrófono** de la cocina (o di «Oye Quanela»).
2. Di el **número del pedido** (4 dígitos) y **la acción**, por ejemplo: «**pedido 1042 listo**».
3. Haz una pausa: Quanela lo ejecuta y responde («Pedido 1042 listo.»).

## Qué puedes decir

| Para | Di |
|---|---|
| Empezar | «pedido 1042 **iniciar**» o «en preparación» |
| Terminar | «pedido 1042 **listo**» o «terminado» |
| Priorizar | «pedido 1042 **prioritario**» o «urgente» |
| Quitar prioridad | «pedido 1042 **quitar prioridad**» |
| Cancelar | «**cancelar** pedido 1042» |

## Si algo no sale

- «**No entendí el comando.**»: falta el número o la acción. Dilos los dos.
- «**El pedido 1042 no existe.**»: no está en la pantalla de cocina.
- «**El pedido 1042 ya está listo.**»: ya estaba en ese estado.
- Con el reconocimiento **sin internet**, los pedidos se cancelan desde la pantalla, no con la voz.

> **Bueno saber:** si dices una **pregunta** («¿cuánto vendimos hoy?»), no es un comando: la responde Copilot. Y un comando dicho **fuera** de la vista Cocina no se ejecuta.

Para probar sin hablar: **⋯ → Probar comando de texto** y escribe «pedido 2040 listo».
