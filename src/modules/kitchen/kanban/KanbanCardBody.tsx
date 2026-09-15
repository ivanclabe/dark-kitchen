import { AlertTriangle, Clock, Flag, MessageSquareText } from 'lucide-react'
import { minutesAgoSince, TIME_TIER_STYLE, timeTier } from '../lib/ticketVisuals'
import type { KitchenTicket } from '../types'

function summarizeItems(items: KitchenTicket['items']): string {
  return items.map((item) => `${item.quantity}× ${item.productName}`).join(', ')
}

/**
 * Puramente visual — sin hooks de mutación ni drag. La usan tanto
 * KanbanTicketCard (el card real e interactivo) como el DragOverlay
 * (la vista que sigue al cursor mientras se arrastra), así el "clon" del
 * overlay no duplica lógica ni dispara sus propios hooks de mutación.
 */
export function KanbanCardBody({ ticket, now }: { ticket: KitchenTicket; now: number }) {
  const minutesAgo = minutesAgoSince(ticket.createdAt, now)
  const tier = timeTier(minutesAgo)
  const prioritized = ticket.priority > 0

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-neutral-100">#{ticket.orderNumber}</span>
        <div className="flex items-center gap-2">
          {prioritized && <Flag size={13} className="text-violet-400" aria-label="Pedido prioritario" />}
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${TIME_TIER_STYLE[tier]}`}>
            {tier === 'retrasado' ? <AlertTriangle size={12} /> : <Clock size={12} />}
            {minutesAgo} min
          </span>
        </div>
      </div>

      <p className="mt-1 line-clamp-2 text-xs text-neutral-400">{summarizeItems(ticket.items)}</p>

      {ticket.notes && (
        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-neutral-500">
          <MessageSquareText size={10} className="shrink-0" /> <span className="truncate">{ticket.notes}</span>
        </p>
      )}
    </>
  )
}
