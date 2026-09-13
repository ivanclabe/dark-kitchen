import { useNow } from '@/shared/hooks/useNow'
import { cardClass, secondaryButtonClass } from '@/shared/ui/formClasses'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { ChefHat, Clock, MessageSquareText, PlayCircle } from 'lucide-react'
import { useAdvanceKitchenItem, useKitchenQueue } from '../hooks/useKitchen'
import type { KitchenItemStatus, KitchenTicket, KitchenTicketItem } from '../types'

const STATUS_BADGE: Record<KitchenItemStatus, string> = {
  PENDIENTE: 'bg-neutral-700 text-neutral-200',
  EN_PREPARACION: 'bg-brasa-500/20 text-brasa-400',
  LISTO: 'bg-emerald-500/20 text-emerald-400',
}

const STATUS_LABEL: Record<KitchenItemStatus, string> = {
  PENDIENTE: 'Pendiente',
  EN_PREPARACION: 'En preparación',
  LISTO: 'Listo',
}

function ItemRow({ item }: { item: KitchenTicketItem }) {
  const advance = useAdvanceKitchenItem()
  const { show } = useToast()

  async function handleAdvance() {
    try {
      await advance.mutateAsync(item.id)
      show(item.kitchenStatus === 'PENDIENTE' ? `${item.productName} en preparación.` : `${item.productName} listo.`)
    } catch (err) {
      show(getErrorMessage(err, 'Error al actualizar el plato'), 'error')
    }
  }

  return (
    <div className="border-b border-neutral-800 py-2 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-neutral-100">
            {item.quantity}× {item.productName}
          </p>
          {item.observation && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-neutral-500">
              <MessageSquareText size={11} /> {item.observation}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[item.kitchenStatus]}`}>
            {STATUS_LABEL[item.kitchenStatus]}
          </span>
          {item.kitchenStatus !== 'LISTO' && (
            <button
              onClick={handleAdvance}
              disabled={advance.isPending}
              className={`${secondaryButtonClass} !px-3 !py-1.5`}
            >
              <PlayCircle size={13} />
              {item.kitchenStatus === 'PENDIENTE' ? 'Iniciar' : 'Marcar listo'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function TicketCard({ ticket, now }: { ticket: KitchenTicket; now: number }) {
  const minutesAgo = Math.max(0, Math.round((now - new Date(ticket.createdAt).getTime()) / 60000))
  const urgent = minutesAgo >= 15

  return (
    <div className={`${cardClass} ${urgent ? 'border-red-900/60' : ''}`}>
      <div className="mb-2 flex items-start justify-between">
        <div>
          <p className="font-medium text-neutral-100">{ticket.customerName}</p>
          <p className={`inline-flex items-center gap-1 text-xs ${urgent ? 'text-red-400' : 'text-neutral-500'}`}>
            <Clock size={11} />
            #{ticket.orderId.slice(0, 8)} · hace {minutesAgo} min
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            ticket.orderStatus === 'EN_PREPARACION' ? 'bg-brasa-500/20 text-brasa-400' : 'bg-neutral-700 text-neutral-200'
          }`}
        >
          {ticket.orderStatus === 'EN_PREPARACION' ? 'En preparación' : 'Confirmado'}
        </span>
      </div>
      {ticket.notes && (
        <p className="mb-2 inline-flex items-center gap-1 text-xs text-neutral-500">
          <MessageSquareText size={11} /> {ticket.notes}
        </p>
      )}
      <div>
        {ticket.items.map((item) => (
          <ItemRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}

export function KitchenPage() {
  const { data: tickets, isLoading } = useKitchenQueue()
  const now = useNow()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ChefHat size={22} className="text-brasa-500" />
        <div>
          <h1 className="text-2xl font-semibold text-neutral-50">Cocina</h1>
          <p className="text-sm text-neutral-400">Pedidos confirmados en cola. Se actualiza automáticamente.</p>
        </div>
      </div>

      {isLoading && <p className="text-neutral-400">Cargando…</p>}
      {!isLoading && tickets?.length === 0 && (
        <p className={`${cardClass} text-neutral-400`}>No hay pedidos pendientes en cocina.</p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tickets?.map((ticket) => (
          <TicketCard key={ticket.orderId} ticket={ticket} now={now} />
        ))}
      </div>
    </div>
  )
}
