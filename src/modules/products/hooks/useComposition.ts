import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getComposition, saveComposition, type CompositionInput } from '../api/composition'

export const COMPOSITION_KEY = ['product-composition'] as const

/** ADR 0059: a dish's composition (admin, and the cashier choosing its options). */
export function useComposition(productId: string | null, enabled = true) {
  return useQuery({ queryKey: [...COMPOSITION_KEY, productId], queryFn: () => getComposition(productId as string), enabled: !!productId && enabled })
}

export function useSaveComposition(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (groups: CompositionInput[]) => saveComposition(productId, groups),
    onSuccess: (composition) => {
      queryClient.setQueryData([...COMPOSITION_KEY, productId], composition)
      // The public menu preview and the products list read it too.
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['public-menu'] })
    },
  })
}
