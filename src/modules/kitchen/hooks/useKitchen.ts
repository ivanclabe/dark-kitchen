import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  advanceKitchenItem,
  cancelKitchenOrder,
  countDeliveredToday,
  listKitchenFlow,
  listKitchenFlowByDate,
  listKitchenQueue,
  revertKitchenItem,
  setTicketPriority,
} from '../api/kitchen'
import type { KitchenItemStatus, KitchenTicketItem } from '../types'

/**
 * Prefijo común de TODAS las queries del flujo de Cocina (cola del
 * Dashboard, tablero, entregados hoy). Cualquier mutación que
 * mueva un pedido — acá, en Pedidos o en Despacho — invalida este prefijo y
 * refresca todo junto. Antes cada pantalla tenía su propia clave y el
 * tablero tardaba hasta 15 s en reflejar una confirmación o un despacho.
 */
export const KITCHEN_KEY = ['kitchen-queue'] as const
const FLOW_KEY = [...KITCHEN_KEY, 'flow'] as const
const DELIVERED_TODAY_KEY = [...KITCHEN_KEY, 'delivered-today'] as const

// Compartida por todas las mutaciones que tocan inventario o el estado del
// pedido: el Dashboard lee Listos/En ruta con sus propias claves, y el drawer
// del pedido (OrderBuilder) lee sus platos e historial por separado.
const AFFECTED_KEYS = [
  ['orders'],
  ['order-items'],
  ['order-status-history'],
  ['ingredients'],
  ['inventory-movements'],
  ['supply-suggestions'],
  ['ready-orders'],
  ['dispatched-orders'],
] as const

function useInvalidateFlow() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: KITCHEN_KEY })
    for (const key of AFFECTED_KEYS) queryClient.invalidateQueries({ queryKey: key })
  }
}

/** Cola de cocina en vivo (Confirmado → Listo) — la usa el Dashboard. */
export function useKitchenQueue(enabled = true) {
  return useQuery({ queryKey: KITCHEN_KEY, queryFn: listKitchenQueue, refetchInterval: 15_000, enabled })
}

/**
 * Tablero de Cocina. `date` null = en vivo (todo lo abierto, refresco cada
 * 15 s); una fecha ("YYYY-MM-DD") = foto histórica de lo creado ese día.
 */
export function useKitchenFlow(date: string | null = null) {
  return useQuery({
    queryKey: date ? [...FLOW_KEY, date] : FLOW_KEY,
    queryFn: () => (date ? listKitchenFlowByDate(date) : listKitchenFlow()),
    refetchInterval: date ? false : 15_000,
  })
}

export function useDeliveredTodayCount(enabled = true) {
  return useQuery({ queryKey: DELIVERED_TODAY_KEY, queryFn: countDeliveredToday, refetchInterval: enabled ? 30_000 : false, enabled })
}

export function useAdvanceKitchenItem() {
  const invalidate = useInvalidateFlow()
  return useMutation({ mutationFn: (orderItemId: string) => advanceKitchenItem(orderItemId), onSuccess: invalidate })
}

/** Espejo de useAdvanceKitchenItem hacia atrás — misma invalidación (también mueve inventario). */
export function useRevertKitchenItem() {
  const invalidate = useInvalidateFlow()
  return useMutation({ mutationFn: (orderItemId: string) => revertKitchenItem(orderItemId), onSuccess: invalidate })
}

export function useCancelKitchenOrder() {
  const invalidate = useInvalidateFlow()
  return useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason?: string }) => cancelKitchenOrder(orderId, reason),
    onSuccess: invalidate,
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
