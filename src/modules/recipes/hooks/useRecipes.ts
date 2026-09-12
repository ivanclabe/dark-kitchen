import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createRecipeVersion, getActiveRecipe } from '../api/recipes'
import type { RecipeItemDraft } from '../types'

export function useActiveRecipe(productId: string) {
  return useQuery({
    queryKey: ['recipes', productId],
    queryFn: () => getActiveRecipe(productId),
    enabled: !!productId,
  })
}

export function useCreateRecipeVersion(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (items: RecipeItemDraft[]) => createRecipeVersion(productId, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes', productId] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}
