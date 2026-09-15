import { Card } from '@/shared/ui/Card'
import { Chip } from '@/shared/ui/Chip'
import { AlertTriangle, CheckCircle2, Clock, Flag } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSlaSummary } from '../hooks/useSla'
import { useKitchenSlaSettings } from '../hooks/useKitchenSettings'
import {
  alertMinutesFor,
  DEFAULT_SLA_THRESHOLDS,
  formatElapsed,
  minutesAgoSince,
  TIME_TIER_STYLE,
  timeTier,
  type TimeTier,
} from '../lib/ticketVisuals'
import type { KitchenTicket } from '../types'

type SlaRange = 'hoy' | 'ultima_hora' | '4h'

const RANGE_LABEL: Record<SlaRange, string> = {
  hoy: 'Hoy',
  ultima_hora: 'Última hora',
  '4h': 'Últimas 4 horas',
}

const RANGE_ORDER: SlaRange[] = ['hoy', 'ultima_hora', '4h']

function rangeStart(range: SlaRange): Date {
  const now = new Date()
  if (range === 'ultima_hora') return new Date(now.getTime() - 60 * 60_000)
  if (range === '4h') return new Date(now.getTime() - 4 * 60 * 60_000)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return start
}

const TIER_LABEL: Record<TimeTier, string> = {
  normal: 'Dentro SLA',
  atencion: 'Cerca del límite',
  retrasado: 'Fuera SLA',
}

const TIER_ICON: Record<TimeTier, typeof Clock> = {
  normal: CheckCircle2,
  atencion: Clock,
  retrasado: AlertTriangle,
}

function MetricCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'good' | 'warn' | 'neutral'
}) {
  const toneClass = tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-red-400' : 'text-neutral-50'
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 text-4xl font-bold 2xl:text-5xl ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </Card>
  )
}

/**
 * Vista operacional, no un dashboard administrativo: responde "¿cómo
 * vamos con los tiempos?" y "¿qué pedidos están causando el problema
 * ahora?" en un vistazo. Los pedidos activos reutilizan exactamente el
 * mismo timeTier ya usado en Grid/Kanban/Lista, parametrizado con los
 * umbrales configurables (useKitchenSlaSettings) — ningún umbral nuevo.
 */
export function SlaView({ tickets, now }: { tickets: KitchenTicket[] | undefined; now: number }) {
  const [range, setRange] = useState<SlaRange>('hoy')
  // rangeStart(range) crea un Date nuevo en cada llamada — memoizado para
  // que su ISO string (parte de la queryKey) no cambie en cada render y la
  // consulta no se reinicie infinitamente.
  const start = useMemo(() => rangeStart(range), [range])
  const { data: thresholds = DEFAULT_SLA_THRESHOLDS } = useKitchenSlaSettings()
  // Tiempo total de preparación (CONFIRMADO -> LISTO) dentro de SLA = suma
  // de los umbrales de las dos etapas que ese tramo cubre.
  const lateThresholdMin = thresholds.confirmadoAlertMin + thresholds.enPreparacionAlertMin
  const { data: summary, isLoading } = useSlaSummary(start, lateThresholdMin)

  const activeWithTime = useMemo(
    () =>
      (tickets ?? [])
        .map((ticket) => ({ ticket, minutesAgo: minutesAgoSince(ticket.createdAt, now) }))
        .sort((a, b) => b.minutesAgo - a.minutesAgo),
    [tickets, now],
  )

  function tierFor(ticket: KitchenTicket, minutesAgo: number): TimeTier {
    return timeTier(minutesAgo, alertMinutesFor(ticket.orderStatus, thresholds), thresholds.nearThresholdPct)
  }

  const lateNowCount = activeWithTime.filter(({ ticket, minutesAgo }) => tierFor(ticket, minutesAgo) === 'retrasado').length
  const nearLimitCount = activeWithTime.filter(({ ticket, minutesAgo }) => tierFor(ticket, minutesAgo) === 'atencion').length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {RANGE_ORDER.map((r) => (
          <Chip key={r} label={RANGE_LABEL[r]} active={range === r} onClick={() => setRange(r)} />
        ))}
      </div>

      {isLoading && <p className="text-neutral-400">Cargando…</p>}

      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard
            label="Cumplimiento"
            value={`${summary.complianceRate}%`}
            hint={`${summary.totalCompleted} pedidos completados`}
            tone={summary.complianceRate >= 90 ? 'good' : summary.complianceRate >= 75 ? 'neutral' : 'warn'}
          />
          <MetricCard
            label="Atrasados ahora"
            value={String(lateNowCount)}
            hint={nearLimitCount > 0 ? `${nearLimitCount} cerca del límite` : undefined}
            tone={lateNowCount > 0 ? 'warn' : 'good'}
          />
          <MetricCard label="Tiempo promedio" value={formatElapsed(Math.round(summary.avgPrepMinutes))} />
          <MetricCard label="Mayor tiempo" value={formatElapsed(Math.round(summary.maxPrepMinutes))} />
        </div>
      )}

      <Card title="Pedidos activos por tiempo transcurrido" icon={Clock}>
        {activeWithTime.length === 0 && <p className="text-sm text-neutral-500">No hay pedidos activos en cocina.</p>}
        <ul className="divide-y divide-neutral-800">
          {activeWithTime.map(({ ticket, minutesAgo }) => {
            const tier = tierFor(ticket, minutesAgo)
            const TierIcon = TIER_ICON[tier]
            return (
              <li key={ticket.orderId} className="flex items-center justify-between gap-3 py-2.5">
                <span className="inline-flex items-center gap-2 text-sm text-neutral-200">
                  {ticket.priority > 0 && <Flag size={12} className="shrink-0 text-violet-400" />}
                  #{ticket.orderNumber} · {ticket.customerName}
                </span>
                <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${TIME_TIER_STYLE[tier]}`}>
                  {formatElapsed(minutesAgo)} <TierIcon size={13} /> {TIER_LABEL[tier]}
                </span>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
