import { supabase } from '@/shared/lib/supabase'
import type { Rider, RiderInput } from '../types'

function mapRow(row: { id: string; full_name: string; phone: string | null; vehicle_type: string | null; active: boolean }): Rider {
  return { id: row.id, fullName: row.full_name, phone: row.phone, vehicleType: row.vehicle_type, active: row.active }
}

export async function listRiders(): Promise<Rider[]> {
  const { data, error } = await supabase
    .from('dk_delivery_riders')
    .select('id, full_name, phone, vehicle_type, active')
    .order('full_name')
  if (error) throw error
  return data.map(mapRow)
}

export async function createRider(input: RiderInput): Promise<Rider> {
  const { data, error } = await supabase
    .from('dk_delivery_riders')
    .insert({ full_name: input.fullName, phone: input.phone || null, vehicle_type: input.vehicleType || null })
    .select('id, full_name, phone, vehicle_type, active')
    .single()
  if (error) throw error
  return mapRow(data)
}

export async function setRiderActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('dk_delivery_riders').update({ active }).eq('id', id)
  if (error) throw error
}
