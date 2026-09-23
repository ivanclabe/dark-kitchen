import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addPurchaseItem,
  confirmPurchase,
  createPurchase,
  deletePurchaseItem,
  getAttachmentUrl,
  getLastIngredientPrice,
  getPurchase,
  listAttachments,
  listPurchaseItems,
  listPurchases,
  uploadInvoiceAttachment,
} from '../api/purchases'
import type { PurchaseInput, PurchaseItemInput } from '../types'

export function usePurchases() {
  return useQuery({ queryKey: ['purchases'], queryFn: listPurchases })
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
    mutationFn: () => confirmPurchase(purchaseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      queryClient.invalidateQueries({ queryKey: ['ingredients'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
      queryClient.invalidateQueries({ queryKey: ['supply-suggestions'] })
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

export function useLastIngredientPrice(ingredientId: string) {
  return useQuery({
    queryKey: ['last-ingredient-price', ingredientId],
    queryFn: () => getLastIngredientPrice(ingredientId),
    enabled: !!ingredientId,
  })
}
