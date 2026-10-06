---
id: roles
section: intro
title: Qué ve cada rol
summary: Cada rol abre módulos distintos y empieza en su pantalla; por ejemplo, Caja empieza en Operación y Cocina en la vista Cocina.
audience: [everyone]
permissions: []
appPath: null
questions:
  - ¿Qué puede hacer cada rol?
  - ¿Por qué no veo un módulo?
  - ¿Qué ve el rol de cocina?
  - ¿Dónde empieza cada rol?
keywords: [roles, permisos, ADMIN, GERENTE, CAJA, COCINA, INVENTARIO, DOMICILIARIO, acceso]
related: [users-and-roles, concepts]
updated: 2026-10-06
order: 3
---

Quanela trae seis **plantillas de rol**. Tu negocio puede crear roles propios con otros permisos (ver [Usuarios y roles](help:users-and-roles)).

| Rol | Para qué es | Empieza en | Ve en el menú |
|---|---|---|---|
| **ADMIN** | Todo, incluidos usuarios y configuración | Inicio | Todo |
| **GERENTE** | Toda la operación, sin administrar usuarios | Inicio | Todo menos Usuarios |
| **CAJA** | Pedidos, despacho, clientes, cobros y ventas | Operación → Tablero | Inicio, Operación, Catálogo, Clientes, Insights |
| **COCINA** | Preparación y menú del día | Operación → Cocina | Operación, Catálogo |
| **INVENTARIO** | Abastecimiento, recetas y costos | Inicio | Inicio, Catálogo, Abastecimiento, Insights |
| **DOMICILIARIO** | Sus entregas asignadas | Operación → Despacho | Operación (solo Despacho) |

## Cosas que conviene saber

- Si un botón aparece **gris**, pasa el cursor sobre él: dice por qué tu rol no puede usarlo (por ejemplo, «Solo caja o administración confirma pedidos»).
- **CAJA** ve las ventas en Insights, pero **no** los costos ni los márgenes (eso es «Rentabilidad»).
- El **DOMICILIARIO** solo ve los pedidos que le asignaron.
- Si tienes **varios roles**, eliges con cuál trabajar en el menú de usuario → «Cambiar de rol», o en el indicador de arriba («Trabajar como»).
- Todos los roles pueden usar **Copilot** y **«Oye Quanela»**, pero Copilot solo responde con lo que tu rol puede ver.
