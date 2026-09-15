import { AlertTriangle, Clock, Flag, MessageSquareText, User } from 'lucide-react'
import { useKitchenSlaSettings } from '../hooks/useKitchenSettings'
import { alertMinutesFor, DEFAULT_SLA_THRESHOLDS, formatElapsed, minutesAgoSince, TIME_TIER_STYLE, timeTier } from '../lib/ticketVisuals'
import type { KitchenTicket } from '../types'

function summarizeItems(items: KitchenTicket['items']): string {
  return items.map((item) => `${item.quantity}× ${item.productName}`).join(', ')
}

/**
 * Puramente visual — sin hooks de mutación ni drag. La usan tanto
 * KanbanTicketCard (el card real e interactivo) como el DragOverlay
 * (la vista que sigue al cursor mientras se arrastra), así el "clon" del
 * overlay no duplica lógica ni dispara sus propios hooks de mutación.
 * useKitchenSlaSettings sí se llama acá (es de solo lectura, cacheada por
 * TanStack Query — llamarla también en el clon del overlay no genera un
 * fetch extra).
 */
export function KanbanCardBody({ ticket, now }: { ticket: KitchenTicket; now: number }) {
  const { data: thresholds = DEFAULT_SLA_THRESHOLDS } = useKitchenSlaSettings()

  if (ticket.orderStatus === 'CANCELADO') {
    // Terminal: no genera alertas de SLA ni "tiempo transcurrido" activo —
    // muestra hace cuánto se canceló, no hace cuánto se creó.
    const cancelledMinutesAgo = minutesAgoSince(ticket.cancelledAt ?? ticket.createdAt, now)
    return (
      <>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-neutral-300">#{ticket.orderNumber}</span>
          <span className="text-xs text-neutral-600">cancelado hace {formatElapsed(cancelledMinutesAgo)}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{summarizeItems(ticket.items)}</p>
        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-neutral-600">
          <User size={10} className="shrink-0" /> <span className="truncate">{ticket.customerName}</span>
        </p>
        {ticket.cancelReason && (
          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-neutral-600">
            <MessageSquareText size={10} className="shrink-0" /> <span className="truncate">{ticket.cancelReason}</span>
          </p>
        )}
      </>
    )
  }

  const minutesAgo = minutesAgoSince(ticket.createdAt, now)
  const tier = timeTier(minutesAgo, alertMinutesFor(ticket.orderStatus, thresholds), thresholds.nearThresholdPct)
  const prioritized = ticket.priority > 0

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-neutral-100">#{ticket.orderNumber}</span>
        <div className="flex items-center gap-2">
          {prioritized && <Flag size={13} className="text-violet-400" aria-label="Pedido prioritario" />}
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${TIME_TIER_STYLE[tier]}`}>
            {tier === 'retrasado' ? <AlertTriangle size={12} /> : <Clock size={12} />}
            {formatElapsed(minutesAgo)}
          </span>
        </div>
      </div>

      <p className="mt-1 line-clamp-2 text-xs text-neutral-400">{summarizeItems(ticket.items)}</p>

      <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-neutral-500">
        <User size={10} className="shrink-0" /> <span className="truncate">{ticket.customerName}</span>
      </p>

      {ticket.notes && (
        <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-neutral-500">
          <MessageSquareText size={10} className="shrink-0" /> <span className="truncate">{ticket.notes}</span>
        </p>
      )}
    </>
  )
}
