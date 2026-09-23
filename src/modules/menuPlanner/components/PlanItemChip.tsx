import { formatMoney } from '@/shared/utils/format'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Clock, Flame, Tag } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import type { MenuPlanItem } from '../types'

/**
 * Fuente Y destino de drag a la vez (se puede soltar OTRO plato encima para
 * insertarlo en esa posición): useDraggable y useDroppable combinados a
 * mano sobre el mismo nodo — no usamos @dnd-kit/sortable, el mismo truco que
 * ya usa el Kanban de Cocina (useDraggable) más un useDroppable extra por
 * chip para poder resolver "insertar antes de este item" en useMenuPlannerDrag.
 */
export function PlanItemChip({ item, onOpen }: { item: MenuPlanItem; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: item.id,
    data: { kind: 'planItem', item },
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: item.id, data: { kind: 'planItem', item } })

  const effectivePrice = item.specialPrice ?? item.productPrice
  const hasPromo = item.specialPrice !== null && item.specialPrice !== item.productPrice
  const hasSchedule = Boolean(item.startTime || item.endTime)
  const hasScarcity = Boolean(item.unitLimit || item.whileSuppliesLast)

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen()
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
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className={`w-full cursor-grab touch-none select-none rounded-lg border px-2 py-1.5 text-left transition-colors active:cursor-grabbing ${
        isOver ? 'border-brasa-500/60 bg-brasa-500/10' : 'border-neutral-800/60 bg-neutral-900 hover:border-neutral-700/80'
      } ${item.isActive ? '' : 'opacity-50'} ${isDragging ? 'opacity-30' : ''}`}
    >
      <p className="truncate text-xs font-medium text-neutral-100">{item.productName}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-neutral-500">
        <span className={`tabular-nums ${hasPromo ? 'text-emerald-400' : ''}`}>{formatMoney(effectivePrice)}</span>
        {hasPromo && <Tag size={9} className="text-emerald-400" aria-label="Precio promocional" />}
        {hasSchedule && <Clock size={9} aria-label="Horario limitado" />}
        {hasScarcity && <Flame size={9} className="text-amber-500" aria-label="Disponibilidad limitada" />}
      </p>
    </div>
  )
}
