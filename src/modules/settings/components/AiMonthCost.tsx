import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { ErrorState } from '@/shared/ui/ErrorState'
import { Feedback } from '@/shared/ui/Feedback'
import { KpiStrip } from '@/shared/ui/KpiStrip'
import { LoadingState } from '@/shared/ui/LoadingState'
import { typography } from '@/shared/ui/typography'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { fetchAccountAiCost, type AccountAiCost } from '../api'

const usd = (n: number | null | undefined) =>
  n == null ? '—' : n < 0.01 && n > 0 ? '< US$0,01' : `US$${n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const integer = (n: number) => n.toLocaleString('es-CO')

const LIMIT_LABEL: Record<keyof AccountAiCost['limits'], string> = {
  analyses: 'Análisis, facturas y diseño',
  copilot: 'Preguntas a Copilot',
  whatsapp: 'Mensajes de WhatsApp atendidos por IA',
}

/**
 * ADR 0063: what AI cost this month in the account — consultations, tokens, estimated cost and calls avoided,
 * by function — with the budget and every daily limit, so nothing is hidden.
 */
export function AiMonthCost() {
  const { kitchen } = useActiveKitchen()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['account', kitchen.id, 'ai-cost'],
    queryFn: fetchAccountAiCost,
    staleTime: 60_000,
  })
  if (isLoading) return <LoadingState variant="block" />
  if (isError || !data) return <ErrorState error={error} onRetry={() => void refetch()} />

  const { month } = data
  const avoided = data.byFeature.reduce((sum, f) => sum + f.avoided, 0)
  const budgetLabel = !month.enabled
    ? 'Sin presupuesto'
    : `${month.pct.toLocaleString('es-CO', { maximumFractionDigits: 0 })} %`
  const budgetHint = !month.enabled
    ? 'Actívalo en Funciones → Presupuesto de IA'
    : [month.monthlyRuns ? `${integer(month.monthlyRuns)} consultas` : null, month.monthlyUsd ? usd(month.monthlyUsd) : null].filter(Boolean).join(' · ') + ' al mes'

  return (
    <div className="space-y-4">
      {month.exceeded ? (
        <Feedback
          tone="warning"
          title="Llegaste al presupuesto de IA de este mes"
          description="Los análisis automáticos (Cocina, Reponer, Perecederos y Poco movimiento) están en pausa. Copilot, las facturas y el diseñador siguen hasta el tope del plan."
        />
      ) : month.alert ? (
        <Feedback tone="warning" title={`Vas en el ${Math.round(month.pct)} % del presupuesto de IA del mes`} description="Al llegar al 100 % se pausan los análisis automáticos." />
      ) : null}
      <KpiStrip
        columns={4}
        items={[
          { id: 'runs', label: 'Consultas a la IA este mes', value: integer(month.runs), change: null, goodWhen: 'neutral' },
          {
            id: 'cost',
            label: 'Costo estimado del mes',
            value: month.priced ? usd(month.estimatedUsd) : '—',
            change: null,
            goodWhen: 'neutral',
            hint: month.priced ? 'Con los precios de la plataforma' : 'La plataforma no ha fijado el precio de algún modelo',
          },
          { id: 'avoided', label: 'Consultas evitadas', value: integer(avoided), change: null, goodWhen: 'neutral', hint: 'Se reutilizó un análisis con los mismos datos' },
          { id: 'budget', label: 'Presupuesto usado', value: budgetLabel, change: null, goodWhen: 'neutral', hint: budgetHint },
        ]}
      />
      {data.byFeature.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-neutral-800/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500">
                <th className="px-4 py-2.5 font-medium">Función</th>
                <th className="px-3 py-2.5 text-right font-medium">Consultas</th>
                <th className="px-3 py-2.5 text-right font-medium">Evitadas</th>
                <th className="px-3 py-2.5 text-right font-medium">Tokens</th>
                <th className="px-4 py-2.5 text-right font-medium">Costo estimado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {data.byFeature.map((f) => (
                <tr key={f.key}>
                  <td className="px-4 py-2.5 text-neutral-200">{f.label}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-neutral-300">{integer(f.runs)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-neutral-400">{integer(f.avoided)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-neutral-400">{integer(f.inputTokens + f.outputTokens)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-neutral-300">{usd(f.estimatedUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={typography.caption}>Este mes todavía no hay consultas a la IA en esta cuenta.</p>
      )}

      <div>
        <h3 className="text-sm font-medium text-neutral-200">Topes del plan (últimas 24 horas)</h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-3">
          {(Object.keys(LIMIT_LABEL) as (keyof AccountAiCost['limits'])[]).map((k) => {
            const l = data.limits[k]
            const pct = l.perDay > 0 ? Math.min(100, (l.used24h / l.perDay) * 100) : 0
            return (
              <li key={k} className="rounded-xl border border-neutral-800/60 px-3.5 py-3">
                <p className="text-xs text-neutral-400">{LIMIT_LABEL[k]}</p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-neutral-100">
                  {integer(l.used24h)} <span className="font-normal text-neutral-500">de {integer(l.perDay)}</span>
                </p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-neutral-800" aria-hidden>
                  <div className={clsx('h-full rounded-full', pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-amber-400' : 'bg-brasa-500')} style={{ width: `${pct}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
