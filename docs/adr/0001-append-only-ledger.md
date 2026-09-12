# ADR 0001 — Ledger append-only vs. campo `current_stock` mutable

## Estado
Aceptado (propuesto para aprobación del usuario)

## Contexto
El inventario es el componente central del sistema. Un campo mutable `current_stock` en `dk_ingredients` sería más simple de implementar pero pierde trazabilidad: no se puede saber por qué el stock cambió, quién lo cambió, ni reconstruir el histórico ante una auditoría o un bug.

## Decisión
`dk_inventory_movements` es una tabla append-only (sin `UPDATE`/`DELETE`, ni para el rol `ADMIN`). El stock "actual" no es una columna de estado sino un valor derivado, cacheado en `dk_ingredient_stock` y reconstruible en cualquier momento sumando el ledger.

## Consecuencias
- (+) Trazabilidad completa, requerida explícitamente por el negocio.
- (+) Auto-reparable: si el trigger de caché falla o hay un bug, el ledger sigue siendo correcto y la caché se puede recalcular.
- (+) Base natural para reportes de mermas, consumo por venta, costo de inventario.
- (−) Toda corrección requiere un movimiento compensatorio en vez de un simple `UPDATE`; el equipo debe entender este patrón (documentado en `02-inventory-ledger.md`).
- (−) Ligeramente más trabajo de implementación inicial (trigger de caché) que un campo mutable simple.
