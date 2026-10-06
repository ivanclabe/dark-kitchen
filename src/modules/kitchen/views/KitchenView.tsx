import { OperationsFigures } from '@/modules/operations/components/OperationsFigures'
import { OperationsShell } from '@/modules/operations/components/OperationsShell'
import { useOperations } from '@/modules/operations/lib/operationsContext'
import { KITCHEN_SCOPE } from '@/modules/orders/board/boardActions'
import { OrderBoard } from '@/modules/orders/board/OrderBoard'
import { useNewOrderAlert } from '@/modules/orders/hooks/useNewOrderAlert'
import { useSlaSettings } from '@/modules/orders/hooks/useSlaSettings'
import { alertMinutesFor, DEFAULT_SLA_THRESHOLDS, minutesAgoSince, timeTier } from '@/modules/orders/lib/orderVisuals'
import { KITCHEN_STAGES, isKitchenStage } from '@/modules/orders/lib/transitions'
import type { PrepStatus } from '@/modules/orders/types'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import type { MenuItem } from '@/shared/ui/Menu'
import { typography } from '@/shared/ui/typography'
import { kitchenSpeech } from '@/shared/voice/speechQueue'
import { useWakeWordPreference } from '@/shared/voice/wakeWord/preference'
import { wakeWordTuning } from '@/shared/voice/wakeWord/tuning'
import { useWakeWord } from '@/shared/voice/wakeWord/useWakeWord'
import clsx from 'clsx'
import { Bell, ChefHat, Gauge, Kanban, Keyboard, Settings, Volume2, ZoomIn } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { KitchenConfigDrawer, type KitchenConfigTab } from '../components/KitchenConfigDrawer'
import { KitchenInsightLine } from '../components/KitchenInsightLine'
import { KitchenStatusLine } from '../components/KitchenStatusLine'
import { useStallAlerts } from '../hooks/useStallAlerts'
import { useVoiceCommandEngine } from '../voice/useVoiceCommandEngine'
import { VoiceCommandBar } from '../voice/VoiceCommandBar'
import { WakeWordIndicator } from '../voice/WakeWordIndicator'
import { SlaView } from './SlaView'

type KitchenMode = 'tablero' | 'sla'
type Density = 'normal' | 'grande'

const VIEW_PREF_KEY = 'dk-kitchen-view'
const DENSITY_PREF_KEY = 'dk-kitchen-density'

function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    if (stored && (allowed as readonly string[]).includes(stored)) return stored as T
  } catch {
    // localStorage may be unavailable (private mode): default.
  }
  return fallback
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Not critical.
  }
}

/**
 * Centro de operaciones → Cocina (ADR 0020, ADR 0031): the line's screen.
 * The same live orders, only the kitchen stretch (En cola → Preparando →
 * Listo), with the line's tools: time targets (SLA), voice and "Oye
 * Quanela", stalled-dish alerts, a large size for the tablet. Confirming and
 * dispatching are not offered here (KITCHEN_SCOPE).
 */
export function KitchenView() {
  const { can, canUseFeature, feature } = useActiveKitchen()
  const ops = useOperations()
  const canConfigure = can('settings.manage')
  const { data: thresholds = DEFAULT_SLA_THRESHOLDS } = useSlaSettings()

  const [mode, setMode] = useState<KitchenMode>(() => readPref(VIEW_PREF_KEY, ['tablero', 'sla'] as const, 'tablero'))
  const [density, setDensity] = useState<Density>(() => readPref(DENSITY_PREF_KEY, ['normal', 'grande'] as const, 'normal'))
  const [voiceTestOpen, setVoiceTestOpen] = useState(false)
  const [configTab, setConfigTab] = useState<KitchenConfigTab | null>(null)

  const prepOrders = useMemo(() => ops.live?.filter((o) => isKitchenStage(o.status)), [ops.live])

  const { newIds, acknowledge, soundEnabled, toggleSound } = useNewOrderAlert(prepOrders)
  const voice = useVoiceCommandEngine(prepOrders)
  // While the microphone listens, spoken alerts wait (otherwise they would be transcribed).
  const voiceBusy = voice.phase === 'listening' || voice.phase === 'processing'
  const { stalledByOrder } = useStallAlerts({ active: true, paused: voiceBusy, muted: !soundEnabled })
  // Muting sounds and spoken alerts also empties the speech queue at once (ADR 0014).
  useEffect(() => {
    if (!soundEnabled) kitchenSpeech.clear()
  }, [soundEnabled])

  const kpis = useMemo(() => {
    const orders = prepOrders ?? []
    const count = (status: PrepStatus) => orders.filter((o) => o.status === status).length
    const late = orders.filter((o) => timeTier(minutesAgoSince(o.createdAt, ops.now), alertMinutesFor(o.status, thresholds), thresholds.nearThresholdPct) === 'retrasado').length
    return { cola: count('CONFIRMADO'), preparando: count('EN_PREPARACION'), listo: count('LISTO'), late }
  }, [prepOrders, ops.now, thresholds])

  function changeMode(next: KitchenMode) {
    setMode(next)
    writePref(VIEW_PREF_KEY, next)
  }

  function toggleDensity() {
    const next: Density = density === 'normal' ? 'grande' : 'normal'
    setDensity(next)
    writePref(DENSITY_PREF_KEY, next)
  }

  // Voice commands: feature of the account (organization ∧ account ∧ permission) + browser support.
  const voiceCommands = canUseFeature('voice_commands')
  const voiceAvailable = voiceCommands && voice.supported
  // Hands-free (ADR 0016): feature of the account + switched on in this device; one tap pauses it.
  const [handsFree] = useWakeWordPreference()
  const [wakePaused, setWakePaused] = useState(false)
  const wakeWordOn = voiceAvailable && canUseFeature('voice_wake_word') && handsFree
  const wakeWord = useWakeWord({
    active: wakeWordOn && !wakePaused,
    suspended: voiceBusy,
    tuning: wakeWordTuning(feature('voice_wake_word')),
    onDetect: () => void voice.startHandsFree(),
  })

  const menuItems: MenuItem[] = [
    mode === 'tablero'
      ? { label: 'Ver tiempos (SLA)', icon: Gauge, onSelect: () => changeMode('sla') }
      : { label: 'Ver pantalla de cocina', icon: Kanban, onSelect: () => changeMode('tablero') },
    { label: 'Tamaño grande', icon: ZoomIn, checked: density === 'grande', onSelect: toggleDensity },
    { label: 'Sonidos y avisos de voz', icon: Bell, checked: soundEnabled, onSelect: toggleSound },
    ...(voiceAvailable
      ? [
          ...(voice.speechAllowed ? [{ label: 'Respuesta hablada', icon: Volume2, checked: voice.ttsEnabled, onSelect: voice.toggleTts }] : []),
          { label: 'Probar comando de texto', icon: Keyboard, onSelect: () => setVoiceTestOpen(true) },
        ]
      : []),
    { label: 'Configuración de cocina', icon: Settings, onSelect: () => setConfigTab('semanal'), separated: true },
  ]

  return (
    <>
      <OperationsShell
        searchable
        scope={KITCHEN_SCOPE}
        density={density}
        description={<KitchenStatusLine lateCount={kpis.late} canConfigure={canConfigure} onConfigure={() => setConfigTab('semanal')} />}
        actions={
          <>
            {wakeWordOn && <WakeWordIndicator state={wakeWord.state} error={wakeWord.error} paused={wakePaused} onToggle={() => setWakePaused((p) => !p)} />}
            {voiceCommands && <VoiceCommandBar engine={voice} enabled testOpen={voiceTestOpen} onCloseTest={() => setVoiceTestOpen(false)} />}
          </>
        }
        menuItems={menuItems}
        figures={
          <OperationsFigures
            items={[
              { id: 'queue', label: 'En cola', value: kpis.cola },
              { id: 'preparing', label: 'Preparando', value: kpis.preparando },
              { id: 'ready', label: 'Listos', value: kpis.listo },
              { id: 'late', label: 'Atrasados', value: kpis.late, tone: 'warn' },
            ]}
          />
        }
        below={
          <>
            <KitchenInsightLine
              active
              paused={voiceBusy}
              muted={!soundEnabled}
              orderNumberOf={(orderId) => ops.live?.find((o) => o.id === orderId)?.orderNumber}
              onOpenOrder={(orderId) => ops.openDetail({ id: orderId })}
            />
            {mode === 'sla' && (
              <p className={clsx('flex items-center gap-2', typography.small)}>
                <Gauge size={14} className="text-brasa-400" aria-hidden /> Tiempos por pedido (SLA)
                <button type="button" onClick={() => changeMode('tablero')} className="text-brasa-400 underline-offset-4 hover:text-brasa-300 hover:underline">
                  Volver a la pantalla de cocina
                </button>
              </p>
            )}
          </>
        }
      >
        {mode === 'tablero' ? (
          <OrderBoard
            columns={KITCHEN_STAGES}
            tickets={prepOrders}
            isLoading={ops.isLoading}
            now={ops.now}
            newIds={newIds}
            onAcknowledge={acknowledge}
            search={ops.search}
            stalledByOrder={stalledByOrder}
            emptyIcon={ChefHat}
            emptyTitle="Cocina al día"
            emptyDescription="No hay nada por preparar. Los pedidos confirmados aparecen aquí solos."
          />
        ) : (
          <SlaView tickets={prepOrders} now={ops.now} />
        )}
      </OperationsShell>
      {configTab && <KitchenConfigDrawer initialTab={configTab} canEdit={canConfigure} onClose={() => setConfigTab(null)} />}
    </>
  )
}
