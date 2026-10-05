# ADR 0029: Consistencia visual en toda la app

## Estado
**Aprobada (2026-10-05) con D1–D5 e implementada** (resultados en la sección 9). Falta el recorrido visual con sesión.

**Reglas:**
- Es un cambio de presentación: no toca la lógica, los datos, RBAC, la RLS ni el tenant.
- Textos en español; la marca es **Quanela**.
- El manual no se toca.

**Alcance:** las pantallas de la app con sesión, las que viven dentro de `AppLayout`. Quedan fuera:
- la landing, el login, el registro y la activación, que tienen su propio diseño;
- el portal Global Admin.

---

## 1. Auditoría (2026-10-05)

### 1.1 Inventario de pantallas
| Pantalla | Contenedor | Encabezado | Navegación interna | Indicadores |
|---|---|---|---|---|
| Dashboard | Ancho completo | Propio (saludo, reloj y accesos) | — | Tarjetas propias |
| Pedidos | Ancho completo (tablero) | `PageHeader` con icono | Pastillas naranjas (Tablero · Lista · Despacho) | — |
| Cocina | Ancho completo (tablero) | **`h1` a mano** | — | Franja propia |
| Catálogo (planificador) | Ancho completo | `PageHeader` con icono | Pastillas naranjas (Semana · Mes) | — |
| Platos compartidos | Ancho completo | `PageHeader` con icono | — | — |
| Receta | Ancho completo | `PageHeader` con icono | — | `StatCard` sueltas |
| Abastecimiento | Ancho completo | `PageHeader` con icono | **Pastillas naranjas para secciones** (Stock · Compras · Proveedores) | — |
| Personal | Ancho completo | `PageHeader` con icono | Pastillas naranjas (Hoy · Semana · Horas) | — |
| **Clientes** (ADR 0028) | **`max-w-6xl`** | **`h1` sin icono** | — | `KpiStrip` |
| **Detalle de cliente** | **`max-w-6xl`** | `PageHeader` con icono | Subrayado | `KpiStrip` |
| **Insights** (ADR 0027) | **`max-w-6xl`** | **`h1` sin icono** | Subrayado | `KpiStrip` |
| **Usuarios / Configuración** (ADR 0026) | **`max-w-6xl` + columna `4xl`** | **`h1` sin icono** | Lista lateral y subrayado | `StatCard` en Actividad y en IA |
| Mi perfil | **`max-w-3xl` alineado a la izquierda** | `PageHeader` con icono | — | — |
| Mis turnos | **`max-w-3xl` centrado** | `PageHeader` con icono | — | — |

### 1.2 Inconsistencias
| Tema | Qué pasa |
|---|---|
| **Encabezado** | Conviven **dos estilos**. El `PageHeader` del sistema (icono naranja, título y descripción) está en la mayoría. Las pantallas nuevas (Clientes, Insights, Configuración, Usuarios) y Cocina usan un `h1` a mano **sin icono**. Al pasar de Pedidos a Clientes, el título salta de posición y cambia de aspecto |
| **Ancho** | Cuatro criterios: ancho completo, `6xl` centrado, `3xl` centrado y `3xl` **a la izquierda** (Mi perfil). Clientes e Insights están centrados, mientras Pedidos y Abastecimiento ocupan todo el ancho |
| **Navegación interna** | Las pastillas naranjas (`Tabs`) sirven **tanto para cambiar de vista** (Semana/Mes, Tablero/Lista) **como para cambiar de sección** (Stock/Compras/Proveedores). Las secciones de Configuración, Usuarios, Insights y del cliente usan el subrayado (`SettingsSubNav`). La misma idea se ve de dos formas |
| **Indicadores** | `StatCard` sueltas (Receta, Actividad, IA y voz, Abastecimiento) frente a `KpiStrip` en una franja (Insights y Clientes) |
| **Espaciado** | Entre el encabezado y el contenido y entre bloques: `space-y-4`, `space-y-5`, `space-y-6` y `gap-4` según la página |
| **Ubicación de componentes** | `SettingsSubNav` y `SettingsSection` viven en `settings/ui`, pero ya los usan Usuarios, Insights y Clientes. `KpiStrip` y `SortableHeader` ya están en `shared/ui` |

## 2. Reglas comunes

### 2.1 Un solo encabezado: `PageHeader`
**Todas** las pantallas de la app usan `PageHeader`: icono, título, descripción y acciones a la derecha, con la acción principal al final.
- **Cambian** Clientes, Insights, Cocina y los marcos de Configuración y Usuarios. El icono es el mismo del rail: Clientes `Users`, Insights `BarChart3`, Cocina `ChefHat`, Configuración `Settings` y Usuarios `UserCog`.
- **El Dashboard** conserva su encabezado propio (saludo y reloj): es la portada.
- **Las secciones de Configuración y Usuarios** mantienen su título h2 (`SettingsPage`) debajo del `PageHeader` del área: es una jerarquía, no otro estilo.

### 2.2 Un solo contenedor: `Page`, con tres anchos
Componente nuevo en `shared/ui/Page.tsx`: `Page` (contenedor) y su `PageHeader`.

| Variante | Ancho | Para | Pantallas |
|---|---|---|---|
| `board` | Ancho completo, alto completo (`flex h-full flex-col`) | Tableros y calendarios que llenan la pantalla | Pedidos, Cocina, Catálogo (planificador), Abastecimiento, Personal |
| `default` | `max-w-6xl`, centrado | Todo lo demás | Dashboard, Clientes y su detalle, Insights, Usuarios, Configuración, Receta, Platos compartidos |
| `narrow` | `max-w-3xl`, **centrado** | Formularios personales | Mi perfil, Mis turnos |

**El espaciado vive en `Page`, no en cada pantalla:**

| Separación | Valor |
|---|---|
| Del encabezado al contenido, y entre bloques | `gap-6` / `space-y-6` |
| Entre grupos con título (`SettingsSection`) | `space-y-8` (sin cambio) |
| Márgenes de la página | Los de `<main>` (`p-4 sm:p-6 lg:p-8`), sin cambio |

Ninguna pantalla define su propio `max-w` ni su `space-y` de página.

### 2.3 Dos patrones de navegación, cada uno con su significado
| Patrón | Componente | Cuándo | Ejemplos |
|---|---|---|---|
| **Secciones** (otra información) | `SubNav`, subrayado. Se mueve de `settings/ui/SettingsSubNav` a `shared/ui/SubNav` | Contenido distinto en cada pestaña | Abastecimiento **(cambia: Stock · Compras · Proveedores)**, Insights, Configuración, Usuarios y detalle de cliente |
| **Vistas** (los mismos datos, otra forma) | `Tabs`, la pastilla segmentada | Cambiar cómo se ve lo mismo | Pedidos (Tablero · Lista · Despacho), Catálogo (Semana · Mes) y Personal (Hoy · Semana · Horas) |

- **La pastilla de vista** va en las acciones del encabezado o justo debajo.
- **La subnavegación de secciones** va debajo del encabezado, a todo el ancho.

### 2.4 Indicadores
| Caso | Componente |
|---|---|
| **Grupo de cifras** (3 o más) | `KpiStrip` (una franja). **Cambian** Actividad → Operación (4 cifras), IA y voz → Uso (3) y Receta (3) |
| **Una cifra destacada aislada** | `StatCard` (detalle de proveedor o de insumo, panel de reposición y SLA de Cocina): sin cambio |

### 2.5 Componentes compartidos en `shared/ui`
Se mueven a `shared/ui` los que ya usan varios módulos, con el mismo comportamiento:

| Antes (`settings/ui`) | Después (`shared/ui`) |
|---|---|
| `SettingsSubNav` | `SubNav` |
| `SettingsSection` | `Section` |
| `SettingsSaveBar` | `SaveBar` |
| `SectionLayout` | `SectionLayout` |

- **`settings/ui`** conserva `SettingsPage` y `StatusBadge` (propios de Configuración) y reexporta los nombres viejos, así nada se rompe.
- **`shared/ui/index.ts`** los exporta.

## 3. Cambios por pantalla (solo presentación)
| Pantalla | Cambio |
|---|---|
| Clientes y su detalle | `Page default` y `PageHeader` con icono |
| Insights | `Page default`, `PageHeader` con icono y `SubNav` debajo |
| Configuración y Usuarios | `SectionLayout` usa `PageHeader` con icono; Actividad e IA usan `KpiStrip` |
| Cocina | `PageHeader` con icono (`ChefHat`) y la línea de estado como descripción |
| Abastecimiento | Las secciones pasan de pastillas a `SubNav` |
| Pedidos, Catálogo, Personal | `Page board`; las vistas siguen en pastillas |
| Receta | `Page default`; sus 3 cifras en `KpiStrip` |
| Platos compartidos | `Page default` |
| Dashboard | `Page default` (hoy ocupa todo el ancho) |
| Mi perfil y Mis turnos | `Page narrow`, **centrados los dos** |

## 4. Pruebas
- **Vitest (nuevas):**
  - `Page` aplica cada variante;
  - una prueba de **contrato**: cada página de la app usa `PageHeader`, salvo el Dashboard. Recorre `src/modules/*/pages` y falla si una página nueva arma su `h1` a mano, para que la inconsistencia no vuelva;
  - Abastecimiento usa la subnavegación.
- **Pruebas existentes:** siguen pasando (los textos y los roles ARIA no cambian).
- **Resto:**
  - `tsc`, `oxlint` y ambos builds;
  - el navegador con tu sesión: recorrer Dashboard → Pedidos → Cocina → Catálogo → Abastecimiento → Clientes → Personal → Insights → Usuarios → Configuración y comprobar que el encabezado no cambia de posición ni de estilo, a 1440, 1024, 768 y 390 px.

## 5. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Encabezado | **`PageHeader` con icono en todas** (es el del sistema y el de la mayoría). El Dashboard conserva su portada |
| **D2** | Anchos | **Tres variantes**: `board` (tableros a todo el ancho), `default` (`6xl` centrado) y `narrow` (`3xl` centrado) |
| **D3** | Dashboard | **`default` (`6xl` centrado)**, como Insights, con el que comparte el estilo de resumen |
| **D4** | Navegación | **Secciones = subrayado, vistas = pastillas.** Abastecimiento pasa a subrayado |
| **D5** | Indicadores | **`KpiStrip` para grupos**; `StatCard` solo para cifras aisladas |

## 6. Riesgos
| Riesgo | Mitigación |
|---|---|
| Tocar muchas pantallas a la vez | Solo cambian el contenedor, el encabezado y la navegación; ni la lógica ni los textos. Las pruebas existentes cubren el comportamiento |
| Los tableros pierden altura completa | La variante `board` conserva `flex h-full min-h-0 flex-col` |
| Imports rotos al mover componentes | `settings/ui` reexporta los nombres viejos; `tsc` lo verifica |

## 7. Orden de ejecución
| Fase | Qué |
|---|---|
| 1 | `shared/ui`: `Page`, y mover `SubNav`, `Section`, `SaveBar` y `SectionLayout` con sus reexportaciones |
| 2 | Encabezados: Clientes, Insights, Cocina, Configuración y Usuarios |
| 3 | Contenedores en todas las pantallas (`board`, `default` o `narrow`) |
| 4 | Navegación de Abastecimiento; `KpiStrip` en Actividad, IA y Receta |
| 5 | Prueba de contrato, vitest, `tsc`, `oxlint` y builds |
| 6 | Documentación: esta ADR con resultados y la arquitectura |

## 8. Qué necesito de ti
1. **Aprobar esta ADR**, con D1 a D5 confirmadas o corregidas.
2. **Iniciar sesión** en la vista previa para recorrer la app y validar que nada salta.

## 9. Resultados (2026-10-05)

### 9.1 Componentes en `shared/ui`
- **Nuevo:**
  - `Page` (`board` · `default` · `narrow`) con el ancho y el espaciado de la página;
  - `pageContract.test.ts`.
- **Movidos de `settings/ui`:**

  | Antes | Después |
  |---|---|
  | `SettingsSubNav` | `SubNav` |
  | `SettingsSection` | `Section` |
  | `SettingsSaveBar` | `SaveBar` |
  | `SectionLayout` | `SectionLayout` (ahora con `PageHeader` e icono) |

- **Imports:** se actualizaron en toda la app en lugar de dejar reexportaciones (`tsc` lo verifica). `settings/ui` conserva `SettingsPage` y `StatusBadge`.
- **`PageHeader`:** la descripción es un `div` (admite la línea de estado de Cocina).
- **`KpiStrip`:** agrega la variante de 3 columnas.

### 9.2 Pantallas
| Pantalla | Encabezado | Contenedor | Otros |
|---|---|---|---|
| Dashboard | Portada propia | `default` | — |
| Pedidos | `PageHeader` (sin cambio) | `board` | Vistas en pastillas |
| Cocina | **`PageHeader` + `ChefHat`** (la línea de estado como descripción) | `board` | — |
| Catálogo (planificador) | `PageHeader` | `board` | Semana · Mes en pastillas |
| Platos compartidos, Receta | `PageHeader` | `default` | Receta mantiene 2 `StatCard`: son 2 cifras, no un grupo |
| Abastecimiento | `PageHeader` | `board` | **Stock · Compras · Proveedores pasan a `SubNav`** |
| Personal | `PageHeader` | `board` | Hoy · Semana · Horas siguen en pastillas (son vistas) |
| Clientes | **`PageHeader` + `Users`** | `default` | — |
| Detalle de cliente | `PageHeader` | `default` | — |
| Insights | **`PageHeader` + `BarChart3`** | `default` | `SubNav` a todo el ancho |
| Configuración | **`PageHeader` + `Settings`** (vía `SectionLayout`) | Su marco | Actividad e IA y voz usan **`KpiStrip`** |
| Usuarios | **`PageHeader` + `UserCog`** (vía `SectionLayout`) | Su marco | — |
| Mi perfil, Mis turnos | `PageHeader` | `narrow` | **Los dos centrados** |

Las pestañas de Insights (`pages/tabs.tsx`) pasaron a `components/InsightsTabs.tsx`: no son una página.

### 9.3 Contrato
`pageContract.test.ts` recorre `src/modules/*/pages` (fuera quedan auth, registro, landing, activación y «Tus cuentas») y exige, en cada página:
- **ningún `h1` a mano;**
- **ningún ancho propio centrado;**
- **`PageHeader`** (o el marco de Configuración/Usuarios), salvo la portada del Dashboard;
- **`Page`** (o el marco de Configuración/Usuarios).

Hoy lo cumplen **20 pantallas**.

### 9.4 Validación
| Prueba | Resultado |
|---|---|
| Vitest | **389/389** (contrato 21) |
| `tsc` | limpio |
| oxlint | 16 avisos, sin nuevos |
| Builds de la app y del portal | pasan |

**Pendiente:** el recorrido en el navegador con sesión. La vista previa redirige al login.
