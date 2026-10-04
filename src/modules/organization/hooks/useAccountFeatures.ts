import { fetchAccountFeatureMatrix } from '@/shared/features/features'
import { useQuery } from '@tanstack/react-query'

/** The AI matrix of the active account (ADR 0024): one query, shared by the AI and voice panels. */
export function accountFeaturesKey(accountId: string) {
  return ['account', accountId, 'features'] as const
}

export function useAccountFeatureMatrix(accountId: string) {
  return useQuery({ queryKey: accountFeaturesKey(accountId), queryFn: fetchAccountFeatureMatrix })
}
