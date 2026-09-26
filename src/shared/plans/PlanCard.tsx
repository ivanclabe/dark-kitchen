import clsx from 'clsx'
import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatAmount, type BillingPeriod, type Plan } from './plans'

/**
 * Tarjeta de un plan (ADR 0010). La misma en la landing y en el registro:
 * así los recorridos A, B y C se ven como un solo producto. El botón lo pone
 * quien la usa (enlace al registro, "Elegir", "Hablar con ventas").
 */
export function PlanCard({
  plan,
  period = 'monthly',
  action,
  selected = false,
  headingLevel = 'h3',
}: {
  plan: Plan
  period?: BillingPeriod
  action: ReactNode
  selected?: boolean
  headingLevel?: 'h2' | 'h3'
}) {
  const Heading = headingLevel
  const annual = period === 'annual' && plan.priceYearly !== null
  const featured = Boolean(plan.badge)
  return (
    <article
      aria-label={`Plan ${plan.name}`}
      className={clsx(
        'relative flex h-full flex-col rounded-2xl border p-6 transition-colors',
        selected
          ? 'border-brasa-500 bg-brasa-500/[0.06] ring-1 ring-brasa-500'
          : featured
            ? 'border-brasa-500/50 bg-neutral-900/70 shadow-[0_24px_60px_-30px_var(--color-brasa-500)]'
            : 'border-neutral-800/60 bg-neutral-900/50',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Heading className="text-lg font-semibold text-neutral-50">{plan.name}</Heading>
        {plan.badge && <span className="rounded-full bg-brasa-500 px-2.5 py-0.5 text-xs font-semibold text-white">{plan.badge}</span>}
      </div>
      <p className="mt-2 min-h-10 text-sm leading-relaxed text-neutral-400">{plan.description}</p>

      <p className="mt-5 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tracking-tight text-neutral-50 tabular-nums">{formatAmount(annual ? plan.priceYearly! : plan.priceMonthly)}</span>
        <span className="text-sm text-neutral-400">
          {plan.currency}/{annual ? 'año' : 'mes'}
        </span>
      </p>
      <p className="mt-1 h-5 text-xs text-neutral-500">{plan.trialDays > 0 ? `${plan.trialDays} días gratis, sin tarjeta` : 'Con acompañamiento de nuestro equipo'}</p>

      <div className="mt-5">{action}</div>

      <ul className="mt-6 space-y-2.5 text-sm text-neutral-300">
        {plan.highlights.map((h) => (
          <li key={h} className="flex gap-2.5">
            <Check size={16} className="mt-0.5 shrink-0 text-brasa-400" aria-hidden />
            <span>{h}</span>
          </li>
        ))}
      </ul>
    </article>
  )
}
