import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listMovements, registerAdjustment, registerWaste } from '../api/movements'
import type { WasteReason } from '../types'

export function useMovements(ingredientId?: string) {
  return useQuery({
    queryKey: ['inventory-movements', ingredientId ?? 'all'],
    queryFn: () => listMovements(ingredientId),
  })
}

function useInvalidateAfterMovement() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
    queryClient.invalidateQueries({ queryKey: ['ingredients'] })
  }
}

export function useRegisterWaste() {
  const invalidate = useInvalidateAfterMovement()
  return useMutation({
    mutationFn: ({
      ingredientId,
      quantity,
      reason,
      observation,
    }: {
      ingredientId: string
      quantity: number
      reason: WasteReason
      observation?: string
    }) => registerWaste(ingredientId, quantity, reason, observation),
    onSuccess: invalidate,
  })
}

export function useRegisterAdjustment() {
  const invalidate = useInvalidateAfterMovement()
  return useMutation({
    mutationFn: ({
      ingredientId,
      quantity,
      observation,
    }: {
      ingredientId: string
      quantity: number
      observation?: string
    }) => registerAdjustment(ingredientId, quantity, observation),
    onSuccess: invalidate,
  })
}
