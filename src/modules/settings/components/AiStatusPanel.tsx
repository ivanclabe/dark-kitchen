import { useAiConnectionStatus } from '@/modules/ai/hooks/useAi'
import { useAccountFeatureMatrix } from '@/modules/organization/hooks/useAccountFeatures'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { typography } from '@/shared/ui/typography'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { CheckCircle2, Gauge, KeyRound, ShieldCheck } from 'lucide-react'
import { fetchAccountAiUsage } from '../api'

/**
 * Read-only state of AI in the active account (ADR 0018, ADR 0024): whether
 * the platform connected it, the principle the features follow, and the plan
 * limits. Models, providers and costs are managed by the platform.
 */
export function AiStatusPanel() {
  const { kitchen } = useActiveKitchen()
  const connection = useAiConnectionStatus()
  const matrix = useAccountFeatureMatrix(kitchen.id)
  const usage = useQuery({ queryKey: ['account', kitchen.id, 'ai-usage'], queryFn: () => fetchAccountAiUsage() })
  const configured = connection.data?.configured === true
  const account = matrix.data?.accounts.find((a) => a.id === kitchen.id)
  const active = matrix.data?.features.filter((f) => f.category === 'ai' && f.available && account?.enabled[f.key]).length ?? 0
  const included = matrix.data?.features.filter((f) => f.category === 'ai' && f.includedInPlan).length ?? 0

  return (
    <div className="grid max-w-4xl gap-3 lg:grid-cols-2">
      <StatusCard
        icon={configured ? CheckCircle2 : KeyRound}
        tone={configured ? 'ok' : 'warn'}
        title={connection.isLoading ? 'Verificando conexión…' : configured ? 'IA conectada' : connection.isError ? 'No se pudo verificar la conexión' : 'IA no conectada'}
        body={
          configured
            ? 'Las funciones con IA usan el modelo que define la plataforma.'
            : 'La plataforma todavía no conectó la IA. Las alertas y listas que calcula el sistema funcionan igual; solo faltan las explicaciones de la IA.'
        }
      />
      <StatusCard
        icon={ShieldCheck}
        title="La IA recomienda, tú decides"
        body="Las cifras las calcula el sistema; la IA solo prioriza y explica. No crea compras ni cambia pedidos: cada acción es un botón que alguien pulsa."
      />
      <StatusCard
        icon={Gauge}
        title={matrix.data?.plan ? `Plan ${matrix.data.plan.name}` : 'Plan'}
        body={
          usage.data
            ? `Hasta ${usage.data.dailyLimit} análisis de IA al día en esta cuenta. Tiene activas ${active} de ${included} funciones de IA que incluye tu plan.`
            : 'Límites del plan para los análisis de IA.'
        }
      />
    </div>
  )
}

function StatusCard({ icon: Icon, title, body, tone = 'neutral' }: { icon: typeof Gauge; title: string; body: string; tone?: 'ok' | 'warn' | 'neutral' }) {
  return (
    <div
      className={clsx(
        'flex items-start gap-3 rounded-2xl border p-4',
        tone === 'ok' ? 'border-emerald-500/30 bg-emerald-500/5' : tone === 'warn' ? 'border-amber-500/30 bg-amber-500/5' : 'border-neutral-800/60 bg-neutral-900/60',
      )}
    >
      <Icon size={18} className={clsx('mt-0.5 shrink-0', tone === 'ok' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : 'text-neutral-400')} aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="font-medium text-neutral-100">{title}</p>
        <p className={clsx('mt-0.5', typography.caption)}>{body}</p>
      </div>
    </div>
  )
}
