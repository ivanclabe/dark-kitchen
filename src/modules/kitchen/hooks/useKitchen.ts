import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  advanceKitchenItem,
  cancelKitchenOrder,
  listCancelledKitchenQueue,
  listKitchenQueue,
  revertKitchenItem,
  setTicketPriority,
} from '../api/kitchen'
import type { KitchenItemStatus, KitchenTicketItem } from '../types'

const KITCHEN_KEY = ['kitchen-queue'] as const
const CANCELLED_KEY = ['kitchen-cancelled-queue'] as const

// Compartida por todas las mutaciones que tocan inventario (avanzar,
// revertir, cancelar) — misma lista que ya invalidaba advanceKitchenItem.
const INVENTORY_AFFECTED_KEYS = [['orders'], ['ingredients'], ['inventory-movements']] as const

export function useKitchenQueue() {
  return useQuery({ queryKey: KITCHEN_KEY, queryFn: listKitchenQueue, refetchInterval: 15_000 })
}

/** Solo alimenta la columna Cancelado del Kanban — ver listCancelledKitchenQueue. */
export function useCancelledKitchenQueue() {
  return useQuery({ queryKey: CANCELLED_KEY, queryFn: listCancelledKitchenQueue, refetchInterval: 15_000 })
}

export function useAdvanceKitchenItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderItemId: string) => advanceKitchenItem(orderItemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KITCHEN_KEY })
      for (const key of INVENTORY_AFFECTED_KEYS) queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

/** Espejo de useAdvanceKitchenItem hacia atrás — misma invalidación (también mueve inventario). */
export function useRevertKitchenItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderItemId: string) => revertKitchenItem(orderItemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KITCHEN_KEY })
      for (const key of INVENTORY_AFFECTED_KEYS) queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

export function useCancelKitchenOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason?: string }) => cancelKitchenOrder(orderId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KITCHEN_KEY })
      queryClient.invalidateQueries({ queryKey: CANCELLED_KEY })
      for (const key of INVENTORY_AFFECTED_KEYS) queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

export function useSetTicketPriority() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, priority }: { orderId: string; priority: number }) => setTicketPriority(orderId, priority),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KITCHEN_KEY }),
  })
}

export function useAdvanceTicketItems() {
  const advance = useAdvanceKitchenItem()

  async function advanceTicketItems(items: KitchenTicketItem[], target: Extract<KitchenItemStatus, 'EN_PREPARACION' | 'LISTO'>) {
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

  return { advanceTicketItems, isPending: advance.isPending }
}

/**
 * Espejo de useAdvanceTicketItems hacia atrás. target='EN_PREPARACION'
 * retrocede solo los ítems que ya están LISTO (un paso); target='PENDIENTE'
 * retrocede todo lo que no esté ya PENDIENTE (hasta dos pasos por ítem) —
 * permite que un ticket LISTO se mueva directo a CONFIRMADO por drag & drop.
 */
export function useRevertTicketItems() {
  const revert = useRevertKitchenItem()

  async function revertTicketItems(items: KitchenTicketItem[], target: Extract<KitchenItemStatus, 'PENDIENTE' | 'EN_PREPARACION'>) {
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

  return { revertTicketItems, isPending: revert.isPending }
}
