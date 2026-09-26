import { useNow } from '@/shared/hooks/useNow'
import { formatPlanPrice, limitLabel } from '@/shared/plans/plans'
import { atLimit, fetchSubscription, SUBSCRIPTION_STATUS_LABEL, trialDaysLeft } from '@/shared/plans/subscription'
import { usePublicPricing } from '@/shared/plans/usePlans'
import { Badge } from '@/shared/ui/Badge'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { typography } from '@/shared/ui/typography'
import { formatDate } from '@/shared/utils/format'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Check } from 'lucide-react'
import { orgKey } from '../hooks/useOrganization'

function Usage({ label, used, limit, singular, plural }: { label: string; used: number; limit: number | null; singular: string; plural: string }) {
  const pct = limit === null ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100))
  const full = atLimit(used, limit)
  return (
    <div className="rounded-xl border border-neutral-800/60 p-4">
      <p className="text-sm text-neutral-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-neutral-100 tabular-nums">
        {used} <span className="text-sm font-normal text-neutral-500">{limit === null ? '· ilimitado' : `de ${limitLabel(limit, singular, plural)}`}</span>
      </p>
      {limit !== null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800" aria-hidden>
          <div className={clsx('h-full rounded-full', full ? 'bg-amber-400' : 'bg-brasa-500')} style={{ width: `${pct}%` }} />
        </div>
      )}
      {full && <p className="mt-2 text-xs text-amber-300">Llegaste al límite de tu plan.</p>}
    </div>
  )
}

/**
 * Plan de la organización (ADR 0010): qué plan tiene, su estado, límites y
 * uso, y qué incluye. Sin pagos todavía: el cambio de plan es con ventas.
 */
export function PlanPanel({ organizationId }: { organizationId: string }) {
  const now = useNow(60_000)
  const { data: sub, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...orgKey(organizationId), 'subscription'],
    queryFn: () => fetchSubscription(organizationId),
  })
  const catalog = usePublicPricing()

  if (isLoading) return <LoadingState variant="block" />
  if (isError || !sub) return <ErrorState error={error} onRetry={() => void refetch()} />

  const daysLeft = trialDaysLeft(sub, now)
  const featureLabel = (key: string) => catalog.data?.features.find((f) => f.key === key)?.label ?? key

  return (
    <div className="max-w-4xl space-y-6">
      <section className="rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={typography.overline}>Tu plan</p>
            <h2 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold text-neutral-50">
              {sub.plan.name}
              <Badge tone={sub.status === 'active' ? 'success' : sub.status === 'trialing' ? 'brand' : 'warning'} size="sm" dot>
                {SUBSCRIPTION_STATUS_LABEL[sub.status]}
              </Badge>
            </h2>
            <p className={clsx('mt-1', typography.small)}>{sub.plan.description}</p>
            <p className="mt-2 text-sm text-neutral-300">{formatPlanPrice(sub.plan, sub.billingPeriod)}</p>
          </div>
          {sub.plan.contactUrl && (
            <a href={sub.plan.contactUrl} className="rounded-xl border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-100 hover:border-neutral-500 hover:bg-neutral-800/60">
              Cambiar de plan
            </a>
          )}
        </div>
        {daysLeft !== null && (
          <p className={clsx('mt-4 rounded-xl px-3 py-2 text-sm', daysLeft > 0 ? 'bg-brasa-500/10 text-brasa-200' : 'bg-amber-500/10 text-amber-300')}>
            {daysLeft > 0
              ? `Tu prueba gratis termina en ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'} (${formatDate(sub.trialEndsAt!)}).`
              : 'Tu prueba gratis terminó. Todo sigue funcionando; escríbenos para continuar con tu plan.'}
          </p>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Usage label="Cuentas" used={sub.usage.accounts} limit={sub.limits.accounts} singular="cuenta" plural="cuentas" />
        <Usage label="Usuarios (activos y pendientes)" used={sub.usage.users} limit={sub.limits.users} singular="usuario" plural="usuarios" />
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className={typography.h3}>Qué incluye</h3>
          <ul className="mt-3 space-y-2 text-sm text-neutral-300">
            {sub.plan.highlights.map((h) => (
              <li key={h} className="flex gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-brasa-400" aria-hidden /> {h}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className={typography.h3}>Funciones del plan</h3>
          <p className={clsx('mt-1', typography.caption)}>Las ofreces a tus cuentas en la pestaña Funciones.</p>
          <ul className="mt-3 space-y-2 text-sm text-neutral-300">
            {sub.features.map((key) => (
              <li key={key} className="flex gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-brasa-400" aria-hidden /> {featureLabel(key)}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
