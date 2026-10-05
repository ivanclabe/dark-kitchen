import type { InsightsData, Kpis } from '../api'
import type { CsvCell } from './csv'
import { CHANNEL_LABEL, NO_CATEGORY } from './labels'

/** What "Exportar CSV" downloads for each tab: what the person is looking at, with the same filters (ADR 0027). */
export function exportRows(tab: 'overview' | 'sales' | 'products' | 'costs', data: InsightsData): { name: string; headers: string[]; rows: CsvCell[][] } {
  const costs = data.profitability
  switch (tab) {
    case 'overview': {
      const row = (label: string, pick: (k: Kpis) => number | null | undefined): CsvCell[] => [label, pick(data.current), data.previous ? pick(data.previous) : null]
      return {
        name: 'resumen',
        headers: ['Indicador', `Periodo ${data.period.from} a ${data.period.to}`, data.compare ? `Periodo ${data.compare.from} a ${data.compare.to}` : 'Periodo anterior'],
        rows: [
          row('Ingresos', (k) => k.revenue),
          row('Ingresos netos de productos', (k) => k.netRevenue),
          ...(costs
            ? [
                row('Costo de ventas', (k) => k.cogs),
                row('Costo de ventas estimado', (k) => k.estimatedCogs),
                row('Utilidad bruta', (k) => k.grossProfit),
                row('Margen bruto', (k) => k.grossMargin),
                row('Cobertura de costo', (k) => k.costCoverage),
              ]
            : []),
          row('Pedidos', (k) => k.orders),
          row('Unidades', (k) => k.units),
          row('Ticket promedio', (k) => k.averageOrderValue),
        ],
      }
    }
    case 'sales':
      return {
        name: 'ventas',
        headers: ['Fecha', 'Ingresos', 'Ingresos netos de productos', 'Pedidos', ...(costs ? ['Costo de ventas'] : [])],
        rows: [
          ...data.daily.map((d) => [d.date, d.revenue, d.netRevenue, d.orders, ...(costs ? [d.cogs ?? 0] : [])]),
          [],
          ['Canal', 'Ingresos', '', 'Pedidos'],
          ...data.channels.map((c) => [CHANNEL_LABEL[c.channel] ?? c.channel, c.revenue, null, c.orders]),
        ],
      }
    case 'products':
      return {
        name: 'productos',
        headers: ['Producto', 'Categoría', 'Unidades', 'Ingresos', ...(costs ? ['Costo', 'Utilidad bruta', 'Margen bruto', 'Cobertura de costo'] : []), 'Ingresos periodo anterior'],
        rows: data.products.map((p) => [
          p.name,
          p.categoryName ?? NO_CATEGORY,
          p.units,
          p.revenue,
          ...(costs ? [p.cogs, p.grossProfit, p.grossMargin, p.costCoverage] : []),
          p.previousRevenue,
        ]),
      }
    case 'costs':
      return {
        name: 'costos',
        headers: ['Insumo', 'Unidad', 'Cantidad comprada', 'Total', 'Precio promedio', 'Precio promedio anterior', 'Compras'],
        rows: [
          ...data.purchases.ingredients.map((i) => [i.name, i.unit, i.quantity, i.total, i.averagePrice, i.previousAveragePrice, i.purchases]),
          [],
          ['Merma', 'Unidad', 'Cantidad', 'Valor'],
          ...data.waste.byIngredient.map((w) => [w.name, w.unit, w.quantity, w.value]),
        ],
      }
  }
}
