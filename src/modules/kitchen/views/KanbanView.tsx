import { cardClass } from '@/shared/ui/formClasses'
import { useMemo } from 'react'
import { TicketCard } from '../components/TicketCard'
import { ORDER_STATUS_CONFIG } from '../lib/ticketVisuals'
import type { KitchenOrderStatus, KitchenTicket } from '../types'

// Solo 3 columnas: Despachado ya es responsabilidad del módulo Despachos,
// no de Cocina — mostrarlo acá mezclaría dos dominios sin aportarle nada
// operativo a quien cocina.
const COLUMNS: KitchenOrderStatus[] = ['CONFIRMADO', 'EN_PREPARACION', 'LISTO']

export function KanbanView({
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
  const grouped = useMemo(() => {
    const map: Record<KitchenOrderStatus, KitchenTicket[]> = { CONFIRMADO: [], EN_PREPARACION: [], LISTO: [] }
    for (const ticket of tickets ?? []) map[ticket.orderStatus].push(ticket)
    return map
  }, [tickets])

  if (isLoading) return <p className="text-neutral-400">Cargando…</p>
  if (tickets?.length === 0) return <p className={`${cardClass} text-neutral-400`}>No hay pedidos pendientes en cocina.</p>

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {COLUMNS.map((status) => {
        const config = ORDER_STATUS_CONFIG[status]
        const Icon = config.icon
        const columnTickets = grouped[status]

        return (
          <div key={status} className="flex w-80 shrink-0 flex-col gap-3 2xl:w-96">
            <div className={`flex items-center justify-between rounded-lg border border-neutral-800 px-3 py-2 ${config.badge}`}>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                <Icon size={15} /> {config.label}
              </span>
              <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs font-medium">{columnTickets.length}</span>
            </div>
            <div className="flex flex-col gap-3">
              {columnTickets.map((ticket) => (
                <TicketCard
                  key={ticket.orderId}
                  ticket={ticket}
                  now={now}
                  isNew={newIds.has(ticket.orderId)}
                  onAcknowledge={() => onAcknowledge(ticket.orderId)}
                />
              ))}
              {columnTickets.length === 0 && <p className="px-1 text-xs text-neutral-600">Sin pedidos</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
