import { supabase } from '@/shared/lib/supabase'
import type { OrderItemInput } from '../types'

// The items are read with their order (orders/api/orders.ts); here only what changes them.

/**
 * ADR 0059: one way to add a line — through the server's rule, which validates the options and adds their
 * extras to the base price (the cashier may still change the base price).
 */
export async function addOrderItem(orderId: string, input: OrderItemInput): Promise<void> {
  const { error } = await supabase.rpc('dk_order_add_item', {
    p_order_id: orderId,
    p_product_id: input.productId,
    p_quantity: input.quantity,
    p_options: input.options ?? [],
    p_base_price: input.unitPrice,
    p_observation: input.observation || undefined,
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
