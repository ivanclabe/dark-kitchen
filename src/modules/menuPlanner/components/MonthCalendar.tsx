import { Button, IconButton } from '@/shared/ui/Button'
import { toDateInput } from '@/shared/utils/format'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatMonthLabel, isSameMonth, monthGridDates, todayStr } from '../lib/week'
import type { MenuPlanItem } from '../types'
import { DayCell } from './DayCell'

/** Vista de resumen/navegación — para editar en detalle, un click en un día abre la semana correspondiente (arrastrar sigue funcionando también acá). */
export function MonthCalendar({
  monthAnchor,
  onMonthAnchorChange,
  itemsByDate,
  onOpenWeek,
  onOpenItem,
}: {
  monthAnchor: string
  onMonthAnchorChange: (date: string) => void
  itemsByDate: Record<string, MenuPlanItem[]>
  onOpenWeek: (date: string) => void
  onOpenItem: (item: MenuPlanItem) => void
}) {
  const dates = monthGridDates(monthAnchor)

  function shiftMonth(delta: number) {
    const d = new Date(`${monthAnchor}T00:00:00`)
    d.setMonth(d.getMonth() + delta, 1)
    onMonthAnchorChange(toDateInput(d))
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <IconButton icon={ChevronLeft} variant="ghost" aria-label="Mes anterior" onClick={() => shiftMonth(-1)} />
          <IconButton icon={ChevronRight} variant="ghost" aria-label="Mes siguiente" onClick={() => shiftMonth(1)} />
          <span className="ml-1 text-sm font-medium text-neutral-200">{formatMonthLabel(monthAnchor)}</span>
        </div>
        <Button variant="secondary" size="sm" onClick={() => onMonthAnchorChange(todayStr())}>
          Hoy
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-7 gap-1.5">
        {dates.map((date) => (
          <DayCell
            key={date}
            date={date}
            items={itemsByDate[date] ?? []}
            selected={false}
            onSelect={() => onOpenWeek(date)}
            onOpenItem={onOpenItem}
            compact
            muted={!isSameMonth(date, monthAnchor)}
          />
        ))}
      </div>
    </div>
  )
}
