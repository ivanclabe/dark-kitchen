import { useAuth } from '@/shared/hooks/useAuth'
import { useNow } from '@/shared/hooks/useNow'
import { Badge } from '@/shared/ui/Badge'
import { Button, IconButton } from '@/shared/ui/Button'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Tabs, type TabItem } from '@/shared/ui/Tabs'
import { Tooltip } from '@/shared/ui/Tooltip'
import { formatDateLong } from '@/shared/utils/format'
import clsx from 'clsx'
import { Bell, BellOff, Bike, ChefHat, Gauge, History, Kanban, ListOrdered, Plus, Settings, ZoomIn, ZoomOut, type LucideIcon } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { HistoryDrawer } from '../components/HistoryDrawer'
import { KitchenDateNav, todayStr } from '../components/KitchenDateNav'
import { KitchenSettingsModal } from '../components/KitchenSettingsModal'
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

type KitchenView = 'tablero' | 'sla'
type Density = 'normal' | 'grande'

const VIEW_PREF_KEY = 'dk-kitchen-view'
const DENSITY_PREF_KEY = 'dk-kitchen-density'

const VIEWS: TabItem<KitchenView>[] = [
  { value: 'tablero', label: 'Tablero', icon: Kanban },
  { value: 'sla', label: 'SLA', icon: Gauge },
]

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

/** Tira de indicadores del flujo: una cifra por etapa, legible de un vistazo. */
function FlowKpi({ label, value, icon: Icon, tone = 'neutral' }: { label: string; value: number; icon?: LucideIcon; tone?: 'neutral' | 'warn' | 'good' }) {
  return (
    <div
      className={clsx(
        'flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2',
        tone === 'warn' && value > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-neutral-800/60 bg-neutral-900/60',
      )}
    >
      {Icon && <Icon size={14} className={tone === 'warn' && value > 0 ? 'text-red-400' : tone === 'good' ? 'text-emerald-400' : 'text-neutral-500'} aria-hidden />}
      <div className="min-w-0">
        <p className={clsx('text-lg leading-none font-semibold tabular-nums', tone === 'warn' && value > 0 ? 'text-red-400' : 'text-neutral-50')}>{value}</p>
        <p className="mt-1 truncate text-[11px] text-neutral-500">{label}</p>
      </div>
    </div>
  )
}

/**
 * Cocina: el centro operativo. Un solo tablero con el flujo completo del
 * pedido — por confirmar, en cola, preparando, listo, en ruta — que reemplaza
 * las pantallas separadas de Pedidos, Cola y Despacho; un switch a la vista
 * SLA; y en paneles laterales lo que no es flujo activo (nuevo pedido,
 * historial, domiciliarios). La voz, las alertas y la navegación por fecha
 * siguen exactamente como estaban.
 */
export function KitchenPage() {
  const { profile } = useAuth()
  const role = profile?.role ?? null
  const canConfigureSla = role === 'ADMIN' || role === 'MANAGER'
  const canCreate = canPerform(role, 'create')

  const [searchParams, setSearchParams] = useSearchParams()
  const detailOrderId = searchParams.get('pedido')

  const [selectedDate, setSelectedDate] = useState(todayStr)
  const isToday = selectedDate >= todayStr()

  const { data: flowTickets, isLoading } = useKitchenFlow(isToday ? null : selectedDate)
  const { data: deliveredToday } = useDeliveredTodayCount(isToday)
  const { data: thresholds = DEFAULT_SLA_THRESHOLDS } = useKitchenSlaSettings()
  const now = useNow()

  const [view, setView] = useState<KitchenView>(() => readPref(VIEW_PREF_KEY, ['tablero', 'sla'] as const, 'tablero'))
  const [density, setDensity] = useState<Density>(() => readPref(DENSITY_PREF_KEY, ['normal', 'grande'] as const, 'normal'))

  const [settingsOpen, setSettingsOpen] = useState(false)
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
  // cocina (Confirmado → Listo), sin filtros de búsqueda — exactamente lo
  // mismo que recibían antes. Si recibieran el flujo completo, un borrador de
  // caja sonaría en cocina y, al confirmarse, ya no sonaría (mismo id).
  const kitchenTickets = useMemo(() => sortedTickets?.filter((t) => KITCHEN_STATUSES.has(t.orderStatus)), [sortedTickets])
  const { newIds, acknowledge, soundEnabled, toggleSound } = useNewTicketAlert(isToday ? kitchenTickets : undefined)

  const kpis = useMemo(() => {
    const count = (status: KitchenOrderStatus) => (flowTickets ?? []).filter((t) => t.orderStatus === status).length
    const late = (kitchenTickets ?? []).filter(
      (t) => timeTier(minutesAgoSince(t.createdAt, now), alertMinutesFor(t.orderStatus, thresholds), thresholds.nearThresholdPct) === 'retrasado',
    ).length
    return {
      nuevo: count('NUEVO'),
      cola: count('CONFIRMADO'),
      preparando: count('EN_PREPARACION'),
      listo: count('LISTO'),
      enRuta: count('DESPACHADO'),
      late,
    }
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

  const liveDetailTicket = detailOrderId ? flowTickets?.find((t) => t.orderId === detailOrderId) : undefined

  return (
    <BoardActionsContext.Provider value={boardActions}>
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="shrink-0 space-y-4">
          <PageHeader
            title="Cocina"
            icon={ChefHat}
            description={isToday ? 'Del pedido a la entrega, en un solo tablero. Se actualiza solo.' : formatDateLong(selectedDate)}
            meta={
              isToday &&
              newIds.size > 0 && (
                <Badge tone="brand" icon={Bell}>
                  {newIds.size} {newIds.size === 1 ? 'nuevo' : 'nuevos'}
                </Badge>
              )
            }
            actions={
              // items-start: VoiceCommandBar apila texto debajo del botón y su
              // caja es más alta; así las tres pastillas arrancan alineadas.
              <div className="flex flex-wrap items-start gap-2.5">
                <KitchenDateNav date={selectedDate} onChange={setSelectedDate} />
                <div className="inline-flex h-10 items-center gap-0.5 rounded-full border border-neutral-800/60 bg-neutral-900/60 p-1">
                  {canConfigureSla && (
                    <IconButton variant="ghost" size="sm" icon={Settings} aria-label="Configurar umbrales de alerta (SLA)" onClick={() => setSettingsOpen(true)} />
                  )}
                  <IconButton
                    variant="ghost"
                    size="sm"
                    icon={soundEnabled ? Bell : BellOff}
                    aria-label={soundEnabled ? 'Silenciar alerta de pedidos nuevos' : 'Activar alerta de pedidos nuevos'}
                    aria-pressed={soundEnabled}
                    active={soundEnabled}
                    onClick={toggleSound}
                  />
                </div>
                <VoiceCommandBar tickets={kitchenTickets} enabled={isToday} />
              </div>
            }
          />

          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={view} onChange={changeView} items={VIEWS} />
            <Tooltip label={density === 'grande' ? 'Tamaño normal' : 'Tamaño grande (pantalla de cocina)'} side="top">
              <IconButton
                variant="secondary"
                icon={density === 'grande' ? ZoomOut : ZoomIn}
                aria-label={density === 'grande' ? 'Usar tamaño normal' : 'Usar tamaño grande'}
                aria-pressed={density === 'grande'}
                active={density === 'grande'}
                onClick={toggleDensity}
              />
            </Tooltip>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button variant="ghost" icon={History} onClick={() => setHistoryOpen(true)}>
                Historial
              </Button>
              <Button variant="ghost" icon={Bike} onClick={() => setRidersOpen(true)}>
                Domiciliarios
              </Button>
              <Tooltip label={canCreate ? 'Crear un pedido nuevo' : ACTION_DENIED_REASON.create} side="top">
                <Button variant="primary" icon={Plus} onClick={() => setNewOrderOpen(true)} disabled={!canCreate}>
                  Nuevo pedido
                </Button>
              </Tooltip>
            </div>
          </div>

          {isToday && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              <FlowKpi label="Por confirmar" value={kpis.nuevo} icon={ListOrdered} />
              <FlowKpi label="En cola" value={kpis.cola} />
              <FlowKpi label="Preparando" value={kpis.preparando} />
              <FlowKpi label="Listos" value={kpis.listo} />
              <FlowKpi label="En ruta" value={kpis.enRuta} icon={Bike} />
              <FlowKpi label="Entregados hoy" value={deliveredToday ?? 0} tone="good" />
              <FlowKpi label="Atrasados" value={kpis.late} tone="warn" />
            </div>
          )}

          {!isToday && (
            <div role="status" className="flex items-center gap-2 rounded-xl border border-amber-800/40 bg-amber-500/5 px-4 py-2.5 text-sm text-amber-300">
              <History size={15} className="shrink-0" aria-hidden />
              Estás consultando un día anterior. El control por voz está disponible únicamente para los pedidos de hoy.
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {view === 'tablero' ? (
            <KanbanView tickets={sortedTickets} isLoading={isLoading} now={now} newIds={newIds} onAcknowledge={acknowledge} isToday={isToday} />
          ) : (
            <SlaView tickets={kitchenTickets} now={now} />
          )}
        </div>
      </div>

      {canConfigureSla && <KitchenSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />}
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
