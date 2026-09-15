import { supabase } from '@/shared/lib/supabase'
import type { KitchenTicket } from '../types'

interface OrderRow {
  id: string
  order_number: number
  status: 'CONFIRMADO' | 'EN_PREPARACION'
  notes: string | null
  created_at: string
  dk_customers: { full_name: string } | null
  dk_kitchen_tickets: { priority: number } | { priority: number }[] | null
  dk_order_items: {
    id: string
    quantity: number
    observation: string | null
    kitchen_status: KitchenTicket['items'][number]['kitchenStatus']
    dk_products: { name: string } | null
  }[]
}

function ticketPriority(row: OrderRow): number {
  const ticket = Array.isArray(row.dk_kitchen_tickets) ? row.dk_kitchen_tickets[0] : row.dk_kitchen_tickets
  return ticket?.priority ?? 0
}

export async function listKitchenQueue(): Promise<KitchenTicket[]> {
  const { data, error } = await supabase
    .from('dk_orders')
    .select(
      `id, order_number, status, notes, created_at,
       dk_customers ( full_name ),
       dk_kitchen_tickets ( priority ),
       dk_order_items ( id, quantity, observation, kitchen_status, dk_products ( name ) )`,
    )
    .in('status', ['CONFIRMADO', 'EN_PREPARACION'])
    .order('created_at')

  if (error) throw error

  return (data as unknown as OrderRow[]).map((row) => ({
    orderId: row.id,
    orderNumber: row.order_number,
    customerName: row.dk_customers?.full_name ?? '—',
    orderStatus: row.status,
    createdAt: row.created_at,
    notes: row.notes,
    priority: ticketPriority(row),
    items: row.dk_order_items.map((item) => ({
      id: item.id,
      productName: item.dk_products?.name ?? '—',
      quantity: item.quantity,
      observation: item.observation,
      kitchenStatus: item.kitchen_status,
    })),
  }))
}

export async function advanceKitchenItem(orderItemId: string): Promise<void> {
  const { error } = await supabase.rpc('dk_advance_kitchen_item', { p_order_item_id: orderItemId })
  if (error) throw error
}

export async function setTicketPriority(orderId: string, priority: number): Promise<void> {
  const { error } = await supabase.rpc('dk_set_ticket_priority', { p_order_id: orderId, p_priority: priority })
  if (error) throw error
}
