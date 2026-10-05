import { SUBSCRIPTION_STATUS_LABEL, type SubscriptionStatus } from '@/shared/plans/subscription'
import { Badge, type BadgeTone } from '@/shared/ui/Badge'

/** The states of Facturación with one look (ADR 0026): subscription and invoices. */
export type BillingStatus = SubscriptionStatus | 'paid' | 'open' | 'draft' | 'void' | 'uncollectible'

const STATUS: Record<BillingStatus, { label: string; tone: BadgeTone }> = {
  trialing: { label: SUBSCRIPTION_STATUS_LABEL.trialing, tone: 'brand' },
  active: { label: SUBSCRIPTION_STATUS_LABEL.active, tone: 'success' },
  past_due: { label: SUBSCRIPTION_STATUS_LABEL.past_due, tone: 'warning' },
  canceled: { label: SUBSCRIPTION_STATUS_LABEL.canceled, tone: 'neutral' },
  expired: { label: SUBSCRIPTION_STATUS_LABEL.expired, tone: 'danger' },
  paid: { label: 'Pagada', tone: 'success' },
  open: { label: 'Pendiente', tone: 'warning' },
  draft: { label: 'Borrador', tone: 'neutral' },
  void: { label: 'Anulada', tone: 'neutral' },
  uncollectible: { label: 'Fallida', tone: 'danger' },
}

export function StatusBadge({ status }: { status: BillingStatus }) {
  const { label, tone } = STATUS[status]
  return (
    <Badge tone={tone} size="sm" dot>
      {label}
    </Badge>
  )
}
