import { Section } from '@/shared/ui/Section'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { typography } from '@/shared/ui/typography'
import clsx from 'clsx'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Info } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHere } from '@/shared/hooks/useBackTarget'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import type { InsightsData, ProductRow } from '../api'
import { BarList } from './BarList'
import { KpiStrip, type Kpi } from '@/shared/ui/KpiStrip'
import { SortableHeader, type SortDir } from '@/shared/ui/SortableHeader'
import { sortProducts, type ProductSort } from '../lib/sort'
import { TrendChart } from './TrendChart'
import { change, formatChange, formatMoney, formatNumber, formatPercent, formatPoints } from '../lib/format'
import { CHANNEL_LABEL, dayLabel, NO_CATEGORY, WEEKDAY_LABEL } from '../lib/labels'
import type { Insight } from '../lib/summary'

export type InsightsTab = 'overview' | 'sales' | 'products' | 'costs'

/** What every tab receives: the figures, the label of the comparison and the drill-down actions. */
export interface TabProps {
  data: InsightsData
  compareLabel: string | null
  summary: Insight[]
  onTab: (tab: InsightsTab) => void
  onCategory: (categoryId: string | null) => void
  onProduct: (product: ProductRow) => void
}

const COLORS = { revenue: '#f97316', profit: '#34d399', cogs: '#f87171', margin: '#a3a3a3', orders: '#a3a3a3' }

function ChangeCell({ value, goodWhen = 'up' }: { value: number | null; goodWhen?: 'up' | 'down' }) {
  if (value === null) return <span className="text-neutral-600">—</span>
  const good = value === 0 ? null : (value > 0) === (goodWhen === 'up')
  return <span className={clsx('tabular-nums', good === null ? 'text-neutral-400' : good ? 'text-emerald-400' : 'text-red-400')}>{formatChange(value)}</span>
}

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------
export function OverviewTab({ data, compareLabel, summary, onTab, onCategory, onProduct }: TabProps) {
  const cur = data.current
  const prev = data.previous
  const series = (pick: (d: InsightsData['daily'][number]) => number) => data.daily.map(pick)
  const kpis: Kpi[] = [
    { id: 'revenue', label: 'Ingresos', value: formatMoney(cur.revenue), change: change(cur.revenue, prev?.revenue), goodWhen: 'up', series: series((d) => d.revenue), onSelect: () => onTab('sales') },
    ...(data.profitability
      ? ([
          {
            id: 'cogs',
            label: 'Costo de ventas',
            value: formatMoney(cur.cogs ?? 0),
            change: change(cur.cogs, prev?.cogs),
            goodWhen: 'neutral',
            hint: cur.estimatedCogs ? `${formatMoney(cur.estimatedCogs)} estimado` : undefined,
            series: series((d) => d.cogs ?? 0),
            onSelect: () => onTab('costs'),
          },
          {
            id: 'gross-profit',
            label: 'Utilidad bruta',
            value: formatMoney(cur.grossProfit ?? 0),
            change: change(cur.grossProfit, prev?.grossProfit),
            goodWhen: 'up',
            series: series((d) => d.netRevenue - (d.cogs ?? 0)),
            onSelect: () => onTab('products'),
          },
          {
            id: 'gross-margin',
            label: 'Margen bruto',
            value: formatPercent(cur.grossMargin),
            change: cur.grossMargin != null && prev?.grossMargin != null ? cur.grossMargin - prev.grossMargin : null,
            changeLabel: cur.grossMargin != null && prev?.grossMargin != null ? formatPoints(cur.grossMargin - prev.grossMargin) : undefined,
            goodWhen: 'up',
            hint: cur.costCoverage != null && cur.costCoverage < 1 ? `Costo en ${formatPercent(cur.costCoverage, 0)} de las ventas` : undefined,
          },
        ] satisfies Kpi[])
      : []),
    { id: 'orders', label: 'Pedidos', value: formatNumber(cur.orders), change: change(cur.orders, prev?.orders), goodWhen: 'up', series: series((d) => d.orders), onSelect: () => onTab('sales') },
    { id: 'aov', label: 'Ticket promedio', value: cur.averageOrderValue !== null ? formatMoney(cur.averageOrderValue) : '—', change: change(cur.averageOrderValue, prev?.averageOrderValue), goodWhen: 'up' },
  ]

  const trend = data.daily.map((d) => {
    const profit = d.netRevenue - (d.cogs ?? 0)
    return {
      label: dayLabel(d.date),
      netRevenue: d.netRevenue,
      revenue: d.revenue,
      grossProfit: data.profitability ? profit : null,
      margin: data.profitability && d.netRevenue > 0 ? profit / d.netRevenue : null,
    }
  })

  return (
    <>
      <KpiStrip items={kpis} compareLabel={compareLabel} />

      <Section title="Resumen del negocio" description="Conclusiones calculadas con reglas fijas sobre tus datos; nada es estimado por IA.">
        <ul className="space-y-2">
          {summary.map((i) => {
            const Icon = i.tone === 'warning' ? AlertTriangle : i.tone === 'positive' ? ArrowUpRight : i.tone === 'negative' ? ArrowDownRight : Info
            return (
              <li
                key={i.id}
                className={clsx(
                  'flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm',
                  i.tone === 'warning' ? 'border-amber-500/30 bg-amber-500/5 text-amber-200' : 'border-neutral-800/60 text-neutral-200',
                )}
              >
                <Icon
                  size={16}
                  className={clsx('mt-0.5 shrink-0', i.tone === 'positive' ? 'text-emerald-400' : i.tone === 'negative' ? 'text-red-400' : i.tone === 'warning' ? 'text-amber-400' : 'text-neutral-500')}
                  aria-hidden
                />
                {i.text}
              </li>
            )
          })}
        </ul>
      </Section>

      <Section
        title={data.profitability ? 'Ingresos y rentabilidad' : 'Ingresos'}
        description={data.profitability ? 'Por día: ingresos netos de productos, utilidad bruta y margen bruto.' : 'Ingresos por día.'}
        card
      >
        <TrendChart
          data={trend}
          format={formatMoney}
          series={
            data.profitability
              ? [
                  { key: 'netRevenue', label: 'Ingresos netos', color: COLORS.revenue, kind: 'bar' },
                  { key: 'grossProfit', label: 'Utilidad bruta', color: COLORS.profit, kind: 'bar' },
                  { key: 'margin', label: 'Margen bruto', color: COLORS.margin, kind: 'line', axis: 'percent' },
                ]
              : [{ key: 'revenue', label: 'Ingresos', color: COLORS.revenue, kind: 'bar' }]
          }
        />
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Productos que más venden" description="Toca uno para ver sus pedidos.">
          <BarList
            items={data.products.slice(0, 5).map((p) => ({
              id: p.id,
              label: p.name,
              value: p.revenue,
              valueLabel: formatMoney(p.revenue),
              detail: data.profitability && p.grossMargin != null ? `margen ${formatPercent(p.grossMargin, 0)}` : `${formatNumber(p.units)} u.`,
              onSelect: () => onProduct(p),
            }))}
          />
        </Section>
        <Section title="Categorías" description="Toca una para ver sus productos.">
          <BarList
            items={data.categories.map((c) => ({
              id: c.id ?? 'none',
              label: c.name ?? NO_CATEGORY,
              value: c.revenue,
              valueLabel: formatMoney(c.revenue),
              detail: data.profitability && c.grossMargin != null ? `margen ${formatPercent(c.grossMargin, 0)}` : undefined,
              onSelect: c.id
                ? () => {
                    onCategory(c.id)
                    onTab('products')
                  }
                : undefined,
            }))}
          />
        </Section>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Ventas
// ---------------------------------------------------------------------------
export function SalesTab({ data }: TabProps) {
  const trend = data.daily.map((d) => ({ label: dayLabel(d.date), revenue: d.revenue, orders: d.orders }))
  const hours = data.byHour.filter((h) => h.orders > 0)
  return (
    <>
      <Section title="Ingresos y pedidos por día" card>
        <TrendChart
          data={trend}
          format={formatMoney}
          series={[
            { key: 'revenue', label: 'Ingresos', color: COLORS.revenue, kind: 'bar' },
            { key: 'orders', label: 'Pedidos', color: COLORS.orders, kind: 'line', axis: 'count' },
          ]}
        />
      </Section>
      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Por canal" description="Por dónde llegan los pedidos.">
          <BarList
            items={data.channels.map((c) => ({ id: c.channel, label: CHANNEL_LABEL[c.channel] ?? c.channel, value: c.revenue, valueLabel: formatMoney(c.revenue), detail: `${c.orders} ped.` }))}
          />
        </Section>
        <Section title="Por día de la semana">
          <BarList
            items={data.byWeekday.map((d) => ({ id: String(d.weekday), label: WEEKDAY_LABEL[d.weekday], value: d.revenue, valueLabel: formatMoney(d.revenue), detail: `${d.orders} ped.` }))}
          />
        </Section>
      </div>
      <Section title="Por hora del día" description="Hora local de la cuenta.">
        <BarList items={hours.map((h) => ({ id: String(h.hour), label: `${String(h.hour).padStart(2, '0')}:00`, value: h.revenue, valueLabel: formatMoney(h.revenue), detail: `${h.orders} ped.` }))} />
      </Section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------
export function ProductsTab({ data, onProduct, onCategory, compareLabel }: TabProps) {
  const [sort, setSort] = useState<{ key: ProductSort; dir: SortDir }>({ key: 'revenue', dir: 'desc' })
  const rows = useMemo(() => sortProducts(data.products, sort.key, sort.dir), [data.products, sort])
  const onSort = (key: ProductSort) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))
  const header = (label: string, key: ProductSort) => <SortableHeader label={label} column={key} sort={sort} onSort={onSort} align="right" />

  const columns: DataTableColumn<ProductRow>[] = [
    {
      key: 'name',
      header: 'Producto',
      cell: (p) => (
        <span className="min-w-0">
          <span className="block truncate font-medium text-neutral-100">{p.name}</span>
          <span className="block truncate text-xs text-neutral-500">{p.categoryName ?? NO_CATEGORY}</span>
        </span>
      ),
    },
    { key: 'units', header: header('Unidades', 'units'), align: 'right', hideBelow: 'sm', cell: (p) => <span className="tabular-nums">{formatNumber(p.units)}</span> },
    { key: 'revenue', header: header('Ingresos', 'revenue'), align: 'right', cell: (p) => <span className="tabular-nums text-neutral-100">{formatMoney(p.revenue)}</span> },
    ...(data.profitability
      ? ([
          {
            key: 'cogs',
            header: 'Costo',
            align: 'right',
            hideBelow: 'md',
            cell: (p) => (
              <span className="tabular-nums">
                {p.cogs != null ? formatMoney(p.cogs) : '—'}
                {p.costCoverage != null && p.costCoverage < 1 && <span className="ml-1 text-amber-400" title="Parte de las ventas no tiene costo registrado">*</span>}
              </span>
            ),
          },
          { key: 'grossProfit', header: header('Utilidad bruta', 'grossProfit'), align: 'right', hideBelow: 'sm', cell: (p) => <span className="tabular-nums">{p.grossProfit != null ? formatMoney(p.grossProfit) : '—'}</span> },
          { key: 'grossMargin', header: header('Margen', 'grossMargin'), align: 'right', cell: (p) => <span className="tabular-nums">{formatPercent(p.grossMargin)}</span> },
        ] satisfies DataTableColumn<ProductRow>[])
      : []),
    ...(compareLabel
      ? ([{ key: 'change', header: 'Ingresos vs. antes', align: 'right', hideBelow: 'lg', cell: (p) => <ChangeCell value={change(p.revenue, p.previousRevenue)} /> }] satisfies DataTableColumn<ProductRow>[])
      : []),
  ]

  return (
    <>
      {data.categories.length > 0 && (
        <Section title="Por categoría" description={data.profitability ? 'Ingresos y margen bruto. Toca una para filtrar.' : 'Toca una para filtrar.'}>
          <BarList
            items={data.categories.map((c) => ({
              id: c.id ?? 'none',
              label: c.name ?? NO_CATEGORY,
              value: c.revenue,
              valueLabel: formatMoney(c.revenue),
              detail: data.profitability && c.grossMargin != null ? `margen ${formatPercent(c.grossMargin, 0)}` : undefined,
              onSelect: c.id ? () => onCategory(c.id) : undefined,
            }))}
          />
        </Section>
      )}
      <Section title="Rentabilidad por producto" description="Ordena por cualquier columna; toca un producto para ver sus pedidos.">
        <DataTable columns={columns} rows={rows} getRowId={(p) => p.id} onRowClick={onProduct} emptyState={<p className="p-4 text-sm text-neutral-500">Sin ventas de productos en este periodo.</p>} />
        {data.profitability && rows.some((p) => p.costCoverage != null && p.costCoverage < 1) && (
          <p className={typography.caption}>* Parte de sus ventas no tiene costo registrado (producto sin receta): su margen puede estar sobreestimado.</p>
        )}
      </Section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Costos
// ---------------------------------------------------------------------------
export function CostsTab({ data, compareLabel }: TabProps) {
  // ADR 0030: from a cost to its cause — the ingredient or the supplier in Abastecimiento.
  const { can, path } = useActiveKitchen()
  const navigate = useNavigate()
  // «Volver» from Abastecimiento brings the person back to these figures (ADR 0031).
  const here = useHere('Insights')
  const openIngredient = can('inventory.view') ? (id: string) => navigate(path(`/supply/stock/${id}`), { state: { from: here } }) : null
  const openSupplier = can('suppliers.view') ? (id: string) => navigate(path(`/supply/proveedores/${id}`), { state: { from: here } }) : null
  const unitCosts = data.products.filter((p) => p.unitCost != null)
  const trend = data.daily.map((d) => ({ label: dayLabel(d.date), cogs: d.cogs ?? 0, margin: d.netRevenue > 0 ? (d.netRevenue - (d.cogs ?? 0)) / d.netRevenue : null }))
  const ingredientColumns: DataTableColumn<InsightsData['purchases']['ingredients'][number]>[] = [
    { key: 'name', header: 'Insumo', cell: (i) => <span className="font-medium text-neutral-100">{i.name}</span> },
    { key: 'qty', header: 'Comprado', align: 'right', hideBelow: 'sm', cell: (i) => <span className="tabular-nums">{formatNumber(i.quantity)} {i.unit ?? ''}</span> },
    { key: 'price', header: 'Precio promedio', align: 'right', cell: (i) => <span className="tabular-nums">{i.averagePrice != null ? `${formatMoney(i.averagePrice)}${i.unit ? ` / ${i.unit}` : ''}` : '—'}</span> },
    ...(compareLabel
      ? ([{ key: 'change', header: 'vs. antes', align: 'right', cell: (i) => <ChangeCell value={change(i.averagePrice, i.previousAveragePrice)} goodWhen="down" /> }] satisfies DataTableColumn<InsightsData['purchases']['ingredients'][number]>[])
      : []),
    { key: 'total', header: 'Total', align: 'right', hideBelow: 'md', cell: (i) => <span className="tabular-nums">{formatMoney(i.total)}</span> },
  ]

  return (
    <>
      {data.profitability && (
        <Section title="Costo de ventas por día" description="Costo real de lo vendido (y estimado de lo que aún no se prepara), con el margen bruto." card>
          <TrendChart
            data={trend}
            format={formatMoney}
            series={[
              { key: 'cogs', label: 'Costo de ventas', color: COLORS.cogs, kind: 'bar' },
              { key: 'margin', label: 'Margen bruto', color: COLORS.margin, kind: 'line', axis: 'percent' },
            ]}
          />
        </Section>
      )}
      {data.profitability && unitCosts.length > 0 && (
        <Section title="Costo por unidad" description="Costo real promedio de cada unidad vendida.">
          <DataTable
            columns={[
              { key: 'name', header: 'Producto', cell: (p: ProductRow) => <span className="font-medium text-neutral-100">{p.name}</span> },
              { key: 'unit', header: 'Ahora', align: 'right', cell: (p: ProductRow) => <span className="tabular-nums">{formatMoney(p.unitCost ?? 0)}</span> },
              ...(compareLabel
                ? [
                    { key: 'prev', header: 'Antes', align: 'right' as const, hideBelow: 'sm' as const, cell: (p: ProductRow) => <span className="tabular-nums text-neutral-400">{p.previousUnitCost != null ? formatMoney(p.previousUnitCost) : '—'}</span> },
                    { key: 'change', header: 'Cambio', align: 'right' as const, cell: (p: ProductRow) => <ChangeCell value={change(p.unitCost, p.previousUnitCost)} goodWhen="down" /> },
                  ]
                : []),
            ]}
            rows={unitCosts}
            getRowId={(p) => p.id}
          />
        </Section>
      )}
      <div className="grid gap-8 lg:grid-cols-2">
        <Section
          title="Compras por proveedor"
          description={`${formatMoney(data.purchases.total)} en compras confirmadas${data.purchases.previousTotal != null && compareLabel ? ` (antes ${formatMoney(data.purchases.previousTotal)})` : ''}.`}
        >
          <BarList
            items={data.purchases.bySupplier.map((s) => ({
              id: s.id,
              label: s.name,
              value: s.total,
              valueLabel: formatMoney(s.total),
              detail: `${s.purchases} compra${s.purchases === 1 ? '' : 's'}`,
              onSelect: openSupplier ? () => openSupplier(s.id) : undefined,
            }))}
            emptyText="Sin compras confirmadas en este periodo."
          />
        </Section>
        <Section
          title="Mermas"
          description={`${formatMoney(data.waste.total)} perdido${data.waste.previousTotal != null && compareLabel ? ` (antes ${formatMoney(data.waste.previousTotal)})` : ''}.`}
        >
          <BarList
            items={data.waste.byIngredient.map((w) => ({
              id: w.id,
              label: w.name,
              value: w.value,
              valueLabel: formatMoney(w.value),
              detail: `${formatNumber(w.quantity)} ${w.unit ?? ''}`,
              onSelect: openIngredient ? () => openIngredient(w.id) : undefined,
            }))}
            emptyText="Sin mermas registradas en este periodo."
          />
        </Section>
      </div>
      <Section title="Precio de compra de insumos" description="Precio promedio pagado por unidad de compra.">
        <DataTable
          columns={ingredientColumns}
          rows={data.purchases.ingredients}
          getRowId={(i) => `${i.id}-${i.unit}`}
          onRowClick={openIngredient ? (i) => openIngredient(i.id) : undefined}
          emptyState={<p className="p-4 text-sm text-neutral-500">Sin compras en este periodo.</p>}
        />
      </Section>
      <p className={typography.caption}>No incluye nómina, arriendo ni otros gastos operativos: Quanela todavía no los registra. Por eso se muestra la utilidad bruta y no la utilidad neta.</p>
    </>
  )
}
