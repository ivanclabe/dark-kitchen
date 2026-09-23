import { useQuery } from '@tanstack/react-query'
import { getDashboardSummary } from '../api/dashboard'

/** `enabled=false` para quien no tiene acceso al Dashboard (Cocina muestra "Ventas de hoy" solo a esos roles). */
export function useDashboardSummary(enabled = true) {
  return useQuery({ queryKey: ['dashboard-summary'], queryFn: getDashboardSummary, refetchInterval: 60_000, enabled })
}
