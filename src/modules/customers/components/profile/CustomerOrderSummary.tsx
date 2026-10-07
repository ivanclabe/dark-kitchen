import { OrderStatusBadge } from '@/modules/orders/lib/orderStatus'
import type { OrderStatus } from '@/modules/orders/types'
import { Card } from '@/shared/ui/Card'
import { InfoTip } from '@/shared/ui/InfoTip'
import { LoadingState } from '@/shared/ui/LoadingState'
import { typography } from '@/shared/ui/typography'
import { formatDate, formatMoney } from '@/shared/utils/format'
import { ChevronRight, ReceiptText } from 'lucide-react'
import { useCustomerOrderStats } from '../../hooks/useCustomerProfile'
import { frequencyLabel } from '../../lib/profile'
import type { CustomerDetail } from '../../types'
import { relativeDay } from '../../lib/dates'

function Figure({ label, value, info }: { label: string; value: string; info?: string }) {
  return (
    <div className="min-w-0">
      <p className={`flex items-center ${typography.label}`}>
        {label}
        {info && <InfoTip text={info} label={`Qué es «${label}»`} />}
      </p>
      <p className="mt-1 truncate text-lg font-semibold tabular-nums text-neutral-50">{value}</p>
    </div>
  )
}

/**
 * Comportamiento (ADR 0040): what the real orders say — how many, the last
 * one, how often, how much and the dishes most ordered. Cancelled orders do
 * not count. Nothing is estimated.
 */
export function CustomerOrderSummary({ customer, onOpenOrder }: { customer: CustomerDetail; onOpenOrder: (orderId: string) => void }) {
  const { data: stats, isLoading } = useCustomerOrderStats(customer.id)
  if (customer.orders === undefined) {
    return (
      <Card title="Pedidos" icon={ReceiptText}>
        <p className="text-sm text-neutral-500">Tu rol no ve los pedidos de los clientes.</p>
      </Card>
    )
  }
  const frequency = frequencyLabel(stats?.avgDaysBetween ?? null)
  const maxUnits = Math.max(1, ...(stats?.topDishes ?? []).map((d) => d.units))

  return (
    <Card title="Pedidos" icon={ReceiptText}>
      {isLoading ? (
        <LoadingState variant="block" />
      ) : !stats || stats.orders === 0 ? (
        <p className="text-sm text-neutral-500">Todavía no tiene pedidos.</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Figure label="Pedidos" value={String(stats.orders)} info="Sin contar los cancelados." />
            <Figure label="Total comprado" value={formatMoney(customer.totalPurchased ?? 0)} info="La suma de sus pedidos no cancelados, con domicilio." />
            <Figure label="Frecuencia" value={frequency ?? '—'} info="El tiempo promedio entre sus pedidos. Se calcula con dos pedidos o más." />
            <Figure label="Últimos 90 días" value={`${stats.ordersLast90Days} ${stats.ordersLast90Days === 1 ? 'pedido' : 'pedidos'}`} />
          </div>

          {stats.lastOrder && (
            <button
              type="button"
              onClick={() => onOpenOrder(stats.lastOrder!.id)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-neutral-800/70 bg-neutral-950/40 px-4 py-3 text-left transition-colors hover:border-neutral-700"
            >
              <span className="min-w-0">
                <span className={typography.label}>Último pedido</span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium text-neutral-100">
                  #{stats.lastOrder.orderNumber} <OrderStatusBadge status={stats.lastOrder.status as OrderStatus} size="sm" />
                </span>
                <span className="block text-xs text-neutral-500">
                  {formatDate(stats.lastOrder.createdAt)} · {relativeDay(stats.lastOrder.createdAt)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 font-medium tabular-nums text-neutral-200">
                {formatMoney(stats.lastOrder.total)} <ChevronRight size={14} className="text-neutral-500" aria-hidden />
              </span>
            </button>
          )}

          {stats.topDishes.length > 0 && (
            <div>
              <p className={typography.label}>Lo que más pide</p>
              <ul className="mt-2 space-y-2">
                {stats.topDishes.map((d) => (
                  <li key={d.productId} className="text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-neutral-200">{d.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                        {d.units} {d.units === 1 ? 'unidad' : 'unidades'} · {d.orders} {d.orders === 1 ? 'pedido' : 'pedidos'}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-neutral-800">
                      <div className="h-1.5 rounded-full bg-brasa-500/70" style={{ width: `${(d.units / maxUnits) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {stats.firstOrderAt && <p className={typography.caption}>Primer pedido: {formatDate(stats.firstOrderAt)}.</p>}
        </div>
      )}
    </Card>
  )
}
