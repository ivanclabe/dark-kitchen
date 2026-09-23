import { useDashboardSummary } from '@/modules/dashboard/hooks/useDashboard'
import { useAuth } from '@/shared/hooks/useAuth'
import { useNow } from '@/shared/hooks/useNow'
import { canAccessModule } from '@/shared/rbac/roles'
import { Button, IconButton } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/FormField'
import { Menu, type MenuItem } from '@/shared/ui/Menu'
import { Tooltip } from '@/shared/ui/Tooltip'
import { typography } from '@/shared/ui/typography'
import { formatDateLong, formatMoney, toDateInput } from '@/shared/utils/format'
import clsx from 'clsx'
import { Bell, Bike, CalendarClock, Gauge, History, Kanban, Keyboard, MoreHorizontal, Plus, Search, Settings, Volume2, X, ZoomIn } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { HistoryDrawer } from '../components/HistoryDrawer'
import { KitchenConfigDrawer, type KitchenConfigTab } from '../components/KitchenConfigDrawer'
import { KitchenDateNav, todayStr } from '../components/KitchenDateNav'
import { KitchenStatusLine } from '../components/KitchenStatusLine'
import { NewOrderDrawer } from '../components/NewOrderDrawer'
import { OrderDetailDrawer } from '../components/OrderDetailDrawer'
import { RidersDrawer } from '../components/RidersDrawer'
import { useDeliveredTodayCount, useKitchenFlow } from '../hooks/useKitchen'
import { useKitchenSlaSettings } from '../hooks/useKitchenSettings'
import { useNewTicketAlert } from '../hooks/useNewTicketAlert'
import { BoardActionsContext, type BoardActions } from '../kanban/boardActions'
import { CancelOrderDialog, ConfirmOrderDialog, DispatchDialog } from '../kanban/BoardDialogs'
import { ACTION_DENIED_REASON, canPerform } from '../lib/permissions'
import { alertMinutesFor, DEFAULT_SLA_THRESHOLDS, minutesAgoSince, timeTier } from '../lib/ticketVisuals'
import type { KitchenOrderStatus, KitchenTicket } from '../types'
import { KanbanView } from '../views/KanbanView'
import { SlaView } from '../views/SlaView'
import { VoiceCommandBar } from '../voice/VoiceCommandBar'
import { useVoiceCommandEngine } from '../voice/useVoiceCommandEngine'

type KitchenView = 'tablero' | 'sla'
type Density = 'normal' | 'grande'

const VIEW_PREF_KEY = 'dk-kitchen-view'
const DENSITY_PREF_KEY = 'dk-kitchen-density'

/** Estados de la cocina propiamente dicha: lo único que ven la voz, la alerta de "pedido nuevo" y la vista SLA. */
const KITCHEN_STATUSES = new Set<KitchenOrderStatus>(['CONFIRMADO', 'EN_PREPARACION', 'LISTO'])

function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    if (stored && (allowed as readonly string[]).includes(stored)) return stored as T
  } catch {
    // localStorage puede no estar disponible (modo privado) — se usa el default.
  }
  return fallback
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // No crítico.
  }
}

function yesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return toDateInput(d)
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-xl border border-neutral-800/60 bg-neutral-900/60 px-3.5 py-2.5">
      <p className="text-xl leading-none font-semibold tabular-nums text-neutral-50">{value}</p>
      <p className="mt-1.5 truncate text-xs text-neutral-500">{label}</p>
    </div>
  )
}

/**
 * Cocina: el centro operativo, reducido a lo esencial — título con el estado
 * de la cocina en vivo, cinco cifras y el tablero del flujo completo. Lo
 * secundario (vista SLA, tamaño, sonido, día anterior, historial,
 * domiciliarios, configuración) vive en el menú ⋯, y las acciones de cada
 * pedido en su detalle.
 */
export function KitchenPage() {
  const { profile } = useAuth()
  const role = profile?.role ?? null
  const canConfigure = role === 'ADMIN' || role === 'MANAGER'
  const canCreate = canPerform(role, 'create')
  const showSales = canAccessModule(role, 'dashboard')

  const [searchParams, setSearchParams] = useSearchParams()
  const detailOrderId = searchParams.get('pedido')

  const [selectedDate, setSelectedDate] = useState(todayStr)
  const isToday = selectedDate >= todayStr()

  const { data: flowTickets, isLoading } = useKitchenFlow(isToday ? null : selectedDate)
  const { data: deliveredToday } = useDeliveredTodayCount(isToday)
  const { data: summary } = useDashboardSummary(showSales)
  const { data: thresholds = DEFAULT_SLA_THRESHOLDS } = useKitchenSlaSettings()
  const now = useNow()

  const [view, setView] = useState<KitchenView>(() => readPref(VIEW_PREF_KEY, ['tablero', 'sla'] as const, 'tablero'))
  const [density, setDensity] = useState<Density>(() => readPref(DENSITY_PREF_KEY, ['normal', 'grande'] as const, 'normal'))
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [voiceTestOpen, setVoiceTestOpen] = useState(false)

  const [configTab, setConfigTab] = useState<KitchenConfigTab | null>(null)
  const [newOrderOpen, setNewOrderOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [ridersOpen, setRidersOpen] = useState(false)
  const [confirmTicket, setConfirmTicket] = useState<KitchenTicket | null>(null)
  const [dispatchTicket, setDispatchTicket] = useState<KitchenTicket | null>(null)
  const [cancelTicket, setCancelTicket] = useState<KitchenTicket | null>(null)

  const sortedTickets = useMemo(
    () =>
      flowTickets
        ? [...flowTickets].sort((a, b) => {
            if (a.priority !== b.priority) return b.priority - a.priority
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          })
        : undefined,
    [flowTickets],
  )

  // La voz, la alerta de "pedido nuevo" y la vista SLA siguen viendo SOLO la
  // cocina (Confirmado → Listo), sin filtros de búsqueda. Si recibieran el
  // flujo completo, un borrador de caja sonaría en cocina y, al confirmarse,
  // ya no sonaría (mismo id).
  const kitchenTickets = useMemo(() => sortedTickets?.filter((t) => KITCHEN_STATUSES.has(t.orderStatus)), [sortedTickets])
  const { newIds, acknowledge, soundEnabled, toggleSound } = useNewTicketAlert(isToday ? kitchenTickets : undefined)
  const voice = useVoiceCommandEngine(isToday ? kitchenTickets : undefined)

  const kpis = useMemo(() => {
    const count = (status: KitchenOrderStatus) => (flowTickets ?? []).filter((t) => t.orderStatus === status).length
    const late = (kitchenTickets ?? []).filter(
      (t) => timeTier(minutesAgoSince(t.createdAt, now), alertMinutesFor(t.orderStatus, thresholds), thresholds.nearThresholdPct) === 'retrasado',
    ).length
    return { nuevo: count('NUEVO'), cola: count('CONFIRMADO'), preparando: count('EN_PREPARACION'), listo: count('LISTO'), late }
  }, [flowTickets, kitchenTickets, now, thresholds])

  // El pedido abierto vive en la URL (?pedido=id): el detalle se puede
  // compartir, sobrevive a un refresh, y los enlaces viejos /orders/:id
  // (Dashboard, ficha de Cliente) redirigen acá con el drawer ya abierto.
  const setDetailOrder = useCallback(
    (orderId: string | null) =>
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (orderId) next.set('pedido', orderId)
        else next.delete('pedido')
        return next
      }),
    [setSearchParams],
  )

  const boardActions = useMemo<BoardActions>(
    () => ({
      role,
      density,
      openDetail: (ticket) => setDetailOrder(ticket.orderId),
      requestConfirm: setConfirmTicket,
      requestDispatch: setDispatchTicket,
      requestCancel: setCancelTicket,
    }),
    [role, density, setDetailOrder],
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

  const voiceAvailable = voice.supported && isToday
  const menuItems: MenuItem[] = [
    view === 'tablero'
      ? { label: 'Ver tiempos (SLA)', icon: Gauge, onSelect: () => changeView('sla') }
      : { label: 'Ver tablero', icon: Kanban, onSelect: () => changeView('tablero') },
    { label: 'Tamaño grande', icon: ZoomIn, checked: density === 'grande', onSelect: toggleDensity },
    { label: 'Sonido de pedidos nuevos', icon: Bell, checked: soundEnabled, onSelect: toggleSound },
    ...(voiceAvailable
      ? [
          { label: 'Respuesta hablada', icon: Volume2, checked: voice.ttsEnabled, onSelect: voice.toggleTts },
          { label: 'Probar comando de texto', icon: Keyboard, onSelect: () => setVoiceTestOpen(true) },
        ]
      : []),
    isToday
      ? { label: 'Ver un día anterior', icon: CalendarClock, onSelect: () => setSelectedDate(yesterday()), separated: true }
      : { label: 'Volver a hoy', icon: CalendarClock, onSelect: () => setSelectedDate(todayStr()), separated: true },
    { label: 'Historial de pedidos', icon: History, onSelect: () => setHistoryOpen(true) },
    { label: 'Domiciliarios', icon: Bike, onSelect: () => setRidersOpen(true) },
    { label: 'Configuración', icon: Settings, onSelect: () => setConfigTab('semanal'), separated: true },
  ]

  const liveDetailTicket = detailOrderId ? flowTickets?.find((t) => t.orderId === detailOrderId) : undefined

  return (
    <BoardActionsContext.Provider value={boardActions}>
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="shrink-0 space-y-4">
          <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <h1 className={typography.h1}>Cocina</h1>
              {isToday ? (
                <KitchenStatusLine lateCount={kpis.late} canConfigure={canConfigure} onConfigure={() => setConfigTab('semanal')} />
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <KitchenDateNav date={selectedDate} onChange={setSelectedDate} />
                  <span className={typography.small}>{formatDateLong(selectedDate)}</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {showSales && (
                <div className="mr-2 text-right">
                  <p className={typography.caption}>Ventas de hoy</p>
                  <p className="text-lg leading-tight font-semibold tabular-nums text-neutral-50">{summary ? formatMoney(summary.salesToday) : '—'}</p>
                </div>
              )}

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

              <VoiceCommandBar engine={voice} enabled={isToday} testOpen={voiceTestOpen} onCloseTest={() => setVoiceTestOpen(false)} />

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

              <Tooltip label={canCreate ? 'Crear un pedido nuevo' : ACTION_DENIED_REASON.create} side="bottom">
                <Button variant="primary" icon={Plus} onClick={() => setNewOrderOpen(true)} disabled={!canCreate}>
                  Nuevo pedido
                </Button>
              </Tooltip>
            </div>
          </header>

          {isToday && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              <Kpi label="Por confirmar" value={kpis.nuevo} />
              <Kpi label="En cola" value={kpis.cola} />
              <Kpi label="Preparando" value={kpis.preparando} />
              <Kpi label="Listos" value={kpis.listo} />
              <Kpi label="Entregados" value={deliveredToday ?? 0} />
            </div>
          )}

          {view === 'sla' && (
            <p className={clsx('flex items-center gap-2', typography.small)}>
              <Gauge size={14} className="text-brasa-400" aria-hidden /> Tiempos por pedido (SLA)
              <button type="button" onClick={() => changeView('tablero')} className="text-brasa-400 hover:text-brasa-300 hover:underline underline-offset-4">
                Volver al tablero
              </button>
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {view === 'tablero' ? (
            <KanbanView tickets={sortedTickets} isLoading={isLoading} now={now} newIds={newIds} onAcknowledge={acknowledge} search={search} />
          ) : (
            <SlaView tickets={kitchenTickets} now={now} />
          )}
        </div>
      </div>

      {configTab && <KitchenConfigDrawer initialTab={configTab} canEdit={canConfigure} onClose={() => setConfigTab(null)} />}
      {newOrderOpen && <NewOrderDrawer open onClose={() => setNewOrderOpen(false)} />}
      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onOpenOrder={(orderId) => {
          setHistoryOpen(false)
          setDetailOrder(orderId)
        }}
      />
      <RidersDrawer open={ridersOpen} onClose={() => setRidersOpen(false)} role={role} />
      <OrderDetailDrawer orderId={detailOrderId} ticket={liveDetailTicket} role={role} onClose={() => setDetailOrder(null)} />
      {confirmTicket && <ConfirmOrderDialog ticket={confirmTicket} onClose={() => setConfirmTicket(null)} />}
      {dispatchTicket && <DispatchDialog ticket={dispatchTicket} onClose={() => setDispatchTicket(null)} />}
      {cancelTicket && <CancelOrderDialog ticket={cancelTicket} onClose={() => setCancelTicket(null)} />}
    </BoardActionsContext.Provider>
  )
}
