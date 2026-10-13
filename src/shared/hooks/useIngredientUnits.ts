import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { listIngredientPackages, type Unit } from '@/shared/api/units'
import { useUnits } from '@/shared/hooks/useUnits'
import type { IngredientUnitInfo } from '@/shared/units/conversion'

export const INGREDIENT_PACKAGES_KEY = ['ingredient-packages'] as const

/**
 * ADR 0056: what converting needs on screen — the units and each ingredient's
 * own packages. `infoFor` gives the conversion info of one ingredient.
 */
export function useIngredientUnits() {
  const units = useUnits()
  const packages = useQuery({ queryKey: INGREDIENT_PACKAGES_KEY, queryFn: listIngredientPackages, staleTime: 60_000 })
  return useMemo(() => {
    const list: Unit[] = units.data ?? []
    const infoFor = (ingredient: { id: string; baseUnitCode: string } | null | undefined): IngredientUnitInfo | null => {
      if (!ingredient) return null
      const base = list.find((u) => u.code === ingredient.baseUnitCode)
      if (!base) return null
      return { baseUnitCode: base.code, baseUnitType: base.unitType, purchaseUnits: packages.data?.get(ingredient.id) ?? [] }
    }
    return { units: list, infoFor, isLoading: units.isLoading || packages.isLoading }
  }, [units.data, units.isLoading, packages.data, packages.isLoading])
}
