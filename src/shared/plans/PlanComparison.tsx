import { FEATURE_CATEGORY_LABEL, type FeatureCategory } from '@/shared/features/features'
import clsx from 'clsx'
import { Check, Minus } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { formatPlanPrice, limitLabel, type BillingPeriod, type PublicPricing } from './plans'

/**
 * Comparativa de planes (ADR 0010): precio, prueba, límites y funciones por
 * plan, todo desde los datos (dk_plans + dk_plan_features + dk_features).
 * En pantallas angostas la tabla se desplaza dentro de su marco.
 */
export function PlanComparison({ pricing, period = 'monthly' }: { pricing: PublicPricing; period?: BillingPeriod }) {
  const { plans, features } = pricing
  const categories = (['ai', 'voice', 'general'] as FeatureCategory[]).filter((c) => features.some((f) => f.category === c))

  const row = (label: ReactNode, cells: ReactNode[], key: string) => (
    <tr key={key} className="border-t border-neutral-800/60">
      <th scope="row" className="sticky left-0 bg-neutral-950 py-3 pr-4 pl-4 text-left text-sm font-normal text-neutral-300">
        {label}
      </th>
      {cells.map((cell, i) => (
        <td key={plans[i].key} className="px-4 py-3 text-center text-sm text-neutral-200">
          {cell}
        </td>
      ))}
    </tr>
  )
  const yes = <Check size={17} className="mx-auto text-brasa-400" aria-label="Incluido" />
  const no = <Minus size={17} className="mx-auto text-neutral-600" aria-label="No incluido" />

  return (
    <div className="overflow-x-auto rounded-2xl border border-neutral-800/60">
      <table className="w-full min-w-[40rem] border-collapse">
        <caption className="sr-only">Comparación de planes</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 bg-neutral-950 px-4 py-4 text-left text-xs font-medium tracking-wide text-neutral-500 uppercase">
              <span className="sr-only">Característica</span>
            </th>
            {plans.map((p) => (
              <th key={p.key} scope="col" className={clsx('px-4 py-4 text-center text-sm font-semibold', p.badge ? 'text-brasa-300' : 'text-neutral-100')}>
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row('Precio', plans.map((p) => formatPlanPrice(p, period)), 'price')}
          {row('Prueba gratis', plans.map((p) => (p.trialDays > 0 ? `${p.trialDays} días` : no)), 'trial')}
          {row('Cuentas (establecimientos)', plans.map((p) => limitLabel(p.limits.accounts, 'cuenta', 'cuentas')), 'accounts')}
          {row('Usuarios', plans.map((p) => limitLabel(p.limits.users, 'usuario', 'usuarios')), 'users')}
          {row('Pedidos, cocina, despacho, menús, inventario, clientes y reportes', plans.map(() => yes), 'modules')}
          {categories.map((category) => (
            <Fragment key={category}>
              <tr className="border-t border-neutral-800/60">
                <th colSpan={plans.length + 1} scope="colgroup" className="sticky left-0 bg-neutral-900/40 px-4 py-2 text-left text-xs font-medium tracking-wide text-neutral-500 uppercase">
                  {FEATURE_CATEGORY_LABEL[category]}
                </th>
              </tr>
              {features
                .filter((f) => f.category === category)
                .map((f) => row(f.label, plans.map((p) => (p.features.includes(f.key) ? yes : no)), f.key))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
