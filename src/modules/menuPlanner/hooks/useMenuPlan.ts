import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addMenuPlanItem,
  addMenuPlanItemForDates,
  copyMenuPlanRange,
  listMenuPlanRange,
  moveMenuPlanItem,
  removeMenuPlanItem,
  reorderMenuPlanDay,
  updateMenuPlanItemRules,
} from '../api/menuPlan'
import type { AddMenuPlanItemInput, MenuPlanItemRules } from '../types'

const MENU_PLAN_KEY = ['menu-plan'] as const

/** Un solo prefijo de query key para todo el planificador: cualquier mutación invalida todos los rangos cargados (semana actual, mes, etc.) — mismo patrón simple que ya usa el resto de la app (ver useProducts). */
export function useMenuPlanRange(startDate: string, endDateExclusive: string) {
  return useQuery({
    queryKey: [...MENU_PLAN_KEY, startDate, endDateExclusive],
    queryFn: () => listMenuPlanRange(startDate, endDateExclusive),
  })
}

function useInvalidatePlan() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: MENU_PLAN_KEY })
}

export function useAddMenuPlanItem() {
  const invalidate = useInvalidatePlan()
  return useMutation({
    mutationFn: ({ planDate, input }: { planDate: string; input: AddMenuPlanItemInput }) => addMenuPlanItem(planDate, input),
    onSuccess: invalidate,
  })
}

export function useAddMenuPlanItemForDates() {
  const invalidate = useInvalidatePlan()
  return useMutation({
    mutationFn: ({
      productId,
      dates,
      displayOrder,
      rules,
    }: {
      productId: string
      dates: string[]
      displayOrder: number
      rules?: Partial<MenuPlanItemRules>
    }) => addMenuPlanItemForDates(productId, dates, displayOrder, rules),
    onSuccess: invalidate,
  })
}

export function useUpdateMenuPlanItemRules() {
  const invalidate = useInvalidatePlan()
  return useMutation({
    mutationFn: ({ id, rules }: { id: string; rules: Partial<MenuPlanItemRules> }) => updateMenuPlanItemRules(id, rules),
    onSuccess: invalidate,
  })
}

export function useRemoveMenuPlanItem() {
  const invalidate = useInvalidatePlan()
  return useMutation({
    mutationFn: (id: string) => removeMenuPlanItem(id),
    onSuccess: invalidate,
  })
}

export function useMoveMenuPlanItem() {
  const invalidate = useInvalidatePlan()
  return useMutation({
    mutationFn: ({ id, planDate, displayOrder }: { id: string; planDate: string; displayOrder: number }) =>
      moveMenuPlanItem(id, planDate, displayOrder),
    onSuccess: invalidate,
  })
}

export function useReorderMenuPlanDay() {
  const invalidate = useInvalidatePlan()
  return useMutation({
    mutationFn: (items: { id: string; displayOrder: number }[]) => reorderMenuPlanDay(items),
    onSuccess: invalidate,
  })
}

export function useCopyMenuPlanRange() {
  const invalidate = useInvalidatePlan()
  return useMutation({
    mutationFn: ({ fromDate, toDate, days }: { fromDate: string; toDate: string; days: number }) => copyMenuPlanRange(fromDate, toDate, days),
    onSuccess: invalidate,
  })
}
