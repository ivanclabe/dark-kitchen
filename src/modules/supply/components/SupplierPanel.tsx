import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Button } from '@/shared/ui/Button'
import { Chip } from '@/shared/ui/Chip'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import clsx from 'clsx'
import { Plus, Search, Truck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSuppliers } from '../hooks/useSuppliers'
import type { Supplier } from '../types'

export function SupplierPanel({ selectedId, onSelect, onCreate }: { selectedId: string | null; onSelect: (supplier: Supplier) => void; onCreate: () => void }) {
  const { can } = useActiveKitchen()
  const { data: suppliers, isLoading, isError, error, refetch } = useSuppliers()
  const [query, setQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const inactiveCount = suppliers?.filter((s) => !s.active).length ?? 0

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (suppliers ?? []).filter((s) => {
      if (!showInactive && !s.active) return false
      if (!q) return true
      return s.name.toLowerCase().includes(q) || (s.phone?.toLowerCase().includes(q) ?? false) || (s.contactName?.toLowerCase().includes(q) ?? false)
    })
  }, [suppliers, query, showInactive])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-100">Proveedores</h2>
        {can('suppliers.edit') && (
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
          placeholder="Buscar por nombre, teléfono o contacto…"
          aria-label="Buscar proveedor"
          className="w-full min-w-0 rounded-lg border border-neutral-800 bg-neutral-900 py-2.5 pr-3 pl-9 text-sm text-neutral-100 transition-colors outline-none placeholder:text-neutral-600 hover:border-neutral-700 focus:border-brasa-500 focus:ring-2 focus:ring-brasa-500/15"
        />
      </div>

      {inactiveCount > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Chip label="Activos" active={!showInactive} onClick={() => setShowInactive(false)} />
          <Chip label="Incluir inactivos" count={inactiveCount} active={showInactive} onClick={() => setShowInactive(true)} />
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} compact />
        ) : isLoading ? (
          <LoadingState variant="block" label="Cargando proveedores…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Truck}
            title={query ? 'Sin resultados' : 'Todavía no hay proveedores'}
            description={query ? 'Ajusta la búsqueda.' : 'Registra el primero para poder cargar facturas.'}
            compact
          />
        ) : (
          filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s)}
              className={clsx(
                'w-full rounded-xl border px-3 py-2.5 text-left transition-colors',
                s.id === selectedId ? 'border-brasa-500/60 bg-brasa-500/5' : 'border-neutral-800/60 bg-neutral-900 hover:border-neutral-700/80',
                !s.active && 'opacity-50',
              )}
            >
              <p className="truncate text-sm font-medium text-neutral-100">{s.name}</p>
              <p className="truncate text-xs text-neutral-500">
                {s.phone ?? 'Sin teléfono'}
                {s.contactName ? ` · ${s.contactName}` : ''}
              </p>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
