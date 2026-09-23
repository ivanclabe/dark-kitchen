import { supabase } from '@/shared/lib/supabase'
import type { Order, OrderInput, OrderStatusHistoryEntry } from '../types'

interface OrderRow {
  id: string
  order_number: number
  customer_id: string
  status: Order['status']
  subtotal: number
  discount: number
  delivery_fee: number
  total: number
  payment_method: string | null
  notes: string | null
  requires_review: boolean
  created_at: string
  dk_customers: { full_name: string } | null
}

const SELECT = `
  id, order_number, customer_id, status, subtotal, discount, delivery_fee, total, payment_method, notes, requires_review, created_at,
  dk_customers ( full_name )
`

function mapRow(row: OrderRow): Order {
  return {
    id: row.id,
    orderNumber: row.order_number,
    customerId: row.customer_id,
    customerName: row.dk_customers?.full_name ?? '—',
    status: row.status,
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    deliveryFee: Number(row.delivery_fee),
    total: Number(row.total),
    paymentMethod: row.payment_method,
    notes: row.notes,
    requiresReview: row.requires_review,
    createdAt: row.created_at,
  }
}

export async function listOrders(): Promise<Order[]> {
  const { data, error } = await supabase.from('dk_orders').select(SELECT).order('created_at', { ascending: false })
  if (error) throw error
  return (data as unknown as OrderRow[]).map(mapRow)
}

export async function listOrdersByCustomer(customerId: string): Promise<Order[]> {
  const { data, error } = await supabase.from('dk_orders').select(SELECT).eq('customer_id', customerId).order('created_at', { ascending: false })
  if (error) throw error
  return (data as unknown as OrderRow[]).map(mapRow)
}

export async function getOrder(id: string): Promise<Order> {
  const { data, error } = await supabase.from('dk_orders').select(SELECT).eq('id', id).single()
  if (error) throw error
  return mapRow(data as unknown as OrderRow)
}

export async function createOrder(input: OrderInput): Promise<Order> {
  const { data, error } = await supabase
    .from('dk_orders')
    .insert({
      customer_id: input.customerId,
      notes: input.notes || null,
      discount: input.discount ?? 0,
      delivery_fee: input.deliveryFee ?? 0,
      payment_method: input.paymentMethod || null,
    })
    .select(SELECT)
    .single()
  if (error) throw error
  return mapRow(data as unknown as OrderRow)
}

export async function updateOrder(id: string, input: OrderInput): Promise<void> {
  const { error } = await supabase
    .from('dk_orders')
    .update({
      customer_id: input.customerId,
      notes: input.notes || null,
      discount: input.discount ?? 0,
      delivery_fee: input.deliveryFee ?? 0,
      payment_method: input.paymentMethod || null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function confirmOrder(id: string): Promise<void> {
  const { error } = await supabase.rpc('dk_confirm_order', { p_order_id: id })
  if (error) throw error
}

export async function cancelOrder(id: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('dk_cancel_order', { p_order_id: id, p_reason: reason })
  if (error) throw error
}

export async function listOrderStatusHistory(orderId: string): Promise<OrderStatusHistoryEntry[]> {
  const { data, error } = await supabase
    .from('dk_order_status_history')
    .select('id, from_status, to_status, changed_at, note')
    .eq('order_id', orderId)
    .order('changed_at')
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    changedAt: row.changed_at,
    note: row.note,
  }))
}
