import { cardClass } from '@/shared/ui/formClasses'
import { TicketCard } from '../components/TicketCard'
import type { KitchenTicket } from '../types'

/**
 * La vista original de Cocina (única vista hasta esta iteración), migrada
 * sin cambios de comportamiento — sigue siendo el valor por defecto.
 * Pensada para pantallas grandes/Smart TV: tickets grandes, legibles a
 * distancia (ver el salto 2xl: en TicketCard).
 */
export function GridView({
  tickets,
  isLoading,
  now,
  newIds,
  onAcknowledge,
}: {
  tickets: KitchenTicket[] | undefined
  isLoading: boolean
  now: number
  newIds: Set<string>
  onAcknowledge: (orderId: string) => void
}) {
  return (
    <>
      {isLoading && <p className="text-neutral-400">Cargando…</p>}
      {!isLoading && tickets?.length === 0 && (
        <p className={`${cardClass} text-neutral-400`}>No hay pedidos pendientes en cocina.</p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tickets?.map((ticket) => (
          <TicketCard
            key={ticket.orderId}
            ticket={ticket}
            now={now}
            isNew={newIds.has(ticket.orderId)}
            onAcknowledge={() => onAcknowledge(ticket.orderId)}
          />
        ))}
      </div>
    </>
  )
}
