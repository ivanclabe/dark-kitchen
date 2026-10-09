// ADR 0042: text helpers for Spanish (es-CO) food queries. Pure; shared by the
// Edge Function and the tests. The same folding as dk_fold() in SQL.

import type { DietaryTag } from './types.ts'

/** Lower case, no accents (ñ → n, like dk_fold), single spaces. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9$.,%\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Very light Spanish singular: hamburguesas → hamburguesa, tacos → taco, postres → postre. */
export function singular(word: string): string {
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

export function words(text: string): string[] {
  return fold(text).split(/[\s,.;:!?¿¡()]+/).filter(Boolean)
}

/** Words that never describe food. */
export const STOPWORDS = new Set(
  (
    'a al algo alguna alguno algun ante bajo buen buena bueno cabe como con contra cual cuales cuando de del desde donde dos el ella ' +
    'en entre era es esa ese eso esta este esto estoy favor gracias ha hay hoy la las le les lo los mas me mi mis mucho muy ' +
    'nada ni no nos o otra otro para pero poco por porque que quiero quisiera quiere queria queremos se sea ser si sin sobre ' +
    'su sus tal tambien te tener tengo ti todo tu tus un una uno unos unas y ya yo dame deme dime muestrame mostrar muestra ' +
    'busca buscame buscar encuentra encuentrame pedir pido pedimos comer comida comidas plato platos opcion opciones ' +
    'cerca rapido rapida barato barata economico economica caro cara mejor mejores ahora hambre antojo antoja provoca ' +
    'cenar almorzar desayunar almuerzo cena noche tarde manana medio dia rico rica bien lugar sitio restaurante negocio ' +
    'puedo pueden podria quieres prefiero prefieres recomiendas recomienda recomendacion ver hola buenas buenos dias noches ' +
    'tiene tienen tenga tengan sea sean cual cuales solo popular populares pedido vendido vendidos famoso famosa cercano cercana ' +
    'relacion precio precios calidad valor peso pesos lucas plata estrella estrellas rating reviews resenas calificacion minutos ' +
    'hora tiempo menos opcion tipo cosa cosas llegue llegar llega rapidito traiga lleve venga'
  ).split(' '),
)

/**
 * Food concepts: what people say → folded terms the retriever looks for (in the
 * name, category, description, cuisine, tags or published ingredients).
 */
export interface Concept {
  key: string
  label: string
  triggers: string[]
  terms: string[]
  preferTags?: DietaryTag[]
}

export const CONCEPTS: Concept[] = [
  { key: 'burger', label: 'hamburguesas', triggers: ['hamburguesa', 'burger', 'cheeseburger', 'hamburgue'], terms: ['hamburguesa', 'burger'] },
  { key: 'pizza', label: 'pizza', triggers: ['pizza', 'pizzeria'], terms: ['pizza'] },
  { key: 'chicken', label: 'pollo', triggers: ['pollo', 'alita', 'ala', 'broaster', 'chicken', 'nugget'], terms: ['pollo', 'alita', 'chicken'] },
  { key: 'mexican', label: 'comida mexicana', triggers: ['mexicana', 'mexicano', 'taco', 'burrito', 'quesadilla', 'nacho', 'mexican'], terms: ['taco', 'burrito', 'quesadilla', 'nacho', 'mexican'] },
  { key: 'asian', label: 'comida asiática', triggers: ['asiatica', 'asiatico', 'china', 'chino', 'sushi', 'ramen', 'wok', 'thai', 'japonesa', 'arroz chino'], terms: ['sushi', 'ramen', 'wok', 'asian', 'arroz chino'] },
  { key: 'healthy', label: 'algo saludable', triggers: ['saludable', 'sano', 'sana', 'fit', 'ligero', 'ligera', 'liviano', 'liviana', 'healthy', 'light'], terms: ['bowl', 'ensalada', 'wrap', 'healthy', 'quinoa'], preferTags: ['healthy', 'vegetarian', 'vegan'] },
  { key: 'salad', label: 'ensaladas', triggers: ['ensalada'], terms: ['ensalada'] },
  { key: 'bowl', label: 'bowls', triggers: ['bowl', 'poke'], terms: ['bowl', 'poke'] },
  { key: 'wrap', label: 'wraps', triggers: ['wrap'], terms: ['wrap'] },
  { key: 'fries', label: 'papas', triggers: ['papa', 'papita', 'francesa', 'frita'], terms: ['papa'] },
  { key: 'grill', label: 'parrilla', triggers: ['parrilla', 'asado', 'picada', 'carne asada', 'grill', 'costilla', 'churrasco'], terms: ['parrilla', 'asado', 'picada', 'grill', 'costilla', 'churrasco'] },
  { key: 'hotdog', label: 'perros calientes', triggers: ['perro caliente', 'perro', 'hot dog', 'hotdog'], terms: ['perro', 'hot dog'] },
  { key: 'sandwich', label: 'sánduches', triggers: ['sanduche', 'sandwich', 'sanduches', 'emparedado'], terms: ['sanduche', 'sandwich'] },
  { key: 'traditional', label: 'comida típica', triggers: ['tipica', 'tipico', 'colombiana', 'bandeja', 'ajiaco', 'sancocho', 'arepa', 'empanada', 'corrientazo'], terms: ['bandeja', 'ajiaco', 'sancocho', 'arepa', 'empanada', 'traditional'] },
  { key: 'seafood', label: 'mariscos', triggers: ['marisco', 'pescado', 'ceviche', 'camaron', 'pescados'], terms: ['marisco', 'pescado', 'ceviche', 'camaron', 'seafood'] },
  { key: 'dessert', label: 'postres', triggers: ['postre', 'dulce', 'helado', 'torta', 'brownie', 'pastel'], terms: ['postre', 'helado', 'torta', 'brownie', 'dessert'] },
  { key: 'coffee', label: 'café', triggers: ['cafe', 'capuchino', 'latte', 'tinto'], terms: ['cafe', 'coffee'] },
  { key: 'breakfast', label: 'desayunos', triggers: ['desayuno', 'calentado', 'huevos'], terms: ['desayuno', 'huevo', 'breakfast'] },
  { key: 'pasta', label: 'pasta', triggers: ['pasta', 'lasana', 'espagueti', 'spaghetti'], terms: ['pasta', 'lasana', 'espagueti'] },
]

/** Words that name an ingredient → its folded synonyms (to look for in the published ingredients). */
export const INGREDIENT_SYNONYMS: Record<string, string[]> = {
  queso: ['queso', 'cheddar', 'mozzarella', 'cheese', 'parmesano'],
  tocineta: ['tocineta', 'tocino', 'bacon', 'panceta'],
  cebolla: ['cebolla', 'onion'],
  tomate: ['tomate', 'tomato'],
  carne: ['carne', 'res', 'beef'],
  pollo: ['pollo', 'chicken'],
  cerdo: ['cerdo', 'pork', 'chicharron'],
  champinon: ['champinon', 'hongo', 'mushroom'],
  aguacate: ['aguacate', 'palta', 'guacamole'],
  pepinillo: ['pepinillo', 'pickle'],
  mani: ['mani', 'cacahuate', 'peanut'],
  gluten: ['gluten', 'trigo', 'harina'],
  lactosa: ['lactosa', 'leche', 'queso', 'crema', 'yogur'],
  picante: ['picante', 'aji', 'jalapeno', 'chile'],
  papa: ['papa', 'francesa'],
  pina: ['pina'],
  huevo: ['huevo'],
  ajo: ['ajo'],
  mayonesa: ['mayonesa', 'mayo'],
}

/** Canonical ingredient for a folded word (queso, quesito → queso; bacon → tocineta). */
export function canonicalIngredient(word: string): string {
  const w = singular(fold(word))
  for (const [key, synonyms] of Object.entries(INGREDIENT_SYNONYMS)) {
    if (synonyms.some((s) => w === s || w.startsWith(s))) return key
  }
  return w
}

/** Does any of the folded texts mention the ingredient (or a synonym)? */
export function mentions(texts: (string | null | undefined)[], ingredient: string): boolean {
  const synonyms = INGREDIENT_SYNONYMS[ingredient] ?? [ingredient]
  const haystack = ` ${texts.filter(Boolean).map((t) => fold(String(t))).join(' ')} `
  return synonyms.some((s) => new RegExp(`\\b${s}`).test(haystack))
}

const NUMBER_WORDS: Record<string, number> = {
  diez: 10, quince: 15, veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70,
  ochenta: 80, noventa: 90, cien: 100,
}

/**
 * A money amount in COP from "30 mil", "30.000", "$30.000", "30k", "30mil",
 * "treinta mil". Small numbers with "mil" are thousands; a bare small number
 * (e.g. "30") is read as thousands too, as people say prices in Colombia.
 */
export function parseMoney(text: string): number | null {
  const t = fold(text)
  const word = t.match(/\b(diez|quince|veinte|veinticinco|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien)\s*(mil|k)\b/)
  if (word) return NUMBER_WORDS[word[1]] * 1000
  const m = t.match(/\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(mil|k|lucas)?\b/)
  if (!m) return null
  const raw = m[1]
  let value = /[.,]\d{3}$/.test(raw) ? Number(raw.replace(/[.,]/g, '')) : Number(raw.replace(',', '.'))
  if (!Number.isFinite(value) || value <= 0) return null
  if (m[2] || value < 1000) value *= 1000
  return Math.round(value)
}
