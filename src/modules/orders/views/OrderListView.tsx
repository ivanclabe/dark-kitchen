import { Button } from '@/shared/ui/Button'
import { Chip } from '@/shared/ui/Chip'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Input, Select } from '@/shared/ui/FormField'
import { formatDateTime, formatMoney } from '@/shared/utils/format'
import { ClipboardList, Search } from 'lucide-react'
import { forwardRef, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useOrderSearchPages } from '../hooks/useOrders'
import { OrderStatusBadge } from '../lib/orderStatus'
import { PaymentBadge } from '../components/PaymentCard'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { CHANNEL_CONFIG, ORDER_STATUS_CONFIG } from '../lib/orderVisuals'
import type { Order, OrderChannel, OrderStatus } from '../types'

type Range = 'today' | '7d' | '30d' | 'all'

const RANGES: { value: Range; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Últimos 30 días' },
  { value: 'all', label: 'Todo' },
]

const FLOW: OrderStatus[] = ['NUEVO', 'CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'DESPACHADO']

/** One tap per status, with the board's words (ADR 0031): also the target of the figures and of Inicio. */
const STATUS_FILTERS: { value: string; label: string; statuses?: OrderStatus[] }[] = [
  { value: '', label: 'Todos' },
  { value: 'open', label: 'Abiertos', statuses: FLOW },
  ...FLOW.map((status) => ({ value: status, label: ORDER_STATUS_CONFIG[status].label, statuses: [status] })),
  { value: 'delivered', label: 'Entregados', statuses: ['ENTREGADO'] },
  { value: 'cancelled', label: 'Cancelados', statuses: ['CANCELADO'] },
]

const PAYMENT_FILTERS: { value: '' | 'paid' | 'pending'; label: string }[] = [
  { value: '', label: 'Todos los pagos' },
  { value: 'paid', label: 'Pagados' },
  { value: 'pending', label: 'Por cobrar' },
]

const PAGE = 50

const EMPTY_BY_RANGE: Record<Range, string> = {
  today: 'Todavía no hay pedidos de hoy.',
  '7d': 'No hubo pedidos en los últimos 7 días. Cambia las fechas para ver los anteriores.',
  '30d': 'No hubo pedidos en los últimos 30 días. Cambia las fechas para ver los anteriores.',
  all: 'Todavía no hay pedidos en esta cuenta.',
}

function rangeStart(range: Range): string | null {
  if (range === 'all') return null
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (range === '7d') d.setDate(d.getDate() - 6)
  if (range === '30d') d.setDate(d.getDate() - 29)
  return d.toISOString()
}

/**
 * Operación → Lista (ADR 0020, ADR 0031): every order, also delivered and
 * cancelled, searched in the database by number, customer, phone or dish.
 * Filters live in the URL; «Cargar más» asks for the next page only.
 */
export const OrderListView = forwardRef<HTMLInputElement, { onOpen: (order: Order) => void }>(function OrderListView({ onOpen }, searchRef) {
  const [params, setParams] = useSearchParams()
  const range = (RANGES.find((r) => r.value === params.get('range'))?.value ?? '7d') as Range
  const statusKey = params.get('status') ?? ''
  const channel = (params.get('channel') as OrderChannel | null) ?? null
  // ADR 0031: the payment filter, only for whoever sees the receivables.
  const { can } = useActiveKitchen()
  const seesPayments = can('receivables.view')
  const payment = seesPayments ? (PAYMENT_FILTERS.find((p) => p.value && p.value === params.get('payment'))?.value || null) : null
  const [typed, setTyped] = useState(params.get('q') ?? '')
  const [search, setSearch] = useState(typed)

  // Typing waits a moment before searching; the term is kept in the URL.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(typed.trim())
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
      payment,
      limit: PAGE,
    }),
    [search, range, statusKey, channel, payment],
  )
  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, error, refetch } = useOrderSearchPages(filters)
  const orders = useMemo(() => data?.pages.flatMap((p) => p.orders), [data])
  // Only the dates narrow the list: it is not «no match», there were no orders in that range.
  const filtered = !!search || !!statusKey || !!channel || !!payment

  // ADR 0065: fixed widths, so a long name truncates instead of pushing Estado/Pago/Total out of view.
  // On a phone: #, the customer (with the status and payment under the name) and the total.
  const columns: DataTableColumn<Order>[] = [
    { key: 'number', header: '#', width: 'w-16 sm:w-20', cell: (o) => <span className="font-semibold tabular-nums text-neutral-100">#{o.orderNumber}</span> },
    {
      key: 'customer',
      header: 'Cliente',
      cell: (o) => (
        <span className="block min-w-0">
          <span className="block truncate text-neutral-100">{o.customerName}</span>
          <span className="block truncate text-xs text-neutral-500">{o.items.map((i) => `${i.quantity}× ${i.productName}`).join(', ') || 'Sin platos'}</span>
          <span className="mt-1.5 flex flex-wrap gap-1 sm:hidden">
            <OrderStatusBadge status={o.status} size="sm" />
            {seesPayments && <PaymentBadge order={o} size="sm" />}
          </span>
        </span>
      ),
    },
    { key: 'status', header: 'Estado', width: 'w-36', hideBelow: 'sm', cell: (o) => <OrderStatusBadge status={o.status} size="sm" /> },
    ...(seesPayments
      ? ([{ key: 'payment', header: 'Pago', width: 'w-40', hideBelow: 'md', cell: (o) => <PaymentBadge order={o} size="sm" /> }] satisfies DataTableColumn<Order>[])
      : []),
    {
      key: 'channel',
      header: 'Canal',
      width: 'w-32',
      hideBelow: 'xl',
      cell: (o) => {
        const c = CHANNEL_CONFIG[o.channel]
        return (
          <span className="inline-flex items-center gap-1 text-xs text-neutral-400">
            <c.icon size={12} aria-hidden /> {c.label}
          </span>
        )
      },
    },
    { key: 'date', header: 'Fecha', width: 'w-44', hideBelow: 'lg', cell: (o) => <span className="text-xs text-neutral-400">{formatDateTime(o.createdAt)}</span> },
    { key: 'total', header: 'Total', width: 'w-28 sm:w-32', align: 'right', cell: (o) => <span className="tabular-nums text-neutral-100">{formatMoney(o.total)}</span> },
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
        <Select aria-label="Canal" value={channel ?? ''} onChange={(e) => setFilter('channel', e.target.value)} className="!mt-0 w-auto">
          <option value="">Todos los canales</option>
          {(Object.keys(CHANNEL_CONFIG) as OrderChannel[]).map((c) => (
            <option key={c} value={c}>
              {CHANNEL_CONFIG[c].label}
            </option>
          ))}
        </Select>
      </div>
      {/* Phone: each filter group is one row that slides sideways (they took five rows before the first order). */}
      <div role="group" aria-label="Estado" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] sm:flex-wrap [&>*]:shrink-0">
        {STATUS_FILTERS.map((f) => (
          <Chip key={f.value} label={f.label} active={statusKey === f.value} onClick={() => setFilter('status', f.value)} />
        ))}
      </div>
      {seesPayments && (
        <div role="group" aria-label="Pago" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] sm:flex-wrap [&>*]:shrink-0">
          {PAYMENT_FILTERS.map((f) => (
            <Chip key={f.value} label={f.label} active={(payment ?? '') === f.value} onClick={() => setFilter('payment', f.value)} />
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <DataTable
          columns={columns}
          rows={orders}
          getRowId={(o) => o.id}
          layout="fixed"
          onRowClick={onOpen}
          isLoading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          emptyState={
            filtered ? (
              <EmptyState icon={ClipboardList} mood="noResults" title="Sin pedidos" description="Ningún pedido coincide con la búsqueda y los filtros." compact />
            ) : (
              <EmptyState icon={ClipboardList} title="Sin pedidos" description={EMPTY_BY_RANGE[range]} compact />
            )
          }
        />
        {hasNextPage && (
          <div className="flex justify-center py-3">
            <Button variant="secondary" size="sm" loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>
              Cargar más
            </Button>
          </div>
        )}
      </div>
    </div>
  )
})
