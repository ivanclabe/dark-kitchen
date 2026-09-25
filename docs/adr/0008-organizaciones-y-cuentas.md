# ADR 0008 — Organizaciones, Cuentas y RBAC (v2)

## Estado
**Aprobada v2 e implementada (2026-09-24/25).** Fases A–G aplicadas en el proyecto `dark-kitchen` (`cqfzcwpqisaohcjaevxf`).

> **Enmienda (sección 19, 2026-09-25):** los roles se llaman en MAYÚSCULAS con `_` (**SUPER_ADMIN**, **ADMIN**, GERENTE, CAJA, COCINA, INVENTARIO, DOMICILIARIO). **SUPER_ADMIN** es solo el creador de la organización: intransferible y no asignable. Se eliminan la transferencia de propiedad y el permiso `organization.transfer` (56 permisos: 47 de Cuenta y 9 de organización). Donde el texto de abajo dice "Super Admin" o "Administrador", léase SUPER_ADMIN o ADMIN; lo que contradiga la sección 19 queda reemplazado.

| Fase | Estado |
|---|---|
| A. Menú de usuario y perfil | ✅ `20260925100000_dk_profile_avatars`: `avatar_key` (CHECK con las 20 claves), `dk_update_my_profile`. 20 avatares SVG propios, *Mi perfil*, menú de usuario con *Cerrar sesión* adentro, indicador de contexto. Suite `profile.sql` 7/7 |
| B. Catálogo de permisos | ✅ `20260925110000_dk_permission_catalog`: 57 permisos con claves (47 de Cuenta, 10 de organización), plantillas traducidas con verificación de equivalencia dentro de la migración (ajustes: Caja sin rentabilidad, Gerente sin auditoría), reescritura automática de políticas, funciones y vistas, H1 (reportes y dashboard), H2 (lecturas de platos/menús), H3 (Facturas), H5 (separaciones). Suite `permission_catalog.sql` 24/24; la lista de claves de la app se verifica contra la de la base |
| C. Organizaciones y roles múltiples | ✅ `20260925120000_dk_organizations`: `dk_organizations`, membresías, Super Admin, `dk_member_roles`, rol predeterminado, rol activo (`x-dk-role-id`) validado en `dk_effective_role`, `dk_has_org_permission`, reglas contra el escalamiento, `dk_my_context`, menús maestros por organización. Suite `organizations.sql` 42/42. `EXPLAIN`: permisos como InitPlan (1 vez por consulta), ~6 ms la lista de pedidos |
| D. Contexto en la app | ✅ `dk_my_context`, cambio de rol activo (menú de usuario e indicador), caché separada por Cuenta **y rol**, `/cuentas` (redirige `/cocinas`), guardia de secciones por rol (Cocina entra a su tablero), textos "Cuenta"/"usuario" |
| E. Administración | ✅ `20260925130000_dk_org_users`: crear usuario pendiente + enlace de activación, identidad reutilizada o unida al activar, Super Admin, desactivar/quitar, transferir propiedad. Pantallas *Usuarios y permisos* (usuarios, roles, permisos efectivos) y *Configuración de la organización* (general, Cuentas, menús maestros, propiedad). Acciones ocultas por permiso en todos los módulos (H4). Suite `org_users.sql` 33/33 |
| F. Registro público | ✅ `20260925140000_dk_signup`: `dk_create_organization` (exige correo confirmado, idempotente). `/registro` en dos pasos, "Revisa tu correo", `/registro/confirmado` con entrada directa y bienvenida. **Apagado por defecto** (`VITE_PUBLIC_SIGNUP=false`) hasta configurar SMTP, confirmación y CAPTCHA (Turnstile, `VITE_TURNSTILE_SITE_KEY`). Suite `signup.sql` 13/13 |
| G. Cierre | ✅ `20260925150000_dk_retire_kitchen_invitations` (tabla vacía; se detenía si había invitaciones vigentes). Guía de n8n, manual de usuario 3.0, CORS de la función de IA con `x-dk-role-id`. **Total: 237 pruebas SQL y 109 de la app** |
| Enmienda (sección 19) | ✅ `20260925160000_dk_adr0008_hardening`, `20260925170000_dk_single_fk_per_relation` (una FK por par de tablas, para los embeds de PostgREST) y `20260925180000_dk_role_names_super_admin`. **Total: 236 pruebas SQL y 114 de la app** |

**Diferencias con el plan (decididas al implementar):**
- Las pantallas de organización viven dentro de la Cuenta activa (`/k/{cuenta}/users` y `/k/{cuenta}/organizacion`) en vez de `/o/{org}/…`: se conserva el menú, el contexto y la barra lateral, y la organización es siempre la de la Cuenta activa.
- Los permisos efectivos (sección 14) se calculan en la app con los roles que la base ya entrega (misma fuente de verdad); no hizo falta una RPC aparte.
- Desactivar la organización completa no está en la interfaz (evita que el dueño se bloquee a sí mismo): lo hace la plataforma. La propiedad (SUPER_ADMIN) es intransferible (sección 19).
- Las pruebas SQL se corren con `python3 supabase/tests/run.py` (con `--with <migración>` para ensayar una migración antes de aplicarla).

Reemplaza la v1 del mismo día (aprobada, no implementada) e incorpora las aclaraciones del 2026-09-24:
- varios roles por usuario en cada Cuenta, con **rol activo** que se puede cambiar;
- **catálogo central de permisos**;
- **creación de usuarios** por el Super Admin;
- **datos de la organización en el registro**, con entrada directa a la primera Cuenta;
- **Super Admin de la organización**.

Nada de este documento se ha aplicado a la base ni al código. Extiende la [ADR 0007 — Multi-Cocina](./0007-multi-cocina.md) (fases 0–6 aplicadas).

### Términos
| Término | Qué es | En la base |
|---|---|---|
| **Organización** | El negocio o propietario ("Grupo XYZ"). | `dk_organizations` (nueva) |
| **Cuenta** | Un establecimiento o entorno operativo completo (Hamburguesería Centro), con todos sus módulos. Es lo que hasta hoy la app llama "Cocina". **No es el módulo Cocina.** | `dk_kitchens` (existe) |
| **Cocina** (módulo) | El tablero de preparación, un módulo dentro de cada Cuenta. | — |
| **SUPER_ADMIN** | El creador (dueño) de la organización. Acceso global a todas sus Cuentas. Único, intransferible, no asignable. | `owner_user_id` |
| **ADMIN** | Rol de Cuenta con todas sus opciones y configuraciones. Se asigna a usuarios. | plantilla del sistema |
| **Administrador de la plataforma** | Quien administra Dark Kitchen completo (hoy Ivan; antes "superusuario"). Acceso a todas las Cuentas de todas las organizaciones. No es un rol de organización. | `platform_role` |
| **Usuario** | Una persona. Para lo personal se dice "usuario", para no confundirlo con "Cuenta". | `dk_users` |

### Qué se conserva de la v1 aprobada
| Decisión v1 | En la v2 |
|---|---|
| D1 "Cuenta" en la interfaz, "usuario" para lo personal | ✅ Igual |
| D2 Una organización propia por persona, Cuentas sin tope | ✅ Igual |
| D3 Reemplaza las decisiones 3 y 4 de la ADR 0007 | ✅ Igual |
| D4 Menús maestros de la organización | ✅ Los administra el Super Admin |
| D5 Acceso "Todas las cuentas" sin excepciones | 🔁 **Se simplifica**: el acceso a todas las Cuentas es propio del Super Admin; el resto de usuarios se asigna Cuenta por Cuenta (2.3) |
| D6 El Administrador de una Cuenta gestiona el equipo de su Cuenta | ✅ Con el permiso `team.manage` |
| D7 "Gerente" no se renombra | ✅ Y cada organización puede crear su propio rol "Encargado" |
| D8 El registro público se construye y se activa con SMTP y CAPTCHA | ✅ Igual (ver D-A sobre la confirmación del correo) |
| D9 El administrador de la plataforma es Administrador en todas las Cuentas y dueño de su propia organización | ✅ Igual |
| v1: rol de organización "Administrador de organización" | 🔁 Se reemplaza por **Super Admin** asignable (3.3) |
| v1: un rol por usuario y Cuenta | 🔁 **Varios roles** por usuario y Cuenta, con **rol activo** (3.4) |
| v1: solo invitación por enlace | 🔁 **Crear usuario**, que queda pendiente de activación (sección 10) |

---

## 1. Diagnóstico de la arquitectura actual

Auditoría del 2026-09-24 sobre el proyecto `dark-kitchen` (`cqfzcwpqisaohcjaevxf`) y `src/`.

### 1.1 Autenticación y registro
- Supabase Auth con correo y contraseña. Hay 1 usuario en `auth.users`.
- **El registro está cerrado.** Solo existen dos vías:
  - la invitación a una Cocina (`/invitacion/:token`, 7 días, solo para el correo invitado);
  - el arranque de una instalación vacía (`/signup-admin`).
- La app soporta confirmación de correo, pero el proyecto usa el **SMTP por defecto de Supabase**. Ese SMTP solo envía a correos del equipo del proyecto y con un límite muy bajo, así que no sirve para registro público.
- **Contexto de cada petición:** JWT de Supabase más el encabezado `x-dk-kitchen-id`, en todo: REST, RPC, Storage y la función de IA.
  - Sin encabezado no hay Cuenta activa.
  - Storage pasa todos los encabezados a la base. Verificado en el código fuente de `supabase/storage` (`pg-connection.ts:658`).
  - La app no usa Realtime: consulta cada 15–60 s.

### 1.2 Usuarios y perfiles
- `dk_users (id, auth_user_id, full_name, active, platform_role, role*)` es la identidad **global**, una por persona. `role*` es el rol global retirado en la Fase 6 (sin uso).
- No existen: correo en el perfil, avatar, *Mi perfil* ni usuarios "pendientes".
- En el sidebar hay un botón *Salir* suelto.

### 1.3 Cuentas, organización y datos existentes
- Hay 1 Cuenta (`dark-kitchen-1`) y 1 usuario: Ivan, administrador de la plataforma y Administrador de esa Cuenta.
- Datos: 17 pedidos, 311 registros de auditoría, 0 invitaciones, 0 roles propios, 0 menús maestros.
- **No existe el nivel Organización.** La migración de datos es trivial.

### 1.4 Tablas, relaciones y claves foráneas (47 tablas `dk_*`)
- **39 tablas con `kitchen_id`**: toda la operación.
- **31 FKs compuestas `(kitchen_id, x_id)`**: es imposible mezclar datos de dos Cuentas.
- 17 tablas hijas heredan `kitchen_id` por trigger. Unicidades y numeración de pedidos por Cuenta.
- Sin tenant: `dk_kitchens`, `dk_users`, `dk_permissions`, `dk_role_permissions`, `dk_units` y los menús maestros.
- `dk_roles` es mixta: los roles de sistema no tienen Cuenta; los propios, sí.
- **Todo esto se reutiliza íntegro.**

### 1.5 RLS y políticas (86)
- Patrón: `kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('orders','view'))`.
- Todo el aislamiento depende de unas 8 funciones auxiliares.
- Las RPC `SECURITY DEFINER` validan con `dk_can` y `dk_assert_in_active_kitchen`.
- Las 116 pruebas SQL de aislamiento y administración pasan.

**Hallazgos de esta auditoría** (se corrigen en el plan):

| # | Hallazgo | Riesgo |
|---|---|---|
| H1 | Las funciones de reportes (`dk_report_*`) y `dk_dashboard_summary` son `SECURITY INVOKER` y **no exigen `reports.view` ni `dashboard.view`**. | Bajo: no cruzan Cuentas y solo agregan datos que el usuario ya puede leer, pero el permiso se aplica solo en la interfaz. |
| H2 | Platos, categorías, menús, calendario, disponibilidad, domiciliarios y configuración de IA se leen **sin permiso**: basta ser miembro de la Cuenta. | Bajo: son datos que se necesitan para operar. Con el catálogo nuevo se decide explícitamente (4.3). |
| H3 | Los adjuntos de facturas usan los permisos de compras: **no hay un permiso "Facturas"**. | Funcional: no se puede dar acceso a compras sin facturas, ni al revés. |
| H4 | La interfaz oculta **módulos** según los permisos, pero oculta **acciones** solo en el tablero de Cocina. En Abastecimiento, Catálogo, Clientes, Recetas y Menús muestra botones que la base luego rechaza. | UX: con el rol activo, "ocultar acciones no permitidas" exige completar esto. |
| H5 | Hay permisos que agrupan acciones distintas: `orders.create` crea **y** confirma (reserva inventario); `operation.edit` prepara **y** prioriza; `customers.edit` también borra; `inventory.edit` crea, edita y borra insumos. | Impide roles finos como los de tus ejemplos. |

### 1.6 Roles y permisos actuales
- 38 permisos (módulo, acción) en 16 módulos.
- 6 roles de sistema (Administrador, Gerente, Caja, Cocina, Inventario, Domiciliario), con 118 asignaciones de permisos.
- **Un rol por persona y Cuenta** (`dk_kitchen_members.role_id`).
- La interfaz ya tiene la matriz para crear roles propios (*Equipo → Roles*).

### 1.7 Módulos, rutas y navegación
- **Módulos** (`src/modules`):
  - Operación: `dashboard`, `kitchen` (tablero, pedidos, despacho, voz), `menuPlanner`, `products`, `recipes`, `supply` (stock, compras, proveedores), `customers` y `cartera`, `reports`, `ai`.
  - Administración: `settings`, `team`, `kitchens` (selector), `platform`, `invitations`, `auth`, `landing`.
- **Rutas:**
  - públicas: `/landing`, `/login`, `/signup-admin`, `/invitacion/:token`;
  - `/cocinas` (selector) y `/admin` (plataforma);
  - `/k/:slug/*`: la app dentro de una Cuenta.
- **Navegación:** rail de íconos con permisos por módulo. Arriba está el selector de Cocina; abajo, las iniciales y *Salir*.
- **Dependencias:** todo módulo usa el contexto de la Cuenta activa (`useActiveKitchen`), el encabezado y la caché por Cuenta. La cadena pedidos → platos → recetas → inventario ← compras → proveedores queda siempre dentro de la misma Cuenta.

### 1.8 Configuraciones
- Por Cuenta: datos, zona horaria, moneda, horarios, alertas de tiempo (SLA), IA y contadores.
- De organización: ninguna.

### 1.9 Qué se reutiliza y qué cambia
| Se reutiliza | Se modifica | Es nuevo |
|---|---|---|
| 39 tablas con `kitchen_id`, FKs, triggers, RPC de negocio, vistas, Storage | Funciones auxiliares (`dk_current_kitchen_id`, `dk_can`…): acceso por organización y **rol activo** | `dk_organizations`, membresía de organización |
| Encabezado de Cuenta, rutas `/k/:slug`, caché por Cuenta | `dk_permissions` pasa a ser un catálogo con claves `módulo.acción` y ámbito | Asignación de **varios roles** por Cuenta, **rol activo** |
| Roles de sistema, como plantillas | Políticas y RPC pasan al catálogo nuevo (reescritura automática más pruebas) | Registro con datos de organización |
| Pruebas SQL (116) y de la app (91) | Invitaciones → "crear usuario" pendiente de activación | *Mi perfil*, avatares, menú de usuario, contexto |

---

## 2. Modelo Organización → Cuenta → Usuario

```
Plataforma (administrador de la plataforma)
└── Organización "Grupo XYZ"                 dueña: Ana (Super Admin)
    ├── Usuarios de la organización          Ana (Super Admin), Juan, María (Miembros)
    ├── Roles de la organización             plantillas del sistema + roles propios
    └── Cuentas
        ├── Hamburguesería Centro   ← datos 100 % separados
        ├── Hamburguesería Norte    ← datos 100 % separados
        └── Hamburguesería Sur      ← datos 100 % separados
```

### 2.1 Reglas
1. Una **Cuenta** pertenece a una sola **Organización**, para siempre.
2. Un **usuario** es global y puede estar en varias organizaciones (por ejemplo, un contador), pero **solo es dueño de una**.
3. En su organización, cada usuario es **Super Admin** o **Miembro** (3.3).
4. Un **Super Admin** entra a **todas** las Cuentas de su organización, incluidas las que se creen después, con todos los permisos.
5. Un **Miembro** entra **solo** a las Cuentas que le asignen, con **uno o varios roles** en cada una.
6. El **administrador de la plataforma** es Administrador en todas las Cuentas de todas las organizaciones. Además es dueño y Super Admin de su propia organización.

### 2.2 Tus ejemplos, con este modelo
| Usuario | Organización | Centro | Norte | Sur |
|---|---|---|---|---|
| Ana (creó el grupo) | **Super Admin** (dueña) | todo | todo | todo |
| María | Miembro | Cocina | Despacho | — |
| Juan | Miembro | Administrador | Cocina | Despacho |
| Juan (otro caso) | Miembro | Administrador + Cocina + Despacho | — | — |

### 2.3 Por qué los Miembros no tienen acceso "a todas las Cuentas"
La v1 lo tenía (`ALL`). Ahora que el Super Admin es asignable, quien necesita todas las Cuentas es Super Admin, y el resto se asigna Cuenta por Cuenta. La pantalla ofrece el atajo "Asignar a todas las Cuentas actuales", que crea las asignaciones una por una. Así:
- el modelo es más simple;
- no hay accesos "invisibles" a Cuentas futuras;
- cada acceso se ve en la tabla.

---

## 3. Modelo RBAC

```
Cuenta activa + Usuario + Rol activo  →  Permisos efectivos
```

### 3.1 Piezas
- **Catálogo de permisos** (sección 4):
  - Lo define la aplicación en una migración. **Nadie crea permisos desde la interfaz.**
  - Cada permiso tiene: clave (`orders.view`), módulo, acción, ámbito (`account` u `organization`), nombre y descripción.
- **Roles**:
  - **Plantillas del sistema** (ADMIN, GERENTE, CAJA, COCINA, INVENTARIO, DOMICILIARIO): iguales en toda la plataforma. No se editan, pero se pueden **duplicar** como rol propio.
  - **Roles propios** de la organización (p. ej. "Cocina Norte", "Encargado", "Despacho"): se crean y editan con la matriz de permisos y sirven en todas las Cuentas de la organización.
  - **Super Admin** (rol de organización del sistema): todos los permisos, de organización y de cuenta.
- **Asignaciones:** `usuario × Cuenta × rol`, con **varios roles por Cuenta**. Uno de ellos se marca como **predeterminado**.

### 3.2 Permisos efectivos
- **En una Cuenta:** los permisos del **rol activo** en esa Cuenta. **No es la unión** de todos sus roles. Así, al cambiar a "Cocina", la interfaz y la base se comportan exactamente como ese rol.
- **Super Admin:** su rol activo puede ser **Super Admin** (todo) o cualquiera de los roles que le hayan asignado en esa Cuenta, por ejemplo para trabajar "como Cocina".
- **En la organización:** solo el Super Admin tiene permisos de organización.
- **Administrador de la plataforma:** todo, en todas partes.

### 3.3 SUPER_ADMIN (enmendada, sección 19)
- Quien crea la organización es su **dueño** (`owner_user_id`) y es el **único SUPER_ADMIN**. No se le puede quitar ni desactivar.
- Es **intransferible** y **no se asigna** a otros usuarios, porque tiene acceso global. Para administrar una Cuenta se asigna el rol **ADMIN** en esa Cuenta.

### 3.4 Rol activo
- Se elige en el menú de usuario, entre los roles **asignados en la Cuenta actual**. La opción solo aparece si hay más de uno.
- **Viaja en cada petición** (encabezado `x-dk-role-id`) y **la base lo valida**:
  - si ese rol no está asignado a ese usuario en esa Cuenta, se ignora y se usa el predeterminado;
  - si el usuario no tiene ningún rol en la Cuenta, no hay acceso.
- Cambiar el rol activo **no modifica** las asignaciones: solo elige con cuál de sus roles trabaja.
- Se recuerda por Cuenta: al volver a Centro, el usuario retoma el último rol que usó ahí.

---

## 4. Catálogo de permisos

Construido desde la auditoría (1.5, 1.6 y 1.7). Cada permiso corresponde a una acción real de la app y a una política o RPC concreta que lo exigirá en la base.

Cómo leer la columna **Hoy**:
- permiso actual equivalente;
- **Nuevo**: no existía;
- **(separado)**: antes estaba agrupado con otra acción (H5).

### 4.1 Ámbito Cuenta (47)
| Módulo | Clave | Permite | Hoy | Se exige en |
|---|---|---|---|---|
| **Dashboard** | `dashboard.view` | Ver el resumen del negocio | `dashboard.view` | `dk_dashboard_summary` (**H1**) |
| **Cocina** (tablero) | `kitchen.view` | Ver el tablero de preparación | `operation.view` | tablero, comandas |
| | `kitchen.prepare` | Iniciar, marcar listo y retroceder la preparación | `operation.edit` | `dk_advance_kitchen_item`, `dk_revert_kitchen_item` |
| | `kitchen.prioritize` | Marcar o quitar prioridad | `operation.edit` (separado) | `dk_set_ticket_priority` |
| **Pedidos** | `orders.view` | Ver pedidos, detalle e historial | `orders.view` | `dk_orders`, ítems, historial |
| | `orders.create` | Crear pedidos (borrador) | `orders.create` | alta de pedido, `dk_create_conversational_order` |
| | `orders.edit` | Editar pedidos por confirmar | `orders.edit` | `dk_orders`, `dk_order_items` |
| | `orders.confirm` | Confirmar pedidos (reserva inventario) | `orders.create` (separado) | `dk_confirm_order` |
| | `orders.cancel` | Cancelar pedidos | `orders.delete` | `dk_cancel_order` |
| **Despacho** | `dispatch.view` | Ver pedidos listos y en ruta | `dispatch.view` | `dk_deliveries`, pedidos listos |
| | `dispatch.assign` | Despachar y asignar domiciliario | `dispatch.create` | `dk_dispatch_order` |
| | `dispatch.deliver` | Marcar entregado (el Domiciliario, solo los suyos) | `dispatch.edit` | `dk_mark_delivered` |
| | `dispatch.riders` | Administrar domiciliarios | `dispatch.manage` | `dk_delivery_riders` |
| **Clientes** | `customers.view` | Ver clientes y su historial | `customers.view` | `dk_customers` |
| | `customers.create` | Crear clientes | `customers.create` | alta, `dk_find_or_create_customer_by_phone` |
| | `customers.edit` | Editar clientes | `customers.edit` | `dk_customers` |
| | `customers.delete` | Eliminar clientes | `customers.edit` (separado) | `dk_customers` |
| **Cartera** | `receivables.view` | Ver saldos, pagos y cartera vencida | `receivables.view` | `dk_receivables`, `dk_order_payments` |
| | `receivables.collect` | Registrar pagos | `receivables.create` | `dk_register_payment` |
| **Menús** | `menus.view` | Ver el planificador y el menú del día | `menu_planner.view` | calendario (**H2**) |
| | `menus.edit` | Programar platos por día: disponibilidad, horarios, precio promocional | `menu_planner.edit` | `dk_menu_plan_items`, `dk_daily_availability` |
| | `menus.manage` | Copiar semanas o días, administrar menús | `menu_planner.manage` | `dk_copy_*`, `dk_menus` |
| **Platos** | `products.view` | Ver platos, precios y categorías | `products.view` | `dk_products` (**H2**) |
| | `products.create` | Crear platos y categorías | `products.create` | `dk_products`, categorías |
| | `products.edit` | Editar platos, precios e imagen; activarlos o desactivarlos | `products.edit` | `dk_products`, Storage |
| **Recetas** | `recipes.view` | Ver recetas, costos y márgenes | `recipes.view` | `dk_recipes`, `dk_recipe_items` |
| | `recipes.edit` | Crear versiones de receta | `recipes.create` | `dk_create_recipe_version` |
| **INVENTARIO** | `inventory.view` | Ver stock, movimientos y reservas | `inventory.view` | stock, movimientos |
| | `inventory.create` | Crear insumos | `inventory.edit` (separado) | `dk_ingredients` |
| | `inventory.edit` | Editar insumos, categorías y unidades de compra | `inventory.edit` | `dk_ingredients`, categorías, unidades |
| | `inventory.delete` | Eliminar insumos | `inventory.edit` (separado) | `dk_ingredients` |
| | `inventory.adjust` | Registrar mermas y ajustes | `inventory.create` | `dk_register_waste`, `dk_register_adjustment` |
| **Abastecimiento** | `purchasing.view` | Ver compras y sugerencias de reposición | `purchases.view` | `dk_purchases`, `dk_supply_suggestions` |
| | `purchasing.create` | Crear y editar compras en borrador | `purchases.create` | `dk_purchases`, `dk_purchase_items` |
| | `purchasing.confirm` | Confirmar compras (entran al inventario y al costo) | `purchases.manage` | `dk_confirm_purchase` |
| **Proveedores** | `suppliers.view` | Ver proveedores y sus insumos | `suppliers.view` | `dk_suppliers` |
| | `suppliers.edit` | Crear, editar y eliminar proveedores | `suppliers.edit` | `dk_suppliers`, `dk_supplier_ingredients` |
| **Facturas** | `invoices.view` | Ver facturas de compra y sus archivos | **Nuevo** (antes `purchases.view`) | `dk_attachments`, Storage (**H3**) |
| | `invoices.upload` | Subir y eliminar archivos de facturas | **Nuevo** (antes `purchases.create`) | `dk_attachments`, Storage |
| **Reportes** | `reports.view` | Ver reportes de ventas, platos, compras y mermas | `reports.view` | `dk_report_*` (**H1**) |
| | `reports.profitability` | Ver rentabilidad y costos | **Nuevo** | `dk_report_profitability` |
| **IA** | `ai.manage` | Activar funciones de IA y ajustar umbrales | `ai.manage` | `dk_ai_features` |
| **Configuración** | `settings.view` | Ver horario, alertas y datos de la Cuenta | `settings.view` | horarios, SLA |
| | `settings.manage` | Editar datos de la Cuenta, horario y alertas | `settings.manage` | `dk_kitchens`, horarios, SLA |
| **Equipo de la Cuenta** | `team.view` | Ver quién trabaja en la Cuenta y con qué roles | `members.view` | asignaciones |
| | `team.manage` | Asignar usuarios y roles **en esta Cuenta** (sección 11) | `members.manage` | RPC de asignación |
| **Auditoría** | `audit.view` | Ver el registro de cambios de la Cuenta | **Nuevo** (antes `settings.manage`) | `dk_audit_log` |

### 4.2 Ámbito Organización (9, solo SUPER_ADMIN)
| Clave | Permite |
|---|---|
| `organization.view` | Ver los datos de la organización |
| `organization.manage` | Editar los datos de la organización: nombre, dirección, sector, categoría, datos legales |
| `accounts.view` | Ver todas las Cuentas de la organización |
| `accounts.create` | Crear Cuentas |
| `accounts.manage` | Editar, activar y desactivar Cuentas |
| `users.view` | Ver los usuarios de la organización, sus roles y sus permisos efectivos |
| `users.manage` | Crear, editar, activar y desactivar usuarios; asignarlos a Cuentas y roles |
| `roles.manage` | Crear, editar, duplicar y eliminar roles propios |
| `master_menus.manage` | Menús maestros de la organización y con qué Cuentas se comparten |

Los permisos de organización **no se asignan a roles propios**: son del Super Admin. Así, a la pregunta "¿quién administra la organización?" hay una sola respuesta. Si más adelante hace falta un "administrador de organización limitado", el catálogo ya lo permite sin cambiar el modelo (D-C).

### 4.3 Lecturas abiertas a cualquier miembro de la Cuenta (H2)
- Siguen abiertas:
  - las **unidades de medida**;
  - el **horario**, para mostrar si la Cuenta está abierta;
  - la **configuración de IA**, para saber qué avisos mostrar.
- **Platos y menú del día, en solo lectura:** los necesitan Caja, Cocina y Despacho para operar. Con el catálogo nuevo, la política exige `products.view` o alguno de estos: `orders.*`, `kitchen.view`, `menus.view`.

### 4.4 Plantillas del sistema con el catálogo nuevo
Mantienen los alcances de hoy, con las separaciones de H5:

| Plantilla | Resumen |
|---|---|
| **ADMIN** | Todos los permisos de Cuenta (y los que se agreguen al catálogo) |
| **GERENTE** | Todo menos `team.manage` y `audit.view` |
| **CAJA** | Pedidos (sin preparar), despacho (asignar y entregar), clientes (sin eliminar), cartera, ver menús y platos, reportes (sin rentabilidad), dashboard |
| **COCINA** | Tablero (preparar y priorizar), ver y cancelar pedidos, editar el menú del día, ver platos y recetas |
| **Inventario** | Inventario completo, compras, proveedores, facturas, ver recetas y platos, reportes, dashboard |
| **DOMICILIARIO** | Ver el tablero y los despachos; marcar entregado (solo los suyos) |

Los roles propios de tus ejemplos se crean duplicando una plantilla o desde cero:
- **Cocina:** `kitchen.view`, `orders.view`, `orders.edit`, `inventory.view`. Sin facturas ni usuarios.
- **Despacho:** `orders.view`, `orders.edit`, `dispatch.view`, `dispatch.assign`, `dispatch.deliver`. Sin inventario ni facturas.
- **Administrador:** todos los permisos de Cuenta.

---

## 5. Modelo de datos

Solo lo nuevo o modificado. Las 39 tablas operativas no cambian.

```
dk_organizations
  id, slug unique, name
  address, city, country, sector, category            ← del registro
  legal_name, tax_id, phone, currency, default_timezone
  owner_user_id uuid not null unique → dk_users        ← dueño: 1 organización propia por persona
  active boolean, max_accounts int null (null = sin tope), created_at, updated_at

dk_kitchens (= Cuenta)
  + organization_id uuid not null → dk_organizations   (inmutable)

dk_organization_members                                 ← pertenencia a la organización
  organization_id, user_id  (pk)
  is_super_admin boolean                                ← el dueño siempre true
  status text check in ('pending','active','disabled')  ← pending = creado, aún sin activar
  created_by, created_at, updated_at

dk_kitchen_members (existe)                             ← pertenencia a una Cuenta
  kitchen_id, user_id (pk), active
  + default_role_id → dk_roles                          ← rol con el que entra si no eligió otro
  - role_id  (pasa a dk_member_roles)

dk_member_roles                                         ← NUEVA: varios roles por Cuenta
  kitchen_id, user_id, role_id  (pk de los tres)
  fk (kitchen_id, user_id) → dk_kitchen_members
  assigned_by, assigned_at

dk_permissions (se reestructura)
  key text pk ('orders.view'), module, action, scope ('account'|'organization'),
  label, description, sort_order

dk_roles
  id, organization_id null (null = plantilla del sistema), key, name, description,
  is_system, created_from_role_id null (si se duplicó), created_at, updated_at
  - kitchen_id (hoy hay 0 roles propios)

dk_role_permissions
  role_id, permission_key → dk_permissions(key)
  -- check: los roles propios solo admiten permisos de ámbito 'account'

dk_users
  + email citext unique                                 ← para usuarios pendientes y para buscar
  + avatar_key text check (formato)                     ← catálogo de 20, sin fotos
  + last_account_id
  auth_user_id pasa a admitir null                      ← pendiente = todavía sin usuario de Auth

dk_user_activations                                     ← reemplaza dk_kitchen_invitations (0 filas)
  id, organization_id, user_id, token_hash, expires_at, used_at, revoked_at, created_by, created_at

dk_member_active_role (opcional; también puede vivir en el navegador)
  kitchen_id, user_id, role_id                          ← último rol activo usado en cada Cuenta

dk_master_menus
  + organization_id not null

dk_audit_log
  + organization_id
```

**Guardas (triggers):**
- El dueño es el único SUPER_ADMIN y siempre está activo (`dk_guard_org_owner_membership`); `owner_user_id` es inmutable (`dk_guard_organization`).
- `dk_member_roles` solo admite roles del sistema o de **la misma organización** de la Cuenta.
- `dk_kitchen_members` exige que el usuario pertenezca a la organización de la Cuenta.
- `default_role_id` debe estar entre los roles asignados.
- No se puede eliminar un rol que alguien tiene asignado.

---

## 6. Relaciones entre usuarios, Cuentas, roles y permisos

```
dk_users ─┬─< dk_organization_members >── dk_organizations ──< dk_kitchens (Cuentas)
          │        (is_super_admin)             │ owner_user_id                  │
          │                                     └──< dk_roles (propios)          │
          └─< dk_kitchen_members >───────────────────────────────────────────────┘
                   │ default_role_id
                   └─< dk_member_roles >── dk_roles ──< dk_role_permissions >── dk_permissions
```

- **Usuario → Organización:** N:M (normalmente 1). Es dueño de como máximo una.
- **Usuario → Cuenta:** N:M, solo dentro de organizaciones donde es miembro activo.
- **Usuario × Cuenta → Roles:** 1:N, con uno predeterminado.
- **Rol → Permisos:** N:M sobre el catálogo.
- **Super Admin:** accede a todas las Cuentas de su organización **sin** filas en `dk_kitchen_members`. Por eso, al crear una Cuenta nueva ya tiene acceso, sin pasos extra.

---

## 7. Estrategia de Supabase RLS

### 7.1 Contexto de cada petición (lo valida la base)
**`x-dk-kitchen-id` (Cuenta activa).** Hay acceso si se cumple alguna de estas:
- es administrador de la plataforma;
- es Super Admin activo de la organización de la Cuenta;
- es miembro activo de la Cuenta.

Además, la organización y la Cuenta deben estar activas. Solo el administrador de la plataforma entra aunque estén desactivadas, para dar soporte. En cualquier otro caso el resultado es `NULL` y la consulta devuelve cero filas.

**`x-dk-role-id` (rol activo).**
- Tiene que estar en `dk_member_roles` para esa Cuenta y ese usuario. Para el Super Admin también vale el rol virtual **Super Admin**.
- Si no es válido, se usa el rol predeterminado.
- **Nunca** se acepta un rol no asignado.

### 7.2 Funciones
- `dk_current_kitchen_id()`: la de hoy, con la regla de 7.1.
- `dk_active_role_id()`: nueva, con la regla de 7.1.
- `dk_can('orders.view')`:
  - `true` para el administrador de la plataforma y para un Super Admin con rol activo "Super Admin";
  - en los demás casos, `true` solo si el permiso está en el **rol activo**.
- `dk_has_org_permission(org, 'users.manage')`: nueva. Verdadero para el administrador de la plataforma o un Super Admin activo de `org`.

Todas son `STABLE` y se usan como `(select f())`, así que se evalúan **una vez por consulta**.

### 7.3 Políticas
- **Tablas de la Cuenta (39):** el patrón no cambia; cambia la clave del permiso: `dk_can('orders','view')` pasa a `dk_can('orders.view')`.
  - La reescritura es **automática**: una migración aplica la tabla de equivalencias de 4.1, como en la Fase 3 de la ADR 0007.
  - Los casos separados (H5) se editan a mano:
    - `dk_confirm_order` → `orders.confirm`;
    - prioridad → `kitchen.prioritize`;
    - borrar clientes → `customers.delete`;
    - insumos (crear, editar y borrar por separado);
    - facturas → `invoices.*`.
- **Reportes y dashboard (H1):** agregan `dk_can('reports.view')`, `dk_can('reports.profitability')` o `dk_can('dashboard.view')`.
- **Tablas de organización:** se protegen por la fila con `dk_has_org_permission(organization_id, …)`, sin encabezado.
  - Un Miembro ve su organización (el nombre) y sus propias membresías.
  - Solo el Super Admin ve y modifica usuarios, roles, Cuentas y configuración.
- **Escrituras sensibles** (usuarios, asignaciones, roles, Super Admin, Cuentas): solo por **RPC** `SECURITY DEFINER`, nunca con escritura directa.

### 7.4 Reglas contra el escalamiento de privilegios (en la base)
1. **Nadie modifica sus propias asignaciones**: roles, Cuentas, Super Admin, activo o inactivo. Lo tiene que hacer otro usuario autorizado.
2. **Nadie asigna un rol con permisos que él mismo no tiene** en esa Cuenta. El Super Admin los tiene todos.
3. `team.manage` (Administrador de una Cuenta):
   - asigna **solo en su Cuenta**;
   - no crea Super Admins ni toca otras Cuentas;
   - trabaja con usuarios ya creados en la organización, o crea uno nuevo que queda solo en su Cuenta.
4. **Nadie edita un rol propio que tiene asignado**, salvo un Super Admin. Así nadie puede subirse permisos a través de su propio rol.
5. SUPER_ADMIN no se nombra ni se quita: es el creador de la organización (sección 19).
6. El rol activo solo puede ser uno asignado (7.1).
7. Todo queda en `dk_audit_log` con organización, Cuenta, quién y qué.

### 7.5 URLs, IDs y parámetros
- El `slug` de la URL solo se resuelve si la Cuenta está en el contexto del usuario (`dk_my_context()`).
- Un encabezado fabricado, con otra Cuenta o con otro rol, se valida en la base y se descarta.
- Las FKs compuestas impiden cruzar filas entre Cuentas.

La suite ampliada (fase C) prueba estos casos:
- una segunda organización y un usuario que pertenece a dos organizaciones;
- un Miembro con varios roles y un rol activo inventado;
- asignarse roles a uno mismo, o asignar roles con más permisos que los propios;
- editar el rol propio;
- acceder a una Cuenta de otra organización;
- una organización desactivada;
- llamar a los reportes sin el permiso.

---

## 8. Flujo de registro

```
Landing ── "Crear mi negocio" ──> /registro
 Paso 1 · Tu usuario:        Nombre · Correo · Contraseña
 Paso 2 · Tu organización:   Nombre · Sector · Categoría · Dirección · Ciudad · País
                             (opcionales: Teléfono · NIT · Razón social)
                             [CAPTCHA]  →  "Crear mi negocio"
```

**El formulario:**
- Son dos pasos cortos. La zona horaria y la moneda se deducen del país y se pueden cambiar después.
- **Sector** (lista): Dark kitchen · Restaurante · Comida rápida · Cafetería · Panadería y pastelería · Bar · Catering y eventos · Food truck · Otro.
- **Categoría** (lista): Hamburguesas · Pizza · Pollo · Asiática · Mexicana · Típica · Parrilla · Saludable · Vegetariana/Vegana · Mariscos · Postres · Café · Desayunos · Internacional · Otra.
- Los demás datos que hoy pide la app a una Cuenta (razón social, NIT, teléfono, zona horaria) son opcionales en el registro o se llenan después en Configuración.

**Qué pasa al pulsar "Crear mi negocio"** (RPC `dk_create_organization`, en **una transacción**):
1. Crea el usuario en Auth (`signUp`) y su perfil `dk_users`, con un avatar sugerido.
2. Crea la **Organización** con sus datos y deja al usuario como **dueño y Super Admin**.
3. Crea la **primera Cuenta** con el mismo nombre y dirección, asociada a la organización y con sus valores por defecto:
   - horario vacío;
   - alertas de tiempo;
   - funciones de IA;
   - contador de pedidos;
   - zona horaria.
4. Devuelve el identificador de la Cuenta.
5. La app **entra directamente** a `/k/{cuenta}/` con una bienvenida breve: "Tu negocio está listo". Ofrece tres atajos opcionales (cargar el primer plato, configurar el horario, invitar al equipo). Nunca hay una pantalla vacía ni un paso obligatorio.

**Confirmación del correo (D-A, aprobada: confirmar el correo con un enlace que lleva a la Cuenta).** La secuencia real es:
1. Al pulsar "Crear mi negocio" se llama a `supabase.auth.signUp` con los datos de la organización en `user_metadata` (`pending_organization`). Todavía no se crea nada en las tablas `dk_*`.
2. La pantalla muestra **"Revisa tu correo"**, con el correo usado, **Reenviar** (con espera entre envíos) y **"¿Te equivocaste de correo?"**, que vuelve al formulario.
3. El enlace del correo lleva a `/registro/confirmado`, que es el `emailRedirectTo` de `signUp`. Ahí la sesión ya existe y la app llama a **`dk_create_organization`** con los datos guardados en paso 1. Se muestra "Preparando tu negocio…" (~1–2 s).
4. La RPC exige que `auth.users.email_confirmed_at` no sea nulo. Es **idempotente**: si el enlace se abre dos veces o en otro dispositivo, devuelve la Cuenta ya creada y no crea otra.
5. La app entra **directo** a `/k/{cuenta}/` con la bienvenida. No hay que iniciar sesión otra vez ni llenar nada más.

**Casos borde:**
- **Enlace vencido:** se muestra "Tu enlace venció" con la opción de reenviarlo.
- **Primer inicio de sesión sin organización:** si la persona confirma, pero entra por `/login` antes de que se cree la organización, la app detecta `pending_organization` y hace el mismo paso 3.
- **Nunca confirma:** no se crea nada. Un trabajo periódico puede limpiar los usuarios de Auth sin confirmar después de N días (opcional).

**Garantías:**
- Solo se crean organizaciones para correos **confirmados**: los bots y los correos mal escritos no dejan nada en la base.
- Si algo falla, la transacción se revierte y no quedan organizaciones a medias.
- Si el usuario de Auth ya existía, se ofrece "Iniciar sesión".
- Quien ya es dueño de una organización no puede crear otra (D2).
- `dk_users_insert` sigue cerrado para el cliente: los perfiles solo se crean por RPC.

**Requisitos que configuras tú** (los secretos nunca pasan por el código ni por el chat):
- SMTP propio (Resend, SES, Postmark…);
- CAPTCHA (hCaptcha o Turnstile);
- *Site URL* y URLs de redirección;
- protección de contraseñas filtradas.

---

## 9. Flujo de creación de Cuentas

1. El Super Admin entra a **Organización → Cuentas → "Nueva Cuenta"**, o desde el menú de usuario.
2. Llena un formulario corto:
   - **Nombre** (obligatorio);
   - dirección, teléfono y zona horaria, heredados de la organización;
   - "**Copiar de otra Cuenta**" (opcional), con casillas para elegir qué traer:
     - platos y categorías;
     - recetas e insumos (sin stock);
     - proveedores;
     - horario y alertas.
3. La RPC `dk_create_account`:
   - exige `accounts.create`, y el tope si la plataforma fijó uno;
   - crea la Cuenta con sus valores por defecto;
   - copia lo elegido.

   Todos los Super Admin tienen acceso a la nueva Cuenta de inmediato.
4. Se ofrecen dos acciones: "**Ir a la nueva Cuenta**" y "**Asignar usuarios**".

Los datos operativos (pedidos, clientes, stock, compras) **nunca** se copian: cada Cuenta empieza limpia.

---

## 10. Flujo de creación de usuarios

"Crear usuario" lo usa el Super Admin, o el Administrador de una Cuenta, limitado a ella:

```
1. Datos:      Nombre · Correo
2. Acceso:     Cuentas y roles (al menos una Cuenta):
                 Centro   [Cocina ✓] [Despacho ☐] ...   predeterminado: Cocina
                 Norte    [Despacho ✓]                    predeterminado: Despacho
                 (atajo: "Aplicar a todas las Cuentas actuales")
3. "Crear usuario"  →  aparece en la lista como  ● Pendiente de activación
                     →  enlace de activación: se envía por correo (con SMTP) o se copia
```

- **Activación:** la persona abre el enlace.
  - Si es nueva, define su contraseña.
  - Si ya tiene usuario en la plataforma (en otra organización), inicia sesión y acepta.

  En los dos casos queda **Activa**, con los roles ya asignados.
- **Contraseñas:** el administrador **nunca** define ni ve contraseñas. Hacer que el administrador ponga la contraseña exigiría la clave de servicio en una función del servidor, y el administrador conocería la contraseña de otra persona. No se recomienda.
- **Antes de activarse,** el usuario pendiente ya se puede:
  - **editar** (nombre, Cuentas, roles);
  - **reenviar** el enlace (el anterior deja de valer);
  - **eliminar**.
- **Qué edita el administrador después:** Cuentas, roles, rol predeterminado y el estado activo. El nombre y el avatar pasan a ser de la persona (*Mi perfil*).
- **Activar o desactivar:**
  - en la organización, corta el acceso a todas sus Cuentas de esa organización;
  - en una Cuenta, solo a esa Cuenta.
- **Si el correo ya es de un usuario de la plataforma,** se reutiliza su identidad. Aun así, la persona **debe aceptar** unirse: nadie queda dentro de un negocio ajeno sin su consentimiento.
- **En la base:**
  - `dk_users` guarda el `email`; `auth_user_id` queda vacío hasta la activación;
  - `dk_organization_members` queda en `pending`;
  - se crean las asignaciones;
  - `dk_user_activations` guarda el token cifrado (7 días).

---

## 11. Flujo de asignación de roles

**Desde el usuario** (Organización → Usuarios → Juan):
```
Juan Pérez · juan@…  · Miembro · Activo
┌ Centro ──────────────────────────────────────────┐
│ Roles: [Administrador ✓] [Cocina ✓] [Despacho ✓] │  predeterminado: Administrador
│ Permisos efectivos ▸ (por rol)                    │
├ Norte ───────────────────────────────────────────┤
│ Roles: [Cocina ✓]                                 │
└ + Asignar a otra Cuenta                           ┘
```

**Desde el rol** (Organización → Roles → Cocina):
- los permisos del rol, agrupados por módulo, con la matriz Ver/Crear/Editar/Eliminar y las acciones especiales;
- **Usuarios con este rol**, por Cuenta;
- acciones: **Duplicar**, **Editar** (solo roles propios) y **Eliminar** (si nadie lo tiene asignado).

**Reglas** (las aplica la base, 7.4):
- nadie se asigna roles a sí mismo;
- nadie asigna roles con permisos que no tiene;
- `team.manage` solo actúa en su Cuenta;
- SUPER_ADMIN no se asigna: es solo el creador de la organización.

Los cambios aplican en la **siguiente petición** del usuario afectado. Si su rol activo deja de estar asignado, la base usa el predeterminado y la app le avisa.

---

## 12. Flujo de cambio de rol activo

1. En el menú de usuario → **Rol: Administrador ▾**. Aparece solo si tiene más de un rol en la Cuenta actual, o si es Super Admin con roles asignados.
2. La lista muestra **solo los roles asignados en esta Cuenta**, con ✓ en el actual y una línea con lo que permite cada uno (p. ej. "Cocina: tablero, pedidos").
3. Al elegir "Cocina":
   - cambia el encabezado `x-dk-role-id`, y la base valida el rol en la siguiente petición;
   - la app recarga sus permisos (`dk_my_context`) y, en el mismo instante:
     - el rail muestra solo los módulos permitidos;
     - desaparecen los botones no permitidos;
     - si la pantalla actual ya no está permitida, lleva al inicio de la Cuenta con el aviso "Estás trabajando como Cocina";
   - la caché de datos se separa también **por rol**: lo cargado como Administrador no se muestra como Cocina.
4. Las asignaciones no cambian. El último rol activo se recuerda por Cuenta.
5. No hay forma de elegir un rol no asignado: la lista viene de la base, y si alguien fabrica el encabezado, la base lo descarta.

---

## 13. Flujo de cambio de Cuenta

1. Se abre desde el **indicador de contexto** o desde el menú de usuario → **Cambiar Cuenta**.
   - La lista viene de `dk_my_context()`, agrupada por organización. El nombre del grupo aparece solo si hay más de una.
   - Cada Cuenta muestra los roles del usuario en ella, con ✓ en la actual.
   - Si hay más de 6, se muestra una búsqueda.
2. Al elegir una, la app navega a la **misma sección** en la otra Cuenta (`/k/centro/supply` → `/k/norte/supply`) y:
   - cambia el encabezado de la Cuenta;
   - el **rol activo pasa a ser el último usado en esa Cuenta**, o su predeterminado;
   - recalcula permisos, módulos y zona horaria;
   - usa una caché separada por Cuenta y por rol.
3. Si esa sección no está permitida con el rol que queda activo, va al inicio de la Cuenta.
4. Si hay un formulario con cambios sin guardar, pide confirmación.
5. `last_account_id` se guarda en el perfil, así que funciona también desde otro equipo.

### 13.1 Contexto visible y menú de usuario
**Indicador de contexto**, arriba del contenido:
```
Grupo XYZ  ›  Hamburguesería Centro  ·  Rol: Cocina ▾
```
Con **una organización y una sola Cuenta** se simplifica a "Hamburguesería Centro · Cocina". En el celular va en la barra superior.

**Menú de usuario**, al pulsar el avatar (abajo en el rail; arriba a la derecha en el celular):
```
┌─────────────────────────────────────────┐
│ (🍔)  Juan Pérez · juan@grupoxyz.com     │
│ Organización  Grupo XYZ                  │
│ Cuenta        Hamburguesería Centro      │
│ Rol activo    Cocina                  ▾  │ ← cambiar rol (si tiene varios)
├─────────────────────────────────────────┤
│ Mi perfil                                │
│ Configuración                            │ ← de la Cuenta (si tiene permiso)
│ Cambiar Cuenta                        ›  │ ← si tiene más de una
├─────────────────────────────────────────┤
│ Usuarios y permisos                      │ ← users.view (org) o team.view (Cuenta)
│ Configuración de la organización         │ ← Super Admin
│ Plataforma                               │ ← administrador de la plataforma
├─────────────────────────────────────────┤
│ Cerrar sesión                            │ ← siempre al final; ya no hay botón suelto
└─────────────────────────────────────────┘
```
- Es un popover accesible (teclado, `Esc`). En el celular, una hoja inferior.
- Las opciones sin permiso **no aparecen**.
- "Equipo" y "Configuración" salen del rail, que queda solo con la operación.

**Contexto en la app:** un solo `useAppContext()` con `{ organización, cuenta, usuario, rolActivo, rolesAsignados, can(clave) }`, alimentado por `dk_my_context()`. Reemplaza a `useActiveKitchen()` en todos los módulos.

**Avatares:**
- 20 ilustraciones SVG propias, de gastronomía, en tarjeta oscura con acento de marca, dentro del bundle.
- La base solo guarda `avatar_key`: no se suben fotos ni se aceptan URLs.
- Mientras la persona no elija uno, se usa un avatar fijo derivado de su ID.

---

## 14. Permisos efectivos por usuario

**Qué calcula la base.** La RPC `dk_effective_permissions(usuario, cuenta, rol?)` (requiere `users.view` o `team.view`) devuelve:
- **Por rol** asignado en esa Cuenta: su lista de permisos.
- **El rol activo actual**, si alguien se consulta a sí mismo.
- **El máximo posible** en esa Cuenta: la unión de sus roles. Es solo informativo y nunca se aplica, porque siempre rige un rol a la vez.

**Dónde se ve:**
- Organización → Usuarios → *usuario* → **Permisos efectivos**: tabla módulo × acción por Cuenta, con el rol que otorga cada permiso.
- *Mi perfil* → "Dónde tengo acceso": organizaciones, Cuentas, roles y rol activo.
- Organización → Roles → *rol* → permisos del rol y **Usuarios con este rol**.

La interfaz usa exactamente estos datos para mostrar u ocultar opciones, y la base los usa para autorizar. Hay una sola fuente.

---

## 15. Migración de los datos actuales

Es aditiva y **no mueve ningún pedido**. Punto de partida: 1 Cuenta, 1 usuario, 0 invitaciones, 0 roles propios, 0 menús maestros.

1. **Organización inicial "Dark Kitchen"** (slug `dark-kitchen`): Ivan queda como dueño y Super Admin. El sector y la categoría se completan después en Configuración.
2. `dark-kitchen-1.organization_id` apunta a esa organización; después se vuelve `NOT NULL`.
3. **Catálogo nuevo:**
   - se insertan los 57 permisos;
   - se traducen las 118 asignaciones de las 6 plantillas con la tabla de equivalencias. Donde un permiso se separó (H5), la plantilla recibe **ambos**, así nadie pierde nada;
   - `reports.profitability`, `invoices.*` y `audit.view` se agregan a quienes hoy tienen el permiso del que provienen.
4. **Asignaciones:** cada `dk_kitchen_members.role_id` pasa a una fila en `dk_member_roles` más el `default_role_id`. Hoy es una sola fila: Ivan, Administrador.
5. **Políticas y RPC al catálogo nuevo:**
   - reescritura automática de `dk_can('m','a')` a `dk_can('m.a')` con la tabla de equivalencias;
   - ediciones manuales para las separaciones;
   - controles nuevos en reportes y dashboard (H1).
6. `dk_kitchen_invitations` (0 filas) se reemplaza por `dk_user_activations`. La tabla vieja se elimina cuando lo apruebes.
7. **Verificación:**
   - las 116 pruebas actuales, adaptadas al catálogo;
   - las pruebas nuevas;
   - una **prueba de equivalencia**: cada plantilla permite **exactamente lo mismo que hoy**, más las separaciones.

Cada paso se ensaya antes en una transacción revertida sobre la base real, como en la ADR 0007.

---

## 16. Riesgos y posibles problemas

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | **Reescritura de 86 políticas y ~20 RPC** al catálogo nuevo: un error podría abrir o cerrar un acceso. | Reescritura automática con tabla de equivalencias, prueba de equivalencia por plantilla, suite ampliada y una sola migración dentro de una transacción. |
| R2 | **Rol activo**: si la caché de la app no se separa por rol, podría mostrar datos cargados con un rol más amplio. | Clave de caché = Cuenta + rol. La base siempre filtra con el rol activo: como mucho se vería algo ya cargado, nunca algo nuevo. |
| R3 | Un rol activo inválido o desasignado mientras se usa. | La base cae al rol predeterminado y la app avisa. Si no queda ningún rol, no hay acceso. |
| R4 | Registros basura (bots, correos falsos). | Confirmación obligatoria (D-A): sin correo confirmado no se crea nada. También CAPTCHA, límites de tasa y una organización por persona. |
| R5 | Con el SMTP por defecto no llegan confirmaciones ni activaciones a clientes. | Configurar SMTP antes de la Fase F. Mientras tanto, el enlace de activación se copia (como hoy las invitaciones). |
| R6 | Usuarios pendientes: correos mal escritos, o averiguar si un correo ya existe en la plataforma. | Los pendientes se editan o se eliminan. La respuesta es la misma exista o no el correo. Unirse exige que la persona acepte. |
| R7 | Un usuario en dos organizaciones podría ver datos o usuarios de la otra. | Todo se resuelve por organización; `dk_can_see_user` filtra por organización compartida. Hay una prueba específica. |
| R8 | Acceso global a todas las Cuentas. | Solo lo tiene el creador (SUPER_ADMIN), intransferible y no asignable (sección 19). |
| R9 | Las separaciones (H5) cambian el comportamiento de los roles propios que se creen antes de migrar. | Hoy hay 0 roles propios, y la migración asigna ambos permisos separados. |
| R10 | Muchas acciones de la interfaz aún no se ocultan por permiso (H4). | La fase E recorre cada módulo con el catálogo y cada botón usa `can('clave')`. Una prueba lista las claves que usa la app y verifica que existan en el catálogo. |
| R11 | Rendimiento de `dk_can` con rol activo y organización. | Una evaluación por consulta, índices parciales y `EXPLAIN ANALYZE` antes y después sobre `dk_orders`. |
| R12 | El administrador de la plataforma tiene acceso a los datos de todas las organizaciones. | Nota visible en *Usuarios y permisos* de cada organización, auditoría con su nombre y mención en los términos de servicio antes del registro público. |
| R13 | Realtime no envía encabezados. | Hoy la app no lo usa. Si se agrega, se usarán canales privados con autorización por tema. |
| R14 | n8n y las cuentas de servicio. | Se crean como un usuario de la organización con un rol (Caja) en una Cuenta. Encabezado de Cuenta como hoy; sin encabezado de rol se usa el predeterminado. Se actualiza la guía. |
| R15 | Cambio grande de navegación: Equipo y Configuración salen del rail, Salir pasa al menú, hay rutas nuevas. | Redirecciones desde las rutas viejas, manual actualizado y entrega por fases. |
| R16 | Borrado de organizaciones o datos personales; facturación y planes. | Fuera de alcance: solo se desactiva. `max_accounts` deja preparado dónde aplicar un plan. |

---

## 17. Plan de implementación incremental

Cada fase:
- está hecha de migraciones pequeñas con sus pruebas;
- se ensaya en una transacción revertida sobre la base real y después se aplica;
- deja la app funcionando, así que se puede pausar entre fases.

| Fase | Contenido | Visible | Criterio de salida |
|---|---|---|---|
| **A. Menú de usuario y perfil** | Avatares (20 SVG, `avatar_key`), *Mi perfil* (nombre, avatar, contraseña), **menú de usuario** con contexto y *Cerrar sesión* adentro, indicador de contexto. Todavía sin organizaciones. | Sí | Salir ya no está suelto. El avatar persiste. Pruebas en verde. |
| **B. Catálogo de permisos** | `dk_permissions` con claves y ámbitos, 47 permisos de Cuenta, plantillas traducidas, reescritura de políticas y RPC, controles en reportes y dashboard (H1), permiso Facturas (H3), separaciones (H5). La app pasa a `can('orders.view')`. | Mínimo | Prueba de equivalencia de plantillas. Las 116 pruebas, adaptadas, en verde. |
| **C. Organizaciones y roles múltiples** | `dk_organizations`, membresías, Super Admin, `dk_member_roles`, rol predeterminado, `x-dk-role-id` validado, `dk_can` por rol activo, `dk_has_org_permission`, `dk_my_context`, reglas contra el escalamiento, migración (sección 15). Suite ampliada (≥ 50 pruebas nuevas). | No | Ivan es dueño y Super Admin. Todas las suites en verde. `EXPLAIN` sin regresión. |
| **D. Contexto y cambios en la app** | `useAppContext`, **cambio de rol activo**, cambio de Cuenta con organización, caché por Cuenta y rol, `/cuentas` (con redirección desde `/cocinas`), textos "Cuenta"/"usuario". | Sí | Juan cambia de Administrador a Cocina, y la interfaz y la base responden como Cocina. |
| **E. Administración de la organización** | Usuarios (crear pendiente, activar, editar, Cuentas y roles, permisos efectivos), Roles (plantillas, duplicar, matriz, usuarios por rol), Cuentas (crear con "copiar de"), configuración de la organización, menús maestros por organización. Acciones ocultas por permiso en todos los módulos (H4). | Sí | Los ejemplos de María y Juan se configuran desde la interfaz y la base los respeta. |
| **F. Registro público** | `/registro` en dos pasos, `dk_create_organization`, entrada directa a la Cuenta, bienvenida, CTA en la landing, panel de plataforma con organizaciones. **Se activa** cuando estén el SMTP y el CAPTCHA. | Sí | Registro → Organización → primera Cuenta → entorno de la Cuenta, sin pantallas vacías. |
| **G. Cierre** | Retirar `dk_kitchen_invitations`; actualizar la guía de n8n, el manual de usuario, la ADR 0007 y la documentación de arquitectura. | Parcial | Documentación al día y todas las suites en verde. |

La **Fase A** es independiente y de bajo riesgo. La **B** va antes que la C para que el cambio de catálogo, el más delicado, se pruebe solo y no se mezcle con el de organizaciones.

---

## 18. Decisiones (todas aprobadas el 2026-09-24)

| # | Decisión | Recomendación |
|---|---|---|
| **D-A** | Registro: entrada inmediata o confirmar el correo | ✅ **Aprobada (2026-09-24):** confirmar el correo; el enlace lleva directo a la Cuenta recién creada (sección 8). |
| **D-B** | Los permisos efectivos son los del **rol activo**, no la unión de todos los roles. | Sí. Es lo que hace que "cambiar a Cocina" signifique algo, también en la base. |
| **D-C** | Los permisos de organización son **solo del Super Admin** (no se asignan a roles propios). | Sí, por ahora. El catálogo ya permite abrirlo más adelante. |
| **D-D** | "Crear usuario" deja al usuario **pendiente de activación**: la persona define su contraseña desde un enlace. | Sí. El administrador nunca maneja contraseñas ajenas. |
| **D-E** | El Administrador de una Cuenta (`team.manage`) puede **crear usuarios** que quedan solo en su Cuenta. | Sí (continúa la D6 de la v1). |
| **D-F** | El catálogo de la sección 4: 47 permisos de Cuenta y 10 de organización, con las separaciones de H5 y el permiso nuevo de Facturas. | Aprobarlo como catálogo inicial. Se amplía con cada módulo nuevo. |
| **D-G** | Las listas de **Sector** y **Categoría** de la sección 8. | Aprobarlas como listas iniciales. Se editan por migración. |
| **D-H** | El orden de las fases (A → G). | A primero (visible y sin riesgo), luego B (catálogo) y C (organizaciones y roles). |

---

## 19. Nombres de rol, SUPER_ADMIN y ADMIN (2026-09-25)

Pedido del dueño del producto; migración `20260925180000_dk_role_names_super_admin`.

| Tema | Decisión |
|---|---|
| Nombres | Todos los roles en MAYÚSCULAS y con `_` en vez de espacios (`dk_normalize_role_name`; CHECK `dk_roles_name_format`). Plantillas: **ADMIN**, GERENTE, CAJA, COCINA, INVENTARIO, DOMICILIARIO. Los roles propios se normalizan al guardar ("Encargado de turno" → `ENCARGADO_DE_TURNO`). `SUPER_ADMIN` y `ADMIN` son nombres reservados. |
| SUPER_ADMIN | Es solo el **creador de la organización** (`owner_user_id`), con acceso global a todas sus Cuentas. **Intransferible** (`owner_user_id` inmutable) y **no asignable**: el trigger rechaza `is_super_admin` para cualquier otro miembro, incluso con escritura directa. No se desactiva ni se quita. |
| Transferencia | Se eliminan `dk_transfer_ownership` y el permiso `organization.transfer`. Catálogo: **56** permisos (47 de Cuenta, 9 de organización). |
| ADMIN | Rol de **Cuenta**, asignable a usuarios. Tiene todos los permisos de Cuenta; un trigger le agrega cada permiso de Cuenta nuevo del catálogo. |
| RPC | `dk_create_user(org, nombre, correo, cuentas)` ya no recibe "Super Admin" y exige al menos una Cuenta. `dk_set_org_member(org, usuario, activo)` solo activa o desactiva. |
| Administrador de la plataforma | Sin cambios: acceso de soporte a todas las Cuentas (`platform_role`). Es distinto de SUPER_ADMIN, que es de una organización. |

Pruebas: suites SQL actualizadas (236/236), incluida la escritura directa como dueño de la base, que el trigger bloquea.

