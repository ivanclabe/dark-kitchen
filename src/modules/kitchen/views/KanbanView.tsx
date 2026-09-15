import { cardClass } from '@/shared/ui/formClasses'
import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core'
import { useMemo, useState } from 'react'
import { useCancelledKitchenQueue } from '../hooks/useKitchen'
import { useKitchenSlaSettings } from '../hooks/useKitchenSettings'
import { KanbanCardBody } from '../kanban/KanbanCardBody'
import { KanbanTicketCard } from '../kanban/KanbanTicketCard'
import { KanbanToolbar } from '../kanban/KanbanToolbar'
import { KANBAN_COLUMNS } from '../kanban/transitions'
import { useKanbanDragDrop } from '../kanban/useKanbanDragDrop'
import { alertMinutesFor, DEFAULT_SLA_THRESHOLDS, minutesAgoSince, ORDER_STATUS_CONFIG, timeTier } from '../lib/ticketVisuals'
import type { KitchenOrderStatus, KitchenTicket } from '../types'

function KanbanColumn({
  status,
  tickets,
  now,
  newIds,
  onAcknowledge,
}: {
  status: KitchenOrderStatus
  tickets: KitchenTicket[]
  now: number
  newIds: Set<string>
  onAcknowledge: (orderId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const config = ORDER_STATUS_CONFIG[status]
  const Icon = config.icon
  const iconColorClass = config.badge.match(/text-\S+/)?.[0] ?? 'text-neutral-400'
  const isCancelledColumn = status === 'CANCELADO'

  return (
    <div className={`flex min-w-64 flex-col gap-2 ${isCancelledColumn ? 'flex-none w-64' : 'flex-1 min-w-72'}`}>
      <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-200">
          <Icon size={14} className={iconColorClass} /> {config.label}
        </span>
        <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs font-medium text-neutral-400">{tickets.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex flex-1 flex-col gap-2 rounded-lg p-1 transition-colors ${isOver ? 'bg-neutral-800/40 ring-1 ring-inset ring-brasa-500/40' : ''} ${
          isCancelledColumn ? 'max-h-[70vh] overflow-y-auto' : ''
        }`}
      >
        {tickets.map((ticket) => (
          <KanbanTicketCard
            key={ticket.orderId}
            ticket={ticket}
            now={now}
            isNew={newIds.has(ticket.orderId)}
            onAcknowledge={() => onAcknowledge(ticket.orderId)}
          />
        ))}
        {tickets.length === 0 && <p className="px-1 text-xs text-neutral-600">Sin pedidos</p>}
      </div>
    </div>
  )
}

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
  const [search, setSearch] = useState('')
  const [onlyPriority, setOnlyPriority] = useState(false)
  const [onlyAlert, setOnlyAlert] = useState(false)
  const { data: cancelledTickets } = useCancelledKitchenQueue()
  const { data: thresholds = DEFAULT_SLA_THRESHOLDS } = useKitchenSlaSettings()
  const { sensors, activeTicket, handleDragStart, handleDragEnd } = useKanbanDragDrop(tickets)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (tickets ?? []).filter((ticket) => {
      if (onlyPriority && ticket.priority <= 0) return false
      if (onlyAlert) {
        const tier = timeTier(minutesAgoSince(ticket.createdAt, now), alertMinutesFor(ticket.orderStatus, thresholds), thresholds.nearThresholdPct)
        if (tier === 'normal') return false
      }
      if (term && !String(ticket.orderNumber).includes(term) && !ticket.customerName.toLowerCase().includes(term)) return false
      return true
    })
  }, [tickets, search, onlyPriority, onlyAlert, now, thresholds])

  const filteredCancelled = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return cancelledTickets ?? []
    return (cancelledTickets ?? []).filter(
      (ticket) => String(ticket.orderNumber).includes(term) || ticket.customerName.toLowerCase().includes(term),
    )
  }, [cancelledTickets, search])

  const grouped = useMemo(() => {
    const map: Record<KitchenOrderStatus, KitchenTicket[]> = { CONFIRMADO: [], EN_PREPARACION: [], LISTO: [], CANCELADO: filteredCancelled }
    for (const ticket of filtered) map[ticket.orderStatus].push(ticket)
    return map
  }, [filtered, filteredCancelled])

  if (isLoading) return <p className="text-neutral-400">Cargando…</p>
  if (tickets?.length === 0) return <p className={`${cardClass} text-neutral-400`}>No hay pedidos pendientes en cocina.</p>

  return (
    <div className="flex flex-col gap-3">
      <KanbanToolbar
        search={search}
        onSearchChange={setSearch}
        onlyPriority={onlyPriority}
        onTogglePriority={() => setOnlyPriority((v) => !v)}
        onlyAlert={onlyAlert}
        onToggleAlert={() => setOnlyAlert((v) => !v)}
      />

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-3 overflow-x-auto pb-1">
          {KANBAN_COLUMNS.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tickets={grouped[status]}
              now={now}
              newIds={newIds}
              onAcknowledge={onAcknowledge}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTicket && (
            <div className="w-72 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 shadow-xl">
              <KanbanCardBody ticket={activeTicket} now={now} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {filtered.length === 0 && filteredCancelled.length === 0 && <p className="px-1 text-sm text-neutral-500">Sin pedidos con ese filtro.</p>}
    </div>
  )
}
