import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  discardInvoiceImport,
  getInvoiceFileUrl,
  getInvoiceImport,
  listIngredientPurchaseUnits,
  listPendingImports,
  savePurchaseFromImport,
} from '../api/invoiceImport'

export function usePendingImports(enabled = true) {
  return useQuery({ queryKey: ['invoice-imports', 'pending'], queryFn: listPendingImports, enabled })
}

export function useInvoiceImport(id: string | null) {
  return useQuery({
    queryKey: ['invoice-imports', id],
    queryFn: () => getInvoiceImport(id!),
    enabled: !!id,
    // While another tab (or a dropped connection) is still reading it.
    refetchInterval: (query) => (query.state.data?.status === 'LEYENDO' ? 3000 : false),
  })
}

export function useInvoiceFileUrl(path: string | null) {
  // Signed for 10 minutes: refreshed before it expires.
  return useQuery({ queryKey: ['invoice-file', path], queryFn: () => getInvoiceFileUrl(path!), enabled: !!path, staleTime: 8 * 60_000 })
}

export function useIngredientPurchaseUnits() {
  return useQuery({ queryKey: ['ingredient-purchase-units'], queryFn: listIngredientPurchaseUnits })
}

export function useDiscardImport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: discardInvoiceImport,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['invoice-imports'] }),
  })
}

export function useSavePurchaseFromImport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ importId, payload, confirm }: { importId: string; payload: unknown; confirm: boolean }) => savePurchaseFromImport(importId, payload, confirm),
    onSuccess: () => {
      for (const key of ['purchases', 'invoice-imports', 'suppliers', 'ingredients', 'inventory-movements', 'supply-suggestions', 'ingredient-purchase-units']) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
    },
  })
}
