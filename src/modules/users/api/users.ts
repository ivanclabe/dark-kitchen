import type { Role } from '@/shared/rbac/roles'
import { supabase } from '@/shared/lib/supabase'
import type { StaffUser } from '../types'

export async function listUsers(): Promise<StaffUser[]> {
  const { data, error } = await supabase
    .from('dk_users')
    .select('id, full_name, role, active, created_at')
    .order('full_name')

  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    role: row.role as Role,
    active: row.active,
    createdAt: row.created_at,
  }))
}

export async function updateUserRole(id: string, role: Role): Promise<void> {
  const { error } = await supabase.from('dk_users').update({ role }).eq('id', id)
  if (error) throw error
}

export async function setUserActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('dk_users').update({ active }).eq('id', id)
  if (error) throw error
}
