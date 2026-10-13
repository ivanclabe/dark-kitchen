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
    // dk_supply_suggestions se alimenta del ledger: un movimiento cambia el
    // stock y el ritmo de consumo, así que la sugerencia queda obsoleta.
    queryClient.invalidateQueries({ queryKey: ['supply-suggestions'] })
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
      unitId,
    }: {
      ingredientId: string
      quantity: number
      reason: WasteReason
      observation?: string
      unitId?: string | null
    }) => registerWaste(ingredientId, quantity, reason, observation, unitId),
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
      unitId,
    }: {
      ingredientId: string
      quantity: number
      observation?: string
      unitId?: string | null
    }) => registerAdjustment(ingredientId, quantity, observation, unitId),
    onSuccess: invalidate,
  })
}
