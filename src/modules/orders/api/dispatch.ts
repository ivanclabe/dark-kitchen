import { supabase } from '@/shared/lib/supabase'
import type { Rider, RiderInput } from '../types'

// Despacho is a view of the order (ADR 0020): what is dispatched is read with
// the order; here only the riders and the two dispatch actions.

export async function dispatchOrder(orderId: string, riderId: string, notes?: string): Promise<void> {
  const { error } = await supabase.rpc('dk_dispatch_order', { p_order_id: orderId, p_rider_id: riderId, p_notes: notes })
  if (error) throw error
}

export async function markDelivered(orderId: string): Promise<void> {
  const { error } = await supabase.rpc('dk_mark_delivered', { p_order_id: orderId })
  if (error) throw error
}

const RIDER_SELECT = 'id, full_name, phone, vehicle_type, active, user_id'

function mapRider(row: { id: string; full_name: string; phone: string | null; vehicle_type: string | null; active: boolean; user_id: string | null }): Rider {
  return { id: row.id, fullName: row.full_name, phone: row.phone, vehicleType: row.vehicle_type, active: row.active, userId: row.user_id }
}

export async function listRiders(): Promise<Rider[]> {
  const { data, error } = await supabase.from('dk_delivery_riders').select(RIDER_SELECT).order('full_name')
  if (error) throw error
  return data.map(mapRider)
}

export async function createRider(input: RiderInput): Promise<Rider> {
  const { data, error } = await supabase
    .from('dk_delivery_riders')
    .insert({ full_name: input.fullName, phone: input.phone || null, vehicle_type: input.vehicleType || null })
    .select(RIDER_SELECT)
    .single()
  if (error) throw error
  return mapRider(data)
}

export async function setRiderActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('dk_delivery_riders').update({ active }).eq('id', id)
  if (error) throw error
}
