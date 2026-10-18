# Order Lifecycle

## Diagrama de estados

```
NUEVO ──confirmar──▶ CONFIRMADO ──iniciar prep.──▶ EN_PREPARACION ──todos listos──▶ LISTO ──despachar──▶ DESPACHADO ──entregar──▶ ENTREGADO
  │                       │                              │                            │
  └──────────────────────┴──────────────────────────────┴────────cancelar────────────┘
                                                                      ▼
                                                                 CANCELADO
```

## Tabla estado → efecto en inventario → efecto en cocina/logística

| Transición | Inventario | Cocina | Logística |
|---|---|---|---|
| → `NUEVO` | Ninguno | — | — |
| `NUEVO` → `CONFIRMADO` | `dk_confirm_order()`: valida `stock_available ≥ cantidad requerida` por cada insumo de cada receta; si falta algo, la transacción falla completa (no hay confirmación parcial). Crea filas `dk_inventory_reservations (ACTIVE)`. | Se crea `dk_kitchen_tickets` (comanda) con snapshot de ítems/observaciones | — |
| ítem `PENDIENTE` → `EN_PREPARACION` (ADR 0069) | `dk_advance_kitchen_item()`: valida `stock_on_hand ≥ reservado` por insumo (si no alcanza, falla con `insufficient_stock` y el plato no empieza); la reserva `ACTIVE` pasa a `CONSUMED` y se inserta `CONSUMO` | El primer ítem que empieza lleva el pedido a `EN_PREPARACION` | — |
| ítem `EN_PREPARACION` → `LISTO` | Ninguno (ya se consumió al empezar) | Cuando **todos** los ítems del ticket están `LISTO`, el pedido completo pasa a `LISTO` | — |
| ítem devuelto a `PENDIENTE` | `dk_revert_kitchen_item()`: `DEVOLUCION` de lo consumido y la reserva vuelve a `ACTIVE`; `requires_review = true` | — | — |
| `LISTO` → `DESPACHADO` | Ninguno | — | Se crea/actualiza `dk_deliveries`, se asigna domiciliario |
| `DESPACHADO` → `ENTREGADO` | Ninguno | — | `dk_deliveries.status = ENTREGADO`, timestamp de entrega |
| cualquier estado (antes de `ENTREGADO`) → `CANCELADO` | `dk_cancel_order()`: reservas `ACTIVE` → `RELEASED` (stock disponible sube); reservas `CONSUMED` (el plato ya había empezado) → movimiento `DEVOLUCION` y la reserva pasa a `RELEASED` (nunca se devuelve dos veces); `requires_review` se mantiene o se enciende para revisión manual | Ticket se marca cancelado | Entrega se cancela si existía |

## Por qué reservar en `CONFIRMADO` y consumir al empezar cada plato

(Justificación en [ADR 0002](./adr/0002-reservation-point.md), revisada por ADR 0069: el consumo pasó de `LISTO` a `EN_PREPARACION` de cada ítem.) En corto:

- Reservar en `CONFIRMADO` evita que dos pedidos confirmados casi simultáneamente vendan el mismo último kilo de un insumo — el segundo cajero ve "no disponible" al intentar confirmar, no después de que cocina ya empezó a preparar.
- Consumir (movimiento real de ledger) cuando el plato **empieza** a prepararse es cuando los insumos salen físicamente de la bodega. Una corrección (plato devuelto a pendiente) los devuelve una vez y los vuelve a reservar.
- `NUEVO` no reserva porque un pedido en este estado puede ser un borrador (ej. cliente todavía dictando el pedido por teléfono/WhatsApp) que ni siquiera se confirme.

## Auditoría de estado

`dk_order_status_history` registra cada transición (`order_id`, `from_status`, `to_status`, `changed_by`, `changed_at`, `note` opcional) — necesario tanto para reportes operativos ("tiempo promedio en cocina") como para auditoría de cancelaciones.
