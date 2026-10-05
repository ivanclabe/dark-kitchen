# ADR 0026: Configuración de la cuenta consistente

## Estado
**Aprobada (2026-10-05) con D1–D6 e implementada** (resultados en la sección 9). Falta la revisión visual con sesión.

**Reglas:**
- Es un cambio de UX/UI y de navegación.
- No toca la lógica de negocio, RBAC, RLS, tenant, billing ni la base de datos.
- Código y URL en inglés; textos en español.
- La marca es **Quanela**.
- El manual no se toca.

**«AI Inbox»:** en Quanela no existe una función con ese nombre. La sección que corresponde es **Configuración → IA y voz** (ADR 0018/0024), y de ella trata este ADR.

---

## 1. Auditoría (2026-10-05)

### 1.1 Estructura actual
```
/k/{cuenta}/settings            SettingsLayout: PageHeader «Configuración» + RouteTabs (pastillas naranjas) + <Outlet/>  (max-w-6xl)
  ├─ general        KitchenGeneralPage   (max-w-3xl)  4 cards + «Tu negocio» (2 cards, max-w-3xl) + «Estado de la cuenta»
  ├─ billing        BillingSettingsPage  (max-w-4xl)  texto suelto + PlanPanel + grid de 2 cards
  ├─ ai             AiSettingsPage       (ancho completo 6xl) + Tabs (pastillas naranjas) con 5 pestañas
  │                    Funciones · Voz de cocina · En este equipo · Uso · Estado
  ├─ integrations   IntegrationsSettingsPage (max-w-3xl) 1 card
  └─ activity       ActivitySettingsPage (ancho completo 6xl) + Tabs (pastillas naranjas): Operación · Bitácora
```
- **Rail:** Usuarios y Configuración.
- **Menú de usuario:** «Configuración de la cuenta» como submenú con las 5 secciones, más Usuarios y Roles y permisos.

### 1.2 Inconsistencias
| Tema | Qué pasa hoy |
|---|---|
| **Ancho** | Hay **4 anchos distintos**: 3xl (General, Integraciones, Voz), 4xl (Facturación, Estado), y el completo de 6xl (Funciones, Uso, Actividad). Al cambiar de pestaña, el contenido salta de ancho |
| **Encabezado** | Solo existe el de «Configuración». Ninguna sección dice qué es ni qué hace; algunas lo explican con un párrafo suelto (`typography.small`) y otras no |
| **Navegación** | Las secciones (`RouteTabs`) y las subsecciones de IA y Actividad (`Tabs`) usan **la misma pastilla naranja**. Son dos barras idénticas, una sobre otra: la secundaria compite con la principal |
| **IA y voz** | **5 subpestañas**: «Funciones» y «Voz de cocina» configuran lo mismo (la voz es una función). «Uso» y «Estado» muestran información, no configuración. «En este equipo» es una preferencia del dispositivo. «Estado» repite el plan, que ya está en Facturación |
| **Contenedores** | Se mezclan `Card`, divs a mano (`rounded-2xl border bg-neutral-900/60 p-5`) y listas con `bg-neutral-900/40`. Hay 6 cards en General para 2 formularios |
| **Títulos** | Se usan h2, h3, `overline` y `small` para el mismo concepto, «título de grupo» |
| **Guardar** | Hay varios textos para la misma acción: «Guardar cambios», «Guardar», «Guardar para todas tus cuentas», «Guardar solo para esta cuenta», «Usar la voz de la plataforma»… El estado «guardado» solo se avisa con un toast |
| **Estados** | Las variantes de `LoadingState` cambian por página (block, cards). `EmptyState`, `ErrorState` y `Badge` ya son comunes y se mantienen |
| **Menú de usuario** | Repite las 5 secciones, Usuarios y Roles y permisos, que ya están en el rail y en la propia Configuración: la misma configuración aparece en tres lugares |

### 1.3 Qué ya existe y se reutiliza
- **Componentes:** `Card`, `FormField`/`Input`/`Select`, `Button` (con `loading`), `Badge`, `EmptyState`, `ErrorState`, `LoadingState`, `Toast`, `Accordion`, `Switch` y `DataTable`.
- **Tipografía:** la escala de `typography` (h1, h2, h3, small, caption y label).
- **Paneles:** `PlanPanel`, `FeaturesPanel`, `FeatureSettingsSection`, `KitchenVoicePanel`, `EventLog`, `AccountStatusCard` y `ScopeChoice`.

No se crean componentes duplicados por página.

## 2. Sistema común de Configuración

### 2.1 Estructura
```
Configuración · {cuenta}                                  ← encabezado del layout (h1)
┌──────────────┬───────────────────────────────────────────────┐
│ General      │  Título de la sección (h2)        [acción]    │  ← SettingsHeader
│ Facturación  │  Descripción breve                            │
│ IA y voz     │  ─ subnavegación (solo IA y voz, Actividad) ─ │  ← SettingsSubNav (subrayado, menor peso)
│ Integraciones│                                               │
│ Actividad    │  Grupos (SettingsSection) y cards             │  ← un solo ancho
└──────────────┴───────────────────────────────────────────────┘
```

### 2.2 Navegación
- **Principal, en escritorio (≥ lg):**
  - una lista vertical a la izquierda (ancho de 13 rem), que queda fija mientras la página se desplaza;
  - activa: fondo `neutral-800`, texto claro y una barra naranja a la izquierda;
  - inactiva: texto `neutral-400`.
- **Principal, en celular y tablet (< lg):** una barra horizontal que se desplaza, con pastillas neutras. **Ya no son naranjas**, para que no compitan.
- **Secundaria** (`SettingsSubNav`):
  - pestañas de texto con un subrayado naranja en la activa;
  - más chicas y sin iconos;
  - van bajo el encabezado de la sección y se sienten subordinadas;
  - siguen en la URL (`?tab=`) y conservan la semántica ARIA de tabs.
- **Pastillas naranjas (`Tabs`):** se siguen usando en el resto de la app (Pedidos, Catálogo…), que no cambia.

### 2.3 Ancho, espaciado y tipografía
- **Ancho único** para todas las secciones: `max-w-4xl` en la columna de contenido. El contenido real cabe:
  - los formularios a 2 columnas;
  - el plan con 3 indicadores de uso;
  - Operación con 4 indicadores.
- **Variante `wide`:** existe en el layout para una tabla que la justifique, pero **ninguna sección la usa hoy**.
- **Espaciado (escala única):**

  | Elemento | Valor |
  |---|---|
  | Entre grupos de la página | `space-y-8` |
  | Dentro de un grupo | `space-y-4` |
  | Card | `p-5` |
  | Campos del formulario | `gap-4` |
  | Encabezado de sección | `mb-6` |

  Se eliminan los valores sueltos.
- **Jerarquía de títulos:**

  | Nivel | Estilo | Uso |
  |---|---|---|
  | Página | `h1` | Solo en el layout |
  | Sección | `h2` | En `SettingsHeader` |
  | Grupo | `h3` + `caption` | En `SettingsSection` |
  | Campo | `label` | En `FormField` |
  | Texto | `body`/`small` | Contenido |
  | Ayuda | `caption` | Notas |

  Un solo estilo por concepto.

### 2.4 Componentes (en `src/modules/settings/ui/`, sin duplicar los compartidos)
| Componente | Qué es |
|---|---|
| `SettingsLayout` | El layout: encabezado, navegación principal (vertical u horizontal) y columna de contenido con ancho único |
| `SettingsPage` | Cada sección: `SettingsHeader` (título, descripción y acción) + subnavegación opcional + contenido, con la variante `wide` |
| `SettingsSubNav` | La navegación secundaria con subrayado |
| `SettingsSection` | Un grupo con título h3, descripción y contenido. Sin card cuando no hace falta |
| `SettingsSaveBar` | La barra de guardado común (2.5) |
| `StatusBadge` | Un mapa único de estados (activa, en prueba, pendiente, pagada, fallida, anulada…) para Facturación |

Se reutilizan sin cambios `Card`, `FormField`, `Button`, `EmptyState`, `ErrorState`, `LoadingState`, `Badge` y `DataTable`.

### 2.5 Guardado (un solo patrón)
- **Al final de cada formulario:**
  - «Descartar» y **«Guardar cambios»**, visibles solo cuando hay cambios;
  - mientras guarda: «Guardando…» (`loading`);
  - al terminar: «✓ Guardado» en línea durante 3 s, más el toast;
  - si falla: un mensaje en línea con «Reintentar», más el toast.
- **IA y voz:** el alcance se elige con `ScopeChoice` («Aplica a todas tus cuentas» o «Solo esta cuenta»). El botón **siempre dice «Guardar cambios»** y el alcance se lee en la selección.
- **Restablecer:** las acciones como «Valores de fábrica» o «Usar la voz general» son secundarias (`ghost`), con el mismo texto en todas partes: «Restablecer».

### 2.6 Estados
| Estado | Cómo se muestra |
|---|---|
| **Cargando** | `LoadingState variant="block"` dentro de la columna, igual en todas las secciones |
| **Vacío** | `EmptyState`: icono, título, descripción y acción |
| **Error** | `ErrorState`: mensaje y «Reintentar» |
| **Éxito** | `SettingsSaveBar` y el toast |

## 3. Cada sección
| Sección | Cambios (solo de presentación) |
|---|---|
| **General** | Encabezado «General · Nombre, identificador y datos de esta cuenta». Grupos: **«Esta cuenta»** (nombre, identificador, icono y zona horaria) y **«Datos fiscales y de contacto»**, en **un solo formulario**. Luego **«Tu negocio · Aplica a todas tus cuentas»**, un formulario aparte porque tiene otro permiso y otro alcance. Al final, la **«Zona de peligro»** con desactivar la cuenta. Las 6 cards pasan a 3 grupos |
| **Facturación** | Encabezado «Facturación · Tu plan aplica a todas tus cuentas». Grupos: «Plan» (resumen y uso), «Qué incluye», «Facturas» (tabla con `StatusBadge` y `EmptyState`) y «Método de pago» |
| **IA y voz** | Ver 3.1 |
| **Integraciones** | Encabezado «Integraciones · Conecta sistemas externos a esta cuenta». Grupo «ID de la cuenta» y la nota de canales |
| **Actividad** | Encabezado «Actividad · Cómo opera esta cuenta y quién hizo qué». Subnavegación **Operación · Bitácora**. Mismos indicadores; la bitácora conserva sus filtros |

### 3.1 IA y voz: de 5 subpestañas a 3
| Hoy | Qué es | Después |
|---|---|---|
| Funciones | Configuración | **Funciones** |
| Voz de cocina | Configuración de una función (la voz) | **Dentro de Funciones**, en los ajustes de «Voz de la aplicación» |
| En este equipo | Preferencia del dispositivo | **Este dispositivo** |
| Uso | Información | **Uso y estado** |
| Estado | Información (conexión, plan) | **Dentro de Uso y estado**. El plan ya está en Facturación: aquí solo el tope diario |

- **Resultado:** `IA y voz → Funciones · Este dispositivo · Uso y estado`.
- **Sin el permiso de funciones** (por ejemplo, el administrador de una cuenta), solo existe «Este dispositivo» y **no se muestra subnavegación**.
- **Las URL viejas** `?tab=voice` y `?tab=status` llevan a su nuevo lugar.

### 3.2 Rail y menú de usuario
- **Rail:** sin cambios (Usuarios y Configuración).
- **Menú de usuario:** **un solo enlace «Configuración de la cuenta»**, sin submenú. Se quitan Usuarios y Roles y permisos, que ya están en el rail. Así se responde de forma única:
  - ¿dónde configuro mi cuenta? → Configuración;
  - ¿dónde configuro la IA? → Configuración → IA y voz.

## 4. Pruebas
- **Vitest:**
  - el layout muestra las secciones según los permisos, marca la activa (`aria-current`) y redirige las secciones no permitidas;
  - `SettingsSubNav` tiene semántica de tabs y conserva `?tab=`;
  - en IA y voz, 3 subpestañas para el SUPER_ADMIN, ninguna para el administrador de la cuenta, y redirección de `voice` y `status`;
  - `SettingsSaveBar`: oculta sin cambios y luego «Guardando…», «Guardado» y error;
  - el menú de usuario con un solo enlace;
  - las pruebas existentes de `EventLog`, `FeatureSettings`, el plan y las funciones siguen pasando.
- **Resto:**
  - `tsc`, `oxlint`, ambos builds y todas las suites SQL, sin cambios en la base;
  - el navegador **con tu sesión** a 1440, 1280, 768 y 390 px, en tema oscuro y claro, en las 5 secciones.

## 5. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Navegación principal | **Lista vertical en escritorio** y barra horizontal neutra en celular y tablet. La secundaria, **subrayada** |
| **D2** | Ancho | **Un solo ancho (`max-w-4xl`)** para las 5 secciones; la variante `wide` existe pero no se usa hoy |
| **D3** | IA y voz | **De 5 a 3 subpestañas**: Funciones (con la voz de cocina dentro), Este dispositivo, y Uso y estado |
| **D4** | Guardado | **«Guardar cambios» y «Descartar»**, visibles solo con cambios, con «Guardando…» y «✓ Guardado». En IA, el alcance se elige con `ScopeChoice` |
| **D5** | Menú de usuario | **Un solo enlace «Configuración de la cuenta»**; Usuarios y Roles y permisos quedan solo en el rail |
| **D6** | Usuarios | **Sigue en el rail, fuera de Configuración** (ADR 0024). No entra en este rediseño, salvo que pidas unificarlo |

## 6. Riesgos
| Riesgo | Mitigación |
|---|---|
| Un enlace guardado a una subpestaña que desaparece | `?tab=voice` y `?tab=status` redirigen |
| Cambiar componentes compartidos afecta a otras pantallas | No se cambian `Tabs`, `RouteTabs` ni `PageHeader`; lo nuevo vive en `settings/ui` |
| La lógica cambia sin querer | Solo cambia la presentación: mismas consultas, mutaciones y permisos. Las pruebas existentes se mantienen |

## 7. Orden de ejecución
| Fase | Qué |
|---|---|
| 1 | `settings/ui`: `SettingsLayout`, `SettingsPage`, `SettingsSubNav`, `SettingsSection`, `SettingsSaveBar` y `StatusBadge` |
| 2 | General y Facturación |
| 3 | IA y voz (3 subpestañas y la voz dentro de Funciones) |
| 4 | Integraciones y Actividad |
| 5 | Menú de usuario |
| 6 | Pruebas, `tsc`, `oxlint`, builds y navegador (responsive y temas) |
| 7 | Esta ADR con resultados y la arquitectura |

## 8. Qué necesito de ti
1. **Aprobar esta ADR**, con D1 a D6 confirmadas o corregidas.
2. **Iniciar sesión** en la vista previa (`fr3rk6.localhost:5173`) para revisar las 5 secciones con datos reales.

## 9. Resultados (2026-10-05)

### 9.1 Componentes (`src/modules/settings/ui/`)
| Componente | Qué hace |
|---|---|
| `SettingsPage` | Encabezado h2, descripción y acción a la derecha; subnavegación opcional; contenido con `space-y-8` y ancho único `max-w-4xl` (la variante `wide` no se usa) |
| `SettingsSection` | Grupo con título h3 y descripción; con `card`, el contenido va enmarcado; con `tone="danger"`, es la zona de peligro |
| `SettingsSubNav` | Pestañas de texto con subrayado y semántica ARIA de tabs |
| `SettingsSaveBar` | «Descartar» y «Guardar cambios» solo con cambios, «Guardando…», «✓ Guardado» durante 3 s y el error en línea con «Reintentar» |
| `StatusBadge` | Un solo mapa de estados de la suscripción y las facturas |

**`pages/SettingsLayout`:**
- encabezado «Configuración · Ajustes de {cuenta}»;
- navegación vertical fija en ≥ lg (activa: fondo neutro y barra naranja) y barra horizontal neutra en < lg;
- una sola columna de contenido.

### 9.2 Secciones
| Sección | Resultado |
|---|---|
| **General** | Un formulario con dos grupos («Esta cuenta», donde ahora está la zona horaria, y «Datos fiscales y de contacto»). «Tu negocio · Aplica a todas tus cuentas» en una card con su propia barra de guardado. «Zona de peligro» con desactivar la cuenta. Las 6 cards quedaron en 3 grupos |
| **Facturación** | Grupos Plan (`PlanPanel` con `StatusBadge`), Facturas (`DataTable` con `StatusBadge` y `EmptyState`) y Método de pago |
| **IA y voz** | Subpestañas **Funciones · Este dispositivo · Uso y estado**: la voz de cocina va dentro de «Voz de la aplicación» y «Estado» se unió a «Uso». Las funciones van en una sola columna, agrupadas por categoría. Las URL `?tab=voice` y `?tab=status` redirigen. Sin el permiso de funciones, solo «Este dispositivo» y sin subnavegación |
| **Integraciones** | Grupo «ID de la cuenta» |
| **Actividad** | Subnavegación Operación · Bitácora. Grupos «Hoy y esta semana», «Últimos 7 días» y «Cambios recientes» (con «Ver en la bitácora» como acción). Sin iconos decorativos en las cards |
| **Guardado** | Siempre «Guardar cambios»; «Restablecer» reemplaza a «Valores de fábrica», «Usar los valores generales» y «Usar la voz de la plataforma». El alcance de la IA se elige con `ScopeChoice` |
| **Menú de usuario** | Un solo enlace, «Configuración de la cuenta». Usuarios queda en el rail |

### 9.3 Sin cambios
- Base de datos, RPC, consultas, mutaciones y permisos.
- `Tabs`, `RouteTabs`, `PageHeader` y las demás pantallas.

### 9.4 Validación
| Prueba | Resultado |
|---|---|
| Vitest | **337/337** (nuevas: `settingsUi` 6, `SettingsPages` 5; `FeatureSettings` y `UserMenu` actualizadas al nuevo texto) |
| SQL | **733/733**, sin cambios |
| `tsc` | limpio |
| oxlint | 16 avisos, sin nuevos |
| Builds de la app y del portal | pasan |

**Pendiente:** la revisión visual con sesión a 1440, 1280, 768 y 390 px y en tema claro. La vista previa redirige al login.

## 10. Ampliación: saltos de layout y Usuarios (2026-10-05)

### 10.1 Saltos de layout corregidos
| Causa | Corrección |
|---|---|
| La barra de scroll aparecía solo en las secciones largas y corría el contenido | `scrollbar-gutter: stable` en el `<main>` de la app |
| La pestaña activa pasaba a `font-medium` y empujaba a las vecinas (barra móvil y subnavegación) | El mismo peso para la activa y las inactivas; se distinguen por color, fondo y subrayado |
| Al cambiar de sección se conservaba el scroll, y una página corta lo recortaba | Cada sección o subsección empieza arriba |
| Descripciones de largo distinto (1 o 2 líneas) | Descripciones de una línea desde `sm`; en el celular el encabezado reserva dos líneas |

### 10.2 Usuarios con el mismo patrón
- **`SectionLayout`** (`settings/ui`): el marco común (encabezado, navegación vertical u horizontal y columna de contenido) que ahora usan **Configuración y Usuarios**.
- **Usuarios:** dos secciones con ruta propia:
  - `/k/{cuenta}/users`: «Usuarios», con «Crear usuario» en el encabezado de la sección;
  - `/k/{cuenta}/users/roles`: «Roles y permisos», con los grupos «Roles propios» (acción «Nuevo rol») y «Plantillas del sistema».
- **La URL vieja** `?tab=roles` redirige.
- **Sin cambios en los datos:** los mismos hooks, permisos y RPC.
- **Pruebas:** `UsersPages.test.tsx` (3). Vitest 340/340.
