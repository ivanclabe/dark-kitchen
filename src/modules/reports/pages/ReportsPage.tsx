import { Card } from '@/shared/ui/Card'
import { Chip } from '@/shared/ui/Chip'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { FormField, FormGrid, Input } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { PageHeader } from '@/shared/ui/PageHeader'
import { StatCard } from '@/shared/ui/StatCard'
import { Tabs, type TabItem } from '@/shared/ui/Tabs'
import { cardClass } from '@/shared/ui/formClasses'
import { typography } from '@/shared/ui/typography'
import { formatDate, formatMoney, toDateInput } from '@/shared/utils/format'
import { BarChart3, Boxes, DollarSign, ShoppingCart, Trash2, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { usePurchasesBySupplier, useProfitability, useSalesByDay, useTopIngredientsPurchased, useTopProducts, useWasteReport } from '../hooks/useReports'
import type { SalesByDay, SupplierPurchase, TopIngredientPurchased, TopProduct, WasteReportRow } from '../types'

type ReportKey = 'ventas' | 'productos' | 'compras' | 'insumos' | 'mermas' | 'rentabilidad'

const REPORT_TABS: TabItem<ReportKey>[] = [
  { value: 'ventas', label: 'Ventas', icon: TrendingUp },
  { value: 'productos', label: 'Productos', icon: BarChart3 },
  { value: 'compras', label: 'Compras', icon: ShoppingCart },
  { value: 'insumos', label: 'Insumos', icon: Boxes },
  { value: 'mermas', label: 'Mermas', icon: Trash2 },
  { value: 'rentabilidad', label: 'Rentabilidad', icon: DollarSign },
]

type Preset = 'hoy' | 'semana' | 'mes'
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: '7 días' },
  { key: 'mes', label: '30 días' },
]

function presetRange(preset: Preset): { from: string; to: string } {
  const end = new Date()
  const start = new Date()
  if (preset === 'semana') start.setDate(end.getDate() - 6)
  if (preset === 'mes') start.setDate(end.getDate() - 29)
  return { from: toDateInput(start), to: toDateInput(end) }
}

/** Color de una cifra de margen: verde si es positiva, rojo si es negativa. */
function marginClass(n: number) {
  return n >= 0 ? 'text-emerald-400' : 'text-red-400'
}

const Money = ({ value, className = '' }: { value: number; className?: string }) => <span className={`tabular-nums ${className}`}>{formatMoney(value)}</span>
const Num = ({ value }: { value: number }) => <span className="tabular-nums">{value}</span>

function SalesChart({ from, to }: { from: string; to: string }) {
  const { data, isLoading, isError, error, refetch } = useSalesByDay(from, to)

  const totals = useMemo(() => {
    const rows = data ?? []
    return { revenue: rows.reduce((sum, r) => sum + r.total, 0), orders: rows.reduce((sum, r) => sum + r.orderCount, 0) }
  }, [data])
  const latestValue = data?.at(-1)?.total ?? 0

  const columns: DataTableColumn<SalesByDay>[] = [
    { key: 'day', header: 'Fecha', cell: (d) => formatDate(d.day) },
    { key: 'orders', header: 'Pedidos', cell: (d) => <Num value={d.orderCount} />, align: 'right' },
    { key: 'total', header: 'Total', cell: (d) => <Money value={d.total} />, align: 'right' },
  ]

  return (
    <div className="space-y-4">
      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} compact />
      ) : isLoading ? (
        <LoadingState variant="block" />
      ) : data && data.length > 0 ? (
        <Card padding={false}>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-800/60 px-5 py-4">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-medium text-neutral-500">
                <TrendingUp size={13} aria-hidden /> Ventas del período
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-50">{formatMoney(totals.revenue)}</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                {totals.orders} pedido{totals.orders === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <div className="px-2 pt-4 pb-2">
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="reportsSalesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#737373', fontSize: 11 }}
                    tickFormatter={(d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                    minTickGap={24}
                  />
                  <YAxis hide domain={['dataMin', 'dataMax']} />
                  {latestValue > 0 && <ReferenceLine y={latestValue} stroke="#34d399" strokeDasharray="3 3" strokeOpacity={0.5} />}
                  <Tooltip
                    cursor={{ stroke: '#404040' }}
                    contentStyle={{ background: '#171717', border: '1px solid #262626', borderRadius: 8, fontSize: 12, color: '#e5e5e5' }}
                    formatter={(value) => [formatMoney(Number(value)), 'Ventas']}
                    labelFormatter={(d) => formatDate(String(d))}
                  />
                  <Area type="stepAfter" dataKey="total" stroke="#34d399" strokeWidth={2} fill="url(#reportsSalesFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>
      ) : null}

      <DataTable
        columns={columns}
        rows={data}
        getRowId={(d) => d.day}
        isLoading={isLoading}
        error={isError ? error : undefined}
        onRetry={() => void refetch()}
        emptyState={<EmptyState icon={TrendingUp} title="Sin ventas en este rango" description="Prueba con otro rango de fechas." compact />}
      />
    </div>
  )
}

function TopProductsTable({ from, to }: { from: string; to: string }) {
  const { data, isLoading, isError, error, refetch } = useTopProducts(from, to)
  const columns: DataTableColumn<TopProduct>[] = [
    { key: 'product', header: 'Plato', cell: (p) => <span className="font-medium text-neutral-100">{p.productName}</span> },
    { key: 'qty', header: 'Cantidad vendida', cell: (p) => <Num value={p.qtySold} />, align: 'right' },
    { key: 'revenue', header: 'Ingresos', cell: (p) => <Money value={p.revenue} />, align: 'right', hideBelow: 'sm' },
    { key: 'margin', header: 'Margen estimado', cell: (p) => <Money value={p.margin} className={marginClass(p.margin)} />, align: 'right' },
  ]
  return (
    <DataTable
      columns={columns}
      rows={data}
      getRowId={(p) => p.productId}
      isLoading={isLoading}
      error={isError ? error : undefined}
      onRetry={() => void refetch()}
      emptyState={<EmptyState icon={BarChart3} title="Sin ventas en este rango" compact />}
    />
  )
}

function PurchasesBySupplierTable({ from, to }: { from: string; to: string }) {
  const { data, isLoading, isError, error, refetch } = usePurchasesBySupplier(from, to)
  const columns: DataTableColumn<SupplierPurchase>[] = [
    { key: 'supplier', header: 'Proveedor', cell: (s) => <span className="font-medium text-neutral-100">{s.supplierName}</span> },
    { key: 'count', header: 'N.º de compras', cell: (s) => <Num value={s.purchaseCount} />, align: 'right', hideBelow: 'sm' },
    { key: 'total', header: 'Total comprado', cell: (s) => <Money value={s.total} />, align: 'right' },
  ]
  return (
    <DataTable
      columns={columns}
      rows={data}
      getRowId={(s) => s.supplierId}
      isLoading={isLoading}
      error={isError ? error : undefined}
      onRetry={() => void refetch()}
      emptyState={<EmptyState icon={ShoppingCart} title="Sin compras confirmadas en este rango" compact />}
    />
  )
}

function TopIngredientsTable({ from, to }: { from: string; to: string }) {
  const { data, isLoading, isError, error, refetch } = useTopIngredientsPurchased(from, to)
  const columns: DataTableColumn<TopIngredientPurchased>[] = [
    { key: 'ingredient', header: 'Insumo', cell: (i) => <span className="font-medium text-neutral-100">{i.ingredientName}</span> },
    { key: 'qty', header: 'Cantidad comprada', cell: (i) => <Num value={i.quantity} />, align: 'right', hideBelow: 'sm' },
    { key: 'cost', header: 'Costo total', cell: (i) => <Money value={i.totalCost} />, align: 'right' },
  ]
  return (
    <DataTable
      columns={columns}
      rows={data}
      getRowId={(i) => i.ingredientId}
      isLoading={isLoading}
      error={isError ? error : undefined}
      onRetry={() => void refetch()}
      emptyState={<EmptyState icon={Boxes} title="Sin compras en este rango" compact />}
    />
  )
}

function WasteTable({ from, to }: { from: string; to: string }) {
  const { data, isLoading, isError, error, refetch } = useWasteReport(from, to)
  const columns: DataTableColumn<WasteReportRow>[] = [
    { key: 'ingredient', header: 'Insumo', cell: (w) => <span className="font-medium text-neutral-100">{w.ingredientName}</span> },
    { key: 'qty', header: 'Cantidad', cell: (w) => <Num value={w.quantity} />, align: 'right', hideBelow: 'sm' },
    { key: 'value', header: 'Valor estimado', cell: (w) => <Money value={w.estimatedValue} />, align: 'right' },
  ]
  return (
    <DataTable
      columns={columns}
      rows={data}
      getRowId={(w) => w.ingredientId}
      isLoading={isLoading}
      error={isError ? error : undefined}
      onRetry={() => void refetch()}
      emptyState={<EmptyState icon={Trash2} title="Sin mermas registradas en este rango" compact />}
    />
  )
}

function ProfitabilitySummary({ from, to }: { from: string; to: string }) {
  const { data, isLoading, isError, error, refetch } = useProfitability(from, to)
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} compact />
  if (isLoading) return <LoadingState variant="cards" rows={3} cols={3} />
  if (!data) return null
  const positive = data.grossMargin >= 0
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard label="Ventas del periodo" value={formatMoney(data.revenue)} icon={TrendingUp} tone="brand" emphasis />
        <StatCard label="Costo de insumos consumidos" value={formatMoney(data.cogs)} icon={Wallet} />
        <StatCard
          label="Margen bruto"
          value={<span className={marginClass(data.grossMargin)}>{formatMoney(data.grossMargin)}</span>}
          icon={positive ? TrendingUp : TrendingDown}
          tone={positive ? 'good' : 'warn'}
        />
      </div>
      <p className={typography.caption}>
        Rentabilidad general = ventas del periodo (pedidos no cancelados) − costo real de los insumos consumidos, tomado del ledger de inventario (movimientos
        CONSUMO) al costo promedio vigente en el momento de cada consumo.
      </p>
    </div>
  )
}

export function ReportsPage() {
  const [from, setFrom] = useState(() => presetRange('mes').from)
  const [to, setTo] = useState(() => presetRange('mes').to)
  const [tab, setTab] = useState<ReportKey>('ventas')

  function applyPreset(preset: Preset) {
    const range = presetRange(preset)
    setFrom(range.from)
    setTo(range.to)
  }

  function isPresetActive(preset: Preset) {
    const range = presetRange(preset)
    return range.from === from && range.to === to
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Reportes" description="Ventas, compras, mermas y rentabilidad por rango de fechas." icon={BarChart3} />

      <div className={`${cardClass} flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between`}>
        <FormGrid cols={2} className="lg:max-w-md lg:flex-1">
          <FormField label="Desde">{(a11y) => <Input {...a11y} type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />}</FormField>
          <FormField label="Hasta">{(a11y) => <Input {...a11y} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />}</FormField>
        </FormGrid>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Rangos rápidos">
          {PRESETS.map((p) => (
            <Chip key={p.key} label={p.label} active={isPresetActive(p.key)} onClick={() => applyPreset(p.key)} />
          ))}
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <Tabs value={tab} onChange={setTab} items={REPORT_TABS} />
      </div>

      {tab === 'ventas' && <SalesChart from={from} to={to} />}
      {tab === 'productos' && <TopProductsTable from={from} to={to} />}
      {tab === 'compras' && <PurchasesBySupplierTable from={from} to={to} />}
      {tab === 'insumos' && <TopIngredientsTable from={from} to={to} />}
      {tab === 'mermas' && <WasteTable from={from} to={to} />}
      {tab === 'rentabilidad' && <ProfitabilitySummary from={from} to={to} />}
    </div>
  )
}
