// ADR 0042: what Quanela says. Every figure in a reply comes from a dish or a
// storefront returned by the database; when a value is unknown the reply says
// so (or says nothing about it). No model writes these sentences.

import { RECOMMENDABLE, ingredientEvidence, textMatch } from './ranking.ts'
import type { FilterOutcome } from './ranking.ts'
import type { Availability, ConversationState, PublicDish, QuestionKind, RankedDish, ResultCard } from './types.ts'

const TZ_DEFAULT = 'America/Bogota'

export function money(n: number): string {
  return `$${Math.round(n).toLocaleString('es-CO')}`
}

function clock(iso: string, tz = TZ_DEFAULT): string {
  return new Intl.DateTimeFormat('es-CO', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso))
}

function dayWord(iso: string, now: Date, tz = TZ_DEFAULT): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  const days = Math.round((Date.parse(fmt.format(new Date(iso))) - Date.parse(fmt.format(now))) / 86_400_000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'mañana'
  return new Intl.DateTimeFormat('es-CO', { timeZone: tz, weekday: 'long' }).format(new Date(iso))
}

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

const TAG_LABEL: Record<string, string> = {
  vegetarian: 'vegetarianas', vegan: 'veganas', gluten_free: 'sin gluten', spicy: 'picantes', healthy: 'saludables',
}

export function availabilityLabel(d: PublicDish): string {
  const labels: Record<Availability, string> = {
    available: d.available_until ? `Disponible hasta las ${d.available_until}` : 'Disponible',
    unknown: 'Por confirmar',
    later: d.available_from ? `Desde las ${d.available_from}` : 'Más tarde',
    ended: 'Ya no está hoy',
    sold_out: 'Agotado',
    not_today: 'No está hoy',
    closed: 'Cerrado',
  }
  return labels[d.availability]
}

/** The reasons a dish ranks where it does, with its real values (strongest first). */
export function reasonsFor(r: RankedDish, all: RankedDish[]): string[] {
  const d = r.dish
  const m = d.storefront.metrics
  const prepKnown = all.map((x) => x.dish.storefront.metrics?.prep_minutes).filter((v): v is number => v != null)
  const isFastest = m?.prep_minutes != null && prepKnown.length > 1 && m.prep_minutes === Math.min(...prepKnown) && new Set(prepKnown).size > 1
  const prices = all.map((x) => x.dish.price)
  const isCheapest = prices.length > 1 && d.price === Math.min(...prices) && new Set(prices).size > 1
  const units = all.map((x) => x.dish.units_sold_30d ?? 0)
  const isMostOrdered = (d.units_sold_30d ?? 0) > 0 && d.units_sold_30d === Math.max(...units)
  const tiedMostOrdered = isMostOrdered && units.filter((u) => u === d.units_sold_30d).length > 1

  const text: Record<string, string | null> = {
    availability: d.availability === 'available' ? 'está disponible ahora' : null,
    prep: m?.prep_minutes != null ? (isFastest ? `tiene el menor tiempo de preparación (~${m.prep_minutes} min)` : `se prepara en ~${m.prep_minutes} min`) : null,
    response: m?.response_minutes != null ? `confirma los pedidos en ~${m.response_minutes} min` : null,
    completion: m?.completion_rate != null ? `cumple el ${Math.round(m.completion_rate * 100)}% de sus pedidos` : null,
    popularity: d.units_sold_30d
      ? isMostOrdered
        ? `${tiedMostOrdered ? 'está entre los más pedidos' : 'es el más pedido'} de estas opciones (${d.units_sold_30d} en 30 días)`
        : `se pidió ${d.units_sold_30d} veces en 30 días`
      : null,
    price: isCheapest ? `es la opción más económica (${money(d.price)})` : null,
    distance: d.storefront.distance_km != null ? `está a ${d.storefront.distance_km.toLocaleString('es-CO', { maximumFractionDigits: 1 })} km` : null,
    personal: 'va con lo que te gusta',
    match: 'es justo lo que buscas',
  }
  const reasons = r.factors
    .filter((f) => f.value !== null && f.value >= 0.5 && text[f.key])
    .sort((a, b) => b.weight * (b.value as number) - a.weight * (a.value as number))
    .map((f) => text[f.key] as string)
  // "es justo lo que buscas" only when nothing more concrete is known.
  const concrete = reasons.filter((t) => t !== text.match)
  return (concrete.length ? concrete : reasons).slice(0, 3)
}

export function toCard(r: RankedDish, all: RankedDish[]): ResultCard {
  const d = r.dish
  return {
    id: d.id,
    name: d.name,
    storefront: d.storefront.name,
    storefrontSlug: d.storefront.slug,
    price: d.price,
    regularPrice: d.regular_price,
    imagePath: d.image_path,
    availability: d.availability,
    availabilityLabel: availabilityLabel(d),
    minutes: d.storefront.metrics?.prep_minutes ?? null,
    distanceKm: d.storefront.distance_km,
    rating: d.rating,
    badges: r.badges,
    reasons: reasonsFor(r, all),
  }
}

/** "por menos de $30.000, vegetarianas, sin cebolla" */
export function filterSummary(state: ConversationState): string {
  const f = state.filters
  const parts: string[] = []
  if (f.maxPrice != null) parts.push(`por menos de ${money(f.maxPrice)}`)
  if (f.maxMinutes != null) parts.push(`en ${f.maxMinutes} min o menos`)
  for (const t of f.tags) parts.push(TAG_LABEL[t] ?? t)
  if (f.includeIngredients.length) parts.push(`con ${list(f.includeIngredients)}`)
  // Not "sin cebolla": some may have it and be ordered without it (the notes say which).
  if (f.excludeIngredients.length) parts.push(`para pedir sin ${list(f.excludeIngredients)}`)
  return parts.join(', ')
}

const SORT_LEAD: Record<string, string> = {
  fastest: 'La opción más rápida ahora es',
  cheapest: 'La más económica es',
  popular: 'La más pedida es',
  nearest: 'La más cercana es',
  value: 'Por precio y por lo que más piden, te recomiendo',
}

/** Why a dish is not available now, in words. */
export function unavailableWhy(d: PublicDish, now: Date): string {
  const open = d.storefront.open_state
  switch (d.availability) {
    case 'closed':
      return open?.opens_at
        ? `está cerrado (abre ${dayWord(open.opens_at, now, d.storefront.timezone)} a las ${clock(open.opens_at, d.storefront.timezone)})`
        : 'está cerrado'
    case 'sold_out':
      return 'se agotó por hoy'
    case 'ended':
      return 'ya no lo sirven hoy'
    case 'not_today':
      return 'no está en el menú de hoy'
    default:
      return 'no está disponible ahora'
  }
}

export interface SearchReplyInput {
  state: ConversationState
  ranked: RankedDish[]
  outcome: FilterOutcome
  hasLocation: boolean
  now: Date
}

export function searchReply({ state, ranked, outcome, hasLocation, now }: SearchReplyInput): { text: string; notes: string[]; chips: string[]; needsLocation: boolean } {
  const topic = state.topic ?? 'platos'
  const summary = filterSummary(state)
  const notes: string[] = []
  const f = state.filters
  let needsLocation = false

  if (f.minRating != null) {
    notes.push('Todavía no hay calificaciones en Quanela, así que no puedo filtrar ni ordenar por estrellas. Ordené por disponibilidad, tiempos y cumplimiento reales.')
  }
  if ((state.sort === 'nearest' || f.near) && !hasLocation) {
    needsLocation = true
    notes.push('Para buscar cerca de ti necesito tu ubicación.')
  } else if ((state.sort === 'nearest' || f.near) && ranked.length && ranked.every((r) => r.dish.storefront.distance_km == null)) {
    notes.push('Estos negocios aún no publican su ubicación, así que no puedo calcular distancias.')
  }

  if (!ranked.length) {
    const lead = `Ahora mismo no encontré ${topic}${summary ? ` ${summary}` : ''} en los negocios de Quanela.`
    const alt = outcome.unavailable.slice(0, 2).map((d) => `**${d.name}** de ${d.storefront.name} ${unavailableWhy(d, now)}`)
    if (f.maxMinutes != null && outcome.fastestMinutes != null) {
      notes.push(`Lo más rápido que encontré tarda ~${outcome.fastestMinutes} min entre preparación y domicilio.`)
    }
    const dropped = outcome.dropped.find((x) => x.reason === 'time_unknown')
    if (dropped) notes.push(`${dropped.count} ${dropped.count === 1 ? 'opción no publica' : 'opciones no publican'} sus tiempos, así que no puedo confirmar que lleguen a tiempo.`)
    const chips = [f.maxPrice != null ? 'Sin límite de precio' : null, 'Otra cosa', '¿Qué me recomiendas?'].filter(Boolean) as string[]
    return { text: alt.length ? `${lead} ${list(alt)}.` : lead, notes, chips, needsLocation }
  }

  const top = ranked[0]
  const d = top.dish
  const count = ranked.length
  const head = state.topic || summary
    ? `Encontré ${count} ${count === 1 ? 'opción' : 'opciones'}${state.topic ? ` de ${topic}` : ''}${summary ? ` ${summary}` : ''}.`
    : `Esto es lo que hay disponible ahora (${count} ${count === 1 ? 'plato' : 'platos'}).`
  const reasons = reasonsFor(top, ranked)
  const lead = state.sort !== 'best' ? SORT_LEAD[state.sort] : 'Te recomiendo'
  const because = reasons.length ? ` porque ${list(reasons)}` : ''
  let text = `${head} ${lead} **${d.name}** de **${d.storefront.name}** (${money(d.price)})${because}.`
  if (state.sort === 'fastest' && d.storefront.metrics?.prep_minutes == null) {
    text = `${head} Ninguno de estos negocios comparte aún sus tiempos de preparación, así que no puedo decirte cuál es más rápido. Te recomiendo **${d.name}** de **${d.storefront.name}** (${money(d.price)})${because}.`
  }

  // A dish that matches better by name or category but cannot be ordered now is worth saying.
  const closer = outcome.unavailable
    .filter((u) => (textMatch(u, state.terms) ?? 0) >= 0.8 && (textMatch(u, state.terms) ?? 0) > (textMatch(d, state.terms) ?? 0))
    .slice(0, 1)
  for (const u of closer) notes.push(`**${u.name}** de ${u.storefront.name} ${unavailableWhy(u, now)}.`)
  if (d.availability === 'unknown') notes.push(`${d.storefront.name} no ha confirmado su menú de hoy: confirma con el negocio antes de pedir.`)
  if (d.availability === 'later' && d.available_from) notes.push(`${d.name} está disponible desde las ${d.available_from}.`)
  if (outcome.includeRelaxed) {
    notes.push(`Ningún plato confirma ${list(f.includeIngredients)} en lo que publica cada negocio; estas opciones podrían tenerlo, pregunta antes de pedir.`)
  }
  for (const ing of f.excludeIngredients) {
    const ev = ingredientEvidence(d, ing)
    if (ev === 'yes') notes.push(`${d.name} lleva ${ing}: puedes pedirla sin ${ing} en la nota para la cocina.`)
    else if (ev === 'unknown') notes.push(`No sé si ${d.name} lleva ${ing}: el negocio no publica sus ingredientes.`)
  }
  const timeUnknown = outcome.dropped.find((x) => x.reason === 'time_unknown')
  if (timeUnknown) notes.push(`Dejé por fuera ${timeUnknown.count} ${timeUnknown.count === 1 ? 'opción que no publica' : 'opciones que no publican'} sus tiempos.`)

  let chips: string[] = []
  if (!state.askedSort && state.sort === 'best' && count > 3) {
    text += ' ¿Prefieres algo económico, lo más rápido o lo más pedido?'
    chips = ['Lo más económico', 'Lo más rápido', 'Lo más pedido']
  } else {
    chips = [
      `¿Qué ingredientes tiene?`,
      state.sort !== 'cheapest' ? 'Más económicas' : null,
      state.sort !== 'fastest' ? 'Más rápidas' : null,
      !f.tags.includes('vegetarian') ? 'Vegetarianas' : null,
    ].filter(Boolean) as string[]
  }
  return { text, notes, chips: chips.slice(0, 4), needsLocation }
}

/** The answer to a question about one dish, only from what its account publishes. */
export function answerQuestion(kind: QuestionKind, d: PublicDish, now: Date, ingredient?: string): string {
  const name = `**${d.name}** de ${d.storefront.name}`
  const m = d.storefront.metrics
  switch (kind) {
    case 'has_ingredient': {
      if (!ingredient) return `¿Qué ingrediente quieres saber de ${name}?`
      const ev = ingredientEvidence(d, ingredient)
      if (ev === 'yes') {
        const match = (d.ingredients ?? []).filter((i) => ingredientEvidence({ ...d, name: i, description: null, ingredients: [i] }, ingredient) === 'yes')
        return `Sí, ${name} lleva ${match.length ? list(match.map((x) => x.toLowerCase())) : ingredient}, según lo que publica el negocio.`
      }
      if (ev === 'no') return `No, ${name} no lleva ${ingredient} según sus ingredientes publicados (${list((d.ingredients ?? []).map((x) => x.toLowerCase()))}).`
      return `${d.storefront.name} no publica los ingredientes de ${d.name}, así que no puedo confirmar si lleva ${ingredient}.${d.description ? ` Su descripción dice: «${d.description}».` : ''}`
    }
    case 'ingredients':
      return d.ingredients?.length
        ? `${name} lleva ${list(d.ingredients.map((x) => x.toLowerCase()))}.`
        : `${d.storefront.name} no publica los ingredientes de ${d.name}.${d.description ? ` Su descripción dice: «${d.description}».` : ''}`
    case 'price':
      return d.regular_price != null
        ? `${name} cuesta ${money(d.price)} hoy (precio normal ${money(d.regular_price)}).`
        : `${name} cuesta ${money(d.price)}.`
    case 'time': {
      if (m?.prep_minutes == null) return `${d.storefront.name} no comparte todavía sus tiempos de preparación.`
      const delivery = m.delivery_minutes != null ? ` y sus domicilios tardan ~${m.delivery_minutes} min en llegar` : ''
      return `${d.storefront.name} prepara sus pedidos en ~${m.prep_minutes} min${delivery} (medianas de los últimos 30 días).`
    }
    case 'availability':
      if (RECOMMENDABLE.has(d.availability)) {
        return d.availability === 'available'
          ? `Sí, ${name} está disponible ahora${d.available_until ? ` hasta las ${d.available_until}` : ''}.`
          : d.availability === 'later'
            ? `${name} está disponible desde las ${d.available_from}.`
            : `${d.storefront.name} está abierto, pero no ha confirmado su menú de hoy.`
      }
      return `${name} ${unavailableWhy(d, now)}.`
    case 'where':
      return d.storefront.distance_km != null
        ? `${d.storefront.name} está a ${d.storefront.distance_km.toLocaleString('es-CO', { maximumFractionDigits: 1 })} km de ti.`
        : `No puedo calcular la distancia a ${d.storefront.name}: el negocio no publica su ubicación o no has compartido la tuya.`
    case 'details':
      return `${name}: ${d.description ?? 'sin descripción publicada'}. Cuesta ${money(d.price)}${m?.prep_minutes != null ? ` y se prepara en ~${m.prep_minutes} min` : ''}.`
  }
}

export const WELCOME = 'Hola, soy Quanela. Dime qué se te antoja y busco la mejor opción entre los negocios de Quanela. Por ejemplo: «una hamburguesa con queso que no sea muy cara».'
export const WELCOME_CHIPS = ['Hamburguesas', 'Algo saludable', 'Pizza', '¿Qué me recomiendas?']
