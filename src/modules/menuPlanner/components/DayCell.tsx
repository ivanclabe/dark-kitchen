import { useDroppable } from '@dnd-kit/core'
import clsx from 'clsx'
import { Check, Plus } from 'lucide-react'
import { formatDayHeader, todayStr } from '../lib/week'
import type { MenuPlanItem } from '../types'
import { PlanItemChip } from './PlanItemChip'

export function DayCell({
  date,
  items,
  selected,
  onSelect,
  onOpenItem,
  onRemoveItem,
  blocked = false,
  dragging = false,
  compact = false,
  muted = false,
}: {
  date: string
  items: MenuPlanItem[]
  selected: boolean
  onSelect: () => void
  onOpenItem: (item: MenuPlanItem) => void
  onRemoveItem?: (item: MenuPlanItem) => void
  /** While dragging: this day already has the dish, so it does not accept it. */
  blocked?: boolean
  /** A dish is being dragged (days show they are drop targets). */
  dragging?: boolean
  compact?: boolean
  muted?: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}`, data: { kind: 'day', date }, disabled: blocked })
  const { weekday, day, month } = formatDayHeader(date)
  const isToday = date === todayStr()
  const sorted = [...items].sort((a, b) => a.displayOrder - b.displayOrder)

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'relative flex min-h-0 flex-col rounded-xl border transition-[border-color,background-color,opacity] duration-150',
        blocked
          ? 'border-neutral-800/60 bg-neutral-900/20 opacity-60'
          : isOver
            ? 'border-brasa-500/70 bg-brasa-500/10 ring-1 ring-brasa-500/40 ring-inset'
            : selected
              ? 'border-brasa-500/60 bg-neutral-900/40 ring-1 ring-brasa-500/30 ring-inset'
              : dragging
                ? 'border-dashed border-neutral-700 bg-neutral-900/40'
                : 'border-neutral-800/60 bg-neutral-900/40',
        muted && 'opacity-45',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={clsx(
          'flex shrink-0 items-center justify-between gap-1 rounded-t-xl px-2 py-1.5 text-left transition-colors hover:bg-neutral-800/40',
          isToday ? 'text-brasa-400' : 'text-neutral-300',
        )}
      >
        <span className="text-[11px] font-semibold tracking-wide uppercase">
          {weekday} <span className="text-neutral-500">{day}</span>
          {compact && <span className="ml-0.5 text-neutral-600 normal-case">{month}</span>}
        </span>
        {blocked ? (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-neutral-800 px-1.5 text-[10px] text-neutral-400">
            <Check size={9} aria-hidden /> Ya está
          </span>
        ) : (
          items.length > 0 && <span className="rounded-full bg-neutral-800 px-1.5 text-[10px] tabular-nums text-neutral-400">{items.length}</span>
        )}
      </button>

      <div className={clsx('min-h-0 flex-1 space-y-1 overflow-y-auto px-1.5 pb-1.5', compact ? 'max-h-28' : 'max-h-[440px]')}>
        {sorted.length === 0 ? (
          compact ? null : (
            <p
              className={clsx(
                'flex items-center justify-center gap-1 rounded-lg border border-dashed px-2 py-3 text-center text-[11px] transition-colors',
                isOver ? 'border-brasa-500/50 text-brasa-300' : 'border-neutral-800 text-neutral-600',
              )}
            >
              <Plus size={11} /> {isOver ? 'Suelta para agregar' : 'Arrastra un plato aquí'}
            </p>
          )
        ) : (
          sorted.map((item) => (
            <PlanItemChip
              key={item.id}
              item={item}
              compact={compact}
              dropDisabled={blocked}
              onOpen={() => onOpenItem(item)}
              onRemove={onRemoveItem ? () => onRemoveItem(item) : undefined}
            />
          ))
        )}
      </div>
    </div>
  )
}

