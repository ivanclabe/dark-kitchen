import { toDateInput } from '@/shared/utils/format'

/** Mismo enum que la base (dk_day_of_week) y que ya usa el resto de la app. */
export const WEEK_DAYS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'] as const
export type WeekDay = (typeof WEEK_DAYS)[number]

export const WEEK_DAY_LABEL: Record<WeekDay, string> = {
  LUNES: 'Lunes',
  MARTES: 'Martes',
  MIERCOLES: 'Miércoles',
  JUEVES: 'Jueves',
  VIERNES: 'Viernes',
  SABADO: 'Sábado',
  DOMINGO: 'Domingo',
}

/** Horario de un día. `opensAt`/`closesAt` en "HH:MM"; si closesAt <= opensAt, cierra al día siguiente. */
export interface DayHours {
  isOpen: boolean
  opensAt: string | null
  closesAt: string | null
}

export interface HoursException extends DayHours {
  date: string
  note: string | null
}

export interface KitchenSchedule {
  weekly: Partial<Record<WeekDay, DayHours>>
  exceptions: HoursException[]
}

export type KitchenStatus =
  | { state: 'unconfigured' }
  | { state: 'open'; closesAt: Date; note: string | null }
  | { state: 'closed'; opensAt: Date | null; note: string | null }

/** Busca la próxima apertura hasta 2 semanas adelante — más allá es "sin próxima apertura". */
const LOOKAHEAD_DAYS = 14

export function weekDayOf(date: Date): WeekDay {
  // getDay(): 0 = domingo. WEEK_DAYS arranca en lunes (ISO), como la base.
  return WEEK_DAYS[(date.getDay() + 6) % 7]
}

export function isScheduleConfigured(schedule: KitchenSchedule): boolean {
  return Object.keys(schedule.weekly).length > 0 || schedule.exceptions.length > 0
}

/**
 * Horario efectivo de una fecha: la excepción de ese día si existe, si no la
 * plantilla semanal. Un día sin fila en la plantilla cuenta como cerrado.
 */
export function hoursForDate(schedule: KitchenSchedule, date: string): DayHours & { note: string | null; isException: boolean } {
  const exception = schedule.exceptions.find((e) => e.date === date)
  if (exception) return { ...exception, isException: true }
  const weekly = schedule.weekly[weekDayOf(new Date(`${date}T00:00:00`))]
  return { isOpen: weekly?.isOpen ?? false, opensAt: weekly?.opensAt ?? null, closesAt: weekly?.closesAt ?? null, note: null, isException: false }
}

/** Validación de un día abierto: null si está bien. */
export function dayHoursError(hours: DayHours): string | null {
  if (!hours.isOpen) return null
  if (!hours.opensAt || !hours.closesAt) return 'Indica apertura y cierre'
  if (hours.opensAt === hours.closesAt) return 'La apertura y el cierre no pueden ser iguales'
  return null
}

/** El turno cruza la medianoche (ej. 18:00 → 02:00). */
export function isOvernight(hours: DayHours): boolean {
  return !!hours.opensAt && !!hours.closesAt && hours.closesAt < hours.opensAt
}

function atTime(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm.slice(0, 5)}:00`)
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  return toDateInput(d)
}

/** Intervalo [inicio, fin) de un día abierto; el fin pasa al día siguiente si el turno cruza la medianoche. */
function intervalFor(schedule: KitchenSchedule, date: string): { start: Date; end: Date; note: string | null } | null {
  const hours = hoursForDate(schedule, date)
  if (!hours.isOpen || !hours.opensAt || !hours.closesAt) return null
  const start = atTime(date, hours.opensAt)
  const end = atTime(hours.closesAt <= hours.opensAt ? addDays(date, 1) : date, hours.closesAt)
  return { start, end, note: hours.note }
}

/**
 * ¿Está abierta la cocina en `now`? Revisa el turno de ayer (puede seguir
 * abierto pasada la medianoche) y el de hoy; si está cerrada, busca la
 * próxima apertura. Sin horario configurado no afirma nada.
 */
export function kitchenStatus(schedule: KitchenSchedule, now: Date): KitchenStatus {
  if (!isScheduleConfigured(schedule)) return { state: 'unconfigured' }

  const today = toDateInput(now)
  for (const date of [addDays(today, -1), today]) {
    const interval = intervalFor(schedule, date)
    if (interval && interval.start <= now && now < interval.end) return { state: 'open', closesAt: interval.end, note: interval.note }
  }

  for (let i = 0; i <= LOOKAHEAD_DAYS; i++) {
    const interval = intervalFor(schedule, addDays(today, i))
    if (interval && interval.start > now) return { state: 'closed', opensAt: interval.start, note: hoursForDate(schedule, today).note }
  }
  return { state: 'closed', opensAt: null, note: hoursForDate(schedule, today).note }
}

function hhmm(date: Date): string {
  return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** "hoy", "mañana", o el nombre del día — relativo a `now`. */
function relativeDay(target: Date, now: Date): string {
  const days = Math.round((new Date(toDateInput(target)).getTime() - new Date(toDateInput(now)).getTime()) / 86_400_000)
  if (days === 0) return 'hoy'
  if (days === 1) return 'mañana'
  return `el ${WEEK_DAY_LABEL[weekDayOf(target)].toLowerCase()}`
}

/** Texto corto para el indicador bajo el título: "Abierta · cierra a las 22:00" / "Cerrada · abre mañana a las 11:00". */
export function describeStatus(status: KitchenStatus, now: Date): string {
  switch (status.state) {
    case 'unconfigured':
      return 'Sin horario configurado'
    case 'open': {
      const when = relativeDay(status.closesAt, now) === 'hoy' ? '' : ` ${relativeDay(status.closesAt, now)}`
      return `Abierta · cierra${when} a las ${hhmm(status.closesAt)}`
    }
    case 'closed':
      return status.opensAt ? `Cerrada · abre ${relativeDay(status.opensAt, now)} a las ${hhmm(status.opensAt)}` : 'Cerrada · sin próxima apertura'
  }
}
