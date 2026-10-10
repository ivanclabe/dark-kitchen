import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { KitchenLink } from '@/shared/kitchen/KitchenLink'
import { Button } from '@/shared/ui/Button'
import { Menu } from '@/shared/ui/Menu'
import { Chip } from '@/shared/ui/Chip'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { formatDate, formatMoney } from '@/shared/utils/format'
import clsx from 'clsx'
import { ChevronDown, FileUp, PenLine, Plus, ScanText, Search, ShoppingCart, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useDiscardImport, usePendingImports } from '../hooks/useInvoiceImport'
import { PURCHASES_PAGE, usePurchases } from '../hooks/usePurchases'
import { invoiceFileProblem } from '../lib/invoiceFile'
import { PurchaseStatusBadge } from '../lib/purchaseStatus'
import type { Purchase, PurchaseStatus } from '../types'

type Filter = 'TODAS' | PurchaseStatus

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'TODAS', label: 'Todas' },
  { value: 'BORRADOR', label: 'Borradores' },
  { value: 'CONFIRMADA', label: 'Confirmadas' },
]

export function PurchasePanel({
  selectedId,
  onSelect,
  onCreate,
  onImport,
}: {
  selectedId: string | null
  onSelect: (purchase: Purchase) => void
  onCreate: () => void
  /** ADR 0049: import from an invoice (with the file when it was dropped on the list). */
  onImport: (file?: File) => void
}) {
  const { can, feature } = useActiveKitchen()
  // ADR 0049: reading invoices needs the AI feature and permission to upload invoices.
  const canImport = can('purchasing.create') && can('invoices.upload') && (feature('invoice_import')?.usable ?? false)
  const { data: pending } = usePendingImports(can('purchasing.view'))
  const discard = useDiscardImport()
  const [dragging, setDragging] = useState(false)
  const [dropProblem, setDropProblem] = useState<string | null>(null)
  const [limit, setLimit] = useState(PURCHASES_PAGE)
  const { data, isLoading, isFetching, isError, error, refetch } = usePurchases(limit)
  const purchases = data?.rows
  const hasMore = data?.hasMore ?? false
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('TODAS')

  const counts = useMemo(() => {
    const map = new Map<Filter, number>()
    map.set('TODAS', purchases?.length ?? 0)
    for (const p of purchases ?? []) map.set(p.status, (map.get(p.status) ?? 0) + 1)
    return map
  }, [purchases])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (purchases ?? []).filter((p) => {
      if (filter !== 'TODAS' && p.status !== filter) return false
      if (!q) return true
      return p.invoiceNumber.toLowerCase().includes(q) || p.supplierName.toLowerCase().includes(q)
    })
  }, [purchases, query, filter])

  return (
    <div
      className={clsx('relative flex h-full min-h-0 flex-col gap-3', dragging && 'rounded-xl ring-2 ring-brasa-500/60')}
      onDragOver={(e) => {
        if (!canImport || !e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(e) => {
        if (!canImport) return
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (!file) return
        const why = invoiceFileProblem(file)
        setDropProblem(why)
        if (!why) onImport(file)
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-neutral-950/90 text-sm text-neutral-100">
          <FileUp size={22} className="text-brasa-400" aria-hidden /> Suelta la factura para importarla
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-100">Compras</h2>
        {can('purchasing.create') &&
          (canImport ? (
            <Menu
              trigger={(props) => (
                <Button {...props} variant="secondary" size="sm" icon={Plus} iconRight={ChevronDown}>
                  Nueva
                </Button>
              )}
              items={[
                { label: 'Manual', icon: PenLine, onSelect: onCreate },
                { label: 'Importar desde factura', icon: ScanText, onSelect: () => onImport() },
              ]}
            />
          ) : (
            <Button variant="secondary" size="sm" icon={Plus} onClick={onCreate}>
              Nueva
            </Button>
          ))}
      </div>
      {dropProblem && (
        <p role="alert" className="text-xs text-red-400">
          {dropProblem}
        </p>
      )}

      {/* ADR 0049: invoices read but not saved yet. */}
      {pending && pending.length > 0 && (
        <div className="space-y-1.5 rounded-xl border border-sky-500/30 bg-sky-500/5 p-2.5">
          <p className="px-0.5 text-xs font-medium text-sky-300">Por revisar ({pending.length})</p>
          {pending.map((imp) => (
            <div key={imp.id} className="flex items-center gap-2 rounded-lg bg-neutral-900/60 px-2.5 py-2">
              <KitchenLink to={`/supply/compras/importar/${imp.id}`} className="min-w-0 flex-1">
                <p className="truncate text-sm text-neutral-100">{imp.extraction?.supplier.name ?? imp.fileName}</p>
                <p className="text-xs text-neutral-500">
                  {imp.status === 'ERROR' ? 'No se pudo leer' : imp.status === 'LEYENDO' ? 'Leyendo…' : `Factura ${imp.extraction?.invoice.number ?? 'sin número'}`} ·{' '}
                  {formatDate(imp.createdAt)}
                </p>
              </KitchenLink>
              {can('purchasing.create') && (
                <button
                  type="button"
                  onClick={() => discard.mutate(imp.id)}
                  className="rounded-md p-1 text-neutral-500 hover:bg-neutral-800 hover:text-red-400"
                  aria-label={`Descartar ${imp.fileName}`}
                  title="Descartar"
                >
                  <X size={14} aria-hidden />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="relative">
        <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-500" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar factura o proveedor…"
          aria-label="Buscar compra"
          className="w-full min-w-0 rounded-lg border border-neutral-800 bg-neutral-900 py-2.5 pr-3 pl-9 text-sm text-neutral-100 transition-colors outline-none placeholder:text-neutral-600 hover:border-neutral-700 focus:border-brasa-500 focus:ring-2 focus:ring-brasa-500/15"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Chip key={f.value} label={f.label} count={hasMore ? undefined : (counts.get(f.value) ?? 0)} active={filter === f.value} onClick={() => setFilter(f.value)} />
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} compact />
        ) : isLoading ? (
          <LoadingState variant="block" label="Cargando compras…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title={query || filter !== 'TODAS' ? 'Sin resultados' : 'Todavía no hay compras'}
            description={query || filter !== 'TODAS' ? 'Ajusta la búsqueda o el filtro.' : 'Crea un borrador para registrar la primera factura.'}
            compact
          />
        ) : (
          filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p)}
              className={clsx(
                'w-full rounded-xl border px-3 py-2.5 text-left transition-colors',
                p.id === selectedId ? 'border-brasa-500/60 bg-brasa-500/5' : 'border-neutral-800/60 bg-neutral-900 hover:border-neutral-700/80',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium text-neutral-100">{p.supplierName}</p>
                <PurchaseStatusBadge status={p.status} />
              </div>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500">
                <span className="tabular-nums">#{p.invoiceNumber}</span>
                <span className="text-neutral-700">·</span>
                <span>{formatDate(p.invoiceDate)}</span>
                <span className="ml-auto font-semibold tabular-nums text-neutral-300">{formatMoney(p.total)}</span>
              </p>
            </button>
          ))
        )}
        {hasMore && !isError && (
          <div className="space-y-2 pt-1 text-center">
            <p className="text-xs text-neutral-500">
              Mostrando las {purchases?.length ?? 0} compras más recientes. La búsqueda y los filtros solo aplican a las cargadas.
            </p>
            <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + PURCHASES_PAGE)} loading={isFetching}>
              Cargar más
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
