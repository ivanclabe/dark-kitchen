import { supabase } from '@/shared/lib/supabase'
import type {
  IngredientUsage,
  Preparation,
  PreparationDetail,
  PreparationVersionInput,
  ProductionInput,
  ProductionResult,
} from '../types/preparations'

// ADR 0057: everything goes through the database functions — they check the
// permissions, convert units, and keep each batch's movements and costs together.

/* The functions answer numbers as JSON numbers already; Number() guards the odd string. */
function toPreparation(raw: Record<string, unknown>): Preparation {
  const recipe = raw.recipe as Record<string, unknown> | null
  return {
    id: String(raw.id),
    code: String(raw.code),
    name: String(raw.name),
    active: Boolean(raw.active),
    baseUnitId: String(raw.baseUnitId),
    baseUnitCode: String(raw.baseUnitCode),
    stockOnHand: Number(raw.stockOnHand ?? 0),
    stockAvailable: Number(raw.stockAvailable ?? 0),
    minStock: Number(raw.minStock ?? 0),
    belowMin: Boolean(raw.belowMin),
    avgCost: Number(raw.avgCost ?? 0),
    theoreticalUnitCost: raw.theoreticalUnitCost == null ? null : Number(raw.theoreticalUnitCost),
    portion: raw.portion == null ? null : Number(raw.portion),
    recipe: recipe
      ? {
          id: String(recipe.id),
          version: Number(recipe.version),
          yieldQuantity: Number(recipe.yieldQuantity),
          yieldUnitCode: (recipe.yieldUnitCode as string | null) ?? null,
          yieldUnitQuantity: recipe.yieldUnitQuantity == null ? null : Number(recipe.yieldUnitQuantity),
          createdAt: String(recipe.createdAt),
        }
      : null,
    usedIn: Number(raw.usedIn ?? 0),
    lastBatchAt: (raw.lastBatchAt as string | null) ?? null,
  }
}

export async function listPreparations(): Promise<Preparation[]> {
  const { data, error } = await supabase.rpc('dk_preparation_list')
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map(toPreparation)
}

export async function getPreparation(id: string): Promise<PreparationDetail> {
  const { data, error } = await supabase.rpc('dk_preparation_detail', { p_ingredient_id: id })
  if (error) throw error
  const raw = data as Record<string, unknown>
  return {
    ...toPreparation(raw),
    items: raw.items as PreparationDetail['items'],
    tree: raw.tree as PreparationDetail['tree'],
    usage: raw.usage as IngredientUsage,
    batches: raw.batches as PreparationDetail['batches'],
  }
}

/** Where an ingredient is used (dishes, also through preparations, and preparations). */
export async function getIngredientUsage(ingredientId: string): Promise<IngredientUsage> {
  const { data, error } = await supabase.rpc('dk_ingredient_usage', { p_ingredient_id: ingredientId })
  if (error) throw error
  return data as unknown as IngredientUsage
}

export async function createPreparation(input: { name: string; baseUnitId: string; code?: string | null }): Promise<string> {
  const { data, error } = await supabase.rpc('dk_create_preparation', {
    p_name: input.name,
    p_base_unit_id: input.baseUnitId,
    p_code: input.code ?? undefined,
  })
  if (error) throw error
  return data as string
}

export async function createPreparationVersion(ingredientId: string, input: PreparationVersionInput): Promise<void> {
  const { error } = await supabase.rpc('dk_create_preparation_version', {
    p_ingredient_id: ingredientId,
    p_items: input.items.map((i) => ({ ingredient_id: i.ingredientId, quantity: i.quantity, unit_id: i.unitId ?? null })),
    p_yield: input.yieldQuantity,
    p_yield_unit_id: input.yieldUnitId ?? undefined,
    p_portion: input.portion ?? undefined,
    p_portion_unit_id: input.portionUnitId ?? undefined,
  })
  if (error) throw error
}

export async function registerProduction(ingredientId: string, input: ProductionInput): Promise<ProductionResult> {
  const { data, error } = await supabase.rpc('dk_register_production', {
    p_ingredient_id: ingredientId,
    p_batches: input.batches,
    p_actual_yield: input.actualYield ?? undefined,
    p_yield_unit_id: input.yieldUnitId ?? undefined,
    p_observation: input.observation ?? undefined,
  })
  if (error) throw error
  return data as unknown as ProductionResult
}

export async function voidProduction(batchId: string, reason: string | null): Promise<void> {
  const { error } = await supabase.rpc('dk_void_production', { p_batch_id: batchId, p_reason: reason ?? undefined })
  if (error) throw error
}
