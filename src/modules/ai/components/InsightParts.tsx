import { Tooltip } from '@/shared/ui/Tooltip'
import clsx from 'clsx'
import { KeyRound, Loader2, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react'
import { useRefreshAiInsight } from '../hooks/useAi'
import { ACTION_LABEL } from '../lib/catalog'
import type { ReactNode } from 'react'
import type { AiInsightFeatureKey, InsightItem, InsightPriority, InsightResult } from '../types'

const PRIORITY_STYLE: Record<InsightPriority, string> = {
  alta: 'bg-red-500/15 text-red-300',
  media: 'bg-amber-500/15 text-amber-300',
  baja: 'bg-neutral-800 text-neutral-400',
}

export function PriorityChip({ priority }: { priority: InsightPriority }) {
  return <span className={clsx('rounded px-1.5 py-px text-[10px] font-semibold uppercase', PRIORITY_STYLE[priority])}>{priority}</span>
}

function minutesAgo(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`
}

/**
 * Cabecera de IA de una sección: resumen del modelo y su estado (cargando,
 * sin conexión, error, fecha), con botón para volver a analizar. Si la IA no
 * está disponible lo dice sin tapar las cifras calculadas por el sistema.
 */
export function InsightSummary({ feature, result, isLoading }: { feature: AiInsightFeatureKey; result: InsightResult | undefined; isLoading: boolean }) {
  const refresh = useRefreshAiInsight(feature)
  const busy = isLoading || refresh.isPending

  let body: ReactNode
  if (busy) body = <span className="inline-flex items-center gap-1.5 text-neutral-400"><Loader2 size={12} className="animate-spin" /> Analizando con IA…</span>
  else if (!result) body = null
  else if (result.kind === 'not_configured')
    body = <span className="inline-flex items-center gap-1.5 text-neutral-500"><KeyRound size={12} /> IA no conectada: se muestran solo los datos calculados.</span>
  else if (result.kind === 'error')
    body = <span className="inline-flex items-center gap-1.5 text-amber-300"><TriangleAlert size={12} /> No se pudo analizar con IA. Los datos siguen siendo válidos.</span>
  else if (result.kind === 'disabled') body = null
  else if (result.insight.status === 'empty') body = null
  else
    body = (
      <span className="text-neutral-300">
        {result.insight.summary}
        <span className="ml-1.5 text-[11px] text-neutral-600">· IA {minutesAgo(result.insight.createdAt)}</span>
      </span>
    )

  if (!body) return null
  return (
    <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-brasa-500/20 bg-brasa-500/[0.05] px-3 py-2 text-xs">
      <p className="flex min-w-0 items-start gap-2">
        <Sparkles size={13} className="mt-px shrink-0 text-brasa-400" aria-hidden />
        {body}
      </p>
      {!busy && result?.kind !== 'not_configured' && (
        <Tooltip label="Volver a analizar" side="top">
          <button type="button" onClick={() => refresh.mutate()} aria-label="Volver a analizar" className="shrink-0 rounded-full p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200">
            <RefreshCw size={12} />
          </button>
        </Tooltip>
      )}
    </div>
  )
}

/** Explicación de la IA para un insumo o pedido concreto. Solo <span>: puede ir dentro de un botón. */
export function InsightExplanation({ item, className }: { item: InsightItem; className?: string }) {
  return (
    <span className={clsx('mt-1 block space-y-0.5 text-xs', className)}>
      <span className="flex flex-wrap items-center gap-1.5 text-neutral-200">
        <PriorityChip priority={item.priority} />
        <span className="font-medium">{item.title}</span>
      </span>
      <span className="block text-neutral-400">{item.explanation}</span>
      <span className="block text-[11px] text-brasa-300/90">Sugerencia: {ACTION_LABEL[item.action] ?? item.action}</span>
    </span>
  )
}
