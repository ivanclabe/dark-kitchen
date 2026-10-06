// ADR 0033, phase 4: how each Copilot answer is scored. Pure (no network), so
// the app's tests check it too. Used by scripts/copilot-eval.ts.

export interface Expect {
  intent?: string[]
  scope: string[]
  /** ADR 0034: the help center article the answer must link to. */
  link?: string
}

export interface EvalAnswer {
  answer: string
  spoken: string
  intent: string
  scope: string
  links?: { id: string; title: string; url: string }[]
}

/** $1.250.000 — the format Copilot is told to use (es-CO, no decimals). */
export function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString('es-CO').replace(/,/g, '.')}`
}

const digits = (text: string) => text.replace(/[.\s]/g, '')

/**
 * Does the answer carry the right figure? Money as $1.250.000 (or without the
 * dots), counts as the number. A zero is fine said as «no hay / ningún / 0».
 */
export function mentionsFigure(answer: string, value: number, kind: 'money' | 'count'): boolean {
  if (value === 0) return /\b0\b|no hay|ningun|ningún|sin (ventas|pedidos|cobros)|\$0/i.test(answer)
  if (kind === 'money') {
    const formatted = formatMoney(value)
    return answer.includes(formatted) || digits(answer).includes(digits(formatted))
  }
  return new RegExp(`(^|[^\\d.])${Math.round(value)}([^\\d]|$)`).test(answer)
}

/** A money figure where there must be none (a question about data Quanela does not keep). */
export function inventsMoney(answer: string): boolean {
  return /\$\s?\d/.test(answer)
}

/**
 * Clarity, 1 to 5, without a judge: it answers first, it is short, the spoken
 * version is one or two clean sentences, and it is Spanish.
 */
export function clarityHeuristic(a: EvalAnswer): number {
  let score = 0
  if (a.answer.trim()) score++
  if (a.answer.length <= 900) score++
  const first = a.answer.split(/(?<=[.!?])\s|\n/)[0] ?? ''
  if (first.length > 0 && first.length <= 220) score++
  const sentences = a.spoken.split(/(?<=[.!?])\s+/).filter(Boolean)
  if (a.spoken && sentences.length <= 2 && !/[|*#[\]]/.test(a.spoken)) score++
  if (!/\b(the|and|you|please|sorry)\b/i.test(`${a.answer} ${a.spoken}`)) score++
  return score
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[i]
}

/** Read `a.b.c` from a tool result. */
export function pick(data: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), data)
}

/** Word error rate between what was said and what was understood (0 = perfect). */
export function wer(expected: string, heard: string): number {
  const norm = (t: string) =>
    t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[¿?¡!.,]/g, ' ').split(/\s+/).filter(Boolean)
  const a = norm(expected)
  const b = norm(heard)
  if (a.length === 0) return b.length === 0 ? 0 : 1
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length] / a.length
}
