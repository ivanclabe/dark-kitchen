import { formatPlanPrice, hasAnnualBilling, signupPath, type BillingPeriod } from '@/shared/plans/plans'
import { usePublicPricing } from '@/shared/plans/usePlans'
import clsx from 'clsx'
import { ArrowRight } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col rounded-full bg-[var(--l-field)] p-1 text-[length:var(--l-size-small)]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-full px-3 py-2.5 font-medium transition-colors duration-200',
            value === o.value ? 'bg-[var(--l-ink)] text-white' : 'text-[var(--l-soft)] hover:text-[var(--l-ink)]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * The page closes as it opens: on the dark stage of the order (ADR 0068), with the robot in its corner and the
 * sign-up's first choice already open. The plan and how to pay it are carried into /registro (the same address
 * the plans use); plans that go to sales are not offered here.
 */
export function ClosingSection() {
  const { data } = usePublicPricing()
  const plans = data?.plans.filter((p) => p.selfServe) ?? []
  const [planKey, setPlanKey] = useState<string | null>(null)
  const [period, setPeriod] = useState<BillingPeriod>('monthly')
  const plan = plans.find((p) => p.key === planKey) ?? plans.find((p) => p.badge) ?? plans[0]
  const annual = data ? hasAnnualBilling(plans) : false

  return (
    <section className="mx-3 rounded-[var(--l-radius)] bg-[var(--l-stage)] text-white sm:mx-4" aria-labelledby="landing-closing">
      <div className="grid min-h-[72svh] gap-12 px-6 py-14 sm:px-10 lg:grid-cols-12 lg:gap-6 lg:px-14 lg:py-16">
        <div className="flex flex-col justify-between gap-10 lg:col-span-5">
          {/* The robot keeps a top corner, as on the stage, and says what comes next. */}
          <div data-reveal className="flex items-start gap-2">
            <img src="/robot/robot-happy-lg.webp" width={322} height={288} alt="El robot de Quanela, contento" loading="lazy" className="h-24 w-auto shrink-0 sm:h-36" />
            <p className="landing-thought landing-thought-left">¡Te espero adentro! Primero eliges tu plan; luego tu usuario y tu negocio.</p>
          </div>
          <div>
            <h2 id="landing-closing" data-reveal className="landing-display text-[length:var(--l-size-display)]">
              Tu cocina,
              <br />
              en orden.
            </h2>
            <p data-reveal style={{ '--i': 1 } as CSSProperties} className="mt-6 max-w-[40ch] text-[#e9ddd3]">
              Creas tu cuenta, registras tu negocio y pagas en línea. Sin permanencia: cancelas cuando quieras.
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-center lg:col-span-5 lg:col-start-8">
          {/* The sign-up's first step, as the product shows it. */}
          <div data-ui data-reveal style={{ '--i': 1 } as CSSProperties} className="w-full rounded-[var(--l-radius)] bg-white p-6 text-[var(--l-ink)] sm:p-8">
            <p className="landing-display text-[length:var(--l-size-title)]">Crea tu cuenta</p>
            <p className="mt-1.5 text-[length:var(--l-size-small)] text-[var(--l-soft)]">Elige tu plan; lo puedes cambiar después.</p>
            {plans.length > 1 && (
              <div className="mt-6">
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
            <p className="mt-6 font-semibold tabular-nums">{plan ? formatPlanPrice(plan, period) : ' '}</p>
            <Link to={signupPath(plan?.key ?? null, period)} className="landing-button landing-button-accent mt-4 w-full">
              Continuar <ArrowRight size={18} aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
