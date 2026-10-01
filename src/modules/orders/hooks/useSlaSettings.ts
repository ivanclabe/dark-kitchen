import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSlaSettings, updateSlaSettings } from '../api/slaSettings'
import type { SlaThresholds } from '../lib/orderVisuals'

const SETTINGS_KEY = ['kitchen-sla-settings'] as const

/** thresholds llega undefined solo mientras carga la primera vez — los componentes usan DEFAULT_SLA_THRESHOLDS de fallback mientras tanto. */
export function useSlaSettings() {
  return useQuery({ queryKey: SETTINGS_KEY, queryFn: getSlaSettings, staleTime: 60_000 })
}

export function useUpdateSlaSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (thresholds: SlaThresholds) => updateSlaSettings(thresholds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }),
  })
}
