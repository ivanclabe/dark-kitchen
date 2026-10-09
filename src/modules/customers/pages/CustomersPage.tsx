import { useRecentPayments } from '@/modules/cartera/hooks/useReceivables'
import { NumberInput } from '@/shared/ui/NumberInput'
import { CurrencyInput } from '@/shared/ui/CurrencyInput'
import { Page } from '@/shared/ui/Page'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Button } from '@/shared/ui/Button'
import { Chip } from '@/shared/ui/Chip'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { Input, Select } from '@/shared/ui/FormField'
import { Switch } from '@/shared/ui/Switch'
import { KpiStrip, type Kpi } from '@/shared/ui/KpiStrip'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Pagination } from '@/shared/ui/Pagination'
import { typography } from '@/shared/ui/typography'
import { formatDateTime, formatMoney } from '@/shared/utils/format'
import clsx from 'clsx'
import { Plus, Search, SlidersHorizontal, Users, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CustomerFormModal } from '../components/CreateCustomerModal'
import { CustomerTable } from '../components/CustomerTable'
import { useCustomersPage, useCustomersSummary } from '../hooks/useCustomers'
import type { CustomerListQuery, CustomerSort, CustomerStatusFilter } from '../types'

const PAGE_SIZE = 25
const STATUSES: CustomerStatusFilter[] = ['all', 'active', 'inactive', 'debt', 'no_debt', 'overdue']
/** Wait after typing before searching (one query per pause, not per key). */
const SEARCH_DELAY_MS = 300

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return debounced
}

interface MoreFilters {
  createdFrom: string
  createdTo: string
  minOrders: string
  minBalance: string
  maxBalance: string
  /** ADR 0044: '' (both), 'person' or 'company'. */
  type: string
  /** ADR 0044: '1' = only preferred customers. */
  preferred: string
}
const NO_MORE: MoreFilters = { createdFrom: '', createdTo: '', minOrders: '', minBalance: '', maxBalance: '', type: '', preferred: '' }
const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? null : Number(s))

/**
 * Clientes — the customer management center (ADR 0028). Everything heavy
 * happens in the database: the search (name, phone, address), the filters,
 * the sort and the pages of 25. The browser never downloads every customer.
 */
export function CustomersPage() {
  const { can } = useActiveKitchen()
  const showDebt = can('receivables.view')
  const showOrders = can('orders.view') || showDebt
  // Status and search live in the URL (ADR 0030): Inicio, alerts and other screens link to a filtered list.
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(() => params.get('q') ?? '')
  const debouncedSearch = useDebounced(search, SEARCH_DELAY_MS)
  const status: CustomerStatusFilter = STATUSES.includes(params.get('status') as CustomerStatusFilter) ? (params.get('status') as CustomerStatusFilter) : 'all'
  const setStatus = (next: CustomerStatusFilter) => setUrl({ status: next === 'all' ? null : next })
  function setUrl(patch: Record<string, string | null>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v)
          else next.delete(k)
        }
        return next
      },
      { replace: true },
    )
  }
  useEffect(() => {
    if ((params.get('q') ?? '') !== debouncedSearch.trim()) setUrl({ q: debouncedSearch.trim() || null })
    // Only when the (debounced) search changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])
  const [sort, setSort] = useState<{ key: CustomerSort; dir: 'asc' | 'desc' } | null>(null)
  const [page, setPage] = useState(0)
  const [moreOpen, setMoreOpen] = useState(false)
  const [more, setMore] = useState<MoreFilters>(NO_MORE)
  const [createOpen, setCreateOpen] = useState(false)

  const query: CustomerListQuery = useMemo(
    () => ({
      search: debouncedSearch,
      status,
      sort: sort?.key ?? null,
      dir: sort?.dir ?? null,
      page,
      pageSize: PAGE_SIZE,
      createdFrom: more.createdFrom || null,
      createdTo: more.createdTo || null,
      minOrders: showOrders ? num(more.minOrders) : null,
      minBalance: showDebt ? num(more.minBalance) : null,
      maxBalance: showDebt ? num(more.maxBalance) : null,
      type: more.type === 'person' || more.type === 'company' ? more.type : null,
      preferredOnly: more.preferred === '1',
    }),
    [debouncedSearch, status, sort, page, more, showOrders, showDebt],
  )
  const list = useCustomersPage(query)
  const summary = useCustomersSummary()
  const { data: recentPayments } = useRecentPayments(6)

  // Any change of search or filters starts again at page 1.
  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v)
    setPage(0)
  }
  const onSort = (key: CustomerSort) => {
    const current = sort ?? (list.data ? { key: list.data.sort, dir: list.data.dir } : null)
    setSort({ key, dir: current?.key === key ? (current.dir === 'desc' ? 'asc' : 'desc') : key === 'name' ? 'asc' : 'desc' })
    setPage(0)
  }
  const activeSort = sort ?? (list.data ? { key: list.data.sort, dir: list.data.dir } : { key: 'name' as const, dir: 'asc' as const })

  const moreCount = Object.values(more).filter((v) => v.trim() !== '').length
  const filtered = debouncedSearch.trim() !== '' || status !== 'all' || moreCount > 0
  const clearAll = () => {
    setSearch('')
    setUrl({ status: null, q: null })
    setMore(NO_MORE)
    setPage(0)
  }

  const s = summary.data
  const kpis: Kpi[] = [
    { id: 'total', label: 'Total clientes', value: (s?.total ?? 0).toLocaleString('es-CO'), change: null, goodWhen: 'neutral', onSelect: () => resetPage(setStatus)('all') },
    // ADR 0044: the preferred ones (and how many companies), one click to see them.
    {
      id: 'preferred',
      label: 'Preferenciales',
      value: (s?.preferred ?? 0).toLocaleString('es-CO'),
      change: null,
      goodWhen: 'neutral',
      hint: s?.companies ? `${s.companies.toLocaleString('es-CO')} ${s.companies === 1 ? 'empresa' : 'empresas'} en total` : undefined,
      onSelect: () => {
        resetPage(setMore)({ ...more, preferred: '1' })
        setMoreOpen(true)
      },
    },
    ...(showOrders
      ? [{ id: 'active', label: 'Activos', value: (s?.active ?? 0).toLocaleString('es-CO'), change: null, goodWhen: 'neutral' as const, hint: 'Con un pedido en 90 días', onSelect: () => resetPage(setStatus)('active') }]
      : []),
    ...(showDebt
      ? [
          { id: 'debt', label: 'Con deuda', value: (s?.withDebt ?? 0).toLocaleString('es-CO'), change: null, goodWhen: 'neutral' as const, onSelect: () => resetPage(setStatus)('debt') },
          {
            id: 'balance',
            label: 'Saldo pendiente',
            value: formatMoney(s?.pendingBalance ?? 0),
            change: null,
            goodWhen: 'neutral' as const,
            hint: s?.overdueBalance ? `${formatMoney(s.overdueBalance)} vencido` : 'Nada vencido',
            onSelect: () => resetPage(setStatus)(s?.overdueBalance ? 'overdue' : 'debt'),
          },
        ]
      : []),
  ]

  const chips: { value: CustomerStatusFilter; label: string; show: boolean }[] = [
    { value: 'all', label: 'Todos', show: true },
    { value: 'active', label: 'Activos', show: showOrders },
    { value: 'inactive', label: 'Inactivos', show: showOrders },
    { value: 'debt', label: 'Con deuda', show: showDebt },
    { value: 'no_debt', label: 'Sin deuda', show: showDebt },
    { value: 'overdue', label: 'Vencidos', show: showDebt },
  ]

  const isEmptyBusiness = !filtered && (s?.total ?? list.data?.total) === 0
  const emptyState = isEmptyBusiness ? (
    <EmptyState
      icon={Users}
      title="No hay clientes todavía"
      description="Agrega tu primer cliente para comenzar. También se crean solos al registrar un pedido por WhatsApp."
      action={
        can('customers.create') ? (
          <Button variant="primary" size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>
            Nuevo cliente
          </Button>
        ) : undefined
      }
      compact
    />
  ) : (
    <EmptyState
      icon={Search}
      title="No encontramos clientes que coincidan con tu búsqueda"
      description="Prueba con otro nombre, teléfono, correo o dirección, o quita los filtros."
      action={
        <Button variant="secondary" size="sm" icon={X} onClick={clearAll}>
          Quitar filtros
        </Button>
      }
      compact
    />
  )

  return (
    <Page>
      <PageHeader help="customers"
        title="Clientes"
        icon={Users}
        description="Gestiona y consulta los clientes de tu negocio."
        actions={
          can('customers.create') && (
            <Button variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
              Nuevo cliente
            </Button>
          )
        }
      />

      <KpiStrip items={kpis} columns={kpis.length >= 5 ? 5 : 4} />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-64">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-neutral-500" aria-hidden />
            <Input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(0)
              }}
              placeholder="Buscar por nombre, NIT, teléfono, correo o dirección…"
              aria-label="Buscar clientes"
              className="!mt-0 pl-10"
            />
          </div>
          <Button variant={moreOpen || moreCount ? 'secondary' : 'ghost'} icon={SlidersHorizontal} onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}>
            Más filtros{moreCount ? ` (${moreCount})` : ''}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar clientes">
          {chips
            .filter((c) => c.show)
            .map((c) => (
              <Chip key={c.value} label={c.label} active={status === c.value} onClick={() => resetPage(setStatus)(c.value)} />
            ))}
          {filtered && (
            <button type="button" onClick={clearAll} className="ml-1 text-sm text-neutral-400 hover:text-neutral-200">
              Quitar filtros
            </button>
          )}
        </div>
        {moreOpen && (
          <div className="grid gap-3 rounded-2xl border border-neutral-800/60 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-neutral-400">
              Tipo
              <Select value={more.type} onChange={(e) => resetPage(setMore)({ ...more, type: e.target.value })} className="!mt-1">
                <option value="">Personas y empresas</option>
                <option value="person">Solo personas</option>
                <option value="company">Solo empresas</option>
              </Select>
            </label>
            <div className="flex items-end">
              <label className="flex h-10 items-center gap-2 text-sm text-neutral-300">
                <Switch checked={more.preferred === '1'} onChange={(on) => resetPage(setMore)({ ...more, preferred: on ? '1' : '' })} label="Solo preferenciales" />
                Solo preferenciales
              </label>
            </div>
            <label className="text-xs text-neutral-400">
              Registrado desde
              <Input type="date" value={more.createdFrom} onChange={(e) => resetPage(setMore)({ ...more, createdFrom: e.target.value })} />
            </label>
            <label className="text-xs text-neutral-400">
              Registrado hasta
              <Input type="date" value={more.createdTo} onChange={(e) => resetPage(setMore)({ ...more, createdTo: e.target.value })} />
            </label>
            {showOrders && (
              <label className="text-xs text-neutral-400">
                Pedidos mínimos
                <NumberInput value={num(more.minOrders)} onValueChange={(v) => resetPage(setMore)({ ...more, minOrders: v === null ? '' : String(v) })} min={0} className="!mt-1" />
              </label>
            )}
            {showDebt && (
              <>
                <label className="text-xs text-neutral-400">
                  Saldo desde
                  <CurrencyInput value={num(more.minBalance)} onValueChange={(v) => resetPage(setMore)({ ...more, minBalance: v === null ? '' : String(v) })} className="!mt-1" />
                </label>
                <label className="text-xs text-neutral-400">
                  Saldo hasta
                  <CurrencyInput value={num(more.maxBalance)} onValueChange={(v) => resetPage(setMore)({ ...more, maxBalance: v === null ? '' : String(v) })} className="!mt-1" />
                </label>
              </>
            )}
          </div>
        )}
      </div>

      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <div className={clsx('space-y-4 transition-opacity', list.isPlaceholderData && 'opacity-60')} aria-busy={list.isFetching}>
          <CustomerTable
            rows={list.data?.rows}
            showOrders={list.data?.orders ?? showOrders}
            showDebt={list.data?.debt ?? showDebt}
            sort={activeSort}
            onSort={onSort}
            isLoading={list.isLoading}
            emptyState={emptyState}
          />
          {list.data && <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPage={setPage} label="clientes" />}
        </div>
      )}

      {showDebt && !!recentPayments?.length && (
        <section className="space-y-3">
          <h2 className={typography.h3}>Últimos pagos</h2>
          <ul className="divide-y divide-neutral-800/60 rounded-2xl border border-neutral-800/60 px-4">
            {recentPayments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-medium text-neutral-200">{p.customerName}</span>
                  <span className="ml-2 text-neutral-500">
                    #{p.orderNumber} · {formatDateTime(p.createdAt)}
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums text-emerald-400">+{formatMoney(p.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CustomerFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </Page>
  )
}
