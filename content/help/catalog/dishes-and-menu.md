---
id: dishes-and-menu
section: catalog
title: Platos y menú del día
summary: En Catálogo creas tus platos con su precio y armas el menú de cada día arrastrándolos al calendario; en cada día puedes poner horario, precio promocional o límite de unidades.
audience: [owner, admin, manager, kitchen]
permissions: [products.create, menus.edit]
appPath: /menu-planner
questions:
  - ¿Cómo creo un plato?
  - ¿Cómo cambio el precio de un plato?
  - ¿Cómo armo el menú del día?
  - ¿Cómo pongo un plato en promoción?
  - ¿Cómo marco un plato como agotado?
  - ¿Cómo copio el menú de la semana pasada?
keywords: [plato, producto, precio, categoría, menú, planificador, calendario, promoción, agotado, copiar menú, desactivar plato]
related: [recipes-and-cost, create-order, setup-account]
updated: 2026-10-06
order: 1
screenshots:
  - id: menu-planner
    alt: Catálogo con la lista de platos a la izquierda y el calendario de la semana a la derecha
    notes:
      - «Catálogo de platos», con «Nuevo» y el buscador.
      - Semana o Mes.
      - «Copiar» repite la planificación de otra semana o día.
      - "Un día del calendario: arrastra platos aquí."
---

{{screenshot:menu-planner}}

## Crear un plato

1. Abre **Catálogo** y, en **Catálogo de platos**, toca **Nuevo**.
2. Escribe el **Nombre** y el **Precio de venta** (obligatorios). Opcional: **Código**, **Categoría** (o crea una nueva ahí mismo), **Descripción** y fotos.
3. Toca **Crear plato**.
4. Ahora crea su receta: toca el lápiz del plato (**Editar plato**) → **Crear receta**. Ver [Recetas y costo de un plato](help:recipes-and-cost).

Para cambiar el precio o el nombre, toca **Editar plato**, cambia lo que necesites y toca **Guardar cambios**. Ahí también puedes **Desactivar** un plato: deja de salir al crear pedidos, pero no se borra.

> **Cuidado:** un plato sin receta muestra **Sin receta** y no se puede confirmar en un pedido.

## Armar el menú de cada día

1. Elige **Semana** o **Mes** arriba.
2. **Arrastra** un plato de la lista a un día, o selecciona el día y toca **+** en el plato para agregarlo ahí.
3. Para quitarlo, toca la **×** del plato en ese día.

## Reglas de un plato en un día

Toca el plato dentro del día. Puedes:

- Marcarlo **agotado / inactivo** ese día (el botón cambia entre **Disponible este día** y **Marcado agotado / inactivo**).
- Darle un horario (**Desde** / **Hasta**).
- Ponerle un **Precio promocional** (vacío = precio normal).
- Fijar un **Límite de unidades** o **Disponible hasta agotar existencias**.

Toca **Guardar cambios**. Para repetir esas reglas en los días siguientes, elige la fecha en **Aplicar estas mismas reglas también hasta…** y toca **Aplicar**.

## Copiar la planificación

Toca **Copiar**, elige **Una semana completa** o **Un día puntual**, el origen y el destino. 

> **Cuidado:** copiar **reemplaza** todo lo que haya en el destino. No crea platos ni recetas: solo repite la asignación al calendario.

> **Bueno saber:** al crear un pedido aparecen todos los platos **activos**. El calendario es tu plan del menú. Si manejas varias cuentas, **Platos compartidos** (arriba, para quien tiene permiso) mantiene platos con su receta en un solo lugar para usarlos en todas.
