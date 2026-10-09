// ADR 0042: one conversational turn.
//   message → intent (rules, model only if needed) → state → retrieval (SQL)
//   → availability + hard filters → ranking → personalization → reply.
// Dependencies are injected (search, model, profile), so the whole turn runs
// in tests without a network, and WhatsApp can reuse it later.

import { parseIntent } from './intent.ts'
import { applyFilters, rank, textMatch } from './ranking.ts'
import { WELCOME, WELCOME_CHIPS, answerQuestion, searchReply, toCard } from './respond.ts'
import { applyIntent, initialState, sanitizeState, searchParams } from './state.ts'
import { fold } from './text.ts'
import type {
  AssistantResult, ConsumerLocation, ConsumerProfile, ConversationState, IntentDelta, PublicDish, RankedDish,
} from './types.ts'

export type SearchParams = ReturnType<typeof searchParams> & { ids?: string[] }

export interface TurnDeps {
  /** dk_public_search_dishes (only published data). */
  search(params: SearchParams | { ids: string[] }): Promise<PublicDish[]>
  /** The model's reading of a message the rules did not understand (optional). */
  llmIntent?(message: string, state: ConversationState): Promise<IntentDelta | null>
  profile?: ConsumerProfile | null
  location?: ConsumerLocation | null
  now?: Date
}

const MAX_CARDS = 8

function result(state: ConversationState, text: string, extra: Partial<AssistantResult> = {}, chips: string[] = []): AssistantResult {
  return {
    reply: { text, chips, notes: [], needsLocation: false },
    results: [],
    total: 0,
    state,
    intentSource: 'rules',
    ...extra,
  }
}

/** Personal constraints from the profile (with consent) that apply to every search. */
function withProfile(state: ConversationState, profile: ConsumerProfile | null | undefined): ConversationState {
  if (!profile?.profileConsent) return state
  const avoid = profile.preferences.filter((p) => p.kind === 'avoid_ingredient').map((p) => fold(p.value))
  const dietary = profile.preferences.filter((p) => p.kind === 'dietary').map((p) => p.value)
  if (!avoid.length && !dietary.length) return state
  return {
    ...state,
    filters: {
      ...state.filters,
      excludeIngredients: [...new Set([...state.filters.excludeIngredients, ...avoid])],
      tags: [...new Set([...state.filters.tags, ...dietary])] as ConversationState['filters']['tags'],
    },
  }
}

async function focusDish(deps: TurnDeps, state: ConversationState): Promise<PublicDish | null> {
  const id = state.focusId ?? state.lastResultIds[0]
  if (!id) return null
  const [dish] = await deps.search({ ids: [id], lat: deps.location?.lat, lng: deps.location?.lng } as SearchParams)
  return dish ?? null
}

function cardsOf(ranked: RankedDish[]) {
  return ranked.slice(0, MAX_CARDS).map((r) => toCard(r, ranked))
}

export async function runTurn(message: string, rawState: unknown, deps: TurnDeps): Promise<AssistantResult> {
  const now = deps.now ?? new Date()
  const state = sanitizeState(rawState)
  let delta = parseIntent(message)
  // The model reads only what the rules did not understand (or only guessed); fast paths stay instant.
  if ((delta.kind === 'unknown' || delta.lowConfidence) && deps.llmIntent) {
    const read = await deps.llmIntent(message, state).catch(() => null)
    if (read && read.kind !== 'unknown') delta = read
  }
  const source = delta.source

  switch (delta.kind) {
    case 'greeting':
    case 'help':
      return result({ ...state, turn: state.turn + 1 }, WELCOME, { intentSource: source }, WELCOME_CHIPS)

    case 'history':
      return result(
        { ...state, turn: state.turn + 1 },
        'Todavía no tienes pedidos hechos desde Quanela, así que no puedo buscar algo parecido a tu último pedido. Cuéntame qué se te antoja y lo busco.',
        { intentSource: source },
        WELCOME_CHIPS,
      )

    case 'select': {
      const sel = delta.select ?? {}
      let id: string | undefined
      if (sel.index !== undefined) id = sel.index < 0 ? state.lastResultIds.at(-1) : state.lastResultIds[sel.index]
      let dish: PublicDish | null = id ? (await deps.search({ ids: [id] } as SearchParams))[0] ?? null : null
      if (!dish && sel.storefrontName && state.lastResultIds.length) {
        const shown = await deps.search({ ids: state.lastResultIds } as SearchParams)
        const name = fold(sel.storefrontName)
        dish = shown.find((d) => fold(d.storefront.name).includes(name) || fold(d.name).includes(name)) ?? null
      }
      if (!dish) return result({ ...state, turn: state.turn + 1 }, '¿Cuál de las opciones? Tócala o dime «la primera», «la segunda»…', { intentSource: source })
      const next = { ...state, turn: state.turn + 1, focusId: dish.id, focusStorefront: dish.storefront.name }
      const ranked = rank([dish], next, deps.profile ?? null)
      return result(next, answerQuestion('details', dish, now), { results: cardsOf(ranked), total: 1, intentSource: source }, [
        '¿Qué ingredientes tiene?', '¿Cuánto se demora?', 'Ver otras opciones',
      ])
    }

    case 'question': {
      const dish = await focusDish(deps, state)
      if (!dish) {
        return result({ ...state, turn: state.turn + 1 }, 'Primero dime qué quieres comer y luego te cuento los detalles de cada plato.', { intentSource: source }, WELCOME_CHIPS)
      }
      const next = { ...state, turn: state.turn + 1, focusId: dish.id, focusStorefront: dish.storefront.name }
      const ranked = rank([dish], next, deps.profile ?? null)
      return result(next, answerQuestion(delta.question!.kind, dish, now, delta.question!.ingredient), {
        results: cardsOf(ranked),
        total: 1,
        intentSource: source,
      }, ['Ver otras opciones', 'Más económicas', 'Más rápidas'])
    }

    case 'unknown':
      if (delta.reset) {
        return result({ ...initialState(), turn: state.turn + 1 }, 'Listo, empecemos de nuevo. ¿Qué se te antoja?', { intentSource: source }, WELCOME_CHIPS)
      }
      return result(
        { ...state, turn: state.turn + 1 },
        state.topic
          ? `No te entendí. Puedes decirme, por ejemplo, «más baratas», «sin cebolla» o preguntarme por un plato.`
          : 'Solo sé ayudarte a encontrar comida en los negocios de Quanela. ¿Qué se te antoja?',
        { intentSource: source },
        WELCOME_CHIPS,
      )
  }

  // search · refine · recommend
  const applied = applyIntent(state, delta)
  const effective = withProfile(applied, deps.profile)
  const usedProfile = effective !== applied
  const dishes = await deps.search(searchParams(effective, deps.location ?? null))
  const outcome = applyFilters(dishes, effective)
  // When some dishes match by name or category, those that only share the business's cuisine
  // (fries at a burger place, for "hamburguesas") are not what was asked for.
  if (effective.terms.length && outcome.kept.some((d) => (textMatch(d, effective.terms) ?? 0) >= 0.5)) {
    outcome.kept = outcome.kept.filter((d) => (textMatch(d, effective.terms) ?? 0) >= 0.5)
  }
  const ranked = rank(outcome.kept, effective, deps.profile ?? null)
  const reply = searchReply({ state: effective, ranked, outcome, hasLocation: !!deps.location, now })

  const next: ConversationState = {
    ...applied,
    // Ratings do not exist: the "no hay calificaciones" note is said once, not on every turn.
    filters: { ...applied.filters, minRating: null },
    lastResultIds: ranked.slice(0, 30).map((r) => r.dish.id),
    focusId: ranked[0]?.dish.id ?? null,
    focusStorefront: ranked[0]?.dish.storefront.name ?? null,
    askedSort: applied.askedSort || reply.chips.includes('Lo más rápido'),
  }
  const personalNote = usedProfile && ranked.length ? ['Tuve en cuenta tus preferencias guardadas.'] : []
  return {
    reply: { text: reply.text, chips: reply.chips, notes: [...reply.notes, ...personalNote], needsLocation: reply.needsLocation },
    results: cardsOf(ranked),
    total: ranked.length,
    state: next,
    intentSource: source,
  }
}
