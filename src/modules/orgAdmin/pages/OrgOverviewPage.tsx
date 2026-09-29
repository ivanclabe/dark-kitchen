import { AccountIcon } from '@/shared/avatars/Avatar'
import { useOrgAdmin } from '@/shared/org/orgContext'
import { ActiveBadge } from '@/shared/ui/Badge'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { PageHeader } from '@/shared/ui/PageHeader'
import { StatCard } from '@/shared/ui/StatCard'
import { typography } from '@/shared/ui/typography'
import { formatDateTime, formatMoney } from '@/shared/utils/format'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Clock, LayoutGrid, Receipt, ShoppingBag, Store, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { fetchOrgObservability, type OrgAccountStats } from '../api'
import { AlertList } from '../components/AlertList'

/** Cifra y detalle en dos líneas, sin cortes raros en tablas angostas. */
function TwoLines({ top, bottom }: { top: ReactNode; bottom: ReactNode }) {
  return (
    <span className="inline-flex flex-col items-end whitespace-nowrap tabular-nums">
      <span className="text-neutral-100">{top}</span>
      <span className="text-xs text-neutral-500">{bottom}</span>
    </span>
  )
}

/**
 * Resumen de la organización (ADR 0012, sección 4): ¿cómo están operando
 * mis Cuentas? Solo métricas reales, calculadas en la base con ventanas
 * acotadas y en la zona horaria de cada Cuenta. Se actualiza cada minuto.
 */
export function OrgOverviewPage() {
  const { organization, path } = useOrgAdmin()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['org', organization.id, 'observability'],
    queryFn: () => fetchOrgObservability(organization.id),
    refetchInterval: 60_000,
  })

  const columns: DataTableColumn<OrgAccountStats>[] = [
    {
      key: 'name',
      header: 'Cuenta',
      cell: (a) => (
        <Link to={path(`/observabilidad?cuenta=${a.id}`)} className="flex min-w-0 items-center gap-3 hover:text-brasa-300">
          <AccountIcon iconKey={a.iconKey} seed={a.id} size="sm" className={a.active ? undefined : 'opacity-50'} />
          <span className="truncate font-medium text-neutral-100">{a.name}</span>
        </Link>
      ),
    },
    { key: 'status', header: 'Estado', hideBelow: 'md', cell: (a) => <ActiveBadge active={a.active} /> },
    { key: 'today', header: 'Pedidos hoy', align: 'right', cell: (a) => <TwoLines top={a.ordersToday} bottom={formatMoney(a.salesToday)} /> },
    { key: 'week', header: '7 días', align: 'right', hideBelow: 'lg', cell: (a) => <TwoLines top={a.ordersWeek} bottom={formatMoney(a.salesWeek)} /> },
    {
      key: 'now',
      header: 'En curso',
      align: 'right',
      cell: (a) => <TwoLines top={a.inProgress} bottom={a.late > 0 ? <span className="text-amber-300">{a.late} atrasados</span> : 'al día'} />,
    },
    { key: 'stock', header: 'Bajo mínimo', align: 'right', hideBelow: 'lg', cell: (a) => <span className={clsx('tabular-nums', a.lowStock > 0 && 'text-amber-300')}>{a.lowStock}</span> },
    { key: 'ai', header: 'IA 24 h', align: 'right', hideBelow: 'lg', cell: (a) => <span className={clsx('tabular-nums', a.aiErrors24h > 0 && 'text-red-300')}>{a.aiRuns24h}{a.aiErrors24h > 0 && ` (${a.aiErrors24h} err.)`}</span> },
    { key: 'last', header: 'Última actividad', hideBelow: 'md', cell: (a) => <span className="whitespace-nowrap text-xs text-neutral-400">{a.lastActivityAt ? formatDateTime(a.lastActivityAt) : '—'}</span> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Resumen" icon={LayoutGrid} description={`Cómo está operando ${organization.name}.`} />
      {isLoading ? (
        <LoadingState variant="cards" rows={1} cols={4} />
      ) : isError || !data ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Cuentas activas" value={data.totals.accountsActive} hint={data.totals.accountsInactive > 0 ? `${data.totals.accountsInactive} desactivadas` : 'Todas activas'} icon={Store} tone="brand" />
            <StatCard label="Usuarios activos (7 días)" value={`${data.totals.activeUsers7d} de ${data.totals.users}`} hint="Con inicio de sesión o actividad" icon={Users} />
            <StatCard label="Pedidos de hoy" value={data.totals.ordersToday} hint={`${formatMoney(data.totals.salesToday)} en ventas`} icon={ShoppingBag} tone="good" />
            <StatCard label="Atrasados ahora" value={data.totals.late} hint="Según las alertas de tiempo de cada cuenta" icon={Clock} tone={data.totals.late > 0 ? 'warn' : 'neutral'} />
          </div>

          <section className="space-y-3">
            <h2 className={typography.h3}>Alertas</h2>
            <AlertList alerts={data.alerts} />
          </section>

          <section className="space-y-3">
            <h2 className={typography.h3}>Cuentas</h2>
            <DataTable columns={columns} rows={data.accounts} getRowId={(a) => a.id} />
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className={typography.h3}>Actividad reciente</h2>
              <Link to={path('/observabilidad?tab=bitacora')} className="text-sm text-brasa-400 hover:underline">
                Ver bitácora
              </Link>
            </div>
            {data.recentEvents.length === 0 ? (
              <p className={typography.caption}>Sin eventos todavía.</p>
            ) : (
              <ul className="divide-y divide-neutral-800/60 rounded-2xl border border-neutral-800/60 bg-neutral-900/40 px-4">
                {data.recentEvents.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm">
                    <span className="min-w-0 text-neutral-200">
                      <span className="font-medium">{e.actor ?? 'Sistema'}</span> · {e.summary}
                      {e.result === 'failure' && <span className="ml-1 text-red-300">(falló)</span>}
                    </span>
                    <time className="shrink-0 text-xs text-neutral-500" dateTime={e.createdAt}>
                      {formatDateTime(e.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className={clsx(typography.caption, 'flex items-center gap-1.5')}>
            <Receipt size={12} aria-hidden /> Actualizado {formatDateTime(data.generatedAt)}. Se actualiza cada minuto.
          </p>
        </>
      )}
    </div>
  )
}
