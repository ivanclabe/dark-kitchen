import { formatPlanPrice, hasAnnualBilling, signupPath, type BillingPeriod } from '@/shared/plans/plans'
import { usePublicPricing } from '@/shared/plans/usePlans'
import clsx from 'clsx'
import { ArrowRight } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col rounded-full bg-neutral-900 p-1 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx('rounded-full px-3 py-2 font-medium transition-colors duration-200', value === o.value ? 'bg-neutral-100 text-neutral-950' : 'text-neutral-400 hover:text-neutral-200')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * The page ends with the sign-up's first choice already open: the plan and how to pay it, carried into
 * /registro (the same address the plans use). Plans that go to sales are not offered here.
 */
export function ClosingSection() {
  const { data } = usePublicPricing()
  const plans = data?.plans.filter((p) => p.selfServe) ?? []
  const [planKey, setPlanKey] = useState<string | null>(null)
  const [period, setPeriod] = useState<BillingPeriod>('monthly')
  const plan = plans.find((p) => p.key === planKey) ?? plans.find((p) => p.badge) ?? plans[0]
  const annual = data ? hasAnnualBilling(plans) : false

  return (
    <section className="theme-light grid min-h-[90svh] gap-12 bg-[var(--l-accent)] px-[var(--l-margin)] py-16 text-white lg:grid-cols-12 lg:gap-6 lg:py-20" aria-labelledby="landing-closing">
      <div className="flex flex-col justify-end lg:col-span-5">
        <img src="/robot/robot-happy-lg.webp" width={314} height={288} alt="El robot de Quanela, contento" loading="lazy" data-reveal className="mb-8 h-32 w-auto self-start sm:h-40" />
        <h2 id="landing-closing" data-reveal className="landing-display text-[length:var(--l-size-display)]">
          Tu cocina,
          <br />
          en orden.
        </h2>
        <p data-reveal style={{ '--i': 1 } as CSSProperties} className="mt-6 max-w-[40ch]">
          Creas tu cuenta, registras tu negocio y pagas en línea. Sin permanencia: cancelas cuando quieras.
        </p>
      </div>

      <div className="flex items-center lg:col-span-5 lg:col-start-7">
        <div data-ui data-reveal className="w-full max-w-[440px] rounded-2xl bg-neutral-950 p-6 text-neutral-50 shadow-float sm:p-7">
          <p className="text-lg font-semibold">Crea tu cuenta</p>
          <p className="mt-1 text-sm text-neutral-400">Elige tu plan; lo puedes cambiar después.</p>
          {plans.length > 1 && (
            <div className="mt-5">
              <Segmented label="Plan" value={plan?.key ?? ''} options={plans.map((p) => ({ value: p.key, label: p.name }))} onChange={setPlanKey} />
            </div>
          )}
          {annual && (
            <div className="mt-2">
              <Segmented
                label="Facturación"
                value={period}
                options={[
                  { value: 'monthly', label: 'Mensual' },
                  { value: 'annual', label: 'Anual' },
                ]}
                onChange={setPeriod}
              />
            </div>
          )}
          <p className="mt-5 text-sm text-neutral-300 tabular-nums">{plan ? formatPlanPrice(plan, period) : ' '}</p>
          <Link
            to={signupPath(plan?.key ?? null, period)}
            className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-base font-semibold text-on-primary transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.97]"
          >
            Continuar <ArrowRight size={18} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  )
}
