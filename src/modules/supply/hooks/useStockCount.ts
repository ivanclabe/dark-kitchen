import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { applyCount, cancelCount, getOpenCount, listCountLines, listRecentCounts, setCountLine, startCount } from '../api/stockCounts'

const KEY = ['stock-counts'] as const

export function useOpenCount(enabled = true) {
  return useQuery({ queryKey: [...KEY, 'open'], queryFn: getOpenCount, enabled })
}

export function useRecentCounts(enabled = true) {
  return useQuery({ queryKey: [...KEY, 'recent'], queryFn: () => listRecentCounts(), enabled })
}

export function useCountLines(countId: string | null) {
  return useQuery({ queryKey: [...KEY, 'lines', countId], queryFn: () => listCountLines(countId!), enabled: !!countId })
}

export function useStartCount() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: startCount, onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }) })
}

/** Saves one line; the list is refreshed by the caller's optimistic state, so only the lines query is invalidated. */
export function useSetCountLine(countId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ lineId, quantity, unitId }: { lineId: string; quantity: number | null; unitId: string | null }) => setCountLine(lineId, quantity, unitId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...KEY, 'lines', countId] }),
  })
}

export function useApplyCount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: applyCount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY })
      queryClient.invalidateQueries({ queryKey: ['ingredients'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
      queryClient.invalidateQueries({ queryKey: ['supply-suggestions'] })
    },
  })
}

export function useCancelCount() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: cancelCount, onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }) })
}
