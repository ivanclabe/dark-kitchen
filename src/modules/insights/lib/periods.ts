/**
 * Periods of Insights (ADR 0027, 2.3). Dates are local "YYYY-MM-DD" days; the
 * database reads them in the account's time zone. The comparison is the same
 * stretch one unit back: today → yesterday, this week → the same days of last
 * week, this month → the same days of last month, last month → the month
 * before, custom → the same length right before.
 */
export type PeriodPreset = 'today' | 'week' | 'month' | 'lastMonth' | 'quarter' | 'year' | 'custom'

export interface DateRange {
  from: string
  to: string
}

export const PRESET_LABEL: Record<PeriodPreset, string> = {
  today: 'Hoy',
  week: 'Esta semana',
  month: 'Este mes',
  lastMonth: 'Mes anterior',
  quarter: 'Este trimestre',
  year: 'Este año',
  custom: 'Personalizado',
}

const toDate = (s: string) => new Date(`${s}T00:00:00Z`)
const toStr = (d: Date) => d.toISOString().slice(0, 10)
export const addDays = (s: string, n: number) => {
  const d = toDate(s)
  d.setUTCDate(d.getUTCDate() + n)
  return toStr(d)
}
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
/** Same day `n` months away, clamped to that month's last day (31 Mar − 1 month = 28/29 Feb). */
function addMonths(s: string, n: number): string {
  const d = toDate(s)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + n
  const target = new Date(Date.UTC(y, m, 1))
  const day = Math.min(d.getUTCDate(), daysInMonth(target.getUTCFullYear(), target.getUTCMonth()))
  return toStr(new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day)))
}
export const daysBetween = (from: string, to: string) => Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000) + 1

export function presetRange(preset: Exclude<PeriodPreset, 'custom'>, today: string): DateRange {
  const d = toDate(today)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'week': {
      const isoDow = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
      return { from: addDays(today, 1 - isoDow), to: today }
    }
    case 'month':
      return { from: toStr(new Date(Date.UTC(y, m, 1))), to: today }
    case 'lastMonth':
      return { from: toStr(new Date(Date.UTC(y, m - 1, 1))), to: toStr(new Date(Date.UTC(y, m, 0))) }
    case 'quarter':
      return { from: toStr(new Date(Date.UTC(y, m - (m % 3), 1))), to: today }
    case 'year':
      return { from: toStr(new Date(Date.UTC(y, 0, 1))), to: today }
  }
}

export function compareRange(preset: PeriodPreset, range: DateRange): DateRange {
  switch (preset) {
    case 'today':
      return { from: addDays(range.from, -1), to: addDays(range.to, -1) }
    case 'week':
      return { from: addDays(range.from, -7), to: addDays(range.to, -7) }
    case 'month':
      return { from: addMonths(range.from, -1), to: addMonths(range.to, -1) }
    case 'lastMonth': {
      const from = addMonths(range.from, -1)
      return { from, to: addDays(range.from, -1) }
    }
    case 'quarter':
      return { from: addMonths(range.from, -3), to: addMonths(range.to, -3) }
    case 'year':
      return { from: addMonths(range.from, -12), to: addMonths(range.to, -12) }
    case 'custom': {
      const length = daysBetween(range.from, range.to)
      return { from: addDays(range.from, -length), to: addDays(range.from, -1) }
    }
  }
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "5 sep", "1–30 sep", "28 ago – 3 sep", "1 dic 2025 – 5 ene 2026". */
export function rangeLabel(range: DateRange): string {
  const a = toDate(range.from)
  const b = toDate(range.to)
  const day = (d: Date) => d.getUTCDate()
  const month = (d: Date) => MONTHS[d.getUTCMonth()]
  if (range.from === range.to) return `${day(a)} ${month(a)}`
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${day(a)} ${month(a)} ${a.getUTCFullYear()} – ${day(b)} ${month(b)} ${b.getUTCFullYear()}`
  if (a.getUTCMonth() === b.getUTCMonth()) return `${day(a)}–${day(b)} ${month(b)}`
  return `${day(a)} ${month(a)} – ${day(b)} ${month(b)}`
}
