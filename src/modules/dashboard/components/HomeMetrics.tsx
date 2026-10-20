import { useAuth } from '@/shared/hooks/useAuth'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Popover } from '@/shared/ui/Popover'
import { ErrorState } from '@/shared/ui/ErrorState'
import { Switch } from '@/shared/ui/Switch'
import { formatMoney, formatMoneyCompact } from '@/shared/utils/format'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, Calendar, ChevronDown, ChevronLeft, ChevronRight, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchDashboardSeries, fetchKitchenTimezone, type DashboardSeries, type SeriesPoint } from '../api/series'
import { movePanel, PANEL_LABEL, resetPanelPrefs, savePanelPrefs, togglePanel, usePanelPrefs, type PanelKey } from '../lib/panels'
import {
  allowedGranularities,
  effectiveGranularity,
  formatRange,
  PRESET_LABEL,
  resolveRange,
  todayIn,
  utcOffsetLabel,
  type Granularity,
  type HomeRange,
  type RangePreset,
} from '../lib/range'
import { deltaOf } from '../lib/delta'
import { MetricPanel } from './MetricPanel'

const CHANNEL_LABEL: Record<string, string> = { MANUAL: 'En el local', WEB: 'Menú web', WHATSAPP: 'WhatsApp', PHONE: 'Teléfono' }
const percent = (n: number) => `${Math.round(n * 1000) / 10}%`.replace('.', ',')
const minutes = (n: number) => `${Math.round(n)} min`
const count = (n: number) => Math.round(n).toLocaleString('es-CO')
/** Axis ticks: $220k, $1,2M (the full figure is in the tooltip). */
const axisMoney = (n: number) => (Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })}M` : Math.abs(n) >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`)

const segmented = 'flex h-9 items-center rounded-lg border border-neutral-800 bg-neutral-900 text-sm'
const segmentButton = 'flex h-full items-center px-2.5 text-neutral-500 transition-colors hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-40'

function RangeBar({
  range,
  setRange,
  granularity,
  setGranularity,
  timezone,
  from,
  to,
}: {
  range: HomeRange
  setRange: (r: HomeRange) => void
  granularity: Granularity
  setGranularity: (g: Granularity) => void
  timezone: string
  from: string
  to: string
}) {
  const allowed = allowedGranularities(from, to)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className={segmented}>
        <button type="button" className={clsx(segmentButton, 'rounded-l-lg')} onClick={() => setRange({ ...range, offset: range.offset - 1 })} aria-label="Periodo anterior">
          <ChevronLeft size={15} aria-hidden />
        </button>
        <Popover
          label="Elegir el periodo"
          placement="bottom-start"
          className="md:w-56"
          trigger={(props) => (
            <button type="button" {...props} className="flex h-full items-center gap-2 border-x border-neutral-800 px-3 text-neutral-100">
              <Calendar size={14} className="text-neutral-500" aria-hidden />
              <span className="font-medium">{range.offset === 0 ? PRESET_LABEL[range.preset] : formatRange(from, to)}</span>
              <span className="text-neutral-500 max-sm:hidden">· {utcOffsetLabel(timezone)}</span>
              <ChevronDown size={14} className="text-neutral-500" aria-hidden />
            </button>
          )}
        >
          {(close) =>
            (Object.keys(PRESET_LABEL) as RangePreset[]).map((p) => (
              <button
                key={p}
                type="button"
                role="menuitemradio"
                aria-checked={range.preset === p && range.offset === 0}
                onClick={() => {
                  setRange({ preset: p, offset: 0 })
                  close()
                }}
                className={clsx(
                  'flex w-full items-center rounded-xl px-3 py-2 text-left text-sm',
                  range.preset === p && range.offset === 0 ? 'bg-neutral-800 font-medium text-neutral-50' : 'text-neutral-300 hover:bg-neutral-800',
                )}
              >
                {PRESET_LABEL[p]}
              </button>
            ))
          }
        </Popover>
        <button
          type="button"
          className={clsx(segmentButton, 'rounded-r-lg')}
          onClick={() => setRange({ ...range, offset: range.offset + 1 })}
          disabled={range.offset >= 0}
          aria-label="Periodo siguiente"
        >
          <ChevronRight size={15} aria-hidden />
        </button>
      </div>
      <div className={segmented} role="group" aria-label="Granularidad">
        <span className="px-2.5 text-neutral-500 max-sm:hidden">Granularidad</span>
        {(['hour', 'day'] as Granularity[]).map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={granularity === g}
            disabled={!allowed.includes(g)}
            title={!allowed.includes(g) ? 'Cada hora solo hasta 7 días' : undefined}
            onClick={() => setGranularity(g)}
            className={clsx(
              'h-full px-2.5 transition-colors last:rounded-r-lg disabled:cursor-not-allowed disabled:opacity-40',
              granularity === g ? 'bg-neutral-800 font-medium text-neutral-50' : 'text-neutral-500 hover:text-neutral-100',
            )}
          >
            {g === 'hour' ? 'Cada hora' : 'Cada día'}
          </button>
        ))}
      </div>
    </div>
  )
}

function Customize({ scope, available }: { scope: string; available: PanelKey[] }) {
  const prefs = usePanelPrefs(scope)
  const order = prefs.order.filter((k) => available.includes(k))
  return (
    <Popover
      label="Personalizar paneles"
      placement="bottom-end"
      className="md:w-72"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label="Personalizar paneles"
          className="flex size-9 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-500 transition-colors hover:border-neutral-700 hover:text-neutral-100"
        >
          <Settings2 size={16} aria-hidden />
        </button>
      )}
    >
      {() => (
        <div>
          <p className="px-2 pt-1 pb-2 text-sm font-medium text-neutral-100">Paneles de Destacado</p>
          <ul className="space-y-0.5">
            {order.map((key, i) => (
              <li key={key} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-neutral-800/60">
                <Switch checked={!prefs.hidden.includes(key)} onChange={() => savePanelPrefs(scope, togglePanel(prefs, key))} label={`Mostrar ${PANEL_LABEL[key]}`} />
                <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">{PANEL_LABEL[key]}</span>
                <button type="button" aria-label={`Subir ${PANEL_LABEL[key]}`} disabled={i === 0} onClick={() => savePanelPrefs(scope, movePanel(prefs, key, -1))} className="rounded p-1 text-neutral-500 hover:text-neutral-100 disabled:opacity-30">
                  <ArrowUp size={14} aria-hidden />
                </button>
                <button type="button" aria-label={`Bajar ${PANEL_LABEL[key]}`} disabled={i === order.length - 1} onClick={() => savePanelPrefs(scope, movePanel(prefs, key, 1))} className="rounded p-1 text-neutral-500 hover:text-neutral-100 disabled:opacity-30">
                  <ArrowDown size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => resetPanelPrefs(scope)} className="mt-2 w-full rounded-xl px-2 py-1.5 text-left text-sm text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-100">
            Volver a los paneles iniciales
          </button>
        </div>
      )}
    </Popover>
  )
}

function ListPanel({ title, rows, empty }: { title: string; rows: { label: string; value: string; share: number }[]; empty: string }) {
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5" aria-label={title}>
      <h3 className="text-sm font-medium text-neutral-200">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-4 flex flex-1 items-center justify-center rounded-xl bg-neutral-950/60 px-4 py-10 text-center text-sm text-neutral-500">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-neutral-200">{r.label}</span>
                <span className="shrink-0 tabular-nums text-neutral-400">{r.value}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-800">
                <div className="h-full rounded-full bg-neutral-400" style={{ width: `${Math.max(r.share * 100, 2)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function panelFor(key: PanelKey, data: DashboardSeries, insightsTo: string | undefined) {
  const g = data.granularity
  const noOrders = data.totals.orders === 0
  const series = (pick: (p: SeriesPoint) => number | null | undefined) => data.points.map((p) => ({ t: p.t, v: pick(p) ?? null }))
  const quiet = noOrders ? 'Aún no hay pedidos en este rango.' : null
  switch (key) {
    case 'orders':
      return (
        <MetricPanel title="Pedidos" value={count(data.totals.orders)} delta={deltaOf(data.totals.orders, data.previous.orders, true)} points={series((p) => p.orders)} format={count} granularity={g} emptyText={quiet} to={insightsTo} />
      )
    case 'revenue':
      return (
        <MetricPanel
          title="Ventas"
          value={formatMoney(data.totals.revenue)}
          delta={deltaOf(data.totals.revenue, data.previous.revenue, true)}
          points={series((p) => p.revenue)}
          format={formatMoneyCompact}
          axisFormat={axisMoney}
          granularity={g}
          emptyText={quiet}
          to={insightsTo}
        />
      )
    case 'averageTicket':
      return (
        <MetricPanel
          title="Ticket promedio"
          value={data.totals.averageTicket == null ? '—' : formatMoney(data.totals.averageTicket)}
          delta={deltaOf(data.totals.averageTicket, data.previous.averageTicket, true)}
          points={series((p) => p.averageTicket)}
          format={formatMoneyCompact}
          axisFormat={axisMoney}
          granularity={g}
          emptyText={quiet}
        />
      )
    case 'kitchenMinutes':
      return (
        <MetricPanel
          title="Tiempo en cocina"
          value={data.totals.kitchenMinutes == null ? '—' : minutes(data.totals.kitchenMinutes)}
          delta={deltaOf(data.totals.kitchenMinutes, data.previous.kitchenMinutes, false)}
          points={series((p) => p.kitchenMinutes)}
          format={minutes}
          granularity={g}
          emptyText={data.totals.kitchenMinutes == null ? 'Ningún plato pasó de Preparando a Listo en este rango.' : null}
          footnote="De Preparando a Listo, en promedio por pedido."
        />
      )
    case 'cancelledRate':
      return (
        <MetricPanel
          title="Cancelados"
          value={data.totals.cancelledRate == null ? '—' : percent(data.totals.cancelledRate)}
          delta={deltaOf(data.totals.cancelledRate, data.previous.cancelledRate, false, 'points')}
          points={series((p) => p.cancelledRate)}
          format={percent}
          granularity={g}
          emptyText={data.totals.cancelledRate == null ? 'Aún no hay pedidos confirmados o cancelados en este rango.' : null}
        />
      )
    case 'foodCostRate':
      return data.profitability ? (
        <MetricPanel
          title="Costo de comida"
          value={data.totals.foodCostRate == null ? '—' : percent(data.totals.foodCostRate)}
          delta={null}
          points={series((p) => p.foodCostRate)}
          format={percent}
          granularity={g}
          emptyText={data.totals.foodCostRate == null ? 'No hay ventas con costo de receta en este rango.' : null}
          footnote="Costo de las recetas sobre las ventas de los platos que tienen costo."
        />
      ) : null
    case 'topProducts': {
      const max = Math.max(...data.topProducts.map((p) => p.units), 1)
      return <ListPanel title="Platos más vendidos" empty="Aún no hay platos vendidos en este rango." rows={data.topProducts.map((p) => ({ label: p.name, value: `${count(p.units)} · ${formatMoneyCompact(p.revenue)}`, share: p.units / max }))} />
    }
    case 'channels': {
      const total = data.channels.reduce((s, c) => s + c.orders, 0) || 1
      return (
        <ListPanel
          title="Canales"
          empty="Aún no hay pedidos en este rango."
          rows={data.channels.map((c) => ({ label: CHANNEL_LABEL[c.channel] ?? c.channel, value: `${count(c.orders)} · ${Math.round((c.orders / total) * 100)}%`, share: c.orders / total }))}
        />
      )
    }
  }
}

/**
 * The metrics of «Destacado» (ADR 0072): a range moved with ← →, by hour or by day, in the account's time zone,
 * and the panels the person chose, in their order. Each figure compares with the same stretch right before.
 */
export function HomeMetrics() {
  const { kitchen, can, path } = useActiveKitchen()
  const { profile } = useAuth()
  const [range, setRange] = useState<HomeRange>({ preset: '7d', offset: 0 })
  const [wanted, setWanted] = useState<Granularity>('day')
  const tz = useQuery({ queryKey: ['kitchen-timezone', kitchen.id], queryFn: () => fetchKitchenTimezone(kitchen.id), staleTime: Infinity })
  const timezone = tz.data ?? 'America/Bogota'
  const { from, to } = resolveRange(range, todayIn(timezone))
  const granularity = effectiveGranularity(wanted, from, to)
  const series = useQuery({
    queryKey: ['dashboard-series', kitchen.id, from, to, granularity],
    queryFn: () => fetchDashboardSeries(from, to, granularity),
    enabled: tz.isSuccess || tz.isError,
    placeholderData: (previous) => previous,
  })
  const scope = `${profile?.id ?? 'anon'}:${kitchen.id}`
  const prefs = usePanelPrefs(scope)
  const available = prefs.order.filter((k) => k !== 'foodCostRate' || series.data?.profitability !== false)
  const shown = available.filter((k) => !prefs.hidden.includes(k))
  const insightsTo = can('reports.view') ? path('/insights') : undefined

  return (
    <section aria-labelledby="metricas" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="metricas" className="sr-only">
            Métricas
          </h2>
          <RangeBar range={range} setRange={setRange} granularity={granularity} setGranularity={setWanted} timezone={timezone} from={from} to={to} />
        </div>
        <div className="flex items-center gap-2">
          <Customize scope={scope} available={available} />
          {insightsTo && (
            <Link to={insightsTo} className="inline-flex h-9 items-center rounded-lg border border-neutral-800 bg-neutral-900 px-3 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-700 hover:text-neutral-50">
              Ver análisis
            </Link>
          )}
        </div>
      </div>
      {series.isError ? (
        <ErrorState error={series.error} onRetry={() => void series.refetch()} compact />
      ) : !series.data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Cargando métricas">
          {shown.slice(0, 6).map((k) => (
            <div key={k} className="h-64 animate-pulse rounded-2xl border border-neutral-800 bg-neutral-900" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-800 px-4 py-10 text-center text-sm text-neutral-500">Ocultaste todos los paneles. Actívalos con el engranaje.</p>
      ) : (
        <div className={clsx('grid gap-4 md:grid-cols-2 xl:grid-cols-3 transition-opacity', series.isFetching && 'opacity-70')}>
          {shown.map((k) => (
            <div key={k} className="min-w-0">
              {panelFor(k, series.data!, insightsTo)}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
