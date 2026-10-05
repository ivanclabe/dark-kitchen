/** Number formats of Insights (es-CO): money comes from the shared formatter. */
export { formatMoney } from '@/shared/utils/format'

/** 0.9048 → "90,5 %". */
export function formatPercent(ratio: number | null | undefined, digits = 1): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—'
  return `${(ratio * 100).toLocaleString('es-CO', { maximumFractionDigits: digits, minimumFractionDigits: 0 })} %`
}

/** Relative change, or null when there is nothing to compare with (never "+∞ %"). */
export function change(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current === null || current === undefined || previous === null || previous === undefined || previous === 0) return null
  return (current - previous) / Math.abs(previous)
}

/** +0.124 → "+12,4 %"; −0.05 → "−5 %". */
export function formatChange(ratio: number): string {
  const sign = ratio > 0 ? '+' : ratio < 0 ? '−' : ''
  return `${sign}${Math.abs(ratio * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`
}

/** Difference between two margins in percentage points: 0.61 → 0.57 = "−4 pts". */
export function formatPoints(diff: number): string {
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : ''
  return `${sign}${Math.abs(diff * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 })} pts`
}

export function formatNumber(n: number): string {
  return n.toLocaleString('es-CO', { maximumFractionDigits: 2 })
}
