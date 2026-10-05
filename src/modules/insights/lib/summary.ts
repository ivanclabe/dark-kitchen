import type { InsightsData } from '../api'
import { change, formatChange, formatMoney, formatPercent } from './format'

/**
 * «Resumen del negocio» (ADR 0027, 2.4): sentences derived ONLY from the real
 * figures, with fixed rules and thresholds — no AI, nothing invented. With
 * little data (fewer than MIN_ORDERS orders) only the facts are stated.
 */
export type InsightTone = 'positive' | 'negative' | 'warning' | 'neutral'

export interface Insight {
  id: string
  tone: InsightTone
  text: string
}

export const MIN_ORDERS = 5
const REVENUE_CHANGE = 0.1
const MARGIN_POINTS = 0.03
const PRODUCT_MARGIN_GAP = 0.05
const UNIT_COST_CHANGE = 0.1
const MIN_UNITS = 3
const PRICE_CHANGE = 0.1
const WASTE_SHARE = 0.05
const MIN_COVERAGE = 0.9

export function businessSummary(data: InsightsData, compareLabel: string | null): Insight[] {
  const out: Insight[] = []
  const cur = data.current
  const prev = data.previous

  if (cur.orders === 0) {
    out.push({ id: 'empty', tone: 'neutral', text: 'No hay ventas en este periodo.' })
    return out
  }
  out.push({
    id: 'facts',
    tone: 'neutral',
    text: `Vendiste ${formatMoney(cur.revenue)} en ${cur.orders} ${cur.orders === 1 ? 'pedido' : 'pedidos'}${cur.averageOrderValue !== null ? ` (ticket promedio ${formatMoney(cur.averageOrderValue)})` : ''}.`,
  })

  // Missing costs make the margin look better than it is: always said.
  if (data.profitability && cur.costCoverage !== null && cur.costCoverage !== undefined && cur.costCoverage < MIN_COVERAGE) {
    out.push({
      id: 'coverage',
      tone: 'warning',
      text: `El ${formatPercent(1 - cur.costCoverage, 0)} de las ventas no tiene costo registrado: el margen puede estar sobreestimado.`,
    })
  }

  if (cur.orders < MIN_ORDERS) return out

  const revenueChange = change(cur.revenue, prev?.revenue)
  if (revenueChange !== null && Math.abs(revenueChange) >= REVENUE_CHANGE && compareLabel) {
    out.push({
      id: 'revenue',
      tone: revenueChange > 0 ? 'positive' : 'negative',
      text: `Los ingresos ${revenueChange > 0 ? 'subieron' : 'bajaron'} ${formatChange(Math.abs(revenueChange)).replace('+', '')} frente a ${compareLabel}.`,
    })
  }

  if (data.profitability) {
    const m = cur.grossMargin
    const pm = prev?.grossMargin
    if (m !== null && m !== undefined && pm !== null && pm !== undefined && (prev?.orders ?? 0) >= MIN_ORDERS && Math.abs(m - pm) >= MARGIN_POINTS) {
      out.push({
        id: 'margin',
        tone: m > pm ? 'positive' : 'warning',
        text: `El margen bruto ${m > pm ? 'subió' : 'bajó'} de ${formatPercent(pm, 0)} a ${formatPercent(m, 0)}.`,
      })
    }

    const categories = data.categories.filter((c) => c.revenue > 0 && c.grossMargin !== null && c.grossMargin !== undefined)
    if (categories.length >= 2) {
      const best = categories.reduce((a, b) => ((b.grossMargin ?? 0) > (a.grossMargin ?? 0) ? b : a))
      out.push({ id: 'best-category', tone: 'positive', text: `${best.name ?? 'Sin categoría'} tuvo el mayor margen bruto (${formatPercent(best.grossMargin, 0)}).` })
    }

    const products = data.products.filter((p) => p.revenue > 0 && p.grossMargin !== null && p.grossMargin !== undefined)
    if (products.length >= 2 && m !== null && m !== undefined) {
      const top = products.reduce((a, b) => (b.revenue > a.revenue ? b : a))
      if ((top.grossMargin ?? 0) < m - PRODUCT_MARGIN_GAP) {
        out.push({
          id: 'top-product-margin',
          tone: 'warning',
          text: `${top.name} generó más ingresos, pero su margen (${formatPercent(top.grossMargin, 0)}) está por debajo del promedio (${formatPercent(m, 0)}).`,
        })
      }
    }

    for (const p of data.products) {
      const c = change(p.unitCost, p.previousUnitCost)
      if (c !== null && c >= UNIT_COST_CHANGE && (p.realUnits ?? 0) >= MIN_UNITS && (p.previousRealUnits ?? 0) >= MIN_UNITS) {
        out.push({ id: `unit-cost-${p.id}`, tone: 'warning', text: `El costo por unidad de ${p.name} subió ${formatChange(c).replace('+', '')}.` })
      }
    }

    const cogs = cur.cogs ?? 0
    if (cogs > 0 && data.waste.total / cogs >= WASTE_SHARE) {
      out.push({ id: 'waste', tone: 'warning', text: `Las mermas equivalen al ${formatPercent(data.waste.total / cogs, 0)} del costo de ventas.` })
    }
  }

  for (const i of data.purchases.ingredients) {
    const c = change(i.averagePrice, i.previousAveragePrice)
    if (c !== null && Math.abs(c) >= PRICE_CHANGE && i.purchases >= 1 && i.previousPurchases >= 1) {
      out.push({
        id: `price-${i.id}`,
        tone: c > 0 ? 'warning' : 'positive',
        text: `${i.name} se compró ${formatChange(Math.abs(c)).replace('+', '')} más ${c > 0 ? 'caro' : 'barato'}${i.unit ? ` (por ${i.unit})` : ''}.`,
      })
    }
  }

  return out
}
