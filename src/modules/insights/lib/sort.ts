import type { ProductRow } from '../api'

export type ProductSort = 'revenue' | 'grossProfit' | 'grossMargin' | 'units'

/** Products by revenue (relevance, the default), gross profit, margin or units; rows without cost go last. */
export function sortProducts(rows: ProductRow[], key: ProductSort, dir: 'asc' | 'desc'): ProductRow[] {
  const value = (r: ProductRow) =>
    key === 'revenue' ? r.revenue : key === 'units' ? r.units : key === 'grossProfit' ? (r.grossProfit ?? Number.NEGATIVE_INFINITY) : (r.grossMargin ?? Number.NEGATIVE_INFINITY)
  return [...rows].sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    if (va === vb) return 0
    if (va === Number.NEGATIVE_INFINITY) return 1
    if (vb === Number.NEGATIVE_INFINITY) return -1
    return dir === 'asc' ? va - vb : vb - va
  })
}
