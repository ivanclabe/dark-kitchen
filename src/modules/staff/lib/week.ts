import { toDateInput } from '@/shared/utils/format'
import type { Shift } from '../types'

/** Monday 00:00 (device time) of the week of `date`. */
export function startOfWeek(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const offset = (d.getDay() + 6) % 7 // Monday = 0
  d.setDate(d.getDate() - offset)
  return d
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

/** "HH:MM" of an ISO date, in device time. */
export function toTimeInput(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Start and end of a shift from a day and two "HH:MM". An end at or before
 * the start is the next day (overnight shift: 22:00 → 06:00).
 */
export function shiftRange(day: string, start: string, end: string): { startsAt: Date; endsAt: Date } {
  const startsAt = new Date(`${day}T${start}:00`)
  let endsAt = new Date(`${day}T${end}:00`)
  if (endsAt <= startsAt) endsAt = addDays(endsAt, 1)
  return { startsAt, endsAt }
}

const HOUR = 3_600_000

/** Planned hours: length minus the break. */
export function plannedHours(shift: Pick<Shift, 'startsAt' | 'endsAt' | 'breakMinutes'>): number {
  return Math.max(0, (new Date(shift.endsAt).getTime() - new Date(shift.startsAt).getTime()) / HOUR - shift.breakMinutes / 60)
}

/** Worked hours: from clock in to clock out (or `now` if still open), minus the break. null = never clocked in. */
export function workedHours(shift: Pick<Shift, 'clockInAt' | 'clockOutAt' | 'breakMinutes'>, now = Date.now()): number | null {
  if (!shift.clockInAt) return null
  const end = shift.clockOutAt ? new Date(shift.clockOutAt).getTime() : now
  return Math.max(0, (end - new Date(shift.clockInAt).getTime()) / HOUR - shift.breakMinutes / 60)
}

/** "7:00–15:00", "+1" marks a shift that ends the next day. */
export function formatShiftRange(shift: Pick<Shift, 'startsAt' | 'endsAt'>): string {
  const start = new Date(shift.startsAt)
  const end = new Date(shift.endsAt)
  const overnight = toDateInput(end) !== toDateInput(start) && !(end.getHours() === 0 && end.getMinutes() === 0)
  return `${toTimeInput(shift.startsAt)}–${toTimeInput(shift.endsAt)}${overnight ? ' (+1)' : ''}`
}

export function formatHours(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (m === 60) return `${h + 1} h`
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

/** userId → day index (0 = Monday) → shifts that START that day. */
export function groupByPersonDay(shifts: Shift[], weekStart: Date): Map<string, Shift[][]> {
  const map = new Map<string, Shift[][]>()
  const days = weekDays(weekStart).map(toDateInput)
  for (const shift of shifts) {
    const index = days.indexOf(toDateInput(new Date(shift.startsAt)))
    if (index === -1) continue
    const row = map.get(shift.userId) ?? Array.from({ length: 7 }, () => [] as Shift[])
    row[index].push(shift)
    map.set(shift.userId, row)
  }
  return map
}

/** Late = planned start passed by more than `graceMinutes` and no clock-in. */
export function isLate(shift: Pick<Shift, 'startsAt' | 'clockInAt'>, now = Date.now(), graceMinutes = 10): boolean {
  return !shift.clockInAt && now - new Date(shift.startsAt).getTime() > graceMinutes * 60_000
}
