import { SettingsSubNav } from '@/modules/settings/ui/SettingsSubNav'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Button } from '@/shared/ui/Button'
import { ErrorState } from '@/shared/ui/ErrorState'
import { Input, Select } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Switch } from '@/shared/ui/Switch'
import { typography } from '@/shared/ui/typography'
import { todayStr } from '@/shared/utils/format'
import clsx from 'clsx'
import { Download, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ProductRow } from '../api'
import { ProductOrdersDrawer } from '../components/ProductOrdersDrawer'
import { useCatalogOptions, useInsights } from '../hooks'
import { downloadCsv, toCsv } from '../lib/csv'
import { exportRows } from '../lib/exportTab'
import { compareRange, presetRange, PRESET_LABEL, rangeLabel, type DateRange, type PeriodPreset } from '../lib/periods'
import { businessSummary } from '../lib/summary'
import { CostsTab, OverviewTab, ProductsTab, SalesTab, type InsightsTab } from './tabs'

const TABS: { value: InsightsTab; label: string }[] = [
  { value: 'overview', label: 'Resumen' },
  { value: 'sales', label: 'Ventas' },
  { value: 'products', label: 'Productos' },
  { value: 'costs', label: 'Costos' },
]

/**
 * Insights (ADR 0027): how the business is doing — revenue, cost of goods
 * sold, gross profit and margin, compared with the previous period, from the
 * account's real data. One row of filters for every tab; Resumen is the
 * executive center; Ventas, Productos and Costos go into detail.
 */
export function InsightsPage() {
  const { kitchen } = useActiveKitchen()
  const [params, setParams] = useSearchParams()
  const tab: InsightsTab = TABS.find((t) => t.value === params.get('tab'))?.value ?? 'overview'
  const setTab = (t: InsightsTab) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })

  const today = todayStr()
  const [preset, setPreset] = useState<PeriodPreset>('month')
  const [custom, setCustom] = useState<DateRange>(() => presetRange('month', today))
  const [comparing, setComparing] = useState(true)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [productId, setProductId] = useState<string | null>(null)
  const [openProduct, setOpenProduct] = useState<ProductRow | null>(null)

  const range = preset === 'custom' ? custom : presetRange(preset, today)
  const validRange = range.from <= range.to
  const compared = comparing && validRange ? compareRange(preset, range) : null
  const compareLabel = compared ? rangeLabel(compared) : null
  const { from, to } = range
  const compareFrom = compared?.from ?? null
  const compareTo = compared?.to ?? null
  // A stable key for the query: only real changes of period or filters refetch.
  const query = useMemo(
    () => ({ from, to, compare: compareFrom && compareTo ? { from: compareFrom, to: compareTo } : null, categoryId, productId }),
    [from, to, compareFrom, compareTo, categoryId, productId],
  )
  const insights = useInsights(query)
  const catalog = useCatalogOptions()
  const data = insights.data
  const summary = useMemo(() => (data ? businessSummary(data, compareLabel) : []), [data, compareLabel])

  const products = (catalog.data?.products ?? []).filter((p) => !categoryId || p.categoryId === categoryId)
  const filtered = categoryId !== null || productId !== null

  function exportCsv() {
    if (!data) return
    const { name, headers, rows } = exportRows(tab, data)
    downloadCsv(`insights-${kitchen.slug}-${name}-${range.from}-${range.to}.csv`, toCsv(headers, rows))
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className={typography.h1}>Insights</h1>
          <p className={clsx('mt-1', typography.small)}>Cómo va {kitchen.name}: ventas, costos y rentabilidad.</p>
        </div>
        <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!data}>
          Exportar CSV
        </Button>
      </header>

      {/* One row of filters for every tab. */}
      <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Filtros de Insights">
        <Select value={preset} onChange={(e) => setPreset(e.target.value as PeriodPreset)} aria-label="Periodo" className="!mt-0 w-auto min-w-[10rem]">
          {(Object.keys(PRESET_LABEL) as PeriodPreset[]).map((p) => (
            <option key={p} value={p}>
              {PRESET_LABEL[p]}
            </option>
          ))}
        </Select>
        {preset === 'custom' && (
          <>
            <Input type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="Desde" className="!mt-0 w-auto" />
            <Input type="date" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="Hasta" className="!mt-0 w-auto" />
          </>
        )}
        <Select
          value={categoryId ?? ''}
          onChange={(e) => {
            setCategoryId(e.target.value || null)
            setProductId(null)
          }}
          aria-label="Categoría"
          className="!mt-0 w-auto min-w-[10rem]"
          disabled={!catalog.data?.categories.length}
        >
          <option value="">Todas las categorías</option>
          {catalog.data?.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={productId ?? ''} onChange={(e) => setProductId(e.target.value || null)} aria-label="Producto" className="!mt-0 w-auto min-w-[10rem]">
          <option value="">Todos los productos</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            icon={X}
            onClick={() => {
              setCategoryId(null)
              setProductId(null)
            }}
          >
            Quitar filtros
          </Button>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm text-neutral-300">
          <Switch checked={comparing} onChange={setComparing} label="Comparar con el periodo anterior" />
          <span>
            Comparar{compareLabel && <span className="text-neutral-500"> con {compareLabel}</span>}
          </span>
        </label>
      </div>
      <p className={clsx('mb-4', typography.caption)}>
        {rangeLabel(range)}
        {data ? ` · hora de ${data.timezone}` : ''}
        {filtered ? ' · con filtros: los indicadores cuentan solo los productos filtrados' : ''}
      </p>

      <div className="mb-6">
        <SettingsSubNav label="Secciones de Insights" items={TABS} value={tab} onChange={setTab} />
      </div>

      {!validRange ? (
        <p className="text-sm text-amber-300">La fecha inicial debe ser anterior a la final.</p>
      ) : insights.isError ? (
        <ErrorState error={insights.error} onRetry={() => void insights.refetch()} />
      ) : !data ? (
        <LoadingState variant="block" />
      ) : (
        <div className={clsx('space-y-8 transition-opacity', insights.isPlaceholderData && 'opacity-60')} aria-busy={insights.isFetching}>
          {(() => {
            const props = { data, compareLabel, summary, onTab: setTab, onCategory: (id: string | null) => { setCategoryId(id); setProductId(null) }, onProduct: setOpenProduct }
            return tab === 'sales' ? <SalesTab {...props} /> : tab === 'products' ? <ProductsTab {...props} /> : tab === 'costs' ? <CostsTab {...props} /> : <OverviewTab {...props} />
          })()}
        </div>
      )}

      {openProduct && <ProductOrdersDrawer product={openProduct} from={range.from} to={range.to} periodLabel={rangeLabel(range)} onClose={() => setOpenProduct(null)} />}
    </div>
  )
}
