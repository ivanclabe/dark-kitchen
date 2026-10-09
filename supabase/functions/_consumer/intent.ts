// ADR 0042: intent understanding by rules (es-CO). Turns a message into an
// IntentDelta: topic, search terms, filters, sort, a question about the dish in
// focus, or a selection. Deterministic and instant; the model (llmIntent.ts) is
// only asked when these rules understand nothing.

import { CONCEPTS, STOPWORDS, canonicalIngredient, fold, parseMoney, singular, words } from './text.ts'
import type { DietaryTag, IntentDelta, QuestionKind, SortMode } from './types.ts'

const ORDINALS: Record<string, number> = {
  primera: 0, primero: 0, '1': 0, segunda: 1, segundo: 1, '2': 1, tercera: 2, tercero: 2, '3': 2, cuarta: 3, cuarto: 3, quinta: 4, quinto: 4,
}

// The end of a clause such as "con queso y tocineta" or "sin cebolla".
const CLAUSE_END = String.raw`(?=$|[,.;!?]| que | por | para | menos | maximo | hasta | sin | con | pero | cerca| rapid| barat| economic)`

function uniq<T>(items: T[]): T[] {
  return [...new Set(items)]
}

function ingredientsOf(phrase: string): string[] {
  return uniq(
    phrase
      .split(/\s+y\s+|\s+o\s+|,|\s+ni\s+/)
      .map((p) => p.trim().replace(/^(el|la|los|las|un|una|mucho|mucha|extra|doble)\s+/, ''))
      .filter((p) => p.length >= 2 && !STOPWORDS.has(p))
      .map((p) => canonicalIngredient(p.split(' ').slice(0, 2).join(' '))),
  )
}

function detectSort(t: string): SortMode | undefined {
  if (/\b(rapid[oa]s?|rapidez|de afan|afan|urgente|ya mismo|lo antes posible|pront[oa]|demore poco|menos se demor|menos tiempo)\b/.test(t)) return 'fastest'
  if (/\b(relacion precio|precio.calidad|calidad.precio|buen precio|vale la pena|no (sea |sean )?(tan |muy )?car[oa]s?)\b/.test(t)) return 'value'
  if (/\b(barat[oa]s?|economic[oa]s?|econom|precio bajo|menos cuesta|mas barat|poca plata|no tengo mucha plata)\b/.test(t)) return 'cheapest'
  if (/\b(popular(es)?|mas pedid[oa]s?|lo que mas piden|mas vendid[oa]s?|famos[oa]s?|top|de moda|lo que todos piden)\b/.test(t)) return 'popular'
  if (NEAR.test(t)) return 'nearest'
  return undefined
}

const NEAR = /\b(mas cerca|mas cercan[oa]s?|cerca de mi|cerca a mi|cerquita|cerca)\b/

function detectQuestion(t: string): IntentDelta['question'] | undefined {
  // "¿tiene queso?", "y lleva cebolla?", "viene con papas?" — not "que tenga queso" (that is a filter).
  const has = t.match(/(?:^|\by\s+|\bes que\s+|\besa\s+|\bese\s+|\beso\s+)(?:tiene|lleva|trae|viene con|incluye|tienen)\s+([a-z ]{2,40})/)
  if (has && !/\b(cual|cuales|que)\s+(tiene|lleva|trae)\s+(mejor|mas|menos)\b/.test(t)) {
    const ingredient = ingredientsOf(has[1].replace(/\b(algo de|algun|alguna)\b/, ''))[0]
    if (ingredient) return { kind: 'has_ingredient', ingredient }
  }
  const kinds: [RegExp, QuestionKind][] = [
    [/\b(que (ingredientes|trae|lleva|tiene)|ingredientes|de que es|con que viene)\b/, 'ingredients'],
    [/\b(cuanto (cuesta|vale|sale|es)|que precio|el precio|valor)\b/, 'price'],
    [/\b(cuanto (se demora|tarda|demora|tiempo)|en cuanto (llega|esta)|tiempo de (entrega|preparacion)|cuanto se tardan)\b/, 'time'],
    [/\b(esta disponible|lo tienen|hay hoy|esta abierto|estan abiertos|abren|a que hora)\b/, 'availability'],
    [/\b(donde (queda|esta|es)|que tan lejos|a que distancia|direccion)\b/, 'where'],
    [/\b(cuentame mas|mas detalles|describe|como es|que es eso)\b/, 'details'],
  ]
  for (const [re, kind] of kinds) if (re.test(t)) return { kind }
  return undefined
}

function detectSelect(t: string): IntentDelta['select'] | undefined {
  const ord = t.match(/\b(?:la|el|ver la|ver el|quiero la|quiero el|dame la|dame el|muestrame la|muestrame el)\s+(primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa]|quint[oa]|ultim[oa])\b(?!\s+(opcion mas|mas))/)
  if (ord) {
    const w = ord[1].startsWith('primer') ? 'primera' : ord[1].startsWith('tercer') ? 'tercera' : ord[1]
    if (w.startsWith('ultim')) return { index: -1 }
    const idx = ORDINALS[w] ?? ORDINALS[w.replace(/o$/, 'a')]
    if (idx !== undefined) return { index: idx }
  }
  const num = t.match(/^(?:la|el|opcion|numero)?\s*#?([1-5])$/)
  if (num) return { index: Number(num[1]) - 1 }
  const of = t.match(/\b(?:la|el|lo) de ([a-z0-9 ]{3,40})$/)
  if (of) return { storefrontName: of[1].trim() }
  return undefined
}

/** Understand one message with rules. Never throws. */
export function parseIntent(message: string): IntentDelta {
  const t = fold(message)
  const delta: IntentDelta = { kind: 'unknown', source: 'rules' }
  if (!t) return delta

  if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|que mas|quiubo|saludos)\b[\s!.]*$/.test(t)) return { ...delta, kind: 'greeting' }
  if (/\b(que puedes hacer|como funciona|ayuda|que haces|quien eres)\b/.test(t)) return { ...delta, kind: 'help' }
  if (/\b(ultimo pedido|lo que pedi|pedi (ayer|antes|la vez|anoche|el otro)|parecido a lo|lo mismo de|como la otra vez|mis pedidos|lo de siempre)\b/.test(t)) {
    return { ...delta, kind: 'history' }
  }

  let rest = ` ${t} `
  const take = (re: RegExp, on: (m: RegExpMatchArray) => void) => {
    const m = rest.match(re)
    if (m) {
      on(m)
      rest = rest.replace(m[0], ' ')
    }
    return m
  }

  // Dropping filters ("sin límite de precio") before anything reads "sin …" as an ingredient.
  const clear: NonNullable<IntentDelta['clear']> = []
  take(/\b(sin limite de precio|cualquier precio|no importa el precio|sin importar el precio|quita el precio)\b/, () => clear.push('price'))
  take(/\b(sin limite de tiempo|no importa el tiempo|no tengo afan|sin afan)\b/, () => clear.push('time'))
  take(/\b(quita los filtros|sin filtros|borra los filtros)\b/, () => clear.push('price', 'time', 'tags', 'ingredients'))
  if (clear.length) delta.clear = clear

  // Time first ("tengo 30 minutos" is not money).
  take(/\b(\d{1,3})\s*(min|mins|minutos)\b/, (m) => (delta.maxMinutes = Number(m[1])))
  take(/\bmedia hora\b/, () => (delta.maxMinutes = 30))
  take(/\b(una hora|1 hora)\b/, () => (delta.maxMinutes = 60))

  // Rating (it does not exist yet: kept only to say so).
  take(/\b(?:mas de|mayor a|minimo|arriba de|por encima de)?\s*(\d(?:[.,]\d)?)\s*estrellas?\b/, (m) => (delta.minRating = Number(m[1].replace(',', '.'))))
  take(/\b(mejor (calificad[oa]s?|puntuad[oa]s?|rating|valorad[oa]s?)|mejores (reviews|resenas|calificaciones|comentarios)|mejor rating|mas estrellas|mejor reputacion)\b/, () => {
    delta.minRating = delta.minRating ?? 0
  })

  // Price limit.
  take(/\b(?:menos de|maximo|max|hasta|no mas de|por debajo de|que no pase(?:n)? de|presupuesto de|por menos de|tengo|que cueste menos de)\s*(\$?\s*\d[\d.,]*\s*(?:mil|k|lucas)?|(?:diez|quince|veinte|veinticinco|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien)\s*(?:mil|k))\b/, (m) => {
    delta.maxPrice = parseMoney(m[1])
  })

  // Dietary tags.
  const tags: DietaryTag[] = []
  take(/\b(sin gluten|gluten free|celiac[oa])\b/, () => tags.push('gluten_free'))
  take(/\b(vegan[oa]s?)\b/, () => tags.push('vegan'))
  take(/\b(vegetarian[oa]s?|veggie|sin carne)\b/, () => tags.push('vegetarian'))
  if (/\bpicante\b/.test(rest) && !/\bsin picante\b/.test(rest) && !/\bno .*picante\b/.test(rest)) {
    take(/\bpicante\b/, () => tags.push('spicy'))
  }
  if (tags.length) delta.tags = uniq(tags)

  // Exclusions and inclusions.
  const exclude: string[] = []
  const include: string[] = []
  for (;;) {
    const m = take(new RegExp(String.raw`\b(?:sin|que no (?:tenga|lleve|traiga)|no me gusta(?:n)?|no como|odio|soy alergic[oa] (?:a|al)|alergia (?:a|al))\s+(?:el |la |los |las )?([a-z ]{2,40}?)` + CLAUSE_END), (mm) => exclude.push(...ingredientsOf(mm[1])))
    if (!m) break
  }
  for (;;) {
    const m = take(new RegExp(String.raw`\b(?:que (?:tenga|lleve|traiga|venga con)|con (?:extra |mucho |mucha |doble )?)\s*([a-z ]{2,40}?)` + CLAUSE_END), (mm) => include.push(...ingredientsOf(mm[1])))
    if (!m) break
  }
  if (exclude.length) delta.excludeIngredients = uniq(exclude)
  if (include.length) delta.includeIngredients = uniq(include.filter((i) => !exclude.includes(i)))

  const sort = detectSort(rest)
  if (sort) delta.sort = sort
  if (NEAR.test(t)) delta.wantsNear = true

  // Question about the dish in focus / selection of a result.
  const question = detectQuestion(t)
  const select = detectSelect(t)

  // Food concepts in what is left (so "con papas" is not a second topic).
  const restWords = words(rest).map(singular)
  const restText = ` ${restWords.join(' ')} `
  const concepts = CONCEPTS.filter((c) => c.triggers.some((tr) => restText.includes(` ${tr}`)))
  const conceptWords = new Set(concepts.flatMap((c) => c.triggers.flatMap((tr) => tr.split(' '))))
  const leftovers = words(rest).filter(
    (w) => w.length >= 4 && !STOPWORDS.has(w) && !STOPWORDS.has(singular(w)) && !/^\d/.test(w),
  ).map(singular).filter((w) => !conceptWords.has(w) && ![...conceptWords].some((cw) => w.startsWith(cw)))

  const recommend = /\b(que me recomiendas|recomiendame|recomienda(me)?|sorprendeme|que hay|que tienes|que pido|no se que (comer|pedir)|lo mejor|la mejor opcion|que me sugieres)\b/.test(t)
  const reset = /\b(otra cosa|nueva busqueda|empezar de nuevo|olvidalo|mejor quiero|cambiemos|algo diferente|algo distinto)\b/.test(t)

  if (concepts.length) {
    delta.topic = concepts.map((c) => c.label).join(' o ')
    delta.terms = uniq([...concepts.flatMap((c) => c.terms), ...leftovers])
    const prefer = concepts.flatMap((c) => c.preferTags ?? [])
    if (prefer.length) delta.preferTags = uniq(prefer)
  } else if (leftovers.length && !question && !select) {
    delta.topic = leftovers.join(' ')
    delta.terms = uniq(leftovers)
    delta.lowConfidence = true
  }
  if (reset) delta.reset = true

  const again = /\b(ver otras|otras opciones|mas opciones|muestrame mas|ver mas|volver a las opciones|las opciones|que mas hay)\b/.test(t)

  const hasFilters =
    again || !!delta.clear ||
    delta.sort !== undefined || delta.maxPrice != null || delta.maxMinutes != null || !!delta.tags || !!delta.excludeIngredients ||
    !!delta.includeIngredients || delta.minRating != null || !!delta.wantsNear

  if (delta.terms?.length) delta.kind = 'search'
  else if (select) Object.assign(delta, { kind: 'select', select })
  else if (question && !hasFilters) Object.assign(delta, { kind: 'question', question })
  else if (question && delta.includeIngredients === undefined && question.kind === 'has_ingredient') Object.assign(delta, { kind: 'question', question })
  else if (hasFilters) delta.kind = 'refine'
  else if (recommend) delta.kind = 'recommend'
  else if (question) Object.assign(delta, { kind: 'question', question })
  return delta
}
