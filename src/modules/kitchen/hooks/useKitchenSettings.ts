import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getKitchenSlaSettings, updateKitchenSlaSettings } from '../api/kitchenSettings'
import type { SlaThresholds } from '../lib/ticketVisuals'

const SETTINGS_KEY = ['kitchen-sla-settings'] as const

/** thresholds llega undefined solo mientras carga la primera vez — los componentes usan DEFAULT_SLA_THRESHOLDS de fallback mientras tanto. */
export function useKitchenSlaSettings() {
  return useQuery({ queryKey: SETTINGS_KEY, queryFn: getKitchenSlaSettings, staleTime: 60_000 })
}

export function useUpdateKitchenSlaSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (thresholds: SlaThresholds) => updateKitchenSlaSettings(thresholds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }),
  })
}
