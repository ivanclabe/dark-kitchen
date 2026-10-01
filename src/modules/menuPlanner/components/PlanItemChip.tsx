import { ProductThumb } from '@/modules/products/components/ProductImage'
import { formatMoney } from '@/shared/utils/format'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import clsx from 'clsx'
import { Clock, Flame, Tag, X } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import type { MenuPlanItem } from '../types'

/**
 * Source AND target of a drag (another dish dropped on it is inserted at its
 * place): useDraggable and useDroppable on the same node, like the kitchen
 * Kanban. Shows the dish photo (ADR 0018) and a "×" to take it off the day.
 */
export function PlanItemChip({
  item,
  onOpen,
  onRemove,
  compact = false,
  dropDisabled = false,
}: {
  item: MenuPlanItem
  onOpen: () => void
  onRemove?: () => void
  /** Month view: no photo, tighter. */
  compact?: boolean
  dropDisabled?: boolean
}) {
  const optimistic = item.id.startsWith('optimistic:')
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: item.id,
    data: { kind: 'planItem', item },
    disabled: optimistic,
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: item.id, data: { kind: 'planItem', item }, disabled: dropDisabled || optimistic })

  const effectivePrice = item.specialPrice ?? item.productPrice
  const hasPromo = item.specialPrice !== null && item.specialPrice !== item.productPrice
  const hasSchedule = Boolean(item.startTime || item.endTime)
  const hasScarcity = Boolean(item.unitLimit || item.whileSuppliesLast)

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen()
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && onRemove) {
      e.preventDefault()
      onRemove()
    }
  }

  return (
    <div
      ref={(el) => {
        setDragRef(el)
        setDropRef(el)
      }}
      {...listeners}
      {...attributes}
      onClick={optimistic ? undefined : onOpen}
      onKeyDown={handleKeyDown}
      className={clsx(
        'group relative flex w-full cursor-grab touch-none items-center gap-1.5 rounded-lg border px-1.5 py-1.5 text-left transition-colors select-none active:cursor-grabbing',
        isOver ? 'border-brasa-500/60 bg-brasa-500/10' : 'border-neutral-800/60 bg-neutral-900 hover:border-neutral-700/80',
        !item.isActive && 'opacity-50',
        isDragging && 'opacity-30',
        optimistic && 'animate-pulse',
      )}
    >
      {!compact && <ProductThumb name={item.productName} path={item.productImagePath} toneSeed={item.productCategory} size="xs" />}
      <div className="min-w-0 flex-1">
        <p className="truncate pr-4 text-xs font-medium text-neutral-100">{item.productName}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-neutral-500">
          <span className={clsx('tabular-nums', hasPromo && 'text-emerald-400')}>{formatMoney(effectivePrice)}</span>
          {hasPromo && <Tag size={9} className="text-emerald-400" aria-label="Precio promocional" />}
          {hasSchedule && <Clock size={9} aria-label="Horario limitado" />}
          {hasScarcity && <Flame size={9} className="text-amber-500" aria-label="Disponibilidad limitada" />}
        </p>
      </div>
      {onRemove && !optimistic && (
        <button
          type="button"
          aria-label={`Quitar ${item.productName} de este día`}
          title="Quitar del día"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="absolute top-1 right-1 rounded-md p-0.5 text-neutral-500 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-neutral-800 hover:text-neutral-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}
