import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createSupplier,
  listSuppliers,
  setSupplierActive,
  updateSupplier,
} from '../api/suppliers'
import type { SupplierInput } from '../types'

const SUPPLIERS_KEY = ['suppliers'] as const

export function useSuppliers() {
  return useQuery({ queryKey: SUPPLIERS_KEY, queryFn: listSuppliers })
}

export function useCreateSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SupplierInput) => createSupplier(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SUPPLIERS_KEY }),
  })
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SupplierInput }) => updateSupplier(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SUPPLIERS_KEY }),
  })
}

export function useSetSupplierActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setSupplierActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SUPPLIERS_KEY }),
  })
}
