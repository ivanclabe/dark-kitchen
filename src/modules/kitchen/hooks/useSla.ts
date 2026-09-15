import { useQuery } from '@tanstack/react-query'
import { getSlaSummary } from '../api/sla'

export function useSlaSummary(rangeStart: Date) {
  return useQuery({
    queryKey: ['kitchen-sla-summary', rangeStart.toISOString()],
    queryFn: () => getSlaSummary(rangeStart),
  })
}
