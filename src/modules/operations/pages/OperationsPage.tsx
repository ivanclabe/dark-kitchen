import { KitchenView } from '@/modules/kitchen/views/KitchenView'
import { OrderBoard } from '@/modules/orders/board/OrderBoard'
import { CancelOrderDialog, ConfirmOrderDialog, DispatchDialog } from '@/modules/orders/board/BoardDialogs'
import { NewOrderDrawer } from '@/modules/orders/components/NewOrderDrawer'
import { RidersDrawer } from '@/modules/orders/components/RidersDrawer'
import { useNewOrderAlert } from '@/modules/orders/hooks/useNewOrderAlert'
import { useDeliveredTodayCount, useLiveOrders } from '@/modules/orders/hooks/useOrders'
import { paymentSummary } from '@/modules/orders/lib/payment'
import { canPerform } from '@/modules/orders/lib/permissions'
import type { Order, OrderStatus } from '@/modules/orders/types'
import { DispatchView } from '@/modules/orders/views/DispatchView'
import { OrderListView } from '@/modules/orders/views/OrderListView'
import { useNow } from '@/shared/hooks/useNow'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Bell } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { OperationsFigures, type OperationsFigure } from '../components/OperationsFigures'
import { OperationsShell } from '../components/OperationsShell'
import { OperationsContext, useOperations, type OperationsContextValue } from '../lib/operationsContext'
import { defaultOperationsView, operationsViews, resolveOperationsView, type OperationsView } from '../lib/views'

/** Typing in a field must never trigger a shortcut. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

/**
 * The figures of the day for the views that see every order: each one opens
 * those orders (ADR 0031). On the Tablero the columns already show them.
 */
function useOrderFigures(): OperationsFigure[] {
  const { can } = useActiveKitchen()
  const ops = useOperations()
  const seesOrders = can('orders.view')
  const { data: deliveredToday } = useDeliveredTodayCount(seesOrders)
  const count = (status: OrderStatus) => (ops.live ?? []).filter((o) => o.status === status).length
  const toList = (status: string, range?: string) => (ops.view === 'board' && !range ? undefined : () => ops.setView('list', { status, range: range ?? 'all' }))

  if (!seesOrders) {
    // A rider: only their own deliveries.
    return [
      { id: 'ready', label: 'Listos para salir', value: count('LISTO') },
      { id: 'route', label: 'En ruta', value: count('DESPACHADO') },
    ]
  }
  return [
    { id: 'new', label: 'Por confirmar', value: count('NUEVO'), onSelect: toList('NUEVO') },
    { id: 'queue', label: 'En cola', value: count('CONFIRMADO'), onSelect: toList('CONFIRMADO') },
    { id: 'preparing', label: 'Preparando', value: count('EN_PREPARACION'), onSelect: toList('EN_PREPARACION') },
    { id: 'ready', label: 'Listos', value: count('LISTO'), onSelect: toList('LISTO') },
    { id: 'route', label: 'En ruta', value: count('DESPACHADO'), onSelect: toList('DESPACHADO') },
    { id: 'delivered', label: 'Entregados hoy', value: deliveredToday ?? 0, onSelect: toList('delivered', 'today') },
    // ADR 0031: the other dimension — open orders still to collect (only for whoever sees the receivables).
    ...(can('receivables.view')
      ? [
          {
            id: 'unpaid',
            label: 'Por cobrar',
            value: (ops.live ?? []).filter((o) => paymentSummary(o)?.state !== 'paid').length,
            onSelect: () => ops.setView('list', { status: 'open', range: 'all', payment: 'pending' }),
          },
        ]
      : []),
  ]
}

function BoardView() {
  const ops = useOperations()
  const figures = useOrderFigures()
  return (
    <OperationsShell
      searchable
      description="Del pedido a la entrega: cada vista es el mismo pedido."
      menuItems={[{ label: 'Sonido de pedidos nuevos', icon: Bell, checked: ops.soundEnabled, onSelect: ops.toggleSound }]}
      figures={<OperationsFigures items={figures} />}
    >
      <OrderBoard tickets={ops.live} isLoading={ops.isLoading} now={ops.now} newIds={ops.newDraftIds} onAcknowledge={ops.acknowledgeDraft} search={ops.search} />
    </OperationsShell>
  )
}

function DispatchOpsView() {
  const { can } = useActiveKitchen()
  const ops = useOperations()
  const figures = useOrderFigures()
  return (
    <OperationsShell description={can('orders.view') ? 'Listos para salir y en ruta.' : 'Tus entregas asignadas.'} figures={<OperationsFigures items={figures} />}>
      <DispatchView orders={ops.live} isLoading={ops.isLoading} now={ops.now} />
    </OperationsShell>
  )
}

function ListOpsView({ searchRef }: { searchRef: React.Ref<HTMLInputElement> }) {
  const ops = useOperations()
  const figures = useOrderFigures()
  return (
    <OperationsShell description="Todos los pedidos, también entregados y cancelados." figures={<OperationsFigures items={figures} />}>
      <OrderListView ref={searchRef} onOpen={ops.openDetail} />
    </OperationsShell>
  )
}

/**
 * Centro de operaciones (ADR 0031): where the day is run. Pedidos and Cocina
 * were already the same orders (ADR 0020); now they are one place with four
 * views — Tablero (the whole flow), Cocina (the line's screen), Despacho
 * (ready and on their way) and Lista (every order, searched in the
 * database). Each role sees its views; with only one there are no tabs.
 * /operations/:orderId opens the order on top of any view.
 * Shortcuts: N new order, / search.
 */
export function OperationsPage() {
  const { can, path } = useActiveKitchen()
  const navigate = useNavigate()
  const location = useLocation()
  const { orderId } = useParams<{ orderId?: string }>()
  const [params, setParams] = useSearchParams()
  const now = useNow()

  const views = useMemo(() => operationsViews(can), [can])
  const view = resolveOperationsView(can, params.get('view'))
  const defaultView = defaultOperationsView(can)

  const { data: live, isLoading } = useLiveOrders(view !== 'list')
  const sorted = useMemo(
    () => (live ? [...live].sort((a, b) => b.priority - a.priority || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) : undefined),
    [live],
  )

  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [newOrderOpen, setNewOrderOpen] = useState(false)
  const [ridersOpen, setRidersOpen] = useState(false)
  const [confirmOrder, setConfirmOrder] = useState<Order | null>(null)
  const [dispatchOrder, setDispatchOrder] = useState<Order | null>(null)
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null)
  const listSearchRef = useRef<HTMLInputElement>(null)

  // A new WhatsApp order sounds and glows until someone opens it. Cocina has its own alert (confirmed orders).
  const drafts = useMemo(() => live?.filter((o) => o.status === 'NUEVO'), [live])
  const draftAlert = useNewOrderAlert(drafts, { muted: view === 'kitchen' })

  const setView = useCallback(
    (next: OperationsView, extra: Record<string, string | null> = {}) =>
      setParams(
        () => {
          const p = new URLSearchParams()
          if (next !== defaultView) p.set('view', next)
          for (const [key, value] of Object.entries(extra)) if (value) p.set(key, value)
          return p
        },
        { replace: true },
      ),
    [setParams, defaultView],
  )
  const openDetail = useCallback((order: Pick<Order, 'id'>) => navigate({ pathname: path(`/operations/${order.id}`), search: location.search }), [navigate, path, location.search])
  const closeDetail = useCallback(() => navigate({ pathname: path('/operations'), search: location.search }), [navigate, path, location.search])

  const canCreate = canPerform(can, 'create') && can('orders.view')

  // N = new order, / = search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      if (e.key === 'n' || e.key === 'N') {
        if (canCreate) {
          e.preventDefault()
          setNewOrderOpen(true)
        }
      } else if (e.key === '/') {
        e.preventDefault()
        if (view === 'list') listSearchRef.current?.focus()
        else if (view === 'board' || view === 'kitchen') setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canCreate, view])

  const value = useMemo<OperationsContextValue | null>(
    () =>
      view && {
        view,
        views,
        setView,
        live: sorted,
        isLoading,
        now,
        search,
        setSearch,
        searchOpen,
        setSearchOpen,
        detailOrderId: orderId ?? null,
        openDetail,
        closeDetail,
        requestConfirm: setConfirmOrder,
        requestDispatch: setDispatchOrder,
        requestCancel: setCancelOrder,
        openNewOrder: () => setNewOrderOpen(true),
        openRiders: () => setRidersOpen(true),
        newDraftIds: draftAlert.newIds,
        acknowledgeDraft: draftAlert.acknowledge,
        soundEnabled: draftAlert.soundEnabled,
        toggleSound: draftAlert.toggleSound,
      },
    [view, views, setView, sorted, isLoading, now, search, searchOpen, orderId, openDetail, closeDetail, draftAlert.newIds, draftAlert.acknowledge, draftAlert.soundEnabled, draftAlert.toggleSound],
  )

  // Without any view (the shell already keeps such a role out): its start.
  if (!value) return <Navigate to={path('/')} replace />

  return (
    <OperationsContext.Provider value={value}>
      {value.view === 'board' && <BoardView />}
      {value.view === 'kitchen' && <KitchenView />}
      {value.view === 'dispatch' && <DispatchOpsView />}
      {value.view === 'list' && <ListOpsView searchRef={listSearchRef} />}

      {newOrderOpen && <NewOrderDrawer open onClose={() => setNewOrderOpen(false)} />}
      <RidersDrawer open={ridersOpen} onClose={() => setRidersOpen(false)} canManage={can('dispatch.riders')} />
      {confirmOrder && <ConfirmOrderDialog ticket={confirmOrder} onClose={() => setConfirmOrder(null)} />}
      {dispatchOrder && <DispatchDialog ticket={dispatchOrder} onClose={() => setDispatchOrder(null)} />}
      {cancelOrder && <CancelOrderDialog ticket={cancelOrder} onClose={() => setCancelOrder(null)} />}
    </OperationsContext.Provider>
  )
}
