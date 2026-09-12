import { useQuery } from '@tanstack/react-query'
import { listUnits } from '@/shared/api/units'

export function useUnits() {
  return useQuery({ queryKey: ['units'], queryFn: listUnits, staleTime: 5 * 60_000 })
}
