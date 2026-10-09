import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchStorefront, saveStorefront, saveStorefrontProducts, storefrontKey, type StorefrontData } from '../api/storefront'

/** What this account publishes in Quanela Consumer (one read for the three sections). */
export function useStorefront() {
  const { kitchen } = useActiveKitchen()
  return useQuery({ queryKey: storefrontKey(kitchen.id), queryFn: fetchStorefront })
}

export function useSaveStorefront() {
  const { kitchen } = useActiveKitchen()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: StorefrontData) => saveStorefront(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: storefrontKey(kitchen.id) }),
  })
}

export function useSaveStorefrontProducts() {
  const { kitchen } = useActiveKitchen()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: saveStorefrontProducts,
    onSuccess: () => qc.invalidateQueries({ queryKey: storefrontKey(kitchen.id) }),
  })
}
