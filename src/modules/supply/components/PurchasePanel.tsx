import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Button } from '@/shared/ui/Button'
import { Chip } from '@/shared/ui/Chip'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { formatDate, formatMoney } from '@/shared/utils/format'
import clsx from 'clsx'
import { Plus, Search, ShoppingCart } from 'lucide-react'
import { useMemo, useState } from 'react'
import { usePurchases } from '../hooks/usePurchases'
import { PurchaseStatusBadge } from '../lib/purchaseStatus'
import type { Purchase, PurchaseStatus } from '../types'

type Filter = 'TODAS' | PurchaseStatus

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'TODAS', label: 'Todas' },
  { value: 'BORRADOR', label: 'Borradores' },
  { value: 'CONFIRMADA', label: 'Confirmadas' },
]

export function PurchasePanel({ selectedId, onSelect, onCreate }: { selectedId: string | null; onSelect: (purchase: Purchase) => void; onCreate: () => void }) {
  const { can } = useActiveKitchen()
  const { data: purchases, isLoading, isError, error, refetch } = usePurchases()
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
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-100">Compras</h2>
        {can('purchasing.create') && (
          <Button variant="secondary" size="sm" icon={Plus} onClick={onCreate}>
            Nueva
          </Button>
        )}
      </div>

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
          <Chip key={f.value} label={f.label} count={counts.get(f.value) ?? 0} active={filter === f.value} onClick={() => setFilter(f.value)} />
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
      </div>
    </div>
  )
}
