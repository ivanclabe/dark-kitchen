# ADR 0007 — Plataforma Multi-Cocina (multi-tenant)

## Estado
> **Continúa en la [ADR 0008 — Organizaciones, Cuentas y RBAC](./0008-organizaciones-y-cuentas.md).** Desde ahí la "Cocina" se llama **Cuenta**, hay Organizaciones por encima, el rol es por Cuenta con **varios roles y rol activo**, los permisos son un catálogo central (`orders.confirm`…) y las invitaciones se reemplazaron por "crear usuario" con enlace de activación.

**Aprobado con cambios e implementado (2026-09-24).** Fases 0–6 aplicadas en el proyecto propio `dark-kitchen` (`cqfzcwpqisaohcjaevxf`).

| Fase | Estado |
|---|---|
| 0. Seguridad | ✅ Aplicada (`20260924165639_dk_phase0_security`) |
| Proyecto Supabase propio | ✅ Esquema, datos (36 tablas verificadas), función de IA y usuario migrados |
| 1. Modelo | ✅ Aplicada (`20260924180000_dk_multikitchen_model`): `dk_kitchens`, `platform_role`, roles de sistema, 38 permisos, membresías, `dk_my_kitchens()`, `dk_create_kitchen()`. Cocina inicial `dark-kitchen-1` |
| 2. Datos (`kitchen_id`) | ✅ Aplicada (`20260924190000_dk_multikitchen_data`): `kitchen_id` en 33 tablas, herencia en 17 tablas hijas, 31 FKs "misma Cocina", unicidades y configuración por Cocina, numeración de pedidos por Cocina. `dk_create_kitchen()` ya no agrega al superusuario como miembro |
| 3. Aislamiento (RLS por Cocina) | ✅ Aplicada (`20260924200000_dk_multikitchen_isolation`, `…201000_function_grants`): Cocina activa por encabezado `x-dk-kitchen-id` (sin encabezado: la única Cocina del usuario — modo retirado en la Fase 6), RLS de 33 tablas por Cocina + permiso, 16 RPC con permiso y verificación de Cocina, vistas y "hoy" por zona horaria de la Cocina, Storage bajo `kitchens/{id}/`. Suite `supabase/tests/multikitchen_isolation.sql`: 69/69. **Aún no crear una segunda Cocina en producción hasta la Fase 4** (la app todavía no envía la Cocina activa) |
| 4. App | ✅ Rutas `/k/{slug}/…` (las viejas redirigen), `/` entra a la última Cocina usada o a la única, selector "Tus cocinas" (`/cocinas`, con "Nueva cocina" para el superusuario), Cocina activa y cambio de Cocina en el sidebar, encabezado `x-dk-kitchen-id` en toda petición, caché separada por Cocina, permisos del rol en la Cocina (reemplazan la matriz fija), Configuración → General (nombre, slug, datos, zona horaria) |
| 5. Administración | ✅ (`20260924210000_dk_multikitchen_admin`) Equipo por Cocina (miembros con correo, rol, activar/quitar; nunca sin administrador), invitaciones por enlace (token cifrado, 7 días, solo para el correo invitado; reemplaza el autorregistro), roles propios con matriz de permisos, panel de plataforma del superusuario (`/admin`: todas las Cocinas, activar/desactivar en grupo). Suite `supabase/tests/multikitchen_admin.sql`: 26/26. Menús maestros (`20260924220000_dk_master_menus`, sección 15): suite `supabase/tests/master_menus.sql` 17/17 |
| 6. Integraciones y cierre | ✅ (`20260924230000_dk_multikitchen_closure`, `…231000_dk_master_sync_search_path`) Rol global retirado: `dk_users.role` queda como histórico (nullable, sin uso) y se eliminó `dk_current_role()`; la instalación vacía arranca con un **superusuario** (no un ADMIN global). **Fin del modo compatibilidad**: sin `x-dk-kitchen-id` no hay Cocina activa. n8n por Cocina: cuenta de servicio invitada con rol Caja + encabezado `x-dk-kitchen-id` (ID visible en Configuración → General → Integraciones; guía en `docs/integrations/n8n-whatsapp-integration.md`). La configuración real de n8n queda para después, a pedido. Manual de usuario actualizado. Suites: aislamiento 72/72, administración 27/27, menús maestros 17/17 |

### Decisiones tomadas (2026-09-24)
1. **Fase 0 aplicada** (`20260924170000_dk_phase0_security.sql`). Durante su preparación apareció un cuarto problema, más grave que los de la sección 2: cualquier usuario autenticado podía **insertarse como ADMIN** (la política de arranque consultaba `dk_users` con la RLS del propio usuario, que no ve filas). Corregido y verificado.
2. **Cocina inicial**: slug `dark-kitchen-1`, nombre "Dark Kitchen 1". Se podrán cambiar en **Configuración → General** de la Cocina.
3. **Solo el superusuario crea Cocinas.** No hay rol OWNER: `platform_role` tiene un único valor, `SUPERADMIN`.
4. **Roles sin cambios** (no se agrega Despacho ni se renombra Gerente). El **superusuario administra todas las Cocinas**, una por una o en grupo (acciones masivas). Esto reemplaza la regla de la sección 9 "el superadmin debe agregarse como miembro": el superusuario puede entrar a cualquier Cocina sin membresía; cada acción suya queda en auditoría con su identidad.
5. **Menús compartidos**: el superusuario crea menús y decide con qué Cocinas compartirlos. Requiere un nivel de catálogo **de plataforma** por encima de las Cocinas (ver sección 15, diseño pendiente).
6. **Proyecto Supabase propio**: aprobado. La base ya se exportó (`supabase/applied/`, 30 migraciones exactas tal como están aplicadas) y es reproducible en un proyecto limpio.

## Estado original
**Propuesto — pendiente de revisión.**

Terminología: en este documento **Cocina** (con mayúscula) = la cuenta/establecimiento (tenant). El módulo operativo se llama **"módulo Cocina"** o **operación**.

---

## 0. Resumen

| Decisión | Propuesta |
|---|---|
| Modelo de tenant | Una tabla `dk_kitchens`; **toda** tabla de negocio lleva `kitchen_id` (también las tablas hijas), con FKs compuestas que impiden mezclar Cocinas |
| Aislamiento | RLS en Postgres: cada fila visible solo si `kitchen_id` = **Cocina activa** de la petición **y** el usuario es miembro activo con permiso. Sin Cocina activa válida → cero filas (falla cerrado) |
| Cocina activa | Encabezado `x-dk-kitchen-id` en cada petición, validado en SQL contra la membresía. Nunca amplía acceso, solo lo acota |
| Autenticación | **Un solo login** (Supabase Auth, el actual). La Cocina se resuelve después del login, no antes |
| URL | Ruta con slug: `/k/hamburgueseria-centro/kitchen`. Sin subdominios (por ahora) |
| Identificador | UUID interno (FK, RLS) + slug público legible (URL). El slug nunca autoriza |
| Roles | RBAC por Cocina: `dk_roles` + `dk_role_permissions (módulo × acción)`, con roles de sistema sembrados que replican exactamente la matriz actual |
| Usuarios | `dk_users` pasa a ser la **persona** (global). La pertenencia y el rol viven en `dk_kitchen_members` (N:M) |
| Migración | Cocina inicial "por defecto", backfill de `kitchen_id` en todos los datos actuales; cero pérdida, cero cambio de comportamiento hasta la fase de UI |
| Antes de todo | **Fase 0: corregir 3 problemas de seguridad que existen hoy** (sección 2) |

---

## 1. Auditoría

### 1.1 Arquitectura y autenticación
- React 19 + Vite + TanStack Query + Supabase (Auth email/contraseña, PostgREST, RPC, Storage, Edge Functions). Sin Realtime.
- **El proyecto Supabase es compartido con otras 5 aplicaciones** (tablas `sjap_*`, `sc_*`, `ipler_*`, `in_*`, viajes/conductores…). `auth.users` es común: hoy hay 5 usuarios de Auth y **4 no son de Dark Kitchen**.
- Perfil: `dk_users` (1:1 con `auth.users`) con un **rol único global** (`dk_role`: ADMIN, MANAGER, KITCHEN, INVENTORY, CASHIER, DELIVERY). `dk_current_role()` (SECURITY DEFINER) lo lee para RLS y RPC.
- Registro: `/signup-admin` (solo si no hay usuarios) y `/signup-staff` (crea un perfil **CASHIER activo** automáticamente).
- Frontend: `useAuth` carga el perfil; `shared/rbac/roles.ts` (`MODULE_ACCESS`) y `kitchen/lib/permissions.ts` son espejos de UX de los permisos SQL.

### 1.2 Datos existentes
1 usuario Dark Kitchen (ADMIN), 17 pedidos, 5 clientes, 1 plato, ~175 filas de auditoría. Volumen mínimo: la migración es de bajo riesgo operativo.

### 1.3 Tablas y clasificación (36 tablas `dk_*`)

| Clase | Tablas | Qué necesita |
|---|---|---|
| **Global** (no pertenece a una Cocina) | `dk_users` (persona), `dk_units` (catálogo de unidades g/ml/und) | Nada, o solo ajustar políticas |
| **Global con contexto** | `dk_audit_log` | `kitchen_id` nullable (eventos de plataforma sin Cocina) |
| **Configuración por Cocina** | `dk_kitchen_sla_settings` (hoy fila única id=1), `dk_kitchen_hours` (PK = día), `dk_kitchen_hour_exceptions` (PK = fecha), `dk_ai_features` (PK = función), `dk_ai_insights` | `kitchen_id` + **cambiar la PK** a `(kitchen_id, …)` |
| **Catálogo** | `dk_product_categories`, `dk_products`, `dk_recipes`, `dk_recipe_items`, `dk_menu_plan_items`, `dk_ingredient_categories`, `dk_ingredients`, `dk_ingredient_stock`, `dk_ingredient_purchase_units`, `dk_suppliers`, `dk_supplier_ingredients` | `kitchen_id` + uniques por Cocina |
| **Operación** | `dk_customers`, `dk_orders`, `dk_order_items`, `dk_order_status_history`, `dk_kitchen_tickets`, `dk_inventory_reservations`, `dk_inventory_movements`, `dk_delivery_riders`, `dk_deliveries`, `dk_order_payments`, `dk_purchases`, `dk_purchase_items`, `dk_attachments` | `kitchen_id` |
| **Deprecadas** | `dk_menus`, `dk_menu_items`, `dk_daily_availability`, `dk_weekly_menu_items` | `kitchen_id` + backfill (conservan datos) y acceso solo lectura; sin UI |

**Unicidades globales que chocarían entre Cocinas** (deben pasar a `(kitchen_id, …)`): `dk_customers.phone`, `dk_customers.whatsapp_id`, `dk_products.code`, `dk_ingredients.code`, `dk_product_categories.name`, `dk_ingredient_categories.name`, `dk_menus.name`, `dk_menu_plan_items (plan_date, product_id)`, `dk_delivery_riders.user_id`.

**Numeración de pedidos**: `order_number` es `smallint` con una secuencia **global** (`dk_order_number_seq`). Con varias Cocinas los números se intercalarían entre sucursales y el tope es 32.767. La voz depende de números de 4 dígitos.

### 1.4 RLS, RPC, vistas, storage
- Todas las tablas `dk_*` tienen RLS; las políticas solo miran el **rol**, nunca a qué establecimiento pertenece la fila.
- 17 funciones SECURITY DEFINER (confirmar/cancelar pedido, cocina, despacho, pagos, mermas, recetas, menú…): **saltan RLS**, así que cada una deberá validar la Cocina explícitamente.
- Vistas: `dk_supply_suggestions` y `dk_receivables` (security_invoker: heredarán el aislamiento), `dk_today_menu` (**SECURITY DEFINER**, la usa n8n).
- Reportes y señales (`dk_report_*`, `dk_dashboard_summary`, `dk_inventory_signals`, `dk_kitchen_signals`): son invoker → heredan RLS.
- Storage: bucket privado `dk-attachments` (facturas e imágenes de platos) con políticas por rol, sin prefijo de Cocina en la ruta.
- Integraciones: n8n (WhatsApp) entra como usuario CASHIER y lee `dk_today_menu` + RPC `dk_create_conversational_order`. Edge Function `dk-ai-insights` usa la sesión del usuario.

### 1.5 Frontend
- Rutas planas (`/kitchen`, `/supply/...`, `/customers/...`); ninguna sabe de establecimientos.
- Claves de TanStack Query sin Cocina (`['kitchen-queue']`, `['ingredients']`…): al cambiar de Cocina, la caché mostraría datos de la anterior.
- Los servicios (`modules/*/api`) usan un único cliente Supabase compartido → buen punto único para inyectar la Cocina activa.

---

## 2. Riesgos que existen HOY (antes de multi-cocina)

Verificados con pruebas en transacciones revertidas.

1. **CRÍTICO — Las RPC autorizan a quien no tiene perfil.** 15 funciones hacen `IF dk_current_role() NOT IN (...) THEN raise`. Para un usuario autenticado sin fila en `dk_users`, `dk_current_role()` es `NULL`, `NULL NOT IN (...)` es `NULL` y el `IF` no se dispara. **Probado: un usuario sin perfil cambió la prioridad de un pedido real** (revertido). Como el Auth es compartido, cualquier usuario de las otras 4 apps (o cualquiera que se registre) puede confirmar/cancelar pedidos, registrar pagos, mermas o ajustes. Ya estaba anotado en `docs/integrations/n8n-whatsapp-integration.md` como pendiente.
2. **CRÍTICO — Registro abierto con acceso a datos personales.** `/signup-staff` y la política de `dk_users` permiten que cualquiera se autoregistre como **CASHIER activo**, y CASHIER lee clientes (teléfonos, direcciones), pedidos y pagos.
3. **ALTO — Lecturas con `USING (true)`.** `dk_products`, `dk_menu_plan_items`, `dk_delivery_riders` (nombres y **teléfonos**), categorías, unidades y menús deprecados son legibles por **cualquier** usuario autenticado del proyecto, incluidos los de otras apps.
4. **MEDIO — "Hoy" en UTC.** La base corre en UTC y `dk_today_menu` / la política de cocina usan `CURRENT_DATE`: desde las 7 p. m. hora Colombia, "el menú de hoy" es el de mañana. Con Cocinas en distintas ciudades se necesita zona horaria por Cocina.
5. **Estratégico — Proyecto Supabase compartido.** Un SaaS multi-tenant conviviendo con apps de otros clientes comparte Auth, cuotas, secretos de Edge Functions y ventana de fallos. Recomendación: migrar Dark Kitchen a un **proyecto Supabase propio** antes de abrirlo a más establecimientos (no bloquea este diseño, pero lo hace más simple y seguro).

**Propuesta:** Fase 0 corrige 1–3 de inmediato (cambios pequeños, sin tocar la UI), independientemente de si se aprueba el resto.

---

## 3. Arquitectura propuesta

```
Persona (auth.users 1:1 dk_users)
   │  N:M  (dk_kitchen_members: rol, activo)
   ▼
Cocina (dk_kitchens)  ← tenant
   │ 1:N
   ├── Catálogo:   productos, recetas, menú, insumos, proveedores…
   ├── Operación:  clientes, pedidos, despacho, pagos, compras…
   ├── Config:     horario, SLA, IA…
   └── RBAC:       roles propios + permisos (módulo × acción)
```

- **Una base, un esquema, columna `kitchen_id`** (shared-schema multi-tenancy). Es lo que mejor escala para cientos de Cocinas sin duplicar tablas ni esquemas, y es lo que Supabase RLS resuelve bien.
- Toda la aplicación actual se reutiliza: las páginas no cambian, solo reciben su contexto de la ruta `/k/:slug/…` y de un `KitchenProvider`.
- La Cocina activa viaja en cada petición (encabezado) y **la base la valida**; el frontend no filtra "por seguridad", solo por UX.

---

## 4. Modelo de datos propuesto

```sql
-- Tenant
dk_kitchens (
  id uuid pk,
  slug text unique not null,            -- público, para URL: 'hamburgueseria-centro'
  name text not null,
  legal_name text, tax_id text, phone text, address text, logo_path text,
  timezone text not null default 'America/Bogota',
  currency text not null default 'COP',
  active boolean not null default true,
  created_by uuid references dk_users(id), created_at, updated_at
)

-- Persona global (existente). Se agrega capacidad de plataforma:
dk_users + platform_role text null check (platform_role in ('OWNER','SUPERADMIN'))
--   OWNER      = puede crear Cocinas (queda como Administrador de cada una)
--   SUPERADMIN = operador de la plataforma (soporte); ver sección 9
--   dk_users.role queda deprecado tras la migración (se conserva, no se usa)

-- Pertenencia
dk_kitchen_members (
  kitchen_id uuid references dk_kitchens,
  user_id uuid references dk_users,
  role_id uuid references dk_roles,
  active boolean default true,
  invited_by uuid, created_at,
  primary key (kitchen_id, user_id)
)

-- RBAC
dk_roles (
  id uuid pk,
  kitchen_id uuid null references dk_kitchens,   -- null = plantilla de sistema
  key text, name text, description text,
  is_system boolean,                              -- los de sistema no se borran
  unique (kitchen_id, key)
)
dk_permissions (module text, action text, label text, primary key (module, action))   -- catálogo
dk_role_permissions (role_id uuid, module text, action text, primary key (role_id, module, action))

-- Invitaciones (reemplazan el registro abierto)
dk_kitchen_invitations (
  id uuid pk, kitchen_id, email citext, role_id,
  token_hash text, expires_at, accepted_at, invited_by, created_at
)

-- Numeración por Cocina
dk_kitchen_counters (kitchen_id, name text, last_value bigint, primary key (kitchen_id, name))
```

**En todas las tablas de negocio** (30 tablas, sección 1.3):
- `kitchen_id uuid not null default dk_active_kitchen_id() references dk_kitchens`.
- Índice por `kitchen_id` (o compuesto con la columna de filtrado habitual).
- **FKs compuestas**: `unique (kitchen_id, id)` en el padre y `foreign key (kitchen_id, order_id) references dk_orders (kitchen_id, id)` en el hijo. Así la base **garantiza** que un ítem de la Cocina A nunca apunte a un pedido, insumo o proveedor de la Cocina B, aunque una RPC tenga un error.
- Uniques globales → por Cocina (lista en 1.3). `order_number` → `integer`, `unique (kitchen_id, order_number)`, generado con `dk_kitchen_counters`.

**Catálogo de módulos × acciones** (alineado con lo que pediste y con los módulos existentes):

| Módulo (clave) | Hoy en la app |
|---|---|
| `dashboard` | Dashboard |
| `operation` (módulo Cocina) | Cocina → tablero |
| `orders` | Cocina → pedidos |
| `dispatch` | Cocina → despacho / domiciliarios |
| `customers` | Clientes |
| `receivables` | Clientes → cartera y pagos |
| `menu_planner` | Catálogo → planificador |
| `products` | Catálogo → platos |
| `recipes` | Catálogo → recetas |
| `inventory` | Abastecimiento → stock, mermas, ajustes |
| `suppliers` | Abastecimiento → proveedores |
| `purchases` | Abastecimiento → compras y facturas de compra |
| `reports` | Reportes |
| `ai` | Configuración → IA |
| `settings` | Configuración de la Cocina (datos, horario, SLA) |
| `members` | Usuarios, roles y permisos de la Cocina |

Acciones: `view`, `create`, `edit`, `delete`, `manage`. La primera versión de la UI usa `view` para mostrar módulos y las acciones que ya existen (confirmar, despachar, cancelar…) se mapean a `create/edit/manage`; la granularidad completa queda lista en datos sin cambiar el esquema.

> Nota: no existe hoy un módulo de **facturación de ventas**; "Facturas" en la app son facturas de **compra**. El catálogo admite agregar `invoices` después.

---

## 5. Usuarios, Cocinas, roles y permisos

```
dk_users (persona) ──< dk_kitchen_members >── dk_kitchens
                              │
                              └── dk_roles ──< dk_role_permissions (módulo, acción)
```

- Una persona puede ser miembro de **varias Cocinas con roles distintos** (Juan: Administrador en Centro y Norte; María: Cocina en Centro).
- **Roles de sistema** sembrados en cada Cocina nueva, con los permisos que hoy tiene cada rol (la migración no cambia lo que nadie puede hacer):

| Rol de sistema | Hoy | Nota |
|---|---|---|
| Administrador | ADMIN | Todos los módulos, incluido `members` |
| Encargado | MANAGER | Todo menos `members` (hoy: todo menos Usuarios) |
| Cajero | CASHIER | Pedidos, despacho, clientes, cartera, reportes de ventas |
| Cocina | KITCHEN | Operación, catálogo (lectura), menú del día |
| Inventario | INVENTORY | Abastecimiento, recetas, reportes de inventario |
| Domiciliario | DELIVERY | Sus pedidos asignados, marcar entregado |
| *Despacho* (nuevo, opcional) | — | Pedidos listos + despacho, sin clientes ni caja. Lo mencionaste; hoy despacha Caja |

- El Administrador de una Cocina puede crear **roles propios** copiando uno de sistema y marcando/desmarcando permisos en una matriz.

---

## 6. Aislamiento con RLS

**Funciones base** (SECURITY DEFINER, `STABLE`, `search_path` fijo):

```sql
-- Cocina de la petición, SOLO si el usuario es miembro activo y la Cocina está activa. Si no → NULL.
dk_active_kitchen_id() returns uuid
  -- lee current_setting('request.headers')::json ->> 'x-dk-kitchen-id'
  -- y valida contra dk_kitchen_members + dk_kitchens.active

dk_can(p_module text, p_action text) returns boolean      -- permiso en la Cocina activa
dk_require(p_module text, p_action text) returns void     -- raise si no (para RPC; falla cerrado ante NULL)
```

**Patrón de política** (una por acción y tabla, generadas de forma uniforme):

```sql
create policy orders_select on dk_orders for select to authenticated
  using (kitchen_id = (select dk_active_kitchen_id()) and (select dk_can('orders','view')));

create policy orders_insert on dk_orders for insert to authenticated
  with check (kitchen_id = (select dk_active_kitchen_id()) and (select dk_can('orders','create')));
```

Propiedades:
- **Falla cerrado**: sin encabezado, con un id ajeno, con membresía inactiva o Cocina desactivada → `dk_active_kitchen_id()` es `NULL` → cero filas, cero escrituras.
- El encabezado lo controla el cliente, pero **solo puede acotar**: elegir una Cocina de la que no eres miembro no da acceso a nada.
- Un miembro de A y B que trabaja en A **no ve B ni por error**: la base filtra por la Cocina activa, no por "todas mis Cocinas". Esto protege contra un `.eq()` olvidado en el frontend.
- `(select …)` hace que Postgres evalúe la función una vez por consulta (initplan), no por fila; con índices por `kitchen_id` el costo es despreciable.
- Los casos especiales se conservan dentro del patrón (p. ej. el Domiciliario solo ve pedidos asignados a él: `… and (dk_can('dispatch','view') or asignado_a_mí)`).
- **RPC SECURITY DEFINER** (17): cada una reemplaza `IF dk_current_role() NOT IN` por `perform dk_require(...)` y filtra toda lectura/escritura por `kitchen_id = dk_active_kitchen_id()`. Las FKs compuestas son la segunda barrera.
- **Vistas**: `dk_today_menu` pasa a `security_invoker` (como las demás).
- **Storage**: rutas `kitchens/{kitchen_id}/…`; la política valida `(storage.foldername(name))[2]::uuid = dk_active_kitchen_id()` y el permiso del módulo.
- **Edge Functions**: reenvían el encabezado; `dk-ai-insights` guarda y reutiliza análisis por Cocina.
- **Pruebas de aislamiento automatizadas** (SQL en transacción revertida, como las de esta auditoría): miembro de A con encabezado de B → 0 filas en cada tabla; insertar con `kitchen_id` de B → rechazado; sin encabezado → 0 filas; usuario sin perfil → toda RPC rechazada. Se corren en cada migración.

*Alternativa descartada*: poner la Cocina activa como *claim* del JWT con un "Custom Access Token Hook". Es elegante, pero el hook es **global al proyecto Supabase**: afectaría el login de las otras 5 apps. Si Dark Kitchen se muda a su propio proyecto, se puede reconsiderar sin cambiar las políticas (solo `dk_active_kitchen_id()`).

---

## 7. Migración de los datos actuales

Incremental, cada paso reversible y sin cambio visible hasta la fase de UI:

1. Crear `dk_kitchens`, miembros, roles, permisos (vacíos; no afectan nada).
2. Insertar la **Cocina inicial** (nombre y slug a definir; ej. "Dark Kitchen" / `principal`) y sembrar sus roles de sistema.
3. Crear una membresía por cada `dk_users` existente con el rol equivalente (ADMIN → Administrador…); el usuario ADMIN actual queda además como `OWNER`.
4. Agregar `kitchen_id` **nullable** a las 30 tablas; backfill = Cocina inicial; luego `NOT NULL` + default + índices + FKs compuestas + uniques por Cocina. Los números de pedido actuales se conservan y el contador de la Cocina inicial arranca en el máximo existente.
5. Mover los singletons/PK naturales (`sla_settings`, `kitchen_hours`, `hour_exceptions`, `ai_features`) a PK compuesta, conservando sus filas.
6. **Período de compatibilidad**: mientras el frontend no envíe encabezado, `dk_active_kitchen_id()` usa la Cocina por defecto del usuario *si solo tiene una* (feature flag en SQL). Así la app actual sigue funcionando entre la fase de datos y la de UI. Se elimina al terminar la Fase 4.
7. Reescribir políticas y RPC (sección 6) y retirar `dk_current_role()` de las políticas.
8. Storage: copiar objetos a `kitchens/{id}/…` y actualizar las rutas guardadas (hoy 0 adjuntos).

Nada se borra: `dk_users.role` y las tablas deprecadas se conservan.

---

## 8. Login y acceso

**Recomendación: un único sistema de autenticación** (el actual) + resolución de la Cocina **después** del login.

| Alternativa | Veredicto |
|---|---|
| Dos logins (admin / trabajador) | ✗ Duplica flujos, contraseñas y soporte; una persona que es trabajador en una Cocina y dueño de otra no encaja |
| **Selector de Cocina después del login** | ✓ **Base de la propuesta** |
| **Login único con resolución automática** | ✓ Si la persona tiene una sola Cocina, entra directo (la mayoría de trabajadores nunca ve el selector) |
| **URL con slug** (`/k/hamburgueseria-centro/…`) | ✓ Enlaces compartibles, varias pestañas con Cocinas distintas, siempre claro dónde estás |
| Enlace de acceso por Cocina (`/k/:slug` o `/login?cocina=slug`) | ✓ Conveniencia para trabajadores: muestra nombre/logo de la Cocina y entra directo a ella. **No autoriza nada** |
| Código corto de establecimiento para "unirse" | △ Útil para soporte; como mecanismo de acceso es débil. Solo combinado con aprobación del administrador |
| Subdominio (`centro.darkkitchen.app`) | ✗ por ahora: la sesión de Supabase vive por origen (un login por subdominio), requiere DNS/certificados comodín y más infraestructura. Se puede agregar después sobre el mismo modelo |

**Escenario A — dueño/administrador con varias Cocinas**
Login → **"Tus cocinas"** (tarjetas con nombre, rol, estado; "Crear cocina") → entra a una → `/k/centro/…`. Queda recordada la última usada; la próxima vez entra directo a ella con el cambio a un clic.

**Escenario B — trabajador de una Cocina**
Recibe una **invitación por correo** (o un enlace `/k/centro` del administrador) → crea contraseña / inicia sesión → entra directo a su Cocina, sin selector. Mismo login, misma URL base.

**Sin Cocinas**: si es `OWNER`, pantalla "Crea tu primera cocina"; si no, "Aún no perteneces a ninguna cocina — pide una invitación a tu administrador". Reemplaza el registro abierto actual.

---

## 9. Administradores globales vs. usuarios de una Cocina

| Tipo | Cómo se modela | Qué puede hacer |
|---|---|---|
| **Dueño** (Juan) | `dk_users.platform_role = 'OWNER'` + Administrador en cada Cocina que crea | Crear Cocinas, entrar y cambiar entre las suyas, administrarlas (datos, usuarios, roles) |
| **Administrador de Cocina** | Miembro con rol Administrador | Gestionar usuarios y roles **de esa Cocina** únicamente |
| **Trabajador** | Miembro con rol Cajero/Cocina/… | Lo que su rol permita, solo en su(s) Cocina(s) |
| **Superadmin de plataforma** (operador/soporte) | `platform_role = 'SUPERADMIN'` | Ver la lista de Cocinas, crearlas, activarlas/desactivarlas. **Para ver datos de una Cocina debe agregarse como miembro** (queda en auditoría). Nunca un bypass silencioso de RLS |

---

## 10. Selección y cambio de Cocina

- **Indicador permanente**: arriba del sidebar, en lugar del logo, el avatar/iniciales de la Cocina activa; con tooltip "Hamburguesería Centro". En móvil, en la barra superior.
- **Cambiar**: clic en el avatar → menú con las Cocinas (búsqueda si son muchas) + "Administrar cocinas". Cambiar navega a `/k/{slug}/<misma sección>` sin cerrar sesión.
- **Al cambiar**: se reinicia la caché de datos (`queryClient.clear()` + remontaje del árbol con `key=kitchenId`), el cliente Supabase empieza a enviar el nuevo encabezado y el título de la pestaña muestra la Cocina. No puede quedar en pantalla nada de la Cocina anterior.
- **Pestañas**: cada pestaña respeta la Cocina de su URL; puedes tener Centro y Norte abiertas a la vez.
- Rutas antiguas (`/kitchen`, `/supply`, `/customers/:id`…) redirigen a la última Cocina usada.

---

## 11. Identificador de Cocina

| | Uso | Por qué |
|---|---|---|
| **UUID** | PK, FKs, RLS, encabezado | Inmutable, no adivinable, no filtra información |
| **Slug** (`hamburgueseria-centro`) | URL y enlaces de acceso | Legible y compartible. Único; editable por el administrador (el anterior queda como redirección) |
| Código corto (`HC-4821`) | Opcional, soporte telefónico / impresos | No se usa para autorizar |

El slug y el código se resuelven a UUID **solo entre las Cocinas del usuario** (`dk_my_kitchens()`). La única consulta pública posible sería `nombre + logo` de una Cocina activa para personalizar el enlace de acceso (a decidir).

---

## 12. Administración de Cocinas

- **/cocinas** — "Tus cocinas": crear, entrar, ver estado.
- **Crear Cocina** (OWNER): nombre, slug (sugerido), zona horaria, moneda → una RPC `dk_create_kitchen()` que en una transacción crea la Cocina, siembra roles de sistema, configuración por defecto (SLA, IA desactivada, horario sin configurar) y hace al creador Administrador. Opción "copiar catálogo desde otra de mis Cocinas" (platos, recetas, insumos, proveedores) para cadenas con el mismo menú.
- **/k/:slug/settings/general** — datos de la Cocina, logo, zona horaria, activar/desactivar.
- **/k/:slug/users** (evoluciona el módulo Usuarios actual) — miembros, invitaciones, roles y **matriz de permisos** (módulo × acción) con checkboxes.
- **Desactivar** una Cocina: sus miembros dejan de poder operarla (RLS falla cerrado); el dueño la sigue viendo en "Tus cocinas" para reactivarla.

---

## 13. Plan de implementación incremental

| Fase | Contenido | Visible para el usuario | Criterio de salida |
|---|---|---|---|
| **0. Seguridad** | `dk_require()` que falla cerrado en las 15 RPC; cerrar el autoregistro (queda "pendiente de aprobación", sin rol); quitar `USING (true)` (solo miembros Dark Kitchen) | No | Pruebas: usuario sin perfil no ejecuta ninguna RPC ni lee ninguna tabla |
| **1. Modelo** | `dk_kitchens`, miembros, roles, permisos, invitaciones, contadores; Cocina inicial + membresías | No | Todos los usuarios actuales tienen membresía con permisos equivalentes |
| **2. Datos** | `kitchen_id` + backfill + FKs compuestas + uniques por Cocina + PKs compuestas + numeración por Cocina; modo compatibilidad | No | 0 filas sin `kitchen_id`; app actual funcionando igual |
| **3. Aislamiento** | `dk_active_kitchen_id()/dk_can()`; reescritura de políticas, RPC, vistas, storage; Edge Function; suite de pruebas de aislamiento | No | Suite de aislamiento en verde para las 30 tablas y 17 RPC |
| **4. App** | `KitchenProvider`, rutas `/k/:slug`, encabezado en el cliente, caché por Cocina, permisos desde la base (reemplaza `MODULE_ACCESS`), selector y cambio de Cocina, indicador en el sidebar | Sí | Cambiar de Cocina sin cerrar sesión, sin datos cruzados |
| **5. Administración** | Crear/editar/desactivar Cocinas, miembros, invitaciones, roles y matriz de permisos, copiar catálogo | Sí | Un dueño crea "Norte", invita a un cajero y este solo ve Norte |
| **6. Integraciones y cierre** | n8n: una cuenta de servicio y credencial por Cocina (+ número de WhatsApp por Cocina); zona horaria por Cocina en "hoy"; retirar modo compatibilidad y `dk_users.role`; actualizar manual | Parcial | Pedido por WhatsApp entra a la Cocina correcta |

Cada fase es un conjunto de migraciones pequeñas con su prueba; se puede pausar entre fases sin dejar la app rota.

---

## 14. Decisiones abiertas (para discutir)

1. **Fase 0 ya**: ¿apruebas corregir los 3 riesgos de seguridad de inmediato, aparte del resto?
2. **Cocina inicial**: nombre y slug para los datos actuales.
3. **Quién crea Cocinas**: solo cuentas `OWNER` que tú habilites, o registro público de dueños (SaaS autoservicio).
4. **Roles de sistema**: ¿agregamos "Despacho" separado de Caja? ¿"Encargado" reemplaza el nombre "Gerente"?
5. **Catálogo compartido entre sucursales**: la propuesta aísla cada Cocina y ofrece "copiar catálogo". Si una cadena necesita un **menú único sincronizado** entre sucursales, haría falta un nivel superior ("Marca/Organización") — el modelo lo admite después sin romper nada, pero conviene saberlo ahora.
6. **Superadmin**: ¿debe existir, y con la regla "entra como miembro, auditado"?
7. **Proyecto Supabase dedicado** para Dark Kitchen: ¿antes o después de multi-cocina?
8. **Alta de trabajadores**: solo invitación por correo, o también "el administrador crea la cuenta y entrega la contraseña" (requiere una Edge Function con clave de servicio).

---

## 15. Menús compartidos por el superusuario (implementado 2026-09-24)

Decisión 5 exige que un menú creado por el superusuario pueda asignarse a varias Cocinas. Restricción clave: el **inventario, los costos y los pedidos son de cada Cocina**, y una receta consume insumos de un inventario concreto. Por eso la propuesta es **menú maestro + copias sincronizadas**, no filas compartidas:

- `dk_master_menus` / `dk_master_products` / `dk_master_recipes` (nivel plataforma, sin `kitchen_id`), editables solo por el superusuario.
- `dk_master_menu_assignments (master_menu_id, kitchen_id)`: con qué Cocinas se comparte.
- Al asignar o publicar cambios, una RPC crea/actualiza en cada Cocina sus `dk_products` y recetas con `master_product_id` (origen); los insumos se vinculan por **código** con el inventario local (y se crean si faltan).
- En la Cocina, los platos que vienen de un menú maestro se marcan "Maestro".
- **Decidido**: el menú incluye platos **con receta**; la Cocina ajusta **precio** (queda "precio propio", con opción de volver al del maestro) y **disponibilidad** (su planificador); los cambios del maestro **se aplican solos**. Al dejar de compartir o quitar un plato, las copias quedan como platos locales desactivados. La imagen del plato no viaja con el maestro (cada Cocina sube la suya).

Así cada Cocina sigue aislada (RLS intacta), los pedidos y el inventario no cambian, y el superusuario mantiene un único menú de origen.
