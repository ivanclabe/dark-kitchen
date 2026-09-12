export interface RecipeItem {
  ingredientId: string
  ingredientName: string
  baseUnitCode: string
  quantity: number
}

export interface ActiveRecipe {
  recipeId: string
  version: number
  items: RecipeItem[]
}

export interface RecipeItemDraft {
  ingredientId: string
  quantity: number
}
