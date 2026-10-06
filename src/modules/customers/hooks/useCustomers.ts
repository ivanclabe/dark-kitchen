import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createCustomer, fetchCustomerDetail, fetchCustomersSummary, listCustomers, listCustomersPage, updateCustomer } from '../api/customers'
import type { CustomerInput, CustomerListQuery } from '../types'

const CUSTOMERS_KEY = ['customers'] as const

export function useCustomers() {
  return useQuery({ queryKey: CUSTOMERS_KEY, queryFn: listCustomers })
}

/** One page of the list; while the next page or a new search loads, the current rows stay (no jumps). */
export function useCustomersPage(query: CustomerListQuery) {
  return useQuery({ queryKey: [...CUSTOMERS_KEY, 'page', query], queryFn: () => listCustomersPage(query), placeholderData: keepPreviousData })
}

export function useCustomersSummary(enabled = true) {
  return useQuery({ queryKey: [...CUSTOMERS_KEY, 'summary'], queryFn: fetchCustomersSummary, enabled })
}

export function useCustomerDetail(id: string | undefined) {
  return useQuery({ queryKey: [...CUSTOMERS_KEY, 'detail', id], queryFn: () => fetchCustomerDetail(id!), enabled: !!id })
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
