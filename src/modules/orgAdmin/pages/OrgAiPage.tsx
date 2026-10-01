import { FeaturesPanel } from '@/modules/organization/components/FeaturesPanel'
import { AccountIcon } from '@/shared/avatars/Avatar'
import { useOrgAdmin } from '@/shared/org/orgContext'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { PageHeader } from '@/shared/ui/PageHeader'
import { StatCard } from '@/shared/ui/StatCard'
import { Tabs, type TabItem } from '@/shared/ui/Tabs'
import { typography } from '@/shared/ui/typography'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Activity, AlertTriangle, BarChart3, Gauge, Mic, Sparkles } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { fetchOrgAiUsage, type OrgAiUsage } from '../api'
import { OrgAiStatusPanel } from '../components/OrgAiStatusPanel'
import { OrgVoicePanel } from '../components/OrgVoicePanel'

type Tab = 'features' | 'voice' | 'usage' | 'status'

function UsagePanel() {
  const { organization } = useOrgAdmin()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['org', organization.id, 'ai-usage'],
    queryFn: () => fetchOrgAiUsage(organization.id),
    refetchInterval: 60_000,
  })
  if (isLoading) return <LoadingState variant="cards" rows={1} cols={3} />
  if (isError || !data) return <ErrorState error={error} onRetry={() => void refetch()} />

  const columns: DataTableColumn<OrgAiUsage['byAccount'][number]>[] = [
    {
      key: 'name',
      header: 'Cuenta',
      cell: (a) => (
        <span className="flex min-w-0 items-center gap-2">
          <AccountIcon iconKey={a.iconKey} seed={a.id} size="xs" /> <span className="truncate font-medium text-neutral-100">{a.name}</span>
        </span>
      ),
    },
    { key: 'runs', header: '30 días', align: 'right', cell: (a) => <span className="tabular-nums">{a.runs}</span> },
    { key: 'errors', header: 'Con error', align: 'right', cell: (a) => <span className={clsx('tabular-nums', a.errors > 0 && 'text-red-300')}>{a.errors}</span> },
    {
      key: 'quota',
      header: 'Cuota 24 h',
      align: 'right',
      cell: (a) => {
        const pct = Math.min(100, Math.round((a.runs24h / Math.max(data.dailyLimit, 1)) * 100))
        return (
          <span className="inline-flex min-w-28 flex-col items-end gap-1">
            <span className="text-xs tabular-nums text-neutral-300">
              {a.runs24h} de {data.dailyLimit}
            </span>
            <span className="h-1 w-24 overflow-hidden rounded-full bg-neutral-800" aria-hidden>
              <span className={clsx('block h-full rounded-full', pct >= 80 ? 'bg-amber-400' : 'bg-brasa-500')} style={{ width: `${pct}%` }} />
            </span>
          </span>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Análisis de IA (30 días)" value={data.totals.runs} icon={BarChart3} tone="brand" />
        <StatCard label="Últimas 24 horas" value={data.totals.runs24h} hint={`Tope por cuenta: ${data.dailyLimit} al día`} icon={Activity} />
        <StatCard label="Con error" value={data.totals.errors} icon={AlertTriangle} tone={data.totals.errors > 0 ? 'warn' : 'neutral'} />
      </div>
      <section className="space-y-3">
        <h2 className={typography.h3}>Por cuenta</h2>
        <DataTable columns={columns} rows={data.byAccount} getRowId={(a) => a.id} emptyState={<p className="p-4 text-sm text-neutral-500">Todavía no hay análisis de IA.</p>} />
      </section>
      {data.byFeature.length > 0 && (
        <section className="space-y-2">
          <h2 className={typography.h3}>Por función</h2>
          <ul className="divide-y divide-neutral-800/60 rounded-2xl border border-neutral-800/60 bg-neutral-900/40 px-4">
            {data.byFeature.map((f) => (
              <li key={f.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="text-neutral-200">{f.label ?? f.key}</span>
                <span className="tabular-nums text-neutral-400">
                  {f.runs} {f.errors > 0 && <span className="text-red-300">· {f.errors} con error</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className={typography.caption}>La voz de cocina usa la voz de cada equipo: no genera llamadas ni costo, por eso no aparece aquí. Los costos los ve la plataforma.</p>
    </div>
  )
}

/**
 * The one place to configure AI and voice (ADR 0014, ADR 0018): which
 * features the organization offers, where they are active and how they behave
 * (settings, with exceptions per account), the kitchen voice, usage and the
 * state of AI. Accounts no longer configure AI; the platform keeps models,
 * costs and plan limits.
 */
export function OrgAiPage() {
  const { organization } = useOrgAdmin()
  const [params, setParams] = useSearchParams()
  const tabs: TabItem<Tab>[] = [
    { value: 'features', label: 'Funciones', icon: Sparkles },
    { value: 'voice', label: 'Voz de cocina', icon: Mic },
    { value: 'usage', label: 'Uso', icon: BarChart3 },
    { value: 'status', label: 'Estado', icon: Gauge },
  ]
  const requested = params.get('tab') as Tab | null
  const tab: Tab = tabs.some((t) => t.value === requested) ? (requested as Tab) : 'features'

  return (
    <div className="space-y-6">
      <PageHeader title="IA y voz" icon={Sparkles} description="Toda la configuración de IA y voz de la organización: funciones, ajustes, voz de cocina y uso." />
      <Tabs value={tab} onChange={(t) => setParams(t === 'features' ? {} : { tab: t }, { replace: true })} items={tabs} />
      {tab === 'features' ? (
        <FeaturesPanel organizationId={organization.id} />
      ) : tab === 'voice' ? (
        <OrgVoicePanel />
      ) : tab === 'usage' ? (
        <UsagePanel />
      ) : (
        <OrgAiStatusPanel />
      )}
    </div>
  )
}
