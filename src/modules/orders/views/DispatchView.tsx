import { Button } from '@/shared/ui/Button'
import { formatPhone } from '@/shared/utils/phone'
import { EmptyState } from '@/shared/ui/EmptyState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Tooltip } from '@/shared/ui/Tooltip'
import { formatMoney } from '@/shared/utils/format'
import { Bike, CheckCircle2, MapPin, Phone } from 'lucide-react'
import type { ReactNode } from 'react'
import { useOnShiftNow } from '@/modules/staff/hooks/useStaff'
import { allows, useBoardActions } from '../board/boardActions'
import { useOrderActions } from '../board/useOrderActions'
import { ACTION_DENIED_REASON } from '../lib/permissions'
import { formatElapsed, minutesAgoSince } from '../lib/orderVisuals'
import type { Order } from '../types'
import { PaymentBadge } from '../components/PaymentCard'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'

function Column({ title, icon: Icon, count, children }: { title: string; icon: typeof Bike; count: number; children: ReactNode }) {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-neutral-800/60">
      <h2 className="flex shrink-0 items-center gap-1.5 px-3 py-2 text-[11px] font-semibold tracking-wide text-neutral-300 uppercase">
        <Icon size={12} className="text-brasa-400" aria-hidden /> {title}
        <span className="ml-auto tabular-nums text-neutral-500">{count}</span>
      </h2>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-b-xl bg-neutral-900/40 p-2">{children}</div>
    </section>
  )
}

function DispatchCard({ order, now, onOpen, action }: { order: Order; now: number; onOpen: () => void; action: ReactNode }) {
  // ADR 0031: whether it is paid, for whoever sees the receivables (not the rider).
  const showPayment = useActiveKitchen().can('receivables.view')
  const since = order.status === 'DESPACHADO' ? (order.delivery?.dispatchedAt ?? order.updatedAt) : order.updatedAt
  return (
    <article className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <p className="flex items-baseline justify-between gap-2">
          <span className="font-semibold text-neutral-100">
            #{order.orderNumber} · {order.customerName}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-neutral-500">{formatElapsed(minutesAgoSince(since, now))}</span>
        </p>
        <p className="mt-1 flex items-start gap-1.5 text-sm text-neutral-300">
          <MapPin size={13} className="mt-0.5 shrink-0 text-neutral-500" aria-hidden />
          {order.customerAddress ?? 'Sin dirección registrada'}
        </p>
        {order.customerPhone && (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500">
            <Phone size={12} aria-hidden /> {formatPhone(order.customerPhone)}
          </p>
        )}
        <p className="mt-1 truncate text-xs text-neutral-500">
          {order.items.map((i) => `${i.quantity}× ${i.productName}`).join(', ')}
          {order.items.length > 0 && ' · '}
          {formatMoney(order.total)}
          {order.paymentMethod ? ` · ${order.paymentMethod}` : ''}
        </p>
        {showPayment && (
          <p className="mt-1">
            <PaymentBadge order={order} size="sm" />
          </p>
        )}
        {order.delivery?.riderName && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-violet-300">
            <Bike size={12} aria-hidden /> {order.delivery.riderName}
          </p>
        )}
      </button>
      <div className="mt-2 flex justify-end">{action}</div>
    </article>
  )
}

/** The card's one action — the same as on the board (ADR 0031): Despachar when ready, Entregar on the way. */
function DispatchAction({ order }: { order: Order }) {
  const board = useBoardActions()
  const actions = useOrderActions(order)
  const primary = actions.primaryAction
  if (!primary) return null
  const allowed = allows(board, primary.action)
  return (
    <Tooltip label={allowed ? primary.label : ACTION_DENIED_REASON[primary.action]} side="top-end">
      <Button size="sm" variant={primary.action === 'dispatch' ? 'primary' : 'secondary'} icon={primary.icon} disabled={!allowed} loading={actions.busy} onClick={actions.primary}>
        {primary.label}
      </Button>
    </Tooltip>
  )
}

/**
 * Operación → Despacho (ADR 0020): ready to leave and on their way, from the
 * same live list as the board. A rider (dispatch.view without orders.view)
 * only receives their own deliveries — the database's RLS does it.
 */
export function DispatchView({ orders, isLoading, now }: { orders: Order[] | undefined; isLoading: boolean; now: number }) {
  const board = useBoardActions()
  const ready = (orders ?? []).filter((o) => o.status === 'LISTO')
  const onRoute = (orders ?? []).filter((o) => o.status === 'DESPACHADO')
  const canDispatch = allows(board, 'dispatch')
  // Riders on shift now (Personal y Turnos), for whoever dispatches.
  const { data: onShift } = useOnShiftNow(canDispatch)
  const ridersOnShift = (onShift ?? []).filter((s) => s.riderId)

  if (isLoading) return <LoadingState variant="cards" rows={3} cols={2} />
  if (ready.length === 0 && onRoute.length === 0) {
    return <EmptyState icon={Bike} title="Nada por despachar" description="Cuando cocina marque un pedido como listo, aparece aquí para salir." />
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {canDispatch && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
          <Bike size={12} className="text-brasa-400" aria-hidden />
          {ridersOnShift.length > 0 ? `De turno ahora: ${ridersOnShift.map((r) => r.fullName).join(', ')}` : 'Ningún domiciliario con turno ahora.'}
        </p>
      )}
    <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
      <Column title="Listos para salir" icon={CheckCircle2} count={ready.length}>
        {ready.map((o) => (
          <DispatchCard
            key={o.id}
            order={o}
            now={now}
            onOpen={() => board.openDetail(o)}
            action={<DispatchAction order={o} />}
          />
        ))}
        {ready.length === 0 && <p className="p-2 text-sm text-neutral-500">Ningún pedido listo.</p>}
      </Column>
      <Column title="En ruta" icon={Bike} count={onRoute.length}>
        {onRoute.map((o) => (
          <DispatchCard
            key={o.id}
            order={o}
            now={now}
            onOpen={() => board.openDetail(o)}
            action={<DispatchAction order={o} />}
          />
        ))}
        {onRoute.length === 0 && <p className="p-2 text-sm text-neutral-500">Nadie en ruta.</p>}
      </Column>
    </div>
    </div>
  )
}
