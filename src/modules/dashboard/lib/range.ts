/**
 * The range of «Destacado» (ADR 0072): a preset moved back and forth with ← →, in the account's time zone.
 * Dates are local "YYYY-MM-DD" days; the database reads them in the same zone.
 */
export type RangePreset = 'today' | '7d' | '30d' | 'month'
export type Granularity = 'hour' | 'day'

export interface HomeRange {
  preset: RangePreset
  /** 0 = the current one; -1 = the previous one… */
  offset: number
}

export const PRESET_LABEL: Record<RangePreset, string> = {
  today: 'Hoy',
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  month: 'Este mes',
}

const toDate = (s: string) => new Date(`${s}T00:00:00Z`)
const toStr = (d: Date) => d.toISOString().slice(0, 10)
export const addDays = (s: string, n: number) => {
  const d = toDate(s)
  d.setUTCDate(d.getUTCDate() + n)
  return toStr(d)
}
export const daysBetween = (from: string, to: string) => Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000) + 1

/** Today in a time zone (the account's), as YYYY-MM-DD. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function resolveRange({ preset, offset }: HomeRange, today: string): { from: string; to: string } {
  if (preset === 'month') {
    const [y, m] = today.split('-').map(Number)
    const first = new Date(Date.UTC(y, m - 1 + offset, 1))
    const last = new Date(Date.UTC(y, m + offset, 0))
    const to = offset === 0 ? today : toStr(last)
    return { from: toStr(first), to }
  }
  const length = preset === 'today' ? 1 : preset === '7d' ? 7 : 30
  const to = addDays(today, offset * length)
  return { from: addDays(to, -(length - 1)), to }
}

/** By hour only up to 7 days (the database's limit); a longer range is always by day. */
export function allowedGranularities(from: string, to: string): Granularity[] {
  return daysBetween(from, to) <= 7 ? ['hour', 'day'] : ['day']
}

export function effectiveGranularity(wanted: Granularity, from: string, to: string): Granularity {
  return allowedGranularities(from, to).includes(wanted) ? wanted : 'day'
}

/** «UTC-5» for a zone, at the given moment. */
export function utcOffsetLabel(timeZone: string, at: Date = new Date()): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')
  return part?.value.replace('GMT', 'UTC') || 'UTC'
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const shortDay = (s: string) => {
  const [, m, d] = s.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

/** «14 oct», «14 oct, 13:00». */
export function formatBucket(t: string, granularity: Granularity): string {
  const [date, time] = t.split('T')
  return granularity === 'hour' ? `${shortDay(date)}, ${time}` : shortDay(date)
}

export function formatRange(from: string, to: string): string {
  return from === to ? shortDay(from) : `${shortDay(from)} – ${shortDay(to)}`
}
