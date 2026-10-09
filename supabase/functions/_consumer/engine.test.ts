import { describe, expect, it, vi } from 'vitest'
import { parseIntent } from './intent.ts'
import { readIntentResponse } from './llmIntent.ts'
import { runTurn, type TurnDeps } from './pipeline.ts'
import { applyFilters, rank } from './ranking.ts'
import { applyIntent, initialState, sanitizeState } from './state.ts'
import { parseMoney } from './text.ts'
import type { ConversationState, PublicDish, PublicStorefront, StorefrontMetrics } from './types.ts'

// ---------------------------------------------------------------------------
// Fixtures: what dk_public_search_dishes returns (shape only; values are test data)
// ---------------------------------------------------------------------------
const metrics = (prep: number | null, extra: Partial<StorefrontMetrics> = {}): StorefrontMetrics => ({
  prep_minutes: prep, response_minutes: 4, delivery_minutes: 20, completion_rate: 0.95, active_orders: 2, ...extra,
})
const store = (slug: string, name: string, m: StorefrontMetrics | null, extra: Partial<PublicStorefront> = {}): PublicStorefront => ({
  slug, name, tagline: null, cuisine: 'burgers', open_state: { state: 'open' }, timezone: 'America/Bogota', distance_km: null, whatsapp_phone: null, metrics: m, ...extra,
})
let n = 0
const dish = (name: string, price: number, s: PublicStorefront, extra: Partial<PublicDish> = {}): PublicDish => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  name, description: null, category: 'Hamburguesas', price, regular_price: null, currency: 'COP', image_path: null, images: [],
  dietary_tags: [], ingredients: null, availability: 'available', available_from: null, available_until: null,
  units_sold_30d: 0, rating: null, review_count: null, storefront: s, ...extra,
})

const lab = store('burger-lab', 'Burger Lab', metrics(15))
const brasa = store('brasa', 'Brasa Urbana', metrics(28, { response_minutes: 10 }))
const hidden = store('verde', 'Verde Vivo', null, { cuisine: 'healthy' })
const aurora = store('aurora', 'Café Aurora', null, { cuisine: 'coffee', open_state: { state: 'closed', opens_at: '2026-10-08T12:00:00Z' } })

const DISHES: PublicDish[] = [
  dish('Cheeseburger', 28000, lab, { ingredients: ['Carne de res', 'Queso cheddar', 'Cebolla'], units_sold_30d: 14 }),
  dish('Bacon Burger', 32000, lab, { ingredients: ['Carne de res', 'Tocineta', 'Queso americano'], units_sold_30d: 7 }),
  dish('Veggie Burger', 26000, lab, { ingredients: ['Garbanzo', 'Aguacate'], dietary_tags: ['vegetarian'] }),
  dish('Papas fritas', 9000, lab, { category: 'Acompañamientos', ingredients: ['Papa'], dietary_tags: ['vegan'] }),
  dish('Hamburguesa Clásica', 24000, brasa, { ingredients: ['Carne de res', 'Queso mozzarella', 'Cebolla'], units_sold_30d: 14 }),
  dish('Hamburguesa BBQ', 27000, brasa, { availability: 'sold_out' }),
  dish('Bowl de quinoa', 23000, hidden, { category: 'Bowls', availability: 'unknown', dietary_tags: ['vegan', 'healthy'] }),
  dish('Sánduche de queso', 18000, aurora, { category: 'Sánduches', availability: 'closed' }),
]

/** A fake retriever with the same contract as the SQL one (terms OR-match, ids, max_price). */
const search: TurnDeps['search'] = async (params) => {
  const p = params as { terms?: string[]; ids?: string[]; max_price?: number }
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return DISHES.filter((d) => {
    if (p.ids?.length) return p.ids.includes(d.id)
    if (p.max_price != null && d.price > p.max_price) return false
    if (!p.terms?.length) return true
    const hay = fold([d.name, d.category, d.description, d.dietary_tags.join(' '), d.storefront.cuisine, (d.ingredients ?? []).join(' ')].join(' '))
    return p.terms.some((t) => hay.includes(t))
  })
}

async function talk(messages: string[], deps: Partial<TurnDeps> = {}) {
  let state: unknown = null
  const out = []
  for (const m of messages) {
    const r = await runTurn(m, state, { search, now: new Date('2026-10-07T18:00:00Z'), ...deps })
    state = r.state
    out.push(r)
  }
  return out
}

// ---------------------------------------------------------------------------
describe('intent (rules)', () => {
  it.each([
    ['Quiero hamburguesas.', { kind: 'search', topic: 'hamburguesas' }],
    ['Quiero pizza.', { kind: 'search', topic: 'pizza' }],
    ['Algo barato.', { kind: 'refine', sort: 'cheapest' }],
    ['Algo rápido.', { kind: 'refine', sort: 'fastest' }],
    ['La más rápida.', { kind: 'refine', sort: 'fastest' }],
    ['Algo vegetariano.', { kind: 'refine', tags: ['vegetarian'] }],
    ['Menos de $30.000.', { kind: 'refine', maxPrice: 30000 }],
    ['Máximo 30 mil pesos.', { kind: 'refine', maxPrice: 30000 }],
    ['Sin cebolla.', { kind: 'refine', excludeIngredients: ['cebolla'] }],
    ['Que tenga queso.', { kind: 'refine', includeIngredients: ['queso'] }],
    ['¿Tiene queso?', { kind: 'question', question: { kind: 'has_ingredient', ingredient: 'queso' } }],
    ['¿Cuál tiene mejor rating?', { kind: 'refine', minRating: 0 }],
    ['Solo negocios con más de 4.5 estrellas.', { kind: 'refine', minRating: 4.5 }],
    ['Muéstrame algo parecido a mi último pedido.', { kind: 'history' }],
    ['Tengo 30 minutos, ¿qué puedo pedir?', { kind: 'refine', maxMinutes: 30 }],
    ['¿Qué es popular cerca de mí?', { kind: 'refine', sort: 'popular', wantsNear: true }],
    ['¿Qué me recomiendas?', { kind: 'recommend' }],
    ['la segunda', { kind: 'select', select: { index: 1 } }],
  ])('%s', (phrase, expected) => {
    expect(parseIntent(phrase)).toMatchObject(expected)
  })

  it('reads the topic and the filters of one sentence', () => {
    expect(parseIntent('Quiero una hamburguesa con queso, que no sea muy cara.')).toMatchObject({
      kind: 'search', topic: 'hamburguesas', includeIngredients: ['queso'], sort: 'value',
    })
  })

  it('reads COP amounts as people say them', () => {
    expect([parseMoney('30 mil'), parseMoney('$30.000'), parseMoney('30k'), parseMoney('treinta mil'), parseMoney('25')]).toEqual([30000, 30000, 30000, 30000, 25000])
  })
})

describe('conversation state', () => {
  it('a new topic keeps personal constraints and drops the sort', () => {
    let s = applyIntent(initialState(), parseIntent('hamburguesas sin cebolla'))
    s = applyIntent(s, parseIntent('la más rápida'))
    s = applyIntent(s, parseIntent('mejor pizza'))
    expect(s).toMatchObject({ topic: 'pizza', sort: 'best', filters: { excludeIngredients: ['cebolla'] } })
  })

  it('a tampered state can only narrow the search', () => {
    const s = sanitizeState({ terms: ['x'.repeat(500), 1, null], filters: { maxPrice: -5, tags: ['keto', 'vegan'], storefront: "x' or 1=1" }, sort: 'evil', focusId: 'not-a-uuid' })
    expect(s.filters).toMatchObject({ maxPrice: null, tags: ['vegan'], storefront: null })
    expect(s.sort).toBe('best')
    expect(s.focusId).toBeNull()
    expect(s.terms[0].length).toBeLessThanOrEqual(40)
  })
})

describe('ranking', () => {
  const state = (patch: Partial<ConversationState> = {}): ConversationState => ({ ...initialState(), terms: ['hamburguesa', 'burger'], ...patch })

  it('never recommends sold-out or closed dishes', () => {
    const { kept, unavailable } = applyFilters(DISHES, state({ terms: [] }))
    expect(kept.map((d) => d.name)).not.toContain('Hamburguesa BBQ')
    expect(kept.map((d) => d.name)).not.toContain('Sánduche de queso')
    expect(unavailable.map((d) => d.name)).toEqual(['Hamburguesa BBQ', 'Sánduche de queso'])
  })

  it('unknown data does not count, and does not win either', () => {
    const fast = dish('A', 20000, store('a', 'A', metrics(10)))
    const unknown = dish('B', 20000, store('b', 'B', null))
    const ranked = rank([unknown, fast], state({ terms: [] }), null)
    expect(ranked[0].dish.name).toBe('A')
    expect(ranked.find((r) => r.dish.name === 'B')!.factors.find((f) => f.key === 'prep')!.value).toBeNull()
    expect(ranked.find((r) => r.dish.name === 'B')!.coverage).toBeLessThan(1)
  })

  it('operational performance can beat popularity alone', () => {
    const slowPopular = dish('Popular lenta', 25000, store('p', 'P', metrics(58, { response_minutes: 29, completion_rate: 0.72 })), { units_sold_30d: 30 })
    const fastGood = dish('Rápida cumplida', 25000, store('q', 'Q', metrics(12, { completion_rate: 0.99 })), { units_sold_30d: 20 })
    expect(rank([slowPopular, fastGood], state({ terms: [] }), null)[0].dish.name).toBe('Rápida cumplida')
  })

  it('a time limit leaves out dishes whose time is unknown', () => {
    const out = applyFilters(DISHES, state({ terms: [], filters: { ...initialState().filters, maxMinutes: 40 } }))
    expect(out.kept.every((d) => d.storefront.metrics?.prep_minutes != null)).toBe(true)
    expect(out.dropped).toContainEqual({ reason: 'time_unknown', count: 1 })
  })

  it('vegetarian includes vegan dishes', () => {
    const out = applyFilters(DISHES, state({ terms: [], filters: { ...initialState().filters, tags: ['vegetarian'] } }))
    expect(out.kept.map((d) => d.name).sort()).toEqual(['Bowl de quinoa', 'Papas fritas', 'Veggie Burger'])
  })
})

describe('a conversation', () => {
  it('hamburguesas → la más rápida → ¿tiene queso? (about the dish in focus)', async () => {
    const [first, fastest, cheese] = await talk(['Quiero hamburguesas.', 'La más rápida.', '¿Tiene queso?'])
    expect(first.results.map((c) => c.name)).not.toContain('Papas fritas')
    expect(first.reply.chips).toEqual(['Lo más económico', 'Lo más rápido', 'Lo más pedido'])
    expect(fastest.reply.text).toMatch(/^Encontré 4 opciones de hamburguesas\. La opción más rápida ahora es \*\*Cheeseburger\*\* de \*\*Burger Lab\*\*/)
    expect(cheese.reply.text).toBe('Sí, **Cheeseburger** de Burger Lab lleva queso cheddar, según lo que publica el negocio.')
  })

  it('says it does not know instead of guessing', async () => {
    const [, q] = await talk(['bowl', '¿Tiene queso?'])
    expect(q.reply.text).toContain('Verde Vivo no publica los ingredientes de Bowl de quinoa')
    const [rating] = await talk(['¿Cuál tiene mejor rating?'])
    expect(rating.reply.notes[0]).toMatch(/no hay calificaciones/)
    const [history] = await talk(['Muéstrame algo parecido a mi último pedido.'])
    expect(history.reply.text).toMatch(/Todavía no tienes pedidos/)
  })

  it('every figure in a reply comes from the data', async () => {
    const turns = await talk(['Quiero hamburguesas.', 'Algo barato.', 'Menos de $30.000.', 'Algo rápido.', 'Sin cebolla.'])
    const known = new Set<string>()
    for (const d of DISHES) {
      for (const v of [d.price, d.units_sold_30d, d.storefront.metrics?.prep_minutes, d.storefront.metrics?.response_minutes,
        d.storefront.metrics?.completion_rate != null ? Math.round(d.storefront.metrics.completion_rate * 100) : null]) {
        if (v != null) known.add(String(v))
      }
    }
    for (const t of turns) {
      const text = [t.reply.text, ...t.reply.notes].join(' ')
      // Amounts and counts mentioned ("$28.000", "~15 min", "14 en 30 días", "95%"), except the price limit the person said and "30 días".
      const figures = [...text.matchAll(/\$([\d.]+)|~(\d+) min|\((\d+) en 30 días\)|(\d+)%/g)].map((m) => (m[1] ?? m[2] ?? m[3] ?? m[4]).replace(/\./g, ''))
      for (const f of figures.filter((x) => x !== '30000')) expect(known, `${f} in «${text}»`).toContain(f)
    }
  })

  it('mentions a closed place with its opening time when nothing else matches', async () => {
    const [r] = await talk(['Quiero un sánduche'])
    expect(r.results).toHaveLength(0)
    expect(r.reply.text).toMatch(/Café Aurora está cerrado \(abre/)
  })

  it('asks for the location only when distance matters', async () => {
    const [near] = await talk(['hamburguesas cerca de mí'])
    expect(near.reply.needsLocation).toBe(true)
    const [plain] = await talk(['hamburguesas'])
    expect(plain.reply.needsLocation).toBe(false)
  })

  it('asks the model only when the rules understood nothing, and validates its answer', async () => {
    const llmIntent = vi.fn(async () => readIntentResponse({ content: [{ type: 'tool_use', name: 'set_intent', input: { kind: 'search', terms: ['hamburguesa'], max_price: 30000, tags: ['keto'] } }] }))
    await talk(['Quiero hamburguesas'], { llmIntent })
    expect(llmIntent).not.toHaveBeenCalled()
    const [r] = await talk(['algo para el guayabo'], { llmIntent })
    expect(llmIntent).toHaveBeenCalledOnce()
    expect(r.intentSource).toBe('llm')
    expect(r.state.filters).toMatchObject({ maxPrice: 30000, tags: [] })
  })

  it('uses the saved profile only with consent', async () => {
    const profile = { profileConsent: true, preferences: [{ kind: 'dietary' as const, value: 'vegetarian' }] }
    const [withConsent] = await talk(['hamburguesas'], { profile })
    expect(withConsent.results.map((c) => c.name)).toEqual(['Veggie Burger'])
    expect(withConsent.reply.notes).toContain('Tuve en cuenta tus preferencias guardadas.')
    const [without] = await talk(['hamburguesas'], { profile: { ...profile, profileConsent: false } })
    expect(without.results.length).toBeGreaterThan(1)
  })
})

describe('model output is untrusted', () => {
  it('rejects anything outside the contract', () => {
    expect(readIntentResponse({ content: [{ type: 'text', text: 'hola' }] })).toBeNull()
    expect(readIntentResponse({ content: [{ type: 'tool_use', name: 'set_intent', input: { kind: 'drop_tables' } }] })).toBeNull()
    expect(readIntentResponse({ content: [{ type: 'tool_use', name: 'set_intent', input: { kind: 'refine', max_price: -1, sort: 'by_cost' } }] })).toEqual({ kind: 'refine', source: 'llm' })
  })
})
