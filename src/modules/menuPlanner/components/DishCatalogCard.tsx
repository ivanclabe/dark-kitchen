import { ProductThumb } from '@/modules/products/components/ProductImage'
import type { Product } from '@/modules/products/types'
import { IconButton } from '@/shared/ui/Button'
import { Tooltip } from '@/shared/ui/Tooltip'
import { formatMoney } from '@/shared/utils/format'
import { useDraggable } from '@dnd-kit/core'
import clsx from 'clsx'
import { Check, GripVertical, Pencil, Plus } from 'lucide-react'
import type { MenuPlanDragData } from '../hooks/useMenuPlannerDrag'
import { formatDayHeader } from '../lib/week'

/**
 * Drag source towards the calendar (catalog:<productId>). The card never
 * leaves its place (ADR 0018): it shows its photo, one dot per day of the
 * visible week (filled where the dish already is) and a short "Agregado"
 * flash when it lands on a day. The edit and quick-add buttons stop the
 * pointer so a click never starts a drag.
 */
export function DishCatalogCard({
  product,
  weekDates,
  datesWithDish,
  selectedDate,
  justAdded,
  onQuickAdd,
  onEdit,
  canEdit,
  canPlan,
}: {
  product: Product
  /** The 7 dates of the visible week. */
  weekDates: string[]
  /** Dates (of the loaded range) where the dish already is. */
  datesWithDish: ReadonlySet<string>
  selectedDate: string
  /** It was just added somewhere (brief highlight). */
  justAdded: boolean
  onQuickAdd: () => void
  onEdit: () => void
  /** products.edit: edit the dish. */
  canEdit: boolean
  /** menus.edit: drag it or add it to the calendar. */
  canPlan: boolean
}) {
  const data: MenuPlanDragData = {
    kind: 'catalog',
    productId: product.id,
    productName: product.name,
    product: {
      productName: product.name,
      productPrice: product.price,
      productCategory: product.categoryName,
      productActive: product.active,
      productImagePath: product.imagePath,
    },
  }
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `catalog:${product.id}`, data, disabled: !product.active || !canPlan })
  const onSelectedDate = datesWithDish.has(selectedDate)
  const weekCount = weekDates.filter((d) => datesWithDish.has(d)).length

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={clsx(
        'group flex items-center gap-2.5 rounded-xl border bg-neutral-900 px-2 py-2 transition-[border-color,background-color,opacity] duration-300 select-none',
        justAdded ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-neutral-800/60',
        !product.active ? 'opacity-50' : canPlan ? 'cursor-grab touch-none hover:border-neutral-700/80 active:cursor-grabbing' : '',
        isDragging && 'opacity-40',
      )}
    >
      <GripVertical size={13} className="-mr-1 shrink-0 text-neutral-700" aria-hidden />
      <ProductThumb name={product.name} path={product.imagePath} toneSeed={product.categoryName} size="md" />
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
        <div className="mt-1 flex items-center gap-1.5">
          <span className="flex items-center gap-0.5" aria-label={weekCount ? `En ${weekCount} ${weekCount === 1 ? 'día' : 'días'} de esta semana` : 'No está en esta semana'}>
            {weekDates.map((date) => {
              const on = datesWithDish.has(date)
              return (
                <span
                  key={date}
                  title={`${formatDayHeader(date).weekday}${on ? ': en el menú' : ''}`}
                  className={clsx('size-1.5 rounded-full transition-colors', on ? 'bg-brasa-400' : 'bg-neutral-800', date === selectedDate && 'ring-1 ring-neutral-500 ring-offset-1 ring-offset-neutral-900')}
                />
              )
            })}
          </span>
          {justAdded ? (
            <span className="text-[10px] font-medium text-emerald-400">Agregado</span>
          ) : (
            weekCount > 0 && <span className="text-[10px] text-neutral-500">{weekCount === 7 ? 'Toda la semana' : `${weekCount} ${weekCount === 1 ? 'día' : 'días'}`}</span>
          )}
        </div>
      </div>
      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        {canEdit && (
          <Tooltip label="Editar plato" side="top-end">
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
          <Tooltip label={onSelectedDate ? 'Ya está en el día seleccionado' : 'Agregar al día seleccionado'} side="top-end">
            <IconButton
              icon={onSelectedDate ? Check : Plus}
              variant="ghost"
              size="sm"
              aria-label={`Agregar ${product.name} al día seleccionado`}
              disabled={onSelectedDate || !product.active}
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
