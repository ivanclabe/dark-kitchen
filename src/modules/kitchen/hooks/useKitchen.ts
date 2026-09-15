import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { advanceKitchenItem, listKitchenQueue, setTicketPriority } from '../api/kitchen'
import type { KitchenItemStatus, KitchenTicketItem } from '../types'

const KITCHEN_KEY = ['kitchen-queue'] as const

export function useKitchenQueue() {
  return useQuery({ queryKey: KITCHEN_KEY, queryFn: listKitchenQueue, refetchInterval: 15_000 })
}

export function useAdvanceKitchenItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderItemId: string) => advanceKitchenItem(orderItemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KITCHEN_KEY })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['ingredients'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
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

/**
 * Avanza los ítems de un ticket hasta un status objetivo, llamando
 * useAdvanceKitchenItem secuencialmente (nunca en paralelo: evita que dos
 * llamadas concurrentes lean el mismo "¿ya están todos LISTO?" desactualizado
 * y ninguna de las dos cierre el pedido — ver Iteración 3). Única
 * implementación de "avanzar todo el ticket"; la usan tanto los botones
 * "Iniciar todo"/"Marcar todo listo" como el motor de comandos de voz.
 */
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
