import { Badge, type BadgeTone } from '@/shared/ui/Badge'
import type { OrderStatus } from '../types'
import { ORDER_STATUS_CONFIG } from './orderVisuals'

/**
 * The badge tone of each order status. The label is the one of the board
 * (ADR 0031, D3: one vocabulary for the whole app): Por confirmar · En cola ·
 * Preparando · Listo · En ruta · Entregado · Cancelado.
 */
const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  NUEVO: 'neutral',
  CONFIRMADO: 'info',
  EN_PREPARACION: 'warning',
  LISTO: 'success',
  DESPACHADO: 'brand',
  ENTREGADO: 'success',
  CANCELADO: 'danger',
}

export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS_CONFIG[status].label
}

export function OrderStatusBadge({ status, size }: { status: OrderStatus; size?: 'sm' | 'md' }) {
  return (
    <Badge tone={STATUS_TONE[status]} size={size} dot>
      {orderStatusLabel(status)}
    </Badge>
  )
}
