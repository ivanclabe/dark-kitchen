import { Button, IconButton } from '@/shared/ui/Button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, formatWeekRangeLabel, startOfWeek, todayStr } from '../lib/week'
import type { MenuPlanItem } from '../types'
import { DayCell } from './DayCell'

export function WeekCalendar({
  weekStart,
  onWeekStartChange,
  itemsByDate,
  selectedDate,
  onSelectDate,
  onOpenItem,
}: {
  weekStart: string
  onWeekStartChange: (weekStart: string) => void
  itemsByDate: Record<string, MenuPlanItem[]>
  selectedDate: string
  onSelectDate: (date: string) => void
  onOpenItem: (item: MenuPlanItem) => void
}) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <IconButton icon={ChevronLeft} variant="ghost" aria-label="Semana anterior" onClick={() => onWeekStartChange(addDays(weekStart, -7))} />
          <IconButton icon={ChevronRight} variant="ghost" aria-label="Semana siguiente" onClick={() => onWeekStartChange(addDays(weekStart, 7))} />
          <span className="ml-1 text-sm font-medium text-neutral-200">{formatWeekRangeLabel(weekStart)}</span>
        </div>
        <Button variant="secondary" size="sm" onClick={() => onWeekStartChange(startOfWeek(todayStr()))}>
          Hoy
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {dates.map((date) => (
          <DayCell
            key={date}
            date={date}
            items={itemsByDate[date] ?? []}
            selected={date === selectedDate}
            onSelect={() => onSelectDate(date)}
            onOpenItem={onOpenItem}
          />
        ))}
      </div>
    </div>
  )
}
