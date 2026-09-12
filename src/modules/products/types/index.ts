export interface ProductCategory {
  id: string
  name: string
}

export interface Product {
  id: string
  code: string | null
  name: string
  description: string | null
  categoryId: string | null
  categoryName: string | null
  price: number
  imagePath: string | null
  activeRecipeId: string | null
  activeRecipeVersion: number | null
  estimatedCost: number
  active: boolean
}

export interface ProductInput {
  code?: string | null
  name: string
  description?: string | null
  categoryId?: string | null
  price: number
}
