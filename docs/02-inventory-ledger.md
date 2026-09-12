# Inventory Ledger Design

## Principio

`dk_inventory_movements` es la **única fuente de verdad** del inventario. No existe un campo `current_stock` editable en `dk_ingredients`. El stock siempre es, conceptualmente:

```
stock(insumo) = SUM(quantity_base_unit) FROM dk_inventory_movements WHERE ingredient_id = X
```

## Tipos de movimiento

| Tipo | Signo | Origen | Referencia |
|---|---|---|---|
| `COMPRA` | + | `dk_confirm_purchase()` | `dk_purchase_items.id` |
| `MERMA` | − | `dk_register_waste()` (manual, rol INVENTORY/ADMIN) | null o justificación |
| `AJUSTE` | + o − | `dk_register_adjustment()` (manual, rol INVENTORY/ADMIN) | null |
| `CONSUMO` | − | `dk_mark_order_item_ready()` | `dk_order_items.id` |
| `DEVOLUCION` | + | `dk_cancel_order()` (cancelación tardía) o devolución de compra | `dk_order_items.id` / `dk_purchase_items.id` |

Cada fila almacena: `ingredient_id`, `movement_type`, `quantity_base_unit` (siempre en la unidad base del insumo, ya convertida), `unit_cost` (costo unitario aplicado, relevante para `COMPRA` y para costear `CONSUMO` al costo promedio vigente), `reference_type` + `reference_id` (polimórfico: a qué operación de negocio pertenece), `created_by`, `reason` (enum corto para mermas: `VENCIMIENTO`, `DANO`, `ERROR_PREPARACION`, `OTRO`), `observation` (texto libre), `created_at`.

## Append-only

- RLS: `INSERT` permitido según rol; **ninguna política de `UPDATE` ni `DELETE`** existe para esta tabla (ni para ADMIN). Es una decisión deliberada (ver ADR 0001).
- Corrección de un error → insertar un movimiento compensatorio (`AJUSTE`) con `observation` explicando qué se corrige y referenciando el movimiento original en la observación.

## Caché de stock: `dk_ingredient_stock`

Para no calcular `SUM()` sobre todo el ledger en cada consulta de UI (crítico para la vista de cocina/caja que debe ser rápida), existe una tabla 1:1 con `dk_ingredients`:

```sql
create table dk_ingredient_stock (
  ingredient_id uuid primary key references dk_ingredients(id),
  stock_on_hand numeric not null default 0,      -- suma del ledger
  stock_reserved numeric not null default 0,     -- suma de dk_inventory_reservations activas
  stock_available numeric generated always as (stock_on_hand - stock_reserved) stored,
  updated_at timestamptz not null default now()
);
```

- `stock_on_hand` se actualiza por trigger `AFTER INSERT` en `dk_inventory_movements`.
- `stock_reserved` se actualiza por trigger en `dk_inventory_reservations` (al crear/liberar/consumir una reserva).
- Toda la tabla es **reconstruible** en cualquier momento con un `REFRESH` (script de mantenimiento) que recalcula desde el ledger + reservas activas — sirve como mecanismo de auto-reparación si algún trigger falla, y como verificación de integridad periódica.

## Reservas: `dk_inventory_reservations`

Las reservas **no son movimientos de ledger** — son "stock comprometido, aún no consumido":

```sql
create table dk_inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references dk_ingredients(id),
  order_item_id uuid not null references dk_order_items(id),
  quantity_base_unit numeric not null,
  status dk_reservation_status not null default 'ACTIVE', -- ACTIVE | RELEASED | CONSUMED
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
```

Ciclo de una reserva:

1. **Creada** (`ACTIVE`) al confirmar el pedido — `dk_confirm_order()`.
2. **Consumida** (`CONSUMED`) cuando el ítem se marca `LISTO` — genera el movimiento `CONSUMO` en el mismo paso transaccional.
3. **Liberada** (`RELEASED`) si el pedido se cancela antes de consumirse.

## Costo de inventario

- `dk_ingredients.avg_cost`: costo promedio ponderado, recalculado en cada `COMPRA`:
  `nuevo_avg = (stock_actual × avg_cost_actual + cantidad_comprada × costo_compra) / (stock_actual + cantidad_comprada)`
- `CONSUMO` usa `avg_cost` vigente al momento del consumo como `unit_cost` del movimiento (para que el costo de un plato vendido hoy refleje el costo real de reponer ese insumo).
- Valor total de inventario (dashboard) = `SUM(stock_on_hand × avg_cost)` sobre `dk_ingredient_stock` join `dk_ingredients`.

## Reconstrucción / auditoría

En cualquier momento se puede verificar integridad con:

```sql
select ingredient_id, sum(quantity_base_unit) as stock_calculado
from dk_inventory_movements
group by ingredient_id;
```

y compararlo contra `dk_ingredient_stock.stock_on_hand`. Cualquier diferencia indica un bug de trigger, nunca una pérdida de datos (el ledger es la verdad).
