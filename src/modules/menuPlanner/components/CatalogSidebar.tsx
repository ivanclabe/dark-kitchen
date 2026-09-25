import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { useProductCategories, useProducts } from '@/modules/products/hooks/useProducts'
import type { Product } from '@/modules/products/types'
import { Button } from '@/shared/ui/Button'
import { Chip } from '@/shared/ui/Chip'
import { EmptyState } from '@/shared/ui/EmptyState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Plus, Search, UtensilsCrossed } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DishCatalogCard } from './DishCatalogCard'

/** Catálogo lateral: buscar/filtrar platos, arrastrarlos al calendario, crear/editar. */
export function CatalogSidebar({
  selectedDateProductIds,
  onQuickAdd,
  onEditDish,
  onCreateDish,
}: {
  selectedDateProductIds: Set<string>
  onQuickAdd: (product: Product) => void
  onEditDish: (product: Product) => void
  onCreateDish: () => void
}) {
  const { can } = useActiveKitchen()
  const { data: products, isLoading } = useProducts()
  const { data: categories } = useProductCategories()
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<string | 'all'>('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (products ?? []).filter((p) => {
      if (categoryId !== 'all' && p.categoryId !== categoryId) return false
      if (!q) return true
      return p.name.toLowerCase().includes(q) || (p.code?.toLowerCase().includes(q) ?? false)
    })
  }, [products, query, categoryId])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-100">Catálogo de platos</h2>
        {can('products.create') && (
          <Button variant="secondary" size="sm" icon={Plus} onClick={onCreateDish}>
            Nuevo
          </Button>
        )}
      </div>

      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 mt-[3px] -translate-y-1/2 text-neutral-500" aria-hidden />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar plato…"
          aria-label="Buscar plato"
          className="w-full min-w-0 rounded-lg border border-neutral-800 bg-neutral-900 py-2.5 pl-9 pr-3 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 hover:border-neutral-700 focus:border-brasa-500 focus:ring-2 focus:ring-brasa-500/15"
        />
      </div>

      {categories && categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Chip label="Todas" active={categoryId === 'all'} onClick={() => setCategoryId('all')} />
          {categories.map((c) => (
            <Chip key={c.id} label={c.name} active={categoryId === c.id} onClick={() => setCategoryId(c.id)} />
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
        {isLoading ? (
          <LoadingState variant="block" label="Cargando platos…" />
        ) : filtered.length === 0 ? (
          <EmptyState icon={UtensilsCrossed} title="Sin platos" description="Ajusta la búsqueda o agrega un plato nuevo." compact />
        ) : (
          filtered.map((product) => (
            <DishCatalogCard
              key={product.id}
              product={product}
              alreadyOnSelectedDate={selectedDateProductIds.has(product.id)}
              onQuickAdd={() => onQuickAdd(product)}
              onEdit={() => onEditDish(product)}
              canEdit={can('products.edit')}
              canPlan={can('menus.edit')}
            />
          ))
        )}
      </div>
    </div>
  )
}
