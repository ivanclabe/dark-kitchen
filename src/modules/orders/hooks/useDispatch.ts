import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createRider, dispatchOrder, listRiders, markDelivered, setRiderActive } from '../api/dispatch'
import type { RiderInput } from '../types'
import { useInvalidateOrders } from './useOrders'

const RIDERS_KEY = ['riders'] as const

export function useRiders() {
  return useQuery({ queryKey: RIDERS_KEY, queryFn: listRiders })
}

export function useCreateRider() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: (input: RiderInput) => createRider(input), onSuccess: () => queryClient.invalidateQueries({ queryKey: RIDERS_KEY }) })
}

export function useSetRiderActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setRiderActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RIDERS_KEY }),
  })
}

export function useDispatchOrder() {
  const invalidate = useInvalidateOrders()
  return useMutation({
    mutationFn: ({ orderId, riderId, notes }: { orderId: string; riderId: string; notes?: string }) => dispatchOrder(orderId, riderId, notes),
    onSuccess: () => invalidate(),
  })
}

export function useMarkDelivered() {
  const invalidate = useInvalidateOrders()
  return useMutation({ mutationFn: (orderId: string) => markDelivered(orderId), onSuccess: () => invalidate() })
}
