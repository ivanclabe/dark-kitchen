# ADR 0009 — Iconos de Cuenta, avatares de personas, funciones por Organización/Cuenta y herencia al crear Cuentas

## Estado
**Aprobada (2026-09-25) en una sola aprobación e implementada completa** en el proyecto `dark-kitchen` (`cqfzcwpqisaohcjaevxf`).

| Fase | Estado |
|---|---|
| 1. Galerías | ✅ `src/shared/avatars`: `catalog.ts` (dos colecciones), `Avatar.tsx` (un renderizador; `Avatar` y `AccountIcon`), `GalleryPicker.tsx` (`AvatarPicker`, `AccountIconPicker`), `art/` (iconos de establecimiento, 20 avatares de personas nuevos, piezas del busto y paleta). |
| 2. Iconos y avatares | ✅ `20260926100000_dk_account_icons_person_avatars`. Icono en el selector de Cuentas, el indicador de contexto, *Tus cuentas*, la organización (tabla y *Editar*), la creación y *Configuración → General*. |
| 3. Funciones | ✅ `20260926110000_dk_feature_catalog` + Edge Function `dk-ai-insights` redesplegada (usa `dk_my_features`). Pestaña *Funciones* de la organización (`FeaturesPanel`) y de la Cuenta (`/settings/features`; `/settings/ai` redirige). La voz pasa por `canUseFeature('voice_commands')` y `useSpeech()` (`voice_speech`). |
| 4. Creación y herencia | ✅ `20260926120000_dk_account_creation_inheritance`. Backfill: ADMIN para el SUPER_ADMIN en *Hamburgesas del Norte*. |
| 5–6. Pruebas y validación | ✅ SQL **297/297** (suites nuevas `features` 36 y `accounts` 24; actualizadas `profile`, `permission_catalog`, `signup`). App **121/121**, `tsc`, `oxlint` (sin avisos nuevos), `build`. Verificación visual con un arnés temporal (galerías, Funciones de organización y de Cuenta, editar y crear Cuenta; escritorio y celular). |
| 7. Documentación | ✅ Manual 3.1 + PDF, este ADR, arquitectura y ERD. |

**Diferencias con el plan (decididas al implementar):**
- **Activar = pasar de apagada a encendida.** La guardia y la RPC rechazan *activar* lo que la organización no ofrece. Tres cosas siguen permitidas: apagar, ajustar parámetros de una función que ya estaba encendida, y guardar el mismo valor que ya tenía. En todos esos casos la función sigue sin poder usarse mientras la organización no la ofrezca.
- **Escritura por actualización y luego inserción**, no con `INSERT … ON CONFLICT`: el upsert dispara la guardia de INSERT con la fila propuesta aunque termine siendo una actualización.
- **`dk_ai_insights` apunta al catálogo** (`feature_key → dk_features`) en vez de a la fila de la Cuenta, porque ya no hay filas obligatorias por Cuenta.
- **Entrar a una Cuenta hace Miembro de la organización solo si aún no lo es.** Se cambió en `dk_guard_kitchen_member`: el `ON CONFLICT` anterior chocaba con la guardia del creador al asignarle ADMIN.
- **`dk_create_kitchen`** se redefine dos veces. Primero en `…110000`, sin sembrar IA; luego en `…120000`, con el icono y la herencia (versión final).
- **Icono sugerido al crear** según el nombre (Pizzería → pizza); se puede cambiar.
- **Valores por defecto de la IA en la app:** `src/modules/ai/lib/catalog.ts` conserva los suyos solo como respaldo mientras carga. La fuente es `dk_features.default_settings`.

**Pendiente (no bloquea):** retirar la vista de compatibilidad `dk_ai_features` cuando no quede ninguna versión previa desplegada; elegir tu avatar nuevo en *Mi perfil*.

---

*Propuesta original (para referencia):*

Continúa el [ADR 0008](./0008-organizaciones-y-cuentas.md) (Organización → Cuenta → Usuario → Rol → Permiso, con la enmienda de la sección 19: SUPER_ADMIN y ADMIN). No reconstruye nada: agrega piezas y reutiliza lo existente.

---

## 1. Estado actual (auditoría)

### 1.1 Organización, Cuentas, usuarios y RBAC
| Pieza | Hoy |
|---|---|
| Organización | `dk_organizations` (`owner_user_id` = SUPER_ADMIN, inmutable). 1 organización en producción. |
| Cuentas | `dk_kitchens` (`organization_id`, nombre, datos legales, `logo_path` **sin uso**, `active`). 2 Cuentas: *Dark Kitchen 1* y *Hamburgesas del Norte*, ambas creadas por el SUPER_ADMIN. |
| Usuarios | `dk_users` (`avatar_key`, `email`, `auth_user_id`). 1 usuario (Ivan, avatar `cutlery`). |
| Rol de organización | `dk_organization_members.is_super_admin` (solo el creador) o Miembro. |
| Roles de Cuenta | `dk_member_roles` (varios por Cuenta) + `dk_kitchen_members.default_role_id`. Plantillas ADMIN, GERENTE, CAJA, COCINA, INVENTARIO, DOMICILIARIO y roles propios. |
| Permisos | Catálogo `dk_permissions`: 56 (47 de Cuenta, 9 de organización). |
| Autorización | `dk_effective_role(cuenta)` valida `x-dk-kitchen-id` + `x-dk-role-id` contra las asignaciones **de esa Cuenta**; `dk_can`, `dk_has_kitchen_permission`, `dk_has_org_permission`. El SUPER_ADMIN tiene un rol virtual `SUPER_ADMIN` (= todos los permisos) en todas las Cuentas de su organización, **sin filas** de membresía. |
| Contexto en la app | `useAppContext` / `useActiveKitchen`: organización, Cuenta, roles de la Cuenta, rol activo, `can()`. Caché separada por Cuenta **y** rol; el rol activo se recuerda por Cuenta. |
| RLS | Todas las tablas de negocio filtran por `dk_current_kitchen_id()` + permiso. Escrituras sensibles solo por RPC `SECURITY DEFINER`. 236 pruebas SQL. |

### 1.2 Avatares
- `src/shared/avatars/catalog.ts`: 20 claves (`chef`, `burger`, `pizza`, `taco`, `sushi`, `ramen`, `donut`, `croissant`, `coffee`, `icecream`, `avocado`, `chili`, `lemon`, `egg`, `cheese`, `shrimp`, `whisk`, `pot`, `cutlery`, `flame`).
- `Avatar.tsx`: ilustraciones SVG propias, planas, cuadrícula 64×64, tarjeta oscura con degradado; `AvatarArtwork` (solo el dibujo) y `Avatar` (con tamaños). Si no hay clave, se deriva una fija del id (`defaultAvatarKey`).
- `AvatarPicker.tsx` (perfil): grupo de radio 5×4 / 10×2, flechas del teclado, marca de seleccionado.
- La base acepta solo esas claves (CHECK en `dk_users.avatar_key`).
- **Son comida y utensilios, no personas**: encajan como iconos de establecimiento.

### 1.3 Iconos de Cuenta
No existen. El selector de Cuentas, "Tus cuentas" y el indicador de contexto muestran **iniciales** (`initials(nombre)`). La tabla de Cuentas de la organización no muestra nada.

### 1.4 IA
- `dk_ai_features` (por Cuenta: `kitchen_id`, `feature_key`, `enabled`, `settings`), 5 funciones: `supply_reorder`, `supply_perishables`, `supply_slow_movers`, `kitchen_stall_alerts` (regla fija, sin modelo), `kitchen_insights`. Todas **apagadas** hoy en ambas Cuentas.
- `dk_create_kitchen` siembra las 5 filas con valores por defecto **copiados** del catálogo TS (`src/modules/ai/lib/catalog.ts`).
- Pantalla `/settings/ai` de la Cuenta (permiso `ai.manage`), escritura directa con política.
- `dk_ai_insights` (resultados): políticas con `dk_ai_feature_allowed(key)`, que **deduce el permiso por el prefijo** (`supply_` → `inventory.view`, `kitchen_` → `kitchen.view`).
- La Edge Function `dk-ai-insights` lee `dk_ai_features.enabled` de la Cuenta; la clave del modelo es un secreto de plataforma (`DK_ANTHROPIC_API_KEY`).
- Punto de uso único en la app: `useAiFeature(key)` (consumido por Abastecimiento, alertas de Cocina y sugerencias de Cocina).

### 1.5 Voz
- **Comandos de voz** en Cocina (`kitchen/voice/*`): reconocimiento del navegador + intérprete determinista; cada acción pasa por las mismas RPC y permisos que los botones.
- **Voz de la app** (`speak()`): respuestas a comandos, alertas de pedidos detenidos (setting `voice` de `kitchen_stall_alerts`) y lectura de sugerencias (setting `voice` de `kitchen_insights`).
- Controles: solo soporte del navegador y **preferencias del dispositivo** en `localStorage` ("Respuesta hablada", "Sonido de pedido nuevo"). **No hay control por Organización ni por Cuenta.**

### 1.6 Features generales
No existe un concepto de "feature". Los módulos (Pedidos, Cocina, Catálogo, Abastecimiento, Clientes, Reportes, Facturas, Menús maestros) se controlan **solo por RBAC**.

### 1.7 Creación de Cuentas
`dk_create_kitchen(nombre, slug, zona, moneda, org)`: exige `accounts.create` (SUPER_ADMIN o plataforma), respeta `max_accounts`, siembra SLA, IA y contador. **No crea membresía**: el creador entra por el rol virtual SUPER_ADMIN. El registro público (`dk_create_organization`) la reutiliza para la primera Cuenta. Desde *Tus cuentas* se entra a la Cuenta creada; desde *Configuración de la organización → Cuentas* solo se refresca la lista. La tabla de Cuentas permite Entrar y Activar/Desactivar, **no editar**.

---

## 2. Problemas encontrados
| # | Problema | Impacto |
|---|---|---|
| P1 | La galería de avatares de personas es de comida/utensilios. | Mezcla "quién soy" con "qué establecimiento". |
| P2 | Las Cuentas no tienen identidad visual (solo iniciales); `logo_path` quedó sin uso. | Difícil distinguir Cuentas en el selector. |
| P3 | La IA se configura solo por Cuenta; la organización no controla nada. | No se puede ofrecer/limitar IA por negocio. |
| P4 | Valores por defecto de IA duplicados (TS + `dk_create_kitchen`). | Se desincronizan. |
| P5 | `dk_ai_feature_allowed` deduce el permiso por prefijo del nombre. | Lógica escondida; frágil para funciones nuevas. |
| P6 | La voz no tiene control por Organización/Cuenta; el setting `voice` vive dentro de dos funciones de IA. | No se puede apagar la voz en una Cuenta; concepto repartido. |
| P7 | No hay estructura de features: cada módulo decidiría por su cuenta. | Riesgo de condiciones sueltas en componentes. |
| P8 | El SUPER_ADMIN no tiene rol **ADMIN** en las Cuentas que crea (sí en *Dark Kitchen 1*, no en *Hamburgesas del Norte*). | No coincide con la regla pedida (SUPER_ADMIN + ADMIN). |
| P9 | Crear una Cuenta desde la organización no lleva a la Cuenta; no se puede editar nombre ni icono desde ahí. | Flujo incompleto. |
| P10 | La regla "nadie modifica sus propias asignaciones" también bloquea al SUPER_ADMIN. | No podría darse ADMIN en una Cuenta creada por la plataforma. |

Sin problema de seguridad nuevo: el aislamiento entre organizaciones/Cuentas, la validación del rol activo por Cuenta y la caché por Cuenta+rol ya están (ADR 0008) y cubiertos por pruebas.

---

## 3. Arquitectura objetivo
```
ORGANIZACIÓN      datos · funciones disponibles (IA, voz…) · usuarios · SUPER_ADMIN · roles propios · Cuentas
   ↓
CUENTA            icono (galería de establecimientos) · datos · funciones activadas (dentro de lo disponible)
                  · parámetros de IA · usuarios asignados · roles de Cuenta (ADMIN, COCINA…) · módulos
   ↓
USUARIO           perfil · avatar (galería de personas) · rol de organización · roles por Cuenta · rol activo
   ↓
RBAC              catálogo de permisos · roles · permisos efectivos = Organización + Cuenta + rol activo
```

### 3.1 Dos galerías, un solo sistema visual
- **Iconos de establecimiento** = la galería actual, **sin cambios** (mismas 20 ilustraciones, claves, estilo y selector). Pasa a ser la de las Cuentas.
- **Avatares de personas** = colección nueva de 20 personajes con **exactamente el mismo sistema**: SVG propios, planos, cuadrícula 64×64, tarjeta oscura con degradado, misma paleta y grosor de trazo. Diversidad de tonos de piel, edades y estilos, sin estereotipos:

| Clave | Personaje | Clave | Personaje |
|---|---|---|---|
| `chef_classic` | Chef con gorro alto | `waiter` | Mesero con corbatín |
| `chef_bun` | Chef con moño | `grandma` | Abuela cocinera |
| `baker` | Panadera con pañoleta | `curly` | Persona de pelo rizado |
| `barista` | Barista con gorra | `hijab` | Persona con hiyab |
| `rider` | Domiciliario con casco | `beanie` | Persona con gorro de lana |
| `cashier` | Cajera con diadema | `headphones` | Persona con audífonos |
| `grill_master` | Parrillero con barba | `cap` | Persona con gorra de visera |
| `sushi_chef` | Sushiman con bandana | `braids` | Persona con trenzas |
| `pizzaiolo` | Pizzero | `robot` | Robot chef (personaje) |
| `manager` | Gerente con gafas | `cat_chef` | Gato chef (personaje) |

- **Código:** un solo renderizador y un solo selector, parametrizados por colección:
  - `src/shared/avatars/` → `collections.ts` (`ACCOUNT_ICONS` y `PERSON_AVATARS`: claves, nombres, clave derivada del id), `Artwork.tsx` (un registro de dibujos por colección), `GalleryPicker.tsx` (el actual `AvatarPicker`, generalizado), `Avatar` (persona) y `AccountIcon` (Cuenta).
  - Sin subida de imágenes en ninguna de las dos.

### 3.2 Funciones (features): catálogo central y dos niveles
**Qué es un feature:** una capacidad **opcional** que un negocio puede ofrecer o no (IA, voz). Los módulos base (Pedidos, Cocina, Inventario…) **no** son features: los controla el RBAC, como hoy. Así no se duplica lo que ya resuelven los permisos.

**Catálogo `dk_features`** (como `dk_permissions`: lo define una migración, nadie lo edita desde la interfaz):

| Clave | Grupo | Permiso para usarla | Permiso para activarla en la Cuenta | Disponible por defecto (org) | Activa por defecto (Cuenta) |
|---|---|---|---|---|---|
| `supply_reorder` | IA | `inventory.view` | `ai.manage` | sí | no |
| `supply_perishables` | IA | `inventory.view` | `ai.manage` | sí | no |
| `supply_slow_movers` | IA | `inventory.view` | `ai.manage` | sí | no |
| `kitchen_stall_alerts` | IA | `kitchen.view` | `ai.manage` | sí | no |
| `kitchen_insights` | IA | `kitchen.view` | `ai.manage` | sí | no |
| `voice_commands` | Voz | `kitchen.view` | `settings.manage` | sí | sí |
| `voice_speech` | Voz | `kitchen.view` | `settings.manage` | sí | sí |

Las claves de IA **son las actuales** (no se renombra nada en `dk_ai_insights`). Los valores por defecto de los parámetros (`default_settings`) pasan al catálogo: se elimina la copia de `dk_create_kitchen` (P4) y se reemplaza el prefijo por la columna de permiso (P5).

**Features generales, análisis:** candidatos a futuro, **fuera de esta entrega** porque cada uno cambia RLS de módulos que hoy funcionan: Cartera de clientes, Facturas, Integraciones externas (n8n) y Menús maestros. Agregar uno más adelante = 1 fila de catálogo + usar `dk_can_use_feature('clave')` en sus políticas y `canUseFeature('clave')` en la app; no hace falta cambiar el modelo.

**Precedencia (una sola fórmula, en la base):**
```
usable(usuario, Cuenta, f) =  catálogo.activo(f)
                            ∧ disponible(organización, f)   -- fila de la org, o el valor por defecto del catálogo
                            ∧ activada(Cuenta, f)           -- fila de la Cuenta, o el valor por defecto del catálogo
                            ∧ dk_can(f.permiso_de_uso)      -- rol activo en ESA Cuenta
```
- La **organización es el techo**: si desactiva una función, queda apagada en todas sus Cuentas, sin importar lo que diga la Cuenta. La elección de cada Cuenta **se conserva**; si la organización la vuelve a ofrecer, cada Cuenta retoma su valor.
- Una Cuenta **no puede activar** lo que la organización no ofrece: la base lo rechaza (RPC + trigger), no solo la interfaz.
- **Parámetros** (umbrales, frecuencia): son de la Cuenta (dependen del establecimiento); valores = `default_settings` del catálogo + lo guardado por la Cuenta.
- **Voz dentro de la IA:** una alerta o sugerencia se dice en voz alta solo si `voice_speech` es usable **y** el parámetro `voice` de esa función está encendido. Un solo punto de decisión (`useSpeech`).
- **Preferencias del dispositivo** ("Respuesta hablada", sonido): siguen como preferencia personal, **por debajo** de todo lo anterior (pueden apagar, nunca encender lo que la Cuenta no permite).
- El administrador de la plataforma sigue la misma regla: los features son configuración del negocio, no permisos.

**Quién configura:**
- **Disponibilidad en la organización:** permiso nuevo de organización `features.manage` (lo tiene el SUPER_ADMIN; catálogo → 57 permisos: 47 de Cuenta y 10 de organización).
- **Activación por Cuenta:** el SUPER_ADMIN desde la organización (matriz Funciones × Cuentas), o dentro de la Cuenta quien tenga el permiso de activación de esa función (`ai.manage` o `settings.manage`; ADMIN tiene ambos).
- **Parámetros de IA:** en la Cuenta, con `ai.manage` (como hoy).

### 3.3 Herencia SUPER_ADMIN + ADMIN al crear una Cuenta
Flujo exacto dentro de `dk_create_kitchen` (una sola transacción):
1. Valida `accounts.create` en la organización y el tope `max_accounts`.
2. Crea la Cuenta asociada a la organización, con su icono (elegido o derivado).
3. Siembra la configuración inicial (SLA, contador de pedidos). La IA y la voz ya no se siembran: usan los valores del catálogo.
4. **Solo si quien crea es el SUPER_ADMIN de esa organización** (`dk_current_profile_id() = owner_user_id`), le crea la membresía en la Cuenta con el rol **ADMIN** (y ADMIN como predeterminado).
5. Devuelve el id y la app **entra a la nueva Cuenta** (desde *Tus cuentas* y también desde *Configuración de la organización*).

Resultado: `Juan → Cuenta Centro → SUPER_ADMIN + ADMIN`.
- **SUPER_ADMIN** en la Cuenta es el rol que se deriva de ser el creador de la organización (no se guarda como asignación, porque por la sección 19 del ADR 0008 no es asignable). Aparece siempre primero en la lista de roles de la Cuenta.
- **ADMIN** es una asignación real de Cuenta: se ve en *Usuarios y permisos*.
- **Otros creadores:** si crea la Cuenta alguien que no es el SUPER_ADMIN de esa organización (hoy, solo el administrador de la plataforma creando en un negocio ajeno), **no** hay herencia. Si en el futuro se abre `accounts.create` a otros, tampoco, salvo que se decida explícitamente.
- **Registro público:** la primera Cuenta la crea el nuevo SUPER_ADMIN, así que la hereda por el mismo camino (sin código aparte).
- **El SUPER_ADMIN puede editar sus propias asignaciones de Cuenta** (P10): no hay escalamiento posible porque ya tiene todos los permisos. La regla sigue igual para todos los demás. Un ADMIN de Cuenta (`team.manage`) **no** puede tocar las asignaciones del SUPER_ADMIN.

### 3.4 Cambio de Cuenta y contexto activo
Ya se cumple (ADR 0008) y se agregan las funciones al contexto:

| Contexto | Fuente |
|---|---|
| Organización activa | la de la Cuenta activa (`dk_my_context`) |
| Cuenta activa | `x-dk-kitchen-id` (validado en cada consulta) |
| Usuario actual | `auth.uid()` → `dk_users` |
| Rol en la organización | SUPER_ADMIN o Miembro (`dk_organization_members`) |
| Roles en la Cuenta | `dk_member_roles` **de esa Cuenta** (+ SUPER_ADMIN derivado) |
| Rol activo | `x-dk-role-id`, validado contra **esa** Cuenta; si no es válido, el predeterminado |
| Permisos efectivos | del rol activo en esa Cuenta |
| Funciones de la organización / de la Cuenta | **nuevo** `dk_my_features()` (disponible, activada, usable, parámetros) |

Al cambiar de Cuenta todo se vuelve a pedir para la nueva Cuenta (caché por Cuenta+rol); un rol de Centro enviado con la cabecera de Norte se ignora. Se agrega una prueba explícita de eso.

En la app: `useAppContext()` suma `features`, `feature(key)` y `canUseFeature(key)`, además de `organizationRole` y `accountRoles`. Ningún componente decide por su cuenta si una función está disponible.

---

## 4. Cambios necesarios

### 4.1 Base de datos (Supabase)
| Objeto | Cambio |
|---|---|
| `dk_kitchens.icon_key` | **Nueva** columna `text null`, CHECK con las 20 claves de establecimiento. `null` = icono derivado del id. `logo_path` se deja como está (sin uso, sin borrar). |
| `dk_users.avatar_key` | CHECK pasa a las 20 claves de personas. Los valores actuales (comida) pasan a `null` → avatar derivado del id. |
| `dk_features` | **Nueva** (catálogo): `key`, `category` (`ai`/`voice`/`general`), `label`, `description`, `use_permission` → `dk_permissions`, `manage_permission` → `dk_permissions`, `default_available`, `default_enabled`, `default_settings`, `sort_order`, `active`. |
| `dk_organization_features` | **Nueva**: `organization_id`, `feature_key`, `available`, `updated_by`, `updated_at`. PK (org, clave). |
| `dk_kitchen_features` | **Renombre** de `dk_ai_features` (se conservan filas, parámetros y auditoría) + FK a `dk_features`. |
| `dk_ai_features` | **Vista de compatibilidad** (`security_invoker`, solo lectura) sobre `dk_kitchen_features`, para no cortar a una Edge Function o app vieja mientras se despliega. Se retira en una migración posterior. |
| `dk_permissions` | + `features.manage` (organización). ADMIN no la recibe (es de organización). |
| Funciones nuevas | `dk_feature_available(org, clave)`, `dk_feature_enabled(cuenta, clave)`, `dk_can_use_feature(clave)` (Cuenta actual + permiso), `dk_feature_state(clave)` (para la Edge Function: usable, motivo, parámetros), `dk_my_features()`, `dk_org_feature_matrix(org)`. |
| RPC nuevas | `dk_set_org_feature(org, clave, disponible)`, `dk_set_kitchen_feature(cuenta, clave, activada, parámetros)`. |
| Trigger | `dk_guard_kitchen_feature`: no deja activar en una Cuenta lo que su organización no ofrece. |
| `dk_create_kitchen` | + `p_icon_key`; herencia ADMIN solo para el SUPER_ADMIN; sin siembra de IA. |
| `dk_my_kitchens`, listados de Cuentas | Devuelven `icon_key`. |
| Regla de autoasignación | Excepción para el SUPER_ADMIN (solo en sus asignaciones de Cuenta); ADMIN/`team.manage` no puede tocar al SUPER_ADMIN. |
| `dk_ai_feature_allowed` | Se reemplaza por `dk_can_use_feature` y se elimina. |
| Datos | Backfill: ADMIN para el SUPER_ADMIN en las Cuentas **que él creó** y aún no lo tienen (hoy: *Hamburgesas del Norte*). Disponibilidad y activación: sin filas nuevas (valen los valores del catálogo, que reproducen el comportamiento actual). |

### 4.2 RLS
| Tabla | Política |
|---|---|
| `dk_features` | SELECT para `authenticated` (es un catálogo). Sin escrituras. |
| `dk_organization_features` | SELECT: miembros activos de esa organización o plataforma. Escritura: **solo RPC** (`features.manage`). |
| `dk_kitchen_features` | SELECT: la Cuenta actual (como hoy). Se **quita la escritura directa**; solo RPC (`manage_permission` de la función en esa Cuenta, o `features.manage` en su organización). |
| `dk_ai_insights` | SELECT/INSERT con `dk_can_use_feature(feature_key)` (Cuenta actual ∧ organización ∧ Cuenta ∧ permiso), en lugar del prefijo. |
| `dk_kitchens` | UPDATE sin cambios (`settings.manage` en la Cuenta o `accounts.manage` en la organización): cubre nombre e icono. |

Todas las funciones de permiso se usan como `(select …)` para que Postgres las evalúe una vez por consulta (InitPlan), como el resto del esquema.

**Voz y seguridad:** la voz corre en el navegador (no hay datos que proteger en el servidor). Apagarla la oculta; si alguien la forzara manipulando la app, cada comando sigue pasando por las mismas RPC, RLS y permisos que los botones: no gana nada que no pueda hacer ya.

### 4.3 Backend / servicios
- **Edge Function `dk-ai-insights`:** reemplaza la lectura de `dk_ai_features.enabled` por `dk_feature_state(clave)` y responde `FEATURE_DISABLED` con el motivo (`organization`, `account` o `permission`). Se redespliega.
- **Autenticación:** sin cambios (login, activación y registro iguales). El registro hereda SUPER_ADMIN + ADMIN en la primera Cuenta por la RPC común.

### 4.4 Frontend
| Área | Cambio |
|---|---|
| `shared/avatars` | Dos colecciones, un renderizador, un selector (`GalleryPicker`); `Avatar` (personas) y `AccountIcon` (Cuentas). |
| Perfil | Selector con la galería de personas. |
| Iconos de Cuenta en toda la app | `AccountIcon` en lugar de iniciales: selector de Cuentas, indicador de contexto, *Tus cuentas*, tabla de Cuentas de la organización, bienvenida. |
| Organización → Cuentas | Columna de icono; **Editar** (nombre + icono, en un panel lateral); **Nueva cuenta** con icono y entrada directa a la Cuenta creada. |
| Organización → **Funciones** (pestaña nueva, `features.manage`) | Por grupo (IA, Voz): interruptor "Disponible en la organización" y, debajo, cada Cuenta con su interruptor (deshabilitado si la organización no la ofrece). En el celular, una tarjeta por función con la lista de Cuentas. |
| Cuenta → Configuración | La pestaña **IA** pasa a **Funciones** (`/settings/features`; `/settings/ai` redirige): tarjetas actuales de IA (se reutiliza `FeatureCard`) + tarjetas de Voz. Si la organización no la ofrece: "Tu organización no tiene disponible esta función". También **icono de la Cuenta** en *General*. |
| `shared/features` | Tipos de las claves, `useFeatures()` (`dk_my_features`, caché por Cuenta+rol), integrado en `useAppContext`. |
| IA en los módulos | `useAiFeature(key)` pasa a leer el estado efectivo: Abastecimiento, alertas y sugerencias de Cocina sin cambios de código propio. |
| Voz en Cocina | `VoiceCommandBar` solo si `canUseFeature('voice_commands')`; todas las locuciones por `useSpeech()` (valida `voice_speech` + preferencia del dispositivo). |
| Usuarios y permisos | El SUPER_ADMIN muestra también sus roles por Cuenta (p. ej. "SUPER_ADMIN · acceso global — Centro: ADMIN"). |

---

## 5. Orden de ejecución y dependencias
```
1 Galerías (frontend puro) ───────────────┐
2 M1 iconos de Cuenta + avatares (base) ──┼─→ 3 Iconos en la app
4 M2 catálogo de funciones (base) ────────┼─→ 5 Edge Function ─→ 6 Funciones en la app (org + Cuenta + voz + IA)
7 M3 creación de Cuentas y herencia (base; necesita M1 y M2) ─→ 8 Flujo de creación en la app
9 Pruebas, validación integral, documentación
```
- M1 va antes que la app de iconos (la columna tiene que existir).
- M2 antes que la Edge Function y la app de funciones; la vista de compatibilidad cubre el tiempo entre la migración y el despliegue.
- M3 al final porque redefine `dk_create_kitchen` en su forma final (icono + herencia + sin siembra de IA).

## 6. Migraciones
| Migración | Contenido | Reversible |
|---|---|---|
| `20260926100000_dk_account_icons_person_avatars` | `icon_key` + CHECK; CHECK de avatares de personas + `null` a los actuales; `dk_my_kitchens` con icono. | Sí (la columna es nueva; los avatares anteriores se pueden reelegir). |
| `20260926110000_dk_feature_catalog` | Catálogo, `dk_organization_features`, renombre a `dk_kitchen_features` + vista de compatibilidad, funciones, RPC, trigger, políticas, `features.manage`, `dk_ai_insights` con la nueva regla. | Sí (renombre, sin borrar datos). |
| `20260926120000_dk_account_creation_inheritance` | `dk_create_kitchen` final, excepción de autoasignación del SUPER_ADMIN, backfill de ADMIN. | Sí. |

Cada una se ensaya antes con `python3 supabase/tests/run.py --with <migración>` (transacción con rollback), después `supabase db push`, tipos regenerados y `supabase db advisors`.

## 7. Compatibilidad
- **Comportamiento visible igual al de hoy por defecto:** la organización ofrece todas las funciones; la IA sigue apagada en cada Cuenta como está; la voz sigue encendida.
- **Datos:** nada se borra. `dk_ai_features` se renombra (mismas filas) y queda una vista con el nombre viejo.
- **Claves de IA** sin cambios (`dk_ai_insights` conserva su historial).
- **Iconos:** las Cuentas sin icono muestran uno derivado del id (estable), igual que los avatares hoy.
- **Avatares:** el único usuario con avatar (Ivan) vuelve a uno derivado y puede elegir uno nuevo en *Mi perfil*.
- **Rutas:** `/settings/ai` redirige a `/settings/features`.
- **Roles:** ninguno cambia; solo se agrega ADMIN al SUPER_ADMIN en *Hamburgesas del Norte*.

## 8. Validaciones
**SQL (suites nuevas y actualizadas, todas con rollback):**
- `features.sql`: catálogo; valores por defecto; la organización apaga ⇒ usable falso en todas sus Cuentas aunque la Cuenta diga sí; la Cuenta no puede activar lo no ofrecido (RPC y escritura directa); la elección de la Cuenta se conserva al volver a ofrecerse; sin `ai.manage` no se activa; un Miembro no cambia la organización; otra organización no ve ni cambia nada; `dk_ai_insights` rechaza insertar con la función apagada; permiso de uso por rol activo (COCINA no usa `supply_reorder`).
- Creación: el SUPER_ADMIN obtiene ADMIN (predeterminado) + SUPER_ADMIN derivado; la plataforma creando en un negocio ajeno **no** hereda; el registro público hereda; un ADMIN de Cuenta no puede quitarle roles al SUPER_ADMIN; el SUPER_ADMIN sí puede editar los suyos; nadie más se autoasigna.
- Cambio de Cuenta: un rol de Centro con la cabecera de Norte se ignora; permisos distintos por Cuenta.
- Iconos/avatares: CHECK de ambas colecciones; quien no administra no cambia el icono; aislamiento entre Cuentas.
- Todas las suites existentes (236) siguen pasando, con los conteos actualizados (57 permisos).

**App:** `tsc`, `oxlint`, `vitest` (colecciones sincronizadas con los CHECK de la migración, precedencia de funciones, `useSpeech`), `npm run build`.

**Visual:** página de prueba con ambas galerías, la matriz de Funciones y el selector de Cuentas con iconos, en escritorio y celular (captura). Las pantallas con sesión no se pueden abrir con el navegador integrado (no tiene tu sesión), igual que antes.

**Servicios:** despliegue de la Edge Function y prueba de `status` / `FEATURE_DISABLED`.

## 9. Riesgos y regresiones
| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Apagar por error funciones que hoy se usan (voz). | Valores por defecto = comportamiento actual; prueba específica. |
| R2 | Edge Function o app vieja contra el esquema nuevo. | Vista de compatibilidad `dk_ai_features`; despliegue inmediato de la función. |
| R3 | Se pierde la elección de avatar de los usuarios. | Hoy es 1 usuario; se avisa y se elige en 10 segundos. |
| R4 | La excepción de autoasignación abre escalamiento. | Solo aplica a quien es SUPER_ADMIN (ya tiene todo); pruebas de que nadie más puede. |
| R5 | Funciones con lógica repartida (voz dentro de IA). | Una fórmula en la base + un solo `useSpeech` en la app. |
| R6 | Costo de las políticas nuevas. | Funciones `stable` en `(select …)`; `EXPLAIN` como en el ADR 0008. |
| R7 | Listas de claves en TS y en CHECK se desincronizan. | Prueba que compara la lista de la app con la de la migración. |
| R8 | Voz solo del lado del navegador. | Documentado: las acciones siguen protegidas por RLS/RBAC. |

## 10. Criterios de terminado
1. Las 3 migraciones aplicadas; tipos regenerados; asesores sin hallazgos nuevos de seguridad.
2. Todas las pruebas SQL y de la app en verde (las existentes + las nuevas de la sección 8); `build` sin errores.
3. Edge Function desplegada y usando el estado efectivo.
4. El SUPER_ADMIN ve y edita el icono de cada Cuenta desde la organización y desde la Cuenta; los iconos se ven en el selector, *Tus cuentas*, el indicador de contexto y la tabla de Cuentas.
5. *Mi perfil* ofrece solo los 20 avatares de personas; no hay subida de imágenes.
6. Pestaña **Funciones** de la organización (disponibilidad + activación por Cuenta) y de la Cuenta (activación + parámetros), con la regla de precedencia aplicada por la base.
7. Crear una Cuenta como SUPER_ADMIN deja SUPER_ADMIN + ADMIN y entra a la Cuenta; otros creadores no heredan.
8. *Hamburgesas del Norte* con ADMIN para el SUPER_ADMIN.
9. Manual de usuario, ADR 0009 (estado) y documentos de arquitectura/ERD actualizados; PDF regenerado.

## 11. Plan de ejecución (una sola aprobación)
| Fase | Qué |
|---|---|
| 1 | Galerías: colecciones, renderizador y `GalleryPicker` comunes; 20 avatares de personas nuevos. |
| 2 | M1 + iconos de Cuenta en toda la app + avatar de personas en el perfil. |
| 3 | M2 + Edge Function + `useFeatures`/`useAppContext` + pestañas Funciones (organización y Cuenta) + voz e IA por la regla única. |
| 4 | M3 + creación de Cuentas (icono, herencia, entrar a la Cuenta) + Usuarios y permisos. |
| 5 | Pruebas SQL/app nuevas y actualizadas; corrección de lo que falle. |
| 6 | Validación integral (sección 8) y verificación visual. |
| 7 | Documentación (manual 3.1 + PDF, ADR, arquitectura, ERD) y resumen final. |

## 12. Acciones manuales que seguirán pendientes (no bloquean)
- Elegir tu avatar nuevo en *Mi perfil*.
- Retirar la vista de compatibilidad `dk_ai_features` en una migración posterior, cuando no quede ninguna versión vieja desplegada.
- Las ya conocidas: SMTP, confirmación de correo, Turnstile y URLs antes de `VITE_PUBLIC_SIGNUP=true`; protección de contraseñas filtradas; n8n.
