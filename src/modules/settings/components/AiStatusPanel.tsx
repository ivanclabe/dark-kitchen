import { useAiConnectionStatus } from '@/modules/ai/hooks/useAi'
import { typography } from '@/shared/ui/typography'
import clsx from 'clsx'
import { CheckCircle2, KeyRound, ShieldCheck, type LucideIcon } from 'lucide-react'

/**
 * State of AI in the active account (ADR 0018, ADR 0026): whether the platform
 * connected it and the principle the features follow. The plan lives in
 * Facturación; models, providers and costs are the platform's.
 */
export function AiStatusPanel() {
  const connection = useAiConnectionStatus()
  const configured = connection.data?.configured === true
  return (
    <div className="grid gap-3 sm:grid-cols-2">
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
    </div>
  )
}

function StatusCard({ icon: Icon, title, body, tone = 'neutral' }: { icon: LucideIcon; title: string; body: string; tone?: 'ok' | 'warn' | 'neutral' }) {
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
