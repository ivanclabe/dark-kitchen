import { supabase } from '@/shared/lib/supabase'
import type { KitchenOrderStatus, KitchenTicket, OrderChannel } from '../types'

interface OrderRow {
  id: string
  order_number: number
  status: KitchenOrderStatus
  channel: OrderChannel
  notes: string | null
  created_at: string
  total: number
  requires_review: boolean
  dk_customers: { full_name: string; address: string | null } | null
  dk_kitchen_tickets: { priority: number } | { priority: number }[] | null
  dk_deliveries: DeliveryEmbed | DeliveryEmbed[] | null
  dk_order_items: {
    id: string
    quantity: number
    observation: string | null
    kitchen_status: KitchenTicket['items'][number]['kitchenStatus']
    dk_products: { name: string } | null
  }[]
}

interface DeliveryEmbed {
  dispatched_at: string | null
  dk_delivery_riders: { full_name: string } | null
}

function firstOf<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function mapOrderRow(row: OrderRow): KitchenTicket {
  const delivery = firstOf(row.dk_deliveries)
  return {
    orderId: row.id,
    orderNumber: row.order_number,
    customerName: row.dk_customers?.full_name ?? '—',
    address: row.dk_customers?.address ?? null,
    orderStatus: row.status,
    channel: row.channel,
    createdAt: row.created_at,
    notes: row.notes,
    priority: firstOf(row.dk_kitchen_tickets)?.priority ?? 0,
    total: Number(row.total),
    requiresReview: row.requires_review,
    riderName: delivery?.dk_delivery_riders?.full_name ?? null,
    dispatchedAt: delivery?.dispatched_at ?? null,
    items: row.dk_order_items.map((item) => ({
      id: item.id,
      productName: item.dk_products?.name ?? '—',
      quantity: item.quantity,
      observation: item.observation,
      kitchenStatus: item.kitchen_status,
    })),
  }
}

const ORDER_ROW_SELECT = `id, order_number, status, channel, notes, created_at, total, requires_review,
       dk_customers ( full_name, address ),
       dk_kitchen_tickets ( priority ),
       dk_deliveries ( dispatched_at, dk_delivery_riders ( full_name ) ),
       dk_order_items ( id, quantity, observation, kitchen_status, dk_products ( name ) )`

/** Estados de la cocina propiamente dicha — lo que ve el Dashboard y lo que controla la voz. */
const KITCHEN_STATUSES: KitchenOrderStatus[] = ['CONFIRMADO', 'EN_PREPARACION', 'LISTO']

/** El flujo completo del tablero: de NUEVO (por confirmar) a DESPACHADO (en ruta). */
const FLOW_STATUSES: KitchenOrderStatus[] = ['NUEVO', ...KITCHEN_STATUSES, 'DESPACHADO']

async function fetchTickets(statuses: KitchenOrderStatus[], range?: { start: string; end: string }): Promise<KitchenTicket[]> {
  let query = supabase.from('dk_orders').select(ORDER_ROW_SELECT).in('status', statuses)
  if (range) query = query.gte('created_at', range.start).lt('created_at', range.end)
  const { data, error } = await query.order('created_at')
  if (error) throw error
  return (data as unknown as OrderRow[]).map(mapOrderRow)
}

/** Cola de cocina en vivo (Confirmado → Listo). La sigue usando el Dashboard. */
export function listKitchenQueue(): Promise<KitchenTicket[]> {
  return fetchTickets(KITCHEN_STATUSES)
}

/**
 * Tablero de Cocina en vivo: todo lo que sigue abierto, sin importar cuándo
 * se creó — un borrador de hace días o un pedido listo que nadie despachó es
 * trabajo pendiente real y debe verse.
 */
export function listKitchenFlow(): Promise<KitchenTicket[]> {
  return fetchTickets(FLOW_STATUSES)
}

/** Límites [00:00, 24:00) locales del día `date` (formato "YYYY-MM-DD", el de un <input type="date">). */
function dayRange(date: string) {
  const start = new Date(`${date}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

/**
 * Modo histórico: foto de los pedidos CREADOS en `date` que siguen en el
 * flujo — para revisar o corregir un día anterior. Entregados y cancelados
 * se consultan en Historial.
 */
export function listKitchenFlowByDate(date: string): Promise<KitchenTicket[]> {
  return fetchTickets(FLOW_STATUSES, dayRange(date))
}

/** Cuántos pedidos se entregaron hoy — ENTREGADO sale del tablero, así que solo se cuenta. */
export async function countDeliveredToday(): Promise<number> {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const { count, error } = await supabase
    .from('dk_orders')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'ENTREGADO')
    .gte('updated_at', startOfToday.toISOString())
  if (error) throw error
  return count ?? 0
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
