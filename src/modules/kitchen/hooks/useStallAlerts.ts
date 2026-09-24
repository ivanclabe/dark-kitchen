import { useAiFeature, useKitchenSignals } from '@/modules/ai/hooks/useAi'
import { numberSetting } from '@/modules/ai/lib/catalog'
import { currentStalls, dueStallAnnouncement, type StallAlert } from '@/modules/ai/lib/stallAlerts'
import { useEffect, useMemo, useRef } from 'react'
import { speak } from '../voice/speak'

/**
 * Alertas de pedidos y platos detenidos (Configuración → IA → Alertas de
 * pedidos detenidos). Regla fija, sin modelo: lee dk_kitchen_signals cada
 * 30 s y avisa por voz lo nuevo, repitiendo cada `repeat_min`.
 *
 * `paused` (el micrófono está escuchando) aplaza la voz: si hablara, el
 * reconocimiento de voz se transcribiría a sí mismo. `muted` es el silencio
 * del equipo (menú ⋯ → Sonidos).
 */
export function useStallAlerts({ active, paused, muted }: { active: boolean; paused: boolean; muted: boolean }) {
  const feature = useAiFeature('kitchen_stall_alerts')
  const enabled = active && feature.enabled
  const dishStallMin = numberSetting(feature.settings, 'dish_stall_min', 12)
  const repeatMin = numberSetting(feature.settings, 'repeat_min', 5)
  const voice = feature.settings.voice === true

  const { data: signals } = useKitchenSignals(enabled, dishStallMin)
  const stalls = useMemo(() => (enabled && signals ? currentStalls(signals) : []), [enabled, signals])

  const lastAnnounced = useRef(new Map<string, number>())
  useEffect(() => {
    if (!enabled || !voice || paused || muted) return
    const { text, next } = dueStallAnnouncement(stalls, lastAnnounced.current, Date.now(), repeatMin)
    lastAnnounced.current = next
    if (text) speak(text)
  }, [stalls, enabled, voice, paused, muted, repeatMin])

  /** Etiquetas cortas por pedido, para marcar la tarjeta en el tablero. */
  const stalledByOrder = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const s of stalls as StallAlert[]) map.set(s.orderId, [...(map.get(s.orderId) ?? []), s.short])
    return map
  }, [stalls])

  return { stalledByOrder }
}
