# ADR 0005 — Estrategia de roles y RLS

## Estado
Aceptado (propuesto para aprobación del usuario)

## Contexto
Se necesitan 6 roles con permisos claramente distintos (`ADMIN`, `MANAGER`, `KITCHEN`, `INVENTORY`, `CASHIER`, `DELIVERY`), aplicados de forma consistente en base de datos (no solo ocultando botones en la UI).

## Decisión
- `dk_users.role` (enum `dk_role`) es la fuente de verdad del rol, ligada 1:1 a `auth.users.id`.
- Función `dk_current_role()` `SECURITY DEFINER` (evita recursión de RLS al leer `dk_users` desde una política que protege `dk_users`).
- RLS `ENABLED` en toda tabla de negocio desde la primera migración.
- La UI también mantiene un espejo de la matriz de permisos (`shared/rbac/`) para ocultar acciones no permitidas — **por UX, no por seguridad**; la seguridad real vive en RLS/RPC.

## Matriz de permisos (resumen — detalle fila por tabla se define en Fase 1)

| Módulo | ADMIN | MANAGER | INVENTORY | KITCHEN | CASHIER | DELIVERY |
|---|---|---|---|---|---|---|
| Usuarios/roles | RW | R | – | – | – | – |
| Insumos/proveedores/compras | RW | RW | RW | R | – | – |
| Movimientos/mermas/ajustes | RW (insert) | RW (insert) | RW (insert) | – | – | – |
| Recetas/productos/precios | RW | RW | R | R | R | – |
| Menú | RW | RW | – | R | R | – |
| Pedidos (crear/confirmar) | RW | RW | – | R (solo lectura de comanda) | RW | R (asignados) |
| Cocina (`kitchen_status`) | RW | RW | – | RW | – | – |
| Despacho/domicilios | RW | RW | – | – | R | RW (asignados) |
| Clientes | RW | RW | – | – | RW | R |
| Reportes/Dashboard | R | R | R (solo inventario) | – | R (solo ventas) | – |

## Consecuencias
- (+) Seguridad real a nivel de fila, no solo de UI.
- (+) Un futuro cliente API (WhatsApp Edge Function) queda automáticamente sujeto a las mismas reglas si actúa como un rol de servicio bien definido.
- (−) Requiere mantener la matriz sincronizada entre RLS (SQL) y el espejo de UI; se documenta como única fuente de verdad esta tabla, y el espejo de frontend se genera/revisa contra ella en cada PR que toque permisos.
