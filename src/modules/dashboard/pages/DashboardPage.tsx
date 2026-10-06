import { useCustomersSummary } from '@/modules/customers/hooks/useCustomers'
import { Page } from '@/shared/ui/Page'
import { PageHeader } from '@/shared/ui/PageHeader'
import { fetchAccountAlerts } from '@/modules/settings/api'
import { AlertList } from '@/modules/settings/components/AlertList'
import { useSlaSettings } from '@/modules/orders/hooks/useSlaSettings'
import { alertMinutesFor, DEFAULT_SLA_THRESHOLDS, minutesAgoSince, timeTier } from '@/modules/orders/lib/orderVisuals'
import { useLiveOrders, useOrderSearch } from '@/modules/orders/hooks/useOrders'
import { OrderStatusBadge } from '@/modules/orders/lib/orderStatus'
import { useOnShiftNow } from '@/modules/staff/hooks/useStaff'
import { useAuth } from '@/shared/hooks/useAuth'
import { useNow } from '@/shared/hooks/useNow'
import { Card } from '@/shared/ui/Card'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Tooltip } from '@/shared/ui/Tooltip'
import { iconButtonClass } from '@/shared/ui/formClasses'
import { typography } from '@/shared/ui/typography'
import { formatDateLong, formatDateTime, formatMoney, todayStr } from '@/shared/utils/format'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  ChefHat,
  ClipboardList,
  Eye,
  EyeOff,
  LayoutDashboard,
  ShoppingCart,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { KitchenLink as Link } from '@/shared/kitchen/KitchenLink'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { useDashboardSummary } from '../hooks/useDashboard'
import { alertLink, attentionRows } from '../lib/attention'
import type { DashboardSummary } from '../types'

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

/**
 * The header of Inicio (ADR 0032): the same PageHeader as every screen —
 * the greeting with the date and a real clock, today's sales (that can be
 * hidden) and the quick accesses on the right.
 */
function DashboardHeader({
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
    <PageHeader help="home-screen"
      title="Inicio"
      icon={LayoutDashboard}
      description={
        <span className="inline-flex flex-wrap items-center gap-x-2">
          <span className="font-medium text-neutral-200">Hola, {firstName}</span>
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" aria-label="En vivo" />
          <span>
            {formatDateLong(todayStr())} · <span className="tabular-nums">{clock}</span>
          </span>
        </span>
      }
      actions={
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
            <HeroAction icon={BarChart3} label="Insights" to="/insights" />
          </div>
        </div>
      }
    />
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

/** Últimos pedidos — la misma búsqueda de Pedidos → Lista, solo los 4 más recientes. */
function RecentOrdersCard() {
  const { data, isLoading } = useOrderSearch({ limit: 4 })
  const recent = data?.orders ?? []

  return (
    <Card title="Pedidos recientes" icon={ClipboardList} action={<CardLink to="/operations?view=list" label="Ver todos los pedidos" />}>
      {isLoading ? (
        <LoadingState variant="block" className="!border-0 !bg-transparent !p-0" />
      ) : recent.length === 0 ? (
        <p className="text-sm text-neutral-500">Todavía no hay pedidos.</p>
      ) : (
        <ul className="divide-y divide-neutral-800/60">
          {recent.map((o) => (
            <li key={o.id}>
              <Link to={`/operations/${o.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-neutral-800/50">
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

/**
 * Atrasados fuera de SLA, listos y en ruta — de la misma lista en vivo que
 * usan Pedidos y Cocina (una sola consulta). Solo se monta para roles con acceso a la cola.
 */
function LateKitchenRow() {
  const now = useNow()
  const { data: live } = useLiveOrders()
  const { data: thresholds = DEFAULT_SLA_THRESHOLDS } = useSlaSettings()

  const { late, ready, onRoute } = useMemo(() => {
    const orders = live ?? []
    return {
      late: orders.filter((t) => timeTier(minutesAgoSince(t.createdAt, now), alertMinutesFor(t.status, thresholds), thresholds.nearThresholdPct) === 'retrasado').length,
      ready: orders.filter((t) => t.status === 'LISTO').length,
      onRoute: orders.filter((t) => t.status === 'DESPACHADO').length,
    }
  }, [live, now, thresholds])

  return (
    <StatList
      items={[
        { label: 'Atrasados (fuera de SLA)', value: late, tone: late > 0 ? 'warn' : 'good', to: '/operations?view=kitchen' },
        { label: 'Listos para despachar', value: ready, tone: ready > 0 ? 'good' : undefined, to: '/operations?view=dispatch' },
        { label: 'En ruta', value: onRoute, to: '/operations?view=dispatch' },
      ]}
    />
  )
}

function KitchenNowCard({ summary, liveOps }: { summary: DashboardSummary | undefined; liveOps: boolean }) {
  return (
    <Card title="Cocina ahora" icon={ChefHat} description="Pedidos por estado, en este momento" action={<CardLink to="/operations?view=kitchen" label="Ir a Cocina" />}>
      {liveOps && <LateKitchenRow />}
      <StatList
        items={[
          { label: 'Por confirmar', value: summary?.ordersNuevo ?? '—', to: '/operations' },
          { label: 'En cola', value: summary?.ordersConfirmado ?? '—', to: '/operations?view=kitchen' },
          { label: 'Preparando', value: summary?.ordersEnPreparacion ?? '—', to: '/operations?view=kitchen' },
        ]}
      />
    </Card>
  )
}

/** En turno ahora (Personal y Turnos, ADR 0020): who is working, by role. */
function OnShiftCard() {
  const { data, isLoading } = useOnShiftNow()
  const byRole = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const s of data ?? []) map.set(s.roleName, [...(map.get(s.roleName) ?? []), s.fullName.split(' ')[0]])
    return [...map]
  }, [data])
  return (
    <Card title="En turno ahora" icon={CalendarClock} action={<CardLink to="/staff" label="Ver turnos" />}>
      {isLoading ? (
        <LoadingState variant="block" className="!border-0 !bg-transparent !p-0" />
      ) : byRole.length === 0 ? (
        <p className="text-sm text-neutral-500">Nadie tiene turno en este momento.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {byRole.map(([role, names]) => (
            <li key={role} className="flex justify-between gap-3">
              <span className="text-neutral-400">{role}</span>
              <span className="truncate text-right text-neutral-100">{names.join(', ')}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** Receivables from the aggregated summary (ADR 0030: never every receivable to add them up), linked to the filtered list. */
function CarteraRows() {
  const { data } = useCustomersSummary()
  return (
    <StatList
      items={[
        { label: 'Por cobrar', value: data?.pendingBalance !== undefined ? formatMoney(data.pendingBalance) : '—', to: '/customers?status=debt' },
        {
          label: 'Vencido',
          value: data?.overdueBalance !== undefined ? formatMoney(data.overdueBalance) : '—',
          tone: (data?.overdueBalance ?? 0) > 0 ? 'warn' : 'good',
          to: '/customers?status=overdue',
        },
      ]}
    />
  )
}

function CarteraCard({ summary, liveOps }: { summary: DashboardSummary | undefined; liveOps: boolean }) {
  const { can } = useActiveKitchen()
  return (
    <Card title="Cartera y compras" icon={Wallet} description="Compras y mermas: este mes" action={<CardLink to="/customers?status=debt" label="Ver quién debe" />}>
      {liveOps && can('receivables.view') && <CarteraRows />}
      <StatList
        items={[
          { label: 'Compras del mes', value: summary ? formatMoney(summary.purchasesMonth) : '—', to: '/supply/compras' },
          { label: 'Mermas del mes', value: summary ? formatMoney(summary.wasteValueMonth) : '—', to: '/insights?tab=costs' },
        ]}
      />
    </Card>
  )
}

// ---------------------------------------------------------------------------

/**
 * «Necesita atención» (ADR 0030): what to do now, from figures that already
 * exist, each opening its destination already filtered. Rows at zero hide;
 * with nothing pending it says so. Analysis lives in Insights.
 */
function NeedsAttention({ summary }: { summary: DashboardSummary | undefined }) {
  const { can } = useActiveKitchen()
  const customers = useCustomersSummary(can('customers.view') && can('receivables.view'))
  if (!summary) return null
  const overdue = can('customers.view') && can('receivables.view') ? (customers.data?.withOverdue ?? 0) : null
  const visible = attentionRows(summary, overdue, can)
  if (visible.length === 0) return null
  const pending = visible.filter((r) => r.value > 0)
  return (
    <section aria-label="Necesita atención" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className={typography.h3}>Necesita atención</h2>
        {can('reports.view') && (
          <Link to="/insights" className="inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-100">
            Tendencias y rentabilidad en Insights <ArrowRight size={13} aria-hidden />
          </Link>
        )}
      </div>
      {pending.length === 0 ? (
        <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">Todo al día: nada pendiente por ahora.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {pending.map((r) => (
            <li key={r.id}>
              <Link to={r.to} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800/60 bg-neutral-900/60 px-4 py-3 transition-colors hover:border-neutral-700 hover:bg-neutral-900">
                <span className="min-w-0 text-sm text-neutral-300">{r.label}</span>
                <span className="flex items-center gap-1.5 text-lg font-semibold tabular-nums text-neutral-50">
                  {r.value}
                  <ArrowRight size={14} className="text-neutral-500" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Alerts of this account (ADR 0024, D5: they come from the old organization summary). Nothing when all is fine. */
function AccountAlerts() {
  const { kitchen, can, canShared } = useActiveKitchen()
  const { data } = useQuery({ queryKey: ['account', kitchen.id, 'alerts'], queryFn: fetchAccountAlerts, refetchInterval: 60_000 })
  if (!data?.length) return null
  return (
    <section aria-label="Alertas de la cuenta">
      <AlertList alerts={data} linkFor={(alert) => alertLink(alert, { can, canShared })} />
    </section>
  )
}

export function DashboardPage() {
  const { profile } = useAuth()
  const { data, isLoading, isError, error, refetch } = useDashboardSummary()
  // Operación en vivo y cartera: quien despacha (Administrador, Gerente, Caja) — permiso de la Cocina activa.
  const { can } = useActiveKitchen()
  const canSeeLiveOps = can('dispatch.assign')
  const firstName = profile?.fullName?.split(' ')[0] ?? 'usuario'

  return (
    <Page>
      <DashboardHeader firstName={firstName} salesToday={data?.salesToday ?? null} ordersToday={data?.ordersToday ?? null} loading={isLoading} />

      <AccountAlerts />

      <NeedsAttention summary={data} />

      {isError && <ErrorState error={error} onRetry={() => void refetch()} compact />}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {canSeeLiveOps && <RecentOrdersCard />}
        <KitchenNowCard summary={data} liveOps={canSeeLiveOps} />
        <CarteraCard summary={data} liveOps={canSeeLiveOps} />
        {can('staff.view') && <OnShiftCard />}
      </div>
    </Page>
  )
}
