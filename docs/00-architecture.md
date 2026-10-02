# QUANELA — Arquitectura Base (Fase 0)

Estado: **propuesta, pendiente de aprobación**. No se ha escrito código de aplicación todavía.

Prefijo de base de datos propuesto: **`dk_`** (de Dark Kitchen, el nombre original de la app; el prefijo se conserva). Se usa en todo este documento. Si prefieres otro prefijo, es un cambio mecánico (find/replace) antes de generar las migraciones.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENTES DE LA APP                                          │
│  React SPA (staff: cocina, caja, inventario, admin)          │
└───────────────────────────┬────────────────────────────────┘
                             │ HTTPS
┌───────────────────────────▼────────────────────────────────┐
│  FRONTEND (React + TS + Vite + Tailwind)                     │
│  ┌───────────────┐   ┌────────────────┐   ┌───────────────┐ │
│  │ UI Components  │→→│ Application/    │→→│ Domain Services│ │
│  │ (pages/forms)  │   │ Hooks (React)   │   │ (business     │ │
│  │                │   │                 │   │ logic, puro TS)│ │
│  └───────────────┘   └────────────────┘   └───────┬───────┘ │
└──────────────────────────────────────────────────┼──────────┘
                                                      │
┌─────────────────────────────────────────────────────▼───────┐
│  DATA ACCESS LAYER (repositories, 1 por entidad)              │
│  - traduce Domain ↔ filas de Supabase                         │
│  - único lugar que importa el cliente de supabase-js          │
└──────────────────────────────────────────────────┼──────────┘
                                                      │ supabase-js
┌─────────────────────────────────────────────────────▼───────┐
│  SUPABASE                                                     │
│  ┌────────────┐ ┌───────────┐ ┌─────────┐ ┌────────────────┐ │
│  │ PostgreSQL │ │   Auth    │ │ Storage │ │ Edge Functions │ │
│  │ + RLS      │ │           │ │ (facturas,│ │ (futuro:      │ │
│  │ + RPC funcs│ │           │ │  fotos)  │ │  webhook WA)   │ │
│  └────────────┘ └───────────┘ └─────────┘ └────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

**Idea central:** las operaciones que tocan inventario (confirmar pedido, marcar plato listo, confirmar compra, registrar merma) **no son un simple `INSERT`/`UPDATE` desde el cliente**. Son transacciones multi-tabla (ledger + reservas + estado del pedido) que deben ser atómicas. Por eso se implementan como **funciones RPC de Postgres** (`SECURITY DEFINER`), invocadas por la capa de servicios del frontend. Esto evita:

- condiciones de carrera (dos pedidos reservando el último kg de carne al mismo tiempo),
- lógica de negocio duplicada entre frontend y una futura integración de WhatsApp,
- escrituras parciales si el navegador se cierra a mitad de una operación.

La capa de **Domain Services** en el frontend es delgada: valida inputs, llama al RPC correspondiente, interpreta el resultado. La lógica pesada (cálculo de reservas, generación de movimientos) vive en Postgres, versionada como migraciones SQL. Esto también es lo que permite que WhatsApp (Fase 9) se conecte sin reescribir el core: un futuro Edge Function que reciba mensajes de WhatsApp llamará **los mismos RPCs** (`dk_create_order`, `dk_confirm_order`, etc.) que usa la UI.

---

## 2. Component Architecture (Frontend)

```
src/
  app/                     # bootstrap: router, providers, layout raíz
  shared/
    ui/                    # componentes genéricos (Button, Table, Modal, Badge de estado...)
    lib/
      supabase.ts          # único cliente supabase-js
      queryClient.ts       # TanStack Query
    hooks/                 # hooks transversales (useAuth, useRole)
    utils/                 # formatters, date helpers
    rbac/                  # matriz de permisos por rol (frontend mirror de RLS)
  modules/
    auth/
    dashboard/
    inventory/             # insumos, unidades, stock, movimientos, mermas, ajustes
    suppliers/
    purchases/              # compras + facturas
    recipes/
    products/               # platos
    menus/                  # menú, menú del día
    orders/                  # PEDIDOS, el centro operativo (ADR 0020): una sola capa de datos del pedido, tablero (board/), Lista, Despacho y detalle
    kitchen/                 # Cocina: vista de preparación de esos mismos pedidos (KDS), tiempos (SLA), voz, horario
    staff/                   # Personal y Turnos (ADR 0020): turnos flexibles, entrada/salida, horas
    copilot/                 # Quanela Copilot (ADR 0020): panel y renderizado seguro de respuestas
    customers/
    reports/
    organization/            # equipos, roles, cuentas, funciones y plan (componentes que reutiliza el centro)
    orgAdmin/                # centro de administración /o/:org (ADR 0012): layout, Resumen, Observabilidad, Bitácora, Facturación, IA y voz…
    platform/                # paneles de plataforma (ai/: control central de IA y voz, ADR 0014; planes; cuentas) que usa el portal Global Admin
  types/
    database.ts             # tipos generados por Supabase CLI (supabase gen types)

admin/                     # portal Quanela Global Admin (ADR 0019): app aparte, admin.quanela.com
  index.html               # noindex; public/robots.txt bloquea todo
  src/
    auth/                  # sesión propia (storageKey 'quanela-global-admin') y login con TOTP
    layout/                # barra lateral y marca del portal
    lib/                   # cliente Supabase propio y api.ts (solo funciones dk_ga_*)
    pages/                 # Dashboard, Organizations, Users, AI Monitoring, Activity, Administration
```

Cada módulo de dominio sigue la misma subestructura interna:

```
modules/inventory/
  components/     # piezas de UI reutilizables dentro del módulo
  pages/          # rutas (contenedores conectados a hooks/servicios)
  hooks/          # useIngredients(), useStockMovements() — TanStack Query wrappers
  services/       # lógica de negocio + llamadas a repositories/RPC (sin JSX)
  repositories/    # acceso a datos (Supabase queries), únicas funciones que tocan tablas
  types/           # tipos de dominio (no confundir con tipos generados de DB)
  schemas/         # validación (zod) de formularios
```

**Dos contextos de navegación ([ADR 0012](./adr/0012-centro-de-administracion.md)).** `/k/:cuenta/…` es la **operación** de una Cuenta: `KitchenScope` fija la Cuenta y el rol activos, que viajan en `x-dk-kitchen-id`/`x-dk-role-id`. `/o/:organización/…` es el **centro de administración**: `OrgScope` resuelve la organización contra `dk_my_context`, **limpia** la Cuenta y el rol activos y expone `useOrgAdmin()` (`organization`, `can(perm)`, `path(to)`, `accounts`). Las consultas del centro usan claves `['org', orgId, …]` y la base valida el `organization_id` en cada RPC. `/cuentas` es el selector. La plataforma ya no vive en Quanela: `/admin` redirige a inicio.

**Pedidos como centro ([ADR 0020](./adr/0020-pedidos-como-centro-personal-y-copilot.md)).**
- **Una sola fuente del pedido en la interfaz.** El pedido se lee con una única consulta y un único tipo (`orders/api/orders.ts` → `Order`), bajo una sola raíz de caché `['orders']`. Pedidos (Tablero, Lista, Despacho), Cocina, el Dashboard y Clientes la comparten: un cambio en una vista se ve en todas. Ninguna tiene su propia copia.
- **Cocina reutiliza el tablero de Pedidos.** Usa el mismo componente (`orders/board`) con otras columnas y un **alcance** (`KITCHEN_SCOPE`): prepara, prioriza y cancela; no confirma ni despacha.
- **Abastecimiento no cambia.** Pedidos solo refresca sus cachés de stock después de cambiar un pedido.
- **`/` de la cuenta es «tu inicio».** Caja → Pedidos, cocina → Cocina, domiciliario → Despacho, administración → `/dashboard`.

**Un subdominio por organización ([ADR 0021](./adr/0021-subdominios-por-organizacion.md) y [ADR 0022](./adr/0022-codigo-de-tenant.md)).**
- **Dominios.** `{código}.quanela.com` es la organización (código de 6 caracteres que genera la base, p. ej. `a7k92p`; nunca el nombre); `quanela.com` es la landing, el registro y el login general. Un solo despliegue con el dominio comodín `*.quanela.com`; el dominio raíz sale de `VITE_TENANT_ROOT_DOMAIN`.
- **Resolución del tenant.** `src/shared/tenant` lee el host, y `dk_tenant_public` dice si la organización existe y está activa. `TenantProvider`/`useTenant()` es el único contexto de organización; `TenantGate` exige la membresía antes de montar cualquier ruta.
- **Cuenta en la URL y redirección.** La cuenta sigue en la ruta (`/k/{cuenta}`). Una cuenta u organización de otro tenant lleva a su subdominio.
- **Sesión compartida.** La sesión es una cookie de `.quanela.com`, compartida por todas tus organizaciones. En `*.localhost` es por subdominio.
- **Código inmutable.** El código lo genera la base al crear la organización y nadie lo cambia. El `slug` queda como dato interno (`/o/{slug}`).
- **Autoridad de los datos.** Sigue siendo la RLS por cuenta y membresía.

**Menú de usuario y Apariencia ([ADR 0023](./adr/0023-menu-de-usuario.md)).**
- **Menú con submenús.** `MenuPanel` (`src/shared/ui`) arma menús descritos como datos, con submenús laterales en escritorio y dentro del mismo panel en el celular. El menú de usuario es el mismo en la cuenta y en el centro de administración.
- **Tema.** El tema claro (beta) invierte la escala `neutral` en un solo lugar (`[data-theme='light']` en `index.css`).
- **Preferencias del equipo.** Apariencia se guarda por equipo, en una cookie del dominio raíz para que se vea igual en todos los subdominios.

**Personal y Turnos.**
- **`dk_shifts`** apunta a la persona y a su rol en la cuenta: no copia usuarios ni roles. La base impide los solapes por persona en toda la organización.
- **Permisos:** `staff.view` y `staff.manage`. Cualquier persona ve sus propios turnos y marca su entrada y salida.

**Quanela Copilot.**
- **Edge Function `dk-copilot`.** Corre con la sesión de la persona y la cuenta activa.
- **Herramientas `dk_copilot_*`.** El modelo solo usa estas funciones de la base, de solo lectura, que se ejecutan con los permisos de la persona; cada una exige su permiso y respeta la RLS.
- **Solo las herramientas permitidas.** El modelo solo ve las que esa persona puede usar.
- **Cifras y enlaces.** Las cifras salen únicamente de las herramientas, y los enlaces a entidades que no devolvió una herramienta se eliminan.
- **Registro y cuota.** Cada pregunta queda en `dk_ai_insights` (función `copilot`) y consume la cuota de IA del plan.

**Portal Global Admin ([ADR 0019](./adr/0019-portal-global-admin.md)).**
- **App y build propios:** `vite.admin.config.ts`, raíz `admin/`, `npm run dev:admin` / `npm run build:admin`. En Vercel es un segundo proyecto con `QUANELA_APP=admin`.
- **Su propio cliente de Supabase,** con su propia sesión (otro origen y otro `storageKey`). El alias `@/shared/lib/supabase` apunta a ese cliente, así que los paneles reutilizados de `src/modules/platform` usan la sesión del portal. Ambas apps cierran sesión solo en local.
- **Autorización en la base:** toda consulta pasa por funciones `dk_ga_*` y `dk_platform_*` que exigen `dk_require_global_admin()`: rol `SUPERADMIN` **y** sesión `aal2` (TOTP).
- **Altas:** la Edge Function `dk-global-admin` crea la organización con la misma `dk_provision_organization` del registro público e invita al Organization Admin por correo. La persona crea su contraseña en `/activar/:token`.

**Regla dura:** ningún componente React hace `supabase.from(...)` directamente. Todo pasa por `services/` → `repositories/`. Esto es lo que permite mover la lógica de negocio a un RPC sin tocar la UI, y probar `services/` sin renderizar componentes.

---

## 3. Database ERD

Ver [01-database-erd.md](./01-database-erd.md) para el diagrama completo y el detalle de cada tabla.

---

## 4. Inventory Ledger Design

Ver [02-inventory-ledger.md](./02-inventory-ledger.md).

Resumen: `dk_inventory_movements` es un **ledger append-only** (sin `UPDATE`/`DELETE`, ni siquiera para ADMIN — las correcciones se hacen con un movimiento compensatorio de tipo `AJUSTE`). El stock actual **nunca se lee de un campo mutable**; se deriva sumando movimientos. Para performance, existe una tabla caché `dk_ingredient_stock` mantenida por trigger, que es 100% reconstruible desde el ledger (`SELECT SUM(...) FROM dk_inventory_movements GROUP BY ingredient_id`).

---

## 5. Order Lifecycle & Descuento de Inventario

Ver [03-order-lifecycle.md](./03-order-lifecycle.md).

Resumen de la decisión (detalle y justificación en el ADR 0002):

| Estado del pedido | Efecto en inventario |
|---|---|
| `NUEVO` | Ninguno |
| `CONFIRMADO` | Se crean **reservas** por cada insumo de la receta × cantidad. `available -= reservado`. Si no hay stock disponible suficiente, la confirmación falla (bloqueo duro en MVP). Se genera la comanda para cocina. |
| `EN_PREPARACION` | Ninguno adicional (cambio de estado visible en cocina) |
| `LISTO` | Se **consume** la reserva: se generan movimientos `CONSUMO` definitivos en el ledger y se liberan las reservas correspondientes. |
| `DESPACHADO` / `ENTREGADO` | Ninguno (logística) |
| `CANCELADO` | Si la reserva sigue activa → se libera (`available` vuelve a subir). Si ya hubo consumo (cancelación tardía, caso raro) → se genera un movimiento `DEVOLUCION` y queda marcado para revisión. |

---

## 6. Kitchen Workflow

- Al pasar un pedido a `CONFIRMADO`, se crea 1 fila en `dk_kitchen_tickets` (la "comanda"), con una copia (snapshot) de los platos/cantidades/observaciones — así la comanda no cambia si alguien edita el pedido después.
- Cada ítem del pedido tiene su propio `kitchen_status` (`PENDIENTE → EN_PREPARACION → LISTO`) para que cocina pueda marcar plato por plato, no solo el pedido completo.
- Cuando **todos** los ítems de un ticket están `LISTO`, el pedido pasa automáticamente a `LISTO` (trigger o lógica de servicio) y dispara el consumo de inventario descrito arriba.

---

## 7. Purchase Workflow

1. Se crea una compra en estado `BORRADOR` con proveedor, factura (número, fecha) y líneas (insumo, cantidad, unidad de compra, costo).
2. Se puede adjuntar el archivo de la factura (PDF/imagen) a Supabase Storage, referenciado en `dk_attachments`.
3. Al **confirmar** la compra (`dk_confirm_purchase` RPC):
   - Se valida que cada línea tenga insumo/cantidad/costo válidos.
   - Por cada línea se genera un movimiento `COMPRA` en el ledger (convertido a unidad base del insumo).
   - Se actualiza el costo promedio del insumo (costo promedio ponderado).
   - La compra pasa a `CONFIRMADA` (inmutable; para corregir se anula y se crea una nueva, o se hace un ajuste).

---

## 8. Recipe / Ingredient Model

- `dk_recipes` es **versionado**: nunca se edita una receta usada; una edición crea una nueva fila (`version = version + 1`, `is_active = true`, se desactiva la anterior).
- `dk_products.active_recipe_id` apunta a la versión vigente.
- `dk_order_items.recipe_id` guarda **qué versión de receta** se usó al momento de vender, para que el costo histórico de un pedido antiguo no cambie si luego se edita la receta.
- El costo de un plato se calcula sumando `cantidad_receta (convertida a unidad base) × costo_promedio_insumo` por cada ingrediente. Se cachea en `dk_products.estimated_cost`, recalculado cuando cambia la receta o el costo promedio de un insumo (trigger).

---

## 9. Unit Conversion Model

Ver ADR 0003. Resumen:

- `dk_units`: catálogo de unidades (`g`, `kg`, `ml`, `l`, `unidad`, `docena`...) con `unit_type` (peso/volumen/unidad) y `factor_to_base` respecto a la unidad base de su tipo (`g` y `ml` y `unidad` son las bases, factor 1).
- Cada insumo tiene un `base_unit_id` — la unidad en la que **siempre** se mide su stock (ej. carne siempre en `g`).
- La conversión entre unidades del mismo tipo (kg↔g, l↔ml) es automática vía `factor_to_base`.
- Para empaques de compra específicos del insumo que no son una conversión "universal" (ej. "caja x 24 unidades" o "bolsa de 5kg" de un insumo concreto), existe `dk_ingredient_purchase_units` (insumo, unidad de compra, factor a unidad base). Esto evita forzar todo al sistema genérico de unidades cuando el empaque es específico del proveedor/insumo.
- El inventario **nunca** se convierte a "platos". Las recetas consumen insumos en su unidad base; el número de "platos teóricos" es un cálculo derivado (para reportes/alertas de stock bajo), no un estado almacenado.

---

## 10. Roles & Permissions

| Rol | Alcance |
|---|---|
| `ADMIN` | Todo, incluyendo gestión de usuarios/roles y correcciones de inventario |
| `MANAGER` | Todo excepto gestión de usuarios; puede confirmar compras, editar recetas/precios, ver reportes |
| `INVENTORY` | Insumos, proveedores, compras, movimientos, mermas, ajustes. Sin acceso a precios de venta/pedidos |
| `KITCHEN` | Ve comandas, cambia `kitchen_status` de ítems. Sin acceso a compras/precios/reportes financieros |
| `CASHIER` | Crea/confirma pedidos, gestiona clientes, cobra. Sin acceso a inventario/compras |
| `DELIVERY` | Ve pedidos en estado `LISTO`/`DESPACHADO` asignados a él, actualiza estado de entrega |

Detalle de matriz completa (tabla × acción × rol) en [../docs/adr/0005-rls-strategy.md](./adr/0005-rls-strategy.md).

---

## 11. Supabase RLS Strategy

- Cada tabla de negocio tiene `RLS ENABLED` desde el día 1 (nunca se desarrolla con RLS apagado).
- **Organizaciones y Cuentas ([ADR 0007](./adr/0007-multi-cocina.md), [ADR 0008](./adr/0008-organizaciones-y-cuentas.md)).** Cada tabla de negocio tiene `kitchen_id` (la **Cuenta**). La Cuenta activa llega en el encabezado `x-dk-kitchen-id` y el rol activo en `x-dk-role-id`; `dk_effective_role()` los valida (SUPER_ADMIN (creador) de la organización, o miembro con ese rol asignado; sin encabezado no hay Cuenta, cero filas). Los permisos son claves de un catálogo central (`dk_permissions`: `orders.confirm`, `inventory.adjust`…) y las políticas siguen el patrón `USING (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('orders.view')))`. Los datos de organización se protegen por fila con `dk_has_org_permission(organization_id, 'users.manage')`. El administrador de la plataforma (`dk_users.platform_role = 'SUPERADMIN'`) tiene acceso de soporte a todo.
- **Funciones opcionales ([ADR 0009](./adr/0009-iconos-avatares-y-funciones.md)).** IA y voz se describen en el catálogo `dk_features`. La organización decide si las ofrece (`dk_organization_features`) y cada Cuenta si las activa (`dk_kitchen_features`). La base resuelve `usable = ofrecida ∧ activada ∧ dk_can(permiso de uso)` con `dk_can_use_feature()`, que protege `dk_ai_insights`. La app lee el resultado de `dk_my_features()` en el contexto activo (`useAppContext().canUseFeature`); ningún componente decide por su cuenta. Escritura solo por RPC (`dk_set_org_feature`, `dk_set_kitchen_feature`), con una guardia que impide activar lo que la organización no ofrece.
- **Planes ([ADR 0010](./adr/0010-planes-precios-y-onboarding.md)).** El plan es de la **organización** (`dk_subscriptions`, una por organización) y es el primer techo: `usable = plan incluye ∧ organización ofrece ∧ Cuenta activa ∧ permiso`. Los límites de Cuentas (`dk_create_kitchen`) y usuarios (guardia de `dk_organization_members`) salen de `dk_plans.limits`. Los catálogos de planes y funciones se leen sin sesión (landing); nada más se abre a `anon`. El plan elegido en el registro se valida en `dk_create_organization`, que crea organización, suscripción, primera Cuenta y roles en una transacción; antes de confirmar el correo no existe nada en la base. Sin pagos: la plataforma cambia planes con `dk_set_subscription`.
- **Cuota de IA y políticas sin superposición ([ADR 0011](./adr/0011-consolidacion-y-endurecimiento.md)).** La Edge Function de IA consulta `dk_ai_run_allowed()` antes de llamar al modelo: intervalo mínimo por Cuenta y función, y tope en 24 h del plan. Los parámetros de las funciones se validan contra `dk_features.settings_schema`. Cada tabla tiene como máximo una política permisiva por comando y rol: no hay `FOR ALL` superpuestas, porque la lectura es `ver ∨ editar` en una sola política.
- **Centro de administración, observabilidad y bitácora ([ADR 0012](./adr/0012-centro-de-administracion.md)).** Dos permisos de organización nuevos: `observability.view` y `billing.view` (catálogo de 59 permisos: 47 de Cuenta y 12 de organización). `dk_audit_log` es de solo agregar (append-only): sin escrituras desde la API y con una guardia de fila y sentencia salvo dentro de la retención (`dk_purge_audit_log`, 400 días, `pg_cron`). Cada fila la clasifica en la base un disparador `BEFORE INSERT` (`event_type`, `category`, `summary`, `result`, `source`). Se lee por Cuenta con `audit.view` o por organización con `observability.view`, con `dk_org_events` (cursor). La observabilidad se consulta con `dk_org_observability` y `dk_account_observability`: `SECURITY DEFINER`, verifican el permiso y que la Cuenta sea de la organización, con ventanas acotadas por índices `(kitchen_id, created_at desc)`. Las fechas se calculan en la zona horaria de cada Cuenta (`dk_kitchen_tz`, `dk_local_start`, `dk_local_date`). La suscripción y `dk_invoices` exigen `billing.view`.
- **IA administrada centralmente y voz de cocina ([ADR 0014](./adr/0014-ia-centralizada-y-voz-de-cocina.md)).**
  - **Regla:** `usable = dk_features.active (plataforma) ∧ plan ∧ organización ofrece ∧ Cuenta activada ∧ permiso de uso`.
  - **Quién decide qué:**
    - Solo la organización (`features.manage`) o la plataforma activan por Cuenta (`dk_set_kitchen_feature`).
    - La Cuenta ajusta sus parámetros con `dk_set_kitchen_feature_settings`, solo si la función está activa y la organización lo permite (`allow_account_override`).
  - **Parámetros por capas:** `dk_features.default_settings` ← `dk_organization_features.settings` ← `dk_kitchen_features.settings`. Los calcula `dk_my_features`.
  - **Plataforma:** RPC `dk_platform_*`, protegidas con `dk_require_platform_admin()`. Administra catálogo de modelos (`dk_ai_models`, precios solo para estimar), modelo e intervalo por función, límites por plan, catálogo de voces (`dk_voice_profiles`) y uso con tokens.
  - **Edge Function de IA:** usa el modelo que devuelve `dk_ai_run_allowed` y guarda tokens y latencia. La clave vive solo como secreto.
  - **Voz:** texto a voz del dispositivo, detrás de un adaptador (`SpeechEngine`) y una única cola con prioridades (`src/shared/voice/speechQueue.ts`). Las frases salen de plantillas, sin modelo de lenguaje.
  - **Auxiliares SQL internas:** se revocan explícitamente a `anon`/`authenticated`, porque Supabase les concede EXECUTE por defecto.
- **Comandos de voz sin internet ([ADR 0015](./adr/0015-comandos-de-voz-con-vosk.md), beta).**
  - El reconocimiento pasa por un adaptador (`src/shared/voice/recognition/engines.ts`) con dos motores: el del navegador (predeterminado) y Vosk en WebAssembly (opcional por equipo).
  - Vosk usa una gramática limitada a los comandos y el modelo `vosk-model-small-es-0.42` desde el bucket público de solo lectura `dk-voice-models`, y se carga en diferido.
  - Los números hablados se convierten a cifras antes del intérprete (`spokenNumbers.ts`).
  - Con Vosk, cancelar por voz está desactivado por seguridad.
- **Manos libres «Oye Quanela» ([ADR 0016](./adr/0016-oye-quanela-palabra-de-activacion.md), beta).**
  - Función `voice_wake_word` (depende de `voice_commands`; mismos planes). La plataforma ajusta el umbral y los tramos de confirmación. Además, cada equipo tiene un interruptor propio, apagado por defecto.
  - Detector en el navegador (`src/shared/voice/wakeWord/`): un AudioWorklet pasa el micrófono a 16 kHz en tramos de 80 ms; luego vienen espectrograma mel, red de características y clasificador, en `onnxruntime-web` (WASM, un hilo, carga diferida).
  - Los tres modelos (~3,3 MB) están en `dk-voice-models/wake/oye-quanela-v1/`. Se entrenan con el código de `ml/wake-word/`, solo con fuentes de licencia comercial.
  - Al detectar la frase: tono y 5 s de escucha con el motor de comandos del equipo. La detección suelta el micrófono mientras se escucha un comando y descarta el audio mientras habla Quanela (`SpeechQueue.isSpeaking`).
  - El audio se procesa en el equipo y se descarta.
- *Histórico:* el rol global (`dk_users.role`, `dk_current_role()`) se retiró en la Fase 6 de la ADR 0007; la columna se conserva sin uso.
- Las tablas puramente transaccionales críticas (`dk_inventory_movements`, `dk_inventory_reservations`) **no reciben `INSERT` directo del cliente** salvo por rol `ADMIN`/`INVENTORY` en casos manuales (compra manual, merma, ajuste); los movimientos derivados de pedidos se generan exclusivamente dentro de los RPC `SECURITY DEFINER`, que se ejecutan con privilegios elevados pero validan el rol del `auth.uid()` que invoca internamente.
- Storage: buckets privados (`invoices`, `product-images`), políticas por rol igual que las tablas.

---

## 12. Frontend Folder Structure

Ver sección 2 arriba (Component Architecture).

---

## 13. Backend / Data Access Structure

- No hay backend propio en el MVP: Postgres + RLS + funciones RPC **son** el backend.
- `repositories/` en el frontend son el único punto de contacto con `supabase-js`.
- Operaciones multi-tabla atómicas → función SQL (`supabase/migrations/*.sql`), expuesta como RPC.
- Operaciones CRUD simples de una tabla (crear insumo, editar proveedor) → `INSERT`/`UPDATE` directo vía `repositories/`, protegido por RLS.

---

## 14. API / Service Boundaries

Para que WhatsApp (Fase 9) no requiera reescribir el core:

- Todo lo que "crea o cambia el estado de un pedido" vive detrás de un **contrato de servicio estable**, independiente del canal de entrada:
  - `OrderService.createOrder(input)`
  - `OrderService.confirmOrder(orderId)`
  - `OrderService.cancelOrder(orderId, reason)`
- Hoy, `input` lo arma un formulario de React. Mañana, lo armará un Edge Function que parsea un mensaje de WhatsApp y resuelve/crea el cliente por su número de teléfono. Ambos llaman el mismo `OrderService`, que llama los mismos RPC de Postgres.
- `dk_orders.channel` (enum: `MANUAL`, `WHATSAPP`, `PHONE`) y `dk_orders.external_reference` (id del mensaje/conversación externa) se agregan **desde ahora**, aunque no se use todavía, para no requerir una migración de esquema cuando llegue WhatsApp.
- `dk_customers.whatsapp_id` (nullable, único) se agrega desde ahora por la misma razón.

---

## 15. Principales decisiones técnicas (resumen)

1. **Ledger append-only** como fuente de verdad de inventario, con tabla caché derivada para performance.
2. **Reservas separadas del ledger**: `dk_inventory_reservations` es el mecanismo de "stock comprometido pero no consumido"; el ledger solo registra movimientos reales.
3. **Reserva en `CONFIRMADO`, consumo en `LISTO`** (ver ADR 0002).
4. **Recetas versionadas e inmutables**; pedidos referencian la versión usada.
5. **Transacciones críticas como RPC de Postgres**, no como múltiples llamadas desde el cliente.
6. **Unidades con conversión genérica + conversión específica por insumo** para empaques no estándar.
7. **RLS activo desde el inicio**, con rol resuelto vía función `SECURITY DEFINER`.
8. **Contrato de servicio de pedidos agnóstico al canal**, preparando WhatsApp sin deuda técnica.
9. Prefijo `dk_` en absolutamente todas las tablas, incluidas las de soporte (auditoría, adjuntos, unidades).

---

## 16. Riesgos arquitectónicos

| Riesgo | Mitigación |
|---|---|
| Ledger crece indefinidamente → queries de stock lentas | Tabla caché `dk_ingredient_stock` mantenida por trigger; el ledger se consulta por rango de fechas para reportes, no para "stock actual" |
| Reservas huérfanas (pedido cancelado sin liberar reserva por bug) | Reserva y cambio de estado del pedido ocurren en la misma transacción RPC; job de auditoría periódico detecta reservas `active` de pedidos ya `CANCELADO`/`ENTREGADO` |
| Condiciones de carrera en stock (dos cajeros confirman al mismo tiempo) | La reserva se hace dentro de una transacción SQL con `SELECT ... FOR UPDATE` sobre la fila de stock cacheado del insumo |
| Sobre-ingeniería temprana (RPCs para todo) | Solo las operaciones que tocan inventario/estado de pedido van por RPC; el resto es CRUD directo vía repositories + RLS |
| Costeo de insumos con precios variables entre compras | Costo promedio ponderado (moving average), recalculado en cada `COMPRA`; suficiente para MVP, documentado como ADR para no perder la discusión de FIFO/lote si el negocio lo pide después |
| RLS mal configurado expone datos entre roles | Suite de tests SQL (`pgTAP` o script propio) que verifica políticas por rol antes de cada release; matriz de permisos documentada como fuente de verdad |

---

## 17. ADRs recomendados

Ver carpeta [`docs/adr/`](./adr/):

- [ADR 0001 — Ledger append-only vs. campo `current_stock` mutable](./adr/0001-append-only-ledger.md)
- [ADR 0002 — Punto de reserva y consumo de inventario en el ciclo de vida del pedido](./adr/0002-reservation-point.md)
- [ADR 0003 — Modelo de unidades y conversión de empaques](./adr/0003-unit-conversion-model.md)
- [ADR 0004 — Transacciones críticas como RPC de Postgres `SECURITY DEFINER`](./adr/0004-rpc-transactions.md)
- [ADR 0005 — Estrategia de roles y RLS](./adr/0005-rls-strategy.md)
- [ADR 0006 — Límite de integración con WhatsApp en esta fase](./adr/0006-whatsapp-boundary.md)
- [ADR 0007 — Multi-cocina](./adr/0007-multi-cocina.md) · [ADR 0008 — Organizaciones y cuentas](./adr/0008-organizaciones-y-cuentas.md)
- [ADR 0009 — Iconos, avatares y funciones](./adr/0009-iconos-avatares-y-funciones.md) · [ADR 0010 — Planes, precios y onboarding](./adr/0010-planes-precios-y-onboarding.md)
- [ADR 0011 — Consolidación y endurecimiento](./adr/0011-consolidacion-y-endurecimiento.md) · [ADR 0012 — Centro de administración, observabilidad y bitácora](./adr/0012-centro-de-administracion.md)
- [ADR 0013 — Código y URL en inglés](./adr/0013-codigo-y-urls-en-ingles.md) (propuesta) · [ADR 0014 — IA administrada centralmente y voz de cocina](./adr/0014-ia-centralizada-y-voz-de-cocina.md) · [ADR 0015 — Comandos de voz sin internet con Vosk](./adr/0015-comandos-de-voz-con-vosk.md) · [ADR 0016 — «Oye Quanela»: palabra de activación](./adr/0016-oye-quanela-palabra-de-activacion.md)
- [ADR 0017 — Comandos de voz: flujo completo y platos](./adr/0017-comandos-de-voz-flujo-completo-y-platos.md) (en pausa) · [ADR 0018 — IA en la organización, menús e imágenes](./adr/0018-ia-en-la-organizacion-menus-e-imagenes.md) · [ADR 0019 — Portal Global Admin](./adr/0019-portal-global-admin.md) · [ADR 0020 — Pedidos como centro, Personal y Turnos, Quanela Copilot](./adr/0020-pedidos-como-centro-personal-y-copilot.md) · [ADR 0021 — Un subdominio por organización](./adr/0021-subdominios-por-organizacion.md) · [ADR 0022 — Código de tenant de 6 caracteres](./adr/0022-codigo-de-tenant.md) · [ADR 0023 — Menú de usuario, Apariencia y Ayuda](./adr/0023-menu-de-usuario.md)

---

## 18. Roadmap de implementación

Sigue las fases ya definidas por ti (0 a 9). Fase 0 = este documento. No se avanza a Fase 1 (Foundation) sin aprobación explícita.
