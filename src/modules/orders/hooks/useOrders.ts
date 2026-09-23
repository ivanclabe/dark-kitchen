import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addOrderItem, listOrderItems, removeOrderItem } from '../api/orderItems'
import {
  cancelOrder,
  confirmOrder,
  createOrder,
  getOrder,
  listOrders,
  listOrdersByCustomer,
  listOrderStatusHistory,
  updateOrder,
} from '../api/orders'
import type { OrderInput, OrderItemInput } from '../types'

/**
 * Prefijo de las queries del tablero de Cocina (ver kitchen/hooks/useKitchen.ts).
 * Crear, editar, confirmar o cancelar un pedido cambia lo que muestra el
 * tablero; sin esto la tarjeta tardaba hasta 15 s (el próximo polling) en moverse.
 */
const KITCHEN_FLOW_PREFIX = ['kitchen-queue'] as const

export function useOrders() {
  return useQuery({ queryKey: ['orders'], queryFn: listOrders })
}

export function useOrder(id: string) {
  return useQuery({ queryKey: ['orders', id], queryFn: () => getOrder(id), enabled: !!id })
}

export function useOrdersByCustomer(customerId: string) {
  return useQuery({ queryKey: ['orders', 'by-customer', customerId], queryFn: () => listOrdersByCustomer(customerId), enabled: !!customerId })
}

export function useOrderStatusHistory(orderId: string) {
  return useQuery({
    queryKey: ['order-status-history', orderId],
    queryFn: () => listOrderStatusHistory(orderId),
    enabled: !!orderId,
  })
}

export function useOrderItems(orderId: string) {
  return useQuery({ queryKey: ['order-items', orderId], queryFn: () => listOrderItems(orderId), enabled: !!orderId })
}

export function useCreateOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: OrderInput) => createOrder(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: KITCHEN_FLOW_PREFIX })
    },
  })
}

export function useUpdateOrder(orderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: OrderInput) => updateOrder(orderId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['orders', orderId] })
    },
  })
}

export function useAddOrderItem(orderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: OrderItemInput) => addOrderItem(orderId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-items', orderId] })
      queryClient.invalidateQueries({ queryKey: ['orders', orderId] })
      queryClient.invalidateQueries({ queryKey: KITCHEN_FLOW_PREFIX })
    },
  })
}

export function useRemoveOrderItem(orderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => removeOrderItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-items', orderId] })
      queryClient.invalidateQueries({ queryKey: ['orders', orderId] })
      queryClient.invalidateQueries({ queryKey: KITCHEN_FLOW_PREFIX })
    },
  })
}

export function useConfirmOrder(orderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => confirmOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['orders', orderId] })
      queryClient.invalidateQueries({ queryKey: ['order-items', orderId] })
      queryClient.invalidateQueries({ queryKey: ['order-status-history', orderId] })
      queryClient.invalidateQueries({ queryKey: ['ingredients'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
      queryClient.invalidateQueries({ queryKey: KITCHEN_FLOW_PREFIX })
    },
  })
}

export function useCancelOrder(orderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reason?: string) => cancelOrder(orderId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['orders', orderId] })
      queryClient.invalidateQueries({ queryKey: ['order-status-history', orderId] })
      queryClient.invalidateQueries({ queryKey: ['ingredients'] })
      queryClient.invalidateQueries({ queryKey: KITCHEN_FLOW_PREFIX })
    },
  })
}
