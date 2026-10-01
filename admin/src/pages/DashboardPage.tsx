import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Building2, CheckCircle2, LayoutDashboard, Sparkles, UserPlus, Users, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DailyBars } from '../components/charts'
import { ActivityFeed, Metric, PageTitle, Panel, RangePicker } from '../components/ui'
import { fetchOverview } from '../lib/api'
import { formatNumber } from '../lib/format'
import { useRange } from '../lib/useRange'

/** The state of Quanela at a glance (ADR 0019): every number comes from the database. */
export function DashboardPage() {
  const range = useRange()
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['ga', 'overview', range.key], queryFn: () => fetchOverview(range.from, range.to) })

  return (
    <>
      <PageTitle title="Dashboard" icon={LayoutDashboard} description="El estado de toda la plataforma." actions={<RangePicker value={range.key} onChange={range.setKey} />} />
      {isLoading ? (
        <LoadingState variant="cards" rows={2} cols={4} />
      ) : isError || !data ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Organizaciones" value={formatNumber(data.organizations.total)} hint={`${data.organizations.active} activas · ${data.organizations.inactive} inactivas`} icon={Building2} tone="brand" />
            <Metric label="Organizaciones nuevas" value={formatNumber(data.organizations.new)} hint="En el rango elegido" icon={Building2} />
            <Metric label="Usuarios" value={formatNumber(data.users.total)} hint={`${data.users.active30d} activos en 30 días · ${data.users.pending} por activar`} icon={Users} tone="brand" />
            <Metric label="Usuarios nuevos" value={formatNumber(data.users.new)} hint="En el rango elegido" icon={UserPlus} />
            <Metric label="Organizaciones con IA" value={formatNumber(data.ai.organizationsWithAi)} hint={`${data.ai.organizationsUsingAi} la usaron en el rango`} icon={Sparkles} tone="good" />
            <Metric label="Funciones de IA activas" value={`${data.ai.featuresActive} de ${data.ai.featuresTotal}`} hint="Encendidas en la plataforma" icon={Zap} />
            <Metric label="Análisis de IA" value={formatNumber(data.ai.runs)} hint="En el rango elegido" icon={Sparkles} />
            <Metric label="Análisis con error" value={formatNumber(data.ai.errors)} hint="En el rango elegido" icon={AlertTriangle} tone={data.ai.errors > 0 ? 'warn' : 'neutral'} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Altas por día" subtitle="Organizaciones y usuarios nuevos">
              <DailyBars
                data={data.daily}
                series={[
                  { key: 'organizations', label: 'Organizaciones', color: '#f97316' },
                  { key: 'users', label: 'Usuarios', color: '#64748b' },
                ]}
              />
            </Panel>
            <Panel title="Uso de IA por día" subtitle="Análisis registrados (la voz corre en cada equipo y no se registra)">
              <DailyBars data={data.daily} series={[{ key: 'aiRuns', label: 'Análisis', color: '#f97316' }]} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <Panel title="Alertas administrativas" className="lg:col-span-2">
              <Alerts alerts={data.alerts} />
            </Panel>
            <Panel title="Actividad reciente" actions={<Link to="/activity" className="text-xs text-brasa-400 hover:underline">Ver todo</Link>} className="lg:col-span-3">
              <ActivityFeed items={data.recentActivity} />
            </Panel>
          </div>
        </div>
      )}
    </>
  )
}

function Alerts({ alerts }: { alerts: NonNullable<Awaited<ReturnType<typeof fetchOverview>>>['alerts'] }) {
  const items = [
    { count: alerts.aiErrors24h, text: 'análisis de IA fallaron en las últimas 24 h', to: '/ai' },
    { count: alerts.expiredInvitations, text: 'invitaciones vencieron sin activarse', to: '/users?status=pending' },
    { count: alerts.trialsEndingSoon, text: 'pruebas gratis terminan en los próximos 7 días', to: '/organizations' },
    { count: alerts.inactiveOrganizations30d, text: 'organizaciones activas sin actividad en 30 días', to: '/organizations?sort=activity' },
    { count: alerts.deactivatedOrganizations, text: 'organizaciones desactivadas', to: '/organizations?status=inactive' },
  ].filter((a) => a.count > 0)
  if (items.length === 0)
    return (
      <p className="flex items-center gap-2 py-4 text-sm text-emerald-300">
        <CheckCircle2 size={16} aria-hidden /> Todo en orden.
      </p>
    )
  return (
    <ul className="space-y-2">
      {items.map((a) => (
        <li key={a.text}>
          <Link to={a.to} className="flex items-center gap-3 rounded-xl border border-console-700 px-3 py-2.5 transition-colors hover:bg-console-850">
            <span className="inline-flex min-w-7 justify-center rounded-md bg-amber-500/10 px-1.5 py-0.5 text-sm font-semibold tabular-nums text-amber-300">{a.count}</span>
            <span className="text-sm text-neutral-300">{a.text}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
