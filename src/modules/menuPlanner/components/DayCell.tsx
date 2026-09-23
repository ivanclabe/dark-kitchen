import { useDroppable } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { formatDayHeader, todayStr } from '../lib/week'
import type { MenuPlanItem } from '../types'
import { PlanItemChip } from './PlanItemChip'

export function DayCell({
  date,
  items,
  selected,
  onSelect,
  onOpenItem,
  compact = false,
  muted = false,
}: {
  date: string
  items: MenuPlanItem[]
  selected: boolean
  onSelect: () => void
  onOpenItem: (item: MenuPlanItem) => void
  compact?: boolean
  muted?: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}`, data: { kind: 'day', date } })
  const { weekday, day, month } = formatDayHeader(date)
  const isToday = date === todayStr()
  const sorted = [...items].sort((a, b) => a.displayOrder - b.displayOrder)

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-0 flex-col rounded-xl border transition-colors ${
        selected ? 'border-brasa-500/60 ring-1 ring-inset ring-brasa-500/30' : 'border-neutral-800/60'
      } ${isOver ? 'bg-brasa-500/10' : 'bg-neutral-900/40'} ${muted ? 'opacity-45' : ''}`}
    >
      <button
        type="button"
        onClick={onSelect}
        className={`flex shrink-0 items-center justify-between gap-1 rounded-t-xl px-2 py-1.5 text-left transition-colors hover:bg-neutral-800/40 ${
          isToday ? 'text-brasa-400' : 'text-neutral-300'
        }`}
      >
        <span className="text-[11px] font-semibold tracking-wide uppercase">
          {weekday} <span className="text-neutral-500">{day}</span>
          {compact && <span className="ml-0.5 text-neutral-600 normal-case">{month}</span>}
        </span>
        {items.length > 0 && <span className="rounded-full bg-neutral-800 px-1.5 text-[10px] tabular-nums text-neutral-400">{items.length}</span>}
      </button>

      <div className={`min-h-0 flex-1 space-y-1 overflow-y-auto px-1.5 pb-1.5 ${compact ? 'max-h-28' : 'max-h-[440px]'}`}>
        {sorted.length === 0 ? (
          compact ? null : (
            <p className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-neutral-800 px-2 py-3 text-center text-[11px] text-neutral-600">
              <Plus size={11} /> Arrastra un plato aquí
            </p>
          )
        ) : (
          sorted.map((item) => <PlanItemChip key={item.id} item={item} onOpen={() => onOpenItem(item)} />)
        )}
      </div>
    </div>
  )
}
