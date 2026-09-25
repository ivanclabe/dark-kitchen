import { supabase } from '@/shared/lib/supabase'
import { WEEK_DAYS, type DayHours, type HoursException, type KitchenSchedule, type WeekDay } from '../lib/schedule'

/** Postgres devuelve `time` como "HH:MM:SS"; la app trabaja en "HH:MM" (lo que usa <input type="time">). */
function toHHMM(value: string | null): string | null {
  return value ? value.slice(0, 5) : null
}

function hoursColumns(hours: DayHours) {
  return {
    is_open: hours.isOpen,
    opens_at: hours.isOpen ? hours.opensAt : null,
    closes_at: hours.isOpen ? hours.closesAt : null,
  }
}

/** Plantilla semanal + excepciones por fecha. Ver migración dk_kitchen_hours. */
export async function getKitchenSchedule(): Promise<KitchenSchedule> {
  const [weeklyRes, exceptionsRes] = await Promise.all([
    supabase.from('dk_kitchen_hours').select('day_of_week, is_open, opens_at, closes_at'),
    supabase.from('dk_kitchen_hour_exceptions').select('exception_date, is_open, opens_at, closes_at, note').order('exception_date'),
  ])
  if (weeklyRes.error) throw weeklyRes.error
  if (exceptionsRes.error) throw exceptionsRes.error

  const weekly: KitchenSchedule['weekly'] = {}
  for (const row of weeklyRes.data) {
    weekly[row.day_of_week] = { isOpen: row.is_open, opensAt: toHHMM(row.opens_at), closesAt: toHHMM(row.closes_at) }
  }
  const exceptions: HoursException[] = exceptionsRes.data.map((row) => ({
    date: row.exception_date,
    isOpen: row.is_open,
    opensAt: toHHMM(row.opens_at),
    closesAt: toHHMM(row.closes_at),
    note: row.note,
  }))
  return { weekly, exceptions }
}

/** Guarda los 7 días de una vez: la plantilla siempre queda completa. */
export async function saveWeeklyHours(weekly: Record<WeekDay, DayHours>): Promise<void> {
  const rows = WEEK_DAYS.map((day) => ({ day_of_week: day, ...hoursColumns(weekly[day]) }))
  const { error } = await supabase.from('dk_kitchen_hours').upsert(rows, { onConflict: 'kitchen_id,day_of_week' })
  if (error) throw error
}

export async function saveHoursException(exception: HoursException): Promise<void> {
  const { error } = await supabase
    .from('dk_kitchen_hour_exceptions')
    .upsert({ exception_date: exception.date, ...hoursColumns(exception), note: exception.note?.trim() || null }, { onConflict: 'kitchen_id,exception_date' })
  if (error) throw error
}

/** Quitar la excepción = ese día vuelve a seguir el horario semanal. */
export async function deleteHoursException(date: string): Promise<void> {
  const { error } = await supabase.from('dk_kitchen_hour_exceptions').delete().eq('exception_date', date)
  if (error) throw error
}
