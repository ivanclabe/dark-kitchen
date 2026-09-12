import { cardClass, secondaryButtonClass } from '@/shared/ui/formClasses'
import { getErrorMessage } from '@/shared/utils/errors'
import { useState } from 'react'
import { useAdvanceKitchenItem, useKitchenQueue } from '../hooks/useKitchen'
import type { KitchenItemStatus, KitchenTicket, KitchenTicketItem } from '../types'

const STATUS_BADGE: Record<KitchenItemStatus, string> = {
  PENDIENTE: 'bg-neutral-700 text-neutral-200',
  EN_PREPARACION: 'bg-orange-500/20 text-orange-400',
  LISTO: 'bg-emerald-500/20 text-emerald-400',
}

const STATUS_LABEL: Record<KitchenItemStatus, string> = {
  PENDIENTE: 'Pendiente',
  EN_PREPARACION: 'En preparación',
  LISTO: 'Listo',
}

function ItemRow({ item }: { item: KitchenTicketItem }) {
  const advance = useAdvanceKitchenItem()
  const [error, setError] = useState<string | null>(null)

  async function handleAdvance() {
    setError(null)
    try {
      await advance.mutateAsync(item.id)
    } catch (err) {
      setError(getErrorMessage(err, 'Error al actualizar el plato'))
    }
  }

  return (
    <div className="border-b border-neutral-800 py-2 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-neutral-100">
            {item.quantity}× {item.productName}
          </p>
          {item.observation && <p className="text-xs text-neutral-500">"{item.observation}"</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[item.kitchenStatus]}`}>
            {STATUS_LABEL[item.kitchenStatus]}
          </span>
          {item.kitchenStatus !== 'LISTO' && (
            <button onClick={handleAdvance} disabled={advance.isPending} className={secondaryButtonClass}>
              {item.kitchenStatus === 'PENDIENTE' ? 'Iniciar' : 'Marcar listo'}
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  )
}

function TicketCard({ ticket }: { ticket: KitchenTicket }) {
  const minutesAgo = Math.max(0, Math.round((Date.now() - new Date(ticket.createdAt).getTime()) / 60000))

  return (
    <div className={cardClass}>
      <div className="mb-2 flex items-start justify-between">
        <div>
          <p className="font-medium text-neutral-100">{ticket.customerName}</p>
          <p className="text-xs text-neutral-500">
            #{ticket.orderId.slice(0, 8)} · hace {minutesAgo} min
          </p>
        </div>
        <span
          className={`rounded px-2 py-0.5 text-xs ${
            ticket.orderStatus === 'EN_PREPARACION' ? 'bg-orange-500/20 text-orange-400' : 'bg-neutral-700 text-neutral-200'
          }`}
        >
          {ticket.orderStatus === 'EN_PREPARACION' ? 'En preparación' : 'Confirmado'}
        </span>
      </div>
      {ticket.notes && <p className="mb-2 text-xs text-neutral-500">Nota: {ticket.notes}</p>}
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-50">Cocina</h1>
        <p className="text-sm text-neutral-400">Pedidos confirmados en cola. Se actualiza automáticamente.</p>
      </div>

      {isLoading && <p className="text-neutral-400">Cargando…</p>}
      {!isLoading && tickets?.length === 0 && (
        <p className={`${cardClass} text-neutral-400`}>No hay pedidos pendientes en cocina.</p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tickets?.map((ticket) => (
          <TicketCard key={ticket.orderId} ticket={ticket} />
        ))}
      </div>
    </div>
  )
}
