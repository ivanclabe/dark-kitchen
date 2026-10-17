import { PlanComparison } from '@/shared/plans/PlanComparison'
import { formatAmount, hasAnnualBilling, signupPath, type BillingPeriod, type Plan } from '@/shared/plans/plans'
import { usePublicPricing } from '@/shared/plans/usePlans'
import clsx from 'clsx'
import { RotateCw } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'

/** The fields of the tiles, from the lightest plan to the largest: stone, ember, roast brown. */
const TILE = [
  { field: 'bg-[var(--l-field)] text-[var(--l-ink)]', soft: 'text-[var(--l-soft)]', button: 'landing-button-ink', height: 'lg:min-h-[500px]' },
  { field: 'bg-[var(--l-accent)] text-white', soft: 'text-white/85', button: 'landing-button-light', height: 'lg:min-h-[580px]' },
  { field: 'bg-[var(--l-stage)] text-[var(--l-on-stage)]', soft: 'text-[#d9cbbf]', button: 'landing-button-light', height: 'lg:min-h-[660px]' },
]

/** What the plan's price line says under it (the same rules as the sign-up's cards). */
function priceNote(plan: Plan, annual: boolean): string {
  if (plan.trialDays > 0) return `${plan.trialDays} días gratis, sin tarjeta`
  if (!plan.selfServe) return 'Con acompañamiento de nuestro equipo'
  return annual ? 'Pagas el año y te regalamos dos meses' : 'Sin permanencia: cancelas cuando quieras'
}

/** Each plan's button: the sign-up with that plan, or sales (ADR 0010, 3.4). With a session too: the sign-up offers to keep it or switch. */
function PlanCta({ plan, period, className }: { plan: Plan; period: BillingPeriod; className: string }) {
  const content = plan.ctaLabel
  if (plan.cta === 'contact_sales' && plan.contactUrl) {
    return (
      <a href={plan.contactUrl} className={className}>
        {content}
      </a>
    )
  }
  return (
    <Link to={signupPath(plan.key, period)} className={className}>
      {content}
    </Link>
  )
}

/**
 * Precios (ADR 0010, ADR 0068): the plans as tiles that step up, so the bigger plan is literally bigger,
 * then the full comparison. Everything comes from the database (dk_plans).
 */
export function PricingSection() {
  const { data, isLoading, isError, refetch } = usePublicPricing()
  const [period, setPeriod] = useState<BillingPeriod>('monthly')
  const annual = data ? hasAnnualBilling(data.plans) : false

  return (
    <section id="precios" className="scroll-mt-16 px-[var(--l-margin)] pb-[clamp(96px,12vw,180px)]" aria-labelledby="landing-pricing">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[40ch]">
          <h2 id="landing-pricing" data-reveal className="landing-display text-[length:var(--l-size-title)]">
            Un plan para cada etapa de tu negocio
          </h2>
          <p data-reveal style={{ '--i': 1 } as CSSProperties} className="mt-4">
            Creas tu cuenta, configuras tu negocio y pagas en línea con tarjeta, PSE o Nequi. Cambias de plan cuando tu operación crezca.
          </p>
        </div>
        {annual && (
          <div role="radiogroup" aria-label="Facturación" className="inline-flex rounded-full bg-[var(--l-field)] p-1 text-[length:var(--l-size-small)]">
            {(['monthly', 'annual'] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={period === p}
                onClick={() => setPeriod(p)}
                className={clsx('rounded-full px-5 py-2 font-medium transition-colors duration-200', period === p ? 'bg-[var(--l-ink)] text-[var(--l-ground)]' : 'text-[var(--l-soft)] hover:text-[var(--l-ink)]')}
              >
                {p === 'monthly' ? 'Mensual' : 'Anual'}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="mt-12 grid gap-2 lg:grid-cols-3 lg:items-end" aria-busy="true" aria-label="Cargando planes">
          {TILE.map((t, i) => (
            <div key={i} className={clsx('h-[420px] motion-safe:animate-pulse rounded-[var(--l-radius)] bg-[var(--l-field)]', t.height)} />
          ))}
        </div>
      ) : isError || !data ? (
        <div className="mt-12 rounded-[var(--l-radius)] bg-[var(--l-field)] p-8">
          <p>No pudimos cargar los precios.</p>
          <button type="button" onClick={() => void refetch()} className="landing-link mt-3 inline-flex items-center gap-2">
            <RotateCw size={15} aria-hidden /> Reintentar
          </button>
        </div>
      ) : (
        <>
          <div className="mt-12 grid gap-2 lg:grid-cols-3 lg:items-end">
            {data.plans.map((plan, i) => {
              const tile = TILE[Math.min(i, TILE.length - 1)]
              const isAnnual = period === 'annual' && plan.priceYearly !== null
              return (
                <article
                  key={plan.key}
                  aria-label={`Plan ${plan.name}`}
                  data-reveal
                  style={{ '--i': i } as CSSProperties}
                  className={clsx('flex flex-col rounded-[var(--l-radius)] p-7 sm:p-9', tile.field, tile.height)}
                >
                  <h3 className="landing-display text-[length:var(--l-size-title)]">{plan.name}</h3>
                  {plan.badge && <p className={clsx('mt-1 font-semibold', tile.soft)}>{plan.badge}</p>}
                  <p className="mt-4 max-w-[30ch]">{plan.description}</p>
                  <p className={clsx('mt-4 max-w-[36ch] text-[length:var(--l-size-small)] leading-relaxed', tile.soft)}>{plan.highlights.join('. ')}.</p>

                  <div className="mt-auto pt-10">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="landing-display text-[length:var(--l-size-display)] tabular-nums">{formatAmount(isAnnual ? plan.priceYearly! : plan.priceMonthly)}</span>
                      <span className={tile.soft}>
                        {plan.currency}/{isAnnual ? 'año' : 'mes'}
                      </span>
                    </p>
                    <p className={clsx('mt-1 text-[length:var(--l-size-small)]', tile.soft)}>{priceNote(plan, isAnnual)}</p>
                    <PlanCta plan={plan} period={period} className={clsx('landing-button mt-6 w-full', tile.button)} />
                  </div>
                </article>
              )
            })}
          </div>

          <h3 className="landing-display mt-24 text-[length:var(--l-size-title)]">Compara los planes</h3>
          {/* The comparison is the app's own table (the same as in the sign-up), in its light palette. */}
          <div className="theme-light mt-8 text-neutral-50">
            <PlanComparison pricing={data} period={period} />
          </div>
        </>
      )}
    </section>
  )
}
