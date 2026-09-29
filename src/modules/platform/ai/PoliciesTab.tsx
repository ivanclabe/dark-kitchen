import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/FormField'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDateTime } from '@/shared/utils/format'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { PLATFORM_AI_KEY, setPlanAiLimits, type PlatformAiOverview, type PlatformPlanLimits } from './api'

function PlanRow({ plan }: { plan: PlatformPlanLimits }) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const [runs, setRuns] = useState(String(plan.aiRunsPerDay ?? 50))
  const [interval, setIntervalValue] = useState(plan.aiMinIntervalSeconds === null ? '' : String(plan.aiMinIntervalSeconds))
  const runsNumber = Number(runs)
  const intervalNumber = interval.trim() === '' ? null : Number(interval)
  const invalid =
    !Number.isInteger(runsNumber) || runsNumber < 0 || runsNumber > 100_000 || (intervalNumber !== null && (!Number.isInteger(intervalNumber) || intervalNumber < 30 || intervalNumber > 86_400))
  const dirty = runsNumber !== (plan.aiRunsPerDay ?? 50) || intervalNumber !== plan.aiMinIntervalSeconds

  const save = useMutation({
    mutationFn: () => setPlanAiLimits(plan.key, runsNumber, intervalNumber),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PLATFORM_AI_KEY })
      show(`Límites de ${plan.name} guardados.`)
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudieron guardar los límites'), 'error'),
  })

  return (
    <li className="grid items-end gap-3 py-3 sm:grid-cols-[1fr_10rem_12rem_auto]">
      <div className="min-w-0">
        <p className="font-medium text-neutral-100">{plan.name}</p>
        <p className="text-xs text-neutral-500">{plan.status === 'public' ? 'Público' : plan.status}</p>
      </div>
      <div>
        <label htmlFor={`runs-${plan.key}`} className="text-xs text-neutral-400">
          Análisis por cuenta (24 h)
        </label>
        <Input id={`runs-${plan.key}`} type="number" min={0} value={runs} onChange={(e) => setRuns(e.target.value)} className="!mt-1" />
      </div>
      <div>
        <label htmlFor={`interval-${plan.key}`} className="text-xs text-neutral-400">
          Intervalo mínimo (s)
        </label>
        <Input id={`interval-${plan.key}`} type="number" min={30} value={interval} placeholder="120" onChange={(e) => setIntervalValue(e.target.value)} className="!mt-1" />
      </div>
      <Button size="sm" variant="primary" loading={save.isPending} disabled={invalid || !dirty} onClick={() => save.mutate()}>
        Guardar
      </Button>
    </li>
  )
}

/** Limits per plan and the log of platform AI changes (ADR 0014, 6). */
export function PoliciesTab({ overview }: { overview: PlatformAiOverview }) {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className={typography.h3}>Límites de IA por plan</h2>
        <p className={typography.caption}>Máximo de análisis de IA por cuenta en 24 horas y espera mínima entre análisis de la misma función. Cada función puede tener su propio intervalo (pestaña Funciones).</p>
        <ul className="divide-y divide-neutral-800/60 rounded-2xl border border-neutral-800/60 bg-neutral-900/40 px-4">
          {overview.plans.map((plan) => (
            <PlanRow key={plan.key} plan={plan} />
          ))}
        </ul>
        <p className={typography.caption}>Los rangos de cada parámetro (p. ej. «Analizar cada» de 5 min a 7 días) forman parte del catálogo de funciones y se validan en la base.</p>
      </section>

      <section className="space-y-2">
        <h2 className={typography.h3}>Cambios recientes en la plataforma</h2>
        {overview.recentChanges.length === 0 ? (
          <p className={typography.caption}>Sin cambios todavía.</p>
        ) : (
          <ul className="divide-y divide-neutral-800/60 rounded-2xl border border-neutral-800/60 bg-neutral-900/40 px-4">
            {overview.recentChanges.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm">
                <span className="min-w-0 text-neutral-200">
                  <span className="font-medium">{c.actor ?? 'Sistema'}</span> · {c.summary ?? c.eventType}
                </span>
                <time className="shrink-0 text-xs text-neutral-500" dateTime={c.createdAt}>
                  {formatDateTime(c.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
