# ADR 0073: Una sola gama de color en la app

## Estado
**Aprobada (2026-10-20).** El propietario pidió «Manejemos una sola gama. Preferiblemente el blanco», mirando la barra superior y la pantalla de Personal, donde los botones naranja («Nuevo pedido», «Nuevo turno», «Marcar entrada») competían con la píldora blanca de la pestaña activa.

## Contexto
Desde ADR 0065 la acción principal era naranja (`brasa-700` con texto blanco) y los acentos de enlace, estado activo, foco y contadores usaban la escala `brasa`. La selección (chips, segmentos) ya usaba la tinta del tema. Resultado: dos gamas a la vez en cada pantalla.

## Decisión
- **La acción usa la tinta del tema.** `--color-primary` es `neutral-50` (blanco en oscuro, casi negro en claro y neutro) con `--color-on-primary` = `neutral-950`. Al pasar el cursor baja a `neutral-200` y al presionar a `neutral-300`. Como son alias de la escala, siguen al tema sin repetir valores, también en las secciones `.theme-light`.
- **Foco, selección de texto y cursor** pasan a la misma tinta.
- **Los acentos `brasa-*` de la app** (enlaces, pestañas y filas activas, tintes suaves, bordes de seleccionado, casillas, barras de progreso, puntos de «sin leer») pasan a `neutral-50` con la misma opacidad. Contraste: la tinta es el texto principal del tema, así que cumple AA donde antes cumplía el naranja.
- **El naranja queda para la marca:** la «q» del logo, el panel del inicio de sesión, la landing, la bienvenida tras entrar y el arte de avatares. Los colores de estado (éxito, aviso, peligro, info) y las escalas de datos (antigüedad de cartera) no cambian.
- DESIGN.md cambia «The One Ember Rule» por «The One Range Rule».

## Consecuencias
- Una pantalla tiene una sola gama: lo que se puede hacer resalta por brillo, no por color.
- Un componente nuevo no debe usar `brasa-*`; usa `primary`, la tinta (`neutral-50`) o un color de estado.
