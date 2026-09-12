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
| `CONFIRMADO` → `EN_PREPARACION` | Ninguno | Cocina marca inicio; ítems pasan a `kitchen_status = EN_PREPARACION` | — |
| ítem `EN_PREPARACION` → `LISTO` | `dk_mark_order_item_ready()`: reserva del ítem pasa a `CONSUMED`, se inserta movimiento `CONSUMO` | Cuando **todos** los ítems del ticket están `LISTO`, el pedido completo pasa a `LISTO` | — |
| `LISTO` → `DESPACHADO` | Ninguno | — | Se crea/actualiza `dk_deliveries`, se asigna domiciliario |
| `DESPACHADO` → `ENTREGADO` | Ninguno | — | `dk_deliveries.status = ENTREGADO`, timestamp de entrega |
| cualquier estado (antes de `ENTREGADO`) → `CANCELADO` | `dk_cancel_order()`: reservas `ACTIVE` → `RELEASED` (stock disponible sube); si ya había reservas `CONSUMED` (cancelación tardía) → se genera movimiento `DEVOLUCION` por esa cantidad y se marca el pedido con `requires_review = true` para revisión manual | Ticket se marca cancelado | Entrega se cancela si existía |

## Por qué reservar en `CONFIRMADO` y consumir en `LISTO`

(Justificación completa en [ADR 0002](./adr/0002-reservation-point.md).) En corto:

- Reservar en `CONFIRMADO` evita que dos pedidos confirmados casi simultáneamente vendan el mismo último kilo de un insumo — el segundo cajero ve "no disponible" al intentar confirmar, no después de que cocina ya empezó a preparar.
- Consumir (movimiento real de ledger) en `LISTO` refleja el momento en que el insumo **físicamente** se usó — antes de eso (en `EN_PREPARACION`) todavía podría haber una corrección (plato mal empezado, se cambia por otro) sin que eso implique una "venta" ya contabilizada.
- `NUEVO` no reserva porque un pedido en este estado puede ser un borrador (ej. cliente todavía dictando el pedido por teléfono/WhatsApp) que ni siquiera se confirme.

## Auditoría de estado

`dk_order_status_history` registra cada transición (`order_id`, `from_status`, `to_status`, `changed_by`, `changed_at`, `note` opcional) — necesario tanto para reportes operativos ("tiempo promedio en cocina") como para auditoría de cancelaciones.
