import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addPurchaseItem,
  confirmPurchase,
  createPurchase,
  deletePurchaseItem,
  getAttachmentUrl,
  fetchPriceReferences,
  getPurchase,
  listAttachments,
  listPurchaseItems,
  listPurchases,
  updatePurchaseHeader,
  uploadInvoiceAttachment,
} from '../api/purchases'
import type { PurchasePayment } from '@/modules/finance/types'
import type { PurchaseHeaderInput, PurchaseInput, PurchaseItemInput } from '../types'

/** The page size of the purchases list (ADR 0030 D5). */
export const PURCHASES_PAGE = 50

/** The `limit` most recent purchases; «Cargar más» raises the limit and keeps the loaded ones on screen meanwhile. */
export function usePurchases(limit = PURCHASES_PAGE) {
  return useQuery({ queryKey: ['purchases', 'list', limit], queryFn: () => listPurchases({ limit }), placeholderData: keepPreviousData })
}

/** All the purchases of one supplier: its totals need every one, and they are few. */
export function useSupplierPurchases(supplierId: string) {
  return useQuery({ queryKey: ['purchases', 'supplier', supplierId], queryFn: async () => (await listPurchases({ supplierId })).rows, enabled: !!supplierId })
}

export function usePurchase(id: string) {
  return useQuery({ queryKey: ['purchases', id], queryFn: () => getPurchase(id), enabled: !!id })
}

export function usePurchaseItems(purchaseId: string) {
  return useQuery({
    queryKey: ['purchase-items', purchaseId],
    queryFn: () => listPurchaseItems(purchaseId),
    enabled: !!purchaseId,
  })
}

export function useAttachments(purchaseId: string) {
  return useQuery({
    queryKey: ['attachments', purchaseId],
    queryFn: () => listAttachments(purchaseId),
    enabled: !!purchaseId,
  })
}

export function useCreatePurchase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PurchaseInput) => createPurchase(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchases'] }),
  })
}

export function useAddPurchaseItem(purchaseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PurchaseItemInput) => addPurchaseItem(purchaseId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-items', purchaseId] }),
  })
}

export function useDeletePurchaseItem(purchaseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (itemId: string) => deletePurchaseItem(itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-items', purchaseId] }),
  })
}

export function useConfirmPurchase(purchaseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payment?: PurchasePayment) => confirmPurchase(purchaseId, payment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      queryClient.invalidateQueries({ queryKey: ['ingredients'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
      queryClient.invalidateQueries({ queryKey: ['supply-suggestions'] })
      queryClient.invalidateQueries({ queryKey: ['finance'] })
    },
  })
}

export function useUploadAttachment(purchaseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => uploadInvoiceAttachment(purchaseId, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attachments', purchaseId] }),
  })
}

export function useAttachmentUrl() {
  return useMutation({ mutationFn: (filePath: string) => getAttachmentUrl(filePath) })
}

export function useUpdatePurchaseHeader(purchaseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PurchaseHeaderInput) => updatePurchaseHeader(purchaseId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchases'] }),
  })
}

/** Price references (ADR 0063 D4) of a set of ingredients; one call for the whole set. */
export function usePriceReferences(ingredientIds: string[]) {
  const ids = [...new Set(ingredientIds.filter(Boolean))].sort()
  return useQuery({
    queryKey: ['price-references', ids],
    queryFn: () => fetchPriceReferences(ids),
    enabled: ids.length > 0,
    staleTime: 60_000,
  })
}
