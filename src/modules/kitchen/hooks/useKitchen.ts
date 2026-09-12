import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { advanceKitchenItem, listKitchenQueue } from '../api/kitchen'

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
