import { PriorityChip } from '@/modules/ai/components/InsightParts'
import { useAiFeature, useAiInsight } from '@/modules/ai/hooks/useAi'
import { ACTION_LABEL } from '@/modules/ai/lib/catalog'
import clsx from 'clsx'
import { ChevronDown, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { speak } from '../voice/speak'

const DISMISSED_KEY = 'dk-kitchen-insight-dismissed'

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY)
  } catch {
    return null
  }
}

/**
 * Sugerencias de Cocina en vivo (Configuración → IA). Una sola línea bajo las
 * cifras con la sugerencia principal; se despliega para ver el resto. Si no
 * hay nada que sugerir, la IA no está conectada o falla, no ocupa espacio:
 * el tablero y las alertas funcionan igual.
 */
export function KitchenInsightLine({
  active,
  paused,
  muted,
  orderNumberOf,
  onOpenOrder,
}: {
  active: boolean
  paused: boolean
  muted: boolean
  orderNumberOf: (orderId: string) => number | undefined
  onOpenOrder: (orderId: string) => void
}) {
  const feature = useAiFeature('kitchen_insights')
  const enabled = active && feature.enabled
  const { data: result } = useAiInsight('kitchen_insights', enabled, { live: true })
  const [dismissedId, setDismissedId] = useState<string | null>(readDismissed)
  const [expanded, setExpanded] = useState(false)

  const insight = result?.kind === 'ok' && result.insight.status === 'ok' && result.insight.items.length > 0 ? result.insight : null
  const visible = enabled && insight !== null && insight.id !== dismissedId

  // Lee en voz alta la sugerencia principal una vez por análisis nuevo, si así está configurado.
  const spokenId = useRef<string | null>(null)
  useEffect(() => {
    if (!visible || !insight || feature.settings.voice !== true || paused || muted || spokenId.current === insight.id) return
    spokenId.current = insight.id
    speak(`Sugerencia: ${insight.items[0].title}.`)
  }, [visible, insight, feature.settings.voice, paused, muted])

  if (!visible || !insight) return null

  function dismiss() {
    if (!insight) return
    setDismissedId(insight.id)
    try {
      localStorage.setItem(DISMISSED_KEY, insight.id)
    } catch {
      // No crítico: solo se vuelve a mostrar al recargar.
    }
  }

  const [top, ...rest] = insight.items
  const shown = expanded ? insight.items : [top]

  return (
    <div role="status" className="rounded-xl border border-brasa-500/20 bg-brasa-500/[0.05] px-3 py-2 text-sm">
      <div className="flex items-start gap-2">
        <Sparkles size={14} className="mt-0.5 shrink-0 text-brasa-400" aria-hidden />
        <ul className="min-w-0 flex-1 space-y-1.5">
          {shown.map((item, i) => {
            const orderNumber = item.refId ? orderNumberOf(item.refId) : undefined
            return (
              <li key={`${item.refId ?? 'general'}-${i}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <PriorityChip priority={item.priority} />
                <span className="font-medium text-neutral-100">{item.title}</span>
                <span className={clsx('text-xs text-neutral-400', !expanded && 'line-clamp-1')}>{item.explanation}</span>
                {item.refId && orderNumber !== undefined ? (
                  <button type="button" onClick={() => onOpenOrder(item.refId as string)} className="text-xs text-brasa-400 hover:text-brasa-300 hover:underline underline-offset-4">
                    {ACTION_LABEL[item.action] ?? 'Ver'} · #{orderNumber}
                  </button>
                ) : (
                  <span className="text-[11px] text-brasa-300/80">{ACTION_LABEL[item.action]}</span>
                )}
              </li>
            )
          })}
        </ul>
        {rest.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
          >
            {expanded ? 'Menos' : `${rest.length} más`}
            <ChevronDown size={12} className={clsx('transition-transform', expanded && 'rotate-180')} aria-hidden />
          </button>
        )}
        <button type="button" onClick={dismiss} aria-label="Descartar sugerencia" className="shrink-0 rounded-full p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200">
          <X size={13} />
        </button>
      </div>
    </div>
  )
}
