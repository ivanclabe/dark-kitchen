import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addWeeklyMenuItem,
  copyWeeklyMenuDay,
  getTodayMenu,
  listWeeklyMenu,
  removeWeeklyMenuItem,
  setWeeklyMenuItemActive,
  setWeeklyMenuItemOrder,
} from '../api/weeklyMenu'
import type { DayOfWeek, WeeklyMenuItem } from '../types'

const key = (day: DayOfWeek) => ['weekly-menu', day] as const

export function useWeeklyMenu(day: DayOfWeek) {
  return useQuery({ queryKey: key(day), queryFn: () => listWeeklyMenu(day) })
}

export function useAddWeeklyMenuItem(day: DayOfWeek) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, displayOrder }: { productId: string; displayOrder: number }) =>
      addWeeklyMenuItem(day, productId, displayOrder),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(day) }),
  })
}

export function useRemoveWeeklyMenuItem(day: DayOfWeek) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => removeWeeklyMenuItem(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(day) }),
  })
}

export function useSetWeeklyMenuItemActive(day: DayOfWeek) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setWeeklyMenuItemActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(day) }),
  })
}

/** Intercambia el display_order entre un ítem y su vecino (↑/↓) — dos updates, nunca en paralelo. */
export function useMoveWeeklyMenuItem(day: DayOfWeek) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ items, id, direction }: { items: WeeklyMenuItem[]; id: string; direction: 'up' | 'down' }) => {
      const index = items.findIndex((item) => item.id === id)
      const swapIndex = direction === 'up' ? index - 1 : index + 1
      const current = items[index]
      const neighbor = items[swapIndex]
      if (!current || !neighbor) return
      await setWeeklyMenuItemOrder(current.id, neighbor.displayOrder)
      await setWeeklyMenuItemOrder(neighbor.id, current.displayOrder)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(day) }),
  })
}

export function useCopyWeeklyMenuDay(toDay: DayOfWeek) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (fromDay: DayOfWeek) => copyWeeklyMenuDay(fromDay, toDay),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(toDay) }),
  })
}

/** La misma fuente (dk_today_menu) que consumirá n8n — ver ../api/weeklyMenu.ts. */
export function useTodayWeeklyMenu() {
  return useQuery({ queryKey: ['today-weekly-menu'], queryFn: getTodayMenu })
}
