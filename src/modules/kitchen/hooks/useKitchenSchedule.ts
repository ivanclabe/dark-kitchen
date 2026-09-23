import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteHoursException, getKitchenSchedule, saveHoursException, saveWeeklyHours } from '../api/kitchenHours'
import type { DayHours, HoursException, WeekDay } from '../lib/schedule'

const SCHEDULE_KEY = ['kitchen-schedule'] as const

export function useKitchenSchedule() {
  return useQuery({ queryKey: SCHEDULE_KEY, queryFn: getKitchenSchedule, staleTime: 5 * 60_000 })
}

function useScheduleMutation<T>(mutationFn: (input: T) => Promise<void>) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn, onSuccess: () => queryClient.invalidateQueries({ queryKey: SCHEDULE_KEY }) })
}

export function useSaveWeeklyHours() {
  return useScheduleMutation((weekly: Record<WeekDay, DayHours>) => saveWeeklyHours(weekly))
}

export function useSaveHoursException() {
  return useScheduleMutation((exception: HoursException) => saveHoursException(exception))
}

export function useDeleteHoursException() {
  return useScheduleMutation((date: string) => deleteHoursException(date))
}
