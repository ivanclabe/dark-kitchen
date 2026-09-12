# ADR 0004 — Transacciones críticas como RPC de Postgres `SECURITY DEFINER`

## Estado
Aceptado (propuesto para aprobación del usuario)

## Contexto
Operaciones como confirmar un pedido (validar stock + crear reservas + generar comanda + cambiar estado) tocan múltiples tablas y deben ser atómicas. Hacerlo como varias llamadas separadas desde el cliente (`supabase-js`) expone a condiciones de carrera y escrituras parciales si el cliente falla a mitad de camino.

## Decisión
Las operaciones que combinan cambio de estado + efecto en inventario se implementan como funciones SQL (`SECURITY DEFINER`) expuestas vía RPC de Supabase: `dk_confirm_order`, `dk_mark_order_item_ready`, `dk_cancel_order`, `dk_confirm_purchase`, `dk_register_waste`, `dk_register_adjustment`. El frontend las invoca a través de la capa `services/`, que valida inputs antes de llamar y traduce errores del RPC a mensajes de UI.

Los CRUD simples de una sola tabla (crear insumo, editar proveedor, editar datos de cliente) siguen el camino directo: `repositories/` → `supabase-js` `insert`/`update`, protegido por RLS normal.

## Consecuencias
- (+) Atomicidad garantizada por Postgres (una transacción), no por disciplina del frontend.
- (+) Lógica de negocio centralizada: la futura integración de WhatsApp reutiliza los mismos RPC sin duplicar reglas.
- (+) Superficie de ataque menor: el cliente no puede insertar un movimiento de `CONSUMO` "a mano" saltándose la validación de reserva.
- (−) Requiere disciplina de migraciones SQL versionadas (`supabase/migrations/`) y testing de funciones en Postgres, no solo en TypeScript.
- (−) Cambiar una regla de negocio implica una migración SQL, no solo un deploy de frontend — aceptado como costo razonable a cambio de consistencia.
