import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface Series {
  key: string
  label: string
  color: string
}

const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })

/** Daily bars for one or more series; quiet axes so the data reads first. */
export function DailyBars({ data, series, height = 220 }: { data: readonly object[]; series: Series[]; height?: number }) {
  const rows = data as Record<string, unknown>[]
  const total = rows.reduce((sum, d) => sum + series.reduce((s, x) => s + Number(d[x.key] ?? 0), 0), 0)
  if (total === 0) return <p className="flex items-center justify-center text-sm text-neutral-500" style={{ height }}>Sin datos en este rango.</p>
  return (
    <div style={{ height }} role="img" aria-label={`Gráfica por día: ${series.map((s) => s.label).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#1d222a" />
          <XAxis dataKey="day" tickFormatter={dayLabel} tick={{ fill: '#737373', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tick={{ fill: '#737373', fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            contentStyle={{ background: '#111419', border: '1px solid #2a2f37', borderRadius: 10, fontSize: 12 }}
            labelFormatter={(d) => dayLabel(String(d))}
          />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: '#a3a3a3' }} iconType="circle" iconSize={8} />}
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[3, 3, 0, 0]} maxBarSize={18} stackId={series.length > 1 ? 'a' : undefined} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Horizontal share bars (e.g. AI runs by organization). */
export function ShareBars({ rows, valueLabel }: { rows: { label: string; value: number; hint?: string }[]; valueLabel: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-neutral-500">Sin datos en este rango.</p>
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-neutral-200">{r.label}</span>
            <span className="shrink-0 tabular-nums text-neutral-400">
              {r.value.toLocaleString('es-CO')} {valueLabel}
              {r.hint && <span className="text-neutral-600"> · {r.hint}</span>}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-console-800" aria-hidden>
            <div className="h-full rounded-full bg-brasa-500" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
