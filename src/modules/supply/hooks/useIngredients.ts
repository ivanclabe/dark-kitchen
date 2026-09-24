import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createCategory, listCategories } from '../api/categories'
import {
  createIngredient,
  listIngredients,
  setIngredientActive,
  updateIngredient,
} from '../api/ingredients'
import type { IngredientInput } from '../types'

const INGREDIENTS_KEY = ['ingredients'] as const
const CATEGORIES_KEY = ['ingredient-categories'] as const

export function useIngredients() {
  return useQuery({ queryKey: INGREDIENTS_KEY, queryFn: listIngredients })
}

export function useCategories() {
  return useQuery({ queryKey: CATEGORIES_KEY, queryFn: listCategories })
}

export function useCreateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => createCategory(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  })
}

export function useCreateIngredient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: IngredientInput) => createIngredient(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: INGREDIENTS_KEY }),
  })
}

export function useUpdateIngredient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: IngredientInput }) => updateIngredient(id, input),
    // Mín./máx., proveedor y vida útil alimentan las sugerencias y señales de inventario.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INGREDIENTS_KEY })
      void queryClient.invalidateQueries({ queryKey: ['supply-suggestions'] })
    },
  })
}

export function useSetIngredientActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setIngredientActive(id, active),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INGREDIENTS_KEY })
      void queryClient.invalidateQueries({ queryKey: ['supply-suggestions'] })
    },
  })
}
