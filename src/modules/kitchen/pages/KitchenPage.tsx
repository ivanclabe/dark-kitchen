import { allows, BoardActionsContext, KITCHEN_SCOPE, type BoardActions } from '@/modules/orders/board/boardActions'
import { CancelOrderDialog } from '@/modules/orders/board/BoardDialogs'
import { OrderBoard } from '@/modules/orders/board/OrderBoard'
import { OrderDetailDrawer } from '@/modules/orders/components/OrderDetailDrawer'
import { useNewOrderAlert } from '@/modules/orders/hooks/useNewOrderAlert'
import { useLiveOrders } from '@/modules/orders/hooks/useOrders'
import { useSlaSettings } from '@/modules/orders/hooks/useSlaSettings'
import { alertMinutesFor, DEFAULT_SLA_THRESHOLDS, minutesAgoSince, timeTier } from '@/modules/orders/lib/orderVisuals'
import type { Order, PrepStatus } from '@/modules/orders/types'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { KitchenLink } from '@/shared/kitchen/KitchenLink'
import { useNow } from '@/shared/hooks/useNow'
import { IconButton } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/FormField'
import { Menu, type MenuItem } from '@/shared/ui/Menu'
import { typography } from '@/shared/ui/typography'
import { kitchenSpeech } from '@/shared/voice/speechQueue'
import { useWakeWordPreference } from '@/shared/voice/wakeWord/preference'
import { wakeWordTuning } from '@/shared/voice/wakeWord/tuning'
import { useWakeWord } from '@/shared/voice/wakeWord/useWakeWord'
import clsx from 'clsx'
import { Bell, ChefHat, ClipboardList, Gauge, Kanban, Keyboard, MoreHorizontal, Search, Settings, Volume2, X, ZoomIn } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { KitchenConfigDrawer, type KitchenConfigTab } from '../components/KitchenConfigDrawer'
import { KitchenInsightLine } from '../components/KitchenInsightLine'
import { KitchenStatusLine } from '../components/KitchenStatusLine'
import { useStallAlerts } from '../hooks/useStallAlerts'
import { SlaView } from '../views/SlaView'
import { useVoiceCommandEngine } from '../voice/useVoiceCommandEngine'
import { VoiceCommandBar } from '../voice/VoiceCommandBar'
import { WakeWordIndicator } from '../voice/WakeWordIndicator'

type KitchenView = 'tablero' | 'sla'
type Density = 'normal' | 'grande'

const VIEW_PREF_KEY = 'dk-kitchen-view'
const DENSITY_PREF_KEY = 'dk-kitchen-density'

/** Cocina's stretch of the order: what the line prepares. */
const PREP_COLUMNS: PrepStatus[] = ['CONFIRMADO', 'EN_PREPARACION', 'LISTO']
const PREP = new Set<string>(PREP_COLUMNS)

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

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <div className="min-w-0 rounded-xl border border-neutral-800/60 bg-neutral-900/60 px-3.5 py-2.5">
      <p className={clsx('text-xl leading-none font-semibold tabular-nums', tone === 'warn' && value > 0 ? 'text-red-400' : 'text-neutral-50')}>{value}</p>
      <p className="mt-1.5 truncate text-xs text-neutral-500">{label}</p>
    </div>
  )
}

/**
 * Cocina — a specialised view of the orders (ADR 0020): the line's screen.
 * The same live orders as Pedidos, only the kitchen stretch (En cola →
 * Preparando → Listo), with the line's tools: time targets (SLA), voice and
 * "Oye Quanela", stalled-dish alerts, a large size for the tablet. Creating,
 * confirming, dispatching and the order history belong to Pedidos.
 */
export function KitchenPage() {
  const { can, canUseFeature, feature } = useActiveKitchen()
  const canConfigure = can('settings.manage')
  const [searchParams, setSearchParams] = useSearchParams()
  // ?order=id opens the detail (the old ?pedido=id links too).
  const detailOrderId = searchParams.get('order') ?? searchParams.get('pedido')

  const { data: live, isLoading } = useLiveOrders()
  const { data: thresholds = DEFAULT_SLA_THRESHOLDS } = useSlaSettings()
  const now = useNow()

  const [view, setView] = useState<KitchenView>(() => readPref(VIEW_PREF_KEY, ['tablero', 'sla'] as const, 'tablero'))
  const [density, setDensity] = useState<Density>(() => readPref(DENSITY_PREF_KEY, ['normal', 'grande'] as const, 'normal'))
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [voiceTestOpen, setVoiceTestOpen] = useState(false)
  const [configTab, setConfigTab] = useState<KitchenConfigTab | null>(null)
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null)

  const prepOrders = useMemo(
    () =>
      live
        ?.filter((o) => PREP.has(o.status))
        .sort((a, b) => b.priority - a.priority || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [live],
  )

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
    const late = orders.filter((o) => timeTier(minutesAgoSince(o.createdAt, now), alertMinutesFor(o.status, thresholds), thresholds.nearThresholdPct) === 'retrasado').length
    return { cola: count('CONFIRMADO'), preparando: count('EN_PREPARACION'), listo: count('LISTO'), late }
  }, [prepOrders, now, thresholds])

  const setDetailOrder = useCallback(
    (orderId: string | null) =>
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('pedido')
        if (orderId) next.set('order', orderId)
        else next.delete('order')
        return next
      }),
    [setSearchParams],
  )

  const boardActions = useMemo<BoardActions>(
    () => ({
      can,
      density,
      scope: KITCHEN_SCOPE,
      openDetail: (order) => setDetailOrder(order.id),
      // Not offered in Cocina (KITCHEN_SCOPE): confirming and dispatching are done in Pedidos.
      requestConfirm: () => {},
      requestDispatch: () => {},
      requestCancel: setCancelOrder,
    }),
    [can, density, setDetailOrder],
  )

  function changeView(next: KitchenView) {
    setView(next)
    writePref(VIEW_PREF_KEY, next)
  }

  function toggleDensity() {
    const next: Density = density === 'normal' ? 'grande' : 'normal'
    setDensity(next)
    writePref(DENSITY_PREF_KEY, next)
  }

  function closeSearch() {
    setSearch('')
    setSearchOpen(false)
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
    view === 'tablero'
      ? { label: 'Ver tiempos (SLA)', icon: Gauge, onSelect: () => changeView('sla') }
      : { label: 'Ver pantalla de cocina', icon: Kanban, onSelect: () => changeView('tablero') },
    { label: 'Tamaño grande', icon: ZoomIn, checked: density === 'grande', onSelect: toggleDensity },
    { label: 'Sonidos y avisos de voz', icon: Bell, checked: soundEnabled, onSelect: toggleSound },
    ...(voiceAvailable
      ? [
          ...(voice.speechAllowed ? [{ label: 'Respuesta hablada', icon: Volume2, checked: voice.ttsEnabled, onSelect: voice.toggleTts }] : []),
          { label: 'Probar comando de texto', icon: Keyboard, onSelect: () => setVoiceTestOpen(true) },
        ]
      : []),
    { label: 'Configuración', icon: Settings, onSelect: () => setConfigTab('semanal'), separated: true },
  ]

  return (
    <BoardActionsContext.Provider value={boardActions}>
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="shrink-0 space-y-4">
          <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <h1 className={typography.h1}>Cocina</h1>
              <KitchenStatusLine lateCount={kpis.late} canConfigure={canConfigure} onConfigure={() => setConfigTab('semanal')} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {searchOpen ? (
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-500" aria-hidden />
                  <Input
                    type="search"
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && closeSearch()}
                    placeholder="# pedido o cliente"
                    aria-label="Buscar pedido"
                    className="!mt-0 h-10 w-52 rounded-full !py-0 pr-8 pl-8"
                  />
                  <button type="button" onClick={closeSearch} aria-label="Cerrar búsqueda" className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-neutral-500 hover:text-neutral-200">
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <IconButton icon={Search} aria-label="Buscar pedido" onClick={() => setSearchOpen(true)} />
              )}

              {wakeWordOn && <WakeWordIndicator state={wakeWord.state} error={wakeWord.error} paused={wakePaused} onToggle={() => setWakePaused((p) => !p)} />}

              {voiceCommands && <VoiceCommandBar engine={voice} enabled testOpen={voiceTestOpen} onCloseTest={() => setVoiceTestOpen(false)} />}

              {can('orders.view') && (
                <KitchenLink
                  to="/orders"
                  className="inline-flex h-10 items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900 px-3.5 text-sm text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
                  title="Crear, confirmar y despachar pedidos"
                >
                  <ClipboardList size={15} aria-hidden /> Pedidos
                </KitchenLink>
              )}

              <Menu
                items={menuItems}
                trigger={(props) => (
                  <button
                    type="button"
                    {...props}
                    aria-label="Más opciones"
                    title="Más opciones"
                    className="inline-flex size-10 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900 text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500"
                  >
                    <MoreHorizontal size={16} aria-hidden />
                  </button>
                )}
              />
            </div>
          </header>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi label="En cola" value={kpis.cola} />
            <Kpi label="Preparando" value={kpis.preparando} />
            <Kpi label="Listos" value={kpis.listo} />
            <Kpi label="Atrasados" value={kpis.late} tone="warn" />
          </div>

          <KitchenInsightLine
            active
            paused={voiceBusy}
            muted={!soundEnabled}
            orderNumberOf={(orderId) => live?.find((o) => o.id === orderId)?.orderNumber}
            onOpenOrder={setDetailOrder}
          />

          {view === 'sla' && (
            <p className={clsx('flex items-center gap-2', typography.small)}>
              <Gauge size={14} className="text-brasa-400" aria-hidden /> Tiempos por pedido (SLA)
              <button type="button" onClick={() => changeView('tablero')} className="text-brasa-400 underline-offset-4 hover:text-brasa-300 hover:underline">
                Volver a la pantalla de cocina
              </button>
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {view === 'tablero' ? (
            <OrderBoard
              columns={PREP_COLUMNS}
              tickets={prepOrders}
              isLoading={isLoading}
              now={now}
              newIds={newIds}
              onAcknowledge={acknowledge}
              search={search}
              stalledByOrder={stalledByOrder}
              emptyIcon={ChefHat}
              emptyTitle="Cocina al día"
              emptyDescription="No hay nada por preparar. Los pedidos confirmados aparecen aquí solos."
            />
          ) : (
            <SlaView tickets={prepOrders} now={now} />
          )}
        </div>
      </div>

      {configTab && <KitchenConfigDrawer initialTab={configTab} canEdit={canConfigure} onClose={() => setConfigTab(null)} />}
      <OrderDetailDrawer orderId={detailOrderId} onClose={() => setDetailOrder(null)} />
      {cancelOrder && allows(boardActions, 'cancel') && <CancelOrderDialog ticket={cancelOrder} onClose={() => setCancelOrder(null)} />}
    </BoardActionsContext.Provider>
  )
}
