export interface Delta {
  text: string
  tone: 'good' | 'bad' | 'neutral'
}

/**
 * Change against the previous period, read as good or bad by what the metric is: more sales is good,
 * more minutes in the kitchen is not. Without a previous figure there is nothing to compare.
 */
export function deltaOf(current: number | null | undefined, previous: number | null | undefined, higherIsBetter: boolean, kind: 'ratio' | 'points' = 'ratio'): Delta | null {
  if (current == null || previous == null) return null
  if (kind === 'points') {
    const diff = Math.round((current - previous) * 1000) / 10
    if (diff === 0) return { text: 'Igual que el periodo anterior', tone: 'neutral' }
    return { text: `${diff > 0 ? '+' : ''}${diff.toLocaleString('es-CO')} pts vs. periodo anterior`, tone: diff > 0 === higherIsBetter ? 'good' : 'bad' }
  }
  if (previous === 0) return current === 0 ? { text: 'Igual que el periodo anterior', tone: 'neutral' } : null
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return { text: 'Igual que el periodo anterior', tone: 'neutral' }
  return { text: `${pct > 0 ? '+' : ''}${pct}% vs. periodo anterior`, tone: pct > 0 === higherIsBetter ? 'good' : 'bad' }
}
