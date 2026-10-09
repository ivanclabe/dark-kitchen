// ADR 0042: types of the Quanela Consumer discovery engine. Pure TypeScript (no
// Deno, no network) so the app's tests and the Edge Function share it.

/** Availability of a dish right now, as dk_public_search_dishes computes it. */
export type Availability = 'available' | 'unknown' | 'later' | 'ended' | 'sold_out' | 'not_today' | 'closed'

export type DietaryTag = 'vegetarian' | 'vegan' | 'gluten_free' | 'spicy' | 'healthy'
export const DIETARY_TAGS: readonly DietaryTag[] = ['vegetarian', 'vegan', 'gluten_free', 'spicy', 'healthy']

export interface OpenState {
  state: 'open' | 'closed' | 'unconfigured'
  opens_at?: string
  closes_at?: string
}

/** Shared only when the account opts in; every value may be null (too few orders). */
export interface StorefrontMetrics {
  prep_minutes: number | null
  response_minutes: number | null
  delivery_minutes: number | null
  completion_rate: number | null
  active_orders: number | null
}

export interface PublicStorefront {
  slug: string
  name: string
  tagline: string | null
  cuisine: string | null
  open_state: OpenState | null
  timezone: string
  distance_km: number | null
  whatsapp_phone: string | null
  metrics: StorefrontMetrics | null
}

/** One dish exactly as dk_public_search_dishes returns it. */
export interface PublicDish {
  id: string
  name: string
  description: string | null
  category: string | null
  price: number
  regular_price: number | null
  currency: string
  image_path: string | null
  images: string[]
  dietary_tags: DietaryTag[]
  ingredients: string[] | null
  availability: Availability
  available_from: string | null
  available_until: string | null
  units_sold_30d: number | null
  rating: number | null
  review_count: number | null
  storefront: PublicStorefront
}

export type SortMode = 'best' | 'fastest' | 'cheapest' | 'popular' | 'nearest' | 'value'

export interface SearchFilters {
  maxPrice: number | null
  maxMinutes: number | null
  includeIngredients: string[]
  excludeIngredients: string[]
  tags: DietaryTag[]
  /** Asked for, but ratings do not exist in Quanela yet: kept only to say so. */
  minRating: number | null
  /** "cerca de mí": distance weighs more (only when both locations are known). */
  near: boolean
  storefront: string | null
}

/** What the conversation remembers between turns (kept on the device, validated on every turn). */
export interface ConversationState {
  /** Label of what is being looked for ("hamburguesas"), for the replies. */
  topic: string | null
  /** Folded search terms sent to the retriever. */
  terms: string[]
  /** Terms that make a dish a better match (from the concept, e.g. preferred tags). */
  preferTags: DietaryTag[]
  filters: SearchFilters
  sort: SortMode
  /** The dish being talked about: tapped, or the one recommended last. */
  focusId: string | null
  focusStorefront: string | null
  lastResultIds: string[]
  /** Whether the reply already asked how to sort (asked once per topic). */
  askedSort: boolean
  turn: number
}

export type QuestionKind = 'has_ingredient' | 'ingredients' | 'price' | 'time' | 'availability' | 'where' | 'details'

/** What one message says, before it is applied to the state. */
export interface IntentDelta {
  kind: 'search' | 'refine' | 'question' | 'select' | 'recommend' | 'history' | 'greeting' | 'help' | 'unknown'
  /** A new topic replaces the previous one. */
  topic?: string | null
  terms?: string[]
  preferTags?: DietaryTag[]
  sort?: SortMode
  maxPrice?: number | null
  maxMinutes?: number | null
  includeIngredients?: string[]
  excludeIngredients?: string[]
  tags?: DietaryTag[]
  minRating?: number | null
  wantsNear?: boolean
  question?: { kind: QuestionKind; ingredient?: string }
  /** 0-based position in the last results ("la segunda") or a storefront name. */
  select?: { index?: number; storefrontName?: string }
  /** Start over (drop filters) — "otra cosa", "mejor quiero…". */
  reset?: boolean
  /** Filters to drop — "sin límite de precio", "con o sin carne". */
  clear?: ('price' | 'time' | 'tags' | 'ingredients')[]
  /** Where the delta came from. */
  source: 'rules' | 'llm'
  /** The rules only guessed (a search from loose words): the model may read it better. */
  lowConfidence?: boolean
}

export interface ConsumerPreference {
  kind: 'avoid_ingredient' | 'like_ingredient' | 'dietary' | 'favorite_storefront' | 'favorite_product' | 'max_price' | 'max_minutes'
  value: string
}

export interface ConsumerProfile {
  profileConsent: boolean
  preferences: ConsumerPreference[]
}

/** Where the consumer is, only when they shared it. */
export interface ConsumerLocation {
  lat: number
  lng: number
}

export interface FactorScore {
  key: string
  /** 0..1, or null when unknown (then it does not count). */
  value: number | null
  weight: number
}

export interface RankedDish {
  dish: PublicDish
  score: number
  /** Share of the weight that was known (0..1). */
  coverage: number
  factors: FactorScore[]
  /** Evidence that the dish has / lacks what was asked: 'yes' | 'no' | 'unknown' per ingredient. */
  evidence: Record<string, 'yes' | 'no' | 'unknown'>
  badges: string[]
}

/** A card, with only what is known. */
export interface ResultCard {
  id: string
  name: string
  storefront: string
  storefrontSlug: string
  price: number
  regularPrice: number | null
  imagePath: string | null
  availability: Availability
  availabilityLabel: string
  minutes: number | null
  distanceKm: number | null
  rating: number | null
  badges: string[]
  reasons: string[]
}

export interface AssistantReply {
  text: string
  chips: string[]
  notes: string[]
  needsLocation: boolean
}

export interface AssistantResult {
  reply: AssistantReply
  results: ResultCard[]
  total: number
  state: ConversationState
  intentSource: 'rules' | 'llm'
}
