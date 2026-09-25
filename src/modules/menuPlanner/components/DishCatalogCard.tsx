import type { Product } from '@/modules/products/types'
import { IconButton } from '@/shared/ui/Button'
import { Tooltip } from '@/shared/ui/Tooltip'
import { formatMoney } from '@/shared/utils/format'
import { useDraggable } from '@dnd-kit/core'
import { Check, GripVertical, Pencil, Plus } from 'lucide-react'

/**
 * Fuente de arrastre hacia el calendario (catalog:<productId>). El resto de
 * la tarjeta (editar / agregar rápido al día seleccionado) usa
 * onPointerDown+onClick con stopPropagation — mismo patrón que los botones
 * de acción del Kanban de Cocina, para que un click no dispare un drag.
 */
export function DishCatalogCard({
  product,
  alreadyOnSelectedDate,
  onQuickAdd,
  onEdit,
  canEdit,
  canPlan,
}: {
  product: Product
  alreadyOnSelectedDate: boolean
  onQuickAdd: () => void
  onEdit: () => void
  /** products.edit: editar el plato. */
  canEdit: boolean
  /** menus.edit: arrastrarlo o agregarlo al calendario. */
  canPlan: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `catalog:${product.id}`,
    data: { kind: 'catalog', productId: product.id, productName: product.name },
    disabled: !product.active || !canPlan,
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`group flex items-center gap-1.5 rounded-xl border border-neutral-800/60 bg-neutral-900 px-2.5 py-2 transition-colors select-none ${
        !product.active ? 'opacity-50' : canPlan ? 'cursor-grab touch-none hover:border-neutral-700/80 active:cursor-grabbing' : ''
      } ${isDragging ? 'opacity-30' : ''}`}
    >
      <GripVertical size={14} className="shrink-0 text-neutral-700" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-neutral-100">{product.name}</p>
        <p className="flex items-center gap-1 truncate text-xs text-neutral-500">
          <span className="shrink-0 tabular-nums">{formatMoney(product.price)}</span>
          {product.categoryName && <span className="truncate">· {product.categoryName}</span>}
          {!product.activeRecipeVersion && <span className="shrink-0 text-amber-500">· Sin receta</span>}
          {product.masterProductId && (
            <span className="shrink-0 text-brasa-400" title="Plato del menú maestro: nombre y receta los define el maestro">
              · Maestro
            </span>
          )}
        </p>
      </div>
      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {canEdit && (
          <Tooltip label="Editar plato" side="top">
            <IconButton
              icon={Pencil}
              variant="ghost"
              size="sm"
              aria-label={`Editar ${product.name}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
            />
          </Tooltip>
        )}
        {canPlan && (
          <Tooltip label={alreadyOnSelectedDate ? 'Ya está en el día seleccionado' : 'Agregar al día seleccionado'} side="top">
            <IconButton
              icon={alreadyOnSelectedDate ? Check : Plus}
              variant="ghost"
              size="sm"
              aria-label={`Agregar ${product.name} al día seleccionado`}
              disabled={alreadyOnSelectedDate || !product.active}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onQuickAdd()
              }}
            />
          </Tooltip>
        )}
      </span>
    </div>
  )
}
