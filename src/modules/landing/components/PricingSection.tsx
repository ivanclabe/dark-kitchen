import { useAuth } from '@/shared/hooks/useAuth'
import { APP_ENTRY } from '@/shared/tenant/navigation'
import { PlanCard } from '@/shared/plans/PlanCard'
import { PlanComparison } from '@/shared/plans/PlanComparison'
import { hasAnnualBilling, signupPath, type BillingPeriod, type Plan } from '@/shared/plans/plans'
import { usePublicPricing } from '@/shared/plans/usePlans'
import clsx from 'clsx'
import { RotateCw } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { display } from '../lib/typography'

const CTA_BASE = 'flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold transition-colors'

/** Botón de cada plan: registro con el plan elegido, o ventas (ADR 0010, 3.4). */
function PlanCta({ plan, period }: { plan: Plan; period: BillingPeriod }) {
  const { session } = useAuth()
  const style = clsx(CTA_BASE, plan.badge ? 'bg-primary text-on-primary hover:bg-primary-hover' : 'border border-neutral-700 text-neutral-100 hover:border-neutral-500 hover:bg-neutral-800/60')
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
      <Link to={APP_ENTRY} className={style}>
        Ir a mi cuenta
      </Link>
    )
  }
  return (
    <Link to={signupPath(plan.key, period)} className={style}>
      {plan.ctaLabel}
    </Link>
  )
}

/**
 * Precios (ADR 0010): sin registrarse se ven los planes, qué incluye cada
 * uno, sus límites y la comparativa. Todo viene de la base (dk_plans).
 * Va en la paleta clara (.theme-light): las tarjetas son las mismas del registro.
 */
export function PricingSection() {
  const { data, isLoading, isError, refetch } = usePublicPricing()
  const [period, setPeriod] = useState<BillingPeriod>('monthly')
  const annual = data ? hasAnnualBilling(data.plans) : false

  return (
    <section id="precios" className="theme-light scroll-mt-16 border-t border-[#1C1310]/[0.07] bg-[#FBF6EF] text-neutral-50" aria-labelledby="landing-pricing">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="max-w-2xl">
          <h2 id="landing-pricing" style={display} className="text-3xl font-black tracking-[-0.02em] text-balance text-[#1C1310] sm:text-5xl">
            Un plan para cada etapa de <span className="text-brasa-500">tu negocio.</span>
          </h2>
          <p className="mt-4 text-lg text-[#5B4A42]">Crea tu cuenta, configura tu negocio y paga en línea con tarjeta, PSE o Nequi. Cambia de plan cuando tu operación crezca.</p>
        </div>

        {annual && (
          <div role="radiogroup" aria-label="Facturación" className="mt-8 inline-flex rounded-full bg-white p-1 text-sm ring-1 ring-[#1C1310]/10">
            {(['monthly', 'annual'] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={period === p}
                onClick={() => setPeriod(p)}
                className={clsx('rounded-full px-4 py-1.5', period === p ? 'bg-[#1C1310] text-white' : 'text-[#5B4A42] hover:text-[#1C1310]')}
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
                <PlanCard key={plan.key} plan={plan} period={period} action={<PlanCta plan={plan} period={period} />} />
              ))}
            </div>
            <h3 style={display} className="mt-16 text-2xl font-extrabold tracking-[-0.01em] text-[#1C1310]">Compara los planes</h3>
            <div className="mt-6">
              <PlanComparison pricing={data} period={period} />
            </div>
          </>
        )}
      </div>
    </section>
  )
}
