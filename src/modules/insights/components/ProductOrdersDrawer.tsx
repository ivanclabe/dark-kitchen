import { KitchenLink as Link } from '@/shared/kitchen/KitchenLink'
import { Badge } from '@/shared/ui/Badge'
import { Drawer } from '@/shared/ui/Drawer'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { typography } from '@/shared/ui/typography'
import { formatDateTime } from '@/shared/utils/format'
import { ClipboardList } from 'lucide-react'
import type { ProductRow } from '../api'
import { useProductOrders } from '../hooks'
import { formatMoney } from '../lib/format'
import { CHANNEL_LABEL } from '../lib/labels'

const COST_SOURCE: Record<string, string> = { real: 'Costo real', estimated: 'Costo estimado', none: 'Sin costo' }

/** Drill-down (ADR 0027): the orders behind a product in the period, each one opens its detail. */
export function ProductOrdersDrawer({ product, from, to, periodLabel, onClose }: { product: ProductRow; from: string; to: string; periodLabel: string; onClose: () => void }) {
  const { data, isLoading, isError, error, refetch } = useProductOrders(product.id, from, to)
  return (
    <Drawer open onClose={onClose} title={product.name} subtitle={`Pedidos de ${periodLabel}`} size="md">
      {isLoading ? (
        <LoadingState variant="block" />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !data?.length ? (
        <EmptyState icon={ClipboardList} title="Sin pedidos en el periodo" compact />
      ) : (
        <div className="space-y-3">
          <ul className="divide-y divide-neutral-800/60 rounded-2xl border border-neutral-800/60 px-4">
            {data.map((o) => (
              <li key={`${o.orderId}-${o.createdAt}`}>
                <Link to={`/orders/${o.orderId}`} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-sm hover:bg-neutral-800/40">
                  <span className="min-w-0">
                    <span className="font-medium text-neutral-100">#{o.orderNumber ?? '—'}</span>
                    <span className="ml-2 text-neutral-500">
                      {formatDateTime(o.createdAt)} · {CHANNEL_LABEL[o.channel] ?? o.channel}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 tabular-nums">
                    <span className="text-neutral-400">×{o.quantity}</span>
                    <span className="text-neutral-100">{formatMoney(o.revenue)}</span>
                    {o.costSource && (
                      <Badge size="sm" tone={o.costSource === 'real' ? 'success' : o.costSource === 'estimated' ? 'warning' : 'neutral'}>
                        {COST_SOURCE[o.costSource]}
                        {o.cost !== null && o.cost !== undefined && `: ${formatMoney(o.cost)}`}
                      </Badge>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className={typography.caption}>Muestra hasta 100 pedidos. Toca uno para abrir su detalle.</p>
        </div>
      )}
    </Drawer>
  )
}
