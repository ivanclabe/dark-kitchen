import { supabase } from '@/shared/lib/supabase'
import type { OrderItemInput } from '../types'

// The items are read with their order (orders/api/orders.ts); here only what changes them.

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

/** PENDIENTE → EN_PREPARACION → LISTO; the order's status follows its items (in the database). */
export async function advanceKitchenItem(orderItemId: string): Promise<void> {
  const { error } = await supabase.rpc('dk_advance_kitchen_item', { p_order_item_id: orderItemId })
  if (error) throw error
}

/** The mirror of advanceKitchenItem, one step back. */
export async function revertKitchenItem(orderItemId: string): Promise<void> {
  const { error } = await supabase.rpc('dk_revert_kitchen_item', { p_order_item_id: orderItemId })
  if (error) throw error
}
