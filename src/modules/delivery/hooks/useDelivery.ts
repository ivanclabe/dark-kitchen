import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dispatchOrder, listDispatchedOrders, listReadyOrders, markDelivered } from '../api/deliveries'
import { createRider, listRiders, setRiderActive } from '../api/riders'
import type { RiderInput } from '../types'

export function useRiders() {
  return useQuery({ queryKey: ['riders'], queryFn: listRiders })
}

export function useCreateRider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RiderInput) => createRider(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['riders'] }),
  })
}

export function useSetRiderActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setRiderActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['riders'] }),
  })
}

export function useReadyOrders() {
  return useQuery({ queryKey: ['ready-orders'], queryFn: listReadyOrders, refetchInterval: 15_000 })
}

export function useDispatchedOrders() {
  return useQuery({ queryKey: ['dispatched-orders'], queryFn: listDispatchedOrders, refetchInterval: 15_000 })
}

function useInvalidateDeliveries() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['ready-orders'] })
    queryClient.invalidateQueries({ queryKey: ['dispatched-orders'] })
    queryClient.invalidateQueries({ queryKey: ['orders'] })
  }
}

export function useDispatchOrder() {
  const invalidate = useInvalidateDeliveries()
  return useMutation({
    mutationFn: ({ orderId, riderId, notes }: { orderId: string; riderId: string; notes?: string }) =>
      dispatchOrder(orderId, riderId, notes),
    onSuccess: invalidate,
  })
}

export function useMarkDelivered() {
  const invalidate = useInvalidateDeliveries()
  return useMutation({
    mutationFn: (orderId: string) => markDelivered(orderId),
    onSuccess: invalidate,
  })
}
