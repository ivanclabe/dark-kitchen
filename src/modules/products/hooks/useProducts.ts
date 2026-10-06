import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createProduct,
  createProductCategory,
  listProductCategories,
  listProducts,
  resetProductPrice,
  setProductActive,
  updateProduct,
  updateProductPrice,
  listProductImages,
  saveProductImage,
  deleteProductImage,
  setMainProductImage,
  type ProductImage,
} from '../api/products'
import type { ProductImagePosition } from '../lib/productImages'
import type { ProductInput } from '../types'

const PRODUCTS_KEY = ['products'] as const
const CATEGORIES_KEY = ['product-categories'] as const

export function useProducts(enabled = true) {
  return useQuery({ queryKey: PRODUCTS_KEY, queryFn: listProducts, enabled })
}

export function useProductCategories() {
  return useQuery({ queryKey: CATEGORIES_KEY, queryFn: listProductCategories })
}

export function useCreateProductCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => createProductCategory(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  })
}

export function useCreateProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ProductInput) => createProduct(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY }),
  })
}

export function useUpdateProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProductInput }) => updateProduct(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY }),
  })
}

/** Precio propio de un plato de menú maestro (o volver al del maestro con price = null). */
export function useSetSharedProductPrice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, price }: { id: string; price: number | null }) => (price === null ? resetProductPrice(id) : updateProductPrice(id, price)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY }),
  })
}

export function useSetProductActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setProductActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY }),
  })
}

const productImagesKey = (productId: string) => ['product-images', productId] as const

export function useProductImages(productId: string | null | undefined) {
  return useQuery({
    queryKey: productImagesKey(productId ?? ''),
    queryFn: () => listProductImages(productId!),
    enabled: Boolean(productId),
  })
}

/** Photos change the dish card, the catalog and the week (main photo): refresh all three. */
function useAfterImageChange(productId: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: productImagesKey(productId) }),
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY }),
      queryClient.invalidateQueries({ queryKey: ['menu-plan'] }),
    ])
}

export function useSaveProductImage(productId: string) {
  const refresh = useAfterImageChange(productId)
  return useMutation({
    mutationFn: ({ position, file }: { position: ProductImagePosition; file: File }) => saveProductImage(productId, position, file),
    onSettled: refresh,
  })
}

export function useDeleteProductImage(productId: string) {
  const refresh = useAfterImageChange(productId)
  return useMutation({ mutationFn: (image: ProductImage) => deleteProductImage(image), onSettled: refresh })
}

export function useSetMainProductImage(productId: string) {
  const refresh = useAfterImageChange(productId)
  return useMutation({ mutationFn: (imageId: string) => setMainProductImage(imageId), onSettled: refresh })
}
