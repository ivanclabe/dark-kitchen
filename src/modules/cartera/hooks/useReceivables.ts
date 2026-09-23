import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listPaymentsByCustomer, listReceivables, listRecentPayments, registerPayment } from '../api/receivables'
import type { RegisterPaymentInput } from '../types'

const RECEIVABLES_KEY = ['receivables'] as const
const PAYMENTS_KEY = ['payments'] as const

export function useReceivables(enabled = true) {
  return useQuery({ queryKey: RECEIVABLES_KEY, queryFn: listReceivables, enabled })
}

export function usePaymentsByCustomer(customerId: string) {
  return useQuery({ queryKey: [...PAYMENTS_KEY, 'by-customer', customerId], queryFn: () => listPaymentsByCustomer(customerId), enabled: !!customerId })
}

export function useRecentPayments(limit = 8) {
  return useQuery({ queryKey: [...PAYMENTS_KEY, 'recent', limit], queryFn: () => listRecentPayments(limit) })
}

export function useRegisterPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RegisterPaymentInput) => registerPayment(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECEIVABLES_KEY })
      queryClient.invalidateQueries({ queryKey: PAYMENTS_KEY })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}
