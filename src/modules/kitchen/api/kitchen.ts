import { supabase } from '@/shared/lib/supabase'
import type { KitchenTicket } from '../types'

interface OrderRow {
  id: string
  order_number: number
  status: 'CONFIRMADO' | 'EN_PREPARACION' | 'LISTO'
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
    // LISTO se incluye a propósito: Cocina necesita ver qué pedidos ya están
    // listos y esperando que Despachos los recoja (columna "Listo" del
    // Kanban) — es una ampliación de lectura, no toca ningún RPC ni regla
    // de negocio existente.
    .in('status', ['CONFIRMADO', 'EN_PREPARACION', 'LISTO'])
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

/** Espejo de advanceKitchenItem hacia atrás — mismo RPC-pair, ver dk_revert_kitchen_item. */
export async function revertKitchenItem(orderItemId: string): Promise<void> {
  const { error } = await supabase.rpc('dk_revert_kitchen_item', { p_order_item_id: orderItemId })
  if (error) throw error
}

export async function setTicketPriority(orderId: string, priority: number): Promise<void> {
  const { error } = await supabase.rpc('dk_set_ticket_priority', { p_order_id: orderId, p_priority: priority })
  if (error) throw error
}

/**
 * Mismo RPC que ya usa el módulo Pedidos (src/modules/orders/api/orders.ts)
 * para cancelar — dk_cancel_order ahora también autoriza al rol KITCHEN.
 */
export async function cancelKitchenOrder(orderId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('dk_cancel_order', { p_order_id: orderId, p_reason: reason })
  if (error) throw error
}

interface CancelledOrderRow {
  id: string
  order_number: number
  notes: string | null
  created_at: string
  dk_customers: { full_name: string } | null
  dk_order_items: {
    id: string
    quantity: number
    observation: string | null
    kitchen_status: KitchenTicket['items'][number]['kitchenStatus']
    dk_products: { name: string } | null
  }[]
  dk_order_status_history: { changed_at: string; note: string | null; to_status: string }[]
}

/**
 * Query separada de listKitchenQueue: solo alimenta la columna CANCELADO
 * del Kanban (Grid/Lista/SLA siguen usando exclusivamente
 * useKitchenQueue). Acotada a "cancelados hoy" para no acumular todo el
 * historial — eso ya vive en el módulo Pedidos, pestaña Cancelado.
 */
export async function listCancelledKitchenQueue(): Promise<KitchenTicket[]> {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('dk_orders')
    .select(
      `id, order_number, notes, created_at,
       dk_customers ( full_name ),
       dk_order_items ( id, quantity, observation, kitchen_status, dk_products ( name ) ),
       dk_order_status_history ( changed_at, note, to_status )`,
    )
    .eq('status', 'CANCELADO')
    .gte('updated_at', startOfToday.toISOString())
    .order('updated_at', { ascending: false })

  if (error) throw error

  return (data as unknown as CancelledOrderRow[]).map((row) => {
    const cancellation = row.dk_order_status_history.find((h) => h.to_status === 'CANCELADO')
    return {
      orderId: row.id,
      orderNumber: row.order_number,
      customerName: row.dk_customers?.full_name ?? '—',
      orderStatus: 'CANCELADO' as const,
      createdAt: row.created_at,
      notes: row.notes,
      priority: 0,
      items: row.dk_order_items.map((item) => ({
        id: item.id,
        productName: item.dk_products?.name ?? '—',
        quantity: item.quantity,
        observation: item.observation,
        kitchenStatus: item.kitchen_status,
      })),
      cancelledAt: cancellation?.changed_at ?? row.created_at,
      cancelReason: cancellation?.note ?? null,
    }
  })
}
