import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Badge } from '@/shared/ui/Badge'
import { Card } from '@/shared/ui/Card'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { StatCard } from '@/shared/ui/StatCard'
import { Tabs, type TabItem } from '@/shared/ui/Tabs'
import { typography } from '@/shared/ui/typography'
import { formatDateTime, formatMoney } from '@/shared/utils/format'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Activity, Bot, Boxes, Check, Clock, Gauge, Minus, Radio, ScrollText, ShoppingBag, Store, Truck, Users, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { fetchAccountObservability, type AccountObservability } from '../api'
import { EventLog } from '../components/EventLog'

type Tab = 'operacion' | 'bitacora'

const CHANNEL_LABEL: Record<string, string> = { MANUAL: 'Manual (en la app)', WHATSAPP: 'WhatsApp (integración)', PHONE: 'Teléfono' }
const MOVEMENT_LABEL: Record<string, string> = { COMPRA: 'Compras', CONSUMO: 'Consumo', MERMA: 'Mermas', AJUSTE: 'Ajustes', DEVOLUCION: 'Devoluciones' }

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-neutral-400">{label}</span>
      <span className="text-right tabular-nums text-neutral-100">{children}</span>
    </div>
  )
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-sm', ok ? 'text-neutral-200' : 'text-neutral-500')}>
      {ok ? <Check size={14} className="text-emerald-400" aria-hidden /> : <Minus size={14} aria-hidden />} {label}
    </span>
  )
}

function AccountOperation({ data, onOpenLog }: { data: AccountObservability; onOpenLog: (() => void) | null }) {
  const channels = Object.entries(data.orders.byChannel)
  const movements = Object.entries(data.inventory.movements)
  return (
    <div className="space-y-6">
      <p className={typography.caption}>Horas en {data.account.timezone} · actualizado {formatDateTime(data.generatedAt)}</p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pedidos de hoy" value={data.orders.today.created} hint={`${data.orders.today.delivered} entregados · ${data.orders.today.cancelled} cancelados`} icon={ShoppingBag} tone="brand" />
        <StatCard label="Ventas de hoy" value={formatMoney(data.orders.today.sales)} hint={`7 días: ${formatMoney(data.orders.week.sales)}`} icon={Wallet} tone="good" />
        <StatCard label="En curso ahora" value={data.inProgress} hint={data.late > 0 ? `${data.late} atrasados` : 'Ninguno atrasado'} icon={Clock} tone={data.late > 0 ? 'warn' : 'neutral'} />
        <StatCard label="Preparación promedio" value={data.avgPrepMinutes !== null ? `${data.avgPrepMinutes} min` : '—'} hint="De en cola a listo, últimos 7 días" icon={Gauge} />
      </div>

      <Card title="Pedidos por día" description="Últimos 7 días, sin cancelados" icon={Activity}>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.orders.byDay.map((d) => ({ ...d, label: d.date.slice(5) }))}>
              <XAxis dataKey="label" tick={{ fill: '#737373', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                contentStyle={{ background: '#171717', border: '1px solid #262626', borderRadius: 12, fontSize: 12 }}
                formatter={(value, name) => (name === 'orders' ? [value, 'Pedidos'] : [formatMoney(Number(value)), 'Ventas'])}
              />
              <Bar dataKey="orders" fill="#f97316" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        <Card title="Canales (7 días)" icon={Radio}>
          {channels.length === 0 ? <p className={typography.caption}>Sin pedidos.</p> : channels.map(([c, n]) => <Row key={c} label={CHANNEL_LABEL[c] ?? c}>{n}</Row>)}
          <p className={clsx('mt-2', typography.caption)}>Los errores de las integraciones todavía no se registran.</p>
        </Card>
        <Card title="Inventario (7 días)" icon={Boxes}>
          {movements.length === 0 ? <p className={typography.caption}>Sin movimientos.</p> : movements.map(([t, n]) => <Row key={t} label={MOVEMENT_LABEL[t] ?? t}>{n}</Row>)}
          <Row label="Insumos bajo el mínimo">
            <span className={data.inventory.lowStock > 0 ? 'text-amber-300' : undefined}>{data.inventory.lowStock}</span>
          </Row>
        </Card>
        <Card title="Compras y cobros (7 días)" icon={Truck}>
          <Row label="Compras confirmadas">{data.purchases.confirmed} · {formatMoney(data.purchases.confirmedAmount)}</Row>
          <Row label="Compras en borrador">{data.purchases.drafts}</Row>
          <Row label="Cobros a clientes">{data.payments.count} · {formatMoney(data.payments.amount)}</Row>
        </Card>
        <Card title="Inteligencia artificial" icon={Bot}>
          <Row label="Análisis en 24 h">{data.ai.runs24h} de {data.ai.limitPerDay}</Row>
          <Row label="Con error">
            <span className={data.ai.errors24h > 0 ? 'text-red-300' : undefined}>{data.ai.errors24h}</span>
          </Row>
        </Card>
        <Card title="Equipo" icon={Users}>
          <Row label="Personas con acceso">{data.team.members}</Row>
          <Row label="Activas en 7 días">{data.team.active7d}</Row>
          <Row label="Último inicio de sesión">{data.team.lastSignInAt ? formatDateTime(data.team.lastSignInAt) : '—'}</Row>
        </Card>
        <Card title="Estado de módulos" icon={Store}>
          <div className="flex flex-col gap-1.5">
            <Flag ok={data.modules.accountActive} label="Cuenta activa" />
            <Flag ok={data.modules.hoursConfigured} label="Horario de atención configurado" />
            <Flag ok={data.modules.slaConfigured} label="Alertas de tiempo configuradas" />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {data.features.map((f) => (
              <Badge key={f.key} size="sm" tone={f.enabled ? 'success' : 'neutral'} dot>
                {f.label}
                {!f.includedInPlan && ' (no incluida en el plan)'}
              </Badge>
            ))}
          </div>
        </Card>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className={typography.h3}>Cambios recientes en la cuenta</h2>
          {onOpenLog && (
            <button type="button" onClick={onOpenLog} className="text-sm text-brasa-400 hover:underline">
              Ver en la bitácora
            </button>
          )}
        </div>
        {data.recentChanges.length === 0 ? (
          <p className={typography.caption}>Sin cambios registrados.</p>
        ) : (
          <ul className="divide-y divide-neutral-800/60 rounded-2xl border border-neutral-800/60 bg-neutral-900/40 px-4">
            {data.recentChanges.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm">
                <span className="text-neutral-200">
                  <span className="font-medium">{e.actor ?? 'Sistema'}</span> · {e.summary}
                </span>
                <time className="text-xs text-neutral-500" dateTime={e.createdAt}>
                  {formatDateTime(e.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="rounded-xl border border-neutral-800/60 px-4 py-3 text-sm text-neutral-400">
        <summary className="cursor-pointer text-neutral-300">Qué no se mide todavía</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Personas conectadas en este momento: necesita un registro periódico de actividad (latido).</li>
          <li>Errores de las integraciones (p. ej. pedidos por WhatsApp que fallan): la integración debe registrarlos.</li>
          <li>Errores que ve cada persona en la aplicación: necesita el reporte desde el navegador.</li>
          <li>Operaciones rechazadas por permisos: la base las rechaza, pero no quedan registradas.</li>
        </ul>
      </details>
    </div>
  )
}

/**
 * Actividad of the active account (ADR 0012, ADR 0024): "Operación" answers
 * how is this account working? and "Bitácora", who did what and when? Only
 * this account; to see another one, switch accounts.
 */
export function ActivitySettingsPage() {
  const { organization, kitchen, can, canShared } = useActiveKitchen()
  const [params, setParams] = useSearchParams()
  const seeOperation = canShared('observability.view') && organization !== null
  const seeLog = can('audit.view') || canShared('observability.view')
  const tabs: TabItem<Tab>[] = [
    ...(seeOperation ? [{ value: 'operacion' as const, label: 'Operación', icon: Activity }] : []),
    ...(seeLog ? [{ value: 'bitacora' as const, label: 'Bitácora', icon: ScrollText }] : []),
  ]
  const tab: Tab = tabs.find((t) => t.value === params.get('tab'))?.value ?? tabs[0]?.value ?? 'bitacora'
  const setTab = (t: Tab) => setParams(t === tabs[0]?.value ? {} : { tab: t }, { replace: true })

  const detail = useQuery({
    queryKey: ['account', kitchen.id, 'observability'],
    queryFn: () => fetchAccountObservability(organization!.id, kitchen.id),
    enabled: tab === 'operacion' && seeOperation,
    refetchInterval: 60_000,
  })

  return (
    <div className="space-y-6">
      {tabs.length > 1 && <Tabs value={tab} onChange={setTab} items={tabs} />}
      {tab === 'bitacora' ? (
        <EventLog />
      ) : detail.isLoading ? (
        <LoadingState variant="cards" rows={1} cols={4} />
      ) : detail.isError || !detail.data ? (
        <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
      ) : (
        <AccountOperation data={detail.data} onOpenLog={seeLog ? () => setTab('bitacora') : null} />
      )}
    </div>
  )
}
