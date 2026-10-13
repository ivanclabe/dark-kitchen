import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { INGREDIENT_PACKAGES_KEY } from '@/shared/hooks/useIngredientUnits'
import {
  createPreparation,
  createPreparationVersion,
  getIngredientUsage,
  getPreparation,
  listPreparations,
  registerProduction,
  voidProduction,
} from '../api/preparations'
import type { PreparationVersionInput, ProductionInput } from '../types/preparations'
import { SUGGESTIONS_KEY } from './useSuggestions'

export const PREPARATIONS_KEY = ['preparations'] as const

export function usePreparations(enabled = true) {
  return useQuery({ queryKey: PREPARATIONS_KEY, queryFn: listPreparations, enabled })
}

export function usePreparation(id: string | null) {
  return useQuery({ queryKey: [...PREPARATIONS_KEY, id], queryFn: () => getPreparation(id as string), enabled: !!id })
}

/** «Se usa en» of any ingredient: dishes (also through preparations) and preparations. */
export function useIngredientUsage(ingredientId: string, enabled = true) {
  return useQuery({ queryKey: ['recipes', 'usage', ingredientId], queryFn: () => getIngredientUsage(ingredientId), enabled: !!ingredientId && enabled })
}

/** A batch or a recipe moves stock, costs and recipes: everything that shows them is refreshed. */
function useInvalidateAll() {
  const queryClient = useQueryClient()
  return () => {
    for (const key of [PREPARATIONS_KEY, ['ingredients'], ['inventory-movements'], SUGGESTIONS_KEY, ['recipes'], ['products'], INGREDIENT_PACKAGES_KEY]) {
      void queryClient.invalidateQueries({ queryKey: key })
    }
  }
}

export function useCreatePreparation() {
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: createPreparation, onSuccess: invalidate })
}

export function useCreatePreparationVersion(ingredientId: string) {
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: (input: PreparationVersionInput) => createPreparationVersion(ingredientId, input), onSuccess: invalidate })
}

export function useRegisterProduction(ingredientId: string) {
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: (input: ProductionInput) => registerProduction(ingredientId, input), onSuccess: invalidate })
}

export function useVoidProduction() {
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: ({ batchId, reason }: { batchId: string; reason: string | null }) => voidProduction(batchId, reason), onSuccess: invalidate })
}
