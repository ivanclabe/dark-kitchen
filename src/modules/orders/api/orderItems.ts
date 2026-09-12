import { supabase } from '@/shared/lib/supabase'
import type { OrderItem, OrderItemInput } from '../types'

interface OrderItemRow {
  id: string
  order_id: string
  product_id: string
  quantity: number
  unit_price: number
  line_total: number
  observation: string | null
  kitchen_status: OrderItem['kitchenStatus']
  dk_products: { name: string } | null
}

const SELECT = 'id, order_id, product_id, quantity, unit_price, line_total, observation, kitchen_status, dk_products ( name )'

function mapRow(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id,
    productName: row.dk_products?.name ?? '—',
    quantity: row.quantity,
    unitPrice: Number(row.unit_price),
    lineTotal: Number(row.line_total),
    observation: row.observation,
    kitchenStatus: row.kitchen_status,
  }
}

export async function listOrderItems(orderId: string): Promise<OrderItem[]> {
  const { data, error } = await supabase.from('dk_order_items').select(SELECT).eq('order_id', orderId).order('created_at')
  if (error) throw error
  return (data as unknown as OrderItemRow[]).map(mapRow)
}

export async function addOrderItem(orderId: string, input: OrderItemInput): Promise<void> {
  const { error } = await supabase.from('dk_order_items').insert({
    order_id: orderId,
    product_id: input.productId,
    quantity: input.quantity,
    unit_price: input.unitPrice,
    observation: input.observation || null,
  })
  if (error) throw error
}

export async function removeOrderItem(id: string): Promise<void> {
  const { error } = await supabase.from('dk_order_items').delete().eq('id', id)
  if (error) throw error
}
