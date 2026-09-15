import { useQuery } from '@tanstack/react-query'
import { getSlaSummary } from '../api/sla'

export function useSlaSummary(rangeStart: Date, lateThresholdMin: number) {
  return useQuery({
    queryKey: ['kitchen-sla-summary', rangeStart.toISOString(), lateThresholdMin],
    queryFn: () => getSlaSummary(rangeStart, lateThresholdMin),
  })
}
