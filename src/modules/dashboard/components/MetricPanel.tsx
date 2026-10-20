import { chartAxisTick, chartGrid, chartInk, chartTooltip } from '@/shared/ui/chartTheme'
import clsx from 'clsx'
import { BarChart3 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Delta } from '../lib/delta'
import { formatBucket, type Granularity } from '../lib/range'

/**
 * A panel of «Destacado» (ADR 0072): what it measures, its figure for the range, how it moved, and the line
 * of the range by hour or by day. Empty buckets are gaps (null), never invented zeros.
 */
export function MetricPanel({
  title,
  value,
  delta,
  points,
  format,
  granularity,
  emptyText,
  to,
  footnote,
  axisFormat,
}: {
  title: string
  value: string
  delta: Delta | null
  points: { t: string; v: number | null }[]
  format: (n: number) => string
  granularity: Granularity
  /** Shown instead of the chart when the range has nothing to draw. */
  emptyText: string | null
  to?: string
  footnote?: ReactNode
  /** A shorter format for the axis ticks ($220k instead of $220 mil). */
  axisFormat?: (n: number) => string
}) {
  const data = points.map((p) => ({ label: formatBucket(p.t, granularity), v: p.v }))
  // Sparse series (a ticket only where there were orders): each value gets its dot, so a lone day still shows.
  const sparse = points.filter((p) => p.v != null).length <= Math.max(3, points.length / 3)
  const ends = data.length > 1 ? [data[0].label, data[data.length - 1].label] : data.map((d) => d.label)

  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5" aria-label={title}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-neutral-200">{title}</h3>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-neutral-50">{value}</p>
          {delta ? (
            <p className={clsx('mt-0.5 text-xs', delta.tone === 'good' ? 'text-emerald-500' : delta.tone === 'bad' ? 'text-red-400' : 'text-neutral-500')}>{delta.text}</p>
          ) : (
            <p className="mt-0.5 text-xs text-neutral-500">Sin datos del periodo anterior para comparar</p>
          )}
        </div>
        {to && (
          <Link
            to={to}
            aria-label={`Ver ${title.toLowerCase()} en Análisis`}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-neutral-800 text-neutral-500 transition-colors hover:border-neutral-700 hover:text-neutral-100"
          >
            <BarChart3 size={15} aria-hidden />
          </Link>
        )}
      </div>
      {emptyText ? (
        <p className="mt-4 flex h-32 items-center justify-center rounded-xl bg-neutral-950/60 px-4 text-center text-sm text-neutral-500">{emptyText}</p>
      ) : (
        <div className="mt-4 h-32 w-full" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={chartGrid} vertical={false} />
              <XAxis dataKey="label" ticks={ends} interval="preserveStartEnd" tick={chartAxisTick} axisLine={false} tickLine={false} />
              <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => (axisFormat ?? format)(v)} allowDecimals={false} tickCount={3} />
              <Tooltip {...chartTooltip} formatter={(v) => [format(Number(v)), title]} />
              <Area
                type="monotone"
                dataKey="v"
                stroke={chartInk}
                strokeWidth={1.75}
                fill={chartInk}
                fillOpacity={0.07}
                connectNulls={false}
                dot={sparse ? { r: 2.5, fill: chartInk, strokeWidth: 0 } : false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {footnote && <p className="mt-2 text-xs text-neutral-500">{footnote}</p>}
    </section>
  )
}
