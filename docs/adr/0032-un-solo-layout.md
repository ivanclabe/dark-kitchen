# ADR 0032: Un solo layout (el de Abastecimiento)

## Estado
**Aceptada e implementada (2026-10-06).** Lo pediste directamente: «Mantén el [layout] usado en Abastecimiento en los demás módulos, como Configuración, Perfil y Clientes».

Actualiza la ADR 0029 (variantes de `Page`) y la ADR 0026 (navegación vertical de Configuración). No cambia datos, permisos, rutas ni comportamiento.

## Contexto: qué era distinto
| Pantalla | Antes | Abastecimiento |
|---|---|---|
| Clientes, Detalle de cliente, Insights, Receta, Platos compartidos, Inicio | `Page default`: `max-w-6xl` **centrado** | A todo el ancho, alineado a la izquierda |
| Mi perfil, Mis turnos | `Page narrow`: `max-w-3xl` **centrado** | |
| Configuración, Usuarios | `SectionLayout`: `max-w-6xl` centrado, con una **lista vertical** de secciones a la izquierda y el contenido limitado a `max-w-4xl` | La barra subrayada **horizontal** de secciones, bajo el encabezado |
| Inicio | Una portada propia, sin `PageHeader` | `PageHeader` |

## Decisión
- **`Page` tiene un solo ancho para todas las pantallas:** el de `<main>`, alineado a la izquierda. Solo cambia la altura:
  - `board` ocupa toda la altura y el contenido se desplaza dentro;
  - `default` desplaza la página.
  - La variante `narrow` desaparece.
- **Las secciones se navegan con la misma barra subrayada en todo el sistema:**
  - `SubNav` (pestañas) cuando las secciones están en la misma página;
  - `SubNavLinks` (enlaces) cuando cada sección tiene su dirección.
  - `SectionLayout` (Configuración, Usuarios) es ahora `Page` + `PageHeader` + `SubNavLinks`.
- **El encabezado de cada sección de Configuración** (`SettingsPage`) conserva la descripción y la acción principal. El título repetido queda solo para lectores de pantalla, porque la barra ya dice dónde estás, igual que en Abastecimiento. El contenido ya no tiene ancho máximo.
- **Inicio usa `PageHeader`** («Inicio», el mismo icono del rail). Conserva el saludo con la fecha y el reloj, las ventas de hoy (que se pueden ocultar) y los accesos rápidos a la derecha.
- **Se mantienen:**
  - las `Tabs` (pastillas) para vistas de los mismos datos (Operación, Catálogo, Personal);
  - los iconos de las secciones de Configuración, que se siguen usando en el menú de usuario.

## Validación
| Prueba | Resultado |
|---|---|
| El contrato de layout (`pageContract.test.ts`) | Ahora exige `PageHeader` también en Inicio. Ninguna pantalla puede tener un ancho propio |
| Vitest | 449/449 (las pruebas de Configuración y Usuarios se actualizaron a la barra horizontal) |
| `tsc` | limpio |
| oxlint | 14 avisos, sin nuevos |
| Builds de la app y del portal | pasan |

**Pendiente:** revisarlo en el navegador con tu sesión. Sin sesión, la vista previa se queda en el login.
