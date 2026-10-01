import { supabase } from '@/shared/lib/supabase'
import type { OnShift, Shift, ShiftInput, StaffMember, StaffRole } from '../types'

const SELECT = 'id, user_id, role_id, starts_at, ends_at, break_minutes, notes, status, unplanned, clock_in_at, clock_out_at'

type Row = {
  id: string
  user_id: string
  role_id: string
  starts_at: string
  ends_at: string
  break_minutes: number
  notes: string | null
  status: Shift['status']
  unplanned: boolean
  clock_in_at: string | null
  clock_out_at: string | null
}

function mapShift(row: Row): Shift {
  return {
    id: row.id,
    userId: row.user_id,
    roleId: row.role_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    breakMinutes: row.break_minutes,
    notes: row.notes,
    status: row.status,
    unplanned: row.unplanned,
    clockInAt: row.clock_in_at,
    clockOutAt: row.clock_out_at,
  }
}

/** Database messages that reach the person, in plain words. */
export function shiftErrorMessage(err: unknown): string | null {
  const message = (err as { message?: string } | null)?.message ?? ''
  if (/dk_shifts_no_overlap|exclusion/i.test(message)) return 'Esa persona ya tiene un turno que se cruza con ese horario (en esta u otra cuenta).'
  if (/dk_shifts_duration/.test(message)) return 'Un turno dura entre 15 minutos y 16 horas, y termina después de empezar.'
  if (/dk_shifts_break/.test(message)) return 'El descanso debe ser menor que el turno (máximo 4 horas).'
  return null
}

/** Shifts that touch [from, to). The database shows the whole plan with staff.view, otherwise only your own. */
export async function listShifts(from: string, to: string, options: { userId?: string; includeCancelled?: boolean } = {}): Promise<Shift[]> {
  let query = supabase.from('dk_shifts').select(SELECT).lt('starts_at', to).gt('ends_at', from)
  if (options.userId) query = query.eq('user_id', options.userId)
  if (!options.includeCancelled) query = query.eq('status', 'scheduled')
  const { data, error } = await query.order('starts_at')
  if (error) throw error
  return (data as Row[]).map(mapShift)
}

export async function createShift(input: ShiftInput): Promise<void> {
  // organization_id is filled by the database from the account (trigger).
  const row = {
    user_id: input.userId,
    role_id: input.roleId,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    break_minutes: input.breakMinutes,
    notes: input.notes?.trim() || null,
  }
  const { error } = await supabase.from('dk_shifts').insert(row as never)
  if (error) throw error
}

export async function updateShift(id: string, input: ShiftInput): Promise<void> {
  const { error } = await supabase
    .from('dk_shifts')
    .update({
      user_id: input.userId,
      role_id: input.roleId,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      break_minutes: input.breakMinutes,
      notes: input.notes?.trim() || null,
    })
    .eq('id', id)
  if (error) throw error
}

/** Shifts are cancelled, never erased (the history stays). */
export async function cancelShift(id: string): Promise<void> {
  const { error } = await supabase.from('dk_shifts').update({ status: 'cancelled' }).eq('id', id)
  if (error) throw error
}

export async function copyWeek(fromWeek: string, toWeek: string): Promise<{ copied: number; skipped: number }> {
  const { data, error } = await supabase.rpc('dk_copy_shifts', { p_from_week: fromWeek, p_to_week: toWeek })
  if (error) throw error
  return data as { copied: number; skipped: number }
}

export async function clockIn(): Promise<void> {
  const { error } = await supabase.rpc('dk_clock_in')
  if (error) throw error
}

export async function clockOut(): Promise<void> {
  const { error } = await supabase.rpc('dk_clock_out')
  if (error) throw error
}

export async function listStaffMembers(): Promise<StaffMember[]> {
  const { data, error } = await supabase.rpc('dk_staff_members')
  if (error) throw error
  return (data ?? []).map((m) => ({
    userId: m.user_id,
    fullName: m.full_name,
    avatarKey: m.avatar_key,
    active: m.active,
    defaultRoleId: m.default_role_id,
    roles: (m.roles as unknown as StaffRole[]) ?? [],
    riderId: m.rider_id,
  }))
}

export async function listOnShiftNow(): Promise<OnShift[]> {
  const { data, error } = await supabase.rpc('dk_shifts_now')
  if (error) throw error
  return (data ?? []).map((r) => ({
    shiftId: r.shift_id,
    userId: r.user_id,
    fullName: r.full_name,
    roleId: r.role_id,
    roleName: r.role_name,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    clockedIn: r.clocked_in,
    riderId: r.rider_id,
  }))
}
