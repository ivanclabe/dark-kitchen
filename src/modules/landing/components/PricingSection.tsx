import { useAuth } from '@/shared/hooks/useAuth'
import { PlanCard } from '@/shared/plans/PlanCard'
import { PlanComparison } from '@/shared/plans/PlanComparison'
import { hasAnnualBilling, signupPath, type BillingPeriod, type Plan } from '@/shared/plans/plans'
import { usePublicPricing } from '@/shared/plans/usePlans'
import clsx from 'clsx'
import { RotateCw } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

const CTA_BASE = 'flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold transition-colors'

/** Botón de cada plan: registro con el plan elegido, o ventas (ADR 0010, 3.4). */
function PlanCta({ plan }: { plan: Plan }) {
  const { session } = useAuth()
  const style = clsx(CTA_BASE, plan.badge ? 'bg-brasa-500 text-white hover:bg-brasa-400' : 'border border-neutral-700 text-neutral-100 hover:border-neutral-500 hover:bg-neutral-800/60')
  if (plan.cta === 'contact_sales' && plan.contactUrl) {
    return (
      <a href={plan.contactUrl} className={style}>
        {plan.ctaLabel}
      </a>
    )
  }
  // Una organización por persona (ADR 0008): quien ya entró va a su cuenta.
  if (session) {
    return (
      <Link to="/" className={style}>
        Ir a mi cuenta
      </Link>
    )
  }
  return (
    <Link to={signupPath(plan.key)} className={style}>
      {plan.ctaLabel}
    </Link>
  )
}

/**
 * Precios (ADR 0010): sin registrarse se ven los planes, qué incluye cada
 * uno, sus límites y la comparativa. Todo viene de la base (dk_plans).
 */
export function PricingSection() {
  const { data, isLoading, isError, refetch } = usePublicPricing()
  const [period, setPeriod] = useState<BillingPeriod>('monthly')
  const annual = data ? hasAnnualBilling(data.plans) : false

  return (
    <section id="precios" className="scroll-mt-16 border-t border-neutral-800/60 bg-neutral-950" aria-labelledby="landing-pricing">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <h2 id="landing-pricing" className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Un plan para cada etapa de tu negocio
          </h2>
          <p className="mt-3 text-base text-neutral-400">Empieza gratis, sin tarjeta. Cambia de plan cuando tu operación crezca.</p>
        </div>

        {annual && (
          <div role="radiogroup" aria-label="Facturación" className="mt-8 inline-flex rounded-xl border border-neutral-800 p-1 text-sm">
            {(['monthly', 'annual'] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={period === p}
                onClick={() => setPeriod(p)}
                className={clsx('rounded-lg px-4 py-1.5', period === p ? 'bg-neutral-800 text-neutral-50' : 'text-neutral-400 hover:text-neutral-200')}
              >
                {p === 'monthly' ? 'Mensual' : 'Anual'}
              </button>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="mt-10 grid gap-4 lg:grid-cols-3" aria-busy="true" aria-label="Cargando planes">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[30rem] animate-pulse rounded-2xl border border-neutral-800/60 bg-neutral-900/40" />
            ))}
          </div>
        ) : isError || !data ? (
          <div className="mt-10 rounded-2xl border border-neutral-800/60 p-8 text-center">
            <p className="text-neutral-300">No pudimos cargar los precios.</p>
            <button type="button" onClick={() => void refetch()} className="mt-3 inline-flex items-center gap-2 text-sm text-brasa-400 hover:underline">
              <RotateCw size={14} aria-hidden /> Reintentar
            </button>
          </div>
        ) : (
          <>
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {data.plans.map((plan) => (
                <PlanCard key={plan.key} plan={plan} period={period} action={<PlanCta plan={plan} />} />
              ))}
            </div>
            <h3 className="mt-16 text-xl font-semibold tracking-tight">Compara los planes</h3>
            <div className="mt-6">
              <PlanComparison pricing={data} period={period} />
            </div>
          </>
        )}
      </div>
    </section>
  )
}
