/**
 * What a person types in a number field, read the Colombian way (ADR 0039):
 * «.» groups thousands, «,» separates decimals. «1.250.000» → 1250000,
 * «3,25» → 3.25, «$ 25.000 COP» → 25000. Null when it is not a number.
 */
export function parseLocaleNumber(text: string, { decimals = 2 }: { decimals?: number } = {}): number | null {
  const clean = text.replace(/\$|cop/gi, '').replace(/\s/g, '')
  if (!clean) return null
  if (!/^-?[\d.,]+$/.test(clean)) return null
  let normalized: string
  if (clean.includes(',')) {
    // «1.250,5»: dots group, the comma is the decimal separator.
    normalized = clean.replace(/\./g, '').replace(',', '.')
    if ((normalized.match(/\./g) ?? []).length > 1) return null
  } else {
    const parts = clean.split('.')
    // «1.250.000» or «25.000»: groups of 3 → thousands. «3.5»: a decimal point typed by habit.
    const grouped = parts.length > 1 && parts.slice(1).every((p) => p.length === 3)
    normalized = grouped ? parts.join('') : parts.length === 2 ? clean : clean.replace(/\./g, '')
  }
  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  const factor = 10 ** decimals
  return Math.round(n * factor) / factor
}

/** The number as it is shown while typing: «1.250.000», «3,25» (keeps a trailing «,» being typed). */
export function formatLocaleNumber(n: number | null, { decimals = 0 }: { decimals?: number } = {}): string {
  if (n === null || !Number.isFinite(n)) return ''
  return n.toLocaleString('es-CO', { maximumFractionDigits: decimals, useGrouping: true })
}

/**
 * The text of a field while the person types: digits grouped with «.», a «,»
 * decimal part kept as typed (up to `decimals`). «1250000» → «1.250.000»,
 * «3,2» → «3,2», «12,» → «12,».
 */
export function groupWhileTyping(text: string, decimals: number): string {
  const kept = text.replace(/[^\d,]/g, '')
  const [intPart, ...rest] = kept.split(',')
  const int = intPart.replace(/^0+(?=\d)/, '')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  if (decimals === 0 || rest.length === 0) return grouped
  return `${grouped || '0'},${rest.join('').slice(0, decimals)}`
}
