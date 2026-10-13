export interface RecipeItem {
  ingredientId: string
  ingredientName: string
  baseUnitCode: string
  /** In the ingredient's base unit: what it consumes and costs. */
  quantity: number
  /** ADR 0056: the unit the line was written in, and what was written (null = the base unit). */
  unitCode: string | null
  unitQuantity: number | null
}

export interface ActiveRecipe {
  recipeId: string
  version: number
  items: RecipeItem[]
}

export interface RecipeItemDraft {
  ingredientId: string
  /** As typed, in `unitId` (or in the base unit when there is none). */
  quantity: number
  /** ADR 0056: the unit the person chose; the database converts to the base unit. */
  unitId?: string | null
}
