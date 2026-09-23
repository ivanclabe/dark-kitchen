import { useOrders } from '@/modules/orders/hooks/useOrders'
import { ORDER_STATUS, ORDER_STATUS_SEQUENCE, OrderStatusBadge } from '@/modules/orders/lib/orderStatus'
import type { OrderStatus } from '@/modules/orders/types'
import { Badge } from '@/shared/ui/Badge'
import { Chip } from '@/shared/ui/Chip'
import { Drawer } from '@/shared/ui/Drawer'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { StatCard } from '@/shared/ui/StatCard'
import { formatDateTime, formatMoney, todayStr } from '@/shared/utils/format'
import { AlertTriangle, ClipboardList, Clock, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

/**
 * Historial de pedidos — lo que era la lista de la pantalla Pedidos: todos
 * los estados (incluidos entregados y cancelados, que no viven en el
 * tablero), chips con conteo, búsqueda y el aviso "revisar". Un clic abre el
 * mismo detalle que las tarjetas del tablero.
 */
export function HistoryDrawer({ open, onClose, onOpenOrder }: { open: boolean; onClose: () => void; onOpenOrder: (orderId: string) => void }) {
  const { data: orders, isLoading, isError, error, refetch } = useOrders()
  const [filter, setFilter] = useState<OrderStatus | 'TODOS'>('TODOS')
  const [query, setQuery] = useState('')

  const counts = useMemo(() => {
    const map = new Map<OrderStatus | 'TODOS', number>()
    map.set('TODOS', orders?.length ?? 0)
    for (const o of orders ?? []) map.set(o.status, (map.get(o.status) ?? 0) + 1)
    return map
  }, [orders])

  const stats = useMemo(() => {
    const list = orders ?? []
    const today = todayStr()
    return {
      today: list.filter((o) => o.createdAt.slice(0, 10) === today).length,
      active: list.filter((o) => o.status !== 'ENTREGADO' && o.status !== 'CANCELADO').length,
      review: list.filter((o) => o.requiresReview).length,
    }
  }, [orders])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (orders ?? []).filter((o) => {
      if (filter !== 'TODOS' && o.status !== filter) return false
      if (!q) return true
      return String(o.orderNumber).includes(q) || o.customerName.toLowerCase().includes(q)
    })
  }, [orders, filter, query])

  return (
    <Drawer open={open} onClose={onClose} title="Historial de pedidos" subtitle="Todos los pedidos, incluidos entregados y cancelados">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Hoy" value={stats.today} icon={ClipboardList} tone="brand" />
          <StatCard label="Activos" value={stats.active} icon={Clock} />
          <StatCard label="Revisar" value={stats.review} icon={AlertTriangle} tone={stats.review > 0 ? 'warn' : 'good'} />
        </div>

        <div className="relative">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-500" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar # o cliente…"
            aria-label="Buscar pedido"
            className="w-full min-w-0 rounded-lg border border-neutral-800 bg-neutral-900 py-2.5 pr-3 pl-9 text-sm text-neutral-100 transition-colors outline-none placeholder:text-neutral-600 hover:border-neutral-700 focus:border-brasa-500 focus:ring-2 focus:ring-brasa-500/15"
          />
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
          <Chip label="Todos" count={counts.get('TODOS') ?? 0} active={filter === 'TODOS'} onClick={() => setFilter('TODOS')} />
          {ORDER_STATUS_SEQUENCE.map((status) => (
            <Chip key={status} label={ORDER_STATUS[status].label} count={counts.get(status) ?? 0} active={filter === status} onClick={() => setFilter(status)} />
          ))}
        </div>

        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} compact />
        ) : isLoading ? (
          <LoadingState variant="block" label="Cargando pedidos…" />
        ) : filtered.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Sin pedidos" description={query || filter !== 'TODOS' ? 'Prueba con otro filtro o búsqueda.' : 'Todavía no hay pedidos.'} compact />
        ) : (
          <ul className="divide-y divide-neutral-800/60">
            {filtered.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => onOpenOrder(o.id)}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-neutral-800/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-100">
                      <span className="tabular-nums text-neutral-500">#{o.orderNumber}</span> {o.customerName}
                    </p>
                    <p className="text-xs text-neutral-500">{formatDateTime(o.createdAt)}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-2">
                    {o.requiresReview && (
                      <Badge tone="warning" icon={AlertTriangle} size="sm">
                        revisar
                      </Badge>
                    )}
                    <OrderStatusBadge status={o.status} size="sm" />
                    <span className="w-20 text-right text-sm font-semibold tabular-nums text-neutral-100">{formatMoney(o.total)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  )
}
