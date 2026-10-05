import { formatPercent } from '../lib/format'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface TrendSeries {
  key: string
  label: string
  color: string
  kind: 'bar' | 'line'
  /** Right axis: a percentage (the margin) or a count (orders). Money goes on the left. */
  axis?: 'money' | 'percent' | 'count'
}

const compact = (n: number) => (Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : Math.abs(n) >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`)

/**
 * One trend chart for the whole module (ADR 0027): money as bars, the margin
 * as a line on its own axis. Each chart answers a question; no decoration.
 */
export function TrendChart({
  data,
  series,
  format,
  height = 260,
}: {
  data: Record<string, number | string | null>[]
  series: TrendSeries[]
  format: (value: number) => string
  height?: number
}) {
  const right = series.find((s) => s.axis === 'percent' || s.axis === 'count')?.axis ?? null
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: right ? 4 : 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#262626" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#737373', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis yAxisId="money" tick={{ fill: '#737373', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={compact} width={52} />
          {right === 'percent' && (
            <YAxis yAxisId="percent" orientation="right" tick={{ fill: '#737373', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} width={40} domain={[0, 1]} />
          )}
          {right === 'count' && <YAxis yAxisId="count" orientation="right" tick={{ fill: '#737373', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />}
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            contentStyle={{ background: '#171717', border: '1px solid #262626', borderRadius: 12, fontSize: 12 }}
            labelStyle={{ color: '#d4d4d4' }}
            formatter={(value, name) => {
              const s = series.find((x) => x.key === name)
              const n = Number(value)
              return [s?.axis === 'percent' ? formatPercent(n) : s?.axis === 'count' ? String(n) : format(n), s?.label ?? String(name)]
            }}
          />
          <Legend formatter={(value) => <span className="text-xs text-neutral-400">{series.find((s) => s.key === value)?.label ?? value}</span>} iconSize={8} />
          {series.map((s) =>
            s.kind === 'bar' ? (
              <Bar key={s.key} yAxisId="money" dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={28} />
            ) : (
              <Line key={s.key} yAxisId={s.axis ?? 'money'} dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} connectNulls />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
