import { supabase } from '@/shared/lib/supabase'
import type { OptionChoice, OptionGroup, OptionPricing } from '@/shared/composition/composition'

// ADR 0059: a dish's composition, through the database functions (they check permissions, convert units
// and keep the ids that orders point to).

export interface AdminOption extends OptionChoice {
  active: boolean
  /** What one unit of the option consumes: an ingredient or preparation (in its base unit), or another dish's recipe. */
  componentIngredientId: string | null
  componentQuantity: number | null
  componentUnitId: string | null
  componentUnitQuantity: number | null
  componentProductId: string | null
  componentName: string | null
  componentUnitCode: string | null
  /** What one unit costs today. */
  unitCost: number
}

export interface AdminOptionGroup extends OptionGroup {
  options: AdminOption[]
}

export interface Composition {
  productId: string
  name: string
  price: number
  usesInventory: boolean
  masterCopy: boolean
  /** The dish's own recipe, today. */
  recipeCost: number
  groups: AdminOptionGroup[]
}

/** What is saved (ids kept for the options orders already point to). */
export interface CompositionInput {
  id?: string | null
  name: string
  minSelect: number
  maxSelect: number
  allowRepeat: boolean
  options: {
    id?: string | null
    name: string
    pricing: OptionPricing
    price: number
    isDefault: boolean
    active: boolean
    componentIngredientId?: string | null
    componentQuantity?: number | null
    componentUnitId?: string | null
    componentProductId?: string | null
  }[]
}

function toComposition(raw: Record<string, unknown>): Composition {
  const groups = ((raw.groups ?? []) as Record<string, unknown>[]).map((g) => ({
    id: String(g.id),
    name: String(g.name),
    minSelect: Number(g.minSelect),
    maxSelect: Number(g.maxSelect),
    allowRepeat: Boolean(g.allowRepeat),
    options: ((g.options ?? []) as Record<string, unknown>[]).map((o) => ({
      id: String(o.id),
      name: String(o.name),
      pricing: o.pricing as OptionPricing,
      price: Number(o.price ?? 0),
      isDefault: Boolean(o.isDefault),
      active: o.active !== false,
      available: o.available !== false,
      componentIngredientId: (o.componentIngredientId as string | null) ?? null,
      componentQuantity: o.componentQuantity == null ? null : Number(o.componentQuantity),
      componentUnitId: (o.componentUnitId as string | null) ?? null,
      componentUnitQuantity: o.componentUnitQuantity == null ? null : Number(o.componentUnitQuantity),
      componentProductId: (o.componentProductId as string | null) ?? null,
      componentName: (o.componentName as string | null) ?? null,
      componentUnitCode: (o.componentUnitCode as string | null) ?? null,
      unitCost: Number(o.unitCost ?? 0),
    })),
  }))
  return {
    productId: String(raw.productId),
    name: String(raw.name),
    price: Number(raw.price ?? 0),
    usesInventory: Boolean(raw.usesInventory),
    masterCopy: Boolean(raw.masterCopy),
    recipeCost: Number(raw.recipeCost ?? 0),
    groups,
  }
}

export async function getComposition(productId: string): Promise<Composition> {
  const { data, error } = await supabase.rpc('dk_product_composition', { p_product_id: productId })
  if (error) throw error
  return toComposition(data as Record<string, unknown>)
}

export async function saveComposition(productId: string, groups: CompositionInput[]): Promise<Composition> {
  const { data, error } = await supabase.rpc('dk_product_composition_save', {
    p_product_id: productId,
    p_groups: groups.map((g) => ({
      id: g.id ?? null,
      name: g.name,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      allowRepeat: g.allowRepeat,
      options: g.options.map((o) => ({
        id: o.id ?? null,
        name: o.name,
        pricing: o.pricing,
        price: o.pricing === 'extra' ? o.price : 0,
        isDefault: o.isDefault,
        active: o.active,
        componentIngredientId: o.componentIngredientId ?? null,
        componentQuantity: o.componentQuantity ?? null,
        componentUnitId: o.componentUnitId ?? null,
        componentProductId: o.componentProductId ?? null,
      })),
    })),
  })
  if (error) throw error
  return toComposition(data as Record<string, unknown>)
}
