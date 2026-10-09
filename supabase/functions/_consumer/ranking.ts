// ADR 0042: ranking. Each factor is an independent function → 0..1 or null
// (unknown). Unknown factors do not count: the score is the weighted mean of
// the known ones, times a small coverage term, so a dish with no data does not
// win just because nothing bad is known about it. Sort modes are weight presets.

import { fold, mentions } from './text.ts'
import type { ConsumerProfile, ConversationState, FactorScore, PublicDish, RankedDish, SortMode } from './types.ts'

export type FactorKey =
  | 'match' | 'availability' | 'prep' | 'response' | 'delivery' | 'completion' | 'popularity' | 'price' | 'distance' | 'personal' | 'load' | 'rating'

export const PRESETS: Record<SortMode, Partial<Record<FactorKey, number>>> = {
  best: { match: 0.3, availability: 0.15, prep: 0.1, response: 0.07, completion: 0.1, popularity: 0.08, price: 0.08, distance: 0.05, personal: 0.05, load: 0.02, rating: 0 },
  fastest: { prep: 0.35, response: 0.15, delivery: 0.05, availability: 0.15, match: 0.2, load: 0.05, completion: 0.05, popularity: 0.03 },
  cheapest: { price: 0.45, match: 0.25, availability: 0.15, completion: 0.05, popularity: 0.05, prep: 0.05 },
  popular: { popularity: 0.4, match: 0.25, availability: 0.15, completion: 0.1, prep: 0.05, price: 0.05 },
  nearest: { distance: 0.4, match: 0.25, availability: 0.15, prep: 0.1, completion: 0.05, price: 0.05 },
  value: { price: 0.3, popularity: 0.2, completion: 0.15, match: 0.2, availability: 0.15 },
}

/** Dishes that can be recommended now. The rest are only mentioned (e.g. "cerrado, abre a las…"). */
export const RECOMMENDABLE = new Set(['available', 'unknown', 'later'])

export interface RankContext {
  state: ConversationState
  profile: ConsumerProfile | null
  /** Ranges over the candidates, for relative factors. */
  minPrice: number
  maxPrice: number
  maxUnits: number | null
}

const clamp = (v: number) => Math.max(0, Math.min(1, v))

/** 'yes' / 'no' / 'unknown': does the dish have this ingredient, by what the account publishes? */
export function ingredientEvidence(dish: PublicDish, ingredient: string): 'yes' | 'no' | 'unknown' {
  if (mentions([dish.name, dish.description, ...(dish.ingredients ?? [])], ingredient)) return 'yes'
  return dish.ingredients ? 'no' : 'unknown'
}

/** How well the dish matches the words asked for: the best field wins (name > category > ingredients > description > cuisine). */
export function textMatch(dish: PublicDish, terms: string[]): number | null {
  if (!terms.length) return null
  const fields: [string, number][] = [
    [dish.name, 1],
    [dish.category ?? '', 0.8],
    [(dish.ingredients ?? []).join(' '), 0.6],
    [dish.description ?? '', 0.5],
    [dish.dietary_tags.join(' '), 0.5],
    [dish.storefront.cuisine ?? '', 0.35],
  ]
  let best = 0
  let hits = 0
  for (const term of terms) {
    const t = fold(term)
    let termBest = 0
    for (const [text, weight] of fields) if (text && fold(text).includes(t)) termBest = Math.max(termBest, weight)
    if (termBest > 0) hits++
    best = Math.max(best, termBest)
  }
  // Several asked-for words found (e.g. "hamburguesa doble") is a slightly better match.
  return clamp(best + Math.min(0.1, (hits - 1) * 0.05))
}

function factor(key: FactorKey, dish: PublicDish, ctx: RankContext, evidence: RankedDish['evidence']): number | null {
  const m = dish.storefront.metrics
  const f = ctx.state.filters
  switch (key) {
    case 'match': {
      let v = textMatch(dish, ctx.state.terms)
      if (v === null && !f.includeIngredients.length && !f.excludeIngredients.length && !ctx.state.preferTags.length) return null
      v = v ?? 0.5
      for (const ing of f.includeIngredients) v += evidence[ing] === 'yes' ? 0.15 : evidence[ing] === 'no' ? -0.3 : 0
      for (const ing of f.excludeIngredients) v += evidence[`-${ing}`] === 'no' ? 0.1 : evidence[`-${ing}`] === 'yes' ? -0.25 : 0
      if (ctx.state.preferTags.some((t) => dish.dietary_tags.includes(t))) v += 0.15
      return clamp(v)
    }
    case 'availability':
      return dish.availability === 'available' ? 1 : dish.availability === 'unknown' ? 0.5 : dish.availability === 'later' ? 0.3 : 0
    case 'prep':
      return m?.prep_minutes == null ? null : clamp((60 - m.prep_minutes) / 50)
    case 'response':
      return m?.response_minutes == null ? null : clamp((30 - m.response_minutes) / 28)
    case 'delivery':
      return m?.delivery_minutes == null ? null : clamp((60 - m.delivery_minutes) / 50)
    case 'completion':
      return m?.completion_rate == null ? null : clamp((m.completion_rate - 0.7) / 0.3)
    case 'popularity':
      return dish.units_sold_30d == null || !ctx.maxUnits ? null : clamp(dish.units_sold_30d / ctx.maxUnits)
    case 'price':
      return ctx.maxPrice > ctx.minPrice ? clamp(1 - (dish.price - ctx.minPrice) / (ctx.maxPrice - ctx.minPrice)) : 0.5
    case 'distance':
      return dish.storefront.distance_km == null ? null : clamp(1 - dish.storefront.distance_km / 10)
    case 'load':
      return m?.active_orders == null ? null : clamp(1 - m.active_orders / 15)
    case 'personal': {
      const prefs = ctx.profile?.profileConsent ? ctx.profile.preferences : []
      if (!prefs.length) return null
      let v = 0.5
      let relevant = false
      for (const p of prefs) {
        const value = fold(p.value)
        let delta = 0
        if (p.kind === 'favorite_storefront' && (value === dish.storefront.slug || value === fold(dish.storefront.name))) delta = 0.4
        if (p.kind === 'favorite_product' && (value === dish.id || value === fold(dish.name))) delta = 0.4
        if (p.kind === 'like_ingredient' && ingredientEvidence(dish, value) === 'yes') delta = 0.2
        if (p.kind === 'avoid_ingredient' && ingredientEvidence(dish, value) === 'yes') delta = -0.4
        if (p.kind === 'dietary' && dish.dietary_tags.includes(value as never)) delta = 0.2
        if (delta) {
          v += delta
          relevant = true
        }
      }
      return relevant ? clamp(v) : null
    }
    case 'rating':
      return null // Ratings do not exist in Quanela yet (ADR 0042 §5).
  }
}

/** Weights for a state: the sort preset, plus distance when the person asked for something near. */
export function weightsFor(state: ConversationState): Partial<Record<FactorKey, number>> {
  const w = { ...PRESETS[state.sort] }
  if (state.filters.near && state.sort !== 'nearest') w.distance = (w.distance ?? 0) + 0.15
  return w
}

export function scoreDish(dish: PublicDish, ctx: RankContext): RankedDish {
  const f = ctx.state.filters
  const evidence: RankedDish['evidence'] = {}
  for (const ing of f.includeIngredients) evidence[ing] = ingredientEvidence(dish, ing)
  for (const ing of f.excludeIngredients) evidence[`-${ing}`] = ingredientEvidence(dish, ing)

  const weights = weightsFor(ctx.state)
  const factors: FactorScore[] = (Object.entries(weights) as [FactorKey, number][])
    .filter(([, w]) => w > 0)
    .map(([key, weight]) => ({ key, weight, value: factor(key, dish, ctx, evidence) }))
  const total = factors.reduce((s, x) => s + x.weight, 0)
  const known = factors.filter((x) => x.value !== null)
  const knownWeight = known.reduce((s, x) => s + x.weight, 0)
  const mean = knownWeight ? known.reduce((s, x) => s + x.weight * (x.value as number), 0) / knownWeight : 0
  const coverage = total ? knownWeight / total : 0
  return { dish, score: mean * (0.85 + 0.15 * coverage), coverage, factors, evidence, badges: [] }
}

export interface FilterOutcome {
  /** Recommendable dishes that pass every hard filter. */
  kept: PublicDish[]
  /** Matching dishes that cannot be recommended now (closed, sold out…). */
  unavailable: PublicDish[]
  /** Why some dishes were left out, to tell the person. */
  dropped: { reason: 'time_unknown' | 'too_slow' | 'tags' | 'include_unconfirmed'; count: number }[]
  /** "con queso" could not be confirmed in any dish: the filter was relaxed. */
  includeRelaxed: boolean
  /** With a time limit: the fastest known total (prep + delivery) among those left out. */
  fastestMinutes: number | null
}

function hasTags(dish: PublicDish, tags: string[]): boolean {
  return tags.every((t) => dish.dietary_tags.includes(t as never) || (t === 'vegetarian' && dish.dietary_tags.includes('vegan')))
}

/** Hard filters. Unknown data never passes a filter that needs it — it is reported instead. */
export function applyFilters(dishes: PublicDish[], state: ConversationState): FilterOutcome {
  const f = state.filters
  const dropped: FilterOutcome['dropped'] = []
  const count = (reason: FilterOutcome['dropped'][number]['reason'], n: number) => n && dropped.push({ reason, count: n })

  let pool = dishes.filter((d) => f.maxPrice == null || d.price <= f.maxPrice)
  const tagged = pool.filter((d) => hasTags(d, f.tags))
  count('tags', pool.length - tagged.length)
  pool = tagged

  let fastestMinutes: number | null = null
  if (f.maxMinutes != null) {
    const minutes = (d: PublicDish) => {
      const m = d.storefront.metrics
      return m?.prep_minutes == null ? null : m.prep_minutes + (m.delivery_minutes ?? 0)
    }
    const known = pool.filter((d) => RECOMMENDABLE.has(d.availability)).map(minutes).filter((v): v is number => v !== null)
    fastestMinutes = known.length ? Math.min(...known) : null
    const orderable = pool.filter((d) => RECOMMENDABLE.has(d.availability))
    count('time_unknown', orderable.filter((d) => minutes(d) === null).length)
    count('too_slow', orderable.filter((d) => (minutes(d) ?? 0) > f.maxMinutes!).length)
    pool = pool.filter((d) => minutes(d) !== null && minutes(d)! <= f.maxMinutes!)
  }

  let includeRelaxed = false
  if (f.includeIngredients.length) {
    const confirmed = pool.filter((d) => f.includeIngredients.every((i) => ingredientEvidence(d, i) === 'yes'))
    const recommendableConfirmed = confirmed.filter((d) => RECOMMENDABLE.has(d.availability))
    if (recommendableConfirmed.length) {
      count('include_unconfirmed', pool.length - confirmed.length)
      pool = confirmed
    } else {
      includeRelaxed = true
      pool = pool.filter((d) => f.includeIngredients.every((i) => ingredientEvidence(d, i) !== 'no'))
    }
  }
  return {
    kept: pool.filter((d) => RECOMMENDABLE.has(d.availability)),
    unavailable: pool.filter((d) => !RECOMMENDABLE.has(d.availability)),
    dropped,
    includeRelaxed,
    fastestMinutes,
  }
}

export function rank(dishes: PublicDish[], state: ConversationState, profile: ConsumerProfile | null): RankedDish[] {
  if (!dishes.length) return []
  const prices = dishes.map((d) => d.price)
  const units = dishes.map((d) => d.units_sold_30d).filter((u): u is number => u !== null)
  const ctx: RankContext = {
    state,
    profile,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    maxUnits: units.length ? Math.max(...units) || null : null,
  }
  const ranked = dishes.map((d) => scoreDish(d, ctx)).sort((a, b) => b.score - a.score || a.dish.price - b.dish.price || a.dish.name.localeCompare(b.dish.name))
  addBadges(ranked)
  return ranked
}

/** Badges only from real values, and only when there is something to compare. */
function addBadges(ranked: RankedDish[]) {
  const prep = ranked.map((r) => r.dish.storefront.metrics?.prep_minutes).filter((v): v is number => v != null)
  const minPrep = prep.length > 1 ? Math.min(...prep) : null
  const minPrice = ranked.length > 1 ? Math.min(...ranked.map((r) => r.dish.price)) : null
  const units = ranked.map((r) => r.dish.units_sold_30d ?? 0)
  const maxUnits = Math.max(0, ...units)
  for (const r of ranked) {
    const d = r.dish
    if (d.regular_price != null) r.badges.push('Promo')
    if (minPrep !== null && d.storefront.metrics?.prep_minutes === minPrep && new Set(prep).size > 1) r.badges.push('Más rápido')
    if (minPrice !== null && d.price === minPrice && ranked.some((x) => x.dish.price !== minPrice)) r.badges.push('Más económico')
    if (maxUnits > 0 && d.units_sold_30d === maxUnits) r.badges.push('Más pedido')
    if (d.dietary_tags.includes('vegan')) r.badges.push('Vegano')
    else if (d.dietary_tags.includes('vegetarian')) r.badges.push('Vegetariano')
  }
}
