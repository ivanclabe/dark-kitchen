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
  /** Copia de un plato de un menú maestro (la Cocina solo ajusta precio y disponibilidad). */
  masterProductId: string | null
  /** La Cocina fijó su propio precio (la sincronización del maestro no lo cambia). */
  priceIsLocal: boolean
}

export interface ProductInput {
  code?: string | null
  name: string
  description?: string | null
  categoryId?: string | null
  price: number
}
