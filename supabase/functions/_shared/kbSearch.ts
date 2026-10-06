// ADR 0034: the ONE search over Quanela's help articles. Pure and without
// dependencies, so the public help center and «Oye Quanela» (the dk-copilot
// Edge Function) find exactly the same thing.
//
//   * Accents, capitals and punctuation do not matter; empty words are dropped;
//     words are reduced to a light stem («registro» ~ «registrar»).
//   * Business synonyms: pedido/orden/comanda, inventario/stock, reportes/Insights,
//     pago/cobro/abono, domicilio/despacho/entrega…
//   * The title and the way people ask («questions») weigh more than the
//     keywords, and those more than the text. Rare words weigh more than common ones.
//   * With the person's permissions, the articles of their screens rank higher.
import type { KbArticle } from './kbTypes.ts'

const STOP = new Set(
  (
    'a al algo como con cual cuales cuando de del donde el ella en es esa ese esta este esto hay la las le lo los me mi mis ' +
    'muy no o para pero por puedo puede que quiero se si sin sobre su sus te tengo tu un una uno y ya hago hacer debo usar uso ' +
    'oye quanela cuanela quiero saber necesito favor ayuda ayudame explica explicame dime'
  ).split(' '),
)

/** Groups of words that mean the same in a kitchen business (first = canonical). */
const SYNONYMS: string[][] = [
  ['pedido', 'orden', 'comanda', 'ordenes', 'pedidos'],
  ['inventario', 'stock', 'existencias', 'abastecimiento', 'bodega', 'insumo', 'insumos', 'ingrediente', 'ingredientes', 'materia'],
  ['reporte', 'reportes', 'informe', 'insights', 'estadisticas', 'metricas', 'indicadores'],
  ['pago', 'cobro', 'abono', 'cobrar', 'pagar', 'pagado', 'cobrado', 'pagos', 'cobros'],
  ['despacho', 'domicilio', 'entrega', 'entregar', 'despachar', 'domiciliario', 'repartidor', 'envio', 'domicilios'],
  ['cocina', 'kds', 'linea', 'preparar', 'preparacion'],
  ['plato', 'producto', 'carta', 'platos', 'productos'],
  ['menu', 'planificador', 'calendario'],
  ['usuario', 'empleado', 'trabajador', 'usuarios', 'empleados'],
  ['turno', 'turnos', 'jornada'],
  ['cliente', 'clientes', 'comprador'],
  ['deuda', 'cartera', 'debe', 'saldo', 'deben', 'fiado'],
  ['compra', 'compras', 'factura', 'facturas'],
  ['merma', 'desperdicio', 'perdida', 'ajuste'],
  ['voz', 'hablar', 'microfono', 'manos'],
  ['crear', 'nuevo', 'agregar', 'anadir', 'registrar', 'registro'],
  ['novedades', 'novedad', 'actualizacion', 'version', 'cambios'],
  ['cancelar', 'anular', 'eliminar', 'borrar'],
]

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const stem = (w: string) => (w.length > 5 ? w.slice(0, 5) : w)

const CANONICAL = new Map<string, string>()
for (const group of SYNONYMS) {
  const canon = stem(normalize(group[0]))
  for (const w of group) CANONICAL.set(stem(normalize(w)), canon)
}

/** The search terms of a text: normalized, without empty words, stemmed and canonical. */
export function terms(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => {
      const s = stem(w)
      return CANONICAL.get(s) ?? s
    })
}

const FIELDS = [
  ['title', 6],
  ['questions', 5],
  ['keywords', 4],
  ['summary', 3],
  ['headings', 2],
  ['steps', 1.5],
  ['body', 1],
] as const
type Field = (typeof FIELDS)[number][0]

interface Indexed {
  article: KbArticle
  fields: Record<Field, Set<string>>
  all: Set<string>
  phrases: string[]
}

const cache = new WeakMap<readonly KbArticle[], { docs: Indexed[]; df: Map<string, number> }>()

function index(kb: readonly KbArticle[]) {
  const hit = cache.get(kb)
  if (hit) return hit
  const docs = kb.map((article) => {
    const text: Record<Field, string> = {
      title: article.title,
      questions: article.questions.join(' '),
      keywords: article.keywords.join(' '),
      summary: article.summary,
      headings: article.headings.join(' '),
      steps: article.steps.join(' '),
      body: article.body,
    }
    const fields = Object.fromEntries(FIELDS.map(([f]) => [f, new Set(terms(text[f]))])) as Record<Field, Set<string>>
    const all = new Set(FIELDS.flatMap(([f]) => [...fields[f]]))
    return { article, fields, all, phrases: [article.title, ...article.questions].map(normalize) }
  })
  const df = new Map<string, number>()
  for (const d of docs) for (const t of d.all) df.set(t, (df.get(t) ?? 0) + 1)
  const built = { docs, df }
  cache.set(kb, built)
  return built
}

export interface KbHit {
  article: KbArticle
  score: number
  /** A short piece of the article to show under the title. */
  snippet: string
}

function snippetOf(article: KbArticle, queryTerms: Set<string>): string {
  const sentences = [article.summary, ...article.steps, ...article.body.split(/(?<=[.!?])\s+/)]
  return sentences.find((s) => terms(s).some((t) => queryTerms.has(t)))?.slice(0, 180) ?? article.summary
}

/**
 * The best articles for a question. `granted`: the person's permissions (and
 * actions), to rank their screens first; the help center is public, so
 * nothing is hidden.
 */
export function searchKb(query: string, kb: readonly KbArticle[], options: { granted?: Set<string>; limit?: number } = {}): KbHit[] {
  const q = terms(query)
  if (q.length === 0) return []
  const unique = new Set(q)
  const { docs, df } = index(kb)
  const n = docs.length
  const phrase = normalize(query)
  const hits: KbHit[] = []
  for (const d of docs) {
    let score = 0
    for (const t of unique) {
      if (!d.all.has(t)) continue
      const idf = Math.log(1 + n / (df.get(t) ?? 1))
      for (const [field, weight] of FIELDS) if (d.fields[field].has(t)) score += weight * idf
    }
    if (score === 0) continue
    // The person asked almost exactly a known question or the title.
    if (phrase.length > 8 && d.phrases.some((p) => p.includes(phrase) || phrase.includes(p))) score *= 1.5
    if (options.granted && d.article.permissions.length > 0) {
      score *= d.article.permissions.some((p) => options.granted!.has(p)) ? 1.15 : 0.85
    }
    hits.push({ article: d.article, score, snippet: snippetOf(d.article, unique) })
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, options.limit ?? 5)
}
