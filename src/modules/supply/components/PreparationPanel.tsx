import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Button } from '@/shared/ui/Button'
import { Chip } from '@/shared/ui/Chip'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { formatQuantity } from '@/shared/units/conversion'
import { formatMoney } from '@/shared/utils/format'
import clsx from 'clsx'
import { AlertTriangle, CookingPot, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { usePreparations } from '../hooks/usePreparations'
import type { Preparation } from '../types'

type Filter = 'TODAS' | 'POR_PREPARAR' | 'SIN_RECETA' | 'INACTIVAS'

/** ADR 0057: the account's preparations (sub-recipes) — what each yields, costs and has in stock. */
export function PreparationPanel({
  selectedId,
  onSelect,
  onCreate,
}: {
  selectedId: string | null
  onSelect: (preparation: Preparation) => void
  onCreate: () => void
}) {
  const { can } = useActiveKitchen()
  const { data: preparations, isLoading, isError, error, refetch } = usePreparations()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('TODAS')

  const toPrepare = preparations?.filter((p) => p.active && p.recipe && p.belowMin).length ?? 0
  const withoutRecipe = preparations?.filter((p) => p.active && !p.recipe).length ?? 0
  const inactive = preparations?.filter((p) => !p.active).length ?? 0

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (preparations ?? []).filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.code.toLowerCase().includes(q)) return false
      if (filter === 'POR_PREPARAR') return p.active && p.recipe && p.belowMin
      if (filter === 'SIN_RECETA') return p.active && !p.recipe
      if (filter === 'INACTIVAS') return !p.active
      return p.active
    })
  }, [preparations, query, filter])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-100">Preparaciones</h2>
        {can('recipes.edit') && can('inventory.create') && (
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
          placeholder="Buscar por nombre o código…"
          aria-label="Buscar preparación"
          className="w-full min-w-0 rounded-lg border border-neutral-800 bg-neutral-900 py-2.5 pr-3 pl-9 text-sm text-neutral-100 transition-colors outline-none placeholder:text-neutral-500 hover:border-neutral-700 focus:border-focus focus:ring-2 focus:ring-focus/25"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Chip label="Todas" count={preparations?.filter((p) => p.active).length ?? 0} active={filter === 'TODAS'} onClick={() => setFilter('TODAS')} />
        {toPrepare > 0 && <Chip label="Por preparar" count={toPrepare} active={filter === 'POR_PREPARAR'} onClick={() => setFilter('POR_PREPARAR')} />}
        {withoutRecipe > 0 && <Chip label="Sin receta" count={withoutRecipe} active={filter === 'SIN_RECETA'} onClick={() => setFilter('SIN_RECETA')} />}
        {inactive > 0 && <Chip label="Inactivas" count={inactive} active={filter === 'INACTIVAS'} onClick={() => setFilter('INACTIVAS')} />}
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} compact />
        ) : isLoading ? (
          <LoadingState variant="block" label="Cargando preparaciones…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={CookingPot}
            mood={query || filter !== 'TODAS' ? 'noResults' : 'empty'}
            title={query || filter !== 'TODAS' ? 'Sin resultados' : 'Todavía no hay preparaciones'}
            description={
              query || filter !== 'TODAS'
                ? 'Ajusta la búsqueda o el filtro.'
                : 'Una salsa de la casa, una ensalada base, un fondo: prepáralos por lote y úsalos en tus platos.'
            }
            compact
          />
        ) : (
          filtered.map((p) => {
            const selected = p.id === selectedId
            const portionCost = p.portion ? p.portion * p.avgCost : null
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p)}
                className={clsx(
                  'w-full rounded-xl border px-3 py-2.5 text-left transition-colors',
                  selected ? 'border-brasa-500/60 bg-brasa-500/5' : 'border-neutral-800/60 bg-neutral-900 hover:border-neutral-700/80',
                  !p.active && 'opacity-50',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium text-neutral-100">{p.name}</p>
                  {p.active && p.recipe && p.belowMin && <AlertTriangle size={13} className="shrink-0 text-amber-400" aria-label="Por preparar" />}
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                  <span className="tabular-nums">{formatQuantity(p.stockAvailable, p.baseUnitCode)}</span>
                  <span className="text-neutral-700">·</span>
                  {p.recipe ? (
                    <span className="tabular-nums">rinde {formatQuantity(p.recipe.yieldQuantity, p.baseUnitCode)}</span>
                  ) : (
                    <span className="text-amber-400/80">sin receta</span>
                  )}
                  <span className="text-neutral-700">·</span>
                  <span className="tabular-nums">
                    {portionCost !== null ? `${formatMoney(portionCost)} / porción` : `${formatMoney(p.avgCost, { decimals: 'auto' })} / ${p.baseUnitCode}`}
                  </span>
                  {p.usedIn > 0 && <span className="text-neutral-500">· en {p.usedIn} {p.usedIn === 1 ? 'receta' : 'recetas'}</span>}
                </p>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
