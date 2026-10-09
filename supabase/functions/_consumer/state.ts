// ADR 0042: the conversation's memory. A pure reducer: (state, what the message
// says) → new state. The state travels with every turn and is validated here,
// so a tampered state can only narrow a search, never reach private data.

import { DIETARY_TAGS, type ConversationState, type DietaryTag, type IntentDelta, type SearchFilters, type SortMode } from './types.ts'

const SORTS: readonly SortMode[] = ['best', 'fastest', 'cheapest', 'popular', 'nearest', 'value']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function emptyFilters(): SearchFilters {
  return { maxPrice: null, maxMinutes: null, includeIngredients: [], excludeIngredients: [], tags: [], minRating: null, near: false, storefront: null }
}

export function initialState(): ConversationState {
  return {
    topic: null,
    terms: [],
    preferTags: [],
    filters: emptyFilters(),
    sort: 'best',
    focusId: null,
    focusStorefront: null,
    lastResultIds: [],
    askedSort: false,
    turn: 0,
  }
}

function strings(value: unknown, max: number, maxLen = 40): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((v): v is string => typeof v === 'string').map((v) => v.trim().toLowerCase().slice(0, maxLen)).filter(Boolean))].slice(0, max)
}

function num(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null
}

function tags(value: unknown): DietaryTag[] {
  return strings(value, 5).filter((t): t is DietaryTag => (DIETARY_TAGS as readonly string[]).includes(t))
}

/** Accept a state from the device only in its expected shape; anything else is dropped. */
export function sanitizeState(raw: unknown): ConversationState {
  const base = initialState()
  if (!raw || typeof raw !== 'object') return base
  const s = raw as Record<string, unknown>
  const f = (s.filters && typeof s.filters === 'object' ? s.filters : {}) as Record<string, unknown>
  return {
    topic: typeof s.topic === 'string' ? s.topic.slice(0, 80) : null,
    terms: strings(s.terms, 20),
    preferTags: tags(s.preferTags),
    filters: {
      maxPrice: num(f.maxPrice, 1, 10_000_000),
      maxMinutes: num(f.maxMinutes, 1, 600),
      includeIngredients: strings(f.includeIngredients, 8),
      excludeIngredients: strings(f.excludeIngredients, 8),
      tags: tags(f.tags),
      minRating: num(f.minRating, 0, 5),
      near: f.near === true,
      storefront: typeof f.storefront === 'string' && /^[a-z0-9-]{3,60}$/.test(f.storefront) ? f.storefront : null,
    },
    sort: SORTS.includes(s.sort as SortMode) ? (s.sort as SortMode) : 'best',
    focusId: typeof s.focusId === 'string' && UUID.test(s.focusId) ? s.focusId : null,
    focusStorefront: typeof s.focusStorefront === 'string' ? s.focusStorefront.slice(0, 80) : null,
    lastResultIds: strings(s.lastResultIds, 30, 36).filter((id) => UUID.test(id)),
    askedSort: s.askedSort === true,
    turn: num(s.turn, 0, 10_000) ?? 0,
  }
}

function merge(list: string[], add: string[] | undefined, remove: string[] = []): string[] {
  return [...new Set([...list.filter((x) => !remove.includes(x)), ...(add ?? [])])]
}

/**
 * Apply what a message says. A new topic keeps the person's own constraints
 * (dietary tags, ingredients to avoid, price and time limits) and drops the
 * previous sort; "otra cosa" starts over.
 */
export function applyIntent(state: ConversationState, delta: IntentDelta): ConversationState {
  let next: ConversationState = { ...state, filters: { ...state.filters }, turn: state.turn + 1 }

  if (delta.reset) next = { ...initialState(), turn: next.turn }

  if (delta.kind === 'search' && delta.terms?.length) {
    const isNewTopic = delta.topic !== state.topic
    next.topic = delta.topic ?? next.topic
    next.terms = delta.terms
    next.preferTags = delta.preferTags ?? []
    if (isNewTopic) {
      next.sort = 'best'
      next.askedSort = false
      next.focusId = null
      next.focusStorefront = null
      next.filters.includeIngredients = []
      next.filters.storefront = null
    }
  }
  if (delta.kind === 'recommend' && !delta.reset) {
    next.sort = 'best'
  }

  const f = next.filters
  for (const c of delta.clear ?? []) {
    if (c === 'price') f.maxPrice = null
    if (c === 'time') f.maxMinutes = null
    if (c === 'tags') f.tags = []
    if (c === 'ingredients') {
      f.includeIngredients = []
      f.excludeIngredients = []
    }
  }
  if (delta.sort) next.sort = delta.sort
  if (delta.maxPrice !== undefined && delta.maxPrice !== null) f.maxPrice = delta.maxPrice
  if (delta.maxMinutes !== undefined && delta.maxMinutes !== null) f.maxMinutes = delta.maxMinutes
  if (delta.minRating !== undefined && delta.minRating !== null) f.minRating = delta.minRating
  if (delta.wantsNear) f.near = true
  if (delta.tags) f.tags = merge(f.tags, delta.tags) as DietaryTag[]
  if (delta.excludeIngredients) {
    f.excludeIngredients = merge(f.excludeIngredients, delta.excludeIngredients)
    f.includeIngredients = f.includeIngredients.filter((i) => !delta.excludeIngredients!.includes(i))
  }
  if (delta.includeIngredients) {
    f.includeIngredients = merge(f.includeIngredients, delta.includeIngredients)
    f.excludeIngredients = f.excludeIngredients.filter((i) => !delta.includeIngredients!.includes(i))
  }
  // A refinement or a new search changes what is in focus: the reply sets it again.
  if (delta.kind === 'search' || delta.kind === 'refine' || delta.kind === 'recommend') {
    next.focusId = null
    next.focusStorefront = null
  }
  return next
}

/** The retriever's parameters for a state. */
export function searchParams(state: ConversationState, location: { lat: number; lng: number } | null) {
  return {
    terms: state.terms,
    max_price: state.filters.maxPrice ?? undefined,
    storefront: state.filters.storefront ?? undefined,
    lat: location?.lat,
    lng: location?.lng,
    limit: 150,
  }
}
