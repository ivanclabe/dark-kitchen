import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addOrderItem, advanceKitchenItem, removeOrderItem, revertKitchenItem } from '../api/orderItems'
import {
  cancelOrder,
  confirmOrder,
  countDeliveredToday,
  createOrder,
  FLOW_STATUSES,
  getOrder,
  listOpenOrders,
  listOrderReservations,
  listOrderStatusHistory,
  searchOrders,
  setOrderPriority,
  updateOrder,
} from '../api/orders'
import type { KitchenItemStatus, OrderInput, OrderItem, OrderItemInput, OrderSearch } from '../types'

/**
 * Every order query lives under ONE root key (ADR 0020). Pedidos, Cocina,
 * Despacho and the Dashboard share the live list, so a change made in one of
 * them shows in all at once; any mutation invalidates the root.
 */
export const ORDERS_KEY = ['orders'] as const
const LIVE_KEY = [...ORDERS_KEY, 'live'] as const

/**
 * Stock follows the orders (confirming reserves, preparing consumes,
 * cancelling releases), so their views refresh too. The only link with
 * Abastecimiento, which keeps its own screens and data untouched.
 */
const STOCK_KEYS = [['ingredients'], ['inventory-movements'], ['supply-suggestions']] as const

export function useInvalidateOrders() {
  const queryClient = useQueryClient()
  return (options: { stock?: boolean } = {}) => {
    void queryClient.invalidateQueries({ queryKey: ORDERS_KEY })
    if (options.stock) for (const key of STOCK_KEYS) void queryClient.invalidateQueries({ queryKey: key })
  }
}

/** The live flow (NUEVO → DESPACHADO): one query, shared by every view, refreshed every 15 s. */
export function useLiveOrders(enabled = true) {
  return useQuery({ queryKey: LIVE_KEY, queryFn: () => listOpenOrders(FLOW_STATUSES), refetchInterval: 15_000, enabled })
}

export function useDeliveredTodayCount(enabled = true) {
  return useQuery({ queryKey: [...ORDERS_KEY, 'delivered-today'], queryFn: countDeliveredToday, refetchInterval: enabled ? 30_000 : false, enabled })
}

/** Pedidos → Lista and a customer's history: all orders, filtered in the database. */
export function useOrderSearch(filters: OrderSearch, enabled = true) {
  return useQuery({ queryKey: [...ORDERS_KEY, 'search', filters], queryFn: () => searchOrders(filters), placeholderData: keepPreviousData, enabled })
}

export function useOrder(id: string | null | undefined) {
  return useQuery({ queryKey: [...ORDERS_KEY, 'detail', id], queryFn: () => getOrder(id!), enabled: !!id })
}

export function useOrderStatusHistory(orderId: string | null | undefined) {
  return useQuery({ queryKey: [...ORDERS_KEY, 'history', orderId], queryFn: () => listOrderStatusHistory(orderId!), enabled: !!orderId })
}

/** Stock reserved or consumed by the order (needs inventory.view or orders.view in the database). */
export function useOrderReservations(orderId: string | null | undefined, enabled = true) {
  return useQuery({ queryKey: [...ORDERS_KEY, 'reservations', orderId], queryFn: () => listOrderReservations(orderId!), enabled: !!orderId && enabled })
}

export function useCreateOrder() {
  const invalidate = useInvalidateOrders()
  return useMutation({ mutationFn: (input: OrderInput) => createOrder(input), onSuccess: () => invalidate() })
}

export function useUpdateOrder(orderId: string) {
  const invalidate = useInvalidateOrders()
  return useMutation({ mutationFn: (input: OrderInput) => updateOrder(orderId, input), onSuccess: () => invalidate() })
}

export function useAddOrderItem(orderId: string) {
  const invalidate = useInvalidateOrders()
  return useMutation({ mutationFn: (input: OrderItemInput) => addOrderItem(orderId, input), onSuccess: () => invalidate() })
}

export function useRemoveOrderItem() {
  const invalidate = useInvalidateOrders()
  return useMutation({ mutationFn: (id: string) => removeOrderItem(id), onSuccess: () => invalidate() })
}

export function useConfirmOrder() {
  const invalidate = useInvalidateOrders()
  return useMutation({ mutationFn: (orderId: string) => confirmOrder(orderId), onSuccess: () => invalidate({ stock: true }) })
}

export function useCancelOrder() {
  const invalidate = useInvalidateOrders()
  return useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason?: string }) => cancelOrder(orderId, reason),
    onSuccess: () => invalidate({ stock: true }),
  })
}

export function useSetOrderPriority() {
  const invalidate = useInvalidateOrders()
  return useMutation({
    mutationFn: ({ orderId, priority }: { orderId: string; priority: number }) => setOrderPriority(orderId, priority),
    onSuccess: () => invalidate(),
  })
}

export function useAdvanceKitchenItem() {
  const invalidate = useInvalidateOrders()
  return useMutation({ mutationFn: (orderItemId: string) => advanceKitchenItem(orderItemId), onSuccess: () => invalidate({ stock: true }) })
}

/** The mirror of useAdvanceKitchenItem (it also moves stock back). */
export function useRevertKitchenItem() {
  const invalidate = useInvalidateOrders()
  return useMutation({ mutationFn: (orderItemId: string) => revertKitchenItem(orderItemId), onSuccess: () => invalidate({ stock: true }) })
}

/** Moves every item of an order forward to `target` (the order's status follows its items). */
export function useAdvanceOrderItems() {
  const advance = useAdvanceKitchenItem()

  async function advanceOrderItems(items: OrderItem[], target: Extract<KitchenItemStatus, 'EN_PREPARACION' | 'LISTO'>) {
    if (target === 'EN_PREPARACION') {
      for (const item of items) {
        if (item.kitchenStatus === 'PENDIENTE') await advance.mutateAsync(item.id)
      }
    } else {
      for (const item of items) {
        if (item.kitchenStatus === 'LISTO') continue
        if (item.kitchenStatus === 'PENDIENTE') await advance.mutateAsync(item.id)
        await advance.mutateAsync(item.id)
      }
    }
  }

  return { advanceOrderItems, isPending: advance.isPending }
}

/**
 * The mirror of useAdvanceOrderItems. target='EN_PREPARACION' takes back only
 * the LISTO items (one step); target='PENDIENTE' takes back everything that is
 * not PENDIENTE yet (up to two steps per item), so a LISTO order can be
 * dragged straight to CONFIRMADO.
 */
export function useRevertOrderItems() {
  const revert = useRevertKitchenItem()

  async function revertOrderItems(items: OrderItem[], target: Extract<KitchenItemStatus, 'PENDIENTE' | 'EN_PREPARACION'>) {
    if (target === 'EN_PREPARACION') {
      for (const item of items) {
        if (item.kitchenStatus === 'LISTO') await revert.mutateAsync(item.id)
      }
    } else {
      for (const item of items) {
        if (item.kitchenStatus === 'PENDIENTE') continue
        if (item.kitchenStatus === 'LISTO') await revert.mutateAsync(item.id)
        await revert.mutateAsync(item.id)
      }
    }
  }

  return { revertOrderItems, isPending: revert.isPending }
}
