import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Tooltip } from '@/shared/ui/Tooltip'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatMoney } from '@/shared/utils/format'
import { Bike, CheckCircle2, MapPin, PackageCheck, Phone } from 'lucide-react'
import type { ReactNode } from 'react'
import { useOnShiftNow } from '@/modules/staff/hooks/useStaff'
import { allows, useBoardActions } from '../board/boardActions'
import { useMarkDelivered } from '../hooks/useDispatch'
import { ACTION_DENIED_REASON } from '../lib/permissions'
import { formatElapsed, minutesAgoSince } from '../lib/orderVisuals'
import type { Order } from '../types'

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
            <Phone size={12} aria-hidden /> {order.customerPhone}
          </p>
        )}
        <p className="mt-1 truncate text-xs text-neutral-500">
          {order.items.map((i) => `${i.quantity}× ${i.productName}`).join(', ')}
          {order.items.length > 0 && ' · '}
          {formatMoney(order.total)}
          {order.paymentMethod ? ` · ${order.paymentMethod}` : ''}
        </p>
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

/**
 * Pedidos → Despacho (ADR 0020): ready to leave and on their way, from the
 * same live list as the board. A rider (dispatch.view without orders.view)
 * only receives their own deliveries — the database's RLS does it.
 */
export function DispatchView({ orders, isLoading, now }: { orders: Order[] | undefined; isLoading: boolean; now: number }) {
  const board = useBoardActions()
  const markDelivered = useMarkDelivered()
  const { show } = useToast()
  const ready = (orders ?? []).filter((o) => o.status === 'LISTO')
  const onRoute = (orders ?? []).filter((o) => o.status === 'DESPACHADO')
  const canDispatch = allows(board, 'dispatch')
  const canDeliver = allows(board, 'deliver')
  // Riders on shift now (Personal y Turnos), for whoever dispatches.
  const { data: onShift } = useOnShiftNow(canDispatch)
  const ridersOnShift = (onShift ?? []).filter((s) => s.riderId)

  async function deliver(order: Order) {
    try {
      await markDelivered.mutateAsync(order.id)
      show(`Pedido #${order.orderNumber} entregado.`)
    } catch (err) {
      show(getErrorMessage(err, `No se pudo marcar como entregado el pedido ${order.orderNumber}.`), 'error')
    }
  }

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
            action={
              <Tooltip label={canDispatch ? 'Elegir domiciliario' : ACTION_DENIED_REASON.dispatch} side="top">
                <Button size="sm" variant="primary" icon={Bike} disabled={!canDispatch} onClick={() => board.requestDispatch(o)}>
                  Despachar
                </Button>
              </Tooltip>
            }
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
            action={
              <Tooltip label={canDeliver ? 'Marcar como entregado' : ACTION_DENIED_REASON.deliver} side="top">
                <Button size="sm" variant="secondary" icon={PackageCheck} disabled={!canDeliver} loading={markDelivered.isPending && markDelivered.variables === o.id} onClick={() => void deliver(o)}>
                  Entregado
                </Button>
              </Tooltip>
            }
          />
        ))}
        {onRoute.length === 0 && <p className="p-2 text-sm text-neutral-500">Nadie en ruta.</p>}
      </Column>
    </div>
    </div>
  )
}
