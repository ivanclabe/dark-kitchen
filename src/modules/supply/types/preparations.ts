// ADR 0057: preparations (sub-recipes) — ingredients made in batches from a recipe with a yield.

export interface PreparationRecipe {
  id: string
  version: number
  /** What one batch yields, in the preparation's base unit. */
  yieldQuantity: number
  /** What was typed («1,2 kg»), when it was not the base unit. */
  yieldUnitCode: string | null
  yieldUnitQuantity: number | null
  createdAt: string
}

export interface Preparation {
  id: string
  code: string
  name: string
  active: boolean
  baseUnitId: string
  baseUnitCode: string
  stockOnHand: number
  stockAvailable: number
  minStock: number
  /** Below its minimum: «Por preparar». */
  belowMin: boolean
  /** Real cost of its batches (or its recipe's while it has no stock), per base unit. */
  avgCost: number
  /** Its active recipe's cost per base unit, at today's prices. */
  theoreticalUnitCost: number | null
  /** Base units in one portion, when it has one. */
  portion: number | null
  recipe: PreparationRecipe | null
  /** Recipes (dishes and preparations) that carry it. */
  usedIn: number
  lastBatchAt: string | null
}

export interface PreparationItem {
  ingredientId: string
  code: string
  name: string
  isPreparation: boolean
  /** Per batch, in the component's base unit. */
  quantity: number
  unitCode: string
  enteredUnitId: string | null
  enteredUnitCode: string | null
  enteredQuantity: number | null
  avgCost: number
  lineCost: number
  stockAvailable: number
}

export interface PreparationTreeNode {
  ingredientId: string
  name: string
  quantity: number
  unitCode: string
  isPreparation: boolean
  children: PreparationTreeNode[]
}

export interface ProductionBatch {
  id: string
  createdAt: string
  createdBy: string | null
  batches: number
  recipeVersion: number
  expectedYield: number
  actualYield: number
  yieldUnitCode: string | null
  yieldUnitQuantity: number | null
  /** (real − expected) / expected, in %. */
  variancePct: number
  totalCost: number
  unitCost: number
  status: 'REGISTRADO' | 'ANULADO'
  observation: string | null
  voidReason: string | null
  voidedAt: string | null
  components: { name: string; quantity: number; unitCode: string; unitCost: number | null }[]
}

export interface IngredientUsage {
  /** Dishes whose active recipe carries it — directly, or through a preparation (`via`). */
  dishes: { productId: string; name: string; active: boolean; quantity: number | null; via: string | null }[]
  /** Preparations whose active recipe carries it directly. */
  preparations: { ingredientId: string; name: string; quantity: number }[]
}

export interface PreparationDetail extends Preparation {
  items: PreparationItem[]
  tree: PreparationTreeNode[]
  usage: IngredientUsage
  batches: ProductionBatch[]
}

export interface PreparationVersionInput {
  items: { ingredientId: string; quantity: number; unitId?: string | null }[]
  yieldQuantity: number
  yieldUnitId?: string | null
  /** Size of one portion (in `portionUnitId`, or the base unit); 0 removes it; undefined leaves it. */
  portion?: number | null
  portionUnitId?: string | null
}

export interface ProductionInput {
  batches: number
  /** What it really yielded (in `yieldUnitId`, or the base unit); empty = what the recipe says. */
  actualYield?: number | null
  yieldUnitId?: string | null
  observation?: string | null
}

export interface ProductionResult {
  batchId: string
  expectedYield: number
  actualYield: number
  totalCost: number
  unitCost: number
  unitCode: string
}
