import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createCustomer, listCustomers, updateCustomer } from '../api/customers'
import type { CustomerInput } from '../types'

const CUSTOMERS_KEY = ['customers'] as const

export function useCustomers() {
  return useQuery({ queryKey: CUSTOMERS_KEY, queryFn: listCustomers })
}

export function useCreateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CustomerInput) => createCustomer(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CUSTOMERS_KEY }),
  })
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CustomerInput }) => updateCustomer(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CUSTOMERS_KEY }),
  })
}
