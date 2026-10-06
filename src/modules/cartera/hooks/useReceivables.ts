import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listPaymentsByCustomer, listReceivables, listReceivablesByCustomer, listRecentPayments, registerPayment, voidPayment } from '../api/receivables'
import type { RegisterPaymentInput } from '../types'

const RECEIVABLES_KEY = ['receivables'] as const
const PAYMENTS_KEY = ['payments'] as const

export function useReceivables(enabled = true) {
  return useQuery({ queryKey: RECEIVABLES_KEY, queryFn: listReceivables, enabled })
}

/** Under RECEIVABLES_KEY: a registered payment refreshes it too. */
export function useCustomerReceivables(customerId: string | null | undefined, enabled = true) {
  return useQuery({ queryKey: [...RECEIVABLES_KEY, 'by-customer', customerId], queryFn: () => listReceivablesByCustomer(customerId!), enabled: !!customerId && enabled })
}

export function usePaymentsByCustomer(customerId: string) {
  return useQuery({ queryKey: [...PAYMENTS_KEY, 'by-customer', customerId], queryFn: () => listPaymentsByCustomer(customerId), enabled: !!customerId })
}

export function useRecentPayments(limit = 8) {
  return useQuery({ queryKey: [...PAYMENTS_KEY, 'recent', limit], queryFn: () => listRecentPayments(limit) })
}

/** A payment changes the order, the receivables, the customer's balance and Inicio's cartera: all of them refresh. */
function useInvalidatePayments() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: RECEIVABLES_KEY })
    queryClient.invalidateQueries({ queryKey: PAYMENTS_KEY })
    queryClient.invalidateQueries({ queryKey: ['orders'] })
    // Balances of the customers list and detail (ADR 0028).
    queryClient.invalidateQueries({ queryKey: ['customers'] })
  }
}

export function useRegisterPayment() {
  const invalidate = useInvalidatePayments()
  return useMutation({ mutationFn: (input: RegisterPaymentInput) => registerPayment(input), onSuccess: invalidate })
}

/** ADR 0031: void a payment registered by mistake (a negative entry with its reason). */
export function useVoidPayment() {
  const invalidate = useInvalidatePayments()
  return useMutation({ mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) => voidPayment(paymentId, reason), onSuccess: invalidate })
}
