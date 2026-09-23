import { EmptyState } from '@/shared/ui/EmptyState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core'
import clsx from 'clsx'
import { ChefHat } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useCancelledKitchenQueue } from '../hooks/useKitchen'
import { useKitchenSlaSettings } from '../hooks/useKitchenSettings'
import { useBoardActions } from '../kanban/boardActions'
import { KanbanCardBody } from '../kanban/KanbanCardBody'
import { KanbanTicketCard } from '../kanban/KanbanTicketCard'
import { KanbanToolbar } from '../kanban/KanbanToolbar'
import { canTransition, KANBAN_COLUMNS } from '../kanban/transitions'
import { useKanbanDragDrop } from '../kanban/useKanbanDragDrop'
import { alertMinutesFor, DEFAULT_SLA_THRESHOLDS, minutesAgoSince, ORDER_STATUS_CONFIG, timeTier } from '../lib/ticketVisuals'
import type { KitchenOrderStatus, KitchenTicket } from '../types'

const EMPTY_COPY: Record<KitchenOrderStatus, string> = {
  NUEVO: 'Sin borradores',
  CONFIRMADO: 'Nada en cola',
  EN_PREPARACION: 'Nada en preparación',
  LISTO: 'Nada esperando reparto',
  DESPACHADO: 'Nada en ruta',
  CANCELADO: 'Sin cancelados hoy',
}

function KanbanColumn({
  status,
  tickets,
  now,
  newIds,
  onAcknowledge,
  dropState,
}: {
  status: KitchenOrderStatus
  tickets: KitchenTicket[]
  now: number
  newIds: Set<string>
  onAcknowledge: (orderId: string) => void
  /** Durante un arrastre: si esta columna acepta la tarjeta (flujo + rol). null = no hay arrastre. */
  dropState: 'valid' | 'invalid' | null
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: dropState === 'invalid' })
  const config = ORDER_STATUS_CONFIG[status]
  const Icon = config.icon
  const iconColorClass = config.badge.match(/text-\S+/)?.[0] ?? 'text-neutral-400'
  const isCancelledColumn = status === 'CANCELADO'

  return (
    // Columna en caja (borde + rounded-xl continuo header→body), mismo lenguaje que el Planificador de Menús.
    <div
      className={clsx(
        'flex min-h-0 flex-col rounded-xl border border-neutral-800/60 transition-opacity',
        isCancelledColumn ? 'w-60 flex-none' : 'min-w-64 flex-1',
        dropState === 'invalid' && 'opacity-35',
      )}
    >
      <div className="flex shrink-0 items-center gap-1.5 rounded-t-xl px-2 py-1.5">
        <Icon size={13} className={iconColorClass} />
        <span className="text-xs font-semibold tracking-wide text-neutral-300 uppercase">{config.label}</span>
        {tickets.length > 0 && <span className="rounded-full bg-neutral-800 px-1.5 text-[10px] tabular-nums text-neutral-400">{tickets.length}</span>}
      </div>
      <div
        ref={setNodeRef}
        className={clsx(
          'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-b-xl p-2 transition-colors',
          isOver ? 'bg-brasa-500/10 ring-1 ring-brasa-500/40 ring-inset' : dropState === 'valid' ? 'bg-brasa-500/[0.04]' : 'bg-neutral-900/40',
        )}
      >
        {tickets.map((ticket) => (
          <KanbanTicketCard key={ticket.orderId} ticket={ticket} now={now} isNew={newIds.has(ticket.orderId)} onAcknowledge={() => onAcknowledge(ticket.orderId)} />
        ))}
        {tickets.length === 0 && <p className="rounded-lg border border-dashed border-neutral-800 px-3 py-6 text-center text-xs text-neutral-600">{EMPTY_COPY[status]}</p>}
      </div>
    </div>
  )
}

/**
 * Tablero de Cocina: el flujo completo del pedido en columnas — Por
 * confirmar → En cola → Preparando → Listo → En ruta (+ Cancelados). Reúne
 * lo que antes eran tres pantallas (Pedidos, Cola y Despacho).
 */
export function KanbanView({
  tickets,
  isLoading,
  now,
  newIds,
  onAcknowledge,
  isToday = true,
}: {
  tickets: KitchenTicket[] | undefined
  isLoading: boolean
  now: number
  newIds: Set<string>
  onAcknowledge: (orderId: string) => void
  /** false en modo histórico: los CANCELADO de esa fecha ya vienen dentro de `tickets`. */
  isToday?: boolean
}) {
  const board = useBoardActions()
  const [search, setSearch] = useState('')
  const [onlyPriority, setOnlyPriority] = useState(false)
  const [onlyAlert, setOnlyAlert] = useState(false)
  const { data: cancelledToday } = useCancelledKitchenQueue(isToday)
  const { data: thresholds = DEFAULT_SLA_THRESHOLDS } = useKitchenSlaSettings()
  const { sensors, activeTicket, handleDragStart, handleDragEnd } = useKanbanDragDrop(tickets, board)

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (ticket: KitchenTicket) => {
      if (onlyPriority && ticket.priority <= 0) return false
      if (onlyAlert) {
        const tier = timeTier(minutesAgoSince(ticket.createdAt, now), alertMinutesFor(ticket.orderStatus, thresholds), thresholds.nearThresholdPct)
        if (tier === 'normal') return false
      }
      if (term && !String(ticket.orderNumber).includes(term) && !ticket.customerName.toLowerCase().includes(term)) return false
      return true
    }
  }, [search, onlyPriority, onlyAlert, now, thresholds])

  const grouped = useMemo(() => {
    const map: Record<KitchenOrderStatus, KitchenTicket[]> = { NUEVO: [], CONFIRMADO: [], EN_PREPARACION: [], LISTO: [], DESPACHADO: [], CANCELADO: [] }
    for (const ticket of tickets ?? []) if (matches(ticket)) map[ticket.orderStatus].push(ticket)
    if (isToday) map.CANCELADO = (cancelledToday ?? []).filter(matches)
    return map
  }, [tickets, cancelledToday, isToday, matches])

  const visibleCount = KANBAN_COLUMNS.reduce((sum, s) => sum + grouped[s].length, 0)
  const isEmpty = !isLoading && (tickets?.length ?? 0) === 0 && (!isToday || (cancelledToday?.length ?? 0) === 0)

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <KanbanToolbar
        search={search}
        onSearchChange={setSearch}
        onlyPriority={onlyPriority}
        onTogglePriority={() => setOnlyPriority((v) => !v)}
        onlyAlert={onlyAlert}
        onToggleAlert={() => setOnlyAlert((v) => !v)}
      />

      {isLoading ? (
        <LoadingState variant="cards" rows={4} cols={5} />
      ) : isEmpty ? (
        <EmptyState icon={ChefHat} title="Cocina al día" description="No hay pedidos abiertos. Crea uno con “Nuevo pedido”; los que lleguen por WhatsApp aparecen aquí solos." />
      ) : (
        <>
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={(e) => void handleDragEnd(e)}>
            <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-1">
              {KANBAN_COLUMNS.map((status) => (
                <KanbanColumn
                  key={status}
                  status={status}
                  tickets={grouped[status]}
                  now={now}
                  newIds={newIds}
                  onAcknowledge={onAcknowledge}
                  dropState={
                    !activeTicket || status === activeTicket.orderStatus ? null : canTransition(activeTicket.orderStatus, status, board.role) ? 'valid' : 'invalid'
                  }
                />
              ))}
            </div>

            <DragOverlay>
              {activeTicket && (
                <div className="shadow-float w-72 rounded-xl border border-brasa-500/60 bg-neutral-900 px-3 py-2.5">
                  <KanbanCardBody ticket={activeTicket} now={now} density={board.density} />
                </div>
              )}
            </DragOverlay>
          </DndContext>

          {visibleCount === 0 && <p className="px-1 text-sm text-neutral-500">Sin pedidos con ese filtro.</p>}
        </>
      )}
    </div>
  )
}
