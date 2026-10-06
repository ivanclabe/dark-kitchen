import clsx from 'clsx'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { KitchenLink as Link } from '@/shared/kitchen/KitchenLink'
import type { AccountAlert } from '../api'

const ALERT_STYLE: Record<AccountAlert['severity'], { icon: typeof Info; className: string }> = {
  error: { icon: XCircle, className: 'border-red-500/30 bg-red-500/5 text-red-300' },
  warning: { icon: AlertTriangle, className: 'border-amber-500/30 bg-amber-500/5 text-amber-200' },
  info: { icon: Info, className: 'border-neutral-700 bg-neutral-900/60 text-neutral-300' },
}

/**
 * Alertas de observabilidad (solo de datos reales, calculadas en la base).
 * `linkFor` (ADR 0030) adds «Ver» towards the cause of each alert, when the
 * person can open it.
 */
export function AlertList({ alerts, linkFor }: { alerts: AccountAlert[]; linkFor?: (alert: AccountAlert) => string | null }) {
  if (alerts.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">
        <CheckCircle2 size={16} aria-hidden /> Sin alertas: todo en orden.
      </p>
    )
  }
  return (
    <ul className="space-y-2">
      {alerts.map((a, i) => {
        const { icon: Icon, className } = ALERT_STYLE[a.severity]
        const to = linkFor?.(a) ?? null
        return (
          <li key={`${a.type}-${i}`} className={clsx('flex items-start gap-2 rounded-xl border px-3 py-2 text-sm', className)}>
            <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">{a.message}</span>
            {to && (
              <Link to={to} className="shrink-0 font-medium underline-offset-2 hover:underline">
                Ver
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}

