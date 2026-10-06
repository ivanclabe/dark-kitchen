import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createRecipeVersion, getActiveRecipe, listDishesUsingIngredient } from '../api/recipes'
import type { RecipeItemDraft } from '../types'

export function useActiveRecipe(productId: string) {
  return useQuery({
    queryKey: ['recipes', productId],
    queryFn: () => getActiveRecipe(productId),
    enabled: !!productId,
  })
}

/** «Se usa en» of an ingredient (ADR 0031). */
export function useDishesUsingIngredient(ingredientId: string, enabled = true) {
  return useQuery({ queryKey: ['recipes', 'using', ingredientId], queryFn: () => listDishesUsingIngredient(ingredientId), enabled: !!ingredientId && enabled })
}

export function useCreateRecipeVersion(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (items: RecipeItemDraft[]) => createRecipeVersion(productId, items),
    onSuccess: () => {
      // Every recipe query: this dish's, and «Se usa en» of its ingredients.
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}
