import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchCatalogOptions, fetchInsights, fetchProductOrders, type InsightsQuery } from './api'

/** The figures of the screen; while a new period loads, the previous figures stay (no flicker). */
export function useInsights(query: InsightsQuery) {
  const { kitchen } = useActiveKitchen()
  return useQuery({
    queryKey: ['insights', kitchen.id, query],
    queryFn: () => fetchInsights(query),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}

export function useCatalogOptions() {
  const { kitchen } = useActiveKitchen()
  return useQuery({ queryKey: ['insights', kitchen.id, 'catalog'], queryFn: fetchCatalogOptions, staleTime: 5 * 60_000 })
}

export function useProductOrders(productId: string | null, from: string, to: string) {
  const { kitchen } = useActiveKitchen()
  return useQuery({
    queryKey: ['insights', kitchen.id, 'product-orders', productId, from, to],
    queryFn: () => fetchProductOrders(productId!, from, to),
    enabled: productId !== null,
  })
}
