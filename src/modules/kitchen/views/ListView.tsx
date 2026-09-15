import { Chip } from '@/shared/ui/Chip'
import { cardClass, inputClass, secondaryButtonClass, tableWrapperClass, tdClass, thClass } from '@/shared/ui/formClasses'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { AlertTriangle, Clock, Flag, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAdvanceTicketItems } from '../hooks/useKitchen'
import { useKitchenSlaSettings } from '../hooks/useKitchenSettings'
import {
  alertMinutesFor,
  DEFAULT_SLA_THRESHOLDS,
  formatElapsed,
  minutesAgoSince,
  ORDER_STATUS_CONFIG,
  TIME_TIER_STYLE,
  timeTier,
} from '../lib/ticketVisuals'
import type { KitchenOrderStatus, KitchenTicket } from '../types'

const STATUS_FILTERS: KitchenOrderStatus[] = ['CONFIRMADO', 'EN_PREPARACION', 'LISTO']

function ListRow({
  ticket,
  now,
  isNew,
  onAcknowledge,
}: {
  ticket: KitchenTicket
  now: number
  isNew: boolean
  onAcknowledge: () => void
}) {
  const { data: thresholds = DEFAULT_SLA_THRESHOLDS } = useKitchenSlaSettings()
  const minutesAgo = minutesAgoSince(ticket.createdAt, now)
  const tier = timeTier(minutesAgo, alertMinutesFor(ticket.orderStatus, thresholds), thresholds.nearThresholdPct)
  const prioritized = ticket.priority > 0
  const statusConfig = ORDER_STATUS_CONFIG[ticket.orderStatus]
  const StatusIcon = statusConfig.icon
  const hasPending = ticket.items.some((item) => item.kitchenStatus === 'PENDIENTE')
  const hasNotReady = ticket.items.some((item) => item.kitchenStatus !== 'LISTO')
  const summary = ticket.items.map((item) => `${item.quantity}× ${item.productName}`).join(', ')

  const { advanceTicketItems, isPending: advancing } = useAdvanceTicketItems()
  const { show } = useToast()

  async function handleQuickAction() {
    onAcknowledge()
    try {
      if (hasPending) {
        await advanceTicketItems(ticket.items, 'EN_PREPARACION')
        show(`Pedido #${ticket.orderNumber} en preparación.`)
      } else if (hasNotReady) {
        await advanceTicketItems(ticket.items, 'LISTO')
        show(`Pedido #${ticket.orderNumber} listo.`)
      }
    } catch (err) {
      show(getErrorMessage(err, 'Error al actualizar el pedido'), 'error')
    }
  }

  return (
    <tr className={isNew ? 'bg-brasa-500/5' : ''}>
      <td className={`${tdClass} font-medium`}>
        <span className="inline-flex items-center gap-1.5">
          {prioritized && <Flag size={12} className="shrink-0 text-violet-400" />}#{ticket.orderNumber}
        </span>
      </td>
      <td className={tdClass}>{ticket.customerName}</td>
      <td className={`${tdClass} max-w-xs truncate`} title={summary}>
        {summary}
      </td>
      <td className={tdClass}>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig.badge}`}>
          <StatusIcon size={11} /> {statusConfig.label}
        </span>
      </td>
      <td className={tdClass}>
        <span className={`inline-flex items-center gap-1 ${TIME_TIER_STYLE[tier]}`}>
          {tier === 'retrasado' ? <AlertTriangle size={12} /> : <Clock size={12} />}
          {formatElapsed(minutesAgo)}
        </span>
      </td>
      <td className={`${tdClass} text-right`}>
        {hasPending || hasNotReady ? (
          <button onClick={handleQuickAction} disabled={advancing} className={`${secondaryButtonClass} !px-2.5 !py-1.5 text-xs`}>
            {hasPending ? 'Iniciar' : 'Marcar listo'}
          </button>
        ) : (
          <span className="text-xs text-neutral-600">—</span>
        )}
      </td>
    </tr>
  )
}

export function ListView({
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
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<KitchenOrderStatus | 'TODOS'>('TODOS')

  const counts = useMemo(() => {
    const map = new Map<KitchenOrderStatus | 'TODOS', number>()
    map.set('TODOS', tickets?.length ?? 0)
    for (const ticket of tickets ?? []) map.set(ticket.orderStatus, (map.get(ticket.orderStatus) ?? 0) + 1)
    return map
  }, [tickets])

  const filtered = useMemo(() => {
    if (!tickets) return undefined
    const normalizedQuery = query.trim().toLowerCase()
    return tickets.filter((ticket) => {
      if (statusFilter !== 'TODOS' && ticket.orderStatus !== statusFilter) return false
      if (!normalizedQuery) return true
      return String(ticket.orderNumber).includes(normalizedQuery) || ticket.customerName.toLowerCase().includes(normalizedQuery)
    })
  }, [tickets, query, statusFilter])

  if (isLoading) return <p className="text-neutral-400">Cargando…</p>

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar # o cliente…"
            className={`${inputClass} !mt-0 w-56 pl-9`}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip label="Todos" count={counts.get('TODOS') ?? 0} active={statusFilter === 'TODOS'} onClick={() => setStatusFilter('TODOS')} />
          {STATUS_FILTERS.map((status) => (
            <Chip
              key={status}
              label={ORDER_STATUS_CONFIG[status].label}
              count={counts.get(status) ?? 0}
              active={statusFilter === status}
              onClick={() => setStatusFilter(status)}
            />
          ))}
        </div>
      </div>

      {filtered?.length === 0 && <p className={`${cardClass} text-neutral-400`}>Sin pedidos con ese filtro.</p>}

      {filtered && filtered.length > 0 && (
        <div className={tableWrapperClass}>
          <table className="min-w-full divide-y divide-neutral-800">
            <thead className="bg-neutral-900">
              <tr>
                <th className={thClass}>#</th>
                <th className={thClass}>Cliente</th>
                <th className={thClass}>Platos</th>
                <th className={thClass}>Estado</th>
                <th className={thClass}>Tiempo</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800 bg-neutral-950">
              {filtered.map((ticket) => (
                <ListRow
                  key={ticket.orderId}
                  ticket={ticket}
                  now={now}
                  isNew={newIds.has(ticket.orderId)}
                  onAcknowledge={() => onAcknowledge(ticket.orderId)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
