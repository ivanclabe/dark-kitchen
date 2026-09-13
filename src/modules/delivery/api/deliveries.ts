import { supabase } from '@/shared/lib/supabase'
import type { DispatchedOrder, ReadyOrder } from '../types'

interface ReadyOrderRow {
  id: string
  total: number
  created_at: string
  dk_customers: { full_name: string; address: string | null } | null
}

export async function listReadyOrders(): Promise<ReadyOrder[]> {
  const { data, error } = await supabase
    .from('dk_orders')
    .select('id, total, created_at, dk_customers ( full_name, address )')
    .eq('status', 'LISTO')
    .order('created_at')

  if (error) throw error
  return (data as unknown as ReadyOrderRow[]).map((row) => ({
    orderId: row.id,
    customerName: row.dk_customers?.full_name ?? '—',
    address: row.dk_customers?.address ?? null,
    total: Number(row.total),
    createdAt: row.created_at,
  }))
}

interface DispatchedOrderRow {
  id: string
  total: number
  dk_customers: { full_name: string; address: string | null } | null
  dk_deliveries: { dispatched_at: string; dk_delivery_riders: { full_name: string } | null }[] | { dispatched_at: string; dk_delivery_riders: { full_name: string } | null } | null
}

export async function listDispatchedOrders(): Promise<DispatchedOrder[]> {
  const { data, error } = await supabase
    .from('dk_orders')
    .select(
      'id, total, dk_customers ( full_name, address ), dk_deliveries ( dispatched_at, dk_delivery_riders ( full_name ) )',
    )
    .eq('status', 'DESPACHADO')
    .order('created_at')

  if (error) throw error

  return (data as unknown as DispatchedOrderRow[]).map((row) => {
    const delivery = Array.isArray(row.dk_deliveries) ? row.dk_deliveries[0] : row.dk_deliveries
    return {
      orderId: row.id,
      customerName: row.dk_customers?.full_name ?? '—',
      address: row.dk_customers?.address ?? null,
      total: Number(row.total),
      riderName: delivery?.dk_delivery_riders?.full_name ?? null,
      dispatchedAt: delivery?.dispatched_at ?? '',
    }
  })
}

export async function dispatchOrder(orderId: string, riderId: string, notes?: string): Promise<void> {
  const { error } = await supabase.rpc('dk_dispatch_order', {
    p_order_id: orderId,
    p_rider_id: riderId,
    p_notes: notes,
  })
  if (error) throw error
}

export async function markDelivered(orderId: string): Promise<void> {
  const { error } = await supabase.rpc('dk_mark_delivered', { p_order_id: orderId })
  if (error) throw error
}
