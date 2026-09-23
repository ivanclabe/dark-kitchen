import { Badge, type BadgeTone } from '@/shared/ui/Badge'
import type { PurchaseStatus } from '../types'

/** Única fuente de verdad de etiqueta + tono por estado de compra (la usa también el detalle). */
export const PURCHASE_STATUS: Record<PurchaseStatus, { label: string; tone: BadgeTone }> = {
  BORRADOR: { label: 'Borrador', tone: 'neutral' },
  CONFIRMADA: { label: 'Confirmada', tone: 'success' },
  ANULADA: { label: 'Anulada', tone: 'danger' },
}

export function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  const meta = PURCHASE_STATUS[status] ?? {
    label: status,
    tone: 'neutral' as BadgeTone,
  }
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  )
}
