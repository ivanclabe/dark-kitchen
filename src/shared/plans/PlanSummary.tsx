import { formatPlanPrice, type Plan } from './plans'

/** "Plan seleccionado: Business — $99.900 COP/mes [Cambiar plan]" (ADR 0010, 3.4). */
export function PlanSummary({ plan, onChange }: { plan: Plan; onChange?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-brasa-500/30 bg-brasa-500/5 px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-neutral-400">Plan seleccionado</p>
        <p className="text-sm font-semibold text-neutral-100">
          {plan.name} — {formatPlanPrice(plan)}
        </p>
        {plan.trialDays > 0 && <p className="text-xs text-neutral-500">{plan.trialDays} días gratis para empezar</p>}
      </div>
      {onChange && (
        <button type="button" onClick={onChange} className="shrink-0 text-sm font-medium text-brasa-400 hover:underline">
          Cambiar plan
        </button>
      )}
    </div>
  )
}
