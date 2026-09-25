import { useReceivables } from '@/modules/cartera/hooks/useReceivables'
import { useDispatchedOrders, useReadyOrders } from '@/modules/delivery/hooks/useDelivery'
import { useKitchenQueue } from '@/modules/kitchen/hooks/useKitchen'
import { useKitchenSlaSettings } from '@/modules/kitchen/hooks/useKitchenSettings'
import { alertMinutesFor, DEFAULT_SLA_THRESHOLDS, minutesAgoSince, timeTier } from '@/modules/kitchen/lib/ticketVisuals'
import { useOrders } from '@/modules/orders/hooks/useOrders'
import { OrderStatusBadge } from '@/modules/orders/lib/orderStatus'
import { useSalesByDay } from '@/modules/reports/hooks/useReports'
import { useAuth } from '@/shared/hooks/useAuth'
import { useNow } from '@/shared/hooks/useNow'
import { buttonClass } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { Chip } from '@/shared/ui/Chip'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Tooltip } from '@/shared/ui/Tooltip'
import { iconButtonClass } from '@/shared/ui/formClasses'
import { typography } from '@/shared/ui/typography'
import { formatDate, formatDateLong, formatDateTime, formatMoney, toDateInput, todayStr } from '@/shared/utils/format'
import clsx from 'clsx'
import {
  ArrowRight,
  BarChart3,
  ChefHat,
  ChevronDown,
  ClipboardList,
  Eye,
  EyeOff,
  Flame,
  Maximize2,
  Plus,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { KitchenLink as Link } from '@/shared/kitchen/KitchenLink'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts'
import { useDashboardSummary } from '../hooks/useDashboard'
import type { DashboardSummary } from '../types'

type SalesRange = '7d' | '30d' | '90d'

const RANGE_DAYS: Record<SalesRange, number> = { '7d': 7, '30d': 30, '90d': 90 }
const RANGE_LABEL: Record<SalesRange, string> = { '7d': '7 días', '30d': '30 días', '90d': '90 días' }
const RANGES = Object.keys(RANGE_DAYS) as SalesRange[]

const CHART_GREEN = '#34d399'

function compactMoney(n: number): string {
  return Math.abs(n) >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`
}

function pctLabel(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${pct}%`
}

/** Lista compacta label → valor con divisores — el mismo patrón de "Cierre anterior / Precio máximo / …" de una ficha de mercado. */
function StatList({ items }: { items: { label: string; value: ReactNode; tone?: 'good' | 'warn'; to?: string }[] }) {
  return (
    <dl className="divide-y divide-neutral-800/60">
      {items.map((item) => {
        const row = (
          <>
            <dt className={typography.small}>{item.label}</dt>
            <dd className={clsx('text-sm font-semibold tabular-nums', item.tone === 'warn' ? 'text-red-400' : item.tone === 'good' ? 'text-emerald-400' : 'text-neutral-50')}>
              {item.value}
            </dd>
          </>
        )
        return item.to ? (
          <Link key={item.label} to={item.to} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-neutral-800/50">
            {row}
          </Link>
        ) : (
          <div key={item.label} className="flex items-center justify-between gap-3 py-3">
            {row}
          </div>
        )
      })}
    </dl>
  )
}

// ---------------------------------------------------------------------------
// Barra superior
// ---------------------------------------------------------------------------

/** Acción de la barra superior: botón circular con la etiqueta debajo, como "Depositar / Retirar / Buscar". */
function HeroAction({ icon: Icon, label, to }: { icon: LucideIcon; label: string; to: string }) {
  return (
    <Link to={to} className="group flex flex-col items-center gap-1.5 text-xs font-medium text-neutral-300 transition-colors hover:text-neutral-50">
      <span className="flex size-11 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900 transition-colors group-hover:border-neutral-700 group-hover:bg-neutral-800">
        <Icon size={17} aria-hidden />
      </span>
      {label}
    </Link>
  )
}

function DashboardHero({
  firstName,
  salesToday,
  ordersToday,
  loading,
}: {
  firstName: string
  salesToday: number | null
  ordersToday: number | null
  loading: boolean
}) {
  const [hidden, setHidden] = useState(false)
  // Reloj real (tick de 1s porque se ve el segundero), no decorativo.
  const now = useNow(1000)
  const clock = new Date(now).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

  return (
    <div className="flex flex-col gap-5 border-b border-neutral-800/60 pb-5 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-brasa-500/20 bg-brasa-500/10 text-brasa-400">
          <Flame size={18} aria-hidden />
        </span>
        <div>
          <p className="flex items-center gap-2 text-base font-semibold text-neutral-100">
            Hola, {firstName}
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" aria-label="En vivo" />
          </p>
          <p className="text-sm text-neutral-400">
            {formatDateLong(todayStr())} · <span className="tabular-nums">{clock}</span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="md:text-right">
          <button
            type="button"
            onClick={() => setHidden((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-300"
          >
            Ventas de hoy {hidden ? <EyeOff size={13} aria-hidden /> : <Eye size={13} aria-hidden />}
          </button>
          {loading ? (
            <div className="mt-1.5 h-7 w-40 animate-pulse rounded bg-neutral-800 md:ml-auto" />
          ) : (
            <p className="mt-0.5 flex items-baseline gap-2 text-xl font-semibold tabular-nums text-neutral-50 md:justify-end">
              {hidden ? '••••••' : formatMoney(salesToday ?? 0)}
              <span className="font-light text-neutral-700" aria-hidden>
                |
              </span>
              <span className="text-sm font-medium text-neutral-400">
                {ordersToday ?? 0} pedido{ordersToday === 1 ? '' : 's'}
              </span>
            </p>
          )}
        </div>

        <div className="flex items-start gap-5">
          <HeroAction icon={ShoppingCart} label="Compras" to="/supply/compras" />
          <HeroAction icon={Users} label="Clientes" to="/customers" />
          <HeroAction icon={BarChart3} label="Reportes" to="/reports" />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ventas: panel de métricas (izquierda) + gráfico (derecha)
// ---------------------------------------------------------------------------

interface ChartPoint {
  day: string
  label: string
  total: number
  orderCount: number
}

/**
 * Un solo fetch (dk_report_sales_by_day, el doble del rango elegido para
 * poder comparar con el período anterior) alimenta tanto el panel de cifras
 * como el gráfico — nada se calcula dos veces ni con datos distintos.
 */
function useSalesOverview(range: SalesRange) {
  const days = RANGE_DAYS[range]
  const todayKey = todayStr()

  const { fetchFrom, periodStartKey } = useMemo(() => {
    const today = new Date(`${todayKey}T00:00:00`)
    const from = new Date(today)
    from.setDate(from.getDate() - (days * 2 - 1))
    const start = new Date(today)
    start.setDate(start.getDate() - (days - 1))
    return { fetchFrom: toDateInput(from), periodStartKey: toDateInput(start) }
  }, [todayKey, days])

  const query = useSalesByDay(fetchFrom, todayKey)

  const stats = useMemo(() => {
    const rows = query.data ?? []
    const current = rows.filter((r) => r.day >= periodStartKey)
    const previous = rows.filter((r) => r.day < periodStartKey)
    const total = current.reduce((sum, r) => sum + r.total, 0)
    const prevTotal = previous.reduce((sum, r) => sum + r.total, 0)
    const orders = current.reduce((sum, r) => sum + r.orderCount, 0)

    const start = new Date(`${periodStartKey}T00:00:00`)
    const chartData: ChartPoint[] = Array.from({ length: days }).map((_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const key = toDateInput(d)
      const match = current.find((r) => r.day === key)
      return {
        day: key,
        label: d.toLocaleDateString('es-CO', { day: 'numeric', month: days > 30 ? 'short' : undefined }),
        total: match?.total ?? 0,
        orderCount: match?.orderCount ?? 0,
      }
    })

    const latest = chartData.at(-1)?.total ?? 0
    const prevDay = chartData.at(-2)?.total ?? 0
    const bestDay = current.reduce<(typeof current)[number] | null>((best, r) => (r.total > (best?.total ?? 0) ? r : best), null)

    return {
      total,
      orders,
      trendPct: prevTotal === 0 ? null : Math.round(((total - prevTotal) / prevTotal) * 100),
      diff: total - prevTotal,
      avgTicket: orders > 0 ? total / orders : 0,
      avgDaily: total / days,
      bestDay,
      activeDays: current.filter((r) => r.total > 0).length,
      chartData,
      latest,
      dayDiff: latest - prevDay,
      dayPct: prevDay === 0 ? null : Math.round(((latest - prevDay) / prevDay) * 100),
    }
  }, [query.data, periodStartKey, days])

  return { ...query, stats, days }
}

type SalesStats = ReturnType<typeof useSalesOverview>['stats']

function SalesSummaryPanel({
  range,
  onRangeChange,
  stats,
  loading,
}: {
  range: SalesRange
  onRangeChange: (r: SalesRange) => void
  stats: SalesStats
  loading: boolean
}) {
  return (
    <div className="flex flex-col gap-5">
      {/* Selector de período: ícono + nombre + chevron, como el selector de instrumento. */}
      <label className="flex w-fit cursor-pointer items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-brasa-500/20 bg-brasa-500/10 text-brasa-400">
          <Flame size={16} aria-hidden />
        </span>
        <span className="relative flex items-center">
          <select
            value={range}
            onChange={(e) => onRangeChange(e.target.value as SalesRange)}
            aria-label="Período de ventas"
            className="cursor-pointer appearance-none bg-transparent pr-6 text-lg font-semibold text-neutral-100 outline-none focus-visible:underline"
          >
            {RANGES.map((r) => (
              <option key={r} value={r} className="bg-neutral-900">
                Ventas · {RANGE_LABEL[r]}
              </option>
            ))}
          </select>
          <ChevronDown size={18} className="pointer-events-none absolute right-0 text-brasa-400" aria-hidden />
        </span>
      </label>

      <div>
        {loading ? (
          <div className="h-10 w-48 animate-pulse rounded bg-neutral-800" />
        ) : (
          <p className={clsx(typography.display, 'tabular-nums')}>{formatMoney(stats.total)}</p>
        )}
        <p className="mt-1.5 text-sm text-neutral-300">
          {stats.trendPct === null ? (
            <>
              {stats.orders} pedido{stats.orders === 1 ? '' : 's'} en el período
            </>
          ) : (
            <>
              {stats.diff >= 0 ? 'Subió' : 'Bajó'}{' '}
              <span className={clsx('font-medium tabular-nums', stats.diff >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {formatMoney(Math.abs(stats.diff))} ({pctLabel(stats.trendPct)})
              </span>{' '}
              vs. período anterior
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link to="/reports" className={buttonClass({ variant: 'secondary' })}>
          <BarChart3 aria-hidden /> Reportes
        </Link>
        <Link to="/kitchen" className={buttonClass({ variant: 'ghost' })}>
          <ChefHat aria-hidden /> Cocina
        </Link>
      </div>

      <StatList
        items={[
          { label: 'Pedidos', value: stats.orders },
          { label: 'Ticket promedio', value: formatMoney(stats.avgTicket) },
          { label: 'Mejor día', value: stats.bestDay ? `${formatMoney(stats.bestDay.total)} · ${formatDate(stats.bestDay.day)}` : '—' },
          { label: 'Promedio diario', value: formatMoney(stats.avgDaily) },
          { label: 'Días con ventas', value: stats.activeDays },
        ]}
      />
    </div>
  )
}

/** Etiqueta del último valor sobre el eje derecho — la "pastilla" verde de la referencia. */
function CurrentValueLabel({ viewBox, value }: { viewBox?: { x: number; y: number; width: number; height: number }; value: string }) {
  if (!viewBox) return null
  const width = Math.max(44, value.length * 6.6 + 10)
  const x = viewBox.x + viewBox.width + 4
  const y = viewBox.y
  return (
    <g>
      <rect x={x} y={y - 9} width={width} height={18} rx={4} fill={CHART_GREEN} />
      <text x={x + width / 2} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill="#052e16">
        {value}
      </text>
    </g>
  )
}

const toolbarIconClass =
  'inline-flex size-11 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800 hover:text-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500'

function SalesChartCard({
  range,
  onRangeChange,
  stats,
  loading,
  error,
  onRetry,
}: {
  range: SalesRange
  onRangeChange: (r: SalesRange) => void
  stats: SalesStats
  loading: boolean
  error: unknown
  onRetry: () => void
}) {
  const now = useNow(1000)
  const clock = new Date(now).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const utcOffset = -new Date().getTimezoneOffset() / 60
  const dayUp = stats.dayDiff >= 0

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* Fila de acciones: la primaria bien visible + herramientas, como "Comprar" + íconos. */}
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/kitchen" className={buttonClass({ variant: 'primary', size: 'lg' })}>
          <Plus aria-hidden /> Nuevo pedido
        </Link>
        <Tooltip label="Cocina" side="bottom">
          <Link to="/kitchen" aria-label="Cocina" className={toolbarIconClass}>
            <ChefHat size={17} aria-hidden />
          </Link>
        </Tooltip>
        <Tooltip label="Despachos" side="bottom">
          <Link to="/kitchen" aria-label="Despachos" className={toolbarIconClass}>
            <Truck size={17} aria-hidden />
          </Link>
        </Tooltip>
        <Tooltip label="Clientes" side="bottom">
          <Link to="/customers" aria-label="Clientes" className={toolbarIconClass}>
            <Users size={17} aria-hidden />
          </Link>
        </Tooltip>
        <Tooltip label="Ver reporte completo" side="bottom">
          <Link to="/reports" aria-label="Ver reporte completo" className={toolbarIconClass}>
            <Maximize2 size={17} aria-hidden />
          </Link>
        </Tooltip>
      </div>

      <Card padding={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800/60 px-3 py-2">
          <div className="flex items-center gap-1" role="group" aria-label="Rango del gráfico">
            {RANGES.map((r) => (
              <Chip key={r} label={RANGE_LABEL[r]} active={range === r} onClick={() => onRangeChange(r)} />
            ))}
          </div>
          <Link to="/reports" className="inline-flex items-center gap-1 px-1 text-xs font-medium text-neutral-400 transition-colors hover:text-neutral-100">
            Ver en Reportes <ArrowRight size={12} aria-hidden />
          </Link>
        </div>

        {error ? (
          <div className="p-5">
            <ErrorState error={error} onRetry={onRetry} compact />
          </div>
        ) : loading ? (
          <div className="p-5">
            <LoadingState variant="block" className="!border-0 !bg-transparent !p-0" />
          </div>
        ) : (
          <div className="relative px-1 pt-2">
            {/* Leyenda fijada dentro del gráfico: "· Ventas  <último día>  <vs. día anterior>" */}
            <div className="pointer-events-none absolute top-3 left-4 z-10 flex flex-wrap items-center gap-x-2 text-sm">
              <span className="text-neutral-200">· Ventas</span>
              <span className="tabular-nums text-emerald-400">{formatMoney(stats.latest)}</span>
              <span className={clsx('tabular-nums', dayUp ? 'text-emerald-400' : 'text-red-400')}>
                {dayUp ? '+' : '−'}
                {formatMoney(Math.abs(stats.dayDiff))} ({stats.dayPct === null ? '—' : pctLabel(stats.dayPct)})
              </span>
            </div>
            <div style={{ height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.chartData} margin={{ top: 32, right: 4, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashboardSalesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_GREEN} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={CHART_GREEN} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 5" stroke="#262626" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#737373', fontSize: 11 }}
                    interval={Math.max(0, Math.ceil(stats.chartData.length / 7) - 1)}
                    minTickGap={20}
                  />
                  <YAxis
                    orientation="right"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#737373', fontSize: 11 }}
                    tickFormatter={(v: number) => compactMoney(v)}
                    width={72}
                    domain={[0, 'auto']}
                  />
                  {stats.latest > 0 && (
                    <ReferenceLine
                      y={stats.latest}
                      stroke={CHART_GREEN}
                      strokeDasharray="3 3"
                      strokeOpacity={0.6}
                      ifOverflow="extendDomain"
                      label={<CurrentValueLabel value={compactMoney(stats.latest)} />}
                    />
                  )}
                  <ChartTooltip
                    cursor={{ stroke: '#404040' }}
                    contentStyle={{ background: '#171717', border: '1px solid #262626', borderRadius: 8, fontSize: 12, color: '#e5e5e5' }}
                    formatter={(value, _name, item) => [`${formatMoney(Number(value))} · ${(item.payload as ChartPoint).orderCount} pedidos`, 'Ventas']}
                    labelFormatter={(_label, payload) => {
                      const day = (payload?.[0]?.payload as ChartPoint | undefined)?.day
                      return day ? formatDateLong(day) : ''
                    }}
                  />
                  <Area type="stepAfter" dataKey="total" stroke={CHART_GREEN} strokeWidth={2} fill="url(#dashboardSalesFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-800/60 px-4 py-2 text-xs text-neutral-500">
          <span>Ventas diarias · sin pedidos cancelados</span>
          <span className="tabular-nums">
            {clock} UTC{utcOffset >= 0 ? '+' : ''}
            {utcOffset}
          </span>
        </div>
      </Card>
    </div>
  )
}

function SalesOverview() {
  const [range, setRange] = useState<SalesRange>('30d')
  const { stats, isLoading, isError, error, refetch } = useSalesOverview(range)

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(260px,1fr)_2fr] lg:gap-8">
      <SalesSummaryPanel range={range} onRangeChange={setRange} stats={stats} loading={isLoading} />
      <SalesChartCard range={range} onRangeChange={setRange} stats={stats} loading={isLoading} error={isError ? error : null} onRetry={() => void refetch()} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fila inferior de paneles
// ---------------------------------------------------------------------------

function CardLink({ to, label }: { to: string; label: string }) {
  return (
    <Tooltip label={label} side="top">
      <Link to={to} aria-label={label} className={iconButtonClass}>
        <ArrowRight size={15} aria-hidden />
      </Link>
    </Tooltip>
  )
}

/** Últimos pedidos — mismo useOrders de la página Pedidos, solo se muestran los 4 más recientes. */
function RecentOrdersCard() {
  const { data: orders, isLoading } = useOrders()
  const recent = orders?.slice(0, 4) ?? []

  return (
    <Card title="Pedidos recientes" icon={ClipboardList} action={<CardLink to="/kitchen" label="Ver todos los pedidos" />}>
      {isLoading ? (
        <LoadingState variant="block" className="!border-0 !bg-transparent !p-0" />
      ) : recent.length === 0 ? (
        <p className="text-sm text-neutral-500">Todavía no hay pedidos.</p>
      ) : (
        <ul className="divide-y divide-neutral-800/60">
          {recent.map((o) => (
            <li key={o.id}>
              <Link to={`/kitchen?pedido=${o.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-neutral-800/50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-100">{o.customerName}</p>
                  <p className="text-xs text-neutral-500">
                    #{o.orderNumber} · {formatDateTime(o.createdAt)}
                  </p>
                </div>
                <OrderStatusBadge status={o.status} size="sm" />
                <span className="shrink-0 text-sm font-semibold tabular-nums text-neutral-50">{formatMoney(o.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** Atrasados fuera de SLA — misma regla (timeTier) que usa Cocina. Solo se monta para roles con acceso a la cola. */
function LateKitchenRow() {
  const now = useNow()
  const { data: kitchenTickets } = useKitchenQueue(true)
  const { data: thresholds = DEFAULT_SLA_THRESHOLDS } = useKitchenSlaSettings()
  const { data: readyOrders } = useReadyOrders(true)
  const { data: dispatchedOrders } = useDispatchedOrders(true)

  const late = useMemo(() => {
    if (!kitchenTickets) return 0
    return kitchenTickets.filter((t) => {
      if (t.orderStatus === 'CANCELADO') return false
      return timeTier(minutesAgoSince(t.createdAt, now), alertMinutesFor(t.orderStatus, thresholds), thresholds.nearThresholdPct) === 'retrasado'
    }).length
  }, [kitchenTickets, now, thresholds])

  return (
    <StatList
      items={[
        { label: 'Atrasados (fuera de SLA)', value: late, tone: late > 0 ? 'warn' : 'good', to: '/kitchen' },
        { label: 'Listos para despachar', value: readyOrders?.length ?? 0, tone: (readyOrders?.length ?? 0) > 0 ? 'good' : undefined, to: '/kitchen' },
        { label: 'En ruta', value: dispatchedOrders?.length ?? 0, to: '/kitchen' },
      ]}
    />
  )
}

function KitchenNowCard({ summary, liveOps }: { summary: DashboardSummary | undefined; liveOps: boolean }) {
  return (
    <Card title="Cocina ahora" icon={ChefHat} description="Pedidos por estado, en este momento" action={<CardLink to="/kitchen" label="Ir a Cocina" />}>
      {liveOps && <LateKitchenRow />}
      <StatList
        items={[
          { label: 'Nuevos', value: summary?.ordersNuevo ?? '—', to: '/kitchen' },
          { label: 'Confirmados', value: summary?.ordersConfirmado ?? '—', to: '/kitchen' },
          { label: 'En preparación', value: summary?.ordersEnPreparacion ?? '—', to: '/kitchen' },
        ]}
      />
    </Card>
  )
}

function CarteraRows() {
  const { data: receivables } = useReceivables(true)
  const cartera = useMemo(() => {
    const rows = receivables ?? []
    const today = todayStr()
    return {
      pending: rows.reduce((sum, r) => sum + r.balance, 0),
      overdueCount: rows.filter((r) => r.dueDate && r.dueDate < today).length,
    }
  }, [receivables])

  return (
    <StatList
      items={[
        { label: 'Por cobrar', value: formatMoney(cartera.pending), to: '/customers' },
        { label: 'Vencidos', value: cartera.overdueCount, tone: cartera.overdueCount > 0 ? 'warn' : 'good', to: '/customers' },
      ]}
    />
  )
}

function CarteraCard({ summary, liveOps }: { summary: DashboardSummary | undefined; liveOps: boolean }) {
  return (
    <Card title="Cartera y compras" icon={Wallet} description="Este mes" action={<CardLink to="/customers" label="Ir a Clientes" />}>
      {liveOps && <CarteraRows />}
      <StatList
        items={[
          { label: 'Compras del mes', value: summary ? formatMoney(summary.purchasesMonth) : '—', to: '/supply/compras' },
          { label: 'Mermas del mes', value: summary ? formatMoney(summary.wasteValueMonth) : '—', to: '/supply/stock' },
        ]}
      />
    </Card>
  )
}

// ---------------------------------------------------------------------------

/**
 * Misma estructura que la referencia: barra superior con la cifra del día y
 * accesos; debajo, panel de métricas (1/3) + gráfico con sus herramientas
 * (2/3); al pie, tres tarjetas de apoyo. Todos los números salen de queries
 * que ya existían (useDashboardSummary, useSalesByDay, useOrders y las de
 * Cocina/Despacho/Cartera) — ningún dato nuevo. Los roles sin acceso a
 * Cocina/Cartera (INVENTORY) no disparan esas consultas ni ven esas filas.
 */
export function DashboardPage() {
  const { profile } = useAuth()
  const { data, isLoading, isError, error, refetch } = useDashboardSummary()
  // Operación en vivo y cartera: quien despacha (Administrador, Gerente, Caja) — permiso de la Cocina activa.
  const { can } = useActiveKitchen()
  const canSeeLiveOps = can('dispatch.assign')
  const firstName = profile?.fullName?.split(' ')[0] ?? 'usuario'

  return (
    <div className="space-y-6">
      <DashboardHero firstName={firstName} salesToday={data?.salesToday ?? null} ordersToday={data?.ordersToday ?? null} loading={isLoading} />

      <SalesOverview />

      {isError && <ErrorState error={error} onRetry={() => void refetch()} compact />}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {canSeeLiveOps && <RecentOrdersCard />}
        <KitchenNowCard summary={data} liveOps={canSeeLiveOps} />
        <CarteraCard summary={data} liveOps={canSeeLiveOps} />
      </div>
    </div>
  )
}
