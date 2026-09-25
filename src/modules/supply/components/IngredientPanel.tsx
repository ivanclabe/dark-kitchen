import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Button } from '@/shared/ui/Button'
import { Chip } from '@/shared/ui/Chip'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { formatMoney } from '@/shared/utils/format'
import clsx from 'clsx'
import { AlertTriangle, Boxes, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useCategories, useIngredients } from '../hooks/useIngredients'
import { isLowStock, stockRatio } from '../lib/stock'
import type { Ingredient } from '../types'

/** Barra de banda mínimo→máximo: roja bajo el mínimo, ámbar cerca, verde sana. */
export function StockBar({ ingredient }: { ingredient: Ingredient }) {
  const ratio = stockRatio(ingredient)
  const low = isLowStock(ingredient)
  const near = !low && ratio < 0.35
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800" role="presentation">
      <div
        className={clsx('h-full rounded-full transition-all', low ? 'bg-red-500' : near ? 'bg-amber-500' : 'bg-emerald-500')}
        style={{ width: `${Math.max(ratio * 100, low ? 6 : 8)}%` }}
      />
    </div>
  )
}

type Filter = 'TODOS' | 'BAJO_MINIMO' | 'INACTIVOS' | 'SIN_CATEGORIA' | string

export function IngredientPanel({
  selectedId,
  onSelect,
  onCreate,
}: {
  selectedId: string | null
  onSelect: (ingredient: Ingredient) => void
  onCreate: () => void
}) {
  const { can } = useActiveKitchen()
  const { data: ingredients, isLoading, isError, error, refetch } = useIngredients()
  const { data: categories } = useCategories()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('TODOS')

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const ing of ingredients ?? []) {
      const key = ing.categoryId ?? 'SIN_CATEGORIA'
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [ingredients])

  const lowStockCount = ingredients?.filter((i) => i.active && isLowStock(i)).length ?? 0
  const inactiveCount = ingredients?.filter((i) => !i.active).length ?? 0

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (ingredients ?? []).filter((ing) => {
      if (q && !ing.name.toLowerCase().includes(q) && !ing.code.toLowerCase().includes(q)) return false
      if (filter === 'TODOS') return ing.active
      if (filter === 'BAJO_MINIMO') return ing.active && isLowStock(ing)
      if (filter === 'INACTIVOS') return !ing.active
      if (filter === 'SIN_CATEGORIA') return ing.active && !ing.categoryId
      return ing.active && ing.categoryId === filter
    })
  }, [ingredients, query, filter])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-100">Insumos</h2>
        {can('inventory.create') && (
          <Button variant="secondary" size="sm" icon={Plus} onClick={onCreate}>
            Nuevo
          </Button>
        )}
      </div>

      <div className="relative">
        <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-500" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o código…"
          aria-label="Buscar insumo"
          className="w-full min-w-0 rounded-lg border border-neutral-800 bg-neutral-900 py-2.5 pr-3 pl-9 text-sm text-neutral-100 transition-colors outline-none placeholder:text-neutral-600 hover:border-neutral-700 focus:border-brasa-500 focus:ring-2 focus:ring-brasa-500/15"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Chip label="Todos" count={ingredients?.filter((i) => i.active).length ?? 0} active={filter === 'TODOS'} onClick={() => setFilter('TODOS')} />
        {lowStockCount > 0 && <Chip label="Bajo mínimo" count={lowStockCount} active={filter === 'BAJO_MINIMO'} onClick={() => setFilter('BAJO_MINIMO')} />}
        {categories?.map((c) => (
          <Chip key={c.id} label={c.name} count={categoryCounts.get(c.id) ?? 0} active={filter === c.id} onClick={() => setFilter(c.id)} />
        ))}
        {(categoryCounts.get('SIN_CATEGORIA') ?? 0) > 0 && (
          <Chip label="Sin categoría" count={categoryCounts.get('SIN_CATEGORIA') ?? 0} active={filter === 'SIN_CATEGORIA'} onClick={() => setFilter('SIN_CATEGORIA')} />
        )}
        {inactiveCount > 0 && <Chip label="Inactivos" count={inactiveCount} active={filter === 'INACTIVOS'} onClick={() => setFilter('INACTIVOS')} />}
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} compact />
        ) : isLoading ? (
          <LoadingState variant="block" label="Cargando insumos…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title={query || filter !== 'TODOS' ? 'Sin resultados' : 'Todavía no hay insumos'}
            description={query || filter !== 'TODOS' ? 'Ajusta la búsqueda o el filtro.' : 'Registra el primero para empezar a controlar el stock.'}
            compact
          />
        ) : (
          filtered.map((ing) => {
            const low = isLowStock(ing)
            const selected = ing.id === selectedId
            return (
              <button
                key={ing.id}
                type="button"
                onClick={() => onSelect(ing)}
                className={clsx(
                  'w-full rounded-xl border px-3 py-2.5 text-left transition-colors',
                  selected ? 'border-brasa-500/60 bg-brasa-500/5' : 'border-neutral-800/60 bg-neutral-900 hover:border-neutral-700/80',
                  !ing.active && 'opacity-50',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium text-neutral-100">{ing.name}</p>
                  {low && ing.active && <AlertTriangle size={13} className="shrink-0 text-red-400" aria-label="Bajo mínimo" />}
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500">
                  <span className="tabular-nums">
                    {ing.stockAvailable} {ing.baseUnitCode}
                  </span>
                  <span className="text-neutral-700">·</span>
                  <span className="tabular-nums">{formatMoney(ing.avgCost)}</span>
                  {ing.categoryName && <span className="truncate text-neutral-600">· {ing.categoryName}</span>}
                </p>
                <div className="mt-2">
                  <StockBar ingredient={ing} />
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
