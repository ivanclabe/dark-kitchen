import { Button } from '@/shared/ui/Button'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Input, Select } from '@/shared/ui/FormField'
import { formatDateTime, formatMoney } from '@/shared/utils/format'
import { ClipboardList, Search } from 'lucide-react'
import { forwardRef, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useOrderSearch } from '../hooks/useOrders'
import { OrderStatusBadge } from '../lib/orderStatus'
import { CHANNEL_CONFIG } from '../lib/orderVisuals'
import type { Order, OrderChannel, OrderStatus } from '../types'

type Range = 'today' | '7d' | '30d' | 'all'

const RANGES: { value: Range; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Últimos 30 días' },
  { value: 'all', label: 'Todo' },
]

const STATUS_FILTERS: { value: string; label: string; statuses?: OrderStatus[] }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'open', label: 'Abiertos', statuses: ['NUEVO', 'CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'DESPACHADO'] },
  { value: 'delivered', label: 'Entregados', statuses: ['ENTREGADO'] },
  { value: 'cancelled', label: 'Cancelados', statuses: ['CANCELADO'] },
]

const PAGE = 50

function rangeStart(range: Range): string | null {
  if (range === 'all') return null
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (range === '7d') d.setDate(d.getDate() - 6)
  if (range === '30d') d.setDate(d.getDate() - 29)
  return d.toISOString()
}

/**
 * Pedidos → Lista (ADR 0020): every order, also delivered and cancelled,
 * searched in the database by number, customer, phone or dish. Replaces the
 * old "Historial" drawer of Cocina. Filters live in the URL.
 */
export const OrderListView = forwardRef<HTMLInputElement, { onOpen: (order: Order) => void }>(function OrderListView({ onOpen }, searchRef) {
  const [params, setParams] = useSearchParams()
  const range = (RANGES.find((r) => r.value === params.get('range'))?.value ?? '7d') as Range
  const statusKey = params.get('status') ?? ''
  const channel = (params.get('channel') as OrderChannel | null) ?? null
  const [typed, setTyped] = useState(params.get('q') ?? '')
  const [search, setSearch] = useState(typed)
  const [pages, setPages] = useState(1)

  // Typing waits a moment before searching; the term is kept in the URL.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(typed.trim())
      setPages(1)
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (typed.trim()) next.set('q', typed.trim())
          else next.delete('q')
          return next
        },
        { replace: true },
      )
    }, 300)
    return () => clearTimeout(id)
  }, [typed, setParams])

  function setFilter(key: string, value: string) {
    setPages(1)
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }

  const filters = useMemo(
    () => ({
      search,
      from: rangeStart(range),
      statuses: STATUS_FILTERS.find((s) => s.value === statusKey)?.statuses,
      channel,
      limit: PAGE * pages,
    }),
    [search, range, statusKey, channel, pages],
  )
  const { data, isLoading, isFetching, error, refetch } = useOrderSearch(filters)

  const columns: DataTableColumn<Order>[] = [
    { key: 'number', header: '#', cell: (o) => <span className="font-semibold tabular-nums text-neutral-100">#{o.orderNumber}</span> },
    {
      key: 'customer',
      header: 'Cliente',
      cell: (o) => (
        <span className="block min-w-0">
          <span className="block truncate text-neutral-100">{o.customerName}</span>
          <span className="block truncate text-xs text-neutral-500">{o.items.map((i) => `${i.quantity}× ${i.productName}`).join(', ') || 'Sin platos'}</span>
        </span>
      ),
    },
    { key: 'status', header: 'Estado', cell: (o) => <OrderStatusBadge status={o.status} size="sm" /> },
    {
      key: 'channel',
      header: 'Canal',
      hideBelow: 'md',
      cell: (o) => {
        const c = CHANNEL_CONFIG[o.channel]
        return (
          <span className="inline-flex items-center gap-1 text-xs text-neutral-400">
            <c.icon size={12} aria-hidden /> {c.label}
          </span>
        )
      },
    },
    { key: 'date', header: 'Fecha', hideBelow: 'sm', cell: (o) => <span className="text-xs text-neutral-400">{formatDateTime(o.createdAt)}</span> },
    { key: 'total', header: 'Total', align: 'right', cell: (o) => <span className="tabular-nums text-neutral-100">{formatMoney(o.total)}</span> },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-500" aria-hidden />
          <Input
            ref={searchRef}
            type="search"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="# pedido, cliente, teléfono o plato"
            aria-label="Buscar pedidos"
            className="!mt-0 pl-9"
          />
        </div>
        <Select aria-label="Fechas" value={range} onChange={(e) => setFilter('range', e.target.value === '7d' ? '' : e.target.value)} className="!mt-0 w-auto">
          {RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
        <Select aria-label="Estado" value={statusKey} onChange={(e) => setFilter('status', e.target.value)} className="!mt-0 w-auto">
          {STATUS_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select aria-label="Canal" value={channel ?? ''} onChange={(e) => setFilter('channel', e.target.value)} className="!mt-0 w-auto">
          <option value="">Todos los canales</option>
          {(Object.keys(CHANNEL_CONFIG) as OrderChannel[]).map((c) => (
            <option key={c} value={c}>
              {CHANNEL_CONFIG[c].label}
            </option>
          ))}
        </Select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <DataTable
          columns={columns}
          rows={data?.orders}
          getRowId={(o) => o.id}
          onRowClick={onOpen}
          isLoading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          emptyState={<EmptyState icon={ClipboardList} title="Sin pedidos" description="Ningún pedido coincide con la búsqueda y los filtros." compact />}
        />
        {data?.hasMore && (
          <div className="flex justify-center py-3">
            <Button variant="secondary" size="sm" loading={isFetching} onClick={() => setPages((p) => p + 1)}>
              Cargar más
            </Button>
          </div>
        )}
      </div>
    </div>
  )
})
