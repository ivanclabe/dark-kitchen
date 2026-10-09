import { CATEGORIES } from '@/modules/organization/lib/business'
import { supabase } from '@/shared/lib/supabase'
import type { Json } from '@/types/database'

/**
 * Quanela Consumer (ADR 0042, module since ADR 0046): what the ACTIVE account publishes for end
 * customers. Everything goes through dk_storefront_* (storefront.manage); the
 * public app only ever reads what is published here.
 */

/**
 * The cuisines (ADR 0047): the same list as the organization's category — one
 * list, not two. The cuisine itself is the account's (Configuración → General).
 */
export const CUISINES: readonly { value: string; label: string }[] = CATEGORIES

export const DIETARY_TAGS: { value: string; label: string }[] = [
  { value: 'vegetarian', label: 'Vegetariano' },
  { value: 'vegan', label: 'Vegano' },
  { value: 'gluten_free', label: 'Sin gluten' },
  { value: 'spicy', label: 'Picante' },
  { value: 'healthy', label: 'Saludable' },
]

/** What Quanela Consumer stores of its own (ADR 0047): the rest is the account's. */
export interface StorefrontData {
  published: boolean
  tagline: string | null
  latitude: number | null
  longitude: number | null
  whatsapp_phone: string | null
  share_metrics: boolean
}

/** As read: plus the name, the public address and the cuisine, inherited from the account. */
export interface StorefrontRead extends StorefrontData {
  public_slug: string
  display_name: string
  cuisine: string | null
  published_at: string | null
}

export interface StorefrontProduct {
  id: string
  name: string
  category: string | null
  price: number
  image_path: string | null
  has_description: boolean
  has_recipe: boolean
  published: boolean
  dietary_tags: string[]
  show_ingredients: boolean
}

export interface StorefrontMetricsPreview {
  prep_minutes: number | null
  prep_sample: number
  response_minutes: number | null
  response_sample: number
  delivery_minutes: number | null
  completion_rate: number | null
  completion_sample: number
}

export interface StorefrontState {
  storefront: StorefrontRead | null
  defaults: { display_name: string; public_slug: string; cuisine: string | null }
  /** The account's identity (ADR 0047): its cuisine (null = like the organization) and the organization's. */
  account: { name: string; slug: string; cuisine: string | null; organization_cuisine: string | null }
  open_state: { state: 'open' | 'closed' | 'unconfigured' } | null
  metrics: StorefrontMetricsPreview
  products: StorefrontProduct[]
}

export const storefrontKey = (kitchenId: string) => ['storefront', kitchenId] as const

export async function fetchStorefront(): Promise<StorefrontState> {
  const { data, error } = await supabase.rpc('dk_storefront_get')
  if (error) throw error
  return data as unknown as StorefrontState
}

export async function saveStorefront(data: StorefrontData): Promise<void> {
  const { error } = await supabase.rpc('dk_storefront_save', { p_data: data as unknown as Json })
  if (error) throw error
}

export async function saveStorefrontProducts(items: { product_id: string; published: boolean; dietary_tags: string[]; show_ingredients: boolean }[]): Promise<void> {
  const { error } = await supabase.rpc('dk_storefront_products_save', { p_items: items as unknown as Json })
  if (error) throw error
}
