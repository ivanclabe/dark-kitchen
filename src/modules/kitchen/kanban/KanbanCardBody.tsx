import clsx from 'clsx'
import { Bike, Flag, MapPin } from 'lucide-react'
import type { ReactNode } from 'react'
import { useKitchenSlaSettings } from '../hooks/useKitchenSettings'
import { alertMinutesFor, DEFAULT_SLA_THRESHOLDS, formatElapsed, minutesAgoSince, TIME_TIER_STYLE, timeTier } from '../lib/ticketVisuals'
import type { KitchenItemStatus, KitchenTicket } from '../types'

function summarizeItems(items: KitchenTicket['items']): string {
  return items.map((item) => `${item.quantity}× ${item.productName}`).join(', ')
}

const DOT: Record<KitchenItemStatus, string> = {
  PENDIENTE: 'bg-neutral-600',
  EN_PREPARACION: 'bg-amber-400',
  LISTO: 'bg-emerald-400',
}

/** Un punto por plato — solo cuando el pedido está a medias (algún plato listo y otro no). */
function ItemProgress({ items }: { items: KitchenTicket['items'] }) {
  const ready = items.filter((i) => i.kitchenStatus === 'LISTO').length
  if (items.length < 2 || ready === 0 || ready === items.length) return null
  return (
    <span className="inline-flex items-center gap-0.5" title={`${ready} de ${items.length} platos listos`}>
      {items.map((item) => (
        <span key={item.id} className={clsx('size-1.5 rounded-full', DOT[item.kitchenStatus])} aria-hidden />
      ))}
    </span>
  )
}

const KITCHEN_STAGES = new Set(['CONFIRMADO', 'EN_PREPARACION', 'LISTO'])

/**
 * Contenido de la tarjeta — solo lo que se necesita de un vistazo: qué
 * cocinar, lo que la cocina no puede pasar por alto (observaciones), a dónde
 * va o quién lo lleva, y "#número · tiempo". Todo lo demás (cliente, total,
 * historial, acciones secundarias) vive en el detalle del pedido.
 *
 * Puramente visual: la usan la tarjeta interactiva y el DragOverlay.
 * `trailing` es la acción principal que la tarjeta pone al final de la fila de meta.
 */
export function KanbanCardBody({
  ticket,
  now,
  density = 'normal',
  trailing,
}: {
  ticket: KitchenTicket
  now: number
  density?: 'normal' | 'grande'
  trailing?: ReactNode
}) {
  const { data: thresholds = DEFAULT_SLA_THRESHOLDS } = useKitchenSlaSettings()
  const big = density === 'grande'
  const inKitchen = KITCHEN_STAGES.has(ticket.orderStatus)
  const isDispatched = ticket.orderStatus === 'DESPACHADO'

  const notes = [...ticket.items.filter((i) => i.observation).map((i) => `${i.productName}: ${i.observation}`), ...(ticket.notes ? [ticket.notes] : [])]

  // En ruta el reloj que importa es desde que salió, no desde que se creó.
  const minutesAgo = minutesAgoSince(isDispatched && ticket.dispatchedAt ? ticket.dispatchedAt : ticket.createdAt, now)
  const tier = timeTier(minutesAgo, alertMinutesFor(ticket.orderStatus, thresholds), thresholds.nearThresholdPct)

  return (
    <>
      {ticket.items.length > 0 ? (
        <p className={clsx('line-clamp-2 font-medium text-neutral-100', big ? 'text-lg leading-snug' : 'text-sm')}>{summarizeItems(ticket.items)}</p>
      ) : (
        <p className={clsx('font-medium text-amber-400', big ? 'text-base' : 'text-sm')}>Sin platos todavía</p>
      )}

      {notes.length > 0 && (
        <p className={clsx('mt-1 text-amber-300', big ? 'text-sm' : 'text-xs', big ? 'line-clamp-3' : 'line-clamp-2')}>⚠ {notes.join(' · ')}</p>
      )}

      {ticket.orderStatus === 'LISTO' && (
        <p className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
          <MapPin size={11} className="shrink-0 text-neutral-500" aria-hidden />
          <span className="truncate">{ticket.address ?? 'Sin dirección registrada'}</span>
        </p>
      )}

      {isDispatched && (
        <p className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
          <Bike size={11} className="shrink-0 text-neutral-500" aria-hidden />
          <span className="truncate">{ticket.riderName ?? 'Sin domiciliario'}</span>
        </p>
      )}

      <div className="mt-1.5 flex min-h-6 items-center justify-between gap-2">
        <span className={clsx('inline-flex items-center gap-1.5 tabular-nums', big ? 'text-sm' : 'text-xs')}>
          <span className="text-neutral-500">
            #{ticket.orderNumber} · <span className={clsx('font-medium', TIME_TIER_STYLE[tier])}>{formatElapsed(minutesAgo)}</span>
          </span>
          {ticket.priority > 0 && <Flag size={11} className="shrink-0 text-violet-400" aria-label="Prioritario" />}
          {ticket.requiresReview && (
            <span className="rounded bg-amber-500/15 px-1 text-[10px] font-medium text-amber-400" title="Tuvo devoluciones de inventario: revisar">
              Revisar
            </span>
          )}
          {inKitchen && <ItemProgress items={ticket.items} />}
        </span>
        {trailing}
      </div>
    </>
  )
}
