import { Card } from '@/shared/ui/Card'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { StatCard } from '@/shared/ui/StatCard'
import { typography } from '@/shared/ui/typography'
import { formatDate } from '@/shared/utils/format'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Activity, BarChart3, Coins, Gauge } from 'lucide-react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { fetchPlatformAiUsage, formatUsd, PLATFORM_AI_KEY, type PlatformAiUsage } from './api'

const integer = (n: number) => new Intl.NumberFormat('es-CO').format(n)

/**
 * AI usage of the whole platform (ADR 0014, 10). Only real data: runs and
 * errors always; tokens since metering started; cost only for runs with
 * tokens and a model with prices.
 */
export function UsageTab() {
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: [...PLATFORM_AI_KEY, 'usage'], queryFn: () => fetchPlatformAiUsage(30), refetchInterval: 60_000 })
  if (isLoading) return <LoadingState variant="cards" rows={1} cols={4} />
  if (isError || !data) return <ErrorState error={error} onRetry={() => void refetch()} />
  const t = data.totals

  const orgColumns: DataTableColumn<PlatformAiUsage['byOrganization'][number]>[] = [
    { key: 'name', header: 'Organización', cell: (o) => <span className="font-medium text-neutral-100">{o.name}</span> },
    { key: 'runs', header: 'Análisis', align: 'right', cell: (o) => <span className="tabular-nums">{integer(o.runs)}</span> },
    { key: 'errors', header: 'Con error', align: 'right', cell: (o) => <span className={clsx('tabular-nums', o.errors > 0 && 'text-red-300')}>{o.errors}</span> },
    { key: 'tokens', header: 'Tokens', align: 'right', hideBelow: 'md', cell: (o) => <span className="tabular-nums text-neutral-400">{integer(o.tokens)}</span> },
    { key: 'cost', header: 'Costo estimado', align: 'right', cell: (o) => <span className="tabular-nums">{formatUsd(o.estimatedCost)}</span> },
  ]
  const accountColumns: DataTableColumn<PlatformAiUsage['byAccount'][number]>[] = [
    {
      key: 'name',
      header: 'Cuenta',
      cell: (a) => (
        <span className="min-w-0">
          <span className="block font-medium text-neutral-100">{a.name}</span>
          <span className="block text-xs text-neutral-500">{a.organization}</span>
        </span>
      ),
    },
    { key: 'runs', header: 'Análisis', align: 'right', cell: (a) => <span className="tabular-nums">{integer(a.runs)}</span> },
    { key: 'errors', header: 'Con error', align: 'right', cell: (a) => <span className={clsx('tabular-nums', a.errors > 0 && 'text-red-300')}>{a.errors}</span> },
    { key: 'cost', header: 'Costo estimado', align: 'right', cell: (a) => <span className="tabular-nums">{formatUsd(a.estimatedCost)}</span> },
  ]

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Últimas 24 horas" value={integer(t.runs24h)} hint="Análisis de IA (llamadas al modelo)" icon={Activity} tone="brand" />
        <StatCard label="Últimos 30 días" value={integer(t.runs)} hint={`${t.errors} con error`} icon={BarChart3} tone={t.errors > 0 ? 'warn' : 'neutral'} />
        <StatCard
          label="Costo estimado (30 días)"
          value={formatUsd(t.estimatedCost)}
          hint={t.estimatedCost === null ? 'Carga los precios de los modelos en Proveedores' : `${t.pricedRuns} de ${t.runs} análisis con precio`}
          icon={Coins}
        />
        <StatCard label="Latencia del modelo" value={t.avgLatencyMs === null ? '—' : `${integer(t.avgLatencyMs)} ms`} hint="Promedio de los análisis medidos" icon={Gauge} />
      </div>
      <p className={typography.caption}>
        Tokens: {integer(t.inputTokens)} de entrada y {integer(t.outputTokens)} de salida en {t.meteredRuns} análisis medidos
        {data.meteringSince ? ` (se miden desde ${formatDate(data.meteringSince)}; los anteriores cuentan como análisis, sin tokens).` : '. Todavía no hay análisis medidos: se registran desde esta versión.'}
      </p>

      <Card title="Análisis por día" description="Últimos 30 días (UTC)" icon={BarChart3}>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.byDay.map((d) => ({ ...d, label: d.date.slice(5) }))}>
              <XAxis dataKey="label" tick={{ fill: '#737373', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                contentStyle={{ background: '#171717', border: '1px solid #262626', borderRadius: 12, fontSize: 12 }}
                formatter={(value, name) => [value, name === 'runs' ? 'Análisis' : 'Con error']}
              />
              <Bar dataKey="runs" fill="#f97316" radius={[6, 6, 0, 0]} />
              <Bar dataKey="errors" fill="#f87171" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <section className="space-y-2">
        <h2 className={typography.h3}>Por función</h2>
        <ul className="divide-y divide-neutral-800/60 rounded-2xl border border-neutral-800/60 bg-neutral-900/40 px-4">
          {data.byFeature.length === 0 && <li className="py-3 text-sm text-neutral-500">Sin análisis en el período.</li>}
          {data.byFeature.map((f) => (
            <li key={f.key} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
              <span className="text-neutral-200">{f.label ?? f.key}</span>
              <span className="tabular-nums text-neutral-400">
                {integer(f.runs)} análisis{f.errors > 0 && <span className="text-red-300"> · {f.errors} con error</span>} · {formatUsd(f.estimatedCost)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 2xl:grid-cols-2">
        <section className="min-w-0 space-y-2">
          <h2 className={typography.h3}>Por organización</h2>
          <DataTable columns={orgColumns} rows={data.byOrganization} getRowId={(o) => o.id} emptyState={<p className="p-4 text-sm text-neutral-500">Sin datos.</p>} />
        </section>
        <section className="min-w-0 space-y-2">
          <h2 className={typography.h3}>Cuentas con más uso</h2>
          <DataTable columns={accountColumns} rows={data.byAccount} getRowId={(a) => a.id} emptyState={<p className="p-4 text-sm text-neutral-500">Sin datos.</p>} />
        </section>
      </div>

      <p className={typography.caption}>
        Voz de cocina: usa la voz de cada equipo, sin llamadas ni costo, así que no hay uso que medir en el servidor. Si en el futuro se usa una voz en la nube, aquí se sumarán caracteres y segundos por cuenta.
      </p>
    </div>
  )
}
