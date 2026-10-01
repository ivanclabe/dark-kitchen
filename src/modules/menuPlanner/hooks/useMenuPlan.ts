import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
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
import type { AddMenuPlanItemInput, MenuPlanItem, MenuPlanItemRules } from '../types'

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

/**
 * Optimistic updates (ADR 0018): the week shows the change at once; if the
 * database rejects it, every loaded range goes back to how it was. Ranges are
 * the query keys ['menu-plan', start, endExclusive].
 */
type Snapshot = [QueryKey, MenuPlanItem[] | undefined][]

async function patchPlan(queryClient: QueryClient, patch: (items: MenuPlanItem[], start: string, end: string) => MenuPlanItem[]): Promise<Snapshot> {
  await queryClient.cancelQueries({ queryKey: MENU_PLAN_KEY })
  const snapshot = queryClient.getQueriesData<MenuPlanItem[]>({ queryKey: MENU_PLAN_KEY })
  for (const [key, data] of snapshot) {
    if (!data) continue
    const [, start, end] = key as [string, string, string]
    queryClient.setQueryData(key, patch(data, start, end))
  }
  return snapshot
}

function restore(queryClient: QueryClient, snapshot: Snapshot | undefined) {
  for (const [key, data] of snapshot ?? []) queryClient.setQueryData(key, data)
}

const inRange = (date: string, start: string, end: string) => date >= start && date < end

/** What the week needs to draw a dish before the database answers. */
export type PlanProductSnapshot = Pick<MenuPlanItem, 'productName' | 'productPrice' | 'productCategory' | 'productActive'> & { productImagePath?: string | null }

export function useAddMenuPlanItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ planDate, input }: { planDate: string; input: AddMenuPlanItemInput; product?: PlanProductSnapshot }) => addMenuPlanItem(planDate, input),
    onMutate: ({ planDate, input, product }) => {
      if (!product) return undefined
      const optimistic: MenuPlanItem = {
        id: `optimistic:${input.productId}:${planDate}`,
        planDate,
        productId: input.productId,
        ...product,
        productImagePath: product.productImagePath ?? null,
        displayOrder: input.displayOrder ?? 999,
        isActive: input.isActive ?? true,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        specialPrice: input.specialPrice ?? null,
        unitLimit: input.unitLimit ?? null,
        whileSuppliesLast: input.whileSuppliesLast ?? false,
      }
      return patchPlan(queryClient, (items, start, end) => (inRange(planDate, start, end) ? [...items, optimistic] : items))
    },
    onError: (_err, _vars, snapshot) => restore(queryClient, snapshot),
    onSettled: () => queryClient.invalidateQueries({ queryKey: MENU_PLAN_KEY }),
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
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => removeMenuPlanItem(id),
    onMutate: (id) => patchPlan(queryClient, (items) => items.filter((i) => i.id !== id)),
    onError: (_err, _id, snapshot) => restore(queryClient, snapshot),
    onSettled: () => queryClient.invalidateQueries({ queryKey: MENU_PLAN_KEY }),
  })
}

export function useMoveMenuPlanItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, planDate, displayOrder }: { id: string; planDate: string; displayOrder: number }) =>
      moveMenuPlanItem(id, planDate, displayOrder),
    onMutate: ({ id, planDate, displayOrder }) => {
      let moved: MenuPlanItem | undefined
      for (const [, data] of queryClient.getQueriesData<MenuPlanItem[]>({ queryKey: MENU_PLAN_KEY })) {
        moved ??= data?.find((i) => i.id === id)
      }
      return patchPlan(queryClient, (items, start, end) => {
        const rest = items.filter((i) => i.id !== id)
        return moved && inRange(planDate, start, end) ? [...rest, { ...moved, planDate, displayOrder }] : rest
      })
    },
    onError: (_err, _vars, snapshot) => restore(queryClient, snapshot),
    onSettled: () => queryClient.invalidateQueries({ queryKey: MENU_PLAN_KEY }),
  })
}

export function useReorderMenuPlanDay() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (items: { id: string; displayOrder: number }[]) => reorderMenuPlanDay(items),
    onMutate: (order) => {
      const byId = new Map(order.map((o) => [o.id, o.displayOrder]))
      return patchPlan(queryClient, (items) => items.map((i) => (byId.has(i.id) ? { ...i, displayOrder: byId.get(i.id)! } : i)))
    },
    onError: (_err, _vars, snapshot) => restore(queryClient, snapshot),
    onSettled: () => queryClient.invalidateQueries({ queryKey: MENU_PLAN_KEY }),
  })
}

export function useCopyMenuPlanRange() {
  const invalidate = useInvalidatePlan()
  return useMutation({
    mutationFn: ({ fromDate, toDate, days }: { fromDate: string; toDate: string; days: number }) => copyMenuPlanRange(fromDate, toDate, days),
    onSuccess: invalidate,
  })
}
