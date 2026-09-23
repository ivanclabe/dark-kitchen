import { Badge, type BadgeTone } from '@/shared/ui/Badge'
import type { OrderStatus } from '../types'

/**
 * Única fuente de verdad del label y color de cada estado de pedido —
 * antes estaba duplicada verbatim en OrdersPage y OrderBuilder. Los tonos
 * siguen la misma semántica que Cocina (ticketVisuals): CONFIRMADO =
 * esperando (info), EN_PREPARACION = en marcha (warning), LISTO/entregado =
 * éxito, CANCELADO = peligro.
 */
export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: BadgeTone }> = {
  NUEVO: { label: 'Nuevo', tone: 'neutral' },
  CONFIRMADO: { label: 'Confirmado', tone: 'info' },
  EN_PREPARACION: { label: 'En preparación', tone: 'warning' },
  LISTO: { label: 'Listo', tone: 'success' },
  DESPACHADO: { label: 'Despachado', tone: 'brand' },
  ENTREGADO: { label: 'Entregado', tone: 'success' },
  CANCELADO: { label: 'Cancelado', tone: 'danger' },
}

export const ORDER_STATUS_SEQUENCE: OrderStatus[] = ['NUEVO', 'CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'DESPACHADO', 'ENTREGADO', 'CANCELADO']

export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS[status].label
}

export function OrderStatusBadge({ status, size }: { status: OrderStatus; size?: 'sm' | 'md' }) {
  const { label, tone } = ORDER_STATUS[status]
  return (
    <Badge tone={tone} size={size} dot>
      {label}
    </Badge>
  )
}
