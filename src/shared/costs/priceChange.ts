/**
 * ADR 0063 (D4): is this price per base unit far from the usual one?
 * Compared with the last confirmed purchase and with the 90-day average; with
 * neither (a first purchase), with the average cost. Pure, so the manual
 * purchase and the invoice review warn with the same words.
 */
export interface PriceBaseline {
  lastPerBase: number | null
  avg90PerBase: number | null
  avgCost: number | null
}

export interface PriceChange {
  against: 'last' | 'avg90' | 'avgCost'
  /** Signed change in %, rounded. */
  pct: number
  ratio: number
}

const FRENTE: Record<PriceChange['against'], string> = {
  last: 'frente a la última compra',
  avg90: 'frente al promedio de 90 días',
  avgCost: 'frente al costo promedio',
}
const QUE: Record<PriceChange['against'], string> = {
  last: 'que la última compra',
  avg90: 'que el promedio de 90 días',
  avgCost: 'que el costo promedio',
}

/** The changes beyond the tolerance (the 90-day average is skipped when it says the same as the last purchase). */
export function priceChanges(perBase: number, baseline: PriceBaseline, tolerancePct: number): PriceChange[] {
  if (!(perBase > 0) || !(tolerancePct > 0)) return []
  const tol = tolerancePct / 100
  const out: PriceChange[] = []
  const check = (against: PriceChange['against'], ref: number | null) => {
    if (!ref || ref <= 0) return
    const ratio = perBase / ref
    if (Math.abs(ratio - 1) > tol) out.push({ against, pct: Math.round((ratio - 1) * 100), ratio })
  }
  if (baseline.lastPerBase || baseline.avg90PerBase) {
    check('last', baseline.lastPerBase)
    const last = baseline.lastPerBase
    const avg = baseline.avg90PerBase
    // Only a second warning when the average tells something else.
    if (!last || !avg || Math.abs(avg / last - 1) > tol / 2) check('avg90', avg)
  } else {
    check('avgCost', baseline.avgCost)
  }
  return out
}

/** «Sube 18 % frente a la última compra», «Cuesta 4 veces más que el costo promedio». */
export function priceChangeText(change: PriceChange): string {
  if (change.ratio >= 2) return `Cuesta ${Math.round(change.ratio)} veces más ${QUE[change.against]}`
  return `${change.pct > 0 ? 'Sube' : 'Baja'} ${Math.abs(change.pct)} % ${FRENTE[change.against]}`
}
