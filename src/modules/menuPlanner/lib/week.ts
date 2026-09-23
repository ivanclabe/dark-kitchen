import { toDateInput, todayStr } from '@/shared/utils/format'

export { todayStr }

function toDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`)
}

export function addDays(dateStr: string, days: number): string {
  const d = toDate(dateStr)
  d.setDate(d.getDate() + days)
  return toDateInput(d)
}

/** Lunes de la semana que contiene `dateStr` — semana siempre empieza en lunes. */
export function startOfWeek(dateStr: string): string {
  const d = toDate(dateStr)
  const day = d.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diffToMonday)
  return toDateInput(d)
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

const WEEKDAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export function formatDayHeader(dateStr: string): { weekday: string; day: number; month: string } {
  const d = toDate(dateStr)
  return {
    weekday: WEEKDAY_SHORT[d.getDay()] ?? '',
    day: d.getDate(),
    month: d.toLocaleDateString('es-CO', { month: 'short' }),
  }
}

export function formatWeekRangeLabel(weekStart: string): string {
  const end = addDays(weekStart, 6)
  const s = toDate(weekStart)
  const e = toDate(end)
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
  const startLabel = s.toLocaleDateString('es-CO', { day: 'numeric', month: sameMonth ? undefined : 'short' })
  const endLabel = e.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${startLabel} – ${endLabel}`
}

/** Grilla de 6 semanas (42 días) que cubre el mes de `dateStr` completo, alineada a lunes. */
export function monthGridDates(dateStr: string): string[] {
  const firstOfMonth = toDateInput(new Date(toDate(dateStr).getFullYear(), toDate(dateStr).getMonth(), 1))
  const start = startOfWeek(firstOfMonth)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

export function isSameMonth(dateStr: string, refStr: string): boolean {
  const d = toDate(dateStr)
  const r = toDate(refStr)
  return d.getFullYear() === r.getFullYear() && d.getMonth() === r.getMonth()
}

export function formatMonthLabel(dateStr: string): string {
  const label = toDate(dateStr).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}
