import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cancelShift, clockIn, clockOut, copyWeek, createShift, listOnShiftNow, listShifts, listStaffMembers, updateShift } from '../api/staff'
import type { ShiftInput } from '../types'

export const STAFF_KEY = ['staff'] as const

export function useStaffMembers(enabled = true) {
  return useQuery({ queryKey: [...STAFF_KEY, 'members'], queryFn: listStaffMembers, staleTime: 60_000, enabled })
}

export function useShifts(from: string, to: string, options: { userId?: string; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...STAFF_KEY, 'shifts', from, to, options.userId ?? 'all'],
    queryFn: () => listShifts(from, to, { userId: options.userId }),
    enabled: options.enabled ?? true,
  })
}

/** Who is on shift now (staff.view, or a dispatch permission for riders on shift). */
export function useOnShiftNow(enabled = true) {
  return useQuery({ queryKey: [...STAFF_KEY, 'now'], queryFn: listOnShiftNow, refetchInterval: 60_000, enabled, retry: false })
}

function useStaffMutation<T>(fn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries({ queryKey: STAFF_KEY }) })
}

export const useCreateShift = () => useStaffMutation((input: ShiftInput) => createShift(input))
export const useUpdateShift = () => useStaffMutation(({ id, input }: { id: string; input: ShiftInput }) => updateShift(id, input))
export const useCancelShift = () => useStaffMutation((id: string) => cancelShift(id))
export const useCopyWeek = () => useStaffMutation(({ from, to }: { from: string; to: string }) => copyWeek(from, to))
export const useClockIn = () => useStaffMutation(() => clockIn())
export const useClockOut = () => useStaffMutation(() => clockOut())
