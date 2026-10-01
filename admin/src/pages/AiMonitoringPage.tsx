import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Building2, Cpu, Mic, Sparkles } from 'lucide-react'
import { DailyBars, ShareBars } from '../components/charts'
import { Metric, NotAvailable, PageTitle, Panel, RangePicker, StatusPill } from '../components/ui'
import { fetchAiMonitoring, type AiFeatureStats } from '../lib/api'
import { featureLabel } from '../lib/features'
import { formatNumber, timeAgo } from '../lib/format'
import { useRange } from '../lib/useRange'

const VOICE_REASON = 'La voz funciona en cada dispositivo y no se registra su uso en la plataforma.'

/**
 * AI across the platform (ADR 0019), only from what is recorded
 * (dk_ai_insights). Voice runs on each device and is not recorded, so its
 * usage reads "No disponible" instead of a made-up number.
 */
export function AiMonitoringPage() {
  const range = useRange()
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['ga', 'ai', range.key], queryFn: () => fetchAiMonitoring(range.from, range.to) })

  const tracked = data?.features.filter((f) => f.tracked) ?? []
  const runs = tracked.reduce((s, f) => s + f.runs, 0)
  const errors = tracked.reduce((s, f) => s + f.errors, 0)
  const tokens = tracked.reduce((s, f) => s + f.tokens, 0)

  return (
    <>
      <PageTitle title="AI Monitoring" icon={Sparkles} description="Uso de la IA en todas las organizaciones, con datos registrados." actions={<RangePicker value={range.key} onChange={range.setKey} />} />
      {isLoading ? (
        <LoadingState variant="cards" rows={1} cols={4} />
      ) : isError || !data ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Análisis" value={formatNumber(runs)} icon={Sparkles} tone="brand" />
            <Metric label="Errores" value={formatNumber(errors)} hint={runs ? `${Math.round((errors / runs) * 100)} % de los análisis` : undefined} icon={AlertTriangle} tone={errors ? 'warn' : 'neutral'} />
            <Metric label="Organizaciones usando IA" value={formatNumber(data.byOrganization.length)} icon={Building2} />
            <Metric label="Tokens" value={formatNumber(tokens)} hint="Entrada + salida del modelo" icon={Cpu} />
          </div>

          <Panel title="Funciones" subtitle="Ofrecida = disponible para la organización; activa = encendida en la cuenta.">
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-neutral-500">
                    <th className="px-4 py-2 font-medium sm:pl-0">Función</th>
                    <th className="px-2 py-2 text-right font-medium">Organizaciones</th>
                    <th className="px-2 py-2 text-right font-medium">Cuentas activas</th>
                    <th className="px-2 py-2 text-right font-medium">Análisis</th>
                    <th className="px-2 py-2 text-right font-medium">Errores</th>
                    <th className="px-2 py-2 text-right font-medium">Usuarios</th>
                    <th className="px-2 py-2 text-right font-medium">Latencia</th>
                    <th className="px-4 py-2 text-right font-medium sm:pr-0">Último uso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-console-800">
                  {data.features.map((f) => (
                    <FeatureRow key={f.key} f={f} />
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Análisis por día">
              <DailyBars
                data={data.daily}
                series={[
                  { key: 'runs', label: 'Análisis', color: '#f97316' },
                  { key: 'errors', label: 'Errores', color: '#ef4444' },
                ]}
              />
            </Panel>
            <Panel title="Por organización" subtitle="Análisis en el rango">
              <ShareBars
                valueLabel="análisis"
                rows={data.byOrganization.slice(0, 10).map((o) => ({ label: o.name, value: o.runs, hint: `${o.users} ${o.users === 1 ? 'usuario' : 'usuarios'}${o.errors ? ` · ${o.errors} errores` : ''}` }))}
              />
            </Panel>
          </div>

          <Panel title="Últimos análisis" subtitle="Los 25 más recientes de toda la plataforma">
            {data.recent.length === 0 ? (
              <p className="py-6 text-center text-sm text-neutral-500">Todavía no hay análisis.</p>
            ) : (
              <ul className="divide-y divide-console-800">
                {data.recent.map((r, i) => (
                  <li key={`${r.at}-${i}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-neutral-200">{featureLabel(r.feature)}</span>
                      <span className="block truncate text-[11px] text-neutral-500">{[r.organization, r.account, r.user].filter(Boolean).join(' · ')}</span>
                    </span>
                    {r.latencyMs != null && <span className="text-xs tabular-nums text-neutral-500">{formatNumber(r.latencyMs)} ms</span>}
                    <StatusPill tone={r.status === 'error' ? 'bad' : r.status === 'empty' ? 'neutral' : 'good'}>{r.status === 'error' ? 'Error' : r.status === 'empty' ? 'Sin hallazgos' : 'OK'}</StatusPill>
                    <span className="w-24 text-right text-[11px] text-neutral-500">{timeAgo(r.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <p className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            <Mic size={12} aria-hidden /> {VOICE_REASON}
          </p>
        </div>
      )}
    </>
  )
}

function FeatureRow({ f }: { f: AiFeatureStats }) {
  const usage = (v: React.ReactNode) => (f.tracked ? v : <NotAvailable reason={VOICE_REASON} />)
  return (
    <tr>
      <td className="px-4 py-2.5 sm:pl-0">
        <span className="flex items-center gap-2 text-neutral-200">
          {f.label || featureLabel(f.key)}
          {!f.platformActive && <StatusPill tone="neutral">Apagada</StatusPill>}
        </span>
        <span className="text-[11px] text-neutral-500">{f.category === 'voice' ? 'Voz' : 'IA'}</span>
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums text-neutral-300">{formatNumber(f.organizationsOffering)}</td>
      <td className="px-2 py-2.5 text-right tabular-nums text-neutral-300">{formatNumber(f.accountsEnabled)}</td>
      <td className="px-2 py-2.5 text-right tabular-nums text-neutral-300">{usage(formatNumber(f.runs))}</td>
      <td className="px-2 py-2.5 text-right tabular-nums">{usage(<span className={f.errors ? 'text-red-300' : 'text-neutral-300'}>{formatNumber(f.errors)}</span>)}</td>
      <td className="px-2 py-2.5 text-right tabular-nums text-neutral-300">{usage(formatNumber(f.users))}</td>
      <td className="px-2 py-2.5 text-right tabular-nums text-neutral-300">{usage(f.avgLatencyMs != null ? `${formatNumber(f.avgLatencyMs)} ms` : '—')}</td>
      <td className="px-4 py-2.5 text-right text-xs text-neutral-400 sm:pr-0">{usage(timeAgo(f.lastRunAt))}</td>
    </tr>
  )
}
