import { supabase } from '@/shared/lib/supabase'
import type { FlowStatus, Order, OrderInput, OrderSearch, OrderStatus, OrderStatusHistoryEntry, PrepStatus } from '../types'

/**
 * The one query of an order (ADR 0020). Every view (Pedidos, Cocina,
 * Despacho, Dashboard, Clientes) reads this shape; the database's RLS decides
 * what each role sees (a rider only their own deliveries, customer data only
 * with customers.view).
 */
const SELECT = `
  id, order_number, customer_id, status, channel, subtotal, discount, delivery_fee, total, payment_method, notes,
  requires_review, created_at, updated_at,
  dk_customers ( full_name, address, phone ),
  dk_kitchen_tickets ( priority ),
  dk_deliveries ( status, rider_id, dispatched_at, delivered_at, dk_delivery_riders ( full_name ) ),
  dk_order_items ( id, product_id, quantity, unit_price, line_total, observation, kitchen_status, created_at, dk_products ( name ) )
`

type One<T> = T | T[] | null

interface OrderRow {
  id: string
  order_number: number
  customer_id: string
  status: OrderStatus
  channel: Order['channel']
  subtotal: number
  discount: number
  delivery_fee: number
  total: number | null
  payment_method: string | null
  notes: string | null
  requires_review: boolean
  created_at: string
  updated_at: string
  dk_customers: One<{ full_name: string; address: string | null; phone: string | null }>
  dk_kitchen_tickets: One<{ priority: number }>
  dk_deliveries: One<{
    status: NonNullable<Order['delivery']>['status']
    rider_id: string | null
    dispatched_at: string | null
    delivered_at: string | null
    dk_delivery_riders: One<{ full_name: string }>
  }>
  dk_order_items: {
    id: string
    product_id: string
    quantity: number
    unit_price: number
    line_total: number
    observation: string | null
    kitchen_status: Order['items'][number]['kitchenStatus']
    created_at: string
    dk_products: One<{ name: string }>
  }[]
}

const first = <T,>(value: One<T>): T | null => (Array.isArray(value) ? (value[0] ?? null) : value)

export function mapOrder(row: OrderRow): Order {
  const customer = first(row.dk_customers)
  const delivery = first(row.dk_deliveries)
  return {
    id: row.id,
    orderNumber: row.order_number,
    customerId: row.customer_id,
    customerName: customer?.full_name ?? '—',
    customerAddress: customer?.address ?? null,
    customerPhone: customer?.phone ?? null,
    status: row.status,
    channel: row.channel,
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    deliveryFee: Number(row.delivery_fee),
    total: Number(row.total ?? 0),
    paymentMethod: row.payment_method,
    notes: row.notes,
    requiresReview: row.requires_review,
    priority: first(row.dk_kitchen_tickets)?.priority ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: [...(row.dk_order_items ?? [])]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((item) => ({
        id: item.id,
        productId: item.product_id,
        productName: first(item.dk_products)?.name ?? '—',
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
        lineTotal: Number(item.line_total),
        observation: item.observation,
        kitchenStatus: item.kitchen_status,
      })),
    delivery: delivery
      ? {
          status: delivery.status,
          riderId: delivery.rider_id,
          riderName: first(delivery.dk_delivery_riders)?.full_name ?? null,
          dispatchedAt: delivery.dispatched_at,
          deliveredAt: delivery.delivered_at,
        }
      : null,
  }
}

const mapRows = (data: unknown) => (data as OrderRow[]).map(mapOrder)

export const FLOW_STATUSES: FlowStatus[] = ['NUEVO', 'CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'DESPACHADO']
export const PREP_STATUSES: PrepStatus[] = ['CONFIRMADO', 'EN_PREPARACION', 'LISTO']

/**
 * Open orders in `statuses`, whenever they were created — a draft from days
 * ago or an order nobody dispatched is real pending work.
 */
export async function listOpenOrders(statuses: OrderStatus[]): Promise<Order[]> {
  const { data, error } = await supabase.from('dk_orders').select(SELECT).in('status', statuses).order('created_at')
  if (error) throw error
  return mapRows(data)
}

/** How many orders were delivered today (they leave the board, so they are only counted). */
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

/**
 * All orders, newest first (Lista view, a customer's history). The search
 * (number, customer, phone or dish) runs in the database (dk_order_search,
 * with the caller's RLS); then the orders are read with the common query.
 */
export async function searchOrders(filters: OrderSearch): Promise<{ orders: Order[]; hasMore: boolean }> {
  const limit = filters.limit ?? 50
  const { data: ids, error: searchError } = await supabase.rpc('dk_order_search', {
    p_search: filters.search?.trim() || undefined,
    p_from: filters.from ?? undefined,
    p_to: filters.to ?? undefined,
    p_statuses: filters.statuses?.length ? filters.statuses : undefined,
    p_channel: filters.channel ?? undefined,
    p_customer_id: filters.customerId ?? undefined,
    p_limit: limit + 1,
    p_offset: filters.offset ?? 0,
  })
  if (searchError) throw searchError
  const found = (ids ?? []) as string[]
  const page = found.slice(0, limit)
  if (page.length === 0) return { orders: [], hasMore: false }
  const { data, error } = await supabase.from('dk_orders').select(SELECT).in('id', page)
  if (error) throw error
  const byId = new Map(mapRows(data).map((o) => [o.id, o]))
  return { orders: page.map((id) => byId.get(id)).filter((o): o is Order => Boolean(o)), hasMore: found.length > limit }
}

export async function getOrder(id: string): Promise<Order> {
  const { data, error } = await supabase.from('dk_orders').select(SELECT).eq('id', id).single()
  if (error) throw error
  return mapOrder(data as unknown as OrderRow)
}

/**
 * By its number in the active account. Numbers cycle (1000–9999) and are
 * unique only among open orders, so the most recent one with that number wins.
 */
export async function getOrderByNumber(orderNumber: number): Promise<Order | null> {
  const { data, error } = await supabase.from('dk_orders').select(SELECT).eq('order_number', orderNumber).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data ? mapOrder(data as unknown as OrderRow) : null
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
  return mapOrder(data as unknown as OrderRow)
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

/** Confirming reserves the stock of every dish (the database refuses it if something is missing). */
export async function confirmOrder(id: string): Promise<void> {
  const { error } = await supabase.rpc('dk_confirm_order', { p_order_id: id })
  if (error) throw error
}

export async function cancelOrder(id: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('dk_cancel_order', { p_order_id: id, p_reason: reason })
  if (error) throw error
}

export async function setOrderPriority(orderId: string, priority: number): Promise<void> {
  const { error } = await supabase.rpc('dk_set_ticket_priority', { p_order_id: orderId, p_priority: priority })
  if (error) throw error
}

export async function listOrderStatusHistory(orderId: string): Promise<OrderStatusHistoryEntry[]> {
  const { data, error } = await supabase
    .from('dk_order_status_history')
    .select('id, from_status, to_status, changed_at, note, dk_users!dk_order_status_history_changed_by_fkey ( full_name )')
    .eq('order_id', orderId)
    .order('changed_at')
  if (error) throw error
  return (data as unknown as { id: string; from_status: OrderStatus | null; to_status: OrderStatus; changed_at: string; note: string | null; dk_users: One<{ full_name: string }> }[]).map((row) => ({
    id: row.id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    changedAt: row.changed_at,
    note: row.note,
    changedBy: first(row.dk_users)?.full_name ?? null,
  }))
}

export interface OrderReservation {
  ingredientId: string
  ingredientName: string
  unit: string
  quantity: number
  status: 'ACTIVE' | 'RELEASED' | 'CONSUMED'
  productName: string
}

/**
 * The stock an order reserved (confirming) or consumed (preparing), per
 * ingredient — read-only, from Abastecimiento's own table and its RLS
 * (inventory.view or orders.view). Nothing is copied.
 */
export async function listOrderReservations(orderId: string): Promise<OrderReservation[]> {
  const { data, error } = await supabase
    .from('dk_inventory_reservations')
    .select('ingredient_id, quantity_base_unit, status, dk_ingredients ( name, dk_units ( code ) ), dk_order_items!inner ( order_id, dk_products ( name ) )')
    .eq('dk_order_items.order_id', orderId)
  if (error) throw error
  type Row = {
    ingredient_id: string
    quantity_base_unit: number
    status: OrderReservation['status']
    dk_ingredients: One<{ name: string; dk_units: One<{ code: string }> }>
    dk_order_items: One<{ order_id: string; dk_products: One<{ name: string }> }>
  }
  return (data as unknown as Row[]).map((row) => {
    const ingredient = first(row.dk_ingredients)
    return {
      ingredientId: row.ingredient_id,
      ingredientName: ingredient?.name ?? '—',
      unit: first(ingredient?.dk_units ?? null)?.code ?? '',
      quantity: Number(row.quantity_base_unit),
      status: row.status,
      productName: first(first(row.dk_order_items)?.dk_products ?? null)?.name ?? '—',
    }
  })
}
