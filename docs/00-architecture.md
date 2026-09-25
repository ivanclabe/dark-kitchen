# DARK KITCHEN — Arquitectura Base (Fase 0)

Estado: **propuesta, pendiente de aprobación**. No se ha escrito código de aplicación todavía.

Prefijo de base de datos propuesto: **`dk_`** (Dark Kitchen). Se usa en todo este documento. Si prefieres otro prefijo, es un cambio mecánico (find/replace) antes de generar las migraciones.

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
    orders/                  # pedidos
    kitchen/                 # comanda / cocina
    delivery/                # despacho / domiciliarios
    customers/
    reports/
  types/
    database.ts             # tipos generados por Supabase CLI (supabase gen types)
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

---

## 18. Roadmap de implementación

Sigue las fases ya definidas por ti (0 a 9). Fase 0 = este documento. No se avanza a Fase 1 (Foundation) sin aprobación explícita.
