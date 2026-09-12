# ADR 0002 — Punto de reserva y consumo de inventario en el ciclo de vida del pedido

## Estado
Aceptado (propuesto para aprobación del usuario)

## Contexto
La sección 11 del brief plantea la pregunta abierta explícitamente: ¿cuándo debe descontarse (o reservarse) el inventario dentro del flujo `NUEVO → CONFIRMADO → EN_PREPARACION → LISTO → DESPACHADO → ENTREGADO`? El brief propone como punto de partida "reserva en preparación, consumo al completar", pero pide que se analice y determine la mejor arquitectura.

## Opciones consideradas
1. **Reservar y consumir en `CONFIRMADO`** (todo junto): simple, pero no distingue "comprometido" de "realmente usado"; una cancelación después de confirmado requeriría siempre una reversión completa incluso si cocina nunca tocó el insumo.
2. **Reservar en `EN_PREPARACION`, consumir en `LISTO`** (propuesta original del brief): dos pedidos podrían confirmarse "a ciegas" respecto al stock, porque la comanda ya fue impresa/mostrada a cocina antes de que exista cualquier compromiso de inventario — riesgo de que cocina empiece dos platos y falte insumo para el segundo.
3. **Reservar en `CONFIRMADO`, consumir en `LISTO`** (elegida): el compromiso de stock ocurre en el mismo momento en que se genera la comanda, de modo que la disponibilidad se valida *antes* de que cocina reciba el pedido. El consumo real (ledger) ocurre cuando el insumo físicamente se usó.

## Decisión
Opción 3: reservar en `CONFIRMADO`, consumir en `LISTO`.

## Consecuencias
- (+) Cocina nunca recibe una comanda para la que no hay insumos — la validación de stock ocurre en la confirmación, antes de generar el ticket.
- (+) El "stock disponible" que ve un cajero/sistema de pedidos es siempre confiable en tiempo real, incluso con varios pedidos concurrentes.
- (+) El ledger solo refleja consumo real, no intención — mejor para reportes de costo.
- (−) Requiere el concepto adicional de "reserva" (una tabla y un estado más que gestionar) en vez de un solo movimiento de ledger.
- (−) Cancelaciones tardías (después de `LISTO`) son un caso especial que requiere `DEVOLUCION` y revisión manual — documentado y aceptado como caso de borde poco frecuente.
