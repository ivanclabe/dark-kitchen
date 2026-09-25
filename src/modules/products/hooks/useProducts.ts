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
  uploadProductImage,
} from '../api/products'
import type { ProductInput } from '../types'

const PRODUCTS_KEY = ['products'] as const
const CATEGORIES_KEY = ['product-categories'] as const

export function useProducts() {
  return useQuery({ queryKey: PRODUCTS_KEY, queryFn: listProducts })
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

export function useUploadProductImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, file }: { productId: string; file: File }) => uploadProductImage(productId, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY }),
  })
}
