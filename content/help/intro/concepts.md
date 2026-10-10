---
id: concepts
section: intro
title: "Conceptos: negocio, cuentas, roles y pedidos"
summary: Tu negocio tiene una o varias cuentas (cada local o cocina); cada persona trabaja en ellas con un rol, y todo gira alrededor del pedido.
audience: [everyone]
permissions: []
appPath: null
questions:
  - ¿Qué es una cuenta en Quanela?
  - ¿Cuál es la diferencia entre negocio y cuenta?
  - ¿Qué es un rol?
keywords: [cuenta, negocio, organización, rol, permisos, local, glosario]
related: [what-is-quanela, roles, switch-account]
updated: 2026-10-10
order: 2
---

## El negocio y sus cuentas

- **Negocio**: tu empresa en Quanela. Tiene su propia dirección web, con un código de 6 caracteres (por ejemplo `fr3rk6.quanela.com`). Por ahí entra todo tu equipo.
- **Cuenta**: cada establecimiento del negocio (un local, una cocina). Los pedidos, el inventario, los clientes y los reportes son **de cada cuenta**: lo de una no se mezcla con lo de otra.
- Si tienes varias cuentas, cambias entre ellas desde el indicador de arriba («Cuenta · ROL ▾»). Ver [Entrar a Quanela y cambiar de cuenta](help:switch-account).

## Personas y roles

- Cada persona entra con **su propio usuario** (correo y contraseña, o el método con el que creó el negocio).
- En cada cuenta tiene uno o varios **roles**, como CAJA o COCINA. El rol decide qué módulos ve y qué puede hacer. Ver [Qué ve cada rol](help:roles).
- Quien creó el negocio es el **SUPER_ADMIN**: tiene acceso a todas las cuentas. Es intransferible.

## El pedido, el centro de todo

Un pedido pasa por estos estados: **Por confirmar → En cola → Preparando → Listo → En ruta → Entregado**, o **Cancelado**. Ver [Estados del pedido](help:order-states).

Al **confirmar**, Quanela reserva los insumos de las recetas; al marcar cada plato **Listo**, los descuenta del inventario. Los platos con **Descuenta inventario** apagado se venden sin receta y no mueven el inventario. El pago es aparte: un pedido puede estar *Preparando* y *Pagado*, o *Preparando* y *Pago pendiente*.

## Glosario rápido

| Palabra | Qué es |
|---|---|
| Insumo | Lo que compras para cocinar (arroz, pollo, empaques) |
| Receta | Los insumos y cantidades de un plato; calcula su costo |
| Merma | Insumo que se perdió (vencido, dañado) |
| Cartera | Lo que te deben tus clientes |
| Domiciliario | Quien entrega los pedidos |
